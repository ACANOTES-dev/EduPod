'use client';

import { AlertTriangle, FileText, Hash, Loader2, Send, User } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { REGULATORY_DOMAINS } from '@school/shared/regulatory';
import { Button, Drawer, StatusBadge, toast } from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubmissionRow {
  id: string;
  domain: string;
  submission_type: string;
  academic_year: string;
  period_label: string | null;
  status: string;
  submitted_at: string | null;
  record_count: number | null;
  notes: string | null;
  created_at: string;
}

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

interface SubmissionDetail extends SubmissionRow {
  file_key: string | null;
  file_hash: string | null;
  generated_at: string | null;
  validation_errors: ValidationError[] | null;
  generated_by: { id: string; first_name: string; last_name: string } | null;
  submitted_by: { id: string; first_name: string; last_name: string } | null;
}

interface SubmissionDetailDrawerProps {
  submissionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  canManage: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  reg_not_started: 'neutral',
  not_started: 'neutral',
  reg_in_progress: 'info',
  in_progress: 'info',
  ready_for_review: 'warning',
  reg_submitted: 'success',
  submitted: 'success',
  reg_accepted: 'success',
  accepted: 'success',
  reg_rejected: 'danger',
  rejected: 'danger',
  overdue: 'danger',
};

function normaliseStatus(status: string): string {
  return status.startsWith('reg_') ? status.slice(4) : status;
}

function statusKey(status: string): string {
  const n = normaliseStatus(status);
  const map: Record<string, string> = {
    not_started: 'notStarted',
    in_progress: 'inProgress',
    ready_for_review: 'readyForReview',
    submitted: 'submitted',
    accepted: 'accepted',
    rejected: 'rejected',
    overdue: 'overdue',
  };
  return map[n] ?? n;
}

function fullName(person: { first_name: string; last_name: string } | null | undefined): string {
  if (!person) return '—';
  return `${person.first_name} ${person.last_name}`.trim() || '—';
}

function formatDateTime(value: string | null, locale: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(fmtLocale(locale, 'en-IE'), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SubmissionDetailDrawer({
  submissionId,
  open,
  onOpenChange,
  onUpdated,
  canManage,
}: SubmissionDetailDrawerProps) {
  const locale = useLocale();
  const t = useTranslations('regulatory.submissions');
  const statusT = useTranslations('regulatory.status');

  const [detail, setDetail] = React.useState<SubmissionDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isResubmitting, setIsResubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open || !submissionId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    apiClient<{ data: SubmissionDetail } | SubmissionDetail>(
      `/api/v1/regulatory/submissions/${submissionId}`,
      { silent: true },
    )
      .then((res) => {
        if (!cancelled) setDetail(unwrap(res));
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[SubmissionDetailDrawer] fetch', err);
        toast.error(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, submissionId, t]);

  async function markResubmitted() {
    if (!submissionId) return;
    setIsResubmitting(true);
    try {
      await apiClient(`/api/v1/regulatory/submissions/${submissionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'submitted' }),
      });
      toast.success(t('resubmitSuccess'));
      onUpdated();
      onOpenChange(false);
    } catch (err) {
      const msg = (err as { error?: { message?: string }; message?: string })?.error?.message;
      toast.error(msg ?? (err as { message?: string })?.message ?? t('resubmitError'));
    } finally {
      setIsResubmitting(false);
    }
  }

  const domainLabel =
    detail && REGULATORY_DOMAINS[detail.domain as keyof typeof REGULATORY_DOMAINS]?.label;
  const status = detail ? normaliseStatus(detail.status) : '';
  const canResubmit = canManage && (status === 'rejected' || status === 'overdue');
  const validationErrors = detail?.validation_errors ?? [];

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={t('detail.title')}
      description={t('detail.description')}
      width="sm:max-w-[520px]"
    >
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
        </div>
      )}

      {!isLoading && detail && (
        <div className="space-y-5 px-1">
          {/* Header */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              {t('domain')}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-text-primary">
              {domainLabel ?? detail.domain}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {detail.submission_type}
              {detail.period_label ? ` · ${detail.period_label}` : ''}
            </p>
          </div>

          {/* Status + academic year */}
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={STATUS_VARIANT[detail.status] ?? 'neutral'} dot>
              {statusT(statusKey(detail.status) as never)}
            </StatusBadge>
            <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs font-medium tabular-nums text-text-secondary">
              {detail.academic_year}
            </span>
          </div>

          {/* Meta rows */}
          <div className="space-y-2 rounded-xl border border-border bg-surface-secondary p-3 text-sm">
            <DetailRow
              icon={Send}
              label={t('detail.submittedAt')}
              value={formatDateTime(detail.submitted_at, locale)}
            />
            <DetailRow
              icon={FileText}
              label={t('detail.generatedAt')}
              value={formatDateTime(detail.generated_at, locale)}
            />
            <DetailRow
              icon={User}
              label={t('detail.generatedBy')}
              value={fullName(detail.generated_by)}
            />
            <DetailRow
              icon={User}
              label={t('detail.submittedBy')}
              value={fullName(detail.submitted_by)}
            />
            <DetailRow
              icon={Hash}
              label={t('detail.recordCount')}
              value={detail.record_count !== null ? String(detail.record_count) : '—'}
            />
            {detail.file_hash && (
              <DetailRow icon={Hash} label={t('detail.fileHash')} value={detail.file_hash} mono />
            )}
          </div>

          {/* Validation errors */}
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-warning-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-text-primary">
                {t('detail.validationErrors')}
              </p>
              {validationErrors.length > 0 && (
                <span className="ms-auto rounded-full bg-danger-100 px-2 py-0.5 text-[11px] font-semibold text-danger-700">
                  {validationErrors.length}
                </span>
              )}
            </div>
            {validationErrors.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-surface-secondary p-3 text-sm text-text-tertiary">
                {t('detail.noValidationErrors')}
              </p>
            ) : (
              <ul className="space-y-2">
                {validationErrors.map((issue, i) => (
                  <li
                    key={`${issue.field}-${i}`}
                    className={`rounded-xl border p-3 text-sm ${
                      issue.severity === 'error'
                        ? 'border-danger-200 bg-danger-50/50'
                        : 'border-warning-200 bg-warning-50/50'
                    }`}
                  >
                    <p className="font-medium text-text-primary">{issue.field}</p>
                    <p className="mt-0.5 text-text-secondary">{issue.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Notes */}
          {detail.notes && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                {t('detail.notes')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{detail.notes}</p>
            </div>
          )}

          {/* Actions */}
          {canResubmit && (
            <div className="sticky bottom-0 -mx-1 border-t border-border bg-surface-primary px-1 pt-3">
              <Button
                onClick={markResubmitted}
                disabled={isResubmitting}
                className="w-full bg-teal-600 text-white hover:bg-teal-700"
              >
                {isResubmitting ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="me-2 h-4 w-4" aria-hidden="true" />
                )}
                {t('detail.markResubmitted')}
              </Button>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

// ─── Subcomponent ────────────────────────────────────────────────────────────

function DetailRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
          {label}
        </p>
        <p
          className={`mt-0.5 break-words text-sm text-text-primary ${
            mono ? 'font-mono text-xs' : ''
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
