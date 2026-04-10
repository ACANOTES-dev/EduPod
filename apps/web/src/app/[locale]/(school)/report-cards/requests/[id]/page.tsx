'use client';

import { AlertCircle, ArrowLeft, Check, Play, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { TeacherRequestScope, TeacherRequestStatus, TeacherRequestType } from '@school/shared';
import { Badge, Button, EmptyState, toast } from '@school/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import { useAuth } from '@/providers/auth-provider';

import { RejectModal } from '../_components/reject-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserSummary {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
}

interface TeacherRequestRow {
  id: string;
  requested_by_user_id: string;
  request_type: TeacherRequestType;
  // NULL for full-year reopen requests — the backend schema allows null.
  academic_period_id: string | null;
  academic_year_id: string;
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
  // Hydrated by the backend so the UI can render the real name + email.
  // `reviewer` is null for requests that haven't been reviewed yet.
  requester: UserSummary;
  reviewer: UserSummary | null;
}

// The ResponseTransformInterceptor wraps single-object responses as
// `{ data: T }`. Paginated list responses already have a `data` key so they
// pass through untouched. See apps/api/src/common/interceptors/response-transform.interceptor.ts.
interface Envelope<T> {
  data: T;
}

interface ListResponse<T> {
  data: T[];
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface ApproveResponse {
  request: TeacherRequestRow;
  resulting_window_id: string | null;
  resulting_run_id: string | null;
}

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

function displayUserName(
  user: UserSummary | null | undefined,
  fallbackId: string | null | undefined,
): string {
  const idFallback = fallbackId ? `#${fallbackId.slice(0, 8)}` : '—';
  if (!user) return idFallback;
  const combinedName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return user.full_name || combinedName || user.email || idFallback;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardRequestDetailPage() {
  const t = useTranslations('reportCards.requests.detail');
  const tTypes = useTranslations('reportCards.requests');
  const tStatus = useTranslations('reportCards.requests.status');
  const router = useRouter();
  const locale = useLocale();
  const params = useParams();
  const requestId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string | undefined);
  const { user: currentUser } = useAuth();
  const { hasAnyRole } = useRoleCheck();
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'admin', 'school_vice_principal');

  const [row, setRow] = React.useState<TeacherRequestRow | null>(null);
  const [period, setPeriod] = React.useState<AcademicPeriod | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [actionInFlight, setActionInFlight] = React.useState(false);
  const [rejectModalOpen, setRejectModalOpen] = React.useState(false);
  const [autoApproveConfirmOpen, setAutoApproveConfirmOpen] = React.useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const bumpRefresh = React.useCallback((): void => {
    setRefreshToken((n) => n + 1);
  }, []);

  // ─── Load ───────────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!requestId) return;
    let cancelled = false;

