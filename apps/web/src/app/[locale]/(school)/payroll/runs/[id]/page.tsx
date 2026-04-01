'use client';

import { AlertTriangle, ChevronDown, Download, Mail, Send } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

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

interface AnomalyEntry {
  id: string;
  staff_name: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  acknowledged: boolean;
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
  const [isPopulating, setIsPopulating] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<TabKey>('entries');
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);

  const fetchRun = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [runRes, entriesRes] = await Promise.all([
        apiClient<{ data: PayrollRun }>(`/api/v1/payroll/runs/${runId}`),
        apiClient<{ data: PayrollEntry[] }>(`/api/v1/payroll/runs/${runId}/entries`),
      ]);
      setRun(runRes.data);
      setEntries(entriesRes.data);
    } catch (err) {
      console.error('[fetchRun]', err);
    } finally {
      setIsLoading(false);
    }
  }, [runId]);

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
            );
            setAllowances(res.data);
            break;
          }
          case 'adjustments': {
            const res = await apiClient<{ data: AdjustmentEntry[] }>(
              `/api/v1/payroll/runs/${runId}/adjustments`,
            );
            setAdjustments(res.data);
            break;
          }
          case 'anomalies': {
            const res = await apiClient<{ data: AnomalyEntry[] }>(
              `/api/v1/payroll/runs/${runId}/anomalies`,
            );
            setAnomalies(res.data);
            break;
          }
          case 'comparison': {
            const res = await apiClient<{ data: ComparisonEntry[] }>(
              `/api/v1/payroll/runs/${runId}/comparison`,
            );
            setComparison(res.data);
            break;
          }
          default:
            break;
        }
      } catch (err) {
        console.error('[fetchTabData]', err);
      }
    },
    [runId],
  );

  React.useEffect(() => {
    if (activeTab !== 'entries') {
      void fetchTabData(activeTab);
    }
  }, [activeTab, fetchTabData]);

  const handleRefreshEntries = async () => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/refresh-entries`, { method: 'POST' });
      void fetchRun();
    } catch (err) {
      console.error('[handleRefreshEntries]', err);
    }
  };

  const handleAutoPopulate = async () => {
    setIsPopulating(true);
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/auto-populate-classes`, { method: 'POST' });
      void fetchRun();
    } catch (err) {
      console.error('[handleAutoPopulate]', err);
    } finally {
      setIsPopulating(false);
    }
  };

  const handleFinalise = async () => {
    if (!run) return;
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/finalise`, {
        method: 'POST',
        body: JSON.stringify({ expected_updated_at: run.updated_at }),
      });
      setFinaliseOpen(false);
      void fetchRun();
    } catch (err) {
      console.error('[handleFinalise]', err);
    }
  };

  const handleCancelRun = async () => {
    if (!window.confirm(t('cancelConfirm'))) return;
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/cancel`, { method: 'POST' });
      void fetchRun();
    } catch (err) {
      console.error('[handleCancelRun]', err);
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
      });
      void fetchRun();
    } catch (err) {
      console.error('[handleUpdateWorkingDays]', err);
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
      await apiClient(`/api/v1/payroll/runs/${runId}/send-to-accountant`, { method: 'POST' });
    } catch (err) {
      console.error('[handleSendToAccountant]', err);
    }
  };

  const handleSendPayslips = async () => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/send-payslips`, { method: 'POST' });
    } catch (err) {
      console.error('[handleSendPayslips]', err);
    }
  };

  const handleAcknowledgeAnomaly = async (anomalyId: string) => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/anomalies/${anomalyId}/acknowledge`, {
        method: 'POST',
      });
      setAnomalies((prev) =>
        prev.map((a) => (a.id === anomalyId ? { ...a, acknowledged: true } : a)),
      );
    } catch (err) {
      console.error('[handleAcknowledgeAnomaly]', err);
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

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'entries', label: t('entries') },
    { key: 'allowances', label: t('allowancesTab') },
    { key: 'adjustments', label: t('adjustmentsTab') },
    {
      key: 'anomalies',
      label: `${t('anomaliesTab')}${anomalies.filter((a) => !a.acknowledged).length > 0 ? ` (${anomalies.filter((a) => !a.acknowledged).length})` : ''}`,
    },
    { key: 'comparison', label: t('comparisonTab') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => router.push(`/${locale}/payroll/runs`)}
          className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          &larr; {t('backToRuns')}
        </button>
        <PageHeader
          title={run.period_label}
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
                  <Button variant="outline" onClick={handleCancelRun}>
                    {t('cancelRun')}
                  </Button>
                  <Button onClick={() => setFinaliseOpen(true)}>{t('finalise')}</Button>
                </>
              )}
              {isFinalised && (
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
                          onClick={async () => {
                            setExportMenuOpen(false);
                            const { downloadAuthenticatedPdf } = await import('@/lib/download-pdf');
                            await downloadAuthenticatedPdf(
                              `/api/v1/payroll/runs/${runId}/payslips`,
                            );
                          }}
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

      <RunMetadataCard run={run} isDraft={isDraft} onUpdateWorkingDays={handleUpdateWorkingDays} />

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface-secondary p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
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
                key={anomaly.id}
                className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                  anomaly.acknowledged
                    ? 'border-border bg-surface opacity-60'
                    : anomaly.severity === 'high'
                      ? 'border-danger-200 bg-danger-50'
                      : anomaly.severity === 'medium'
                        ? 'border-warning-200 bg-warning-50'
                        : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      anomaly.severity === 'high'
                        ? 'text-danger-600'
                        : anomaly.severity === 'medium'
                          ? 'text-warning-600'
                          : 'text-info-500'
                    }`}
                  />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{anomaly.staff_name}</p>
                    <p className="text-sm text-text-secondary">{anomaly.description}</p>
                  </div>
                </div>
                {!anomaly.acknowledged && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAcknowledgeAnomaly(anomaly.id)}
                    className="shrink-0"
                  >
                    {t('acknowledge')}
                  </Button>
                )}
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
        onConfirm={handleFinalise}
      />
    </div>
  );
}
