'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Loader2,
  Plus,
  ShieldCheck,
  Wallet,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  createLeaveRequestSchema,
  type CreateLeaveRequestDto,
  type LeaveBalanceResponse,
  type LeaveTypeResponse,
} from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaveRequestRow {
  id: string;
  leave_type: { id: string; code: string; label: string; is_paid_default: boolean };
  date_from: string;
  date_to: string;
  full_day: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn';
  reason: string | null;
  submitted_at: string;
  review_notes: string | null;
}

const STATUS_STYLES: Record<
  LeaveRequestRow['status'],
  { label: string; cls: string; icon: React.ReactNode }
> = {
  pending: {
    label: 'Pending',
    cls: 'bg-amber-100 text-amber-800',
    icon: <Clock className="h-4 w-4 text-amber-600" />,
  },
  approved: {
    label: 'Approved',
    cls: 'bg-green-100 text-green-800',
    icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  },
  rejected: {
    label: 'Rejected',
    cls: 'bg-red-100 text-red-800',
    icon: <XCircle className="h-4 w-4 text-red-600" />,
  },
  cancelled: {
    label: 'Cancelled',
    cls: 'bg-gray-100 text-gray-600',
    icon: <Clock className="h-4 w-4 text-text-tertiary" />,
  },
  withdrawn: {
    label: 'Withdrawn',
    cls: 'bg-gray-100 text-gray-600',
    icon: <Clock className="h-4 w-4 text-text-tertiary" />,
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeaveHubPage() {
  const t = useTranslations('leaveHub');
  const tTeacher = useTranslations('leave.teacher');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const { hasAnyRole } = useRoleCheck();
  // Approval access follows the admin role stack. Principals + VPs approve; types
  // are a narrower admin responsibility (owner / principal / admin only).
  const canApprove = hasAnyRole(
    'school_owner',
    'school_principal',
    'school_vice_principal',
    'admin',
  );
  const canManageTypes = hasAnyRole('school_owner', 'school_principal', 'admin');

  const [balance, setBalance] = React.useState<LeaveBalanceResponse | null>(null);
  const [types, setTypes] = React.useState<LeaveTypeResponse[]>([]);
  const [requests, setRequests] = React.useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitOpen, setSubmitOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      // The balance endpoint returns a raw object; the ResponseTransformInterceptor
      // wraps it as { data: LeaveBalanceResponse }. types + requests/my already
      // ship with their own `data` key (with optional `meta`), so the interceptor
      // leaves those alone and the shape below reflects what the client receives.
      const [balanceRes, typesRes, myRes] = await Promise.all([
        apiClient<{ data: LeaveBalanceResponse }>('/api/v1/leave/balance'),
        apiClient<{ data: LeaveTypeResponse[] }>('/api/v1/leave/types'),
        apiClient<{ data: LeaveRequestRow[] }>('/api/v1/leave/requests/my?pageSize=50'),
      ]);
      setBalance(balanceRes.data ?? null);
      setTypes(typesRes.data ?? []);
      setRequests(myRes.data ?? []);
    } catch (err) {
      console.error('[LeaveHubPage.refresh]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const withdraw = async (id: string) => {
    try {
      await apiClient(`/api/v1/leave/requests/${id}/withdraw`, { method: 'POST' });
      toast.success(tTeacher('withdrawnToast'));
      void refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : tTeacher('withdrawError');
      toast.error(msg);
    }
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const history = requests.filter((r) => r.status !== 'pending');

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setSubmitOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('submitRequest')}
          </Button>
        }
      />

      {/* Admin / type-manager shortcut strip */}
      {(canApprove || canManageTypes) && (
        <div className="flex flex-wrap gap-3">
          {canApprove && (
            <Link
              href={`/${locale}/scheduling/leave-requests`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-surface-hover"
            >
              <ClipboardList className="h-4 w-4 text-primary" />
              {t('reviewQueue')}
            </Link>
          )}
          {canManageTypes && (
            <Link
              href={`/${locale}/settings/leave-types`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-surface-hover"
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t('manageTypes')}
            </Link>
          )}
        </div>
      )}

      {/* Balance summary */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-secondary" />
          ))}
        </div>
      ) : balance ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryTile
              icon={<Calendar className="h-5 w-5" />}
              label={t('academicYear')}
              value={balance.academic_year?.name ?? t('calendarYear')}
              accent="bg-violet-100 text-violet-700"
            />
            <SummaryTile
              icon={<CheckCircle2 className="h-5 w-5" />}
              label={t('daysTaken')}
              value={balance.totals.total_days_taken.toString()}
              accent="bg-green-100 text-green-700"
            />
            <SummaryTile
              icon={<Clock className="h-5 w-5" />}
              label={t('daysPending')}
              value={balance.totals.total_days_pending.toString()}
              accent="bg-amber-100 text-amber-700"
            />
            <SummaryTile
              icon={<Wallet className="h-5 w-5" />}
              label={t('pendingRequests')}
              value={balance.totals.pending_count.toString()}
              accent="bg-sky-100 text-sky-700"
            />
          </div>

          {balance.per_type.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-border bg-surface">
              <div className="border-b border-border px-5 py-3">
                <h2 className="text-sm font-semibold tracking-tight text-text-primary">
                  {t('byTypeTitle')}
                </h2>
                <p className="text-xs text-text-tertiary">{t('byTypeDescription')}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-surface-secondary/60 text-xs text-text-secondary">
                    <tr>
                      <th className="px-4 py-2 text-start font-semibold uppercase tracking-wider">
                        {t('colType')}
                      </th>
                      <th className="px-4 py-2 text-center font-semibold uppercase tracking-wider">
                        {t('colDaysTaken')}
                      </th>
                      <th className="px-4 py-2 text-center font-semibold uppercase tracking-wider">
                        {t('colDaysPending')}
                      </th>
                      <th className="px-4 py-2 text-center font-semibold uppercase tracking-wider">
                        {t('colApprovedRequests')}
                      </th>
                      <th className="px-4 py-2 text-center font-semibold uppercase tracking-wider">
                        {t('colPendingRequests')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {balance.per_type.map((row) => (
                      <tr key={row.leave_type_id}>
                        <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium text-text-primary">
                          <span>{row.label}</span>
                          {!row.is_paid_default && (
                            <span className="ms-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                              {tTeacher('unpaid')}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm text-text-primary">
                          {row.days_taken}
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm text-amber-700">
                          {row.days_pending}
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm text-text-secondary">
                          {row.approved_requests}
                        </td>
                        <td className="px-4 py-2.5 text-center text-sm text-text-secondary">
                          {row.pending_requests}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary">
          {t('noBalance')}
        </div>
      )}

      {/* Pending requests */}
      <section>
        <h2 className="mb-3 text-base font-semibold tracking-tight text-text-primary">
          {t('pendingTitle')}{' '}
          {pending.length > 0 && <span className="text-text-tertiary">({pending.length})</span>}
        </h2>
        {loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
        ) : pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
            {t('noPending')}
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((r) => (
              <RequestCard key={r.id} row={r} showWithdraw onWithdraw={() => withdraw(r.id)} />
            ))}
          </div>
        )}
      </section>

      {/* History */}
      <section>
        <h2 className="mb-3 text-base font-semibold tracking-tight text-text-primary">
          {t('historyTitle')}
        </h2>
        {loading ? (
          <div className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
        ) : history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-text-secondary">
            {t('noHistory')}
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((r) => (
              <RequestCard key={r.id} row={r} />
            ))}
          </div>
        )}
      </section>

      {/* Submit dialog */}
      <SubmitRequestDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        types={types}
        onSubmitted={() => void refresh()}
      />
    </div>
  );
}

