'use client';

import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, XOctagon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, StatusBadge, toast } from '@school/ui';

import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient, unwrap } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

import { CbaSyncTable } from './_components/cba-sync-table';

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
  academic_year: string;
  total: number;
  synced: number;
  pending: number;
  errors: number;
  last_synced_at: string | null;
  by_subject: SubjectBreakdown[];
}

interface BulkSyncResponse {
  synced_count: number;
  error_count: number;
  errors: Array<{ record_id: string; student_id: string; error: string }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentAcademicYear(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 9) return `${year}-${year + 1}`;
  return `${year - 1}-${year}`;
}

function generateAcademicYearOptions(): string[] {
  const now = new Date();
  const year = now.getFullYear();
  const options: string[] = [];
  for (let i = -2; i <= 1; i++) {
    const startYear = year + i;
    options.push(`${startYear}-${startYear + 1}`);
  }
  return options;
}

function formatLastSync(raw: string | null, locale: string, neverLabel: string): string {
  if (!raw) return neverLabel;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return neverLabel;
  return d.toLocaleString(fmtLocale(locale, 'en-IE'), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

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
  const t = useTranslations('regulatory.cba');
  const locale = useLocale();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_owner', 'school_principal', 'admin');

  const [academicYear, setAcademicYear] = React.useState(getCurrentAcademicYear);
  const [status, setStatus] = React.useState<CbaStatusResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSyncingAll, setIsSyncingAll] = React.useState(false);

  const academicYearOptions = React.useMemo(() => generateAcademicYearOptions(), []);

  const fetchStatus = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ academic_year: academicYear });
      const res = await apiClient<{ data: CbaStatusResponse } | CbaStatusResponse>(
        `/api/v1/regulatory/cba/status?${params.toString()}`,
        { silent: true },
      );
      setStatus(unwrap(res));
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

  const handleSyncAll = React.useCallback(async () => {
    setIsSyncingAll(true);
    try {
      const res = await apiClient<{ data: BulkSyncResponse } | BulkSyncResponse>(
        '/api/v1/regulatory/cba/sync',
        {
          method: 'POST',
          body: JSON.stringify({ academic_year: academicYear }),
        },
      );
      const response = unwrap(res);
      if (response.error_count > 0) {
        toast.error(
          t('bulkSyncPartial', { synced: response.synced_count, failed: response.error_count }),
        );
      } else {
        toast.success(t('bulkSyncSuccess', { count: response.synced_count }));
      }
      void fetchStatus();
    } catch (err) {
      console.error('[CbaSyncStatusPage.handleSyncAll]', err);
      toast.error(t('bulkSyncError'));
    } finally {
      setIsSyncingAll(false);
    }
  }, [academicYear, fetchStatus, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
        actions={
          canManage && (
            <Button
              onClick={() => void handleSyncAll()}
              disabled={
                isSyncingAll || ((status?.pending ?? 0) === 0 && (status?.errors ?? 0) === 0)
              }
              className="min-h-[44px] bg-teal-600 text-white hover:bg-teal-700"
            >
              {isSyncingAll ? (
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="me-2 h-4 w-4" />
              )}
              {t('syncAll')}
            </Button>
          )
        }
      />

      {/* ── Academic year selector ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="academic-year-select" className="text-sm font-medium text-text-secondary">
          {t('academicYear')}
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

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section aria-label={t('kpi.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={CheckCircle2}
          label={t('kpi.synced')}
          value={status?.synced}
          isLoading={isLoading}
          accent="text-success-700"
          tooltip={t('kpi.syncedTooltip')}
        />
        <KpiTile
          icon={Clock3}
          label={t('kpi.pending')}
          value={status?.pending}
          isLoading={isLoading}
          accent={status && status.pending > 0 ? 'text-warning-600' : 'text-text-tertiary'}
          tooltip={t('kpi.pendingTooltip')}
        />
        <KpiTile
          icon={XOctagon}
          label={t('kpi.errors')}
          value={status?.errors}
          isLoading={isLoading}
          accent={status && status.errors > 0 ? 'text-danger-600' : 'text-text-tertiary'}
          tooltip={t('kpi.errorsTooltip')}
        />
        <KpiTile
          icon={AlertCircle}
          label={t('kpi.lastSync')}
          value={status ? formatLastSync(status.last_synced_at, locale, t('kpi.never')) : undefined}
          isLoading={isLoading}
          accent="text-primary-700"
          tooltip={t('kpi.lastSyncTooltip')}
        />
      </section>

      {/* ── Subject breakdown ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-text-primary">{t('subjectBreakdown')}</h2>
        <div className="mt-3">
          {isLoading ? (
            <SubjectTableSkeleton />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('columnSubject')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('columnTotal')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('columnSynced')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('columnPending')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                      {t('columnErrors')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(status?.by_subject ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-text-tertiary">
                        {t('noSubjectData')}
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
                        <td className="px-4 py-3 text-sm tabular-nums text-text-primary">
                          {subject.total}
                        </td>
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

      {/* ── Pending records list ──────────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-text-primary">{t('pendingResults')}</h2>
        <div className="mt-3">
          <CbaSyncTable academicYear={academicYear} />
        </div>
      </div>
    </div>
  );
}
