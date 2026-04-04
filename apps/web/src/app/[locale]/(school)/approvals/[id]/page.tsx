'use client';

import { ArrowLeft, Check, X } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, StatusBadge, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'pending_approval' | 'approved' | 'rejected' | 'cancelled' | 'expired';

interface ApprovalUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface LinkedAnnouncement {
  id: string;
  title: string;
  body_html: string;
  scope: string;
  status: string;
}

interface ApprovalRequestDetail {
  id: string;
  action_type: string;
  target_entity_type: string;
  target_entity_id: string;
  requester_user_id: string;
  approver_user_id: string | null;
  status: ApprovalStatus;
  request_comment: string | null;
  decision_comment: string | null;
  submitted_at: string;
  decided_at: string | null;
  executed_at: string | null;
  requester: ApprovalUser;
  approver: ApprovalUser | null;
  announcements?: LinkedAnnouncement[];
  callback_status: 'pending' | 'executed' | 'failed' | null;
  callback_error: string | null;
  callback_attempts: number;
}

const STATUS_MAP: Record<
  ApprovalStatus,
  { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' }
> = {
  pending_approval: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
  expired: { label: 'Expired', variant: 'neutral' },
};

const ACTION_LABELS: Record<string, string> = {
  admissions_accept: 'Admissions: Accept Applicant',
  invoice_issue: 'Finance: Issue Invoice',
  payroll_finalise: 'Payroll: Finalise Run',
  announcement_publish: 'Communications: Publish Announcement',
  schedule_change: 'Scheduling: Change Schedule',
};

const SCOPE_LABELS: Record<string, string> = {
  school: 'School-wide',
  year_group: 'Year Group',
  class: 'Class',
  household: 'Household',
  custom: 'Custom',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('approvals');
  const tc = useTranslations('common');
  const router = useRouter();

  const [request, setRequest] = React.useState<ApprovalRequestDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [comment, setComment] = React.useState('');
  const [actionLoading, setActionLoading] = React.useState(false);
  const [isRetrying, setIsRetrying] = React.useState(false);

  const fetchRequest = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient<ApprovalRequestDetail>(`/api/v1/approval-requests/${id}`);
      setRequest(res);
    } catch (err) {
      console.error('[ApprovalsPage]', err);
      toast.error(t('detail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  React.useEffect(() => {
    void fetchRequest();
  }, [fetchRequest]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/approval-requests/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ comment: comment.trim() || undefined }),
      });
      toast.success(t('detail.approveSuccess'));
      void fetchRequest();
      setComment('');
    } catch (err) {
      console.error('[ApprovalsPage]', err);
      toast.error(t('detail.approveError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/approval-requests/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ comment: comment.trim() || undefined }),
      });
      toast.success(t('detail.rejectSuccess'));
      void fetchRequest();
      setComment('');
    } catch (err) {
      console.error('[ApprovalsPage]', err);
      toast.error(t('detail.rejectError'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryCallback = React.useCallback(async () => {
    setIsRetrying(true);
    try {
      await apiClient(`/api/v1/approval-requests/${id}/retry-callback`, {
        method: 'POST',
      });
      toast.success(t('detail.callbackRetryQueued'));
      void fetchRequest();
    } catch (err) {
      console.error('[ApprovalsPage]', err);
      toast.error(t('detail.callbackRetryError'));
    } finally {
      setIsRetrying(false);
    }
  }, [id, t, fetchRequest]);

  // ─── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{t('detail.notFound')}</p>
      </div>
    );
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const isPending = request.status === 'pending_approval';
  const statusInfo = STATUS_MAP[request.status] ?? {
    label: request.status,
    variant: 'neutral' as const,
  };
  const requesterName = `${request.requester.first_name} ${request.requester.last_name}`.trim();
  const approverName = request.approver
    ? `${request.approver.first_name} ${request.approver.last_name}`.trim()
    : null;
  const linkedAnnouncement = request.announcements?.[0] ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={ACTION_LABELS[request.action_type] ?? request.action_type.replaceAll('_', ' ')}
        actions={
          <Button variant="ghost" onClick={() => router.push('/approvals')}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
          </Button>
        }
      />

      {/* Request metadata */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-text-tertiary">{t('detail.status')}</p>
            <div className="mt-1">
              <StatusBadge status={statusInfo.variant} dot>
                {statusInfo.label}
              </StatusBadge>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-text-tertiary">{t('detail.requestedBy')}</p>
            <p className="mt-1 text-sm font-medium text-text-primary">{requesterName}</p>
            <p className="text-xs text-text-secondary">{request.requester.email}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-tertiary">{t('detail.submittedAt')}</p>
            <p className="mt-1 text-sm text-text-primary">
              {new Date(request.submitted_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
          {request.decided_at && (
            <div>
              <p className="text-xs font-medium text-text-tertiary">{t('detail.decidedAt')}</p>
              <p className="mt-1 text-sm text-text-primary">
                {new Date(request.decided_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {approverName && <p className="text-xs text-text-secondary">{t('by')}{approverName}</p>}
            </div>
          )}
        </div>

        {/* Request comment */}
        {request.request_comment && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium text-text-tertiary">{t('detail.requestComment')}</p>
            <p className="mt-1 text-sm text-text-primary">{request.request_comment}</p>
          </div>
        )}

        {/* Decision comment */}
        {request.decision_comment && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="text-xs font-medium text-text-tertiary">{t('detail.decisionComment')}</p>
            <p className="mt-1 text-sm text-text-primary">{request.decision_comment}</p>
          </div>
        )}
      </div>

      {/* Content being approved */}
      {linkedAnnouncement && (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-text-tertiary">{t('detail.contentTitle')}</h2>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-text-primary">{linkedAnnouncement.title}</h3>
            <span className="inline-block rounded-full bg-surface-secondary px-2.5 py-0.5 text-xs font-medium text-text-secondary">
              {SCOPE_LABELS[linkedAnnouncement.scope] ?? linkedAnnouncement.scope}
            </span>
          </div>
          <div className="prose prose-sm max-w-none text-text-primary whitespace-pre-wrap border-t border-border pt-3">
            <div dangerouslySetInnerHTML={{ __html: linkedAnnouncement.body_html }} />
          </div>
        </div>
      )}

      {/* Callback status */}
      {request.status === 'approved' && request.callback_status && (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-text-tertiary">{t('detail.callbackStatus')}</h2>
          <div className="flex items-center gap-2">
            <StatusBadge
              status={
                request.callback_status === 'executed'
                  ? 'success'
                  : request.callback_status === 'pending'
                    ? 'warning'
                    : 'danger'
              }
              dot
            >
              {request.callback_status === 'executed'
                ? t('detail.callbackExecuted')
                : request.callback_status === 'pending'
                  ? t('detail.callbackPending')
                  : t('detail.callbackFailed')}
            </StatusBadge>
            {request.callback_attempts > 0 && (
              <span className="text-xs text-text-secondary">
                ({request.callback_attempts}{' '}
                {request.callback_attempts === 1 ? t('detail.attempt') : t('detail.attempts')})
              </span>
            )}
          </div>
          {request.callback_error && (
            <p className="text-sm text-danger-text font-mono bg-danger-bg/50 rounded-lg p-3">
              {request.callback_error}
            </p>
          )}
          {request.callback_status === 'failed' && (
            <Button variant="outline" size="sm" onClick={handleRetryCallback} disabled={isRetrying}>
              {isRetrying ? t('detail.retrying') : t('detail.retryCallback')}
            </Button>
          )}
        </div>
      )}

      {/* Approve / Reject actions */}
      {isPending && (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-text-tertiary">{t('detail.decisionTitle')}</h2>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('detail.commentPlaceholder')}
            rows={3}
          />
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleReject}
              disabled={actionLoading}
              className="text-danger-text border-danger-border hover:bg-danger-bg"
            >
              <X className="me-2 h-4 w-4" />
              {t('detail.reject')}
            </Button>
            <Button onClick={handleApprove} disabled={actionLoading}>
              <Check className="me-2 h-4 w-4" />
              {t('detail.approve')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
