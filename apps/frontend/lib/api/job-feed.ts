import { apiDelete, apiFetch, apiPatch, apiPost, apiPut, parseErrorDetail } from './client';

export type JobFeedProvider =
  | 'all'
  | 'searchapi'
  | 'serpapi'
  | 'serpapi_google'
  | 'jsearch'
  | 'facebook'
  | 'instagram'
  | 'apify'
  | 'portals';
export type PortalKind = 'greenhouse' | 'lever' | 'ashby' | 'playwright';
export type FreshnessFilter = 'all' | '24h' | '3d' | '7d' | '30d';
export type WorkTypeFilter = 'all' | 'remote' | 'fulltime' | 'parttime' | 'contract' | 'internship';
export type SortOrder = 'newest' | 'match';

export interface ApplyLinkOption {
  title?: string;
  link?: string;
}

export interface JobEvaluation {
  overall_score: number;
  recommendation: 'STRONG_APPLY' | 'APPLY' | 'BORDERLINE' | 'SKIP' | string;
  dimensions: Record<string, number>;
  strengths: string[];
  gaps: string[];
  summary: string;
}

export interface CompanyPortalEntry {
  name: string;
  kind: PortalKind;
  identifier: string;
  enabled: boolean;
}

export interface PortalsAndBlacklistConfig {
  portals: CompanyPortalEntry[];
  blacklist_companies: string[];
  blacklist_keywords: string[];
}

export interface FormAnswerItem {
  question: string;
  answer: string;
}

export interface JobListingItem {
  listing_id: string;
  source: string;
  external_key: string;
  title: string;
  company: string;
  location: string;
  via: string | null;
  posted_at_text: string | null;
  posted_hours_ago: number | null;
  schedule_type: string | null;
  salary_text: string | null;
  apply_url: string | null;
  apply_links: ApplyLinkOption[];
  description: string;
  match_score: number | null;
  red_flags?: string[];
  evaluation?: JobEvaluation | null;
  is_bookmarked: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobFeedSearchParams {
  provider: JobFeedProvider;
  query: string;
  location?: string;
  gl?: string;
  hl?: string;
  next_page_token?: string | null;
  apify_actor_id?: string;
  apify_max_items?: number;
}

export interface JobFeedSearchResponse {
  provider: string;
  listings: JobListingItem[];
  total_fetched: number;
  next_page_token: string | null;
  message: string | null;
}

export interface JobFeedFilterParams {
  q?: string;
  location?: string;
  freshness?: FreshnessFilter;
  portal?: string;
  work_type?: WorkTypeFilter;
  source?: string;
  bookmarked_only?: boolean;
  sort_by?: SortOrder;
}

export interface JobSourcesStatus {
  searchapi_configured: boolean;
  searchapi_key_masked: string;
  serpapi_configured: boolean;
  serpapi_key_masked: string;
  rapidapi_configured: boolean;
  rapidapi_key_masked: string;
  apify_configured: boolean;
  apify_token_masked: string;
  apify_default_actor: string;
}

export interface JobSourcesUpdate {
  searchapi_api_key?: string;
  serpapi_api_key?: string;
  rapidapi_key?: string;
  apify_api_token?: string;
  apify_default_actor?: string;
}

export interface SalaryEstimateItem {
  location: string;
  job_title: string;
  publisher_name: string;
  min_salary: number | null;
  max_salary: number | null;
  median_salary: number | null;
  salary_period: string;
  salary_currency: string;
}

export interface JobClipPayload {
  url: string;
  title: string;
  company?: string;
  location?: string;
  via?: string;
  posted_at_text?: string;
  schedule_type?: string;
  salary_text?: string;
  description: string;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => '');
  return parseErrorDetail(text) || fallback;
}

export async function fetchJobSourcesStatus(): Promise<JobSourcesStatus> {
  const res = await apiFetch('/job-feed/sources');
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to load job source status.'));
  return res.json();
}

