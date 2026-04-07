'use client';

import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
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

import { apiClient } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PaginatedResponse<T> {
  data: T[];
  meta?: { page: number; pageSize: number; total: number };
}

interface ConfigApprovalItem {
  id: string;
  name: string;
  type: 'category' | 'weight';
  teacher_name?: string;
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

// ─── Component ───────────────────────────────────────────────────────────────

export function InlineApprovalQueue() {
  const t = useTranslations('teacherAssessments');
  const tc = useTranslations('common');

  const [configItems, setConfigItems] = React.useState<ConfigApprovalItem[]>([]);
  const [unlockRequests, setUnlockRequests] = React.useState<UnlockRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hasPermission, setHasPermission] = React.useState(true);

  // ── Reject dialog state ──────────────────────────────────────────────────
  const [rejectTarget, setRejectTarget] = React.useState<{
    id: string;
    type: 'category' | 'weight' | 'unlock';
  } | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);

  const fetchApprovals = React.useCallback(async () => {
    try {
      const [categoriesRes, weightsRes, unlocksRes] = await Promise.all([
        apiClient<
          PaginatedResponse<{
            id: string;
            name: string;
            status: string;
            created_by_name?: string;
          }>
        >('/api/v1/gradebook/assessment-categories?status=pending_approval&pageSize=100').catch(
          () => null,
        ),
        apiClient<
          PaginatedResponse<{
            id: string;
            subject_name?: string;
            year_group_name?: string;
            status: string;
            created_by_name?: string;
          }>
        >('/api/v1/gradebook/teacher-grading-weights?status=pending_approval&pageSize=100').catch(
          () => null,
        ),
        apiClient<{ data: UnlockRequest[] }>('/api/v1/gradebook/unlock-requests').catch(() => null),
      ]);

      // If all three failed (likely 403), hide the section
      if (!categoriesRes && !weightsRes && !unlocksRes) {
        setHasPermission(false);
        return;
      }

      const items: ConfigApprovalItem[] = [];

      if (categoriesRes) {
        for (const cat of categoriesRes.data) {
          items.push({
            id: cat.id,
            name: cat.name,
            type: 'category',
            teacher_name: cat.created_by_name,
            status: cat.status,
          });
        }
      }

      if (weightsRes) {
        for (const w of weightsRes.data) {
          items.push({
            id: w.id,
            name: `${w.subject_name ?? '—'} / ${w.year_group_name ?? '—'}`,
            type: 'weight',
            teacher_name: w.created_by_name,
            status: w.status,
          });
        }
      }

      setConfigItems(items);
      setUnlockRequests(unlocksRes?.data ?? []);
    } catch (err) {
      console.error('[InlineApprovalQueue.fetchApprovals]', err);
      setHasPermission(false);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchApprovals();
  }, [fetchApprovals]);

  // ── Action handlers ──────────────────────────────────────────────────────

  const handleApproveConfig = async (item: ConfigApprovalItem) => {
    try {
      const endpoint =
        item.type === 'category'
          ? `/api/v1/gradebook/assessment-categories/${item.id}/approve`
          : `/api/v1/gradebook/teacher-grading-weights/${item.id}/approve`;
      await apiClient(endpoint, { method: 'POST' });
      toast.success(t('approveSuccess'));
      void fetchApprovals();
    } catch (err) {
      console.error('[InlineApprovalQueue.approveConfig]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleApproveUnlock = async (req: UnlockRequest) => {
    try {
      await apiClient(`/api/v1/gradebook/unlock-requests/${req.id}/approve`, {
        method: 'POST',
      });
      toast.success(t('approveSuccess'));
      void fetchApprovals();
    } catch (err) {
      console.error('[InlineApprovalQueue.approveUnlock]', err);
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
      void fetchApprovals();
    } catch (err) {
      console.error('[InlineApprovalQueue.reject]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setRejecting(false);
    }
  };

  // Don't render anything if user lacks permission or is loading
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  if (!hasPermission) return null;

  const totalPending = configItems.length + unlockRequests.length;
  if (totalPending === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-text-primary">{t('pendingApprovals')}</h2>
        <Badge variant="warning">{totalPending}</Badge>
      </div>

      {/* Config approvals */}
      {configItems.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="border-b border-border bg-surface-secondary px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('configApprovals')}
            </p>
          </div>
          <div className="divide-y divide-border">
            {configItems.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary truncate">{item.name}</p>
                    <StatusBadge status="warning" dot>
                      {item.type === 'category'
                        ? t('approvalsTypeCategory')
                        : t('approvalsTypeWeight')}
                    </StatusBadge>
                  </div>
                  {item.teacher_name && (
                    <p className="text-xs text-text-secondary mt-0.5">{item.teacher_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unlock requests */}
      {unlockRequests.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface overflow-hidden">
          <div className="border-b border-border bg-surface-secondary px-4 py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('unlockRequests')}
            </p>
          </div>
          <div className="divide-y divide-border">
            {unlockRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {req.assessment_title}
                  </p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {req.class_name} — {req.subject_name}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {req.requested_by_name}: {req.reason}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
              </div>
            ))}
          </div>
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
