"""External job discovery, filtering, resume-match scoring, and URL/clip import."""

from __future__ import annotations

import asyncio
import hashlib
import html
import ipaddress
import json
import logging
import re
import socket
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx

from app.config import settings
from app.config_cache import get_content_language
from app.crypto import decrypt, encrypt
from app.database import db
from app.llm import complete_json, get_llm_config, get_model_name, get_safe_max_tokens
from app.prompts import get_language_name
from app.services.text_match import keyword_in_text

logger = logging.getLogger(__name__)

DEFAULT_APIFY_ACTOR = "blackfalcondata/jobstreet-scraper"
_SOURCES_LOCK = threading.Lock()
_PORTALS_LOCK = threading.Lock()
_REQUEST_TIMEOUT = 25.0
_APIFY_TIMEOUT = 75.0
_MAX_HTML_BYTES = 2 * 1024 * 1024

_SCAM_OR_COMMISSION_PATTERNS = (
    "komisi saja",
    "tanpa gaji pokok",
    "uang jaminan",
    "biaya administrasi",
    "transfer biaya",
    "multi level marketing",
    "mlm",
    "commission only",
    "upfront fee",
)

_FRESHNESS_MAX_HOURS: dict[str, float] = {
    "24h": 24.0,
    "3d": 72.0,
    "7d": 168.0,
    "30d": 720.0,
}

_STOPWORDS = frozenset(
    {
        "and",
        "the",
        "for",
        "with",
        "from",
        "that",
        "this",
        "your",
        "you",
        "are",
        "our",
        "will",
        "have",
        "has",
        "dan",
        "yang",
        "untuk",
        "dengan",
        "dari",
        "pada",
        "atau",
        "dalam",
        "serta",
        "sebagai",
        "dapat",
        "memiliki",
        "pengalaman",
        "kerja",
    }
)


def _sources_path() -> Path:
    return settings.data_dir / "job_sources.json"


def _mask_secret(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:6]}...{value[-4:]}"


def _read_sources_raw() -> dict[str, Any]:
    path = _sources_path()
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to read job_sources.json: %s", exc)
        return {}


def _decrypt_field(raw: dict[str, Any], field: str) -> str:
    ciphertext = raw.get(field)
    if not isinstance(ciphertext, str) or not ciphertext:
        return ""
    return decrypt(ciphertext) or ""


def get_job_sources_status() -> dict[str, Any]:
    """Return masked status of all configured job discovery providers."""
    raw = _read_sources_raw()
    searchapi_key = _decrypt_field(raw, "searchapi_api_key_enc")
    serpapi_key = _decrypt_field(raw, "serpapi_api_key_enc")
    rapidapi_key = _decrypt_field(raw, "rapidapi_key_enc")
    apify_token = _decrypt_field(raw, "apify_api_token_enc")
    actor = str(raw.get("apify_default_actor") or DEFAULT_APIFY_ACTOR)
    return {
        "searchapi_configured": bool(searchapi_key),
        "searchapi_key_masked": _mask_secret(searchapi_key),
        "serpapi_configured": bool(serpapi_key),
        "serpapi_key_masked": _mask_secret(serpapi_key),
        "rapidapi_configured": bool(rapidapi_key),
        "rapidapi_key_masked": _mask_secret(rapidapi_key),
        "apify_configured": bool(apify_token),
        "apify_token_masked": _mask_secret(apify_token),
        "apify_default_actor": actor,
    }


def get_decrypted_job_source_keys() -> dict[str, str]:
    """Return decrypted provider keys for internal server calls."""
    raw = _read_sources_raw()
    return {
        "searchapi_key": _decrypt_field(raw, "searchapi_api_key_enc"),
        "serpapi_key": _decrypt_field(raw, "serpapi_api_key_enc"),
        "rapidapi_key": _decrypt_field(raw, "rapidapi_key_enc"),
        "apify_token": _decrypt_field(raw, "apify_api_token_enc"),
        "apify_default_actor": str(raw.get("apify_default_actor") or DEFAULT_APIFY_ACTOR),
    }


def update_job_sources_config(
    *,
    searchapi_api_key: str | None = None,
    serpapi_api_key: str | None = None,
    rapidapi_key: str | None = None,
    apify_api_token: str | None = None,
    apify_default_actor: str | None = None,
) -> dict[str, Any]:
    """Persist encrypted job provider keys in data/job_sources.json."""
    with _SOURCES_LOCK:
        path = _sources_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = _read_sources_raw()

        secret_updates = (
            ("searchapi_api_key_enc", searchapi_api_key),
            ("serpapi_api_key_enc", serpapi_api_key),
            ("rapidapi_key_enc", rapidapi_key),
            ("apify_api_token_enc", apify_api_token),
        )
        for enc_field, value in secret_updates:
            if value is None:
                continue
            cleaned = value.strip()
            if cleaned:
                raw[enc_field] = encrypt(cleaned)
            else:
                raw.pop(enc_field, None)

        if apify_default_actor is not None:
            cleaned_actor = apify_default_actor.strip()
            raw["apify_default_actor"] = cleaned_actor or DEFAULT_APIFY_ACTOR

        path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
    return get_job_sources_status()


def _portals_path() -> Path:
    return settings.data_dir / "company_portals.json"


def get_portals_and_blacklist() -> dict[str, Any]:
    """Return tracked company career portals and negative-filter blacklists."""
    path = _portals_path()
    default = {
        "portals": [],
        "blacklist_companies": [],
        "blacklist_keywords": [],
    }
    if not path.exists():
        return default
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return default
        return {
            "portals": data.get("portals") if isinstance(data.get("portals"), list) else [],
            "blacklist_companies": [
                str(x).strip()
                for x in (data.get("blacklist_companies") or [])
                if str(x).strip()
            ],
            "blacklist_keywords": [
                str(x).strip()
                for x in (data.get("blacklist_keywords") or [])
                if str(x).strip()
            ],
        }
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Failed to read company_portals.json: %s", exc)
        return default


def update_portals_and_blacklist(config: dict[str, Any]) -> dict[str, Any]:
    """Persist tracked company career portals and blacklist terms."""
    with _PORTALS_LOCK:
        path = _portals_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        cleaned = {
            "portals": config.get("portals") or [],
            "blacklist_companies": [
                str(x).strip()
                for x in (config.get("blacklist_companies") or [])
                if str(x).strip()
            ],
            "blacklist_keywords": [
                str(x).strip()
                for x in (config.get("blacklist_keywords") or [])
                if str(x).strip()
            ],
        }
        path.write_text(json.dumps(cleaned, indent=2), encoding="utf-8")
    return get_portals_and_blacklist()


def parse_posted_hours_ago(text: str | None) -> float | None:
    """Parse Indonesian, English, or ISO posted dates into hours ago."""
    if not text:
        return None
    cleaned = text.strip().lower()
    if not cleaned:
        return None

    if any(tok in cleaned for tok in ("baru saja", "just now", "today", "hari ini")):
        return 1.0
    if any(tok in cleaned for tok in ("kemarin", "yesterday")):
        return 24.0

    match = re.search(
        r"(\d+)\s*\+?\s*(menit|minute|minutes|min|jam|hour|hours|hr|hari|day|days|minggu|week|weeks|bulan|month|months)",
        cleaned,
    )
    if match:
        qty = float(match.group(1))
        unit = match.group(2)
        if unit in ("menit", "minute", "minutes", "min"):
            return max(0.1, round(qty / 60.0, 2))
        if unit in ("jam", "hour", "hours", "hr"):
            return qty
        if unit in ("hari", "day", "days"):
            return qty * 24.0
        if unit in ("minggu", "week", "weeks"):
            return qty * 24.0 * 7.0
        if unit in ("bulan", "month", "months"):
            return qty * 24.0 * 30.0

    # Try ISO-8601 date / datetime string
    iso_candidate = text.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(iso_candidate)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
        return max(0.0, round(delta_hours, 2))
    except ValueError:
        pass

    date_match = re.search(r"(\d{4}-\d{2}-\d{2})", cleaned)
    if date_match:
        try:
            dt = datetime.fromisoformat(date_match.group(1)).replace(
                tzinfo=timezone.utc
            )
            delta_hours = (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
            return max(0.0, round(delta_hours, 2))
        except ValueError:
            pass

    return None


def _extract_resume_terms(resume: dict[str, Any] | None) -> list[str]:
    """Extract normalized skills and role terms from the user's master resume."""
    if not resume:
        return []
    terms: list[str] = []
    seen: set[str] = set()

    def add_term(raw: str) -> None:
        cleaned = re.sub(r"\s+", " ", raw.strip())
        key = cleaned.casefold()
        if len(cleaned) >= 2 and key not in _STOPWORDS and key not in seen:
            seen.add(key)
            terms.append(cleaned)

    processed = resume.get("processed_data")
    if isinstance(processed, dict):
        additional = processed.get("additional")
        if isinstance(additional, dict):
            for field in ("technicalSkills", "certificationsTraining"):
                items = additional.get(field)
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, str):
                            add_term(item)

        experiences = processed.get("workExperience")
        if isinstance(experiences, list):
            for exp in experiences:
                if isinstance(exp, dict) and isinstance(exp.get("title"), str):
                    for token in re.split(r"[,/|()\-]+", exp["title"]):
                        if len(token.strip()) >= 3:
                            add_term(token)

        projects = processed.get("personalProjects")
        if isinstance(projects, list):
            for proj in projects:
                if isinstance(proj, dict) and isinstance(proj.get("name"), str):
                    add_term(proj["name"])

    if not terms and isinstance(resume.get("content"), str):
        for token in re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,24}", resume["content"]):
            add_term(token)
            if len(terms) >= 40:
                break

    return terms[:50]


