'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, BookOpen, Info, Question } from '@phosphor-icons/react';
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
import { useTranslations } from '@/lib/i18n';
import { getMessages } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

export type GuideTopicId =
  | 'dashboard'
  | 'jobsFeed'
  | 'tailor'
  | 'queue'
  | 'builder'
  | 'tracker'
  | 'settings';

const TOPIC_ROUTES: Record<GuideTopicId, string> = {
  dashboard: '/dashboard',
  jobsFeed: '/jobs-feed',
  tailor: '/tailor',
  queue: '/queue',
  builder: '/builder',
  tracker: '/tracker',
  settings: '/settings',
};

const TOPIC_ORDER: GuideTopicId[] = [
  'dashboard',
  'jobsFeed',
  'tailor',
  'queue',
  'builder',
  'tracker',
  'settings',
];

export function detectGuideTopic(pathname: string | null): GuideTopicId {
  if (!pathname) return 'dashboard';
  if (pathname.startsWith('/jobs-feed')) return 'jobsFeed';
  if (pathname.startsWith('/tailor')) return 'tailor';
  if (pathname.startsWith('/queue')) return 'queue';
  if (pathname.startsWith('/builder') || pathname.startsWith('/resumes')) return 'builder';
  if (pathname.startsWith('/tracker')) return 'tracker';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'dashboard';
}

export function FeatureGuideButton({
  topic,
  mode = 'button',
  size = 'sm',
  variant = 'warning',
  label,
  className,
}: {
  topic?: GuideTopicId;
  mode?: 'button' | 'icon';
  size?: 'sm' | 'default' | 'icon-sm';
  variant?: 'warning' | 'outline' | 'ghost' | 'default';
  label?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const { locale } = useTranslations();
  const messages = getMessages(locale);
  const guide = messages.guide;

  const detectedTopic = topic ?? detectGuideTopic(pathname);
  const [open, setOpen] = useState(false);
  const [activeTopic, setActiveTopic] = useState<GuideTopicId>(detectedTopic);

  useEffect(() => {
    if (open) {
      setActiveTopic(topic ?? detectGuideTopic(pathname));
    }
  }, [open, topic, pathname]);

  const activeContent = guide.topics[activeTopic];
  const buttonText = label ?? guide.buttonLabel;

  return (
    <>
      {mode === 'icon' ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          title={buttonText}
          aria-label={buttonText}
          className={cn('cursor-pointer', className)}
        >
          <Question size={16} weight="bold" aria-hidden="true" />
        </Button>
      ) : (
        <Button
          type="button"
          variant={variant}
          size={size}
          onClick={() => setOpen(true)}
          className={cn('cursor-pointer', className)}
        >
          <Question size={16} weight="bold" aria-hidden="true" />
          {buttonText}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen size={24} aria-hidden="true" />
              {guide.modalTitle}
            </DialogTitle>
            <DialogDescription>{guide.modalSubtitle}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Topic selector */}
              <div className="md:col-span-4 flex flex-col gap-1 border border-ink bg-panel p-2">
                {TOPIC_ORDER.map((id) => {
                  const isActive = id === activeTopic;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveTopic(id)}
                      className={cn(
                        'w-full cursor-pointer text-left px-3 py-2 font-mono text-xs transition-colors border',
                        isActive
                          ? 'bg-primary text-white border-ink font-bold'
                          : 'bg-paper text-ink border-transparent hover:border-ink hover:bg-highlight'
                      )}
                    >
                      {guide.topics[id].tab}
                    </button>
                  );
                })}
              </div>

              {/* Active guide content */}
              <div className="md:col-span-8 space-y-4 border border-ink bg-paper p-6">
                <div>
                  <h3 className="font-serif text-2xl font-bold text-ink">
                    {activeContent.title}
                  </h3>
                  <p className="mt-2 font-mono text-xs uppercase tracking-wider text-steel">
                    {guide.whatItDoes}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-ink">
                    {activeContent.summary}
                  </p>
                </div>

                <div className="border-t border-ink pt-4">
                  <p className="font-mono text-xs font-bold uppercase tracking-wider text-ink mb-3">
                    {guide.howToUse}
                  </p>
                  <ol className="space-y-2">
                    {activeContent.steps.map((step, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm text-ink">
                        <span className="shrink-0 w-6 h-6 border border-ink bg-panel font-mono text-xs font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <Alert tone="info" title={guide.tipsTitle}>
                  <div className="flex items-start gap-2">
                    <Info size={16} className="shrink-0 mt-1" aria-hidden="true" />
                    <span>{activeContent.tip}</span>
                  </div>
                </Alert>
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Link
              href={TOPIC_ROUTES[activeTopic]}
              onClick={() => setOpen(false)}
              className={buttonClass({ variant: 'outline', size: 'sm' })}
            >
              {guide.openPage}
              <ArrowRight aria-hidden="true" />
            </Link>
            <Button type="button" variant="default" size="sm" onClick={() => setOpen(false)}>
              {messages.common.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
