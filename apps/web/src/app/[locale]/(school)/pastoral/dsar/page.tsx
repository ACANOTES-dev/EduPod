'use client';

import { ArrowRight, FileSearch, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import { getLocaleFromPathname, type PastoralApiListResponse } from '@/lib/pastoral';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DsarReviewRow {
  id: string;
  compliance_request_id: string;
  entity_type: string;
  entity_id: string;
  tier: number;
  decision: 'include' | 'redact' | 'exclude' | null;
  legal_basis: string | null;
  justification: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DsarStatsResponse {
  total: number;
  pending: number;
  included: number;
  redacted: number;
  excluded: number;
  open_requests: number;
}

interface ComplianceRequestGroup {
  compliance_request_id: string;
  total: number;
  pending: number;
  oldest_created_at: string;
  entity_types: Record<string, number>;
}

function groupByRequest(rows: DsarReviewRow[]): ComplianceRequestGroup[] {
  const groups = new Map<string, ComplianceRequestGroup>();

  for (const row of rows) {
    const existing = groups.get(row.compliance_request_id);
    if (existing) {
      existing.total += 1;
      if (row.decision === null) existing.pending += 1;
      existing.entity_types[row.entity_type] = (existing.entity_types[row.entity_type] ?? 0) + 1;
      if (row.created_at < existing.oldest_created_at) {
        existing.oldest_created_at = row.created_at;
      }
    } else {
      groups.set(row.compliance_request_id, {
        compliance_request_id: row.compliance_request_id,
        total: 1,
        pending: row.decision === null ? 1 : 0,
        oldest_created_at: row.created_at,
        entity_types: { [row.entity_type]: 1 },
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.pending - a.pending || a.oldest_created_at.localeCompare(b.oldest_created_at),
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PastoralDsarQueuePage() {
  const t = useTranslations('dsarReview');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);

  const [groups, setGroups] = React.useState<ComplianceRequestGroup[]>([]);
  const [stats, setStats] = React.useState<DsarStatsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [onlyPending, setOnlyPending] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    setIsLoading(true);

    const params = new URLSearchParams({
      page: '1',
      pageSize: '100',
      sort: 'created_at',
      order: 'desc',
    });
    if (onlyPending) params.set('pending_only', 'true');

    void Promise.allSettled([
      apiClient<PastoralApiListResponse<DsarReviewRow>>(
        `/api/v1/pastoral/dsar-reviews?${params.toString()}`,
        { silent: true },
      ),
      apiClient<{ data: DsarStatsResponse } | DsarStatsResponse>(
        '/api/v1/pastoral/dsar-reviews/stats',
        { silent: true },
      ),
    ])
      .then(([listResult, statsResult]) => {
        if (cancelled) return;

        if (listResult.status === 'fulfilled') {
          setGroups(groupByRequest(listResult.value.data ?? []));
        } else {
          console.error('[PastoralDsarQueuePage]', listResult.reason);
          setGroups([]);
        }

        if (statsResult.status === 'fulfilled') {
          const body = statsResult.value as { data?: DsarStatsResponse } & DsarStatsResponse;
          setStats(body.data ?? (body as DsarStatsResponse));
        } else {
          console.error('[PastoralDsarQueuePage.stats]', statsResult.reason);
          setStats(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [onlyPending]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('queueTitle')}
        description={t('queueDescription')}
        actions={
          <Button
            variant={onlyPending ? 'default' : 'outline'}
            onClick={() => setOnlyPending((current) => !current)}
          >
            <FileSearch className="me-2 h-4 w-4" />
            {onlyPending ? t('showingPendingOnly') : t('showingAll')}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard
          label={t('stats.pending')}
          value={stats?.pending ?? 0}
          className="border-amber-200 bg-amber-50/70"
        />
        <StatCard
          label={t('stats.included')}
          value={stats?.included ?? 0}
          className="border-emerald-200 bg-emerald-50/70"
        />
        <StatCard
          label={t('stats.redacted')}
          value={stats?.redacted ?? 0}
          className="border-sky-200 bg-sky-50/70"
        />
        <StatCard
          label={t('stats.excluded')}
          value={stats?.excluded ?? 0}
          className="border-rose-200 bg-rose-50/70"
        />
        <StatCard
          label={t('stats.openRequests')}
          value={stats?.open_requests ?? 0}
          className="border-slate-200 bg-slate-50/70"
        />
      </div>

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-700" />
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('groupsTitle')}</h2>
            <p className="text-sm text-text-secondary">{t('groupsDescription')}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-surface-secondary" />
            ))
          ) : groups.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-text-tertiary">
              {t('empty')}
            </p>
          ) : (
            groups.map((group) => (
              <Link
                key={group.compliance_request_id}
                href={`/${locale}/pastoral/dsar/${group.compliance_request_id}`}
                className="block rounded-2xl border border-border px-4 py-4 transition-colors hover:bg-surface-secondary"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-text-tertiary">
                        {t('requestRef', {
                          id: group.compliance_request_id.slice(0, 8).toUpperCase(),
                        })}
                      </span>
                      {group.pending > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {t('pendingBadge', { count: group.pending })}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          {t('completeBadge')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-text-primary">
                      {t('itemsCount', { count: group.total })}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {Object.entries(group.entity_types)
                        .map(([type, count]) => t('entityTypeCount', { type, count }))
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-end text-xs text-text-tertiary">
                      <p>{t('oldestItem')}</p>
                      <p className="text-sm text-text-secondary">
                        {formatDateTime(group.oldest_created_at)}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      {t('review')}
                      <ArrowRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                    </Button>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