// ─── Summary Tile ─────────────────────────────────────────────────────────────

function SummaryTile({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {label}
          </p>
          <p className="mt-1 truncate text-2xl font-bold leading-tight tracking-tight text-text-primary">
            {value}
          </p>
        </div>
        <div
          className={`shrink-0 rounded-xl p-2 shadow-sm ring-1 ring-inset ring-black/5 ${accent}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Request Card ─────────────────────────────────────────────────────────────

function RequestCard({
  row,
  showWithdraw = false,
  onWithdraw,
}: {
  row: LeaveRequestRow;
  showWithdraw?: boolean;
  onWithdraw?: () => void;
}) {
  const t = useTranslations('leave.teacher');
  const status = STATUS_STYLES[row.status];
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{row.leave_type.label}</span>
            {!row.leave_type.is_paid_default && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-700">
                {t('unpaid')}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
            >
              {status.icon}
              {status.label}
            </span>
          </div>
          <div className="mt-1 text-sm text-text-secondary">
            {row.date_from === row.date_to ? row.date_from : `${row.date_from} → ${row.date_to}`}
            {!row.full_day && ` · ${t('partialDay')}`}
          </div>
          {row.reason && <p className="mt-2 text-sm text-text-primary">{row.reason}</p>}
          {row.review_notes && (
            <p className="mt-2 text-xs italic text-text-secondary">
              {t('reviewerNote')}: {row.review_notes}
            </p>
          )}
        </div>
        {showWithdraw && (
          <Button variant="outline" size="sm" onClick={onWithdraw}>
            {t('withdraw')}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Submit Request Dialog ────────────────────────────────────────────────────

function SubmitRequestDialog({
  open,
  onOpenChange,
  types,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  types: LeaveTypeResponse[];
  onSubmitted: () => void;
}) {
  const t = useTranslations('leave.teacher');
  const tc = useTranslations('common');
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const form = useForm<CreateLeaveRequestDto>({
    resolver: zodResolver(createLeaveRequestSchema),
    defaultValues: {
      leave_type_id: '',
      date_from: todayIso,
      date_to: todayIso,
      full_day: true,
      period_from: null,
      period_to: null,
      reason: null,
    },
  });

  React.useEffect(() => {
    if (!open) {
      form.reset({
        leave_type_id: '',
        date_from: todayIso,
        date_to: todayIso,
        full_day: true,
        period_from: null,
        period_to: null,
        reason: null,
      });
    }
  }, [open, form, todayIso]);

  const fullDay = form.watch('full_day');
  const dateFrom = form.watch('date_from');

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await apiClient('/api/v1/leave/requests', {
        method: 'POST',
        body: JSON.stringify({
          leave_type_id: values.leave_type_id,
          date_from: values.date_from,
          date_to: values.date_to,
          full_day: values.full_day,
          period_from: values.full_day ? null : values.period_from,
          period_to: values.full_day ? null : values.period_to,
          reason: values.reason?.trim() || null,
        }),
      });
      toast.success(t('submittedToast'));
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('submitError');
      toast.error(msg);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('newRequest')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-2">
          <div>
            <label htmlFor="lt" className="mb-1 block text-sm font-medium">
              {t('leaveType')}
            </label>
            <select
              id="lt"
              {...form.register('leave_type_id')}
              className="w-full rounded-md border border-border px-3 py-2 text-base"
              required
            >
              <option value="">{t('chooseType')}</option>
              {types.map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.label}
                  {tp.max_days_per_request ? ` (max ${tp.max_days_per_request})` : ''}
                  {!tp.is_paid_default ? ` · ${t('unpaid')}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="df" className="mb-1 block text-sm font-medium">
                {t('dateFrom')}
              </label>
              <input
                id="df"
                type="date"
                min={todayIso}
                {...form.register('date_from')}
                className="w-full rounded-md border border-border px-3 py-2 text-base"
                required
                dir="ltr"
              />
            </div>
            <div>
              <label htmlFor="dt" className="mb-1 block text-sm font-medium">
                {t('dateTo')}
              </label>
              <input
                id="dt"
                type="date"
                min={dateFrom}
                {...form.register('date_to')}
                className="w-full rounded-md border border-border px-3 py-2 text-base"
                required
                dir="ltr"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register('full_day')} />
            <span>{t('fullDay')}</span>
          </label>

          {!fullDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pf" className="mb-1 block text-sm font-medium">
                  {t('periodFrom')}
                </label>
                <input
                  id="pf"
                  type="number"
                  min={1}
                  max={20}
                  {...form.register('period_from', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border px-3 py-2 text-base"
                  required
                />
              </div>
              <div>
                <label htmlFor="pt" className="mb-1 block text-sm font-medium">
                  {t('periodTo')}
                </label>
                <input
                  id="pt"
                  type="number"
                  min={1}
                  max={20}
                  {...form.register('period_to', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border px-3 py-2 text-base"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="reason" className="mb-1 block text-sm font-medium">
              {t('reason')}
            </label>
            <textarea
              id="reason"
              rows={3}
              maxLength={500}
              {...form.register('reason')}
              className="w-full rounded-md border border-border px-3 py-2 text-base"
              placeholder={t('reasonPlaceholder')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={form.formState.isSubmitting}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