async def _get_master_resume_terms() -> list[str]:
    resumes = await db.list_resumes()
    masters = [
        r
        for r in resumes
        if r.get("is_master") and r.get("processing_status") == "ready"
    ]
    if not masters:
        masters = [r for r in resumes if r.get("is_master")]
    if not masters:
        return []
    default_master = next(
        (r for r in masters if r.get("is_default_master")), masters[0]
    )
    return _extract_resume_terms(default_master)


def compute_match_score(
    title: str, description: str, resume_terms: list[str]
) -> int | None:
    """Compute a fast heuristic 0-100 match score against master resume terms."""
    if not resume_terms:
        return None
    haystack = f"{title}\n{description}"
    if not haystack.strip():
        return None
    hits = sum(1 for term in resume_terms if keyword_in_text(term, haystack))
    if hits == 0:
        return 10
    # Reaching 8+ distinct resume skills/role terms in a single JD scores ~95%.
    denominator = min(len(resume_terms), 10)
    ratio = min(1.0, hits / max(denominator, 1))
    return min(99, max(15, round(15 + ratio * 84)))


def _make_external_key(source: str, raw_id: str) -> str:
    digest = hashlib.sha256(f"{source}:{raw_id}".encode("utf-8")).hexdigest()[:24]
    return f"{source}:{digest}"


def _normalize_searchapi_job(
    item: dict[str, Any], resume_terms: list[str]
) -> dict[str, Any]:
    title = str(item.get("title") or "Untitled Role").strip()
    company = str(item.get("company_name") or "").strip()
    location = str(item.get("location") or "").strip()
    via = str(item.get("via") or "").strip() or None
    description = str(item.get("description") or "").strip()

    ext = item.get("detected_extensions") or {}
    posted_at_text = str(ext.get("posted_at") or "").strip() or None
    schedule_type = str(ext.get("schedule") or ext.get("schedule_type") or "").strip() or None
    salary_text = str(ext.get("salary") or "").strip() or None
    if not posted_at_text and isinstance(item.get("extensions"), list):
        for badge in item["extensions"]:
            if isinstance(badge, str) and parse_posted_hours_ago(badge) is not None:
                posted_at_text = badge
                break

    apply_links = item.get("apply_links")
    if not isinstance(apply_links, list):
        apply_links = []
    apply_url = item.get("apply_link")
    if not apply_url and apply_links:
        first_link = apply_links[0]
        if isinstance(first_link, dict):
            apply_url = first_link.get("link")
    if not apply_url:
        apply_url = item.get("sharing_link")

    raw_id = str(
        item.get("job_id") or apply_url or f"{title}|{company}|{location}"
    )
    return {
        "source": "searchapi",
        "external_key": _make_external_key("searchapi", raw_id),
        "title": title,
        "company": company,
        "location": location,
        "via": via,
        "posted_at_text": posted_at_text,
        "posted_hours_ago": parse_posted_hours_ago(posted_at_text),
        "schedule_type": schedule_type,
        "salary_text": salary_text,
        "apply_url": str(apply_url) if apply_url else None,
        "apply_links": apply_links,
        "description": description,
        "match_score": compute_match_score(title, description, resume_terms),
    }


def _normalize_apify_job(
    item: dict[str, Any], resume_terms: list[str]
) -> dict[str, Any]:
    title = str(
        item.get("title")
        or item.get("jobTitle")
        or item.get("positionName")
        or "Untitled Role"
    ).strip()
    company_raw = item.get("company") or item.get("companyName") or ""
    if isinstance(company_raw, dict):
        company = str(company_raw.get("name") or "").strip()
    else:
        company = str(company_raw).strip()

    location_raw = item.get("location") or item.get("jobLocation") or ""
    if isinstance(location_raw, dict):
        location = str(
            location_raw.get("label") or location_raw.get("name") or ""
        ).strip()
    else:
        location = str(location_raw).strip()

    posted_at_text = (
        str(
            item.get("postedAt")
            or item.get("listedAt")
            or item.get("listingDate")
            or item.get("datePosted")
            or ""
        ).strip()
        or None
    )
    salary_raw = item.get("salary") or item.get("salaryInfo")
    salary_text = str(salary_raw).strip() if salary_raw else None
    schedule_type = (
        str(item.get("workType") or item.get("employmentType") or "").strip() or None
    )
    apply_url = (
        item.get("url")
        or item.get("jobUrl")
        or item.get("applyUrl")
        or item.get("link")
    )
    description = str(
        item.get("description")
        or item.get("jobDescription")
        or item.get("content")
        or item.get("teaser")
        or ""
    ).strip()
    # Strip basic HTML tags if actor returned raw HTML description
    if "<" in description and ">" in description:
        description = _strip_html(description)

    raw_id = str(item.get("id") or item.get("jobId") or apply_url or f"{title}|{company}")
    return {
        "source": "apify",
        "external_key": _make_external_key("apify", raw_id),
        "title": title,
        "company": company,
        "location": location,
        "via": str(item.get("source") or "JobStreet (Apify)"),
        "posted_at_text": posted_at_text,
        "posted_hours_ago": parse_posted_hours_ago(posted_at_text),
        "schedule_type": schedule_type,
        "salary_text": salary_text,
        "apply_url": str(apply_url) if apply_url else None,
        "apply_links": (
            [{"title": "JobStreet / Source", "link": str(apply_url)}]
            if apply_url
            else []
        ),
        "description": description,
        "match_score": compute_match_score(title, description, resume_terms),
    }


def _normalize_serpapi_job(
    item: dict[str, Any], resume_terms: list[str]
) -> dict[str, Any]:
    title = str(item.get("title") or "Untitled Role").strip()
    company = str(item.get("company_name") or "").strip()
    location = str(item.get("location") or "").strip()
    via = str(item.get("via") or "").strip() or None
    description = str(item.get("description") or "").strip()

    ext = item.get("detected_extensions") or {}
    posted_at_text = str(ext.get("posted_at") or "").strip() or None
    schedule_type = (
        str(ext.get("schedule_type") or ext.get("schedule") or "").strip() or None
    )
    salary_text = str(ext.get("salary") or "").strip() or None

    apply_links = item.get("apply_options")
    if not isinstance(apply_links, list):
        apply_links = []
    apply_url = None
    if apply_links and isinstance(apply_links[0], dict):
        apply_url = apply_links[0].get("link")
    if not apply_url:
        apply_url = item.get("share_link")

    raw_id = str(item.get("job_id") or apply_url or f"{title}|{company}|{location}")
    return {
        "source": "serpapi",
        "external_key": _make_external_key("serpapi", raw_id),
        "title": title,
        "company": company,
        "location": location,
        "via": via,
        "posted_at_text": posted_at_text,
        "posted_hours_ago": parse_posted_hours_ago(posted_at_text),
        "schedule_type": schedule_type,
        "salary_text": salary_text,
        "apply_url": str(apply_url) if apply_url else None,
        "apply_links": apply_links,
        "description": description,
        "match_score": compute_match_score(title, description, resume_terms),
    }


