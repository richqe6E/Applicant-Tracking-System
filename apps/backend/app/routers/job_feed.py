"""Job discovery, filtering, Career-Ops evaluation, form assistant, and import endpoints."""

import logging

from fastapi import APIRouter, HTTPException, Query

from app.database import DatabaseBusyError, db
from app.schemas.job_feed import (
    FormAnswerItem,
    FormAnswersRequest,
    FormAnswersResponse,
    FreshnessFilter,
    JobBookmarkRequest,
    JobClipImportRequest,
    JobEvaluationResponse,
    JobFeedListResponse,
    JobFeedSearchRequest,
    JobFeedSearchResponse,
    JobListingItem,
    JobSourcesStatusResponse,
    JobSourcesUpdateRequest,
    JobUrlImportRequest,
    PortalsAndBlacklistConfig,
    SalaryEstimateItem,
    SalaryEstimateRequest,
    SalaryEstimateResponse,
    SortOrder,
    WorkTypeFilter,
)
from app.services.job_feed import (
    compute_red_flags,
    draft_form_answers,
    estimate_job_salary,
    evaluate_job_listing,
    filter_and_sort_listings,
    get_job_sources_status,
    get_portals_and_blacklist,
    import_job_from_clip,
    import_job_from_url,
    search_external_jobs,
    update_job_sources_config,
    update_portals_and_blacklist,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/job-feed", tags=["Job Feed"])


def _with_red_flags(item: dict) -> dict:
    if "red_flags" not in item:
        copied = dict(item)
        copied["red_flags"] = compute_red_flags(copied)
        return copied
    return item


@router.get("/sources", response_model=JobSourcesStatusResponse)
async def get_sources_status() -> JobSourcesStatusResponse:
    """Return masked configuration status for SearchAPI, SerpApi, RapidAPI, and Apify."""
    return JobSourcesStatusResponse(**get_job_sources_status())


@router.put("/sources", response_model=JobSourcesStatusResponse)
async def update_sources(
    request: JobSourcesUpdateRequest,
) -> JobSourcesStatusResponse:
    """Save encrypted job source credentials and default actor ID."""
    status = update_job_sources_config(
        searchapi_api_key=request.searchapi_api_key,
        serpapi_api_key=request.serpapi_api_key,
        rapidapi_key=request.rapidapi_key,
        apify_api_token=request.apify_api_token,
        apify_default_actor=request.apify_default_actor,
    )
    return JobSourcesStatusResponse(**status)


@router.get("/portals", response_model=PortalsAndBlacklistConfig)
async def get_portals() -> PortalsAndBlacklistConfig:
    """Get tracked company career portals and negative-filter blacklists."""
    return PortalsAndBlacklistConfig(**get_portals_and_blacklist())


@router.put("/portals", response_model=PortalsAndBlacklistConfig)
async def put_portals(
    request: PortalsAndBlacklistConfig,
) -> PortalsAndBlacklistConfig:
    """Update tracked company career portals and blacklist terms."""
    updated = update_portals_and_blacklist(request.model_dump())
    return PortalsAndBlacklistConfig(**updated)


@router.post("/estimate-salary", response_model=SalaryEstimateResponse)
async def estimate_salary(
    request: SalaryEstimateRequest,
) -> SalaryEstimateResponse:
    """Estimate market salary for a role and location via JSearch."""
    try:
        items = await estimate_job_salary(
            job_title=request.job_title, location=request.location
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SalaryEstimateResponse(
        estimates=[SalaryEstimateItem(**item) for item in items]
    )


@router.get("", response_model=JobFeedListResponse)
async def list_saved_feed(
    q: str = Query(default=""),
    location: str = Query(default=""),
    freshness: FreshnessFilter = Query(default="all"),
    portal: str = Query(default="all"),
    work_type: WorkTypeFilter = Query(default="all"),
    source: str = Query(default="all"),
    bookmarked_only: bool = Query(default=False),
    include_blacklisted: bool = Query(default=False),
    sort_by: SortOrder = Query(default="newest"),
) -> JobFeedListResponse:
    """List cached/saved job listings with local filtering, blacklist, and sorting."""
    try:
        items = await db.list_job_listings(limit=300)
    except DatabaseBusyError:
        raise
    except Exception as exc:
        logger.exception("Failed to list job feed")
        raise HTTPException(status_code=500, detail="Failed to load job feed.") from exc

    filtered = filter_and_sort_listings(
        items,
        q=q,
        location=location,
        freshness=freshness,
        portal=portal,
        work_type=work_type,
        source=source,
        bookmarked_only=bookmarked_only,
        include_blacklisted=include_blacklisted,
        sort_by=sort_by,
    )
    return JobFeedListResponse(
        listings=[JobListingItem(**item) for item in filtered],
        total=len(filtered),
    )


@router.post("/search", response_model=JobFeedSearchResponse)
async def search_jobs(request: JobFeedSearchRequest) -> JobFeedSearchResponse:
    """Fetch fresh job listings from any configured search provider or company portals."""
    if request.provider != "portals" and not request.query.strip():
        raise HTTPException(status_code=422, detail="Kata kunci pencarian wajib diisi.")
    try:
        result = await search_external_jobs(
            provider=request.provider,
            query=request.query,
            location=request.location,
            gl=request.gl,
            hl=request.hl,
            next_page_token=request.next_page_token,
            apify_actor_id=request.apify_actor_id,
            apify_max_items=request.apify_max_items,
            apify_job_urls=request.apify_job_urls,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except DatabaseBusyError:
        raise
    except Exception as exc:
        logger.exception("Job feed search failed")
        raise HTTPException(
            status_code=502,
            detail=f"Gagal menghubungi penyedia lowongan: {exc}",
        ) from exc

    return JobFeedSearchResponse(
        provider=result["provider"],
        listings=[JobListingItem(**_with_red_flags(item)) for item in result["listings"]],
        total_fetched=result["total_fetched"],
        next_page_token=result.get("next_page_token"),
        message=result.get("message"),
    )


@router.post("/{listing_id}/evaluate", response_model=JobEvaluationResponse)
async def evaluate_listing(listing_id: str) -> JobEvaluationResponse:
    """Run Career-Ops 1-5 multi-dimensional evaluation against the Master Resume."""
    try:
        evaluation = await evaluate_job_listing(listing_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DatabaseBusyError:
        raise
    except Exception as exc:
        logger.exception("Job evaluation failed for %s", listing_id)
        raise HTTPException(
            status_code=502,
            detail=f"Gagal mengevaluasi lowongan dengan LLM: {exc}",
        ) from exc
    return JobEvaluationResponse(**evaluation)


@router.post("/{listing_id}/form-answers", response_model=FormAnswersResponse)
async def generate_form_answers(
    listing_id: str, request: FormAnswersRequest | None = None
) -> FormAnswersResponse:
    """Draft HITL application form answers grounded in Master Resume + JD."""
    try:
        answers = await draft_form_answers(
            listing_id, questions=request.questions if request else None
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DatabaseBusyError:
        raise
    except Exception as exc:
        logger.exception("Form answer drafting failed for %s", listing_id)
        raise HTTPException(
            status_code=502,
            detail=f"Gagal membuat draf jawaban form: {exc}",
        ) from exc
    return FormAnswersResponse(answers=[FormAnswerItem(**a) for a in answers])


@router.post("/import-url", response_model=JobListingItem)
async def import_url(request: JobUrlImportRequest) -> JobListingItem:
    """Import a job posting from a public job URL (JSON-LD / HTML extractor)."""
    try:
        saved = await import_job_from_url(request.url)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except DatabaseBusyError:
        raise
    except Exception as exc:
        logger.exception("URL import failed for %s", request.url)
        raise HTTPException(
            status_code=502,
            detail=f"Gagal mengambil halaman lowongan: {exc}",
        ) from exc
    return JobListingItem(**_with_red_flags(saved))


@router.post("/import-clip", response_model=JobListingItem)
async def import_clip(request: JobClipImportRequest) -> JobListingItem:
    """Import a job posting clipped from the user's browser bookmarklet or form."""
    try:
        saved = await import_job_from_clip(request.model_dump())
    except DatabaseBusyError:
        raise
    except Exception as exc:
        logger.exception("Clip import failed")
        raise HTTPException(
            status_code=500, detail="Gagal menyimpan lowongan hasil klip."
        ) from exc
    return JobListingItem(**_with_red_flags(saved))


@router.patch("/{listing_id}/bookmark", response_model=JobListingItem)
async def toggle_bookmark(
    listing_id: str, request: JobBookmarkRequest | None = None
) -> JobListingItem:
    """Toggle or set bookmark status for a job listing."""
    try:
        updated = await db.toggle_job_listing_bookmark(
            listing_id,
            bookmarked=request.is_bookmarked if request else None,
        )
    except DatabaseBusyError:
        raise
    if updated is None:
        raise HTTPException(status_code=404, detail="Job listing not found")
    return JobListingItem(**_with_red_flags(updated))


@router.delete("/{listing_id}")
async def delete_listing(listing_id: str) -> dict[str, bool]:
    """Delete a single job listing."""
    try:
        deleted = await db.delete_job_listing(listing_id)
    except DatabaseBusyError:
        raise
    if not deleted:
        raise HTTPException(status_code=404, detail="Job listing not found")
    return {"deleted": True}


@router.delete("")
async def clear_listings(keep_bookmarked: bool = Query(default=True)) -> dict[str, int]:
    """Clear cached listings (preserving bookmarked items by default)."""
    try:
        removed = await db.clear_job_listings(keep_bookmarked=keep_bookmarked)
    except DatabaseBusyError:
        raise
    return {"removed": removed}
