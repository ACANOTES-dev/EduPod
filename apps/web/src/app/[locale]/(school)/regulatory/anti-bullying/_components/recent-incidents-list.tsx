'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { StatusBadge } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecentIncident {
  id: string;
  incident_number: string;
  student_name: string;
  category_name: string;
  occurred_at: string;
  status: string;
}

interface RecentIncidentsListProps {
  incidents: RecentIncident[];
  isLoading: boolean;
}

const OPEN_STATUSES = new Set([
  'draft',
  'active',
  'investigating',
  'under_review',
  'awaiting_approval',
  'awaiting_parent_meeting',
  'escalated',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (status === 'resolved') return 'success';
  if (status === 'escalated') return 'danger';
  if (OPEN_STATUSES.has(status)) return 'warning';
  return 'neutral';
}

function formatDate(raw: string, locale: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale === 'ar' ? 'ar' : 'en-IE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RecentIncidentsList({ incidents, isLoading }: RecentIncidentsListProps) {
  const t = useTranslations('regulatory.antiBullying');
  const locale = useLocale();

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">{t('recentIncidentsTitle')}</h2>
        <Link
          href={`/${locale}/behaviour/incidents`}
          className="text-xs font-medium text-primary-600 hover:text-primary-700"
        >
          {t('viewAll')}
        </Link>
      </div>

      {isLoading ? (
        <ul className="mt-3 divide-y divide-border">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 py-3">
              <div className="h-4 w-24 animate-pulse rounded bg-border/60" />
              <div className="h-4 flex-1 animate-pulse rounded bg-border/60" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-border/60" />
            </li>
          ))}
        </ul>
      ) : incidents.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-surface-secondary p-4 text-center text-sm text-text-tertiary">
          {t('noRecentIncidents')}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <Link
                href={`/${locale}/behaviour/incidents/${incident.id}`}
                className="flex items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-surface-hover"
              >
                <span className="font-mono text-[11px] text-text-tertiary tabular-nums">
                  {incident.incident_number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {incident.student_name}
                  </p>
                  <p className="truncate text-xs text-text-secondary">
                    {incident.category_name} · {formatDate(incident.occurred_at, locale)}
                  </p>
                </div>
                <StatusBadge status={statusVariant(incident.status)} dot>
                  {incident.status.replace(/_/g, ' ')}
                </StatusBadge>
                <ChevronRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
