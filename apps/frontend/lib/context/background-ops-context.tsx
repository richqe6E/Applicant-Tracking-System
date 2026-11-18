'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import type { ATSScore, ImprovedResult } from '@/components/common/resume_previewer_context';
import type { ResumeData } from '@/components/dashboard/resume-component';
import {
  clearJobListings,
  deleteJobListing,
  estimateJobSalary,
  evaluateJobListing,
  fetchJobSourcesStatus,
  fetchPortalsConfig,
  fetchSavedJobFeed,
  importJobByUrl,
  importJobClip,
  searchExternalJobs,
  toggleJobListingBookmark,
  type FreshnessFilter,
  type JobClipPayload,
  type JobEvaluation,
  type JobFeedProvider,
  type JobListingItem,
  type JobSourcesStatus,
  type PortalsAndBlacklistConfig,
  type SalaryEstimateItem,
  type SortOrder,
  type WorkTypeFilter,
} from '@/lib/api/job-feed';
import { newProgressId, subscribeToProgress } from '@/lib/api/progress';
import {
  fetchResumeList,
  previewImproveResume,
  toPageFitSettings,
  uploadJobDescriptions,
  type ResumeListItem,
} from '@/lib/api/resume';
import type { WritingReport } from '@/lib/api/writing';
import { useStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateType } from '@/lib/types/template-settings';
import { getPreviewErrorMessage } from '@/lib/utils/preview-error';
import {
  DEFAULT_TAILOR_LENGTH,
  buildPreviewLengthOptions,
  readTailorLength,
  writeTailorLength,
  type TailorLengthSettings,
} from '@/lib/utils/tailor-length-settings';

export interface ActiveBackgroundTask {
  id: string;
  label: string;
  href: string;
}

interface BackgroundOpsContextValue {
  // Global active task indicators (rendered in AppTopNav)
  activeTasks: ActiveBackgroundTask[];

  // Shared metadata
  defaultMaster: ResumeListItem | null;
  sourcesStatus: JobSourcesStatus | null;
  setSourcesStatus: React.Dispatch<React.SetStateAction<JobSourcesStatus | null>>;
  portalsConfig: PortalsAndBlacklistConfig;
  setPortalsConfig: React.Dispatch<React.SetStateAction<PortalsAndBlacklistConfig>>;

  // Persistent Jobs Feed state & actions
  providerMode: JobFeedProvider | 'saved';
  setProviderMode: React.Dispatch<React.SetStateAction<JobFeedProvider | 'saved'>>;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  location: string;
  setLocation: React.Dispatch<React.SetStateAction<string>>;
  freshness: FreshnessFilter;
  setFreshness: React.Dispatch<React.SetStateAction<FreshnessFilter>>;
  portal: string;
  setPortal: React.Dispatch<React.SetStateAction<string>>;
  workType: WorkTypeFilter;
  setWorkType: React.Dispatch<React.SetStateAction<WorkTypeFilter>>;
  sortBy: SortOrder;
  setSortBy: React.Dispatch<React.SetStateAction<SortOrder>>;
  bookmarkedOnly: boolean;
  setBookmarkedOnly: React.Dispatch<React.SetStateAction<boolean>>;
  showAdvancedFilters: boolean;
  setShowAdvancedFilters: React.Dispatch<React.SetStateAction<boolean>>;
  showQuickTips: boolean;
  setShowQuickTips: React.Dispatch<React.SetStateAction<boolean>>;

  listings: JobListingItem[];
  setListings: React.Dispatch<React.SetStateAction<JobListingItem[]>>;
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  nextPageToken: string | null;
  isLoadingList: boolean;
  isSearching: boolean;
  jobFeedError: string | null;
  setJobFeedError: React.Dispatch<React.SetStateAction<string | null>>;
  salaryEstimates: SalaryEstimateItem[] | null;
  setSalaryEstimates: React.Dispatch<React.SetStateAction<SalaryEstimateItem[] | null>>;
  estimatingSalary: boolean;
  evaluatingId: string | null;
  importingUrl: boolean;