def _normalize_jsearch_job(
    item: dict[str, Any], resume_terms: list[str]
) -> dict[str, Any]:
    title = str(item.get("job_title") or "Untitled Role").strip()
    company = str(item.get("employer_name") or "").strip()
    city = str(item.get("job_city") or "").strip()
    state = str(item.get("job_state") or "").strip()
    country = str(item.get("job_country") or "").strip()
    location = str(
        item.get("job_location")
        or ", ".join(p for p in (city, state, country) if p)
    ).strip()

    via = str(item.get("job_publisher") or "JSearch").strip()
    description = str(item.get("job_description") or "").strip()
    posted_at_text = (
        str(item.get("job_posted_at") or item.get("job_posted_at_datetime_utc") or "")
        .strip()
        or None
    )

    posted_hours_ago: float | None = None
    ts = item.get("job_posted_at_timestamp")
    if isinstance(ts, (int, float)) and ts > 0:
        delta = (datetime.now(timezone.utc).timestamp() - float(ts)) / 3600.0
        posted_hours_ago = max(0.0, round(delta, 2))
    if posted_hours_ago is None:
        posted_hours_ago = parse_posted_hours_ago(posted_at_text)

    schedule_type = str(item.get("job_employment_type") or "").strip() or None
    if item.get("job_is_remote") and schedule_type and "remote" not in schedule_type.lower():
        schedule_type = f"{schedule_type} (Remote)"
    elif item.get("job_is_remote") and not schedule_type:
        schedule_type = "Remote"

    salary_text = str(item.get("job_salary_string") or "").strip() or None
    if not salary_text and (item.get("job_min_salary") or item.get("job_max_salary")):
        cur = item.get("job_salary_currency") or ""
        lo = item.get("job_min_salary") or ""
        hi = item.get("job_max_salary") or ""
        per = item.get("job_salary_period") or ""
        salary_text = f"{cur} {lo}-{hi} {per}".strip()

    raw_opts = item.get("apply_options") or []
    apply_links = [
        {
            "title": str(opt.get("publisher") or "Apply"),
            "link": str(opt.get("apply_link") or ""),
        }
        for opt in raw_opts
        if isinstance(opt, dict) and opt.get("apply_link")
    ]
    apply_url = item.get("job_apply_link") or (
        apply_links[0]["link"] if apply_links else item.get("job_google_link")
    )
    raw_id = str(item.get("job_id") or apply_url or f"{title}|{company}|{location}")
    return {
        "source": "jsearch",
        "external_key": _make_external_key("jsearch", raw_id),
        "title": title,
        "company": company,
        "location": location,
        "via": via,
        "posted_at_text": posted_at_text,
        "posted_hours_ago": posted_hours_ago,
        "schedule_type": schedule_type,
        "salary_text": salary_text,
        "apply_url": str(apply_url) if apply_url else None,
        "apply_links": apply_links,
        "description": description,
        "match_score": compute_match_score(title, description, resume_terms),
    }


def _normalize_instagram_post(
    post: dict[str, Any], username: str, resume_terms: list[str]
) -> dict[str, Any] | None:
    node = post.get("node", post)
    if not isinstance(node, dict):
        return None
    caption_obj = node.get("caption")
    caption = (
        str(caption_obj.get("text") or "")
        if isinstance(caption_obj, dict)
        else str(caption_obj or "")
    ).strip()
    if len(caption) < 20:
        return None

    lines = [ln.strip() for ln in caption.splitlines() if ln.strip()]
    title = "Lowongan Instagram"
    company = f"@{username}"
    location = ""

    for idx, ln in enumerate(lines[:8]):
        low = ln.lower()
        if any(k in low for k in ("posisi:", "posisi :", "lowongan:", "dibutuhkan:", "open recruitment", "we are hiring")):
            cleaned_line = re.sub(r"^[🔹🔸•\-*\s📍📝🚖🏢]+", "", ln).strip()
            if ":" in cleaned_line:
                after_colon = cleaned_line.split(":", 1)[1].strip()
                if len(after_colon) >= 3:
                    title = after_colon[:180]
                    break
                if idx + 1 < len(lines):
                    next_clean = re.sub(r"^[🔹🔸•\-*\s📍📝🚖🏢]+", "", lines[idx + 1]).strip()
                    if len(next_clean) >= 3:
                        title = next_clean[:180]
                        break
            elif len(cleaned_line) >= 5:
                title = cleaned_line[:180]
                break
    if title == "Lowongan Instagram" and lines:
        first_clean = re.sub(r"^[🔹🔸•\-*\s📍📝🚖🏢]+", "", lines[0]).strip()
        title = first_clean[:160] or title

    for ln in lines:
        low = ln.lower()
        if any(k in low for k in ("penempatan:", "lokasi:", "location:")):
            location = ln.split(":", 1)[1].strip()[:120]
            break

    taken_at = node.get("taken_at")
    posted_hours_ago: float | None = None
    posted_at_text: str | None = None
    if isinstance(taken_at, (int, float)) and taken_at > 0:
        # Handle normal epoch seconds; clamp negative values if clock differs
        delta_h = (datetime.now(timezone.utc).timestamp() - float(taken_at)) / 3600.0
        if delta_h >= 0:
            posted_hours_ago = round(delta_h, 2)
            if delta_h < 24:
                posted_at_text = f"{max(1, int(delta_h))} jam yang lalu"
            else:
                posted_at_text = f"{max(1, int(delta_h // 24))} hari yang lalu"
        else:
            posted_at_text = datetime.fromtimestamp(
                float(taken_at), tz=timezone.utc
            ).strftime("%Y-%m-%d")

    code = str(node.get("code") or "").strip()
    post_url = f"https://www.instagram.com/p/{code}/" if code else None
    raw_id = str(node.get("id") or node.get("pk") or code or caption[:100])
    return {
        "source": "instagram",
        "external_key": _make_external_key("instagram", raw_id),
        "title": title,
        "company": company,
        "location": location,
        "via": f"@{username} (Instagram)",
        "posted_at_text": posted_at_text,
        "posted_hours_ago": posted_hours_ago,
        "schedule_type": None,
        "salary_text": None,
        "apply_url": post_url,
        "apply_links": (
            [{"title": "Instagram Post", "link": post_url}] if post_url else []
        ),
        "description": caption,
        "match_score": compute_match_score(title, caption, resume_terms),
    }


def _normalize_serpapi_google_result(
    item: dict[str, Any], resume_terms: list[str]
) -> dict[str, Any] | None:
    title = str(item.get("title") or "").strip()
    link = str(item.get("link") or "").strip()
    snippet = str(item.get("snippet") or "").strip()
    if not title or not link:
        return None
    displayed = str(item.get("displayed_link") or "")
    host = (urlsplit(link).hostname or "").replace("www.", "")
    if "google.com" in host and displayed:
        # SerpApi sometimes returns a google.com/goto wrapper; displayed_link carries portal domain.
        disp_host = re.split(r"[\s›/]+", displayed.replace("https://", "").replace("http://", ""))[0]
        via = disp_host or host
    else:
        via = host or "Google Search"
    posted_at_text = str(item.get("date") or "").strip() or None
    return {
        "source": "serpapi_google",
        "external_key": _make_external_key("serpapi_google", link or title),
        "title": title,
        "company": str(item.get("source") or "").strip(),
        "location": "",
        "via": via,
        "posted_at_text": posted_at_text,
        "posted_hours_ago": parse_posted_hours_ago(posted_at_text),
        "schedule_type": None,
        "salary_text": None,
        "apply_url": link,
        "apply_links": [{"title": via, "link": link}],
        "description": snippet or title,
        "match_score": compute_match_score(title, snippet, resume_terms),
    }


_JOB_POST_SIGNALS = (
    "lowongan",
    "loker",
    "dibutuhkan",
    "open recruitment",
    "we are hiring",
    "hiring",
    "rekrutmen",
    "karir",
    "career",
    "lamar",
    "kirim cv",
    "kualifikasi",
    "persyaratan",
)


def _normalize_facebook_post(
    item: dict[str, Any], resume_terms: list[str]
) -> dict[str, Any] | None:
    msg = str(item.get("message") or "").strip()
    if len(msg) < 30:
        return None
    low_msg = msg.lower()
    if not any(sig in low_msg for sig in _JOB_POST_SIGNALS):
        return None

    author = item.get("author") if isinstance(item.get("author"), dict) else {}
    author_name = str(author.get("name") or "Facebook Loker").strip()
    lines = [ln.strip() for ln in msg.splitlines() if ln.strip()]
    title = re.sub(r"^[🔹🔸•\-*\s📍📝🚖🏢✨]+\s*", "", lines[0]).strip()[:160] if lines else "Lowongan Facebook"

    ts = item.get("timestamp")
    posted_hours_ago = None
    posted_at_text = None
    if isinstance(ts, (int, float)) and ts > 0:
        delta_h = (datetime.now(timezone.utc).timestamp() - float(ts)) / 3600.0
        if delta_h >= 0:
            posted_hours_ago = round(delta_h, 2)
            posted_at_text = (
                f"{max(1, int(delta_h))} jam yang lalu"
                if delta_h < 24
                else f"{max(1, int(delta_h // 24))} hari yang lalu"
            )
    url = str(item.get("url") or "").strip() or None
    raw_id = str(item.get("post_id") or url or msg[:100])
    return {
        "source": "facebook",
        "external_key": _make_external_key("facebook", raw_id),
        "title": title or "Lowongan Facebook",
        "company": author_name,
        "location": "",
        "via": f"{author_name} (Facebook)",
        "posted_at_text": posted_at_text,
        "posted_hours_ago": posted_hours_ago,
        "schedule_type": None,
        "salary_text": None,
        "apply_url": url,
        "apply_links": [{"title": "Facebook Post", "link": url}] if url else [],
        "description": msg,
        "match_score": compute_match_score(title, msg, resume_terms),
    }


