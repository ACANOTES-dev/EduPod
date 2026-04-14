'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { createLeaveRequestSchema, type CreateLeaveRequestDto } from '@school/shared';
import { toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface LeaveType {
  id: string;
  code: string;
  label: string;
  requires_approval: boolean;
  is_paid_default: boolean;
  max_days_per_request: number | null;
}

interface LeaveRequestRow {
  id: string;
  leave_type: { id: string; code: string; label: string };
  date_from: string;
  date_to: string;
  full_day: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn';
  reason: string | null;
  submitted_at: string;
  review_notes: string | null;
}

const STATUS_STYLES: Record<LeaveRequestRow['status'], { label: string; cls: string }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-600' },
  withdrawn: { label: 'Withdrawn', cls: 'bg-gray-100 text-gray-600' },
};

export default function TeacherLeavePage() {
  const t = useTranslations('leave.teacher');
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [types, setTypes] = React.useState<LeaveType[]>([]);
  const [requests, setRequests] = React.useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = React.useState(true);

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

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, listRes] = await Promise.all([
        apiClient<{ data: LeaveType[] }>('/api/v1/leave/types'),
        apiClient<{ data: LeaveRequestRow[] }>('/api/v1/leave/requests/my?pageSize=50'),
      ]);
      setTypes(typesRes.data ?? []);
      setRequests(listRes.data ?? []);
    } catch (err) {
      console.error('[TeacherLeavePage.refresh]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSubmit = async (values: CreateLeaveRequestDto) => {
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
      form.reset({
        leave_type_id: '',
        date_from: todayIso,
        date_to: todayIso,
        full_day: true,
        period_from: null,
        period_to: null,
        reason: null,
      });
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('submitError');
      toast.error(msg);
    }
  };

  const withdraw = async (id: string) => {
    try {
      await apiClient(`/api/v1/leave/requests/${id}/withdraw`, { method: 'POST' });
      toast.success(t('withdrawnToast'));
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('withdrawError');
      toast.error(msg);
    }
  };

  const fullDay = form.watch('full_day');
  const dateFrom = form.watch('date_from');
  const submitting = form.formState.isSubmitting;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('description')}</p>
      </div>

      {/* Submit form */}
      <section className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-text-primary">
          <Calendar className="h-5 w-5" />
          {t('newRequest')}
        </h2>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('submit')}
          </button>
        </form>
      </section>

      {/* History list */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-text-primary">{t('myRequests')}</h2>
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        ) : requests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-text-secondary">
            {t('noRequests')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="space-y-3">
              {requests.map((r) => {
                const status = STATUS_STYLES[r.status];
                return (
                  <div key={r.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">
                            {r.leave_type.label}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-text-secondary">
                          {r.date_from === r.date_to
                            ? r.date_from
                            : `${r.date_from} → ${r.date_to}`}
                          {!r.full_day && ` · ${t('partialDay')}`}
                        </div>
                        {r.reason && <p className="mt-2 text-sm text-text-primary">{r.reason}</p>}
                        {r.review_notes && (
                          <p className="mt-2 text-xs text-text-secondary italic">
                            {t('reviewerNote')}: {r.review_notes}
                          </p>
                        )}
                      </div>
                      {r.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => withdraw(r.id)}
                          className="text-xs font-medium text-red-600 hover:text-red-700"
                        >
                          {t('withdraw')}
                        </button>
                      )}
                      {r.status === 'approved' && (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      )}
                      {r.status === 'rejected' && <XCircle className="h-5 w-5 text-red-600" />}
                      {r.status === 'pending' && <Clock className="h-5 w-5 text-amber-600" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
