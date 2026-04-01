'use client';

import { RefreshCw, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, StatusBadge, toast } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentMapping {
  id: string;
  student_id: string;
  student_name: string;
  pps_number: string | null;
  external_id: string | null;
  database_type: 'ppod' | 'pod';
  sync_status: 'pending' | 'synced' | 'changed' | 'error' | 'not_applicable';
  last_synced_at: string | null;
  last_sync_error: string | null;
}

interface StudentMappingsApiResponse {
  data: StudentMapping[];
  meta: { page: number; pageSize: number; total: number };
}

interface StudentMappingTableProps {
  databaseType: 'ppod' | 'pod';
  onSyncStudent?: (studentId: string) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const SYNC_STATUS_VARIANT: Record<
  StudentMapping['sync_status'],
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  pending: 'warning',
  synced: 'success',
  changed: 'info',
  error: 'danger',
  not_applicable: 'neutral',
};

const SYNC_STATUS_LABEL: Record<StudentMapping['sync_status'], string> = {
  pending: 'Pending',
  synced: 'Synced',
  changed: 'Changed',
  error: 'Error',
  not_applicable: 'N/A',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StudentMappingTable({ databaseType, onSyncStudent }: StudentMappingTableProps) {
  const t = useTranslations('regulatory');

  const [data, setData] = React.useState<StudentMapping[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [syncingIds, setSyncingIds] = React.useState<Set<string>>(new Set());

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchStudents = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        database_type: databaseType,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      const response = await apiClient<StudentMappingsApiResponse>(
        `/api/v1/regulatory/ppod/students?${params.toString()}`,
        { silent: true },
      );

      setData(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch (err) {
      console.error('[StudentMappingTable.fetchStudents]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [databaseType, page]);

  React.useEffect(() => {
    setPage(1);
  }, [databaseType]);

  React.useEffect(() => {
    void fetchStudents();
  }, [fetchStudents]);

  // ─── Sync Handler ───────────────────────────────────────────────────────────

  const handleSync = React.useCallback(
    async (studentId: string) => {
      setSyncingIds((prev) => new Set(prev).add(studentId));
      try {
        await apiClient(`/api/v1/regulatory/ppod/sync/${studentId}`, {
          method: 'POST',
          body: JSON.stringify({ database_type: databaseType }),
        });
        toast.success(t('ppod.syncSuccess'));
        onSyncStudent?.(studentId);
        void fetchStudents();
      } catch (err) {
        console.error('[StudentMappingTable.handleSync]', err);
        toast.error(t('ppod.syncError'));
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev);
          next.delete(studentId);
          return next;
        });
      }
    },
    [databaseType, fetchStudents, onSyncStudent, t],
  );

  // ─── Filtered Data ─────────────────────────────────────────────────────────

  const filteredData = React.useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter((row) => row.student_name.toLowerCase().includes(q));
  }, [data, searchQuery]);

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns = React.useMemo(
    () => [
      {
        key: 'student_name',
        header: t('ppod.columnStudentName'),
        render: (row: StudentMapping) => <span className="font-medium">{row.student_name}</span>,
      },
      {
        key: 'pps_number',
        header: t('ppod.columnPpsNumber'),
        render: (row: StudentMapping) => (
          <span className="font-mono text-xs">{row.pps_number ?? '—'}</span>
        ),
      },
      {
        key: 'external_id',
        header: t('ppod.columnExternalId'),
        render: (row: StudentMapping) => (
          <span className="font-mono text-xs">{row.external_id ?? '—'}</span>
        ),
      },
      {
        key: 'sync_status',
        header: t('ppod.columnSyncStatus'),
        render: (row: StudentMapping) => (
          <StatusBadge status={SYNC_STATUS_VARIANT[row.sync_status]} dot>
            {SYNC_STATUS_LABEL[row.sync_status]}
          </StatusBadge>
        ),
      },
      {
        key: 'last_synced_at',
        header: t('ppod.columnLastSynced'),
        render: (row: StudentMapping) => (
          <span className="text-xs text-text-secondary">
            {row.last_synced_at ? formatDateTime(row.last_synced_at) : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: t('ppod.columnActions'),
        render: (row: StudentMapping) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={syncingIds.has(row.student_id) || row.sync_status === 'not_applicable'}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              void handleSync(row.student_id);
            }}
          >
            <RefreshCw
              className={`me-1.5 h-3.5 w-3.5 ${syncingIds.has(row.student_id) ? 'animate-spin' : ''}`}
            />
            {t('ppod.syncButton')}
          </Button>
        ),
        className: 'w-28',
      },
    ],
    [handleSync, syncingIds, t],
  );

  // ─── Toolbar ────────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={t('ppod.searchStudents')}
        className="w-full rounded-lg border border-border bg-surface-primary py-2 ps-9 pe-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
    </div>
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <DataTable
      columns={columns}
      data={filteredData}
      toolbar={toolbar}
      page={page}
      pageSize={PAGE_SIZE}
      total={searchQuery.trim() ? filteredData.length : total}
      onPageChange={setPage}
      keyExtractor={(row) => row.id}
      isLoading={isLoading}
    />
  );
}
