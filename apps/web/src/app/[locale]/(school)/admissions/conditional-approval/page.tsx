'use client';

import { Clock } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, toast } from '@school/ui';

import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { ForceApproveModal } from '../_components/force-approve-modal';
import { PaymentRecordModal } from '../_components/payment-record-modal';
import { QueueHeader } from '../_components/queue-header';
import type { ConditionalApprovalRow } from '../_components/queue-types';
import { RejectDialog } from '../_components/reject-dialog';

interface QueueResponse {
  data: ConditionalApprovalRow[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    near_expiry_count: number;
    overdue_count: number;
  };
}

function formatAmount(cents: number | null, currency: string | null): string {
  if (cents === null) return '—';
  const value = (cents / 100).toFixed(2);
  return currency ? `${value} ${currency}` : value;
}

function urgencyTone(urgency: ConditionalApprovalRow['payment_urgency']): string {
  switch (urgency) {
    case 'overdue':
      return 'bg-danger-500/10 text-danger-700 border-danger-500/40';
    case 'near_expiry':
      return 'bg-warning-500/10 text-warning-700 border-warning-500/40';
    default:
      return 'bg-surface-muted text-text-secondary border-border';
  }
}

function deadlineRelative(iso: string | null, t: ReturnType<typeof useTranslations>): string {
  if (!iso) return t('conditionalApproval.noDeadline');
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  if (days === 0) return t('conditionalApproval.deadlineToday');
  if (days > 0) return t('conditionalApproval.inDays', { days });
  return t('conditionalApproval.overdueBy', { days: -days });
}