async def search_external_jobs(
    *,
    provider: str,
    query: str,
    location: str = "Indonesia",
    gl: str = "id",
    hl: str = "id",
    next_page_token: str | None = None,
    apify_actor_id: str | None = None,
    apify_max_items: int = 15,
    apify_job_urls: list[str] | None = None,
) -> dict[str, Any]:
    """Fetch jobs from one provider or fan-out across all configured fast providers."""
    keys = get_decrypted_job_source_keys()
    searchapi_key = keys["searchapi_key"]
    serpapi_key = keys["serpapi_key"]
    rapidapi_key = keys["rapidapi_key"]
    apify_token = keys["apify_token"]
    default_actor = keys["apify_default_actor"]
    resume_terms = await _get_master_resume_terms()

    if provider == "all":
        active_providers: list[str] = []
        if searchapi_key:
            active_providers.append("searchapi")
        if serpapi_key:
            active_providers.extend(["serpapi", "serpapi_google"])
        if rapidapi_key:
            active_providers.extend(["jsearch", "facebook"])
        portals_cfg = get_portals_and_blacklist()
        if any(p.get("enabled", True) for p in portals_cfg["portals"] if isinstance(p, dict)):
            active_providers.append("portals")

        if not active_providers:
            raise ValueError(
                "Belum ada sumber pencari kerja yang dikonfigurasi. Tambahkan API key di tombol API Key Sumber."
            )

        tasks = [
            search_external_jobs(
                provider=prov,
                query=query,
                location=location,
                gl=gl,
                hl=hl,
            )
            for prov in active_providers
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        merged: list[dict[str, Any]] = []
        seen_sigs: set[str] = set()
        succeeded_names: list[str] = []
        for prov, res in zip(active_providers, results):
            if isinstance(res, Exception):
                logger.warning("Unified search provider %s failed: %s", prov, res)
                continue
            succeeded_names.append(prov)
            for item in res.get("listings") or []:
                sig = (
                    f"{str(item.get('title') or '').strip().lower()}|"
                    f"{str(item.get('company') or '').strip().lower()}"
                )
                url_sig = str(item.get("apply_url") or "").strip().lower()
                if sig in seen_sigs or (url_sig and url_sig in seen_sigs):
                    continue
                seen_sigs.add(sig)
                if url_sig:
                    seen_sigs.add(url_sig)
                merged.append(item)

        return {
            "provider": "all",
            "listings": merged,
            "total_fetched": len(merged),
            "next_page_token": None,
            "message": (
                f"Gabungan {len(succeeded_names)}/{len(active_providers)} sumber aktif "
                f"({', '.join(succeeded_names)}): {len(merged)} lowongan unik."
            ),
        }

    if provider == "searchapi":
        if not searchapi_key:
            raise ValueError(
                "SearchAPI.io API key belum dikonfigurasi. Masukkan API key di Pengaturan Sumber Lowongan."
            )
        params: dict[str, str] = {
            "engine": "google_jobs",
            "q": query.strip(),
            "api_key": searchapi_key,
        }
        if location.strip():
            params["location"] = location.strip()
        if gl.strip():
            params["gl"] = gl.strip()
        if hl.strip():
            params["hl"] = hl.strip()
        if next_page_token:
            params["next_page_token"] = next_page_token

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.get(
                "https://www.searchapi.io/api/v1/search", params=params
            )
        if resp.status_code >= 400:
            detail = resp.text[:300]
            raise RuntimeError(
                f"SearchAPI.io mengembalikan status {resp.status_code}: {detail}"
            )
        payload = resp.json()
        raw_jobs = payload.get("jobs") or []
        normalized = [
            _normalize_searchapi_job(job, resume_terms)
            for job in raw_jobs
            if isinstance(job, dict)
        ]
        saved = await db.upsert_job_listings(normalized)
        pagination = payload.get("pagination") or {}
        return {
            "provider": "searchapi",
            "listings": saved,
            "total_fetched": len(saved),
            "next_page_token": pagination.get("next_page_token"),
            "message": None,
        }

    if provider == "serpapi":
        if not serpapi_key:
            raise ValueError(
                "SerpApi API key belum dikonfigurasi. Masukkan API key di Pengaturan Sumber Lowongan."
            )
        params = {
            "engine": "google_jobs",
            "q": query.strip(),
            "api_key": serpapi_key,
        }
        if location.strip():
            params["location"] = location.strip()
        if gl.strip():
            params["gl"] = gl.strip()
        if hl.strip():
            params["hl"] = hl.strip()
        if next_page_token:
            params["next_page_token"] = next_page_token

        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.get(
                "https://serpapi.com/search.json", params=params
            )
        if resp.status_code >= 400:
            raise RuntimeError(
                f"SerpApi mengembalikan status {resp.status_code}: {resp.text[:300]}"
            )
        payload = resp.json()
        if payload.get("error"):
            raise RuntimeError(f"SerpApi error: {payload['error']}")
        raw_jobs = payload.get("jobs_results") or []
        normalized = [
            _normalize_serpapi_job(job, resume_terms)
            for job in raw_jobs
            if isinstance(job, dict)
        ]
        saved = await db.upsert_job_listings(normalized)
        pagination = payload.get("serpapi_pagination") or {}
        return {
            "provider": "serpapi",
            "listings": saved,
            "total_fetched": len(saved),
            "next_page_token": pagination.get("next_page_token"),
            "message": None,
        }

    if provider == "jsearch":
        if not rapidapi_key:
            raise ValueError(
                "RapidAPI key belum dikonfigurasi. Masukkan RapidAPI key di Pengaturan Sumber Lowongan."
            )
        search_q = query.strip()
        loc_clean = location.strip()
        if loc_clean and loc_clean.lower() not in search_q.lower():
            search_q = f"{search_q} in {loc_clean}"
        j_params: dict[str, str] = {
            "query": search_q,
            "num_pages": "1",
        }
        if next_page_token:
            j_params["cursor"] = next_page_token

        headers = {
            "x-rapidapi-key": rapidapi_key,
            "x-rapidapi-host": "jsearch.p.rapidapi.com",
        }
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.get(
                "https://jsearch.p.rapidapi.com/search-v2",
                params=j_params,
                headers=headers,
            )
            # Fallback without location suffix if JSearch returns 0 for specific region strings
            payload = resp.json() if resp.status_code < 400 else {}
            data_obj = payload.get("data") if isinstance(payload, dict) else None
            raw_jobs = (
                data_obj.get("jobs", [])
                if isinstance(data_obj, dict)
                else (data_obj or [])
            )
            if resp.status_code < 400 and not raw_jobs and loc_clean and not next_page_token:
                resp = await client.get(
                    "https://jsearch.p.rapidapi.com/search-v2",
                    params={"query": query.strip(), "num_pages": "1"},
                    headers=headers,
                )
                payload = resp.json() if resp.status_code < 400 else {}
                data_obj = payload.get("data") if isinstance(payload, dict) else None
                raw_jobs = (
                    data_obj.get("jobs", [])
                    if isinstance(data_obj, dict)
                    else (data_obj or [])
                )

        if resp.status_code >= 400:
            raise RuntimeError(
                f"JSearch mengembalikan status {resp.status_code}: {resp.text[:300]}"
            )
        normalized = [
            _normalize_jsearch_job(job, resume_terms)
            for job in raw_jobs
            if isinstance(job, dict)
        ]
        saved = await db.upsert_job_listings(normalized)
        next_cursor = data_obj.get("cursor") if isinstance(data_obj, dict) else None
        return {
            "provider": "jsearch",
            "listings": saved,
            "total_fetched": len(saved),
            "next_page_token": next_cursor,
            "message": None,
        }

    if provider == "instagram":
        if not rapidapi_key:
            raise ValueError(
                "RapidAPI key belum dikonfigurasi. Masukkan RapidAPI key di Pengaturan Sumber Lowongan."
            )
        ig_headers = {
            "X-RapidAPI-Key": rapidapi_key,
            "X-RapidAPI-Host": "instagram-scraper-stable-api.p.rapidapi.com",
        }
        q_clean = query.strip().lstrip("@")
        target_username = q_clean
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            # If user typed a phrase with spaces (e.g. "loker jakarta"), find the top IG account first.
            if " " in q_clean:
                s_resp = await client.post(
                    "https://instagram-scraper-stable-api.p.rapidapi.com/search_ig.php",
                    data={"search_query": q_clean},
                    headers=ig_headers,
                )
                if s_resp.status_code >= 400:
                    raise RuntimeError(
                        f"Instagram search mengembalikan status {s_resp.status_code}."
                    )
                s_data = s_resp.json()
                users = s_data.get("users") or []
                if not users:
                    return {
                        "provider": "instagram",
                        "listings": [],
                        "total_fetched": 0,
                        "next_page_token": None,
                        "message": f"Akun Instagram loker untuk '{q_clean}' tidak ditemukan. Coba ketik username akun langsung (mis. lokerjakartakerja).",
                    }
                target_username = str(
                    (users[0].get("user") or {}).get("username") or q_clean
                )

            p_resp = await client.post(
                "https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_posts.php",
                data={"username_or_url": target_username, "amount": "12"},
                headers=ig_headers,
            )
        if p_resp.status_code >= 400:
            raise RuntimeError(
                f"Instagram Scraper mengembalikan status {p_resp.status_code}: {p_resp.text[:300]}"
            )
        p_data = p_resp.json()
        if p_data.get("error"):
            raise RuntimeError(f"Instagram API: {p_data['error']}")
        raw_posts = p_data.get("posts") or []
        normalized = [
            item
            for post in raw_posts
            if isinstance(post, dict)
            and (item := _normalize_instagram_post(post, target_username, resume_terms))
            is not None
        ]
        saved = await db.upsert_job_listings(normalized)
        return {
            "provider": "instagram",
            "listings": saved,
            "total_fetched": len(saved),
            "next_page_token": None,
            "message": f"Menampilkan {len(saved)} postingan loker dari @{target_username}.",
        }

    if provider == "apify":
        if not apify_token:
            raise ValueError(
                "Apify API token belum dikonfigurasi. Masukkan token di Pengaturan Sumber Lowongan."
            )
        actor = (apify_actor_id or default_actor or DEFAULT_APIFY_ACTOR).strip()
        actor_path = actor.replace("/", "~")
        url = (
            f"https://api.apify.com/v2/acts/{actor_path}/run-sync-get-dataset-items"
        )

        # Build compatible input covering common JobStreet Apify actors.
        actor_input: dict[str, Any] = {
            "keywords": query.strip(),
            "keyword": query.strip(),
            "search": query.strip(),
            "location": location.strip() or "Indonesia",
            "country": "ID",
            "maxItems": apify_max_items,
            "maxResults": apify_max_items,
        }
        if apify_job_urls:
            actor_input["jobSearchUrls"] = apify_job_urls
            actor_input["startUrls"] = [{"url": u} for u in apify_job_urls]

        async with httpx.AsyncClient(timeout=_APIFY_TIMEOUT) as client:
            resp = await client.post(
                url,
                params={"token": apify_token},
                json=actor_input,
            )
        if resp.status_code in (402, 403):
            raise RuntimeError(
                f"Apify actor '{actor}' memerlukan paket/kredit berbayar pada akun Apify Anda (HTTP {resp.status_code}). Anda tetap dapat memakai SearchAPI.io atau Impor URL/Bookmarklet 1-Klik."
            )
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Apify mengembalikan status {resp.status_code}: {resp.text[:300]}"
            )
        raw_items = resp.json()
        if not isinstance(raw_items, list):
            raw_items = []
        normalized = [
            _normalize_apify_job(item, resume_terms)
            for item in raw_items
            if isinstance(item, dict)
        ]
        saved = await db.upsert_job_listings(normalized)
        return {
            "provider": "apify",
            "listings": saved,
            "total_fetched": len(saved),
            "next_page_token": None,
            "message": (
                f"Berhasil mengambil {len(saved)} lowongan dari Apify ({actor})."
                if saved
                else f"Apify ({actor}) tidak mengembalikan data untuk kata kunci tersebut."
            ),
        }

    if provider == "serpapi_google":
        if not serpapi_key:
            raise ValueError(
                "SerpApi API key belum dikonfigurasi. Masukkan API key di Pengaturan Sumber Lowongan."
            )
        loc_part = f" {location.strip()}" if location.strip() and location.strip().lower() != "indonesia" else ""
        web_query = (
            f"lowongan {query.strip()}{loc_part} "
            "(site:id.jobstreet.com OR site:glints.com/opportunities/jobs "
            "OR site:kalibrr.com OR site:dealls.com OR site:linkedin.com/jobs)"
        )
        g_params: dict[str, str] = {
            "engine": "google",
            "q": web_query,
            "gl": gl.strip() or "id",
            "hl": hl.strip() or "id",
            "tbs": "qdr:w",
            "num": "15",
            "api_key": serpapi_key,
        }
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.get("https://serpapi.com/search.json", params=g_params)
        if resp.status_code >= 400:
            raise RuntimeError(
                f"SerpApi Google Web mengembalikan status {resp.status_code}: {resp.text[:300]}"
            )
        payload = resp.json()
        raw_items = payload.get("organic_results") or []
        normalized = [
            item
            for row in raw_items
            if isinstance(row, dict)
            and (item := _normalize_serpapi_google_result(row, resume_terms)) is not None
        ]
        saved = await db.upsert_job_listings(normalized)
        return {
            "provider": "serpapi_google",
            "listings": saved,
            "total_fetched": len(saved),
            "next_page_token": None,
            "message": None,
        }

    if provider == "facebook":
        if not rapidapi_key:
            raise ValueError(
                "RapidAPI key belum dikonfigurasi. Masukkan RapidAPI key di Pengaturan Sumber Lowongan."
            )
        loc_part = f" {location.strip()}" if location.strip() and location.strip().lower() != "indonesia" else ""
        fb_query = f"lowongan kerja {query.strip()}{loc_part}".strip()
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            resp = await client.get(
                "https://facebook-scraper3.p.rapidapi.com/search/posts",
                params={"query": fb_query, "recent_posts": "true"},
                headers={
                    "x-rapidapi-key": rapidapi_key,
                    "x-rapidapi-host": "facebook-scraper3.p.rapidapi.com",
                },
            )
        if resp.status_code >= 400:
            raise RuntimeError(
                f"Facebook Scraper mengembalikan status {resp.status_code}: {resp.text[:300]}"
            )
        raw_posts = resp.json().get("results") or []
        normalized = [
            item
            for post in raw_posts
            if isinstance(post, dict)
            and (item := _normalize_facebook_post(post, resume_terms)) is not None
        ]
        saved = await db.upsert_job_listings(normalized)
        return {
            "provider": "facebook",
            "listings": saved,
            "total_fetched": len(saved),
            "next_page_token": None,
            "message": None,
        }

    if provider == "portals":
        cfg = get_portals_and_blacklist()
        portals = [p for p in cfg["portals"] if isinstance(p, dict) and p.get("enabled", True)]
        if not portals:
            return {
                "provider": "portals",
                "listings": [],
                "total_fetched": 0,
                "next_page_token": None,
                "message": "Belum ada perusahaan target di daftar Portals. Tambahkan board Greenhouse / Lever / Ashby / URL Karier di tombol Target & Blacklist.",
            }
        raw_collected = await _scan_company_portals(portals, resume_terms)
        q_low = query.strip().lower()
        loc_low = location.strip().lower()
        matched_items = []
        for item in raw_collected:
            if q_low:
                hay = f"{item['title']} {item['company']} {item['description']}".lower()
                if q_low not in hay:
                    continue
            if loc_low and loc_low != "indonesia":
                if loc_low not in f"{item['location']} {item['description']}".lower():
                    continue
            matched_items.append(item)
        saved = await db.upsert_job_listings(matched_items[:60])
        return {
            "provider": "portals",
            "listings": saved,
            "total_fetched": len(saved),
            "next_page_token": None,
            "message": f"Memindai {len(portals)} portal perusahaan, ditemukan {len(saved)} lowongan cocok.",
        }

    raise ValueError(f"Unsupported job search provider: {provider}")


