'use client';

import {
  AlertCircle,
  Bell,
  CheckCircle,
  Minus,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChildSummary {
  student_id: string;
  student_name: string;
  year_group: string | null;
  total_points: number;
  positive_count: number;
  negative_count: number;
  pending_acknowledgements: number;
}

interface SummaryResponse {
  children: ChildSummary[];
}

interface ParentIncident {
  id: string;
  occurred_at: string;
  incident_description: string;
  category_name: string | null;
  polarity: string;
  status: string;
  requires_acknowledgement: boolean;
  acknowledged_at: string | null;
}

interface ParentSanction {
  id: string;
  type: string;
  scheduled_date: string;
  status: string;
  notes: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SANCTION_TYPE_LABELS: Record<string, string> = {
  detention: 'Detention',
  suspension_internal: 'Internal Suspension',
  suspension_external: 'External Suspension',
  expulsion: 'Expulsion',
  community_service: 'Community Service',
  loss_of_privilege: 'Loss of Privilege',
  restorative_meeting: 'Restorative Meeting',
  other: 'Other',
};

const SANCTION_STATUS_CLASSES: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  served: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
  pending_approval: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentBehaviourPortalPage() {
  const t = useTranslations('behaviour.parentPortal');
  const [summary, setSummary] = React.useState<ChildSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeChildId, setActiveChildId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    apiClient<SummaryResponse>('/api/v1/parent/behaviour/summary')
      .then((res) => {
        const children = res.children ?? [];
        setSummary(children);
        if (children.length > 0 && children[0]) {
          setActiveChildId(children[0].student_id);
        }
      })
      .catch(() => setSummary([]))
      .finally(() => setLoading(false));
  }, []);

  const activeChild = summary.find((c) => c.student_id === activeChildId) ?? null;

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  if (summary.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">{t('noChildren')}</p>
          <p className="mt-1 text-xs text-text-tertiary">{t('contactSchool')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Behaviour Portal"
        description="Stay informed about your child's behaviour"
      />

      {/* Child tab selector */}
      {summary.length > 1 && (
        <div className="overflow-x-auto">
          <div className="flex gap-1 border-b border-border">
            {summary.map((child) => (
              <button
                key={child.student_id}
                type="button"
                onClick={() => setActiveChildId(child.student_id)}
                className={`relative shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeChildId === child.student_id
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-text-tertiary hover:text-text-primary'
                }`}
              >
                {child.student_name}
                {child.pending_acknowledgements > 0 && (
                  <span className="ms-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {child.pending_acknowledgements}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active child panel */}
      {activeChild && <ChildPanel child={activeChild} />}
    </div>
  );
}

// ─── Child Panel ──────────────────────────────────────────────────────────────

function ChildPanel({ child }: { child: ChildSummary }) {
  const t = useTranslations('behaviour.parentPortal');
  const [incidents, setIncidents] = React.useState<ParentIncident[]>([]);
  const [sanctions, setSanctions] = React.useState<ParentSanction[]>([]);
  const [loadingIncidents, setLoadingIncidents] = React.useState(true);
  const [loadingSanctions, setLoadingSanctions] = React.useState(true);
  const [acknowledging, setAcknowledging] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoadingIncidents(true);
    setLoadingSanctions(true);
    try {
      const [incRes, sanRes] = await Promise.all([
        apiClient<{ data: ParentIncident[] }>(
          `/api/v1/parent/behaviour/incidents?student_id=${child.student_id}&pageSize=20`,
        ),
        apiClient<{ data: ParentSanction[] }>(
          `/api/v1/parent/behaviour/sanctions?student_id=${child.student_id}&pageSize=20`,
        ),
      ]);
      setIncidents(incRes.data ?? []);
      setSanctions(sanRes.data ?? []);
    } catch (err) {
      console.error('[fetchData]', err);
      setIncidents([]);
      setSanctions([]);
    } finally {
      setLoadingIncidents(false);
      setLoadingSanctions(false);
    }
  }, [child.student_id]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleAcknowledge = async (incidentId: string) => {
    setAcknowledging(incidentId);
    try {
      await apiClient(`/api/v1/parent/behaviour/acknowledge/${incidentId}`, {
        method: 'POST',
      });
      setIncidents((prev) =>
        prev.map((inc) =>
          inc.id === incidentId
            ? { ...inc, acknowledged_at: new Date().toISOString(), requires_acknowledgement: false }
            : inc,
        ),
      );
    } catch (err) {
      console.error('[handleAcknowledge]', err);
    } finally {
      setAcknowledging(null);
    }
  };

  const netPoints = child.positive_count - child.negative_count;

  const upcomingSanctions = sanctions.filter((s) => s.status === 'scheduled');
  const recentSanctions = sanctions.filter((s) => s.status !== 'scheduled').slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Summary card */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-text-primary">{child.student_name}</p>
            {child.year_group && <p className="text-xs text-text-tertiary">{child.year_group}</p>}
          </div>
          {child.pending_acknowledgements > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 dark:bg-amber-900/20">
              <Bell className="h-3.5 w-3.5 text-amber-600" />
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {child.pending_acknowledgements} pending
                {child.pending_acknowledgements === 1 ? ' acknowledgement' : ' acknowledgements'}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{child.positive_count}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">{t('positive')}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-red-500">{child.negative_count}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">{t('negative')}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1">
              {netPoints > 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : netPoints < 0 ? (
                <TrendingDown className="h-4 w-4 text-red-500" />
              ) : (
                <Minus className="h-4 w-4 text-text-tertiary" />
              )}
              <p
                className={`text-2xl font-bold ${
                  netPoints > 0
                    ? 'text-green-600'
                    : netPoints < 0
                      ? 'text-red-500'
                      : 'text-text-primary'
                }`}
              >
                {netPoints > 0 ? `+${netPoints}` : netPoints}
              </p>
            </div>
            <p className="mt-0.5 text-xs text-text-tertiary">{t('netPoints')}</p>
          </div>
        </div>
      </div>

      {/* Pending acknowledgements section */}
      {incidents.some((i) => i.requires_acknowledgement && !i.acknowledged_at) && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            {t('awaitingAcknowledgement')}
          </h3>
          <div className="space-y-2">
            {incidents
              .filter((i) => i.requires_acknowledgement && !i.acknowledged_at)
              .map((inc) => (
                <div
                  key={inc.id}
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-900/10"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-text-primary">
                        {inc.incident_description}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {inc.category_name && (
                          <Badge variant="secondary" className="text-xs">
                            {inc.category_name}
                          </Badge>
                        )}
                        <span className="text-xs text-text-tertiary">
                          {formatDate(inc.occurred_at)}
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={acknowledging === inc.id}
                      onClick={() => void handleAcknowledge(inc.id)}
                      className="w-full shrink-0 sm:w-auto"
                    >
                      <CheckCircle className="me-1.5 h-4 w-4" />
                      {acknowledging === inc.id ? t('acknowledging') : t('acknowledge')}
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Recent Incidents */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('recentIncidents')}</h3>
        {loadingIncidents ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface py-8 text-center">
            <p className="text-sm text-text-tertiary">{t('noIncidents')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {incidents.slice(0, 10).map((inc) => (
              <div
                key={inc.id}
                className={`rounded-xl border bg-surface p-4 ${
                  inc.polarity === 'positive'
                    ? 'border-green-200 dark:border-green-800/40'
                    : inc.polarity === 'negative'
                      ? 'border-red-200 dark:border-red-800/40'
                      : 'border-border'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      inc.polarity === 'positive'
                        ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
                        : inc.polarity === 'negative'
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/30'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800'
                    }`}
                  >
                    {inc.polarity === 'positive' ? (
                      <Plus className="h-3 w-3" />
                    ) : inc.polarity === 'negative' ? (
                      <Minus className="h-3 w-3" />
                    ) : (
                      <Minus className="h-3 w-3" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm text-text-primary">{inc.incident_description}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {inc.category_name && (
                        <Badge variant="secondary" className="text-xs">
                          {inc.category_name}
                        </Badge>
                      )}
                      <span className="text-xs text-text-tertiary">
                        {formatDate(inc.occurred_at)}
                      </span>
                      {inc.acknowledged_at && (
                        <span className="flex items-center gap-0.5 text-xs text-green-600">
                          <CheckCircle className="h-3 w-3" />
                          {t('acknowledged')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sanctions */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sanctions')}</h3>
        {loadingSanctions ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : sanctions.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface py-8 text-center">
            <p className="text-sm text-text-tertiary">{t('noSanctions')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingSanctions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('upcoming')}
                </p>
                <div className="space-y-2">
                  {upcomingSanctions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/40 dark:bg-blue-900/10"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {SANCTION_TYPE_LABELS[s.type] ?? s.type}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            SANCTION_STATUS_CLASSES[s.status] ??
                            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          Scheduled
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-tertiary">
                        {formatDate(s.scheduled_date)}
                      </p>
                      {s.notes && <p className="mt-2 text-xs text-text-secondary">{s.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {recentSanctions.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('recent')}
                </p>
                <div className="space-y-2">
                  {recentSanctions.map((s) => (
                    <div key={s.id} className="rounded-xl border border-border bg-surface p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm text-text-primary">
                          {SANCTION_TYPE_LABELS[s.type] ?? s.type}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            SANCTION_STATUS_CLASSES[s.status] ??
                            'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1).replace('_', ' ')}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-text-tertiary">
                        {formatDate(s.scheduled_date)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