export async function updateJobSources(payload: JobSourcesUpdate): Promise<JobSourcesStatus> {
  const res = await apiPut('/job-feed/sources', payload);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to update job source keys.'));
  return res.json();
}

export async function fetchSavedJobFeed(
  filters: JobFeedFilterParams = {}
): Promise<{ listings: JobListingItem[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.location) params.set('location', filters.location);
  if (filters.freshness) params.set('freshness', filters.freshness);
  if (filters.portal) params.set('portal', filters.portal);
  if (filters.work_type) params.set('work_type', filters.work_type);
  if (filters.source) params.set('source', filters.source);
  if (filters.bookmarked_only) params.set('bookmarked_only', 'true');
  if (filters.sort_by) params.set('sort_by', filters.sort_by);
  const qs = params.toString();
  const res = await apiFetch(`/job-feed${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to load job listings.'));
  return res.json();
}

export async function searchExternalJobs(
  params: JobFeedSearchParams
): Promise<JobFeedSearchResponse> {
  const res = await apiPost('/job-feed/search', params, 90_000);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Job search failed.'));
  return res.json();
}

export async function importJobByUrl(url: string): Promise<JobListingItem> {
  const res = await apiPost('/job-feed/import-url', { url }, 45_000);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to import job URL.'));
  return res.json();
}

export async function importJobClip(payload: JobClipPayload): Promise<JobListingItem> {
  const res = await apiPost('/job-feed/import-clip', payload);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to save clipped job.'));
  return res.json();
}

export async function toggleJobListingBookmark(
  listingId: string,
  isBookmarked?: boolean
): Promise<JobListingItem> {
  const res = await apiPatch(`/job-feed/${encodeURIComponent(listingId)}/bookmark`, {
    is_bookmarked: isBookmarked,
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to update bookmark.'));
  return res.json();
}

export async function deleteJobListing(listingId: string): Promise<void> {
  const res = await apiDelete(`/job-feed/${encodeURIComponent(listingId)}`);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to delete listing.'));
}

export async function clearJobListings(keepBookmarked = true): Promise<number> {
  const res = await apiDelete(`/job-feed?keep_bookmarked=${keepBookmarked ? 'true' : 'false'}`);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to clear listings.'));
  const data = (await res.json()) as { removed: number };
  return data.removed;
}

export async function estimateJobSalary(
  jobTitle: string,
  location = 'Indonesia'
): Promise<SalaryEstimateItem[]> {
  const res = await apiPost('/job-feed/estimate-salary', {
    job_title: jobTitle,
    location,
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to estimate salary.'));
  const data = (await res.json()) as { estimates: SalaryEstimateItem[] };
  return data.estimates || [];
}

export async function fetchPortalsConfig(): Promise<PortalsAndBlacklistConfig> {
  const res = await apiFetch('/job-feed/portals');
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to load company portals.'));
  return res.json();
}

export async function updatePortalsConfig(
  payload: PortalsAndBlacklistConfig
): Promise<PortalsAndBlacklistConfig> {
  const res = await apiPut('/job-feed/portals', payload);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to save portals config.'));
  return res.json();
}

export async function evaluateJobListing(listingId: string): Promise<JobEvaluation> {
  const res = await apiPost(`/job-feed/${encodeURIComponent(listingId)}/evaluate`, {}, 120_000);
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to evaluate job listing.'));
  return res.json();
}

export async function draftFormAnswers(
  listingId: string,
  questions: string[]
): Promise<FormAnswerItem[]> {
  const res = await apiPost(
    `/job-feed/${encodeURIComponent(listingId)}/form-answers`,
    { questions },
    120_000
  );
  if (!res.ok) throw new Error(await readErrorMessage(res, 'Failed to draft form answers.'));
  const data = (await res.json()) as { answers: FormAnswerItem[] };
  return data.answers || [];
}
