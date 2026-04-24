'use client';

import { ArrowLeftRight, Check, CheckCircle2, Clock3, Minus, Plus, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Transfer {
  id: string;
  student_id: string;
  student: { id: string; first_name: string; last_name: string } | null;
  direction: 'inbound' | 'outbound';
  other_school_roll_no: string;
  other_school_name: string | null;
  transfer_date: string;
  leaving_reason: string | null;
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'cancelled';
  ppod_confirmed: boolean;
  ppod_confirmed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface TransfersApiResponse {
  data: Transfer[];
  meta: { page: number; pageSize: number; total: number };
}

type TransferStatus = Transfer['status'];
type SemanticVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const SUMMARY_PAGE_SIZE = 100;

const STATUS_VARIANT_MAP: Record<TransferStatus, SemanticVariant> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  completed: 'info',
  cancelled: 'neutral',
};

const TERMINAL_STATUSES: TransferStatus[] = ['completed', 'cancelled', 'rejected'];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getCurrentAcademicYearBounds(): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  if (month >= 8) {
    return { start: new Date(year, 8, 1), end: new Date(year + 1, 8, 1) };
  }
  return { start: new Date(year - 1, 8, 1), end: new Date(year, 8, 1) };
}

function studentName(transfer: Transfer): string {
  if (!transfer.student) return '—';
  return `${transfer.student.first_name} ${transfer.student.last_name}`.trim() || '—';
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function TransfersListPage() {
  const t = useTranslations('regulatory.transfers');
  const locale = useLocale();

  const [transfers, setTransfers] = React.useState<Transfer[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [directionFilter, setDirectionFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [isLoading, setIsLoading] = React.useState(true);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<Transfer[] | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = React.useState(true);

  // ── Fetch filtered list ─────────────────────────────────────────────
  const fetchTransfers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (directionFilter !== 'all') params.set('direction', directionFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const response = await apiClient<TransfersApiResponse>(
        `/api/v1/regulatory/transfers?${params.toString()}`,
        { silent: true },
      );
      setTransfers(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch (err) {
      console.error('[TransfersListPage.fetchTransfers]', err);
      setTransfers([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, directionFilter, statusFilter]);

  React.useEffect(() => {
    void fetchTransfers();
  }, [fetchTransfers]);

  // ── Fetch summary for KPI strip ─────────────────────────────────────
  const fetchSummary = React.useCallback(async () => {
    setIsSummaryLoading(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: String(SUMMARY_PAGE_SIZE),
      });
      const response = await apiClient<TransfersApiResponse>(
        `/api/v1/regulatory/transfers?${params.toString()}`,
        { silent: true },
      );
      setSummary(response.data ?? []);
    } catch (err) {
      console.error('[TransfersListPage.fetchSummary]', err);
      setSummary(null);
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  // ── KPIs ────────────────────────────────────────────────────────────
  const kpis = React.useMemo(() => {
    if (!summary) {
      return { pending: undefined, accepted: undefined, rejected: undefined, inTransit: undefined };
    }
    const { start, end } = getCurrentAcademicYearBounds();
    let pending = 0;
    let accepted = 0;
    let rejected = 0;
    let inTransit = 0;
    for (const tr of summary) {
      const date = new Date(tr.transfer_date);
      const inYear = date >= start && date < end;
      if (tr.status === 'pending') pending += 1;
      else if (tr.status === 'accepted' && inYear) accepted += 1;
      else if (tr.status === 'rejected' && inYear) rejected += 1;
      if (tr.direction === 'outbound' && tr.status === 'accepted' && !tr.ppod_confirmed) {
        inTransit += 1;
      }
    }
    return { pending, accepted, rejected, inTransit };
  }, [summary]);

  // ── Actions ─────────────────────────────────────────────────────────
  const updateTransfer = React.useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setUpdatingId(id);
      try {
        await apiClient(`/api/v1/regulatory/transfers/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toast.success(t('updateSuccess'));
        void fetchTransfers();
        void fetchSummary();
      } catch (err: unknown) {
        const ex = err as { error?: { message?: string }; message?: string };
        toast.error(ex?.error?.message ?? ex?.message ?? t('updateError'));
        console.error('[TransfersListPage.updateTransfer]', err);
      } finally {
        setUpdatingId(null);
      }
    },
    [fetchTransfers, fetchSummary, t],
  );

  const handleAccept = React.useCallback(
    (id: string) => updateTransfer(id, { status: 'accepted' }),
    [updateTransfer],
  );
  const handleReject = React.useCallback(
    (id: string) => updateTransfer(id, { status: 'rejected' }),
    [updateTransfer],
  );
  const handleTogglePpod = React.useCallback(
    (transfer: Transfer) =>
      updateTransfer(transfer.id, { ppod_confirmed: !transfer.ppod_confirmed }),
    [updateTransfer],
  );
  const handleStatusChange = React.useCallback(
    (id: string, status: string) => updateTransfer(id, { status }),
    [updateTransfer],
  );

  // ── Columns ─────────────────────────────────────────────────────────
  const columns = React.useMemo(
    () => [
      {
        key: 'student_name',
        header: t('colStudentName'),
        render: (row: Transfer) => <span className="font-medium">{studentName(row)}</span>,
      },
      {
        key: 'direction',
        header: t('colDirection'),
        render: (row: Transfer) => (
          <Badge variant={row.direction === 'inbound' ? 'info' : 'secondary'}>
            {row.direction === 'inbound' ? t('inbound') : t('outbound')}
          </Badge>
        ),
      },
      {
        key: 'other_school',
        header: t('colOtherSchool'),
        render: (row: Transfer) => (
          <div className="min-w-0">
            <span className="font-mono text-xs">{row.other_school_roll_no}</span>
            {row.other_school_name && (
              <p className="truncate text-xs text-text-secondary">{row.other_school_name}</p>
            )}
          </div>
        ),
      },
      {
        key: 'transfer_date',
        header: t('colTransferDate'),
        render: (row: Transfer) => formatDate(row.transfer_date),
      },
      {
        key: 'status',
        header: t('colStatus'),
        render: (row: Transfer) => (
          <StatusBadge status={STATUS_VARIANT_MAP[row.status]} dot>
            {t(`status_${row.status}` as never)}
          </StatusBadge>
        ),
      },
      {
        key: 'ppod_confirmed',
        header: t('colPpodConfirmed'),
        render: (row: Transfer) =>
          row.ppod_confirmed ? (
            <Check className="h-4 w-4 text-success-text" />
          ) : (
            <Minus className="h-4 w-4 text-text-tertiary" />
          ),
        className: 'text-center',
      },
      {
        key: 'actions',
        header: t('colActions'),
        render: (row: Transfer) => {
          const isUpdating = updatingId === row.id;
          const isTerminal = TERMINAL_STATUSES.includes(row.status);
          return (
            <div className="flex items-center gap-1.5">
              {row.direction === 'inbound' && row.status === 'pending' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isUpdating}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleAccept(row.id);
                    }}
                    className="min-h-[36px] text-success-text hover:text-success-text"
                  >
                    {t('accept')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isUpdating}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleReject(row.id);
                    }}
                    className="min-h-[36px] text-danger-text hover:text-danger-text"
                  >
                    {t('reject')}
                  </Button>
                </>
              )}
              {!(row.direction === 'inbound' && row.status === 'pending') && !isTerminal && (
                <Select
                  value={row.status}
                  onValueChange={(val) => {
                    void handleStatusChange(row.id, val);
                  }}
                  disabled={isUpdating}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">{t('status_pending')}</SelectItem>
                    <SelectItem value="accepted">{t('status_accepted')}</SelectItem>
                    <SelectItem value="completed">{t('status_completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('status_cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {!isTerminal && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isUpdating}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleTogglePpod(row);
                  }}
                  className="min-h-[36px]"
                  title={row.ppod_confirmed ? t('unmarkPpod') : t('markPpod')}
                >
                  {row.ppod_confirmed ? (
                    <Check className="h-3.5 w-3.5 text-success-text" />
                  ) : (
                    <span className="text-xs">{t('ppod')}</span>
                  )}
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [t, updatingId, handleAccept, handleReject, handleTogglePpod, handleStatusChange],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
        actions={
          <Link href={`/${locale}/regulatory/transfers/new`}>
            <Button className="min-h-[44px] bg-teal-600 text-white hover:bg-teal-700">
              <Plus className="me-2 h-4 w-4" />
              {t('addTransfer')}
            </Button>
          </Link>
        }
      />

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('kpi.ariaLabel')}
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <KpiTile
          icon={Clock3}
          label={t('kpi.pending')}
          value={kpis.pending}
          isLoading={isSummaryLoading}
          accent={kpis.pending && kpis.pending > 0 ? 'text-warning-600' : 'text-text-tertiary'}
          tooltip={t('kpi.pendingTooltip')}
        />
        <KpiTile
          icon={CheckCircle2}
          label={t('kpi.acceptedThisYear')}
          value={kpis.accepted}
          isLoading={isSummaryLoading}
          accent="text-success-700"
          tooltip={t('kpi.acceptedThisYearTooltip')}
        />
        <KpiTile
          icon={XCircle}
          label={t('kpi.rejectedThisYear')}
          value={kpis.rejected}
          isLoading={isSummaryLoading}
          accent={kpis.rejected && kpis.rejected > 0 ? 'text-danger-600' : 'text-text-tertiary'}
          tooltip={t('kpi.rejectedThisYearTooltip')}
        />
        <KpiTile
          icon={ArrowLeftRight}
          label={t('kpi.inTransit')}
          value={kpis.inTransit}
          isLoading={isSummaryLoading}
          accent="text-cyan-700"
          tooltip={t('kpi.inTransitTooltip')}
        />
      </section>

      {/* ── Filters ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-surface-primary p-4">
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[200px_200px_auto]">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfers-direction-filter">{t('filterDirection')}</Label>
            <Select
              value={directionFilter}
              onValueChange={(value) => {
                setDirectionFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger id="transfers-direction-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allDirections')}</SelectItem>
                <SelectItem value="inbound">{t('inbound')}</SelectItem>
                <SelectItem value="outbound">{t('outbound')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfers-status-filter">{t('filterStatus')}</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            >
              <SelectTrigger id="transfers-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allStatuses')}</SelectItem>
                <SelectItem value="pending">{t('status_pending')}</SelectItem>
                <SelectItem value="accepted">{t('status_accepted')}</SelectItem>
                <SelectItem value="rejected">{t('status_rejected')}</SelectItem>
                <SelectItem value="completed">{t('status_completed')}</SelectItem>
                <SelectItem value="cancelled">{t('status_cancelled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Results table ─────────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={transfers}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />
    </div>
  );
}