async def _scan_company_portals(
    portals: list[dict[str, Any]], resume_terms: list[str]
) -> list[dict[str, Any]]:
    """Fetch public job listings from Greenhouse, Lever, Ashby, or Playwright SPA portals."""
    collected: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
        for portal in portals:
            kind = str(portal.get("kind") or "greenhouse").lower()
            ident = str(portal.get("identifier") or "").strip()
            name = str(portal.get("name") or ident).strip()
            if not ident:
                continue
            try:
                if kind == "greenhouse":
                    resp = await client.get(
                        f"https://boards-api.greenhouse.io/v1/boards/{ident}/jobs",
                        params={"content": "true"},
                    )
                    if resp.status_code >= 400:
                        continue
                    for job in (resp.json().get("jobs") or [])[:25]:
                        title = str(job.get("title") or "").strip()
                        loc = str(((job.get("location") or {}).get("name")) or "").strip()
                        desc = _strip_html(str(job.get("content") or ""))
                        job_url = str(job.get("absolute_url") or "")
                        updated = str(job.get("updated_at") or "")
                        collected.append(
                            {
                                "source": "portals",
                                "external_key": _make_external_key(
                                    "portals", f"gh:{ident}:{job.get('id') or job_url}"
                                ),
                                "title": title,
                                "company": name,
                                "location": loc,
                                "via": f"{name} (Greenhouse)",
                                "posted_at_text": updated[:10] if updated else None,
                                "posted_hours_ago": parse_posted_hours_ago(updated),
                                "schedule_type": None,
                                "salary_text": None,
                                "apply_url": job_url or None,
                                "apply_links": (
                                    [{"title": name, "link": job_url}] if job_url else []
                                ),
                                "description": desc,
                                "match_score": compute_match_score(
                                    title, desc, resume_terms
                                ),
                            }
                        )
                elif kind == "lever":
                    resp = await client.get(
                        f"https://api.lever.co/v0/postings/{ident}",
                        params={"mode": "json"},
                    )
                    if resp.status_code >= 400:
                        continue
                    for job in (resp.json() or [])[:25]:
                        if not isinstance(job, dict):
                            continue
                        title = str(job.get("text") or "").strip()
                        cats = job.get("categories") or {}
                        loc = str(cats.get("location") or "").strip()
                        commitment = str(cats.get("commitment") or "").strip() or None
                        desc = str(job.get("descriptionPlain") or "") or _strip_html(
                            str(job.get("description") or "")
                        )
                        job_url = str(job.get("hostedUrl") or job.get("applyUrl") or "")
                        created_ms = job.get("createdAt")
                        hrs = None
                        posted_str = None
                        if isinstance(created_ms, (int, float)) and created_ms > 0:
                            hrs = max(
                                0.0,
                                round(
                                    (
                                        datetime.now(timezone.utc).timestamp()
                                        - (created_ms / 1000.0)
                                    )
                                    / 3600.0,
                                    2,
                            ),
                            )
                            posted_str = datetime.fromtimestamp(
                                created_ms / 1000.0, tz=timezone.utc
                            ).strftime("%Y-%m-%d")
                        collected.append(
                            {
                                "source": "portals",
                                "external_key": _make_external_key(
                                    "portals", f"lever:{ident}:{job.get('id') or job_url}"
                                ),
                                "title": title,
                                "company": name,
                                "location": loc,
                                "via": f"{name} (Lever)",
                                "posted_at_text": posted_str,
                                "posted_hours_ago": hrs,
                                "schedule_type": commitment,
                                "salary_text": None,
                                "apply_url": job_url or None,
                                "apply_links": (
                                    [{"title": name, "link": job_url}] if job_url else []
                                ),
                                "description": desc,
                                "match_score": compute_match_score(
                                    title, desc, resume_terms
                                ),
                            }
                        )
                elif kind == "ashby":
                    resp = await client.get(
                        f"https://api.ashbyhq.com/posting-api/job-board/{ident}"
                    )
                    if resp.status_code >= 400:
                        continue
                    for job in (resp.json().get("jobs") or [])[:25]:
                        title = str(job.get("title") or "").strip()
                        loc = str(job.get("location") or "").strip()
                        desc = str(job.get("descriptionPlain") or "") or _strip_html(
                            str(job.get("descriptionHtml") or "")
                        )
                        job_url = str(job.get("jobUrl") or job.get("applyUrl") or "")
                        pub = str(job.get("publishedAt") or "")
                        collected.append(
                            {
                                "source": "portals",
                                "external_key": _make_external_key(
                                    "portals", f"ashby:{ident}:{job.get('id') or job_url}"
                                ),
                                "title": title,
                                "company": name,
                                "location": loc,
                                "via": f"{name} (Ashby)",
                                "posted_at_text": pub[:10] if pub else None,
                                "posted_hours_ago": parse_posted_hours_ago(pub),
                                "schedule_type": str(job.get("employmentType") or "") or None,
                                "salary_text": None,
                                "apply_url": job_url or None,
                                "apply_links": (
                                    [{"title": name, "link": job_url}] if job_url else []
                                ),
                                "description": desc,
                                "match_score": compute_match_score(
                                    title, desc, resume_terms
                                ),
                            }
                        )
                elif kind == "playwright":
                    pw_items = await _scan_playwright_career_page(
                        ident, name, resume_terms
                    )
                    collected.extend(pw_items)
            except Exception as exc:
                logger.warning("Portal scan failed for %s (%s): %s", name, kind, exc)
                continue
    return collected


