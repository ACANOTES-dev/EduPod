'use client';

import { AlertTriangle, ChevronDown, Download, Mail, Send } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { downloadAuthenticatedPdf } from '@/lib/download-pdf';

import { EntriesTable } from './_components/entries-table';
import { FinaliseDialog } from './_components/finalise-dialog';
import { RunMetadataCard } from './_components/run-metadata-card';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface PayrollRun {
  id: string;
  period_label: string;
  period_month: number;
  period_year: number;
  status: string;
  headcount: number;
  total_pay: number;
  total_basic_pay: number;
  total_bonus_pay: number;
  total_working_days: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollEntry {
  id: string;
  staff_profile_id: string;
  staff_name: string;
  compensation_type: 'salaried' | 'per_class';
  days_worked: number | null;
  classes_taught: number | null;
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
  override_total_pay: number | null;
  override_note: string | null;
  notes: string | null;
  updated_at: string;
  snapshot_base_salary: number | null;
  snapshot_bonus_day_multiplier: number | null;
  snapshot_per_class_rate: number | null;
  snapshot_assigned_class_count: number | null;
  snapshot_bonus_class_rate: number | null;
}

interface AllowanceEntry {
  id: string;
  staff_name: string;
  allowance_name: string;
  amount: number;
}

interface AdjustmentEntry {
  id: string;
  staff_name: string;
  adjustment_type: string;
  amount: number;
  description: string;
  reference_period: string;
  created_by_name: string;
  created_at: string;
}

/** Wave 3 contract: scanForAnomalies returns `{ run_id, anomaly_count, anomalies }`. */
interface AnomaliesResponse {
  run_id: string;
  anomaly_count: number;
  anomalies: AnomalyEntry[];
}

interface AnomalyEntry {
  entry_id: string;
  staff_profile_id: string;
  staff_name: string;
  anomaly_type: string;
  description: string;
  severity: 'error' | 'warning';
}

interface ComparisonEntry {
  staff_profile_id: string;
  staff_name: string;
  prev_total: number | null;
  curr_total: number;
  diff: number;
  diff_pct: number | null;
  is_new: boolean;
  is_departed: boolean;
}

type TabKey = 'entries' | 'allowances' | 'adjustments' | 'anomalies' | 'comparison';

interface SessionGenStatus {
  state: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  message?: string;
}

export default function RunDetailPage() {
  const t = useTranslations('payroll');
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const runId = params?.id as string;

  const [run, setRun] = React.useState<PayrollRun | null>(null);
  const [entries, setEntries] = React.useState<PayrollEntry[]>([]);
  const [allowances, setAllowances] = React.useState<AllowanceEntry[]>([]);
  const [adjustments, setAdjustments] = React.useState<AdjustmentEntry[]>([]);
  const [anomalies, setAnomalies] = React.useState<AnomalyEntry[]>([]);
  const [comparison, setComparison] = React.useState<ComparisonEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [finaliseOpen, setFinaliseOpen] = React.useState(false);
  const [cancelOpen, setCancelOpen] = React.useState(false);
  const [isCancelling, setIsCancelling] = React.useState(false);
  const [isPopulating, setIsPopulating] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabKey>('entries');
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);
  const [sessionGenStatus, setSessionGenStatus] = React.useState<SessionGenStatus | null>(null);

  const fetchRun = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [runRes, entriesRes] = await Promise.all([
        apiClient<PayrollRun>(`/api/v1/payroll/runs/${runId}`, { silent: true }),
        apiClient<{ data: PayrollEntry[] }>(`/api/v1/payroll/runs/${runId}/entries`, {
          silent: true,
        }),
      ]);
      setRun(runRes);
      setEntries(entriesRes.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('runLoadFailed');
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [runId, t]);

  React.useEffect(() => {
    void fetchRun();
  }, [fetchRun]);

  const fetchTabData = React.useCallback(
    async (tab: TabKey) => {
      try {
        switch (tab) {
          case 'allowances': {
            const res = await apiClient<{ data: AllowanceEntry[] }>(
              `/api/v1/payroll/runs/${runId}/allowances`,
              { silent: true },
            );
            setAllowances(res.data);
            break;
          }
          case 'adjustments': {
            const res = await apiClient<{ data: AdjustmentEntry[] }>(
              `/api/v1/payroll/runs/${runId}/adjustments`,
              { silent: true },
            );
            setAdjustments(res.data);
            break;
          }
          case 'anomalies': {
            const res = await apiClient<AnomaliesResponse>(
              `/api/v1/payroll/runs/${runId}/anomalies`,
              { silent: true },
            );
            setAnomalies(res.anomalies);
            break;
          }
          case 'comparison': {
            const res = await apiClient<{ data: ComparisonEntry[] }>(
              `/api/v1/payroll/runs/${runId}/comparison`,
              { silent: true },
            );
            setComparison(res.data);
            break;
          }
          default:
            break;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t('tabLoadFailed');
        toast.error(message);
      }
    },
    [runId, t],
  );

  React.useEffect(() => {
    if (activeTab !== 'entries') {
      void fetchTabData(activeTab);
    }
  }, [activeTab, fetchTabData]);

  const handleRefreshEntries = async () => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/refresh-entries`, {
        method: 'POST',
        silent: true,
      });
      toast.success(t('entriesRefreshed'));
      void fetchRun();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('refreshFailed');
      toast.error(message);
    }
  };

  // ─── Auto-populate classes (poll session-generation status) ─────────────────
  const pollSessionGen = React.useCallback(async () => {
    try {
      const status = await apiClient<SessionGenStatus>(
        `/api/v1/payroll/runs/${runId}/session-generation-status`,
        { silent: true },
      );
      setSessionGenStatus(status);
      return status;
    } catch (err) {
      // Background poll — log only, no toast (the trigger handler shows the
      // initial state and the per-CLAUDE.md rule allows console.error for
      // background fetches).
      // eslint-disable-next-line no-console -- background poll fallback per CLAUDE.md
      console.error('[run-detail.session-gen.poll]', err);
      return null;
    }
  }, [runId]);

  const handleAutoPopulate = async () => {
    setIsPopulating(true);
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/auto-populate-classes`, {
        method: 'POST',
        silent: true,
      });
      toast.success(t('autoPopulateStarted'));
      // Begin polling status.
      const interval = setInterval(async () => {
        const status = await pollSessionGen();
        if (status && (status.state === 'completed' || status.state === 'failed')) {
          clearInterval(interval);
          setIsPopulating(false);
          if (status.state === 'completed') {
            toast.success(t('autoPopulateCompleted'));
            void fetchRun();
          } else {
            toast.error(status.message ?? t('autoPopulateFailed'));
          }
        }
      }, 2000);
      // Safety timeout: 5 minutes.
      setTimeout(() => {
        clearInterval(interval);
        setIsPopulating(false);
      }, 300_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('autoPopulateFailed');
      toast.error(message);
      setIsPopulating(false);
    }
  };

  const handleCancelRun = async () => {
    setIsCancelling(true);
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/cancel`, {
        method: 'POST',
        silent: true,
      });
      toast.success(t('runCancelled'));
      setCancelOpen(false);
      void fetchRun();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('cancelFailed');
      toast.error(message);
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUpdateWorkingDays = async (days: number) => {
    if (!run) return;
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          total_working_days: days,
          expected_updated_at: run.updated_at,
        }),
        silent: true,
      });
      toast.success(t('workingDaysUpdated'));
      void fetchRun();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('updateFailed');
      toast.error(message);
    }
  };

  const handleEntryUpdated = (updatedEntry: PayrollEntry) => {
    setEntries((prev) => prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e)));
    setRun((prev) => {
      if (!prev) return prev;
      const newEntries = entries.map((e) => (e.id === updatedEntry.id ? updatedEntry : e));
      return {
        ...prev,
        total_pay: newEntries.reduce((sum, e) => sum + (e.override_total_pay ?? e.total_pay), 0),
        total_basic_pay: newEntries.reduce((sum, e) => sum + e.basic_pay, 0),
        total_bonus_pay: newEntries.reduce((sum, e) => sum + e.bonus_pay, 0),
      };
    });
  };

  const handleSendToAccountant = async () => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/send-to-accountant`, {
        method: 'POST',
        silent: true,
      });
      toast.success(t('sendToAccountantQueued'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('sendToAccountantFailed');
      toast.error(message);
    }
  };

  const handleSendPayslips = async () => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/send-payslips`, {
        method: 'POST',
        body: JSON.stringify({ locale }),
        silent: true,
      });
      toast.success(t('sendPayslipsQueued'));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('sendPayslipsFailed');
      toast.error(message);
    }
  };

  const handleExportPayslipsPdf = async () => {
    setExportMenuOpen(false);
    try {
      await downloadAuthenticatedPdf(`/api/v1/payroll/runs/${runId}/mass-export-pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('exportFailed');
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  if (!run) {
    return <div className="py-12 text-center text-text-tertiary">{t('noData')}</div>;
  }

  const isDraft = run.status === 'draft';
  const isFinalised = run.status === 'finalised';
  const isPendingApproval = run.status === 'pending_approval';

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'entries', label: t('entries') },
    { key: 'allowances', label: t('allowancesTab') },
    { key: 'adjustments', label: t('adjustmentsTab') },
    {
      key: 'anomalies',
      label:
        anomalies.length > 0 ? `${t('anomaliesTab')} (${anomalies.length})` : t('anomaliesTab'),
    },
    { key: 'comparison', label: t('comparisonTab') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title={run.period_label}
          back={{ href: `/${locale}/payroll/runs`, label: t('backToRuns') }}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {isDraft && (
                <>
                  <Button variant="outline" onClick={handleRefreshEntries}>
                    {t('refreshEntries')}
                  </Button>
                  <Button variant="outline" onClick={handleAutoPopulate} disabled={isPopulating}>
                    {isPopulating ? t('generatingSessions') : t('autoPopulateClasses')}
                  </Button>
                  <Button variant="outline" onClick={() => setCancelOpen(true)}>
                    {t('cancelRun')}
                  </Button>
                  <Button onClick={() => setFinaliseOpen(true)}>{t('finalise')}</Button>
                </>
              )}
              {(isFinalised || isPendingApproval) && (
                <>
                  <Button variant="outline" onClick={handleSendPayslips}>
                    <Send className="me-1.5 h-4 w-4" />
                    {t('sendPayslips')}
                  </Button>
                  <Button variant="outline" onClick={handleSendToAccountant}>
                    <Mail className="me-1.5 h-4 w-4" />
                    {t('sendToAccountant')}
                  </Button>

                  {/* Export dropdown */}
                  <div className="relative">
                    <Button variant="outline" onClick={() => setExportMenuOpen((v) => !v)}>
                      <Download className="me-1.5 h-4 w-4" />
                      {t('export')}
                      <ChevronDown className="ms-1 h-3 w-3" />
                    </Button>
                    {exportMenuOpen && (
                      <div className="absolute end-0 top-full z-10 mt-1 w-44 rounded-xl border border-border bg-surface shadow-lg">
                        <button
                          className="block w-full px-4 py-2.5 text-start text-sm text-text-primary hover:bg-surface-secondary"
                          onClick={handleExportPayslipsPdf}
                        >
                          {t('exportPayslips')}
                        </button>
                        <button
                          className="block w-full px-4 py-2.5 text-start text-sm text-text-primary hover:bg-surface-secondary"
                          onClick={() => {
                            setExportMenuOpen(false);
                            router.push(`/${locale}/payroll/exports`);
                          }}
                        >
                          {t('exportWithTemplate')}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          }
        />
      </div>

      {isPendingApproval && (
        <div className="rounded-xl border border-info-border bg-info-50 px-4 py-3 text-sm text-info-text">
          {t('runPendingApprovalNotice')}
        </div>
      )}

      {sessionGenStatus &&
        (sessionGenStatus.state === 'pending' || sessionGenStatus.state === 'processing') && (
          <div className="rounded-xl border border-info-border bg-info-50 px-4 py-3 text-sm text-info-text">
            {t('sessionGenerationInProgress')}
            {typeof sessionGenStatus.progress === 'number'
              ? ` — ${sessionGenStatus.progress}%`
              : ''}
          </div>
        )}

      <RunMetadataCard run={run} isDraft={isDraft} onUpdateWorkingDays={handleUpdateWorkingDays} />

      {/* Tab bar — horizontally scrollable on mobile */}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface-secondary p-1">
        <div className="flex min-w-max gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'entries' && (
        <EntriesTable
          entries={entries}
          isDraft={isDraft}
          totalWorkingDays={run.total_working_days}
          onEntryUpdated={handleEntryUpdated}
        />
      )}

      {activeTab === 'allowances' && (
        <div className="rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            {allowances.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-tertiary">{t('noData')}</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('staffName')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('allowanceType')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                      {t('amount')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allowances.map((a) => (
                    <tr key={a.id} className="hover:bg-surface-secondary">
                      <td className="px-4 py-3 font-medium text-text-primary">{a.staff_name}</td>
                      <td className="px-4 py-3 text-text-secondary">{a.allowance_name}</td>
                      <td className="px-4 py-3 text-end text-text-primary">
                        {formatCurrency(a.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'adjustments' && (
        <div className="rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            {adjustments.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-tertiary">{t('noData')}</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('staffName')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('adjustmentType')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('description')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('referencePeriod')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                      {t('amount')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {adjustments.map((adj) => (
                    <tr key={adj.id} className="hover:bg-surface-secondary">
                      <td className="px-4 py-3 font-medium text-text-primary">{adj.staff_name}</td>
                      <td className="px-4 py-3 text-text-secondary">{adj.adjustment_type}</td>
                      <td className="px-4 py-3 text-text-secondary">{adj.description}</td>
                      <td className="px-4 py-3 text-text-secondary">{adj.reference_period}</td>
                      <td
                        className={`px-4 py-3 text-end font-medium ${
                          adj.amount < 0 ? 'text-danger-600' : 'text-success-600'
                        }`}
                      >
                        {adj.amount > 0 ? '+' : ''}
                        {formatCurrency(adj.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === 'anomalies' && (
        <div className="space-y-3">
          {anomalies.length === 0 ? (
            <div className="rounded-2xl border border-success-200 bg-success-50 py-12 text-center text-sm text-success-text">
              {t('noAnomalies')}
            </div>
          ) : (
            anomalies.map((anomaly) => (
              <div
                key={`${anomaly.entry_id}-${anomaly.anomaly_type}`}
                className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  anomaly.severity === 'error'
                    ? 'border-danger-200 bg-danger-50'
                    : 'border-warning-200 bg-warning-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      anomaly.severity === 'error' ? 'text-danger-600' : 'text-warning-600'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{anomaly.staff_name}</p>
                    <p className="text-sm text-text-secondary">{anomaly.description}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'comparison' && (
        <div className="rounded-2xl border border-border bg-surface">
          <div className="overflow-x-auto">
            {comparison.length === 0 ? (
              <div className="py-12 text-center text-sm text-text-tertiary">
                {t('noPreviousRunForComparison')}
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                      {t('staffName')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                      {t('prevMonthTotal')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                      {t('thisMonthTotal')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                      {t('difference')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {comparison.map((row) => (
                    <tr
                      key={row.staff_profile_id}
                      className={
                        row.is_new
                          ? 'bg-success-50'
                          : row.is_departed
                            ? 'bg-danger-50'
                            : 'hover:bg-surface-secondary'
                      }
                    >
                      <td className="px-4 py-3 font-medium text-text-primary">
                        {row.staff_name}
                        {row.is_new && (
                          <span className="ms-2 rounded-full bg-success-100 px-2 py-0.5 text-xs text-success-text">
                            {t('newStaff')}
                          </span>
                        )}
                        {row.is_departed && (
                          <span className="ms-2 rounded-full bg-danger-100 px-2 py-0.5 text-xs text-danger-text">
                            {t('departed')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-end text-text-secondary">
                        {row.prev_total != null ? formatCurrency(row.prev_total) : '—'}
                      </td>
                      <td className="px-4 py-3 text-end text-text-primary">
                        {formatCurrency(row.curr_total)}
                      </td>
                      <td
                        className={`px-4 py-3 text-end font-medium ${
                          row.diff > 0
                            ? 'text-success-600'
                            : row.diff < 0
                              ? 'text-danger-600'
                              : 'text-text-tertiary'
                        }`}
                      >
                        {row.diff === 0
                          ? '—'
                          : `${row.diff > 0 ? '+' : ''}${formatCurrency(row.diff)}`}
                        {row.diff_pct != null && row.diff !== 0 && (
                          <span className="ms-1 text-xs text-text-tertiary">
                            ({row.diff > 0 ? '+' : ''}
                            {row.diff_pct.toFixed(1)}%)
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Summary footer */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-text-primary">{t('runSummary')}</h3>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-text-tertiary">{t('headcount')}</p>
            <p className="text-lg font-semibold text-text-primary">{entries.length}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('basicPay')}</p>
            <p className="text-lg font-semibold text-text-primary">
              {formatCurrency(run.total_basic_pay)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('bonusPay')}</p>
            <p className="text-lg font-semibold text-text-primary">
              {formatCurrency(run.total_bonus_pay)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('grandTotal')}</p>
            <p className="text-lg font-semibold text-text-primary">
              {formatCurrency(run.total_pay)}
            </p>
          </div>
        </div>
      </div>

      <FinaliseDialog
        open={finaliseOpen}
        onOpenChange={setFinaliseOpen}
        run={run}
        onSuccess={() => {
          // Reload run state — controller's response (`pending` flag) is
          // already surfaced as a success toast inside the dialog.
          void fetchRun();
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={t('cancelRun')}
        description={t('cancelConfirm')}
        confirmLabel={t('cancelRun')}
        cancelLabel={t('keep')}
        variant="destructive"
        busy={isCancelling}
        onConfirm={handleCancelRun}
      />
    </div>
  );
}