export default function ConditionalApprovalPage() {
  const t = useTranslations('admissionsQueues');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canForceApprove = hasAnyRole('school_owner', 'school_principal');

  const [rows, setRows] = React.useState<ConditionalApprovalRow[]>([]);
  const [meta, setMeta] = React.useState({
    total: 0,
    near_expiry_count: 0,
    overdue_count: 0,
  });
  const [page, setPage] = React.useState(1);
  const pageSize = 50;
  const [loading, setLoading] = React.useState(true);
  const [copying, setCopying] = React.useState<string | null>(null);

  const [paymentTarget, setPaymentTarget] = React.useState<ConditionalApprovalRow | null>(null);
  const [overrideTarget, setOverrideTarget] = React.useState<ConditionalApprovalRow | null>(null);
  const [rejectTargetId, setRejectTargetId] = React.useState<string | null>(null);

  const fetchQueue = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      const res = await apiClient<QueueResponse>(
        `/api/v1/applications/queues/conditional-approval?${params.toString()}`,
      );
      setRows(res.data);
      setMeta({
        total: res.meta.total,
        near_expiry_count: res.meta.near_expiry_count,
        overdue_count: res.meta.overdue_count,
      });
    } catch (err) {
      console.error('[ConditionalApprovalPage]', err);
      toast.error(t('errors.loadFailed'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  React.useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const copyPaymentLink = async (row: ConditionalApprovalRow) => {
    setCopying(row.id);
    try {
      const res = await apiClient<{ url: string }>(
        `/api/v1/applications/${row.id}/payment-link/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      await navigator.clipboard.writeText(res.url);
      toast.success(t('conditionalApproval.linkCopied'));
    } catch (err) {
      console.error('[ConditionalApprovalPage.copyLink]', err);
      toast.error(t('conditionalApproval.linkCopyError'));
    } finally {
      setCopying(null);
    }
  };

  return (
    <div className="space-y-6">
      <QueueHeader
        title={t('conditionalApproval.title')}
        description={t('conditionalApproval.description')}
        count={meta.total}
        countLabel={t('conditionalApproval.countLabel')}
        badges={
          meta.near_expiry_count > 0 || meta.overdue_count > 0 ? (
            <>
              {meta.overdue_count > 0 && (
                <span className="inline-flex items-center rounded-full border border-danger-500/40 bg-danger-500/10 px-3 py-1 text-xs font-medium text-danger-700">
                  {t('conditionalApproval.overdueBadge', { count: meta.overdue_count })}
                </span>
              )}
              {meta.near_expiry_count > 0 && (
                <span className="inline-flex items-center rounded-full border border-warning-500/40 bg-warning-500/10 px-3 py-1 text-xs font-medium text-warning-700">
                  {t('conditionalApproval.nearExpiryBadge', {
                    count: meta.near_expiry_count,
                  })}
                </span>
              )}
            </>
          ) : undefined
        }
      />

      {loading ? (
        <div className="text-sm text-text-secondary">{t('common.loading')}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t('conditionalApproval.emptyTitle')}
          description={t('conditionalApproval.emptyDescription')}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const parent = row.parent;
            const parentName = [parent.first_name, parent.last_name].filter(Boolean).join(' ');
            return (
              <div
                key={row.id}
                className="grid gap-3 rounded-[16px] border border-border bg-surface p-4 md:grid-cols-[1.2fr_1.2fr_1fr_auto] md:items-center"
              >
                <div className="min-w-0">
                  <div className="font-mono text-xs text-text-secondary">
                    {row.application_number}
                  </div>
                  <div className="truncate text-base font-semibold text-text-primary">
                    {row.student_first_name} {row.student_last_name}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {row.target_year_group?.name ?? '—'}
                  </div>
                </div>
                <div className="min-w-0 text-sm">
                  <div className="truncate text-text-primary">{parentName || '—'}</div>
                  <div className="truncate text-xs text-text-secondary" dir="ltr">
                    {parent.email ?? parent.phone ?? '—'}
                  </div>
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-text-primary">
                    {formatAmount(row.payment_amount_cents, row.currency_code)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 ${urgencyTone(row.payment_urgency)}`}
                    >
                      {t(`conditionalApproval.urgency.${row.payment_urgency}`)}
                    </span>
                    <span className="text-text-tertiary">
                      {formatDate(row.payment_deadline)} ·{' '}
                      {deadlineRelative(row.payment_deadline, t)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={copying === row.id}
                    onClick={() => copyPaymentLink(row)}
                  >
                    {copying === row.id ? t('common.working') : t('conditionalApproval.copyLink')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPaymentTarget(row)}>
                    {t('conditionalApproval.recordPayment')}
                  </Button>
                  {canForceApprove && (
                    <Button size="sm" variant="outline" onClick={() => setOverrideTarget(row)}>
                      {t('conditionalApproval.forceApprove')}
                    </Button>
                  )}
                  <Button size="sm" variant="destructive" onClick={() => setRejectTargetId(row.id)}>
                    {t('common.reject')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => router.push(`/${locale}/admissions/${row.id}`)}
                  >
                    {t('common.view')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {meta.total > pageSize && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('common.previous')}
          </Button>
          <span className="text-sm text-text-secondary">
            {t('common.pageOf', {
              page,
              total: Math.ceil(meta.total / pageSize),
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page * pageSize >= meta.total}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      )}

      <PaymentRecordModal
        applicationId={paymentTarget?.id ?? null}
        expectedCents={paymentTarget?.payment_amount_cents ?? null}
        currencyCode={paymentTarget?.currency_code ?? null}
        open={paymentTarget !== null}
        onClose={() => setPaymentTarget(null)}
        onRecorded={() => {
          setPaymentTarget(null);
          void fetchQueue();
        }}
      />
      <ForceApproveModal
        applicationId={overrideTarget?.id ?? null}
        expectedCents={overrideTarget?.payment_amount_cents ?? null}
        currencyCode={overrideTarget?.currency_code ?? null}
        open={overrideTarget !== null}
        onClose={() => setOverrideTarget(null)}
        onApproved={() => {
          setOverrideTarget(null);
          void fetchQueue();
        }}
      />
      <RejectDialog
        applicationId={rejectTargetId}
        open={rejectTargetId !== null}
        onClose={() => setRejectTargetId(null)}
        onRejected={() => {
          setRejectTargetId(null);
          void fetchQueue();
        }}
      />
    </div>
  );
}
