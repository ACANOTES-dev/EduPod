'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, StatCard, StatusBadge, toast } from '@school/ui';

import { RegulatoryNav } from '../../_components/regulatory-nav';
import { CbaSyncTable } from '../_components/cba-sync-table';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectBreakdown {
  subject_id: string;
  subject_name: string;
  total: number;
  synced: number;
  pending: number;
  errors: number;
}

interface CbaStatusResponse {
  total_records: number;
  synced: number;
  pending: number;
  errors: number;
  by_subject: SubjectBreakdown[];
}

interface BulkSyncResponse {
  synced: number;
  failed: number;
  errors: Array<{ student_id: string; message: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-indexed
  if (month >= 9) {
    return `${year}-${year + 1}`;
  }
  return `${year - 1}-${year}`;
}

function generateAcademicYearOptions(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const options: string[] = [];
  // Show 3 years back and current
  for (let i = -2; i <= 1; i++) {
    const startYear = year + i;
    options.push(`${startYear}-${startYear + 1}`);
  }
  return options;
}

// ─── Skeleton Components ────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface-secondary p-5">
      <div className="h-3 w-20 rounded bg-border" />
      <div className="mt-3 h-7 w-16 rounded bg-border" />
    </div>
  );
}

function SubjectTableSkeleton() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-surface-secondary">
            {[1, 2, 3, 4, 5].map((i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-3 w-20 animate-pulse rounded bg-border" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((row) => (
            <tr key={row} className="border-b border-border last:border-b-0">
              {[1, 2, 3, 4, 5].map((col) => (
                <td key={col} className="px-4 py-3">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface-secondary" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CbaSyncStatusPage() {
  const t = useTranslations('regulatory');

  const [academicYear, setAcademicYear] = React.useState(getCurrentAcademicYear);
  const [status, setStatus] = React.useState<CbaStatusResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSyncingAll, setIsSyncingAll] = React.useState(false);

  const academicYearOptions = React.useMemo(() => generateAcademicYearOptions(), []);

  // ─── Fetch Status ───────────────────────────────────────────────────────────

  const fetchStatus = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ academic_year: academicYear });
      const response = await apiClient<CbaStatusResponse>(
        `/api/v1/regulatory/cba/status?${params.toString()}`,
        { silent: true },
      );
      setStatus(response);
    } catch (err) {
      console.error('[CbaSyncStatusPage.fetchStatus]', err);
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [academicYear]);

  React.useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // ─── Bulk Sync Handler ──────────────────────────────────────────────────────

  const handleSyncAll = React.useCallback(async () => {
    setIsSyncingAll(true);
    try {
      const response = await apiClient<BulkSyncResponse>('/api/v1/regulatory/cba/sync', {
        method: 'POST',
        body: JSON.stringify({ academic_year: academicYear }),
      });
      if (response.failed > 0) {
        toast.error(t('cba.bulkSyncPartial', { synced: response.synced, failed: response.failed }));
      } else {
        toast.success(t('cba.bulkSyncSuccess', { count: response.synced }));
      }
      void fetchStatus();
    } catch (err) {
      console.error('[CbaSyncStatusPage.handleSyncAll]', err);
      toast.error(t('cba.bulkSyncError'));
    } finally {
      setIsSyncingAll(false);
    }
  }, [academicYear, fetchStatus, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('cba.title')}
        description={t('cba.description')}
        actions={
          <Button
            onClick={() => void handleSyncAll()}
            disabled={isSyncingAll || (status?.pending === 0 && status?.errors === 0)}
          >
            {isSyncingAll ? (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="me-2 h-4 w-4" />
            )}
            {t('cba.syncAll')}
          </Button>
        }
      />

      <RegulatoryNav />

      {/* ─── Academic Year Selector ──────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <label htmlFor="academic-year-select" className="text-sm font-medium text-text-secondary">
          {t('cba.academicYear')}
        </label>
        <select
          id="academic-year-select"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          className="rounded-lg border border-border bg-surface-primary px-3 py-2 text-sm text-text-primary focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {academicYearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {/* ─── Summary Stat Cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </>
        ) : (
          <>
            <StatCard label={t('cba.totalRecords')} value={status?.total_records ?? 0} />
            <StatCard
              label={t('cba.synced')}
              value={status?.synced ?? 0}
              trend={
                status && status.synced > 0
                  ? { direction: 'up', label: t('cba.upToDate') }
                  : undefined
              }
            />
            <StatCard
              label={t('cba.pending')}
              value={status?.pending ?? 0}
              trend={
                status && status.pending > 0
                  ? { direction: 'neutral', label: t('cba.awaitingSync') }
                  : undefined
              }
            />
            <StatCard
              label={t('cba.errors')}
              value={status?.errors ?? 0}
              trend={
                status && status.errors > 0
                  ? { direction: 'down', label: t('cba.requiresAttention') }
                  : undefined
              }
            />
          </>
        )}
      </div>

      {/* ─── Subject Breakdown Table ─────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t('cba.subjectBreakdown')}</h2>
        <div className="mt-3">
          {isLoading ? (
            <SubjectTableSkeleton />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('cba.columnSubject')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('cba.columnTotal')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('cba.columnSynced')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('cba.columnPending')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('cba.columnErrors')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {status?.by_subject.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-sm text-text-tertiary">
                        {t('cba.noSubjectData')}
                      </td>
                    </tr>
                  ) : (
                    status?.by_subject.map((subject) => (
                      <tr
                        key={subject.subject_id}
                        className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">
                          {subject.subject_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-primary">{subject.total}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status="success" dot>
                            {subject.synced}
                          </StatusBadge>
                        </td>
                        <td className="px-4 py-3">
                          {subject.pending > 0 ? (
                            <Badge variant="warning">{subject.pending}</Badge>
                          ) : (
                            <span className="text-sm text-text-tertiary">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {subject.errors > 0 ? (
                            <Badge variant="danger">{subject.errors}</Badge>
                          ) : (
                            <span className="text-sm text-text-tertiary">0</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── CBA Sync Records Table ──────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t('cba.syncRecords')}</h2>
        <div className="mt-3">
          <CbaSyncTable academicYear={academicYear} />
        </div>
      </div>
    </div>
  );
}