  loadFeed: () => Promise<void>;
  runJobSearch: (pageToken?: string | null, apifyActorId?: string) => Promise<void>;
  runJobEvaluate: (item: JobListingItem) => Promise<JobEvaluation | null>;
  runSalaryEstimate: (item: JobListingItem) => Promise<void>;
  runImportUrl: (url: string) => Promise<JobListingItem>;
  runImportClip: (payload: JobClipPayload) => Promise<JobListingItem>;
  runToggleBookmark: (item: JobListingItem) => Promise<void>;
  runDeleteListing: (listingId: string) => Promise<void>;
  runClearCache: () => Promise<void>;

  // Persistent Tailor state & actions
  tailorJobDescription: string;
  setTailorJobDescription: React.Dispatch<React.SetStateAction<string>>;
  tailorMasterResumeId: string | null;
  setTailorMasterResumeId: React.Dispatch<React.SetStateAction<string | null>>;
  tailorMasters: ResumeListItem[];
  setTailorMasters: React.Dispatch<React.SetStateAction<ResumeListItem[]>>;
  tailorSelectedPromptId: string;
  setTailorSelectedPromptId: React.Dispatch<React.SetStateAction<string>>;
  tailorLength: TailorLengthSettings;
  updateTailorLength: (patch: Partial<TailorLengthSettings>) => void;
  tailorGenerating: boolean;
  tailorProgressStage: string | null;
  tailorElapsed: number;
  tailorError: string | null;
  setTailorError: React.Dispatch<React.SetStateAction<string | null>>;
  tailorPendingResult: ImprovedResult | null;
  setTailorPendingResult: React.Dispatch<React.SetStateAction<ImprovedResult | null>>;
  tailorShowDiffModal: boolean;
  setTailorShowDiffModal: React.Dispatch<React.SetStateAction<boolean>>;
  tailorMissingDiffResult: ImprovedResult | null;
  setTailorMissingDiffResult: React.Dispatch<React.SetStateAction<ImprovedResult | null>>;
  tailorShowMissingDiffDialog: boolean;
  setTailorShowMissingDiffDialog: React.Dispatch<React.SetStateAction<boolean>>;
  tailorAtsResult: ATSScore | null;
  setTailorAtsResult: React.Dispatch<React.SetStateAction<ATSScore | null>>;
  tailorAtsTemplate: TemplateType | undefined;
  setTailorAtsTemplate: React.Dispatch<React.SetStateAction<TemplateType | undefined>>;
  tailorAtsPrevious: number | undefined;
  setTailorAtsPrevious: React.Dispatch<React.SetStateAction<number | undefined>>;
  tailorWritingResult: WritingReport | null;
  setTailorWritingResult: React.Dispatch<React.SetStateAction<WritingReport | null>>;
  tailorWritingResume: ResumeData | null;
  setTailorWritingResume: React.Dispatch<React.SetStateAction<ResumeData | null>>;
  tailorSourceIdRef: React.MutableRefObject<string | null>;
  startTailorPreview: (params: {
    resumeId: string;
    description: string;
    promptId: string;
    mastersList: ResumeListItem[];
    onResetKeywords?: () => void;
  }) => Promise<void>;
}

const BackgroundOpsContext = createContext<BackgroundOpsContextValue | null>(null);

