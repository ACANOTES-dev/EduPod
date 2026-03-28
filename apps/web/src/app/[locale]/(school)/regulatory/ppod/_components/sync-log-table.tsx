'use client';

import { Badge, StatusBadge } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SyncLogEntry {
  id: string;
  database_type: 'ppod' | 'pod';
  sync_type: 'full' | 'incremental' | 'manual';
  triggered_by_name: string | null;
  started_at: string;
  completed_at: string | null;
  status: 'in_progress' | 'completed' | 'completed_with_errors' | 'failed';
  records_pushed: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  error_details: unknown | null;
}

interface SyncLogApiResponse {
  data: SyncLogEntry[];
  meta: { page: number; pageSize: number; total: number };
}

interface SyncLogTableProps {
  databaseType?: 'ppod' | 'pod';
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_VARIANT: Record<SyncLogEntry['status'], 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  in_progress: 'info',
  completed: 'success',
  completed_with_errors: 'warning',
  failed: 'danger',
};

const STATUS_LABEL: Record<SyncLogEntry['status'], string> = {
  in_progress: 'In Progress',
  completed: 'Completed',
  completed_with_errors: 'Partial',
  failed: 'Failed',
};

const SYNC_TYPE_LABEL: Record<SyncLogEntry['sync_type'], string> = {
  full: 'Full',
  incremental: 'Incremental',
  manual: 'Manual',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

export function SyncLogTable({ databaseType }: SyncLogTableProps) {
  const t = useTranslations('regulatory');

  const [data, setData] = React.useState<SyncLogEntry[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchSyncLog = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (databaseType) {
        params.set('database_type', databaseType);
      }

      const response = await apiClient<SyncLogApiResponse>(
        `/api/v1/regulatory/ppod/sync-log?${params.toString()}`,
        { silent: true },
      );

      setData(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch (err) {
      console.error('[SyncLogTable.fetchSyncLog]', err);
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
    void fetchSyncLog();
  }, [fetchSyncLog]);

  // ─── Toggle Error Details ───────────────────────────────────────────────────

  const toggleExpanded = React.useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns = React.useMemo(() => [
    {
      key: 'database_type',
      header: t('ppod.columnDatabase'),
      render: (row: SyncLogEntry) => (
        <Badge variant="secondary">
          {row.database_type.toUpperCase()}
        </Badge>
      ),
      className: 'w-24',
    },
    {
      key: 'sync_type',
      header: t('ppod.columnSyncType'),
      render: (row: SyncLogEntry) => (
        <span className="text-sm">{SYNC_TYPE_LABEL[row.sync_type]}</span>
      ),
    },
    {
      key: 'triggered_by_name',
      header: t('ppod.columnTriggeredBy'),
      render: (row: SyncLogEntry) => (
        <span className="text-sm text-text-secondary">
          {row.triggered_by_name ?? t('ppod.system')}
        </span>
      ),
    },
    {
      key: 'started_at',
      header: t('ppod.columnStartedAt'),
      render: (row: SyncLogEntry) => (
        <span className="text-xs text-text-secondary">
          {formatDateTime(row.started_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('ppod.columnStatus'),
      render: (row: SyncLogEntry) => (
        <StatusBadge status={STATUS_VARIANT[row.status]} dot>
          {STATUS_LABEL[row.status]}
        </StatusBadge>
      ),
    },
    {
      key: 'records',
      header: t('ppod.columnRecords'),
      render: (row: SyncLogEntry) => (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          <span title="Pushed">
            <span className="text-text-tertiary">{t('ppod.pushed')}: </span>
            <span className="font-medium">{row.records_pushed}</span>
          </span>
          <span title="Created">
            <span className="text-text-tertiary">{t('ppod.created')}: </span>
            <span className="font-medium text-success-text">{row.records_created}</span>
          </span>
          <span title="Updated">
            <span className="text-text-tertiary">{t('ppod.updated')}: </span>
            <span className="font-medium text-info-text">{row.records_updated}</span>
          </span>
          {row.records_failed > 0 && (
            <span title="Failed">
              <span className="text-text-tertiary">{t('ppod.failed')}: </span>
              <span className="font-medium text-danger-text">{row.records_failed}</span>
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'duration',
      header: t('ppod.columnDuration'),
      render: (row: SyncLogEntry) => (
        <span className="text-xs font-mono text-text-secondary">
          {computeDuration(row.started_at, row.completed_at)}
        </span>
      ),
      className: 'w-24',
    },
  ], [t]);

  // ─── Row Click for Error Expand ─────────────────────────────────────────────

  const handleRowClick = React.useCallback((row: SyncLogEntry) => {
    if (row.error_details || row.status === 'failed' || row.status === 'completed_with_errors') {
      toggleExpanded(row.id);
    }
  }, [toggleExpanded]);

  // ─── Enriched Data with Expand Row ──────────────────────────────────────────

  const enrichedData = React.useMemo(() => {
    if (!expandedId) return data;

    const result: SyncLogEntry[] = [];
    for (const row of data) {
      result.push(row);
      if (row.id === expandedId && row.error_details) {
        // We keep the same data — error details rendered inline via conditional below
      }
    }
    return result;
  }, [data, expandedId]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0">
      <DataTable
        columns={columns}
        data={enrichedData}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onRowClick={handleRowClick}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      {/* ─── Expanded Error Details ──────────────────────────────────────── */}
      {expandedId && (
        <ExpandedErrorDetails
          entry={data.find((r) => r.id === expandedId)}
          onClose={() => setExpandedId(null)}
        />
      )}
    </div>
  );
}

// ─── Error Details Panel ──────────────────────────────────────────────────────

interface ExpandedErrorDetailsProps {
  entry: SyncLogEntry | undefined;
  onClose: () => void;
}

function ExpandedErrorDetails({ entry, onClose }: ExpandedErrorDetailsProps) {
  const t = useTranslations('regulatory');

  if (!entry?.error_details) return null;

  const errorText = typeof entry.error_details === 'string'
    ? entry.error_details
    : JSON.stringify(entry.error_details, null, 2);

  return (
    <div className="rounded-b-lg border border-t-0 border-border bg-danger-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-xs font-semibold text-danger-text">
            {t('ppod.errorDetails')}
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-surface-primary p-2 font-mono text-xs text-text-secondary">
            {errorText}
          </pre>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary"
          aria-label="Close"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