async def _scan_playwright_career_page(
    raw_url: str, company_name: str, resume_terms: list[str]
) -> list[dict[str, Any]]:
    """Render a public JS career page with Playwright and extract job links (respects anti-bot gates)."""
    url = _validate_public_http_url(raw_url)
    from playwright.async_api import async_playwright

    results: list[dict[str, Any]] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await page.wait_for_timeout(1500)
            body_text = (await page.inner_text("body"))[:4000]
            lower = body_text.lower()
            if "captcha" in lower or "verify you are human" in lower or "just a moment" in lower:
                return []
            links = await page.eval_on_selector_all(
                "a[href]",
                """els => els.map(e => ({
                    text: (e.innerText || '').trim().replace(/\\s+/g, ' '),
                    href: e.href || ''
                })).filter(x => x.text.length >= 6 && x.text.length <= 140)""",
            )
            seen_href: set[str] = set()
            for lnk in links:
                href = str(lnk.get("href") or "")
                text = str(lnk.get("text") or "")
                low_href = href.lower()
                if not href.startswith("http") or href in seen_href:
                    continue
                if any(
                    seg in low_href
                    for seg in ("/job", "/jobs", "/career", "/careers", "/position", "/role", "/opening")
                ):
                    seen_href.add(href)
                    desc = f"{text}\nSource Career Page: {url}\nLink: {href}"
                    results.append(
                        {
                            "source": "portals",
                            "external_key": _make_external_key("portals", f"pw:{href}"),
                            "title": text,
                            "company": company_name,
                            "location": "",
                            "via": f"{company_name} (Career Page)",
                            "posted_at_text": None,
                            "posted_hours_ago": None,
                            "schedule_type": None,
                            "salary_text": None,
                            "apply_url": href,
                            "apply_links": [{"title": company_name, "link": href}],
                            "description": desc,
                            "match_score": compute_match_score(
                                text, desc, resume_terms
                            ),
                        }
                    )
                    if len(results) >= 20:
                        break
        finally:
            await browser.close()
    return results


async def estimate_job_salary(
    *, job_title: str, location: str = "Indonesia"
) -> list[dict[str, Any]]:
    """Fetch salary benchmarks via JSearch /estimated-salary."""
    keys = get_decrypted_job_source_keys()
    rapidapi_key = keys["rapidapi_key"]
    if not rapidapi_key:
        raise ValueError(
            "RapidAPI key belum dikonfigurasi untuk estimasi gaji JSearch."
        )
    async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
        resp = await client.get(
            "https://jsearch.p.rapidapi.com/estimated-salary",
            params={
                "job_title": job_title.strip(),
                "location": (location or "Indonesia").strip(),
            },
            headers={
                "x-rapidapi-key": rapidapi_key,
                "x-rapidapi-host": "jsearch.p.rapidapi.com",
            },
        )
    if resp.status_code >= 400:
        raise RuntimeError(
            f"JSearch salary API mengembalikan status {resp.status_code}: {resp.text[:250]}"
        )
    payload = resp.json()
    raw = payload.get("data") or []
    if not isinstance(raw, list):
        return []
    return [
        {
            "location": str(item.get("location") or ""),
            "job_title": str(item.get("job_title") or job_title),
            "publisher_name": str(item.get("publisher_name") or ""),
            "min_salary": item.get("min_salary"),
            "max_salary": item.get("max_salary"),
            "median_salary": item.get("median_salary"),
            "salary_period": str(item.get("salary_period") or ""),
            "salary_currency": str(item.get("salary_currency") or ""),
        }
        for item in raw
        if isinstance(item, dict)
    ]


def _validate_public_http_url(raw_url: str) -> str:
    """Validate URL scheme and reject private/loopback hosts (SSRF guard)."""
    cleaned = raw_url.strip()
    parsed = urlsplit(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ValueError("URL harus diawali http:// atau https:// dan memiliki host valid.")
    host = parsed.hostname.lower()
    if host in ("localhost", "127.0.0.1", "::1", "0.0.0.0") or host.endswith(".local"):
        raise ValueError("URL lokal/internal tidak diizinkan.")
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError as exc:
        raise ValueError(f"Host tidak dapat dijangkau: {host}") from exc
    for info in infos:
        addr = info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
        ):
            raise ValueError("Alamat IP privat/lokal tidak diizinkan.")
    return cleaned


