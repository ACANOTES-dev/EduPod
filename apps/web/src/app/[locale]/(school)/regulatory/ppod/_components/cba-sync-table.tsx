'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { CBA_GRADE_DESCRIPTORS } from '@school/shared';
import {
  Badge,
  Button,
  StatusBadge,
  toast,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CbaRecord {
  id: string;
  student_id: string;
  student_name: string;
  subject_id: string;
  subject_name: string;
  assessment_id: string;
  cba_type: string;
  grade: string;
  sync_status: 'pending' | 'synced' | 'error';
  synced_at: string | null;
  sync_error: string | null;
}

interface CbaRecordsApiResponse {
  data: CbaRecord[];
  meta: { page: number; pageSize: number; total: number };
}

export interface CbaSyncTableProps {
  academicYear: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const SYNC_STATUS_VARIANT: Record<CbaRecord['sync_status'], 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  synced: 'success',
  error: 'danger',
};

const SYNC_STATUS_LABEL: Record<CbaRecord['sync_status'], string> = {
  pending: 'Pending',
  synced: 'Synced',
  error: 'Error',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const gradeMap = new Map<string, (typeof CBA_GRADE_DESCRIPTORS)[number]>(
  CBA_GRADE_DESCRIPTORS.map((d) => [d.grade, d]),
);

function GradeDisplay({ grade }: { grade: string }) {
  const descriptor = gradeMap.get(grade);
  if (!descriptor) {
    return <span className="text-sm text-text-secondary">{grade}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-sm">{descriptor.grade}</span>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
        {descriptor.code}
      </Badge>
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CbaSyncTable({ academicYear }: CbaSyncTableProps) {
  const t = useTranslations('regulatory');

  const [data, setData] = React.useState<CbaRecord[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(true);
  const [syncingIds, setSyncingIds] = React.useState<Set<string>>(new Set());

  // ─── Fetch ──────────────────────────────────────────────────────────────────

  const fetchRecords = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        academic_year: academicYear,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      const response = await apiClient<CbaRecordsApiResponse>(
        `/api/v1/regulatory/cba/pending?${params.toString()}`,
        { silent: true },
      );

      setData(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch (err) {
      console.error('[CbaSyncTable.fetchRecords]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [academicYear, page]);

  React.useEffect(() => {
    setPage(1);
  }, [academicYear]);

  React.useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  // ─── Sync Handler ───────────────────────────────────────────────────────────

  const handleSync = React.useCallback(
    async (studentId: string) => {
      setSyncingIds((prev) => new Set(prev).add(studentId));
      try {
        await apiClient(`/api/v1/regulatory/cba/sync/${studentId}`, {
          method: 'POST',
          body: JSON.stringify({ academic_year: academicYear }),
        });
        toast.success(t('cba.syncStudentSuccess'));
        void fetchRecords();
      } catch (err) {
        console.error('[CbaSyncTable.handleSync]', err);
        toast.error(t('cba.syncStudentError'));
      } finally {
        setSyncingIds((prev) => {
          const next = new Set(prev);
          next.delete(studentId);
          return next;
        });
      }
    },
    [academicYear, fetchRecords, t],
  );

  // ─── Columns ────────────────────────────────────────────────────────────────

  const columns = React.useMemo(
    () => [
      {
        key: 'student_name',
        header: t('cba.columnStudent'),
        render: (row: CbaRecord) => <span className="font-medium">{row.student_name}</span>,
      },
      {
        key: 'subject_name',
        header: t('cba.columnSubject'),
        render: (row: CbaRecord) => <span className="text-sm">{row.subject_name}</span>,
      },
      {
        key: 'cba_type',
        header: t('cba.columnCbaType'),
        render: (row: CbaRecord) => (
          <Badge variant="default" className="text-xs">
            {row.cba_type}
          </Badge>
        ),
      },
      {
        key: 'grade',
        header: t('cba.columnGrade'),
        render: (row: CbaRecord) => <GradeDisplay grade={row.grade} />,
      },
      {
        key: 'sync_status',
        header: t('cba.columnSyncStatus'),
        render: (row: CbaRecord) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={SYNC_STATUS_VARIANT[row.sync_status]} dot>
              {SYNC_STATUS_LABEL[row.sync_status]}
            </StatusBadge>
            {row.sync_error && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-danger-text" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">{row.sync_error}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        ),
      },
      {
        key: 'synced_at',
        header: t('cba.columnSyncedAt'),
        render: (row: CbaRecord) => (
          <span className="text-xs text-text-secondary">
            {row.synced_at ? formatDateTime(row.synced_at) : '—'}
          </span>
        ),
      },
      {
        key: 'actions',
        header: t('cba.columnActions'),
        render: (row: CbaRecord) => (
          <Button
            variant="ghost"
            size="sm"
            disabled={syncingIds.has(row.student_id) || row.sync_status === 'synced'}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              void handleSync(row.student_id);
            }}
          >
            <RefreshCw
              className={`me-1.5 h-3.5 w-3.5 ${syncingIds.has(row.student_id) ? 'animate-spin' : ''}`}
            />
            {t('cba.syncButton')}
          </Button>
        ),
        className: 'w-28',
      },
    ],
    [handleSync, syncingIds, t],
  );

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <DataTable
      columns={columns}
      data={data}
      page={page}
      pageSize={PAGE_SIZE}
      total={total}
      onPageChange={setPage}
      keyExtractor={(row) => row.id}
      isLoading={isLoading}
    />
  );
}