    async function load(): Promise<void> {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        // The backend wraps single-object responses in { data: ... } — unwrap
        // before reading fields, otherwise every property lookup is undefined.
        const response = await apiClient<Envelope<TeacherRequestRow>>(
          `/api/v1/report-card-teacher-requests/${requestId}`,
        );
        if (cancelled) return;
        const requestRow = response.data;
        setRow(requestRow);

        // Fetch period name (only when the request is tied to a specific
        // period — full-year reopen requests have no period).
        if (requestRow.academic_period_id) {
          try {
            const periodsRes = await apiClient<ListResponse<AcademicPeriod>>(
              '/api/v1/academic-periods?pageSize=100',
              { silent: true },
            );
            if (cancelled) return;
            const found =
              (periodsRes.data ?? []).find((p) => p.id === requestRow.academic_period_id) ?? null;
            setPeriod(found);
          } catch (err) {
            console.error('[ReportCardRequestDetailPage.periods]', err);
          }
        }

        // Requester + reviewer names come hydrated on the response — no need
        // to fetch /api/v1/users/:id separately (teachers couldn't access that
        // endpoint anyway).
      } catch (err) {
        console.error('[ReportCardRequestDetailPage]', err);
        if (!cancelled) {
          setLoadFailed(true);
          setRow(null);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [requestId, refreshToken]);

  // ─── Approve and open (manual routing) ──────────────────────────────────
  const handleApproveAndOpen = async (): Promise<void> => {
    if (!row) return;
    setActionInFlight(true);
    try {
      await apiClient<ApproveResponse>(`/api/v1/report-card-teacher-requests/${row.id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ auto_execute: false }),
      });
      toast.success(t('approveSuccess'));

      // Route into the correct target page with pre-filled params. Full-year
      // requests have no academic_period_id — fall back to the list view in
      // that case so we don't push an empty `period_id` query param.
      if (row.request_type === 'open_comment_window' && row.academic_period_id) {
        router.push(
          `/${locale}/report-comments?open_window_period=${encodeURIComponent(row.academic_period_id)}`,
        );
      } else if (
        row.request_type === 'regenerate_reports' &&
        row.target_scope_json &&
        row.target_scope_json.ids?.length &&
        row.academic_period_id
      ) {
        const mode =
          row.target_scope_json.scope === 'student' ? 'individual' : row.target_scope_json.scope;
        const params = new URLSearchParams({
          scope_mode: mode,
          scope_ids: row.target_scope_json.ids.join(','),
          period_id: row.academic_period_id,
        });
        router.push(`/${locale}/report-cards/generate?${params.toString()}`);
      } else {
        router.push(`/${locale}/report-cards/requests`);
      }
    } catch (err) {
      console.error('[ReportCardRequestDetailPage.approve]', err);
      toast.error(t('approveFailure'));
    } finally {
      setActionInFlight(false);
    }
  };

  // ─── Auto-approve and execute ───────────────────────────────────────────
  // The button opens a custom confirm dialog rather than using
  // window.confirm so the styling, focus trap, and i18n stay consistent
  // with the rest of the app.
  const confirmAutoApprove = async (): Promise<void> => {
    if (!row) return;
    setActionInFlight(true);
    try {
      await apiClient<ApproveResponse>(`/api/v1/report-card-teacher-requests/${row.id}/approve`, {
        method: 'PATCH',
        body: JSON.stringify({ auto_execute: true }),
      });
      toast.success(t('approveSuccess'));
      setAutoApproveConfirmOpen(false);
      bumpRefresh();
    } catch (err) {
      console.error('[ReportCardRequestDetailPage.autoApprove]', err);
      toast.error(t('approveFailure'));
    } finally {
      setActionInFlight(false);
    }
  };

  // ─── Cancel (teacher author, own pending) ──────────────────────────────
  const confirmCancel = async (): Promise<void> => {
    if (!row) return;
    setActionInFlight(true);
    try {
      await apiClient(`/api/v1/report-card-teacher-requests/${row.id}/cancel`, {
        method: 'PATCH',
      });
      toast.success(tTypes('cancelSuccess'));
      setCancelConfirmOpen(false);
      bumpRefresh();
    } catch (err) {
      console.error('[ReportCardRequestDetailPage.cancel]', err);
      toast.error(tTypes('cancelFailure'));
    } finally {
      setActionInFlight(false);
    }
  };

  // ─── Render helpers ─────────────────────────────────────────────────────

  const typeLabel = (type: TeacherRequestType): string =>
    type === 'open_comment_window' ? tTypes('typeWindow') : tTypes('typeRegenerate');

  const scopeSummary = (r: TeacherRequestRow): string => {
    if (r.request_type === 'open_comment_window') return tTypes('scopeNone');
    const scope = r.target_scope_json;
    if (!scope || !scope.ids?.length) return tTypes('scopeNone');
    const label =
      scope.scope === 'year_group'
        ? tTypes('scopeYearGroup')
        : scope.scope === 'class'
          ? tTypes('scopeClass')
          : tTypes('scopeStudent');
    return `${label}: ${tTypes('scopeCount', { count: scope.ids.length })}`;
  };

  const isOwnPending = row?.status === 'pending' && row.requested_by_user_id === currentUser?.id;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => router.push(`/${locale}/report-cards/requests`)}
        >
          <ArrowLeft className="me-2 h-4 w-4" aria-hidden="true" />
          {tTypes('backToList')}
        </Button>
      </div>

      <PageHeader title={t('title')} />

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-surface-secondary" />
          ))}
        </div>
      )}

      {!isLoading && loadFailed && <EmptyState icon={AlertCircle} title={t('loadFailed')} />}

      {!isLoading && !loadFailed && !row && <EmptyState icon={AlertCircle} title={t('notFound')} />}

      {!isLoading && !loadFailed && row && (
        <>
          <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={statusBadgeVariant(row.status)}>{tStatus(row.status)}</Badge>
              <span className="text-sm text-text-secondary">{typeLabel(row.request_type)}</span>
            </div>

            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase text-text-tertiary">
                  {t('requester')}
                </dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {displayUserName(row.requester, row.requested_by_user_id)}
                </dd>
                {row.requester?.email && (
                  <dd className="text-xs text-text-tertiary">{row.requester.email}</dd>
                )}
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-text-tertiary">{t('period')}</dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {period?.name ?? (row.academic_period_id ? row.academic_period_id : '—')}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-text-tertiary">{t('scope')}</dt>
                <dd className="mt-1 text-sm text-text-primary">{scopeSummary(row)}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase text-text-tertiary">
                  {t('requestedAt')}
                </dt>
                <dd className="mt-1 text-sm text-text-primary tabular-nums">
                  {formatDateTime(row.created_at)}
                </dd>
              </div>
            </dl>

            <div>
              <dt className="text-xs font-medium uppercase text-text-tertiary">{t('reason')}</dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-text-primary">{row.reason}</dd>
            </div>

            {row.review_note && (
              <div className="rounded-md border border-border bg-surface-secondary p-3">
                <dt className="text-xs font-medium uppercase text-text-tertiary">
                  {t('reviewNote')}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
                  {row.review_note}
                </dd>
                {row.reviewed_by_user_id && (
                  <p className="mt-2 text-xs text-text-tertiary">
                    {t('reviewedBy')}: {displayUserName(row.reviewer, row.reviewed_by_user_id)}
                    {row.reviewed_at ? ` — ${formatDateTime(row.reviewed_at)}` : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && row.status === 'pending' && (
              <>
                <Button
                  type="button"
                  className="min-h-11"
                  onClick={() => void handleApproveAndOpen()}
                  disabled={actionInFlight}
                >
                  <Check className="me-2 h-4 w-4" aria-hidden="true" />
                  {t('approveAndOpen')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setAutoApproveConfirmOpen(true)}
                  disabled={actionInFlight}
                >
                  <Play className="me-2 h-4 w-4" aria-hidden="true" />
                  {t('autoApprove')}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11"
                  onClick={() => setRejectModalOpen(true)}
                  disabled={actionInFlight}
                >
                  <X className="me-2 h-4 w-4" aria-hidden="true" />
                  {t('reject')}
                </Button>
              </>
            )}
            {isOwnPending && !isAdmin && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setCancelConfirmOpen(true)}
                disabled={actionInFlight}
              >
                {t('cancel')}
              </Button>
            )}
          </div>

          {row && (
            <RejectModal
              open={rejectModalOpen}
              onOpenChange={setRejectModalOpen}
              requestId={row.id}
              onRejected={bumpRefresh}
            />
          )}

          {/* Auto-approve confirmation — replaces the native window.confirm.
              Variant default since auto-approve is the happy path. */}
          <ConfirmDialog
            open={autoApproveConfirmOpen}
            onOpenChange={setAutoApproveConfirmOpen}
            title={t('autoApprove')}
            description={t('autoApproveConfirm')}
            confirmLabel={t('autoApprove')}
            cancelLabel={tTypes('cancelKeep')}
            busy={actionInFlight}
            onConfirm={confirmAutoApprove}
          />

          {/* Cancel-own-request confirmation. */}
          <ConfirmDialog
            open={cancelConfirmOpen}
            onOpenChange={setCancelConfirmOpen}
            title={tTypes('cancelConfirmTitle')}
            description={tTypes('cancelConfirm')}
            confirmLabel={tTypes('cancel')}
            cancelLabel={tTypes('cancelKeep')}
            variant="destructive"
            busy={actionInFlight}
            onConfirm={confirmCancel}
          />
        </>
      )}
    </div>
  );
}
