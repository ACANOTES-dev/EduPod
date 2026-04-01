'use client';

import { Check, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  toast,
} from '@school/ui';


import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { RegulatoryNav } from '../../_components/regulatory-nav';


// ─── Types ──────────────────────────────────────────────────────────────────

interface Transfer {
  id: string;
  student_id: string;
  student_name: string;
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

const STATUS_VARIANT_MAP: Record<TransferStatus, SemanticVariant> = {
  pending: 'warning',
  accepted: 'success',
  rejected: 'danger',
  completed: 'info',
  cancelled: 'neutral',
};

const TERMINAL_STATUSES: TransferStatus[] = ['completed', 'cancelled', 'rejected'];

// ─── Page Component ─────────────────────────────────────────────────────────

export default function TransfersListPage() {
  const t = useTranslations('regulatory');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/')[1] ?? 'en';

  const [transfers, setTransfers] = React.useState<Transfer[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [directionFilter, setDirectionFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [isLoading, setIsLoading] = React.useState(true);

  // Track which row is being updated
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  // ─── Fetch ────────────────────────────────────────────────────────────

  const fetchTransfers = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (directionFilter !== 'all') {
        params.set('direction', directionFilter);
      }
      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

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

  // ─── Actions ──────────────────────────────────────────────────────────

  const updateTransfer = React.useCallback(
    async (id: string, body: Record<string, unknown>) => {
      setUpdatingId(id);
      try {
        await apiClient(`/api/v1/regulatory/transfers/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        toast.success(t('transfers.updateSuccess'));
        void fetchTransfers();
      } catch (err: unknown) {
        const ex = err as { error?: { message?: string }; message?: string };
        toast.error(ex?.error?.message ?? ex?.message ?? t('transfers.updateError'));
        console.error('[TransfersListPage.updateTransfer]', err);
      } finally {
        setUpdatingId(null);
      }
    },
    [fetchTransfers, t],
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

  // ─── Columns ──────────────────────────────────────────────────────────

  const columns = React.useMemo(
    () => [
      {
        key: 'student_name',
        header: t('transfers.colStudentName'),
        render: (row: Transfer) => <span className="font-medium">{row.student_name}</span>,
      },
      {
        key: 'direction',
        header: t('transfers.colDirection'),
        render: (row: Transfer) => (
          <Badge variant={row.direction === 'inbound' ? 'info' : 'secondary'}>
            {row.direction === 'inbound' ? t('transfers.inbound') : t('transfers.outbound')}
          </Badge>
        ),
      },
      {
        key: 'other_school',
        header: t('transfers.colOtherSchool'),
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
        header: t('transfers.colTransferDate'),
        render: (row: Transfer) => formatDate(row.transfer_date),
      },
      {
        key: 'status',
        header: t('transfers.colStatus'),
        render: (row: Transfer) => (
          <StatusBadge status={STATUS_VARIANT_MAP[row.status]} dot>
            {t(`transfers.status_${row.status}` as never)}
          </StatusBadge>
        ),
      },
      {
        key: 'ppod_confirmed',
        header: t('transfers.colPpodConfirmed'),
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
        header: t('transfers.colActions'),
        render: (row: Transfer) => {
          const isUpdating = updatingId === row.id;
          const isTerminal = TERMINAL_STATUSES.includes(row.status);

          return (
            <div className="flex items-center gap-1.5">
              {/* Inbound pending: Accept / Reject */}
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
                    {t('transfers.accept')}
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
                    {t('transfers.reject')}
                  </Button>
                </>
              )}

              {/* Non-inbound-pending & non-terminal: status change dropdown */}
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
                    <SelectItem value="pending">{t('transfers.status_pending')}</SelectItem>
                    <SelectItem value="accepted">{t('transfers.status_accepted')}</SelectItem>
                    <SelectItem value="completed">{t('transfers.status_completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('transfers.status_cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* PPOD confirm toggle (non-terminal) */}
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
                  title={row.ppod_confirmed ? t('transfers.unmarkPpod') : t('transfers.markPpod')}
                >
                  {row.ppod_confirmed ? (
                    <Check className="h-3.5 w-3.5 text-success-text" />
                  ) : (
                    <span className="text-xs">{t('transfers.ppod')}</span>
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

  // ─── Toolbar ──────────────────────────────────────────────────────────

  const toolbar = (
    <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-[200px_200px]">
      <Select
        value={directionFilter}
        onValueChange={(value) => {
          setDirectionFilter(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('transfers.filterDirection')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('transfers.allDirections')}</SelectItem>
          <SelectItem value="inbound">{t('transfers.inbound')}</SelectItem>
          <SelectItem value="outbound">{t('transfers.outbound')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={statusFilter}
        onValueChange={(value) => {
          setStatusFilter(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('transfers.filterStatus')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('transfers.allStatuses')}</SelectItem>
          <SelectItem value="pending">{t('transfers.status_pending')}</SelectItem>
          <SelectItem value="accepted">{t('transfers.status_accepted')}</SelectItem>
          <SelectItem value="rejected">{t('transfers.status_rejected')}</SelectItem>
          <SelectItem value="completed">{t('transfers.status_completed')}</SelectItem>
          <SelectItem value="cancelled">{t('transfers.status_cancelled')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('transfers.title')}
        description={t('transfers.description')}
        actions={
          <Link href={`/${locale}/regulatory/ppod/transfers/new`}>
            <Button className="min-h-[44px]">
              <Plus className="me-2 h-4 w-4" />
              {t('transfers.addTransfer')}
            </Button>
          </Link>
        }
      />

      <RegulatoryNav />

      <DataTable
        columns={columns}
        data={transfers}
        toolbar={toolbar}
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
