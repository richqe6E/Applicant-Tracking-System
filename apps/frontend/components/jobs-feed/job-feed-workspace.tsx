'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowSquareOut,
  BookmarkSimple,
  Buildings,
  CaretDown,
  CaretUp,
  ChatText,
  Check,
  Copy,
  CurrencyDollar,
  Funnel,
  Gauge,
  Key,
  LinkSimple,
  ListNumbers,
  MagnifyingGlass,
  PaperPlaneTilt,
  SpinnerGap,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { FeatureGuideButton } from '@/components/common/feature-guide';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
import { PanelHeader } from '@/components/ui/panel-header';
import { Textarea } from '@/components/ui/textarea';
import {
  updateJobSources,
  type FreshnessFilter,
  type JobFeedProvider,
  type JobListingItem,
  type SortOrder,
  type WorkTypeFilter,
} from '@/lib/api/job-feed';
import {
  FormAnswersDialog,
  PortalsBlacklistDialog,
} from '@/components/jobs-feed/career-ops-dialogs';
import { addJobToQueue } from '@/lib/api/resume';
import { createApplication } from '@/lib/api/tracker';
import { useBackgroundOps } from '@/lib/context/background-ops-context';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const DEFAULT_ACTOR_ID = 'blackfalcondata/jobstreet-scraper';

function buildBookmarkletCode(origin: string): string {
  const fnBody = `(function(){
    var t=(document.querySelector('h1,[data-automation="job-detail-title"]')||{}).innerText||document.title;
    var c=(document.querySelector('[data-automation="advertiser-name"],.job-details-jobs-unified-top-card__company-name,.topcard__org-name-link')||{}).innerText||'';
    var l=(document.querySelector('[data-automation="job-detail-location"],.job-details-jobs-unified-top-card__primary-description-container')||{}).innerText||'';
    var sel=(window.getSelection()||'').toString().trim();
    var main=(document.querySelector('[data-automation="jobAdDetails"],.jobs-description__content,main,article')||document.body).innerText||'';
    var d=(sel.length>40?sel:main).trim().slice(0,12000);
    var p=encodeURIComponent(JSON.stringify({url:location.href,title:t.trim().slice(0,250),company:c.trim().slice(0,150),location:l.trim().slice(0,150),description:d}));
    window.open('${origin}/jobs-feed#clip='+p,'_blank');
  })();`;
  return ['java', 'script:', fnBody.replace(/\s+/g, ' ').trim()].join('');
}