def _strip_html(raw_html: str) -> str:
    text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", raw_html)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</(p|div|li|h[1-6]|tr)>", "\n", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def _find_job_posting_jsonld(node: Any) -> dict[str, Any] | None:
    if isinstance(node, list):
        for item in node:
            found = _find_job_posting_jsonld(item)
            if found:
                return found
        return None
    if isinstance(node, dict):
        typ = node.get("@type")
        if typ == "JobPosting" or (isinstance(typ, list) and "JobPosting" in typ):
            return node
        for key in ("@graph", "mainEntity"):
            if key in node:
                found = _find_job_posting_jsonld(node[key])
                if found:
                    return found
    return None


def _extract_meta(page_html: str, name: str) -> str:
    pattern = (
        rf'<meta[^>]+(?:property|name)=["\']{re.escape(name)}["\'][^>]+content=["\']([^"\']+)["\']'
        rf'|<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{re.escape(name)}["\']'
    )
    match = re.search(pattern, page_html, re.IGNORECASE)
    if not match:
        return ""
    return html.unescape((match.group(1) or match.group(2) or "").strip())


def _extract_job_from_html(page_html: str, url: str) -> dict[str, Any]:
    title = ""
    company = ""
    location = ""
    posted_at_text: str | None = None
    schedule_type: str | None = None
    salary_text: str | None = None
    description = ""

    # 1. Try JSON-LD JobPosting schema (used by JobStreet, Glints, Greenhouse, Lever)
    for match in re.finditer(
        r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
        page_html,
        re.IGNORECASE | re.DOTALL,
    ):
        raw_json = match.group(1).strip()
        try:
            parsed = json.loads(raw_json)
        except json.JSONDecodeError:
            continue
        jp = _find_job_posting_jsonld(parsed)
        if not jp:
            continue
        title = str(jp.get("title") or "").strip()
        org = jp.get("hiringOrganization")
        if isinstance(org, dict):
            company = str(org.get("name") or "").strip()
        loc = jp.get("jobLocation")
        if isinstance(loc, list) and loc:
            loc = loc[0]
        if isinstance(loc, dict):
            addr = loc.get("address")
            if isinstance(addr, dict):
                parts = [
                    str(addr.get(k) or "").strip()
                    for k in ("addressLocality", "addressRegion", "addressCountry")
                ]
                location = ", ".join(p for p in parts if p)
        if jp.get("datePosted"):
            posted_at_text = str(jp["datePosted"]).strip()
        if jp.get("employmentType"):
            emp = jp["employmentType"]
            schedule_type = ", ".join(emp) if isinstance(emp, list) else str(emp)
        if jp.get("description"):
            description = _strip_html(str(jp["description"]))
        break

    # 2. Fallback to OpenGraph / HTML title & body text
    if not title:
        title = _extract_meta(page_html, "og:title")
    if not title:
        title_match = re.search(r"<title[^>]*>(.*?)</title>", page_html, re.I | re.S)
        if title_match:
            title = html.unescape(re.sub(r"\s+", " ", title_match.group(1)).strip())

    if not description:
        og_desc = _extract_meta(page_html, "og:description") or _extract_meta(
            page_html, "description"
        )
        body_match = re.search(r"<body[^>]*>(.*)</body>", page_html, re.I | re.S)
        body_text = _strip_html(body_match.group(1)) if body_match else ""
        description = body_text[:8000] if len(body_text) > len(og_desc) else og_desc

    host = urlsplit(url).hostname or "URL Import"
    return {
        "source": "url_import",
        "external_key": _make_external_key("url_import", url),
        "title": title or "Imported Job Posting",
        "company": company,
        "location": location,
        "via": host.replace("www.", ""),
        "posted_at_text": posted_at_text,
        "posted_hours_ago": parse_posted_hours_ago(posted_at_text),
        "schedule_type": schedule_type,
        "salary_text": salary_text,
        "apply_url": url,
        "apply_links": [{"title": host.replace("www.", ""), "link": url}],
        "description": description,
    }


async def import_job_from_url(raw_url: str) -> dict[str, Any]:
    """Fetch a public job page and extract JobPosting details (no anti-bot bypass)."""
    url = _validate_public_http_url(raw_url)
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    async with httpx.AsyncClient(
        timeout=_REQUEST_TIMEOUT, follow_redirects=True, max_redirects=5
    ) as client:
        resp = await client.get(url, headers=headers)

    if resp.status_code in (401, 403, 429):
        raise ValueError(
            f"Situs menolak akses langsung (HTTP {resp.status_code}). Gunakan tombol Bookmarklet 1-Klik langsung dari tab browser Anda untuk mengimpor lowongan ini secara instan."
        )
    if resp.status_code >= 400:
        raise ValueError(f"Gagal mengambil URL (HTTP {resp.status_code}).")

    page_html = resp.text[:_MAX_HTML_BYTES]
    lower_html = page_html.lower()
    if (
        "cf-challenge" in lower_html
        or "just a moment..." in lower_html
        or "captcha" in lower_html
        and "jobposting" not in lower_html
    ):
        raise ValueError(
            "Halaman ini dilindungi verifikasi browser/anti-bot. Buka lowongan di browser Anda lalu klik Bookmarklet 'Simpan ke Resume Matcher' untuk mengimpor langsung."
        )

    item = _extract_job_from_html(page_html, str(resp.url))
    if len(item["description"]) < 30:
        raise ValueError(
            "Deskripsi lowongan tidak terbaca dari HTML statis (halaman mungkin dirender penuh via JavaScript atau butuh login). Gunakan Bookmarklet 1-Klik di tab browser Anda."
        )

    resume_terms = await _get_master_resume_terms()
    item["match_score"] = compute_match_score(
        item["title"], item["description"], resume_terms
    )
    saved = await db.upsert_job_listings([item])
    return saved[0]


async def import_job_from_clip(data: dict[str, Any]) -> dict[str, Any]:
    """Store a job posting clipped directly from the user's browser bookmarklet."""
    url = str(data.get("url") or "").strip()
    title = str(data.get("title") or "Clipped Job").strip()
    company = str(data.get("company") or "").strip()
    location = str(data.get("location") or "").strip()
    description = str(data.get("description") or "").strip()
    via = data.get("via")
    if not via and url:
        host = (urlsplit(url).hostname or "").replace("www.", "")
        via = host or None

    posted_at_text = data.get("posted_at_text")
    resume_terms = await _get_master_resume_terms()
    item = {
        "source": "browser_clip",
        "external_key": _make_external_key(
            "browser_clip", url or f"{title}|{company}|{description[:120]}"
        ),
        "title": title,
        "company": company,
        "location": location,
        "via": via,
        "posted_at_text": posted_at_text,
        "posted_hours_ago": parse_posted_hours_ago(posted_at_text),
        "schedule_type": data.get("schedule_type"),
        "salary_text": data.get("salary_text"),
        "apply_url": url or None,
        "apply_links": [{"title": via or "Source", "link": url}] if url else [],
        "description": description,
        "match_score": compute_match_score(title, description, resume_terms),
    }
    saved = await db.upsert_job_listings([item])
    return saved[0]


def compute_red_flags(item: dict[str, Any]) -> list[str]:
    """Detect Career-Ops style ghost-job, stale, vague, or scam red flags."""
    flags: list[str] = []
    hrs = item.get("posted_hours_ago")
    if isinstance(hrs, (int, float)) and hrs >= 720:
        flags.append("stale_posting")
    desc = str(item.get("description") or "").strip()
    if len(desc) < 180:
        flags.append("vague_description")
    low_text = f"{item.get('title') or ''} {desc}".lower()
    if any(pat in low_text for pat in _SCAM_OR_COMMISSION_PATTERNS):
        flags.append("scam_or_commission_signal")
    if not item.get("apply_url"):
        flags.append("missing_apply_link")
    return flags


def _matches_blacklist(
    item: dict[str, Any], companies: list[str], keywords: list[str]
) -> bool:
    comp_low = str(item.get("company") or "").lower()
    if any(c.lower() in comp_low for c in companies if c):
        return True
    hay = f"{item.get('title') or ''} {item.get('description') or ''}".lower()
    return any(k.lower() in hay for k in keywords if k)


