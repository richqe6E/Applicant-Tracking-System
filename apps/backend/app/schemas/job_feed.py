"""Pydantic schemas for external job discovery, filtering, evaluation, and quick import."""

from typing import Any, Literal

from pydantic import BaseModel, Field

JobSourceKind = Literal[
    "searchapi",
    "serpapi",
    "serpapi_google",
    "jsearch",
    "facebook",
    "instagram",
    "apify",
    "portals",
    "url_import",
    "browser_clip",
]
JobSearchProvider = Literal[
    "all",
    "searchapi",
    "serpapi",
    "serpapi_google",
    "jsearch",
    "facebook",
    "instagram",
    "apify",
    "portals",
]
PortalKind = Literal["greenhouse", "lever", "ashby", "playwright"]
FreshnessFilter = Literal["all", "24h", "3d", "7d", "30d"]
WorkTypeFilter = Literal["all", "remote", "fulltime", "parttime", "contract", "internship"]
SortOrder = Literal["newest", "match"]


class JobListingItem(BaseModel):
    """Normalized job listing stored/returned by the Job Feed."""

    listing_id: str
    source: str
    external_key: str
    title: str
    company: str = ""
    location: str = ""
    via: str | None = None
    posted_at_text: str | None = None
    posted_hours_ago: float | None = None
    schedule_type: str | None = None
    salary_text: str | None = None
    apply_url: str | None = None
    apply_links: list[dict[str, Any]] = Field(default_factory=list)
    description: str = ""
    match_score: int | None = None
    red_flags: list[str] = Field(default_factory=list)
    evaluation: dict[str, Any] | None = None
    is_bookmarked: bool = False
    created_at: str = ""
    updated_at: str = ""


class JobFeedSearchRequest(BaseModel):
    """Search request targeting SearchAPI, SerpApi, JSearch, Instagram, Apify, or Company Portals."""

    provider: JobSearchProvider = "all"
    query: str = Field(default="", max_length=200)
    location: str = Field(default="Indonesia", max_length=120)
    gl: str = Field(default="id", max_length=10)
    hl: str = Field(default="id", max_length=10)
    next_page_token: str | None = None
    # Apify-specific options
    apify_actor_id: str | None = Field(default=None, max_length=120)
    apify_max_items: int = Field(default=15, ge=1, le=50)
    apify_job_urls: list[str] = Field(default_factory=list)


class JobFeedSearchResponse(BaseModel):
    """Search results plus pagination token when available."""

    provider: str
    listings: list[JobListingItem]
    total_fetched: int
    next_page_token: str | None = None
    message: str | None = None


class JobFeedListResponse(BaseModel):
    """Cached/saved listings returned for local filtering."""

    listings: list[JobListingItem]
    total: int


class JobUrlImportRequest(BaseModel):
    """Import a job posting directly from a public job URL."""

    url: str = Field(min_length=8, max_length=2000)


class JobClipImportRequest(BaseModel):
    """Import a job posting clipped from the user's browser (Bookmarklet / paste)."""

    url: str = Field(default="", max_length=2000)
    title: str = Field(min_length=1, max_length=300)
    company: str = Field(default="", max_length=200)
    location: str = Field(default="", max_length=200)
    via: str | None = Field(default=None, max_length=120)
    posted_at_text: str | None = Field(default=None, max_length=120)
    schedule_type: str | None = Field(default=None, max_length=120)
    salary_text: str | None = Field(default=None, max_length=120)
    description: str = Field(min_length=10, max_length=60000)


class JobSourcesStatusResponse(BaseModel):
    """Non-secret configuration status for all job search providers."""

    searchapi_configured: bool
    searchapi_key_masked: str = ""
    serpapi_configured: bool = False
    serpapi_key_masked: str = ""
    rapidapi_configured: bool = False
    rapidapi_key_masked: str = ""
    apify_configured: bool
    apify_token_masked: str = ""
    apify_default_actor: str = "blackfalcondata/jobstreet-scraper"


class JobSourcesUpdateRequest(BaseModel):
    """Update job source credentials and default Apify actor."""

    searchapi_api_key: str | None = None
    serpapi_api_key: str | None = None
    rapidapi_key: str | None = None
    apify_api_token: str | None = None
    apify_default_actor: str | None = Field(default=None, max_length=120)


class SalaryEstimateRequest(BaseModel):
    """Request salary benchmark from JSearch /estimated-salary."""

    job_title: str = Field(min_length=2, max_length=200)
    location: str = Field(default="Indonesia", max_length=120)


class SalaryEstimateItem(BaseModel):
    """Single salary benchmark entry."""

    location: str = ""
    job_title: str = ""
    publisher_name: str = ""
    min_salary: float | None = None
    max_salary: float | None = None
    median_salary: float | None = None
    salary_period: str = ""
    salary_currency: str = ""


class SalaryEstimateResponse(BaseModel):
    """Estimated salary response."""

    estimates: list[SalaryEstimateItem] = Field(default_factory=list)


class CompanyPortalEntry(BaseModel):
    """A tracked company career portal (Greenhouse, Lever, Ashby, or Playwright SPA)."""

    name: str = Field(min_length=1, max_length=120)
    kind: PortalKind = "greenhouse"
    identifier: str = Field(min_length=1, max_length=500)
    enabled: bool = True


class PortalsAndBlacklistConfig(BaseModel):
    """Tracked company career portals and negative-filter blacklist."""

    portals: list[CompanyPortalEntry] = Field(default_factory=list)
    blacklist_companies: list[str] = Field(default_factory=list)
    blacklist_keywords: list[str] = Field(default_factory=list)


class JobEvaluationResponse(BaseModel):
    """Career-Ops style 1-5 multi-dimensional evaluation."""

    overall_score: float
    recommendation: str
    dimensions: dict[str, int] = Field(default_factory=dict)
    strengths: list[str] = Field(default_factory=list)
    gaps: list[str] = Field(default_factory=list)
    summary: str = ""


class FormAnswersRequest(BaseModel):
    """Draft answers for application form questions (Human-in-the-Loop)."""

    questions: list[str] = Field(default_factory=list, max_length=10)


class FormAnswerItem(BaseModel):
    """Single drafted application form answer."""

    question: str
    answer: str


class FormAnswersResponse(BaseModel):
    """List of drafted application form answers."""

    answers: list[FormAnswerItem] = Field(default_factory=list)


class JobBookmarkRequest(BaseModel):
    """Toggle or explicitly set bookmark status."""

    is_bookmarked: bool | None = None
