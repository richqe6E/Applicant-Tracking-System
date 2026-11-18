'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  FileText,
  Gear,
  List,
  ListNumbers,
  MagnifyingGlass,
  SpinnerGap,
  SquaresFour,
  X,
} from '@phosphor-icons/react';
import { FeatureGuideButton } from '@/components/common/feature-guide';
import { useBackgroundOps } from '@/lib/context/background-ops-context';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export function AppTopNav() {
  const pathname = usePathname();
  const { t } = useTranslations();
  const { activeTasks } = useBackgroundOps();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { href: '/dashboard', label: t('nav.dashboard'), icon: FileText },
    { href: '/jobs-feed', label: t('nav.jobsFeed'), icon: MagnifyingGlass },
    { href: '/tailor', label: t('nav.tailor'), icon: Briefcase },
    { href: '/queue', label: t('nav.queue'), icon: ListNumbers },
    { href: '/tracker', label: t('nav.applicationTracker'), icon: SquaresFour },
    { href: '/settings', label: t('nav.settings'), icon: Gear },
  ];

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));

  return (
    <nav
      aria-label="Primary navigation"
      className="sticky top-0 z-40 w-full border-b border-ink bg-paper"
    >
      <div className="mx-auto flex max-w-[104rem] items-center justify-between gap-3 px-4 py-2 md:px-8">
        <Link
          href="/dashboard"
          className="flex shrink-0 items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-ink hover:text-primary"
        >
          <Image src="/logo.svg" alt="" width={20} height={20} className="w-5 h-5" />
          <span>Resume Matcher</span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden lg:flex items-center gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1 font-mono text-xs font-medium uppercase tracking-wide border transition-colors whitespace-nowrap',
                  active
                    ? 'bg-primary text-white border-ink font-bold'
                    : 'bg-paper text-ink border-transparent hover:border-ink hover:bg-panel'
                )}
              >
                <Icon size={14} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {activeTasks.map((task) => (
            <Link
              key={task.id}
              href={task.href}
              className="hidden sm:inline-flex items-center gap-2 border border-ink bg-info-tint px-2 py-1 font-mono text-xs font-bold text-primary hover:bg-highlight"
            >
              <SpinnerGap size={14} className="animate-spin" aria-hidden="true" />
              <span>{task.label}</span>
            </Link>
          ))}
          <FeatureGuideButton variant="warning" size="sm" />
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden cursor-pointer border border-ink bg-paper p-2 text-ink hover:bg-panel"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? (
              <X size={16} aria-hidden="true" />
            ) : (
              <List size={16} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-ink bg-canvas px-4 py-3 grid grid-cols-2 gap-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-2 font-mono text-xs uppercase border',
                  active
                    ? 'bg-primary text-white border-ink font-bold'
                    : 'bg-paper text-ink border-ink hover:bg-panel'
                )}
              >
                <Icon size={14} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
