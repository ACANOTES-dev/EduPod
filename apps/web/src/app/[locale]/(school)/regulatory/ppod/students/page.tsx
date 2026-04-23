'use client';

import { Filter, RefreshCw, Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
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
import { formatDateTime } from '@/lib/format-date';

import { ErrorBanner } from '../../_components/error-banner';
import { DatabaseToggle, type DatabaseType } from '../_components/database-toggle';

// ─── Types ──────────────────────────────────────────────────────────────────

type SyncStatus = 'pending' | 'synced' | 'changed' | 'error' | 'not_applicable';

interface StudentMapping {
  id: string;
  student_id: string;
  database_type: DatabaseType;
  external_id: string | null;
  sync_status: SyncStatus;
  last_synced_at: string | null;
  last_sync_error: string | null;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
  } | null;
}

interface StudentsApiResponse {
  data: StudentMapping[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<SyncStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  pending: 'warning',
  synced: 'success',
  changed: 'info',
  error: 'danger',
  not_applicable: 'neutral',
};

const STATUS_KEYS: SyncStatus[] = ['pending', 'synced', 'changed', 'error', 'not_applicable'];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PpodStudentsPage() {
  const t = useTranslations('regulatory.ppod');
  const locale = useLocale();

  const [databaseType, setDatabaseType] = React.useState<DatabaseType>('ppod');
  const [statusFilter, setStatusFilter] = React.useState<'all' | SyncStatus>('all');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<StudentMapping[]>([]);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [syncingIds, setSyncingIds] = React.useState<Set<string>>(new Set());

  // ── Fetch ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      database_type: databaseType,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });

    apiClient<StudentsApiResponse>(`/api/v1/regulatory/ppod/students?${params.toString()}`, {
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      })
      .catch((err) => {
        console.error('[PpodStudentsPage] fetch failed', err);
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(t('loadError'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [databaseType, page, reloadKey, t]);

  // Reset page when database or filter changes
  React.useEffect(() => {
    setPage(1);
  }, [databaseType, statusFilter]);

  // ── Row-level sync ───────────────────────────────────────────────────────
  const handleSync = React.useCallback(
    async (studentId: string) => {
      setSyncingIds((prev) => new Set(prev).add(studentId));
      try {
        await apiClient(`/api/v1/regulatory/ppod/sync/${studentId}`, {
          method: 'POST',
          body: JSON.stringify({ database_type: databaseType }),
        });
        toast.success(t('syncSuccess'));
        setReloadKey((k) => k + 1);
      } catch (err) {
        console.error('[PpodStudentsPage] sync failed', err);
        toast.error(t('syncError'));
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev);
          next.delete(studentId);
          return next;
        });
      }
    },
    [databaseType, t],
  );

  // ── Filters ──────────────────────────────────────────────────────────────
  const filteredRows = React.useMemo(() => {
    let list = rows;
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.sync_status === statusFilter);
    }
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const name = r.student ? `${r.student.first_name} ${r.student.last_name}` : '';
        const num = r.student?.student_number ?? '';
        const ext = r.external_id ?? '';
        return (
          name.toLowerCase().includes(q) ||
          num.toLowerCase().includes(q) ||
          ext.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [rows, statusFilter, searchQuery]);

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns = React.useMemo(
    () => [
      {
        key: 'student',
        header: t('columnStudentName'),
        render: (row: StudentMapping) => (
          <span className="font-medium text-text-primary">
            {row.student ? `${row.student.first_name} ${row.student.last_name}` : '—'}
          </span>
        ),
      },
      {
        key: 'student_number',
        header: t('columnPpsNumber'),
        render: (row: StudentMapping) => (
          <span className="font-mono text-xs" dir="ltr">
            {row.student?.student_number ?? '—'}
          </span>
        ),
      },
      {
        key: 'external_id',
        header: t('columnExternalId'),
        render: (row: StudentMapping) => (
          <span className="font-mono text-xs" dir="ltr">
            {row.external_id ?? '—'}
          </span>
        ),
      },
      {
        key: 'sync_status',
        header: t('columnSyncStatus'),
        render: (row: StudentMapping) => (
          <StatusBadge status={STATUS_VARIANT[row.sync_status]} dot>
            {t(`statusLabel.${row.sync_status}`)}
          </StatusBadge>
        ),
      },
      {
        key: 'last_synced_at',
        header: t('columnLastSynced'),
        render: (row: StudentMapping) => (
          <span className="text-xs text-text-secondary">
            {row.last_synced_at ? formatDateTime(row.last_synced_at) : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: t('columnActions'),
        render: (row: StudentMapping) => {
          const isSyncing = syncingIds.has(row.student_id);
          const disabled = isSyncing || row.sync_status === 'not_applicable';
          return (
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                void handleSync(row.student_id);
              }}
            >
              <RefreshCw className={`me-1.5 h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {t('syncRow')}
            </Button>
          );
        },
        className: 'w-32',
      },
    ],
    [handleSync, syncingIds, t],
  );

  // ── Toolbar ──────────────────────────────────────────────────────────────
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="w-full rounded-lg border border-border bg-surface py-2 ps-9 pe-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-text-tertiary" aria-hidden />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'all' | SyncStatus)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('statusFilterAll')}</SelectItem>
            {STATUS_KEYS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`statusLabel.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('studentsTitle')}
        description={t('studentsDescription')}
        back={{ href: `/${locale}/regulatory/ppod`, label: t('backToPpod') }}
        actions={<DatabaseToggle value={databaseType} onChange={setDatabaseType} />}
      />

      {error && (
        <ErrorBanner
          message={error}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      <DataTable
        columns={columns}
        data={filteredRows}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={searchQuery.trim() || statusFilter !== 'all' ? filteredRows.length : total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />
    </div>
  );
}