export function JobFeedWorkspace() {
  const { t } = useTranslations();
  const router = useRouter();

  const {
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
    selectedId,
    setSelectedId,
    nextPageToken,
    isLoadingList,
    isSearching,
    jobFeedError: error,
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
  } = useBackgroundOps();

  const [showPortalsDialog, setShowPortalsDialog] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  // Sources credentials dialog
  const [showSourcesDialog, setShowSourcesDialog] = useState(false);
  const [searchApiKeyInput, setSearchApiKeyInput] = useState('');
  const [serpApiKeyInput, setSerpApiKeyInput] = useState('');
  const [rapidApiKeyInput, setRapidApiKeyInput] = useState('');
  const [apifyTokenInput, setApifyTokenInput] = useState('');
  const [apifyActorInput, setApifyActorInput] = useState(DEFAULT_ACTOR_ID);
  const [savingSources, setSavingSources] = useState(false);

  // Quick Import / Bookmarklet dialog
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [clipTitle, setClipTitle] = useState('');
  const [clipCompany, setClipCompany] = useState('');
  const [clipLocation, setClipLocation] = useState('');
  const [clipUrl, setClipUrl] = useState('');
  const [clipDescription, setClipDescription] = useState('');
  const [savingClip, setSavingClip] = useState(false);
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const bookmarkletAnchorRef = useRef<HTMLAnchorElement | null>(null);

  const appOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3000';
  const bookmarkletCode = useMemo(() => buildBookmarkletCode(appOrigin), [appOrigin]);

  useEffect(() => {
    if (bookmarkletAnchorRef.current) {
      bookmarkletAnchorRef.current.setAttribute('href', bookmarkletCode);
    }
  }, [bookmarkletCode, showImportDialog]);

  useEffect(() => {
    if (sourcesStatus?.apify_default_actor) {
      setApifyActorInput(sourcesStatus.apify_default_actor);
    }
  }, [sourcesStatus?.apify_default_actor]);

  // Auto-import when opened via the 1-Click Browser Bookmarklet (#clip=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#clip=')) return;
    const encoded = hash.slice('#clip='.length);
    window.history.replaceState(null, '', window.location.pathname);
    void (async () => {
      try {
        const parsed = JSON.parse(decodeURIComponent(encoded)) as {
          url?: string;
          title?: string;
          company?: string;
          location?: string;
          description?: string;
        };
        if (!parsed.title || !parsed.description) return;
        await runImportClip({
          url: parsed.url || '',
          title: parsed.title,
          company: parsed.company || '',
          location: parsed.location || '',
          description: parsed.description,
        });
        toast.success(t('jobsFeed.clipImported'));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to import clipped job.');
      }
    })();
  }, [runImportClip, t]);

  const handleSearch = async (pageToken: string | null = null) => {
    await runJobSearch(pageToken, apifyActorInput);
  };

  const handleToggleBookmark = async (item: JobListingItem) => {
    await runToggleBookmark(item);
  };

  const handleDeleteListing = async (listingId: string) => {
    await runDeleteListing(listingId);
  };

  const handleClearCache = async () => {
    await runClearCache();
  };

  const buildJobDescriptionText = (item: JobListingItem): string => {
    const header = [
      item.title,
      item.company ? `Company: ${item.company}` : '',
      item.location ? `Location: ${item.location}` : '',
      item.salary_text ? `Salary: ${item.salary_text}` : '',
      item.apply_url ? `URL: ${item.apply_url}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    return `${header}\n\n${item.description}`.trim();
  };

  const handleTailorNow = (item: JobListingItem) => {
    try {
      sessionStorage.setItem('rm_prefill_job_description', buildJobDescriptionText(item));
    } catch {
      // ignore
    }
    router.push('/tailor');
  };

  const handleAddToQueue = async (item: JobListingItem) => {
    if (!defaultMaster) {
      toast.error(t('jobsFeed.noMasterResume'));
      return;
    }
    setBusyActionId(item.listing_id);
    try {
      await addJobToQueue(
        defaultMaster.resume_id,
        buildJobDescriptionText(item),
        5,
        item.title,
        item.company || undefined
      );
      toast.success(t('jobsFeed.addedToQueue'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to queue job.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleSaveToTracker = async (item: JobListingItem) => {
    if (!defaultMaster) {
      toast.error(t('jobsFeed.noMasterResume'));
      return;
    }
    setBusyActionId(item.listing_id);
    try {
      const notesParts = [
        item.via ? `Source: ${item.via}` : '',
        item.location ? `Location: ${item.location}` : '',
        item.salary_text ? `Salary: ${item.salary_text}` : '',
        item.apply_url ? `Apply URL: ${item.apply_url}` : '',
      ].filter(Boolean);
      await createApplication({
        resume_id: defaultMaster.resume_id,
        job_description: buildJobDescriptionText(item),
        company: item.company || undefined,
        role: item.title,
        status: 'saved',
        notes: notesParts.join('\n'),
      });
      toast.success(t('jobsFeed.savedToTracker'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save to tracker.');
    } finally {
      setBusyActionId(null);
    }
  };

  const handleImportUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim()) return;
    setImportError(null);
    try {
      await runImportUrl(importUrl.trim());
      setImportUrl('');
      setShowImportDialog(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to import URL.');
    }
  };

  const handleSaveManualClip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clipTitle.trim() || clipDescription.trim().length < 10) return;
    setSavingClip(true);
    setImportError(null);
    try {
      const saved = await runImportClip({
        title: clipTitle.trim(),
        company: clipCompany.trim(),
        location: clipLocation.trim(),
        url: clipUrl.trim(),
        description: clipDescription.trim(),
      });
      toast.success(saved.title);
      setClipTitle('');
      setClipCompany('');
      setClipLocation('');
      setClipUrl('');
      setClipDescription('');
      setShowImportDialog(false);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Failed to save job.');
    } finally {
      setSavingClip(false);
    }
  };

  const handleCopyBookmarklet = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletCode);
      setCopiedBookmarklet(true);
      toast.success(t('jobsFeed.bookmarkletCopied'));
      setTimeout(() => setCopiedBookmarklet(false), 2000);
    } catch {
      toast.error('Clipboard permission denied.');
    }
  };

  const handleSaveSources = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSources(true);
    try {
      const updated = await updateJobSources({
        ...(searchApiKeyInput.trim() ? { searchapi_api_key: searchApiKeyInput.trim() } : {}),
        ...(serpApiKeyInput.trim() ? { serpapi_api_key: serpApiKeyInput.trim() } : {}),
        ...(rapidApiKeyInput.trim() ? { rapidapi_key: rapidApiKeyInput.trim() } : {}),
        ...(apifyTokenInput.trim() ? { apify_api_token: apifyTokenInput.trim() } : {}),
        apify_default_actor: apifyActorInput.trim() || DEFAULT_ACTOR_ID,
      });
      setSourcesStatus(updated);
      setSearchApiKeyInput('');
      setSerpApiKeyInput('');
      setRapidApiKeyInput('');
      setApifyTokenInput('');
      setShowSourcesDialog(false);
      toast.success(t('jobsFeed.sourcesSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save keys.');
    } finally {
      setSavingSources(false);
    }
  };

  const handleEstimateSalary = async (item: JobListingItem) => {
    await runSalaryEstimate(item);
  };

  const selectedJob = useMemo(
    () => listings.find((item) => item.listing_id === selectedId) ?? listings[0] ?? null,
    [listings, selectedId]
  );

  const prevSelectedListingIdRef = useRef<string | undefined>(selectedJob?.listing_id);
  useEffect(() => {
    if (prevSelectedListingIdRef.current !== selectedJob?.listing_id) {
      prevSelectedListingIdRef.current = selectedJob?.listing_id;
      setSalaryEstimates(null);
    }
  }, [selectedJob?.listing_id, setSalaryEstimates]);

  const handleEvaluateJob = async (item: JobListingItem) => {
    await runJobEvaluate(item);
  };

  const redFlagLabel = (flag: string): string => {
    switch (flag) {
      case 'stale_posting':
        return t('jobsFeed.redFlagStale');
      case 'vague_description':
        return t('jobsFeed.redFlagVague');
      case 'scam_or_commission_signal':
        return t('jobsFeed.redFlagScam');
      case 'missing_apply_link':
        return t('jobsFeed.redFlagNoLink');
      default:
        return flag;
    }
  };

  const providerOptions: DropdownOption[] = [
    { id: 'all', label: t('jobsFeed.providerAll') },
    { id: 'searchapi', label: t('jobsFeed.providerSearchApi') },
    { id: 'serpapi', label: t('jobsFeed.providerSerpApi') },
    { id: 'serpapi_google', label: t('jobsFeed.providerSerpGoogle') },
    { id: 'jsearch', label: t('jobsFeed.providerJSearch') },
    { id: 'facebook', label: t('jobsFeed.providerFacebook') },
    { id: 'instagram', label: t('jobsFeed.providerInstagram') },
    { id: 'portals', label: t('jobsFeed.providerPortals') },
    { id: 'apify', label: t('jobsFeed.providerApify') },
    { id: 'saved', label: t('jobsFeed.providerSaved') },
  ];

  const freshnessOptions: DropdownOption[] = [
    { id: 'all', label: t('jobsFeed.freshnessAll') },
    { id: '24h', label: t('jobsFeed.freshness24h') },
    { id: '3d', label: t('jobsFeed.freshness3d') },
    { id: '7d', label: t('jobsFeed.freshness7d') },
    { id: '30d', label: t('jobsFeed.freshness30d') },
  ];

  const portalOptions: DropdownOption[] = [
    { id: 'all', label: t('jobsFeed.portalAll') },
    { id: 'jobstreet', label: 'JobStreet' },
    { id: 'glints', label: 'Glints' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'kalibrr', label: 'Kalibrr' },
    { id: 'indeed', label: 'Indeed' },
  ];

  const workTypeOptions: DropdownOption[] = [
    { id: 'all', label: t('jobsFeed.workTypeAll') },
    { id: 'fulltime', label: t('jobsFeed.workTypeFulltime') },
    { id: 'remote', label: t('jobsFeed.workTypeRemote') },
    { id: 'contract', label: t('jobsFeed.workTypeContract') },
    { id: 'parttime', label: t('jobsFeed.workTypeParttime') },
    { id: 'internship', label: t('jobsFeed.workTypeInternship') },
  ];

  const sortOptions: DropdownOption[] = [
    { id: 'newest', label: t('jobsFeed.sortNewest') },
    { id: 'match', label: t('jobsFeed.sortMatch') },
  ];

  return (
    <PageFrame width="wide">
      <PageHeader className="p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <PageHeader.Title className="text-3xl md:text-4xl">
              {t('jobsFeed.title')}
            </PageHeader.Title>
            <PageHeader.Subtitle>{t('jobsFeed.subtitle')}</PageHeader.Subtitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FeatureGuideButton topic="jobsFeed" />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImportDialog(true)}
            >
              <LinkSimple aria-hidden="true" />
              {t('jobsFeed.quickImportBtn')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPortalsDialog(true)}
            >
              <Buildings aria-hidden="true" />
              {t('jobsFeed.portalsBtn')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSourcesDialog(true)}
            >
              <Key aria-hidden="true" />
              {t('jobsFeed.sourcesBtn')}
            </Button>
          </div>
        </div>
      </PageHeader>

      {/* Search & Filter Controls */}
      <div className="border-b border-ink bg-panel p-4 md:p-6 space-y-4">
        {showQuickTips && (
          <Alert tone="info">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-relaxed">
                <strong className="font-mono uppercase mr-2">{t('jobsFeed.quickTipsTitle')}</strong>
                {t('jobsFeed.quickTipsBody')}
              </p>
              <button
                type="button"
                onClick={() => setShowQuickTips(false)}
                className="cursor-pointer font-mono text-xs underline text-primary shrink-0"
              >
                {t('common.close')}
              </button>
            </div>
          </Alert>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch(null);
          }}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-5 space-y-1">
            <Label htmlFor="job-feed-query">{t('common.search')}</Label>
            <Input
              id="job-feed-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('jobsFeed.searchPlaceholder')}
            />
          </div>
          <div className="md:col-span-4 space-y-1">
            <Label htmlFor="job-feed-location">{t('jobsFeed.locationPlaceholder')}</Label>
            <Input
              id="job-feed-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('jobsFeed.locationPlaceholder')}
            />
          </div>
          <div className="md:col-span-3">
            <Button
              type="submit"
              variant="default"
              className="w-full cursor-pointer"
              disabled={isSearching}
            >
              {isSearching ? (
                <>
                  <SpinnerGap className="animate-spin" aria-hidden="true" />
                  {t('jobsFeed.searchingButton')}
                </>
              ) : (
                <>
                  <MagnifyingGlass aria-hidden="true" />
                  {t('jobsFeed.searchButton')}
                </>
              )}
            </Button>
          </div>
        </form>

        {/* Quick Freshness Chips & Advanced Filter Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold uppercase text-steel">
              {t('jobsFeed.freshnessLabel')}:
            </span>
            {freshnessOptions.map((opt) => {
              const active = freshness === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFreshness(opt.id as FreshnessFilter)}
                  className={cn(
                    'cursor-pointer px-3 py-1 font-mono text-xs border transition-colors',
                    active
                      ? 'bg-primary text-white border-ink font-bold'
                      : 'bg-paper text-ink border-ink hover:bg-highlight'
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setBookmarkedOnly((v) => !v)}
              className={cn(
                'cursor-pointer inline-flex items-center gap-1 px-3 py-1 font-mono text-xs border transition-colors',
                bookmarkedOnly
                  ? 'bg-warning text-ink border-ink font-bold'
                  : 'bg-paper text-ink border-ink hover:bg-highlight'
              )}
            >
              <BookmarkSimple weight={bookmarkedOnly ? 'fill' : 'regular'} aria-hidden="true" />
              {t('jobsFeed.bookmarkedOnly')}
            </button>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAdvancedFilters((v) => !v)}
            className="cursor-pointer"
          >
            <Funnel aria-hidden="true" />
            {t('jobsFeed.advancedFilters')}
            {showAdvancedFilters ? (
              <CaretUp aria-hidden="true" />
            ) : (
              <CaretDown aria-hidden="true" />
            )}
          </Button>
        </div>

        {showAdvancedFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end pt-3 border-t border-ink">
            <Dropdown
              label={t('jobsFeed.providerLabel')}
              options={providerOptions}
              value={providerMode}
              onChange={(val) => setProviderMode(val as JobFeedProvider | 'saved')}
            />
            <Dropdown
              label={t('jobsFeed.portalLabel')}
              options={portalOptions}
              value={portal}
              onChange={setPortal}
            />
            <Dropdown
              label={t('jobsFeed.workTypeLabel')}
              options={workTypeOptions}
              value={workType}
              onChange={(val) => setWorkType(val as WorkTypeFilter)}
            />
            <Dropdown
              label={t('jobsFeed.sortLabel')}
              options={sortOptions}
              value={sortBy}
              onChange={(val) => setSortBy(val as SortOrder)}
            />
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleClearCache()}
              className="w-full cursor-pointer"
            >
              <Trash aria-hidden="true" />
              {t('jobsFeed.clearCacheBtn')}
            </Button>
          </div>
        )}

        {error && <Alert tone="error">{error}</Alert>}
      </div>

      {/* Scrollable Split View: Results List + Sticky Job Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 items-start bg-canvas">
        {/* Left List */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-ink flex flex-col">
          <div className="px-4 pt-4 bg-canvas">
            <PanelHeader
              tone="input"
              title={t('jobsFeed.resultsCount', { count: listings.length })}
              className="mb-0"
            >
              {nextPageToken &&
                (providerMode === 'searchapi' ||
                  providerMode === 'serpapi' ||
                  providerMode === 'jsearch') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleSearch(nextPageToken)}
                  disabled={isSearching}
                >
                  {t('jobsFeed.loadMore')}
                </Button>
              )}
            </PanelHeader>
          </div>

          <div className="lg:max-h-[72vh] lg:overflow-y-auto divide-y divide-ink">
            {isLoadingList ? (
              <div className="p-8 flex items-center justify-center gap-2 font-mono text-xs text-steel">
                <SpinnerGap className="animate-spin" aria-hidden="true" />
                {t('common.loading')}
              </div>
            ) : listings.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  variant="framed"
                  title={t('jobsFeed.noResultsTitle')}
                  description={t('jobsFeed.noResultsDesc')}
                />
              </div>
            ) : (
              listings.map((item) => {
                const isSelected = selectedJob?.listing_id === item.listing_id;
                return (
                  <div
                    key={item.listing_id}
                    className={cn(
                      'p-4 cursor-pointer transition-colors',
                      isSelected ? 'bg-highlight' : 'bg-paper hover:bg-panel'
                    )}
                    onClick={() => setSelectedId(item.listing_id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-serif font-bold text-base text-ink leading-snug">
                          {item.title}
                        </h3>
                        <p className="font-mono text-xs text-steel mt-1">
                          {item.company || t('common.unknown')}
                          {item.location ? ` · ${item.location}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleToggleBookmark(item);
                        }}
                        className="p-1 border border-ink bg-paper hover:bg-panel shrink-0"
                        aria-label={t('jobsFeed.bookmark')}
                      >
                        <BookmarkSimple
                          size={16}
                          weight={item.is_bookmarked ? 'fill' : 'regular'}
                          aria-hidden="true"
                        />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3 font-mono text-xs">
                      {item.match_score !== null && (
                        <span className="px-2 py-1 border border-ink bg-paper text-primary font-bold">
                          {t('jobsFeed.matchBadge', { score: item.match_score })}
                        </span>
                      )}
                      {item.posted_at_text && (
                        <span className="px-2 py-1 border border-ink bg-canvas text-ink">
                          {item.posted_at_text}
                        </span>
                      )}
                      {item.via && (
                        <span className="px-2 py-1 border border-ink bg-panel text-steel">
                          {item.via}
                        </span>
                      )}
                      {item.schedule_type && (
                        <span className="px-2 py-1 border border-ink bg-panel text-steel">
                          {item.schedule_type}
                        </span>
                      )}
                      {item.evaluation && (
                        <span className="px-2 py-1 border border-ink bg-paper text-success font-bold">
                          {item.evaluation.overall_score}/5 · {item.evaluation.recommendation}
                        </span>
                      )}
                      {(item.red_flags || []).map((flag) => (
                        <span
                          key={flag}
                          className="px-2 py-1 border border-destructive bg-destructive-tint text-destructive inline-flex items-center gap-1"
                        >
                          <Warning size={12} aria-hidden="true" />
                          {redFlagLabel(flag)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail */}
        <div className="lg:col-span-7 flex flex-col bg-paper lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          {!selectedJob ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center font-mono text-xs text-steel">
              {t('jobsFeed.selectJobPrompt')}
            </div>
          ) : (
            <>
              <div className="border-b border-ink p-6 space-y-4 bg-canvas">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="font-serif text-2xl font-bold text-ink leading-tight">
                      {selectedJob.title}
                    </h2>
                    <p className="font-mono text-xs text-steel">
                      {selectedJob.company || t('common.unknown')}
                      {selectedJob.location ? ` · ${selectedJob.location}` : ''}
                      {selectedJob.via ? ` · ${selectedJob.via}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-2 font-mono text-xs">
                      {selectedJob.match_score !== null && (
                        <span className="px-2 py-1 border border-ink bg-paper text-primary font-bold">
                          {t('jobsFeed.matchBadge', { score: selectedJob.match_score })}
                        </span>
                      )}
                      {selectedJob.posted_at_text && (
                        <span className="px-2 py-1 border border-ink bg-paper text-ink">
                          {selectedJob.posted_at_text}
                        </span>
                      )}
                      {selectedJob.salary_text && (
                        <span className="px-2 py-1 border border-ink bg-paper text-success font-bold">
                          {selectedJob.salary_text}
                        </span>
                      )}
                      {(selectedJob.red_flags || []).map((flag) => (
                        <span
                          key={flag}
                          className="px-2 py-1 border border-destructive bg-destructive-tint text-destructive inline-flex items-center gap-1"
                        >
                          <Warning size={12} aria-hidden="true" />
                          {redFlagLabel(flag)}
                        </span>
                      ))}
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDeleteListing(selectedJob.listing_id)}
                  >
                    <Trash aria-hidden="true" />
                    {t('jobsFeed.deleteListing')}
                  </Button>
                </div>

                {/* Grouped Action Rows */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold uppercase text-steel mr-1">
                      {t('jobsFeed.primaryActionsLabel')}:
                    </span>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleTailorNow(selectedJob)}
                    >
                      <PaperPlaneTilt aria-hidden="true" />
                      {t('jobsFeed.tailorNow')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyActionId === selectedJob.listing_id}
                      onClick={() => void handleAddToQueue(selectedJob)}
                    >
                      <ListNumbers aria-hidden="true" />
                      {t('jobsFeed.addToQueue')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyActionId === selectedJob.listing_id}
                      onClick={() => void handleSaveToTracker(selectedJob)}
                    >
                      <BookmarkSimple aria-hidden="true" />
                      {t('jobsFeed.saveToTracker')}
                    </Button>
                    {selectedJob.apply_url && (
                      <a
                        href={selectedJob.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass({ variant: 'warning', size: 'sm' })}
                      >
                        <ArrowSquareOut aria-hidden="true" />
                        {t('jobsFeed.openApplyLink')}
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold uppercase text-steel mr-1">
                      {t('jobsFeed.smartToolsLabel')}:
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={evaluatingId === selectedJob.listing_id}
                      onClick={() => void handleEvaluateJob(selectedJob)}
                    >
                      <Gauge aria-hidden="true" />
                      {evaluatingId === selectedJob.listing_id
                        ? t('jobsFeed.evaluatingBtn')
                        : t('jobsFeed.evaluateBtn')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={estimatingSalary}
                      onClick={() => void handleEstimateSalary(selectedJob)}
                    >
                      <CurrencyDollar aria-hidden="true" />
                      {estimatingSalary
                        ? t('jobsFeed.estimatingSalary')
                        : t('jobsFeed.estimateSalaryBtn')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowFormDialog(true)}
                    >
                      <ChatText aria-hidden="true" />
                      {t('jobsFeed.formAnswersBtn')}
                    </Button>
                    <FeatureGuideButton topic="jobsFeed" mode="icon" />
                  </div>
                </div>

                {selectedJob.evaluation && (
                  <div className="border border-ink bg-panel p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-mono text-xs font-bold uppercase text-ink">
                        {t('jobsFeed.evalTitle')}
                      </p>
                      <span className="font-mono text-xs font-bold px-2 py-1 border border-ink bg-paper text-primary">
                        {selectedJob.evaluation.overall_score} / 5.0 ·{' '}
                        {selectedJob.evaluation.recommendation}
                      </span>
                    </div>
                    <p className="text-sm text-ink">{selectedJob.evaluation.summary}</p>
                    <div className="flex flex-wrap gap-2 font-mono text-xs">
                      {Object.entries(selectedJob.evaluation.dimensions || {}).map(
                        ([dim, score]) => (
                          <span key={dim} className="px-2 py-1 border border-ink bg-paper text-ink">
                            {dim}: {score}/5
                          </span>
                        )
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="font-mono font-bold uppercase text-success mb-1">
                          {t('jobsFeed.evalStrengths')}
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-ink">
                          {selectedJob.evaluation.strengths.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="font-mono font-bold uppercase text-warning-text mb-1">
                          {t('jobsFeed.evalGaps')}
                        </p>
                        <ul className="list-disc pl-4 space-y-1 text-ink">
                          {selectedJob.evaluation.gaps.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {salaryEstimates !== null && (
                  <div className="border border-ink bg-panel p-3 space-y-2">
                    <p className="font-mono text-xs font-bold uppercase text-ink">
                      {t('jobsFeed.salaryEstimateTitle')}
                    </p>
                    {salaryEstimates.length === 0 ? (
                      <p className="font-mono text-xs text-steel">
                        {t('jobsFeed.salaryEstimateEmpty')}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-3 font-mono text-xs text-ink">
                        {salaryEstimates.slice(0, 3).map((est, idx) => (
                          <div key={`${est.publisher_name}-${idx}`} className="border border-ink bg-paper px-3 py-2">
                            <span className="font-bold">{est.publisher_name || est.location}: </span>
                            <span>
                              {est.salary_currency} {est.min_salary ?? '-'} – {est.max_salary ?? '-'}{' '}
                              {est.salary_period ? `(${est.salary_period})` : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6 space-y-4">
                {selectedJob.apply_links.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedJob.apply_links.map((lnk, idx) =>
                      lnk.link ? (
                        <a
                          key={`${lnk.link}-${idx}`}
                          href={lnk.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs px-2 py-1 border border-ink bg-panel hover:bg-highlight inline-flex items-center gap-1"
                        >
                          <ArrowSquareOut size={12} aria-hidden="true" />
                          {lnk.title || 'Apply'}
                        </a>
                      ) : null
                    )}
                  </div>
                )}
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {selectedJob.description}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Quick Import & 1-Click Bookmarklet Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('jobsFeed.importModalTitle')}</DialogTitle>
            <DialogDescription>{t('jobsFeed.bookmarkletDesc')}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-6">
            {importError && <Alert tone="error">{importError}</Alert>}

            {/* 1. Bookmarklet */}
            <div className="border border-ink bg-panel p-4 space-y-3">
              <h3 className="font-mono text-xs font-bold uppercase text-ink">
                {t('jobsFeed.bookmarkletTitle')}
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  ref={bookmarkletAnchorRef}
                  href="#bookmarklet"
                  onClick={(e) => {
                    e.preventDefault();
                    void handleCopyBookmarklet();
                  }}
                  className={buttonClass({ variant: 'default', size: 'sm' })}
                >
                  <BookmarkSimple aria-hidden="true" />
                  {t('jobsFeed.bookmarkletButtonLabel')}
                </a>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCopyBookmarklet()}
                >
                  {copiedBookmarklet ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                  {t('jobsFeed.copyBookmarklet')}
                </Button>
              </div>
            </div>

            {/* 2. URL Import */}
            <form onSubmit={(e) => void handleImportUrl(e)} className="space-y-2">
              <Label htmlFor="import-job-url">{t('jobsFeed.importUrlLabel')}</Label>
              <div className="flex gap-2">
                <Input
                  id="import-job-url"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  placeholder={t('jobsFeed.importUrlPlaceholder')}
                />
                <Button type="submit" variant="default" disabled={importingUrl}>
                  {importingUrl ? t('jobsFeed.importingUrl') : t('jobsFeed.importUrlBtn')}
                </Button>
              </div>
            </form>

            {/* 3. Manual Clip Paste */}
            <form onSubmit={(e) => void handleSaveManualClip(e)} className="space-y-3 pt-2 border-t border-ink">
              <h3 className="font-mono text-xs font-bold uppercase text-ink">
                {t('jobsFeed.manualClipTitle')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="clip-title">{t('jobsFeed.clipTitle')}</Label>
                  <Input
                    id="clip-title"
                    value={clipTitle}
                    onChange={(e) => setClipTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="clip-company">{t('jobsFeed.clipCompany')}</Label>
                  <Input
                    id="clip-company"
                    value={clipCompany}
                    onChange={(e) => setClipCompany(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="clip-location">{t('jobsFeed.clipLocation')}</Label>
                  <Input
                    id="clip-location"
                    value={clipLocation}
                    onChange={(e) => setClipLocation(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="clip-url">{t('jobsFeed.clipUrl')}</Label>
                  <Input
                    id="clip-url"
                    value={clipUrl}
                    onChange={(e) => setClipUrl(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="clip-desc">{t('jobsFeed.clipDescription')}</Label>
                <Textarea
                  id="clip-desc"
                  rows={4}
                  value={clipDescription}
                  onChange={(e) => setClipDescription(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="outline" disabled={savingClip}>
                {t('jobsFeed.clipSaveBtn')}
              </Button>
            </form>
          </DialogBody>
        </DialogContent>
      </Dialog>

      {/* API Sources Settings Dialog */}
      <Dialog open={showSourcesDialog} onOpenChange={setShowSourcesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('jobsFeed.sourcesModalTitle')}</DialogTitle>
            <DialogDescription>{t('jobsFeed.sourcesModalDesc')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSaveSources(e)}>
            <DialogBody className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="src-searchapi">{t('jobsFeed.searchApiKeyLabel')}</Label>
                  <span className="font-mono text-xs text-steel">
                    {sourcesStatus?.searchapi_configured
                      ? `${t('jobsFeed.configuredBadge')} (${sourcesStatus.searchapi_key_masked})`
                      : t('jobsFeed.notConfiguredBadge')}
                  </span>
                </div>
                <Input
                  id="src-searchapi"
                  type="password"
                  value={searchApiKeyInput}
                  onChange={(e) => setSearchApiKeyInput(e.target.value)}
                  placeholder="Leave blank to keep existing key"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="src-serpapi">{t('jobsFeed.serpApiKeyLabel')}</Label>
                  <span className="font-mono text-xs text-steel">
                    {sourcesStatus?.serpapi_configured
                      ? `${t('jobsFeed.configuredBadge')} (${sourcesStatus.serpapi_key_masked})`
                      : t('jobsFeed.notConfiguredBadge')}
                  </span>
                </div>
                <Input
                  id="src-serpapi"
                  type="password"
                  value={serpApiKeyInput}
                  onChange={(e) => setSerpApiKeyInput(e.target.value)}
                  placeholder="Leave blank to keep existing key"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="src-rapidapi">{t('jobsFeed.rapidApiKeyLabel')}</Label>
                  <span className="font-mono text-xs text-steel">
                    {sourcesStatus?.rapidapi_configured
                      ? `${t('jobsFeed.configuredBadge')} (${sourcesStatus.rapidapi_key_masked})`
                      : t('jobsFeed.notConfiguredBadge')}
                  </span>
                </div>
                <Input
                  id="src-rapidapi"
                  type="password"
                  value={rapidApiKeyInput}
                  onChange={(e) => setRapidApiKeyInput(e.target.value)}
                  placeholder="Leave blank to keep existing key"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="src-apify">{t('jobsFeed.apifyTokenLabel')}</Label>
                  <span className="font-mono text-xs text-steel">
                    {sourcesStatus?.apify_configured
                      ? `${t('jobsFeed.configuredBadge')} (${sourcesStatus.apify_token_masked})`
                      : t('jobsFeed.notConfiguredBadge')}
                  </span>
                </div>
                <Input
                  id="src-apify"
                  type="password"
                  value={apifyTokenInput}
                  onChange={(e) => setApifyTokenInput(e.target.value)}
                  placeholder="Leave blank to keep existing token"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="src-apify-actor">{t('jobsFeed.apifyActorLabel')}</Label>
                <Input
                  id="src-apify-actor"
                  value={apifyActorInput}
                  onChange={(e) => setApifyActorInput(e.target.value)}
                  placeholder={DEFAULT_ACTOR_ID}
                />
              </div>
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowSourcesDialog(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="default" disabled={savingSources}>
                {savingSources ? t('common.saving') : t('jobsFeed.saveSourcesBtn')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <PortalsBlacklistDialog
        open={showPortalsDialog}
        onOpenChange={setShowPortalsDialog}
        config={portalsConfig}
        onSaved={(next) => {
          setPortalsConfig(next);
          void loadFeed();
        }}
      />

      <FormAnswersDialog
        open={showFormDialog}
        onOpenChange={setShowFormDialog}
        job={selectedJob}
      />
    </PageFrame>
  );
}
