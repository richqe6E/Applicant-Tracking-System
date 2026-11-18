'use client';

import React, { useEffect, useState } from 'react';
import { Copy, Plus, SpinnerGap, Trash } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  draftFormAnswers,
  updatePortalsConfig,
  type CompanyPortalEntry,
  type FormAnswerItem,
  type JobListingItem,
  type PortalKind,
  type PortalsAndBlacklistConfig,
} from '@/lib/api/job-feed';
import { useTranslations } from '@/lib/i18n';

interface PortalsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: PortalsAndBlacklistConfig;
  onSaved: (next: PortalsAndBlacklistConfig) => void;
}

export function PortalsBlacklistDialog({
  open,
  onOpenChange,
  config,
  onSaved,
}: PortalsDialogProps) {
  const { t } = useTranslations();
  const [portals, setPortals] = useState<CompanyPortalEntry[]>(config.portals);
  const [blCompanies, setBlCompanies] = useState(config.blacklist_companies.join(', '));
  const [blKeywords, setBlKeywords] = useState(config.blacklist_keywords.join(', '));
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<PortalKind>('greenhouse');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPortals(config.portals);
    setBlCompanies(config.blacklist_companies.join(', '));
    setBlKeywords(config.blacklist_keywords.join(', '));
  }, [open, config]);

  const kindOptions: DropdownOption[] = [
    { id: 'greenhouse', label: 'Greenhouse (board token)' },
    { id: 'lever', label: 'Lever (company slug)' },
    { id: 'ashby', label: 'Ashby (board name)' },
    { id: 'playwright', label: 'Playwright (Career Page URL)' },
  ];

  const handleAddPortal = () => {
    if (!newName.trim() || !newIdentifier.trim()) return;
    setPortals((prev) => [
      ...prev,
      {
        name: newName.trim(),
        kind: newKind,
        identifier: newIdentifier.trim(),
        enabled: true,
      },
    ]);
    setNewName('');
    setNewIdentifier('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const splitCsv = (val: string) =>
        val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      const saved = await updatePortalsConfig({
        portals,
        blacklist_companies: splitCsv(blCompanies),
        blacklist_keywords: splitCsv(blKeywords),
      });
      onSaved(saved);
      onOpenChange(false);
      toast.success(t('jobsFeed.portalsSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save portals.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('jobsFeed.portalsModalTitle')}</DialogTitle>
          <DialogDescription>{t('jobsFeed.portalsModalDesc')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSave(e)}>
          <DialogBody className="space-y-6">
            <div className="border border-ink bg-panel p-4 space-y-3">
              <h3 className="font-mono text-xs font-bold uppercase text-ink">
                {t('jobsFeed.addPortalTitle')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="space-y-1">
                  <Label htmlFor="portal-name">{t('jobsFeed.portalNameLabel')}</Label>
                  <Input
                    id="portal-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Stripe / Xendit"
                  />
                </div>
                <Dropdown
                  label={t('jobsFeed.portalKindLabel')}
                  options={kindOptions}
                  value={newKind}
                  onChange={(v) => setNewKind(v as PortalKind)}
                />
                <div className="space-y-1">
                  <Label htmlFor="portal-ident">{t('jobsFeed.portalIdentifierLabel')}</Label>
                  <Input
                    id="portal-ident"
                    value={newIdentifier}
                    onChange={(e) => setNewIdentifier(e.target.value)}
                    placeholder={newKind === 'playwright' ? 'https://...' : 'board-slug'}
                  />
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleAddPortal}>
                <Plus aria-hidden="true" />
                {t('jobsFeed.addPortalBtn')}
              </Button>
            </div>

            {portals.length > 0 && (
              <div className="border border-ink divide-y divide-ink bg-paper">
                {portals.map((p, idx) => (
                  <div
                    key={`${p.kind}-${p.identifier}-${idx}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs"
                  >
                    <div className="min-w-0 truncate">
                      <span className="font-bold text-ink">{p.name}</span>
                      <span className="text-steel">
                        {' '}
                        · {p.kind} · {p.identifier}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPortals((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      <Trash aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="bl-companies">{t('jobsFeed.blacklistCompaniesLabel')}</Label>
              <Input
                id="bl-companies"
                value={blCompanies}
                onChange={(e) => setBlCompanies(e.target.value)}
                placeholder="PT Contoh, Agency X"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="bl-keywords">{t('jobsFeed.blacklistKeywordsLabel')}</Label>
              <Input
                id="bl-keywords"
                value={blKeywords}
                onChange={(e) => setBlKeywords(e.target.value)}
                placeholder="MLM, komisi saja, deposit"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="default" disabled={saving}>
              {saving ? t('common.saving') : t('jobsFeed.savePortalsBtn')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FormAnswersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: JobListingItem | null;
}

export function FormAnswersDialog({
  open,
  onOpenChange,
  job,
}: FormAnswersDialogProps) {
  const { t } = useTranslations();
  const [questionsText, setQuestionsText] = useState('');
  const [answers, setAnswers] = useState<FormAnswerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnswers([]);
    setError(null);
  }, [job?.listing_id]);

  const handleDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    setLoading(true);
    setError(null);
    try {
      const lines = questionsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await draftFormAnswers(job.listing_id, lines);
      setAnswers(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to draft answers.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('jobsFeed.formAnswersTitle')}</DialogTitle>
          <DialogDescription>{t('jobsFeed.formAnswersDesc')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <form onSubmit={(e) => void handleDraft(e)} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="form-questions">{t('jobsFeed.formQuestionsLabel')}</Label>
              <Textarea
                id="form-questions"
                rows={4}
                value={questionsText}
                onChange={(e) => setQuestionsText(e.target.value)}
                placeholder="Mengapa Anda melamar posisi ini?"
              />
            </div>
            <Button type="submit" variant="default" disabled={loading || !job}>
              {loading ? (
                <>
                  <SpinnerGap className="animate-spin" aria-hidden="true" />
                  {t('jobsFeed.draftingAnswers')}
                </>
              ) : (
                t('jobsFeed.draftAnswersBtn')
              )}
            </Button>
          </form>

          {answers.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-ink">
              {answers.map((ans, idx) => (
                <div key={idx} className="border border-ink bg-panel p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs font-bold text-ink">{ans.question}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(ans.answer);
                        toast.success(t('common.saved'));
                      }}
                    >
                      <Copy aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="text-sm text-ink whitespace-pre-wrap">{ans.answer}</p>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
