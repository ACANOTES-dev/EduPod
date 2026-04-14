'use client';

import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface LeaveRequestRow {
  id: string;
  staff_profile_id: string;
  staff_name: string | null;
  leave_type: { id: string; code: string; label: string; is_paid_default: boolean };
  date_from: string;
  date_to: string;
  full_day: boolean;
  period_from: number | null;
  period_to: number | null;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn';
  submitted_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  reviewer_name: string | null;
}

type Tab = 'pending' | 'reviewed';

export default function AdminLeaveRequestsPage() {
  const t = useTranslations('leave.admin');

  const [tab, setTab] = React.useState<Tab>('pending');
  const [rows, setRows] = React.useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = React.useState('');

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const status = tab === 'pending' ? 'pending' : '';
      const url = status
        ? `/api/v1/leave/requests?status=${status}&pageSize=100`
        : `/api/v1/leave/requests?pageSize=100`;
      const res = await apiClient<{ data: LeaveRequestRow[] }>(url);
      const filtered =
        tab === 'pending'
          ? (res.data ?? [])
          : (res.data ?? []).filter((r) => r.status !== 'pending');
      setRows(filtered);
    } catch (err) {
      console.error('[AdminLeaveRequestsPage.refresh]', err);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const act = async (id: string, verb: 'approve' | 'reject') => {
    try {
      await apiClient(`/api/v1/leave/requests/${id}/${verb}`, {
        method: 'POST',
        body: JSON.stringify({ review_notes: reviewNotes.trim() || null }),
      });
      toast.success(t(verb === 'approve' ? 'approvedToast' : 'rejectedToast'));
      setActiveId(null);
      setReviewNotes('');
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('actionError');
      toast.error(msg);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{t('title')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{t('description')}</p>
      </div>

      <div className="flex border-b border-border">
        {(['pending', 'reviewed'] as Tab[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setTab(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === v
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t(v)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 p-8 text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-text-secondary">
          {t(tab === 'pending' ? 'noPending' : 'noReviewed')}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-text-primary">
                      {r.staff_name ?? t('unknownStaff')}
                    </span>
                    <span className="text-sm text-text-secondary">·</span>
                    <span className="text-sm text-text-primary">{r.leave_type.label}</span>
                    {!r.leave_type.is_paid_default && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700">
                        {t('unpaid')}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.status === 'pending'
                          ? 'bg-amber-100 text-amber-800'
                          : r.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : r.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t(r.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    {r.date_from === r.date_to ? r.date_from : `${r.date_from} → ${r.date_to}`}
                    {!r.full_day && ` · ${t('partialDay')}`}
                    {' · '}
                    {t('submittedAt', { when: new Date(r.submitted_at).toLocaleDateString() })}
                  </div>
                  {r.reason && <p className="mt-2 text-sm text-text-primary">{r.reason}</p>}
                  {r.review_notes && (
                    <p className="mt-2 text-xs text-text-secondary italic">
                      {t('reviewerNote')}
                      {r.reviewer_name ? ` (${r.reviewer_name})` : ''}: {r.review_notes}
                    </p>
                  )}
                </div>
                <div className="shrink-0">
                  {r.status === 'pending' && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveId(activeId === r.id ? null : r.id);
                        setReviewNotes('');
                      }}
                      className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
                    >
                      {t('review')}
                    </button>
                  )}
                  {r.status === 'approved' && <CheckCircle2 className="h-6 w-6 text-green-600" />}
                  {r.status === 'rejected' && <XCircle className="h-6 w-6 text-red-600" />}
                  {(r.status === 'withdrawn' || r.status === 'cancelled') && (
                    <Clock className="h-6 w-6 text-gray-400" />
                  )}
                </div>
              </div>

              {activeId === r.id && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder={t('notesPlaceholder')}
                    className="w-full rounded-md border border-border px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => act(r.id, 'approve')}
                      className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {t('approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => act(r.id, 'reject')}
                      className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                    >
                      <XCircle className="h-4 w-4" />
                      {t('reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveId(null)}
                      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-hover"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
