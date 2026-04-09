'use client';

import { AlertCircle, MessageSquare, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { TeacherRequestScope, TeacherRequestStatus, TeacherRequestType } from '@school/shared';
import { Badge, Button, EmptyState, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeacherRequestRow {
  id: string;
  requested_by_user_id: string;
  request_type: TeacherRequestType;
  academic_period_id: string;
  target_scope_json: TeacherRequestScope | null;
  reason: string;
  status: TeacherRequestStatus;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  resulting_window_id: string | null;
  resulting_run_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ListResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface UserSummary {
  id: string;
  email?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

type AdminTab = 'pending' | 'all' | 'mine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadgeVariant(
  status: TeacherRequestStatus,
): 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'approved':
      return 'info';
    case 'completed':
      return 'success';
    case 'rejected':
      return 'danger';
    case 'cancelled':
      return 'secondary';
    default:
      return 'secondary';
  }
}

function displayUserName(user: UserSummary | undefined, fallbackId: string): string {
  if (!user) return `#${fallbackId.slice(0, 8)}`;
  const combinedName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return user.name ?? combinedName ?? user.email ?? `#${fallbackId.slice(0, 8)}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardRequestsPage() {
  const t = useTranslations('reportCards.requests');
  const tStatus = useTranslations('reportCards.requests.status');
  const router = useRouter();
  const locale = useLocale();
  const { hasAnyRole } = useRoleCheck();
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'admin', 'school_vice_principal');

  const [activeTab, setActiveTab] = React.useState<AdminTab>('pending');
  const [rows, setRows] = React.useState<TeacherRequestRow[]>([]);
  const [periods, setPeriods] = React.useState<Record<string, AcademicPeriod>>({});
  const [users, setUsers] = React.useState<Record<string, UserSummary>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const bumpRefresh = React.useCallback((): void => {
    setRefreshToken((n) => n + 1);
  }, []);

  // ─── Data load ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        // Build query: teachers always see "my" implicitly; admins choose tab
        const params = new URLSearchParams();
        if (isAdmin) {
          if (activeTab === 'pending') {
            params.set('status', 'pending');
          } else if (activeTab === 'mine') {
            params.set('my', 'true');
          }
          // 'all' -> no extra filter
        }
        params.set('pageSize', '100');

        const requestsRes = await apiClient<ListResponse<TeacherRequestRow>>(
          `/api/v1/report-card-teacher-requests?${params.toString()}`,
        );
        if (cancelled) return;

        const requestRows = requestsRes.data ?? [];
        setRows(requestRows);

        // Collect unique period ids and user ids to resolve names
        const periodIds = new Set<string>();
        const userIds = new Set<string>();
        for (const row of requestRows) {
          periodIds.add(row.academic_period_id);
          userIds.add(row.requested_by_user_id);
        }

        // Fetch periods (paginated list — simplest is to fetch all)
        const periodsRes = await apiClient<ListResponse<AcademicPeriod>>(
          '/api/v1/academic-periods?pageSize=100',
        );
        if (cancelled) return;

        const periodMap: Record<string, AcademicPeriod> = {};
        for (const p of periodsRes.data ?? []) {
          periodMap[p.id] = p;
        }
        setPeriods(periodMap);

        // Fetch user summaries — best-effort individual lookups. Failures are
        // tolerated and rows fall back to a truncated id. The endpoint is
        // admin-only so non-admin teachers will silently skip this block.
        if (userIds.size > 0 && isAdmin) {
          const lookups = await Promise.allSettled(
            Array.from(userIds).map((uid) =>
              apiClient<UserSummary>(`/api/v1/users/${uid}`, { silent: true }),
            ),
          );
          if (cancelled) return;
          const userMap: Record<string, UserSummary> = {};
          for (const result of lookups) {
            if (result.status === 'fulfilled' && result.value.id) {
              userMap[result.value.id] = result.value;
            }
          }
          setUsers(userMap);
        }
      } catch (err) {
        console.error('[ReportCardRequestsPage]', err);
        if (!cancelled) {
          setLoadFailed(true);
          setRows([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, activeTab, refreshToken]);

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleCancel = async (id: string): Promise<void> => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm(t('cancelConfirm'));
      if (!confirmed) return;
    }
    try {
      await apiClient(`/api/v1/report-card-teacher-requests/${id}/cancel`, { method: 'PATCH' });
      toast.success(t('cancelSuccess'));
      bumpRefresh();
    } catch (err) {
      console.error('[ReportCardRequestsPage.cancel]', err);
      toast.error(t('cancelFailure'));
    }
  };

  // ─── Render helpers ─────────────────────────────────────────────────────

  const periodName = (id: string): string => periods[id]?.name ?? id;

  const scopeSummary = (row: TeacherRequestRow): string => {
    if (row.request_type === 'open_comment_window') return t('scopeNone');
    const scope = row.target_scope_json;
    if (!scope || !scope.ids?.length) return t('scopeNone');
    const label =
      scope.scope === 'year_group'
        ? t('scopeYearGroup')
        : scope.scope === 'class'
          ? t('scopeClass')
          : t('scopeStudent');
    return `${label}: ${t('scopeCount', { count: scope.ids.length })}`;
  };

  const typeLabel = (type: TeacherRequestType): string =>
    type === 'open_comment_window' ? t('typeWindow') : t('typeRegenerate');

  const pendingCount = React.useMemo(
    () => (activeTab === 'pending' ? rows.length : 0),
    [activeTab, rows],
  );

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button
            type="button"
            onClick={() => router.push(`/${locale}/report-cards/requests/new`)}
            className="min-h-11"
          >
            <Plus className="me-2 h-4 w-4" aria-hidden="true" />
            {t('newRequest')}
          </Button>
        }
      />

      {/* Admin tabs */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
          {(['pending', 'all', 'mine'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-border bg-surface text-text-secondary hover:border-border/80'
              }`}
            >
              {tab === 'pending' && t('tabPending')}
              {tab === 'all' && t('tabAll')}
              {tab === 'mine' && t('tabMine')}
              {tab === 'pending' && pendingCount > 0 && (
                <span className="ms-2 inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      )}

      {/* Load failed */}
      {!isLoading && loadFailed && <EmptyState icon={AlertCircle} title={t('loadFailed')} />}

      {/* Empty state */}
      {!isLoading && !loadFailed && rows.length === 0 && (
        <EmptyState
          icon={MessageSquare}
          title={isAdmin && activeTab === 'pending' ? t('emptyPending') : t('empty')}
        />
      )}

      {/* Table */}
      {!isLoading && !loadFailed && rows.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-secondary">
              <tr>
                {isAdmin && (
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    {t('colRequester')}
                  </th>
                )}
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t('colType')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t('colPeriod')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t('colScope')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t('colReason')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t('colStatus')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t('colRequestedAt')}
                </th>
                <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  {t('colActions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const isOwnPending = row.status === 'pending';
                return (
                  <tr key={row.id} className="hover:bg-surface-secondary/40">
                    {isAdmin && (
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-text-primary">
                        {displayUserName(users[row.requested_by_user_id], row.requested_by_user_id)}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-text-primary">
                      {typeLabel(row.request_type)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-text-secondary">
                      {periodName(row.academic_period_id)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-text-secondary">
                      {scopeSummary(row)}
                    </td>
                    <td
                      className="max-w-xs truncate px-4 py-3 text-sm text-text-secondary"
                      title={row.reason}
                    >
                      {row.reason}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Badge variant={statusBadgeVariant(row.status)}>{tStatus(row.status)}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-text-tertiary tabular-nums">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-end text-sm">
                      <div className="flex items-center justify-end gap-2">
                        {isAdmin && row.status === 'pending' && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            onClick={() =>
                              router.push(`/${locale}/report-cards/requests/${row.id}`)
                            }
                          >
                            {t('review')}
                          </Button>
                        )}
                        {!isAdmin && isOwnPending && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-11"
                            onClick={() => void handleCancel(row.id)}
                          >
                            {t('cancel')}
                          </Button>
                        )}
                        {(!isAdmin || row.status !== 'pending') && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            onClick={() =>
                              router.push(`/${locale}/report-cards/requests/${row.id}`)
                            }
                          >
                            {t('review')}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
