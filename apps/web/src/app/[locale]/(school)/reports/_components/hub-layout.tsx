'use client';

import { ArrowRight, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuickLink {
  icon: LucideIcon;
  labelKey: string;
  /** Optional description key. Falls back gracefully when missing. */
  descKey?: string;
  href: string;
  color: string;
}

export interface ReportGroupConfig {
  /** Translation key for the group's editorial heading (uppercase eyebrow). */
  headingKey: string;
  /** One-line subtitle that explains who/when this group is for. */
  hintKey: string;
  links: ReadonlyArray<QuickLink>;
}

// ─── Builder hero ─────────────────────────────────────────────────────────────
//
// First-class call-to-action for the two ad-hoc reporting surfaces: the custom
// Report Builder (impl 02 / 16) and Ask AI (impl 11 / 18). Surfaces them
// directly under the KPI grid so principals see "you can build your own"
// before scrolling through the curated report list.
//
// Visual treatment: each card has a subtle radial-gradient halo behind its
// icon and a coloured border accent — distinct from the grouped tiles below
// without breaking the editorial-calm tone of the rest of the dashboard.

interface BuilderHeroTileProps {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  accent: 'cyan' | 'rose';
  /** Optional decorative icon rendered on the far end of the card. */
  decoration?: LucideIcon;
}

const ACCENT_CLASSES = {
  cyan: {
    border: 'border-cyan-200/70 hover:border-cyan-300',
    bg: 'from-cyan-50/60 via-surface to-surface',
    glow: 'bg-cyan-200/40',
    iconBg: 'bg-cyan-100',
    iconText: 'text-cyan-700',
    cta: 'text-cyan-700',
    decoration: 'text-cyan-500',
  },
  rose: {
    border: 'border-rose-200/70 hover:border-rose-300',
    bg: 'from-rose-50/60 via-surface to-surface',
    glow: 'bg-rose-200/40',
    iconBg: 'bg-rose-100',
    iconText: 'text-rose-700',
    cta: 'text-rose-700',
    decoration: 'text-rose-500',
  },
} as const;

export function BuilderHeroTile({
  href,
  icon: Icon,
  title,
  description,
  ctaLabel,
  accent,
  decoration: Decoration,
}: BuilderHeroTileProps) {
  const accentClasses = ACCENT_CLASSES[accent];

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-2xl border ${accentClasses.border} bg-gradient-to-br ${accentClasses.bg} p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface sm:p-6`}
    >
      {/* Decorative glow behind the icon. Uses logical properties so it
          mirrors correctly under RTL. */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-16 -end-16 h-44 w-44 rounded-full ${accentClasses.glow} blur-3xl`}
      />
      {Decoration ? (
        <Decoration
          aria-hidden="true"
          className={`pointer-events-none absolute end-5 top-5 h-5 w-5 ${accentClasses.decoration} opacity-50 transition-opacity group-hover:opacity-100`}
        />
      ) : null}

      <div className="relative flex items-start gap-4">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${accentClasses.iconBg} ${accentClasses.iconText} shadow-sm`}
          aria-hidden="true"
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-text-primary">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary">{description}</p>
          <span
            className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium ${accentClasses.cta} transition-all group-hover:gap-2.5`}
          >
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Report group ─────────────────────────────────────────────────────────────

interface ReportGroupProps {
  headingKey: string;
  hintKey: string;
  links: ReadonlyArray<QuickLink>;
}

export function ReportGroup({ headingKey, hintKey, links }: ReportGroupProps) {
  const t = useTranslations('reports');
  // Sanitise the heading key for use as an HTML id. The translation key
  // itself contains dots which would break aria-labelledby resolution.
  const headingId = `reports-group-${headingKey.replace(/\./g, '-')}`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <header className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <div className="flex items-baseline gap-3">
          <h2
            id={headingId}
            className="text-xs font-semibold uppercase tracking-[0.12em] text-text-secondary"
          >
            {t(headingKey)}
          </h2>
          <p className="hidden text-xs text-text-tertiary sm:block">{t(hintKey)}</p>
        </div>
        <span className="text-xs tabular-nums text-text-tertiary">{links.length}</span>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <QuickLinkTile key={link.href} link={link} />
        ))}
      </div>
    </section>
  );
}

// ─── Quick-link tile ─────────────────────────────────────────────────────────

export function QuickLinkTile({ link }: { link: QuickLink }) {
  const t = useTranslations('reports');
  const label = t(link.labelKey);
  const description = link.descKey ? safeTranslate(t, link.descKey) : null;
  return (
    <Link
      href={link.href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-secondary ${link.color}`}
        aria-hidden="true"
      >
        <link.icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary group-hover:text-primary-700">
          {label}
        </p>
        {description && (
          <p className="mt-0.5 text-xs text-text-tertiary line-clamp-2">{description}</p>
        )}
      </div>
    </Link>
  );
}

/**
 * `useTranslations` returns the key when a translation is missing. Treat that
 * case as "no copy available" so we can suppress the description row instead
 * of showing the raw translation key to users.
 */
function safeTranslate(t: ReturnType<typeof useTranslations>, key: string): string | null {
  if (!key) return null;
  try {
    const value = t(key);
    if (value === key) return null;
    return value;
  } catch {
    return null;
  }
}