export function BackgroundOpsProvider({ children }: { children: React.ReactNode }) {
  const { t, locale } = useTranslations();
  const { incrementJobs } = useStatusCache();

  // Shared metadata
  const [defaultMaster, setDefaultMaster] = useState<ResumeListItem | null>(null);
  const [sourcesStatus, setSourcesStatus] = useState<JobSourcesStatus | null>(null);
  const [portalsConfig, setPortalsConfig] = useState<PortalsAndBlacklistConfig>({
    portals: [],
    blacklist_companies: [],
    blacklist_keywords: [],
  });

  // Jobs Feed persistent state
  const [providerMode, setProviderMode] = useState<JobFeedProvider | 'saved'>('all');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('Indonesia');
  const [freshness, setFreshness] = useState<FreshnessFilter>('all');
  const [portal, setPortal] = useState('all');
  const [workType, setWorkType] = useState<WorkTypeFilter>('all');
  const [sortBy, setSortBy] = useState<SortOrder>('newest');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showQuickTips, setShowQuickTips] = useState(true);

  const [listings, setListings] = useState<JobListingItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [jobFeedError, setJobFeedError] = useState<string | null>(null);
  const [salaryEstimates, setSalaryEstimates] = useState<SalaryEstimateItem[] | null>(null);
  const [estimatingSalary, setEstimatingSalary] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [importingUrl, setImportingUrl] = useState(false);

  // Tailor persistent state
  const [tailorJobDescription, setTailorJobDescription] = useState('');
  const [tailorMasterResumeId, setTailorMasterResumeId] = useState<string | null>(null);
  const [tailorMasters, setTailorMasters] = useState<ResumeListItem[]>([]);
  const [tailorSelectedPromptId, setTailorSelectedPromptId] = useState('keywords');
  const [tailorLength, setTailorLength] = useState<TailorLengthSettings>(DEFAULT_TAILOR_LENGTH);
  const [tailorGenerating, setTailorGenerating] = useState(false);
  const [tailorProgressStage, setTailorProgressStage] = useState<string | null>(null);
  const [tailorElapsed, setTailorElapsed] = useState(0);
  const [tailorError, setTailorError] = useState<string | null>(null);
  const [tailorPendingResult, setTailorPendingResult] = useState<ImprovedResult | null>(null);
  const [tailorShowDiffModal, setTailorShowDiffModal] = useState(false);
  const [tailorMissingDiffResult, setTailorMissingDiffResult] = useState<ImprovedResult | null>(
    null
  );
  const [tailorShowMissingDiffDialog, setTailorShowMissingDiffDialog] = useState(false);
  const [tailorAtsResult, setTailorAtsResult] = useState<ATSScore | null>(null);
  const [tailorAtsTemplate, setTailorAtsTemplate] = useState<TemplateType | undefined>(undefined);
  const [tailorAtsPrevious, setTailorAtsPrevious] = useState<number | undefined>(undefined);
  const [tailorWritingResult, setTailorWritingResult] = useState<WritingReport | null>(null);
  const [tailorWritingResume, setTailorWritingResume] = useState<ResumeData | null>(null);
  const tailorSourceIdRef = useRef<string | null>(null);
  const tailorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTailorLength(readTailorLength());
    void (async () => {
      try {
        const [sources, portalsCfg, resumes] = await Promise.all([
          fetchJobSourcesStatus(),
          fetchPortalsConfig(),
          fetchResumeList(true),
        ]);
        setSourcesStatus(sources);
        setPortalsConfig(portalsCfg);
        const ready = resumes.filter((r) => r.is_master && r.processing_status === 'ready');
        const primary = ready.find((r) => r.is_default_master) ?? ready[0] ?? null;
        setDefaultMaster(primary);
      } catch {
        // Non-fatal startup load
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (tailorTimerRef.current) clearInterval(tailorTimerRef.current);
    };
  }, []);

  const updateTailorLength = useCallback((patch: Partial<TailorLengthSettings>) => {
    setTailorLength((prev) => {
      const next = { ...prev, ...patch };
      writeTailorLength(next);
      return next;
    });
  }, []);

  const loadFeed = useCallback(async () => {
    setIsLoadingList(true);
    try {
      const data = await fetchSavedJobFeed({
        q: query,
        location,
        freshness,
        portal,
        work_type: workType,
        bookmarked_only: bookmarkedOnly,
        sort_by: sortBy,
      });
      setListings(data.listings);
      setSelectedId((prev) =>
        prev && data.listings.some((item) => item.listing_id === prev)
          ? prev
          : (data.listings[0]?.listing_id ?? null)
      );
    } catch (err) {
      setJobFeedError(err instanceof Error ? err.message : 'Failed to load job listings.');
    } finally {
      setIsLoadingList(false);
    }
  }, [query, location, freshness, portal, workType, bookmarkedOnly, sortBy]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  const runJobSearch = useCallback(
    async (pageToken: string | null = null, apifyActorId?: string) => {
      if (providerMode === 'saved') {
        await loadFeed();
        return;
      }
      if (providerMode !== 'portals' && !query.trim()) {
        await loadFeed();
        return;
      }
      setJobFeedError(null);
      setIsSearching(true);
      try {
        const res = await searchExternalJobs({
          provider: providerMode as JobFeedProvider,
          query: query.trim(),
          location: location.trim() || 'Indonesia',
          gl: 'id',
          hl: 'id',
          next_page_token: pageToken,
          apify_actor_id: apifyActorId?.trim() || undefined,
        });
        setNextPageToken(res.next_page_token);
        if (res.message) {
          toast.success(res.message);
        } else {
          toast.success(t('jobsFeed.resultsCount', { count: res.total_fetched }));
        }
        await loadFeed();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Search failed.';
        setJobFeedError(msg);
        toast.error(msg);
      } finally {
        setIsSearching(false);
      }
    },
    [providerMode, query, location, loadFeed, t]
  );

  const runJobEvaluate = useCallback(async (item: JobListingItem) => {
    setEvaluatingId(item.listing_id);
    try {
      const evaluation = await evaluateJobListing(item.listing_id);
      setListings((prev) =>
        prev.map((x) => (x.listing_id === item.listing_id ? { ...x, evaluation } : x))
      );
      toast.success(`${item.title}: ${evaluation.overall_score}/5 (${evaluation.recommendation})`);
      return evaluation;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Evaluation failed.');
      return null;
    } finally {
      setEvaluatingId(null);
    }
  }, []);

  const runSalaryEstimate = useCallback(
    async (item: JobListingItem) => {
      setEstimatingSalary(true);
      try {
        const estimates = await estimateJobSalary(
          item.title,
          item.location || location || 'Indonesia'
        );
        setSalaryEstimates(estimates);
        if (estimates.length === 0) {
          toast.info(t('jobsFeed.salaryEstimateEmpty'));
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Salary estimate failed.');
      } finally {
        setEstimatingSalary(false);
      }
    },
    [location, t]
  );

  const runImportUrl = useCallback(
    async (url: string) => {
      setImportingUrl(true);
      try {
        const saved = await importJobByUrl(url);
        toast.success(saved.title);
        await loadFeed();
        setSelectedId(saved.listing_id);
        return saved;
      } finally {
        setImportingUrl(false);
      }
    },
    [loadFeed]
  );

  const runImportClip = useCallback(
    async (payload: JobClipPayload) => {
      const saved = await importJobClip(payload);
      await loadFeed();
      setSelectedId(saved.listing_id);
      return saved;
    },
    [loadFeed]
  );

  const runToggleBookmark = useCallback(async (item: JobListingItem) => {
    try {
      const updated = await toggleJobListingBookmark(item.listing_id, !item.is_bookmarked);
      setListings((prev) => prev.map((x) => (x.listing_id === updated.listing_id ? updated : x)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Bookmark update failed.');
    }
  }, []);

  const runDeleteListing = useCallback(async (listingId: string) => {
    try {
      await deleteJobListing(listingId);
      setListings((prev) => prev.filter((x) => x.listing_id !== listingId));
      setSelectedId((prev) => (prev === listingId ? null : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed.');
    }
  }, []);

  const runClearCache = useCallback(async () => {
    try {
      await clearJobListings(true);
      await loadFeed();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear failed.');
    }
  }, [loadFeed]);

  const startTailorPreview = useCallback(
    async ({
      resumeId,
      description,
      promptId,
      mastersList,
      onResetKeywords,
    }: {
      resumeId: string;
      description: string;
      promptId: string;
      mastersList: ResumeListItem[];
      onResetKeywords?: () => void;
    }) => {
      setTailorError(null);
      setTailorAtsResult(null);
      setTailorWritingResult(null);
      setTailorWritingResume(null);
      onResetKeywords?.();
      setTailorProgressStage(null);
      setTailorGenerating(true);

      if (tailorTimerRef.current) clearInterval(tailorTimerRef.current);
      setTailorElapsed(0);
      tailorTimerRef.current = setInterval(() => setTailorElapsed((s) => s + 1), 1000);

      const progressId = newProgressId();
      const stopProgress = subscribeToProgress(progressId, (stage) => {
        setTailorProgressStage(stage);
      });

      try {
        tailorSourceIdRef.current = resumeId;
        const jobId = await uploadJobDescriptions([description], resumeId);
        incrementJobs();

        const templateSettings =
          mastersList.find((m) => m.resume_id === resumeId)?.template_settings ??
          DEFAULT_TEMPLATE_SETTINGS;
        const result = await previewImproveResume(resumeId, jobId, promptId, {
          ...buildPreviewLengthOptions(tailorLength, toPageFitSettings(templateSettings, locale)),
          progressId,
        });

        if (!result?.data?.diff_summary || !result?.data?.detailed_changes) {
          setTailorPendingResult(null);
          setTailorShowDiffModal(false);
          setTailorMissingDiffResult(result);
          setTailorShowMissingDiffDialog(true);
          return;
        }

        setTailorPendingResult(result);
        setTailorAtsResult(result.data.ats_score ?? null);
        setTailorAtsTemplate(templateSettings.template);
        setTailorWritingResult(result.data.writing ?? null);
        setTailorWritingResume((result.data.resume_preview as ResumeData) ?? null);
        setTailorShowDiffModal(true);
        toast.success(t('tailor.steps.review'));
      } catch (err) {
        const msg = getPreviewErrorMessage(err, t);
        setTailorError(msg);
        toast.error(msg);
      } finally {
        stopProgress();
        setTailorGenerating(false);
        if (tailorTimerRef.current) {
          clearInterval(tailorTimerRef.current);
          tailorTimerRef.current = null;
        }
      }
    },
    [incrementJobs, locale, t, tailorLength]
  );

  const activeTasks = useMemo<ActiveBackgroundTask[]>(() => {
    const items: ActiveBackgroundTask[] = [];
    if (isSearching || importingUrl) {
      items.push({
        id: 'job-search',
        label: t('jobsFeed.searchingButton'),
        href: '/jobs-feed',
      });
    }
    if (evaluatingId) {
      items.push({
        id: 'job-evaluate',
        label: t('jobsFeed.evaluatingBtn'),
        href: '/jobs-feed',
      });
    }
    if (tailorGenerating) {
      items.push({
        id: 'tailor-preview',
        label: t('tailor.generating'),
        href: '/tailor',
      });
    }
    return items;
  }, [isSearching, importingUrl, evaluatingId, tailorGenerating, t]);

  return (
    <BackgroundOpsContext.Provider
      value={{
        activeTasks,
        defaultMaster,
        sourcesStatus,
        setSourcesStatus,
        portalsConfig,
        setPortalsConfig,
        providerMode,
        setProviderMode,
        query,
        setQuery,
        location,
        setLocation,
        freshness,
        setFreshness,
        portal,
        setPortal,
        workType,
        setWorkType,
        sortBy,
        setSortBy,
        bookmarkedOnly,
        setBookmarkedOnly,
        showAdvancedFilters,
        setShowAdvancedFilters,
        showQuickTips,
        setShowQuickTips,
        listings,
        setListings,
        selectedId,
        setSelectedId,
        nextPageToken,
        isLoadingList,
        isSearching,
        jobFeedError,
        setJobFeedError,
        salaryEstimates,
        setSalaryEstimates,
        estimatingSalary,
        evaluatingId,
        importingUrl,
        loadFeed,
        runJobSearch,
        runJobEvaluate,
        runSalaryEstimate,
        runImportUrl,
        runImportClip,
        runToggleBookmark,
        runDeleteListing,
        runClearCache,
        tailorJobDescription,
        setTailorJobDescription,
        tailorMasterResumeId,
        setTailorMasterResumeId,
        tailorMasters,
        setTailorMasters,
        tailorSelectedPromptId,
        setTailorSelectedPromptId,
        tailorLength,
        updateTailorLength,
        tailorGenerating,
        tailorProgressStage,
        tailorElapsed,
        tailorError,
        setTailorError,
        tailorPendingResult,
        setTailorPendingResult,
        tailorShowDiffModal,
        setTailorShowDiffModal,
        tailorMissingDiffResult,
        setTailorMissingDiffResult,
        tailorShowMissingDiffDialog,
        setTailorShowMissingDiffDialog,
        tailorAtsResult,
        setTailorAtsResult,
        tailorAtsTemplate,
        setTailorAtsTemplate,
        tailorAtsPrevious,
        setTailorAtsPrevious,
        tailorWritingResult,
        setTailorWritingResult,
        tailorWritingResume,
        setTailorWritingResume,
        tailorSourceIdRef,
        startTailorPreview,
      }}
    >
      {children}
    </BackgroundOpsContext.Provider>
  );
}

export function useBackgroundOps() {
  const ctx = useContext(BackgroundOpsContext);
  if (!ctx) {
    throw new Error('useBackgroundOps must be used inside BackgroundOpsProvider');
  }
  return ctx;
}