def filter_and_sort_listings(
    listings: list[dict[str, Any]],
    *,
    q: str = "",
    location: str = "",
    freshness: str = "all",
    portal: str = "all",
    work_type: str = "all",
    source: str = "all",
    bookmarked_only: bool = False,
    sort_by: str = "newest",
    include_blacklisted: bool = False,
) -> list[dict[str, Any]]:
    """Filter cached/returned job listings by keyword, freshness, portal, blacklist, and type."""
    q_low = q.strip().lower()
    loc_low = location.strip().lower()
    portal_low = portal.strip().lower()
    max_hours = _FRESHNESS_MAX_HOURS.get(freshness)
    blacklist_cfg = get_portals_and_blacklist()
    bl_companies = blacklist_cfg["blacklist_companies"]
    bl_keywords = blacklist_cfg["blacklist_keywords"]

    filtered: list[dict[str, Any]] = []
    for item in listings:
        if not include_blacklisted and _matches_blacklist(
            item, bl_companies, bl_keywords
        ):
            continue
        if bookmarked_only and not item.get("is_bookmarked"):
            continue
        if source != "all" and item.get("source") != source:
            continue

        if q_low:
            hay = " ".join(
                [
                    str(item.get("title") or ""),
                    str(item.get("company") or ""),
                    str(item.get("description") or ""),
                ]
            ).lower()
            if q_low not in hay:
                continue

        if loc_low and loc_low != "indonesia":
            loc_hay = (
                f"{item.get('location') or ''} {item.get('description') or ''}".lower()
            )
            if loc_low not in loc_hay:
                continue

        if max_hours is not None:
            hrs = item.get("posted_hours_ago")
            if hrs is None or hrs > max_hours:
                continue

        if portal_low and portal_low != "all":
            portal_hay = " ".join(
                [
                    str(item.get("via") or ""),
                    str(item.get("apply_url") or ""),
                ]
            ).lower()
            if portal_low not in portal_hay:
                continue

        if work_type != "all":
            wt_hay = " ".join(
                [
                    str(item.get("schedule_type") or ""),
                    str(item.get("title") or ""),
                    str(item.get("location") or ""),
                ]
            ).lower()
            matched_wt = {
                "remote": any(w in wt_hay for w in ("remote", "wfh", "jarak jauh")),
                "fulltime": any(
                    w in wt_hay
                    for w in ("full-time", "full time", "penuh waktu", "tetap", "fulltime")
                ),
                "parttime": any(
                    w in wt_hay for w in ("part-time", "part time", "paruh waktu")
                ),
                "contract": any(
                    w in wt_hay for w in ("contract", "kontrak", "freelance")
                ),
                "internship": any(
                    w in wt_hay for w in ("intern", "magang", "internship")
                ),
            }.get(work_type, True)
            if not matched_wt:
                continue

        enriched = dict(item)
        enriched["red_flags"] = compute_red_flags(enriched)
        filtered.append(enriched)

    if sort_by == "match":
        filtered.sort(
            key=lambda x: (
                -(x.get("match_score") if x.get("match_score") is not None else -1),
                x.get("posted_hours_ago")
                if x.get("posted_hours_ago") is not None
                else 1e9,
            )
        )
    else:
        filtered.sort(
            key=lambda x: (
                x.get("posted_hours_ago") is None,
                x.get("posted_hours_ago")
                if x.get("posted_hours_ago") is not None
                else 1e9,
                x.get("updated_at") or "",
            )
        )
    return filtered


async def _get_default_master_resume() -> dict[str, Any]:
    resumes = await db.list_resumes()
    masters = [
        r
        for r in resumes
        if r.get("is_master") and r.get("processing_status") == "ready"
    ]
    if not masters:
        masters = [r for r in resumes if r.get("is_master")]
    if not masters:
        raise ValueError(
            "Master Resume belum tersedia. Unggah atau buat Master Resume di Dasbor terlebih dahulu."
        )
    return next((r for r in masters if r.get("is_default_master")), masters[0])


async def evaluate_job_listing(listing_id: str) -> dict[str, Any]:
    """Run Career-Ops 1-5 multi-dimensional evaluation against the Master Resume."""
    listing = await db.get_job_listing(listing_id)
    if listing is None:
        raise KeyError("Job listing not found")
    master = await _get_default_master_resume()
    resume_payload = master.get("processed_data") or {"raw_text": master.get("content", "")}
    lang = get_language_name(get_content_language())

    prompt = f"""Evaluate how well this candidate's Master Resume fits the Job Listing using a Career-Ops 1-5 rubric.

IMPORTANT: Write string values in {lang}. Keep all JSON property names exactly as shown.
Truthfulness rule: Use ONLY evidence present in the Candidate Resume and Job Listing. Do NOT invent skills or experience.

Job Listing:
Title: {listing.get('title')}
Company: {listing.get('company')}
Location: {listing.get('location')}
Posted: {listing.get('posted_at_text')}
Description:
{str(listing.get('description') or '')[:10000]}

Candidate Master Resume:
{json.dumps(resume_payload, ensure_ascii=False)[:18000]}

Return ONLY a valid JSON object with exactly these keys:
{{
  "overall_score": 4.0,
  "recommendation": "APPLY",
  "dimensions": {{
    "tech_stack_match": 4,
    "seniority_alignment": 4,
    "domain_fit": 4
  }},
  "strengths": ["Concrete match 1", "Concrete match 2"],
  "gaps": ["Honest gap 1"],
  "summary": "2-3 sentence objective verdict in {lang}."
}}

Rules:
- overall_score: float from 1.0 to 5.0
- recommendation: one of "STRONG_APPLY", "APPLY", "BORDERLINE", "SKIP"
- Each dimension integer: 1 to 5
- strengths: 2-4 concise bullets grounded in resume evidence
- gaps: 1-4 honest gaps or missing requirements"""

    config = get_llm_config()
    max_tokens = get_safe_max_tokens(get_model_name(config), requested=2048, config=config)
    result = await complete_json(
        prompt=prompt,
        system_prompt="You are a strict, honest career-ops hiring evaluator. Return JSON only.",
        max_tokens=max_tokens,
    )
    overall = float(result.get("overall_score") or 3.0)
    overall = max(1.0, min(5.0, round(overall, 1)))
    dims_raw = result.get("dimensions") or {}
    dimensions = {
        k: max(1, min(5, int(dims_raw.get(k) or 3)))
        for k in ("tech_stack_match", "seniority_alignment", "domain_fit")
    }
    rec = str(result.get("recommendation") or "BORDERLINE").upper()
    if rec not in ("STRONG_APPLY", "APPLY", "BORDERLINE", "SKIP"):
        rec = "APPLY" if overall >= 3.5 else "BORDERLINE"

    evaluation = {
        "overall_score": overall,
        "recommendation": rec,
        "dimensions": dimensions,
        "strengths": [str(x) for x in (result.get("strengths") or [])[:5]],
        "gaps": [str(x) for x in (result.get("gaps") or [])[:5]],
        "summary": str(result.get("summary") or "").strip(),
    }
    await db.update_job_listing_evaluation(listing_id, evaluation)
    return evaluation


async def draft_form_answers(
    listing_id: str, questions: list[str] | None = None
) -> list[dict[str, str]]:
    """Draft HITL application form answers grounded strictly in Master Resume + JD."""
    listing = await db.get_job_listing(listing_id)
    if listing is None:
        raise KeyError("Job listing not found")
    master = await _get_default_master_resume()
    resume_payload = master.get("processed_data") or {"raw_text": master.get("content", "")}
    lang_code = get_content_language()
    lang = get_language_name(lang_code)

    cleaned_questions = [q.strip() for q in (questions or []) if q.strip()]
    if not cleaned_questions:
        cleaned_questions = (
            [
                "Mengapa Anda tertarik melamar posisi ini di perusahaan ini?",
                "Ceritakan pengalaman atau pencapaian paling relevan Anda untuk peran ini.",
                "Apa keahlian utama yang membuat Anda cocok dengan kebutuhan posisi ini?",
            ]
            if lang_code == "id"
            else [
                "Why are you interested in this role and company?",
                "Describe your most relevant experience or achievement for this position.",
                "What core skills make you a strong fit for this role?",
            ]
        )

    prompt = f"""Draft concise, ready-to-paste application form answers for the candidate (Human-in-the-Loop review).

IMPORTANT: Write answers in {lang}.
Truthfulness rule: Use ONLY real experiences, tools, companies, and outcomes present in the Candidate Resume. Never fabricate facts or metrics.

Target Job:
Title: {listing.get('title')}
Company: {listing.get('company')}
Description:
{str(listing.get('description') or '')[:8000]}

Candidate Master Resume:
{json.dumps(resume_payload, ensure_ascii=False)[:16000]}

Questions to answer:
{json.dumps(cleaned_questions, ensure_ascii=False)}

Return ONLY a valid JSON object:
{{
  "answers": [
    {{
      "question": "Exact question text",
      "answer": "Concise 2-4 sentence truthful answer in {lang}"
    }}
  ]
}}"""

    config = get_llm_config()
    max_tokens = get_safe_max_tokens(get_model_name(config), requested=2048, config=config)
    result = await complete_json(
        prompt=prompt,
        system_prompt="You are a truthful job application assistant. Return JSON only.",
        max_tokens=max_tokens,
    )
    raw_answers = result.get("answers") or []
    return [
        {
            "question": str(a.get("question") or ""),
            "answer": str(a.get("answer") or ""),
        }
        for a in raw_answers
        if isinstance(a, dict)
    ]
