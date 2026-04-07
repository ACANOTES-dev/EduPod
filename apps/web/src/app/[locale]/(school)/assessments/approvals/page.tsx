'use client';

import { Check, LayoutGrid, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfigApprovalItem {
  id: string;
  name: string;
  type: 'category' | 'weight';
  teacher_name?: string;
  subject_name?: string;
  year_group_name?: string;
  status: string;
}

interface UnlockRequest {
  id: string;
  assessment_id: string;
  assessment_title: string;
  class_name: string;
  subject_name: string;
  requested_by_name: string;
  reason: string;
  status: string;
  created_at: string;
}

interface CategoriesResponse {
  data: Array<{
    id: string;
    name: string;
    status: string;
    subject?: { id: string; name: string } | null;
    year_group?: { id: string; name: string } | null;
    created_by_name?: string;
  }>;
  meta?: { page: number; pageSize: number; total: number };
}

interface WeightsResponse {
  data: Array<{
    id: string;
    subject_id: string;
    subject_name?: string;
    year_group_id: string;
    year_group_name?: string;
    status: string;
    created_by_name?: string;
  }>;
  meta?: { page: number; pageSize: number; total: number };
}

interface UnlockRequestsResponse {
  data: UnlockRequest[];
  meta?: { page: number; pageSize: number; total: number };
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

type TabKey = 'config' | 'unlocks';

// ─── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-surface-secondary" />
      ))}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-surface p-12">
      <LayoutGrid className="mb-3 h-10 w-10 text-text-tertiary" />
      <p className="text-sm text-text-tertiary">{message}</p>
    </div>
  );
}

