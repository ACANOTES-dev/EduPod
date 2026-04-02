'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState, StatusBadge } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApprovalStatus = 'pending_approval' | 'approved' | 'rejected' | 'cancelled' | 'expired';

interface ApprovalRequest {
  id: string;
  action_type: string;
  target_entity_type: string;
  target_entity_id: string;
  requester_user_id: string;
  requester_name?: string;
  status: ApprovalStatus;
  request_comment: string | null;
  submitted_at: string;
  decided_at: string | null;
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const t = useTranslations();
  const router = useRouter();
  const [requests, setRequests] = React.useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<string>('pending_approval');
  const pageSize = 20;

  const fetchRequests = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter === 'callback_failed') {
        params.set('status', 'approved');
        params.set('callback_status', 'failed');
      } else if (statusFilter) {
        params.set('status', statusFilter);
      }

      const result = await apiClient<{
        data: ApprovalRequest[];
        meta?: { total: number; page: number; pageSize: number };
      }>(`/api/v1/approval-requests?${params}`);
      setRequests(result.data);
      setTotal(result.meta?.total ?? result.data.length);
    } catch {
      setRequests([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  React.useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const columns = [
    {
      key: 'action_type',
      header: 'Type',
      render: (row: ApprovalRequest) => (
        <span className="font-medium text-text-primary">
          {ACTION_LABELS[row.action_type] ?? row.action_type.replaceAll('_', ' ')}
        </span>
      ),
    },
    {
      key: 'requester_name',
      header: 'Requested By',
      render: (row: ApprovalRequest) => (
        <span className="text-text-secondary">{row.requester_name ?? '—'}</span>
      ),
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      render: (row: ApprovalRequest) => (
        <span className="text-text-secondary text-sm">
          {new Date(row.submitted_at).toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: ApprovalRequest) => {
        const mapped = STATUS_MAP[row.status] ?? { label: row.status, variant: 'neutral' as const };
        return <StatusBadge status={mapped.variant}>{mapped.label}</StatusBadge>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.approvals')}
        description="Review and manage pending approval requests"
      />

      <DataTable<ApprovalRequest>
        columns={columns}
        data={requests}
        isLoading={loading}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onRowClick={(row) => router.push(`/approvals/${row.id}`)}
        keyExtractor={(row) => row.id}
        toolbar={
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
          >
            <option value="pending_approval">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All</option>
            <option value="callback_failed">Failed Callbacks</option>
          </select>
        }
      />

      {!loading && requests.length === 0 && (
        <EmptyState
          icon={ShieldCheck}
          title="No approval requests"
          description={
            statusFilter === 'pending_approval'
              ? 'There are no pending approvals right now.'
              : 'No approval requests match the current filter.'
          }
        />
      )}
    </div>
  );
}
