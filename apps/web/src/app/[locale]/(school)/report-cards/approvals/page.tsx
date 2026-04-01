'use client';

import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, StatusBadge, Textarea, toast } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'pending' | 'approved' | 'rejected';

interface ApprovalRow {
  id: string;
  report_card_id: string;
  student_name: string;
  period_name: string;
  step_order: number;
  step_label: string;
  status: ApprovalStatus;
  submitted_at: string;
  rejection_reason: string | null;
}

interface ApprovalResponse {
  data: ApprovalRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const t = useTranslations('reportCards');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<ApprovalRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [bulkActioning, setBulkActioning] = React.useState(false);

  // Reject modal state
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [rejecting, setRejecting] = React.useState(false);

  const fetchApprovals = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        pageSize: String(PAGE_SIZE),
        status: 'pending',
      });
      const res = await apiClient<ApprovalResponse>(
        `/api/v1/report-card-approvals?${params.toString()}`,
      );
      setData(res.data);
      setTotal(res.meta.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchApprovals(page);
  }, [page, fetchApprovals]);

  const handleApprove = async (id: string) => {
    try {
      await apiClient(`/api/v1/report-card-approvals/${id}/approve`, { method: 'POST' });
      toast.success(t('approved'));
      void fetchApprovals(page);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    setBulkActioning(true);
    try {
      await apiClient('/api/v1/report-card-approvals/bulk-approve', {
        method: 'POST',
        body: JSON.stringify({ approval_ids: Array.from(selected) }),
      });
      toast.success(t('bulkApproved'));
      setSelected(new Set());
      void fetchApprovals(page);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setBulkActioning(false);
    }
  };

  const openRejectModal = (id: string) => {
    setRejectTarget(id);
    setRejectReason('');
  };

  const handleRejectConfirm = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      await apiClient(`/api/v1/report-card-approvals/${rejectTarget}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason }),
      });
      toast.success(t('rejected'));
      setRejectTarget(null);
      void fetchApprovals(page);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setRejecting(false);
    }
  };

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const ids = data.map((r) => r.id);
    if (selected.size === ids.length) setSelected(new Set());
    else setSelected(new Set(ids));
  };

  const allSelected = data.length > 0 && selected.size === data.length;

  const STATUS_VARIANT: Record<ApprovalStatus, 'warning' | 'success' | 'danger'> = {
    pending: 'warning',
    approved: 'success',
    rejected: 'danger',
  };

  const columns = [
    {
      key: 'select',
      header: '',
      render: (row: ApprovalRow) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => toggleRow(row.id)}
          className="rounded border-border"
          aria-label={`Select ${row.student_name}`}
        />
      ),
    },
    {
      key: 'student',
      header: t('student'),
      render: (row: ApprovalRow) => (
        <span className="text-sm font-medium text-text-primary">{row.student_name}</span>
      ),
    },
    {
      key: 'period',
      header: t('period'),
      render: (row: ApprovalRow) => (
        <span className="text-sm text-text-secondary">{row.period_name}</span>
      ),
    },
    {
      key: 'step',
      header: t('approvalStep'),
      render: (row: ApprovalRow) => (
        <div>
          <span className="text-sm text-text-primary">{row.step_label}</span>
          <span className="ms-2 text-xs text-text-tertiary">
            {t('step')} {row.step_order}
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: ApprovalRow) => (
        <StatusBadge status={STATUS_VARIANT[row.status]} dot>
          {t(`approvalStatus_${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'submitted',
      header: t('submittedAt'),
      render: (row: ApprovalRow) => (
        <span className="text-xs font-mono text-text-tertiary" dir="ltr">
          {new Date(row.submitted_at).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: ApprovalRow) =>
        row.status === 'pending' ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleApprove(row.id)}
              className="rounded-lg p-1.5 text-success-600 hover:bg-success-50"
              aria-label={t('approve')}
            >
              <CheckCircle2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => openRejectModal(row.id)}
              className="rounded-lg p-1.5 text-error-600 hover:bg-error-50"
              aria-label={t('reject')}
            >
              <XCircle className="h-4 w-4" />
            </button>
          </div>
        ) : null,
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="rounded border-border"
          aria-label="Select all"
        />
        {t('selectAll')}
      </label>
      {selected.size > 0 && (
        <Button size="sm" onClick={() => void handleBulkApprove()} disabled={bulkActioning}>
          {bulkActioning ? <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" /> : null}
          <CheckCircle2 className="me-2 h-3.5 w-3.5" />
          {t('approveSelected')} ({selected.size})
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('approvalsTitle')} />

      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      {/* Reject Modal */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-text-primary">{t('rejectReportCard')}</h3>
            <p className="text-sm text-text-secondary">{t('rejectReasonPrompt')}</p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t('rejectReasonPlaceholder')}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>
                {tc('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleRejectConfirm()}
                disabled={rejecting || !rejectReason.trim()}
              >
                {rejecting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                {t('reject')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