// ─── Date formatter ──────────────────────────────────────────────────────────

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ApprovalQueuePage() {
  const t = useTranslations('teacherAssessments');
  const tc = useTranslations('common');

  // ── Tab state ──────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = React.useState<TabKey>('config');

  // ── Config approvals state ─────────────────────────────────────────────────

  const [configItems, setConfigItems] = React.useState<ConfigApprovalItem[]>([]);
  const [configLoading, setConfigLoading] = React.useState(true);

  // ── Unlock requests state ──────────────────────────────────────────────────

  const [unlockRequests, setUnlockRequests] = React.useState<UnlockRequest[]>([]);
  const [unlocksLoading, setUnlocksLoading] = React.useState(true);

  // ── Reject dialog state ────────────────────────────────────────────────────

  const [rejectTarget, setRejectTarget] = React.useState<{
    id: string;
    type: 'category' | 'weight' | 'unlock';
  } | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);

  // ── Fetch config approvals ─────────────────────────────────────────────────

  const fetchConfigApprovals = React.useCallback(async () => {
    setConfigLoading(true);
    try {
      const [categoriesRes, weightsRes] = await Promise.all([
        apiClient<CategoriesResponse>(
          '/api/v1/gradebook/assessment-categories?status=pending_approval&pageSize=100',
        ),
        apiClient<WeightsResponse>(
          '/api/v1/gradebook/teacher-grading-weights?status=pending_approval&pageSize=100',
        ),
      ]);

      const items: ConfigApprovalItem[] = [];

      for (const cat of categoriesRes.data) {
        items.push({
          id: cat.id,
          name: cat.name,
          type: 'category',
          teacher_name: cat.created_by_name,
          subject_name: cat.subject?.name ?? undefined,
          year_group_name: cat.year_group?.name ?? undefined,
          status: cat.status,
        });
      }

      for (const w of weightsRes.data) {
        items.push({
          id: w.id,
          name: `${w.subject_name ?? '—'} / ${w.year_group_name ?? '—'}`,
          type: 'weight',
          teacher_name: w.created_by_name,
          subject_name: w.subject_name,
          year_group_name: w.year_group_name,
          status: w.status,
        });
      }

      setConfigItems(items);
    } catch (err) {
      console.error('[ApprovalQueue.fetchConfigApprovals]', err);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  // ── Fetch unlock requests ──────────────────────────────────────────────────

  const fetchUnlockRequests = React.useCallback(async () => {
    setUnlocksLoading(true);
    try {
      const res = await apiClient<UnlockRequestsResponse>('/api/v1/gradebook/unlock-requests');
      setUnlockRequests(res.data);
    } catch (err) {
      console.error('[ApprovalQueue.fetchUnlockRequests]', err);
    } finally {
      setUnlocksLoading(false);
    }
  }, []);

  // ── Effects ────────────────────────────────────────────────────────────────

  React.useEffect(() => {
    void fetchConfigApprovals();
  }, [fetchConfigApprovals]);

  React.useEffect(() => {
    void fetchUnlockRequests();
  }, [fetchUnlockRequests]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleApproveConfig = async (item: ConfigApprovalItem) => {
    try {
      const endpoint =
        item.type === 'category'
          ? `/api/v1/gradebook/assessment-categories/${item.id}/approve`
          : `/api/v1/gradebook/teacher-grading-weights/${item.id}/approve`;
      await apiClient(endpoint, { method: 'POST' });
      toast.success(t('approveSuccess'));
      void fetchConfigApprovals();
    } catch (err) {
      console.error('[ApprovalQueue.approveConfig]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleApproveUnlock = async (req: UnlockRequest) => {
    try {
      await apiClient(`/api/v1/gradebook/unlock-requests/${req.id}/approve`, {
        method: 'POST',
      });
      toast.success(t('approveSuccess'));
      void fetchUnlockRequests();
    } catch (err) {
      console.error('[ApprovalQueue.approveUnlock]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const openRejectDialog = (id: string, type: 'category' | 'weight' | 'unlock') => {
    setRejectTarget({ id, type });
    setRejectReason('');
  };

  const handleReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) return;
    setRejecting(true);
    try {
      let endpoint: string;
      if (rejectTarget.type === 'category') {
        endpoint = `/api/v1/gradebook/assessment-categories/${rejectTarget.id}/reject`;
      } else if (rejectTarget.type === 'weight') {
        endpoint = `/api/v1/gradebook/teacher-grading-weights/${rejectTarget.id}/reject`;
      } else {
        endpoint = `/api/v1/gradebook/unlock-requests/${rejectTarget.id}/reject`;
      }
      await apiClient(endpoint, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      toast.success(t('rejectSuccess'));
      setRejectTarget(null);
      setRejectReason('');
      if (rejectTarget.type === 'unlock') {
        void fetchUnlockRequests();
      } else {
        void fetchConfigApprovals();
      }
    } catch (err) {
      console.error('[ApprovalQueue.reject]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setRejecting(false);
    }
  };

  // ── Tab styling helper ─────────────────────────────────────────────────────

  const tabClass = (key: TabKey) =>
    `px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg border-b-2 ${
      activeTab === key
        ? 'border-primary text-primary bg-surface'
        : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
    }`;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title={t('approvalsTitle')} description={t('approvalsDescription')} />

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        <button type="button" className={tabClass('config')} onClick={() => setActiveTab('config')}>
          {t('approvalsConfigTab')}
          {configItems.length > 0 && (
            <span className="ms-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning-bg px-1.5 text-xs font-semibold text-warning-text">
              {configItems.length}
            </span>
          )}
        </button>
        <button
          type="button"
          className={tabClass('unlocks')}
          onClick={() => setActiveTab('unlocks')}
        >
          {t('approvalsUnlocksTab')}
          {unlockRequests.length > 0 && (
            <span className="ms-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning-bg px-1.5 text-xs font-semibold text-warning-text">
              {unlockRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* Config Approvals tab content */}
      {activeTab === 'config' && (
        <div>
          {configLoading ? (
            <LoadingSkeleton />
          ) : configItems.length === 0 ? (
            <EmptyState message={t('approvalsNoConfig')} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {t('approvalsItemName')}
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {t('approvalsItemType')}
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {t('teacher')}
                          </th>
                          <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {tc('actions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {configItems.map((item) => (
                          <tr
                            key={`${item.type}-${item.id}`}
                            className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                          >
                            <td className="px-4 py-3 text-sm font-medium text-text-primary">
                              {item.name}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status="warning" dot>
                                {item.type === 'category'
                                  ? t('approvalsTypeCategory')
                                  : t('approvalsTypeWeight')}
                              </StatusBadge>
                            </td>
                            <td className="px-4 py-3 text-sm text-text-secondary">
                              {item.teacher_name ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleApproveConfig(item)}
                                  title={t('approve')}
                                >
                                  <Check className="h-4 w-4 text-success-text" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openRejectDialog(item.id, item.type)}
                                  title={t('reject')}
                                >
                                  <X className="h-4 w-4 text-danger-text" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Mobile card view */}
              <div className="flex flex-col gap-3 sm:hidden">
                {configItems.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="rounded-2xl border border-border bg-surface p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-text-primary">{item.name}</p>
                        {item.teacher_name && (
                          <p className="text-xs text-text-secondary">{item.teacher_name}</p>
                        )}
                      </div>
                      <StatusBadge status="warning" dot>
                        {item.type === 'category'
                          ? t('approvalsTypeCategory')
                          : t('approvalsTypeWeight')}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-border pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRejectDialog(item.id, item.type)}
                      >
                        <X className="me-1.5 h-4 w-4 text-danger-text" />
                        {t('reject')}
                      </Button>
                      <Button size="sm" onClick={() => void handleApproveConfig(item)}>
                        <Check className="me-1.5 h-4 w-4" />
                        {t('approve')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Unlock Requests tab content */}
      {activeTab === 'unlocks' && (
        <div>
          {unlocksLoading ? (
            <LoadingSkeleton />
          ) : unlockRequests.length === 0 ? (
            <EmptyState message={t('approvalsNoUnlocks')} />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden sm:block">
                <div className="rounded-2xl border border-border bg-surface overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {t('wsAssessmentTitle')}
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {t('class')}
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {t('subject')}
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {t('approvalsRequestedBy')}
                          </th>
                          <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {t('approvalsReason')}
                          </th>
                          <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                            {tc('actions')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {unlockRequests.map((req) => (
                          <tr
                            key={req.id}
                            className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                          >
                            <td className="px-4 py-3 text-sm font-medium text-text-primary">
                              {req.assessment_title}
                            </td>
                            <td className="px-4 py-3 text-sm text-text-secondary">
                              {req.class_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-text-secondary">
                              {req.subject_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-text-secondary">
                              {req.requested_by_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-text-secondary max-w-xs truncate">
                              {req.reason}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void handleApproveUnlock(req)}
                                  title={t('approve')}
                                >
                                  <Check className="h-4 w-4 text-success-text" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openRejectDialog(req.id, 'unlock')}
                                  title={t('reject')}
                                >
                                  <X className="h-4 w-4 text-danger-text" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Mobile card view */}
              <div className="flex flex-col gap-3 sm:hidden">
                {unlockRequests.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-2xl border border-border bg-surface p-4 space-y-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {req.assessment_title}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {req.class_name} — {req.subject_name}
                      </p>
                      <p className="text-xs text-text-tertiary">
                        {t('approvalsRequestedBy')}: {req.requested_by_name}
                      </p>
                    </div>

                    <div className="rounded-lg bg-surface-secondary p-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        {t('approvalsReason')}
                      </p>
                      <p className="mt-1 text-sm text-text-primary">{req.reason}</p>
                    </div>

                    <div className="flex items-center justify-between text-xs text-text-tertiary">
                      <span>{formatShortDate(req.created_at)}</span>
                    </div>

                    <div className="flex items-center justify-end gap-2 border-t border-border pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRejectDialog(req.id, 'unlock')}
                      >
                        <X className="me-1.5 h-4 w-4 text-danger-text" />
                        {t('reject')}
                      </Button>
                      <Button size="sm" onClick={() => void handleApproveUnlock(req)}>
                        <Check className="me-1.5 h-4 w-4" />
                        {t('approve')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Reject Dialog ───────────────────────────────────────────────────── */}

      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('reject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reject-reason">{t('rejectionReason')}</Label>
              <Textarea
                id="reject-reason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('rejectionReason')}
                className="text-base"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason('');
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleReject()}
              disabled={rejecting || !rejectReason.trim()}
            >
              {rejecting ? tc('loading') : t('reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
