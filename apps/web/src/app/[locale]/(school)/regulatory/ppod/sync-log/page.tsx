'use client';

import { Filter } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

import { ErrorBanner } from '../../_components/error-banner';

// ─── Types ──────────────────────────────────────────────────────────────────

type SyncLogStatus =
  | 'sync_in_progress'
  | 'sync_completed'
  | 'completed_with_errors'
  | 'sync_failed';
type SyncType = 'full' | 'incremental' | 'manual';
type DatabaseFilter = 'all' | 'ppod' | 'pod';

interface SyncLogEntry {
  id: string;
  database_type: 'ppod' | 'pod';
  sync_type: SyncType;
  triggered_by_id: string | null;
  triggered_by: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  started_at: string;
  completed_at: string | null;
  status: SyncLogStatus;
  records_pushed: number | null;
  records_created: number | null;
  records_updated: number | null;
  records_failed: number | null;
  error_details: unknown | null;
  transport_used: string | null;
}

interface SyncLogApiResponse {
  data: SyncLogEntry[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<SyncLogStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> =
  {
    sync_in_progress: 'info',
    sync_completed: 'success',
    completed_with_errors: 'warning',
    sync_failed: 'danger',
  };

// ─── Helpers ────────────────────────────────────────────────────────────────

function computeDuration(startedAt: string, completedAt: string | null): string {
  if (!completedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;
  if (diffMs < 0) return '—';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function PpodSyncLogPage() {
  const t = useTranslations('regulatory.ppod');
  const locale = useLocale();

  const [databaseFilter, setDatabaseFilter] = React.useState<DatabaseFilter>('all');
  const [syncTypeFilter, setSyncTypeFilter] = React.useState<'all' | SyncType>('all');
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<SyncLogEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [selectedEntry, setSelectedEntry] = React.useState<SyncLogEntry | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    if (databaseFilter !== 'all') {
      params.set('database_type', databaseFilter);
    }

    apiClient<SyncLogApiResponse>(`/api/v1/regulatory/ppod/sync-log?${params.toString()}`, {
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        setRows(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      })
      .catch((err) => {
        console.error('[PpodSyncLogPage] fetch failed', err);
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
  }, [databaseFilter, page, reloadKey, t]);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [databaseFilter, syncTypeFilter]);

  const filteredRows = React.useMemo(() => {
    if (syncTypeFilter === 'all') return rows;
    return rows.filter((r) => r.sync_type === syncTypeFilter);
  }, [rows, syncTypeFilter]);

  // ── Columns ──────────────────────────────────────────────────────────────
  const columns = React.useMemo(
    () => [
      {
        key: 'database',
        header: t('columnDatabase'),
        render: (row: SyncLogEntry) => (
          <Badge variant="secondary">
            {row.database_type === 'ppod' ? t('typePpod') : t('typePod')}
          </Badge>
        ),
        className: 'w-24',
      },
      {
        key: 'sync_type',
        header: t('columnSyncType'),
        render: (row: SyncLogEntry) => (
          <span className="text-sm">{t(`syncTypeLabel.${row.sync_type}`)}</span>
        ),
      },
      {
        key: 'triggered_by',
        header: t('columnTriggeredBy'),
        render: (row: SyncLogEntry) => (
          <span className="text-sm text-text-secondary">
            {row.triggered_by
              ? `${row.triggered_by.first_name} ${row.triggered_by.last_name}`
              : t('systemLabel')}
          </span>
        ),
      },
      {
        key: 'started_at',
        header: t('columnStartedAt'),
        render: (row: SyncLogEntry) => (
          <span className="text-xs text-text-secondary">{formatDateTime(row.started_at)}</span>
        ),
      },
      {
        key: 'status',
        header: t('columnStatus'),
        render: (row: SyncLogEntry) => (
          <StatusBadge status={STATUS_VARIANT[row.status]} dot>
            {t(`statusLabel.${row.status}`)}
          </StatusBadge>
        ),
      },
      {
        key: 'records',
        header: t('columnRecords'),
        render: (row: SyncLogEntry) => (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            {row.records_pushed !== null && row.records_pushed > 0 && (
              <span>
                <span className="text-text-tertiary">{t('recordsPushed')}: </span>
                <span className="font-medium">{row.records_pushed}</span>
              </span>
            )}
            {row.records_created !== null && row.records_created > 0 && (
              <span>
                <span className="text-text-tertiary">{t('recordsCreated')}: </span>
                <span className="font-medium text-success-text">{row.records_created}</span>
              </span>
            )}
            {row.records_updated !== null && row.records_updated > 0 && (
              <span>
                <span className="text-text-tertiary">{t('recordsUpdated')}: </span>
                <span className="font-medium text-info-text">{row.records_updated}</span>
              </span>
            )}
            {row.records_failed !== null && row.records_failed > 0 && (
              <span>
                <span className="text-text-tertiary">{t('recordsFailed')}: </span>
                <span className="font-medium text-danger-text">{row.records_failed}</span>
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'duration',
        header: t('columnDuration'),
        render: (row: SyncLogEntry) => (
          <span className="font-mono text-xs text-text-secondary">
            {computeDuration(row.started_at, row.completed_at)}
          </span>
        ),
        className: 'w-24',
      },
    ],
    [t],
  );

  // ── Toolbar ──────────────────────────────────────────────────────────────
  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-text-tertiary" aria-hidden />
        <Select
          value={databaseFilter}
          onValueChange={(v) => setDatabaseFilter(v as DatabaseFilter)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('databaseFilterAll')}</SelectItem>
            <SelectItem value="ppod">{t('typePpod')}</SelectItem>
            <SelectItem value="pod">{t('typePod')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Select
        value={syncTypeFilter}
        onValueChange={(v) => setSyncTypeFilter(v as 'all' | SyncType)}
      >
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('syncTypeFilterAll')}</SelectItem>
          <SelectItem value="full">{t('syncTypeLabel.full')}</SelectItem>
          <SelectItem value="incremental">{t('syncTypeLabel.incremental')}</SelectItem>
          <SelectItem value="manual">{t('syncTypeLabel.manual')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('syncLogTitle')}
        description={t('syncLogDescription')}
        back={{ href: `/${locale}/regulatory/ppod`, label: t('backToPpod') }}
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
        total={syncTypeFilter === 'all' ? total : filteredRows.length}
        onPageChange={setPage}
        onRowClick={(row) => setSelectedEntry(row)}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <Sheet open={selectedEntry !== null} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <SheetContent className="w-full max-w-xl overflow-y-auto">
          {selectedEntry && (
            <>
              <SheetHeader>
                <SheetTitle>{t('detailDrawerTitle')}</SheetTitle>
                <SheetDescription>
                  {formatDateTime(selectedEntry.started_at)} —{' '}
                  {t(`statusLabel.${selectedEntry.status}`)}
                </SheetDescription>
              </SheetHeader>
              <dl className="mt-6 grid grid-cols-1 gap-x-4 gap-y-3 text-sm">
                <DetailRow
                  label={t('columnDatabase')}
                  value={selectedEntry.database_type === 'ppod' ? t('typePpod') : t('typePod')}
                />
                <DetailRow
                  label={t('columnSyncType')}
                  value={t(`syncTypeLabel.${selectedEntry.sync_type}`)}
                />
                <DetailRow
                  label={t('columnTriggeredBy')}
                  value={
                    selectedEntry.triggered_by
                      ? `${selectedEntry.triggered_by.first_name} ${selectedEntry.triggered_by.last_name}`
                      : t('systemLabel')
                  }
                />
                <DetailRow
                  label={t('columnStartedAt')}
                  value={formatDateTime(selectedEntry.started_at)}
                />
                <DetailRow
                  label={t('detailCompletedAt')}
                  value={
                    selectedEntry.completed_at ? formatDateTime(selectedEntry.completed_at) : '—'
                  }
                />
                <DetailRow
                  label={t('columnDuration')}
                  value={computeDuration(selectedEntry.started_at, selectedEntry.completed_at)}
                />
                <DetailRow
                  label={t('recordsPushed')}
                  value={String(selectedEntry.records_pushed ?? 0)}
                />
                <DetailRow
                  label={t('recordsCreated')}
                  value={String(selectedEntry.records_created ?? 0)}
                />
                <DetailRow
                  label={t('recordsUpdated')}
                  value={String(selectedEntry.records_updated ?? 0)}
                />
                <DetailRow
                  label={t('recordsFailed')}
                  value={String(selectedEntry.records_failed ?? 0)}
                />
                {selectedEntry.transport_used && (
                  <DetailRow label={t('detailTransport')} value={selectedEntry.transport_used} />
                )}
              </dl>
              {selectedEntry.error_details !== null &&
                selectedEntry.error_details !== undefined && (
                  <div className="mt-6">
                    <h3 className="mb-2 text-sm font-semibold text-text-primary">
                      {t('errorDetails')}
                    </h3>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-surface-secondary p-3 font-mono text-xs text-text-secondary">
                      {typeof selectedEntry.error_details === 'string'
                        ? selectedEntry.error_details
                        : JSON.stringify(selectedEntry.error_details, null, 2)}
                    </pre>
                  </div>
                )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 pb-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd className="text-end text-sm text-text-primary">{value}</dd>
    </div>
  );
}
