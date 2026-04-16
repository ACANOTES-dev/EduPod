'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

interface KpiTileProps {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  subtitle?: string;
  isLoading: boolean;
  accent: string;
  href?: string;
}

export function KpiTile({
  icon: Icon,
  label,
  value,
  subtitle,
  isLoading,
  accent,
  href,
}: KpiTileProps) {
  const cls =
    'group flex min-w-0 flex-col gap-1 rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all hover:border-border-strong hover:shadow-md';
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
      </div>
      {isLoading || value === undefined ? (
        <div className="mt-1 h-8 w-14 animate-pulse rounded bg-border/60" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="text-[28px] font-bold leading-tight tracking-tight text-text-primary">
            {value}
          </span>
          {subtitle && <span className="text-sm text-text-tertiary">{subtitle}</span>}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return <div className={cls}>{inner}</div>;
}

// ─── Utilisation Badge ────────────────────────────────────────────────────────

export function UtilisationBadge({ pct }: { pct: number }) {
  const color =
    pct >= 100
      ? 'bg-danger-100 text-danger-700'
      : pct >= 85
        ? 'bg-warning-100 text-warning-700'
        : 'bg-success-100 text-success-700';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>
      {pct}%
    </span>
  );
}

// ─── Card Skeleton ────────────────────────────────────────────────────────────

export function CardSkeleton() {
  return (
    <div className="flex min-w-0 flex-col gap-5 rounded-3xl border border-border bg-surface p-6">
      <div className="h-12 w-12 animate-pulse rounded-2xl bg-border/60" />
      <div className="space-y-2">
        <div className="h-5 w-1/3 animate-pulse rounded bg-border/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-border/60" />
      </div>
    </div>
  );
}
