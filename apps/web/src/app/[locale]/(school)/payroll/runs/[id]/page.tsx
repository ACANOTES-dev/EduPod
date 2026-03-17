'use client';

import { useTranslations } from 'next-intl';
import { useParams, usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { Button, StatusBadge } from '@school/ui';
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

const statusVariantMap: Record<string, 'success' | 'warning' | 'info' | 'neutral' | 'danger'> = {
  draft: 'warning',
  pending_approval: 'info',
  finalised: 'success',
  cancelled: 'neutral',
};

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
  notes: string | null;
}

export default function RunDetailPage() {
  const t = useTranslations('payroll');
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';
  const runId = params.id as string;

  const [run, setRun] = React.useState<PayrollRun | null>(null);
  const [entries, setEntries] = React.useState<PayrollEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [finaliseOpen, setFinaliseOpen] = React.useState(false);
  const [isPopulating, setIsPopulating] = React.useState(false);

  const fetchRun = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [runRes, entriesRes] = await Promise.all([
        apiClient<{ data: PayrollRun }>(`/api/v1/payroll/runs/${runId}`),
        apiClient<{ data: PayrollEntry[] }>(`/api/v1/payroll/runs/${runId}/entries`),
      ]);
      setRun(runRes.data);
      setEntries(entriesRes.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [runId]);

  React.useEffect(() => {
    void fetchRun();
  }, [fetchRun]);

  const handleRefreshEntries = async () => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/refresh-entries`, { method: 'POST' });
      void fetchRun();
    } catch {
      // silent
    }
  };

  const handleAutoPopulate = async () => {
    setIsPopulating(true);
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/auto-populate-classes`, { method: 'POST' });
      void fetchRun();
    } catch {
      // silent
    } finally {
      setIsPopulating(false);
    }
  };

  const handleFinalise = async () => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/finalise`, { method: 'POST' });
      setFinaliseOpen(false);
      void fetchRun();
    } catch {
      // silent
    }
  };

  const handleCancelRun = async () => {
    if (!window.confirm(t('cancelConfirm'))) return;
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}/cancel`, { method: 'POST' });
      void fetchRun();
    } catch {
      // silent
    }
  };

  const handleUpdateWorkingDays = async (days: number) => {
    try {
      await apiClient(`/api/v1/payroll/runs/${runId}`, {
        method: 'PATCH',
        body: JSON.stringify({ total_working_days: days }),
      });
      void fetchRun();
    } catch {
      // silent
    }
  };

  const handleEntryUpdated = (updatedEntry: PayrollEntry) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === updatedEntry.id ? updatedEntry : e))
    );
    // Recalculate run totals locally
    setRun((prev) => {
      if (!prev) return prev;
      const newEntries = entries.map((e) => (e.id === updatedEntry.id ? updatedEntry : e));
      return {
        ...prev,
        total_pay: newEntries.reduce((sum, e) => sum + e.total_pay, 0),
        total_basic_pay: newEntries.reduce((sum, e) => sum + e.basic_pay, 0),
        total_bonus_pay: newEntries.reduce((sum, e) => sum + e.bonus_pay, 0),
      };
    });
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
    return (
      <div className="py-12 text-center text-text-tertiary">{t('noData')}</div>
    );
  }

  const isDraft = run.status === 'draft';

  return (
    <div className="space-y-6">
      <PageHeader
        title={run.period_label}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push(`/${locale}/payroll/runs`)}>
              {t('cancel')}
            </Button>
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
                <Button onClick={() => setFinaliseOpen(true)}>
                  {t('finalise')}
                </Button>
              </>
            )}
            {run.status === 'finalised' && (
              <Button
                variant="outline"
                onClick={() => {
                  window.open(
                    `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5552'}/api/v1/payroll/runs/${runId}/payslips`,
                    '_blank'
                  );
                }}
              >
                {t('exportPayslips')}
              </Button>
            )}
          </div>
        }
      />

      <RunMetadataCard
        run={run}
        isDraft={isDraft}
        onUpdateWorkingDays={handleUpdateWorkingDays}
      />

      <EntriesTable
        entries={entries}
        isDraft={isDraft}
        runId={runId}
        onEntryUpdated={handleEntryUpdated}
      />

      {/* Summary footer */}
      <div className="rounded-2xl border border-border bg-surface p-5">
        <h3 className="text-sm font-semibold text-text-primary">{t('runSummary')}</h3>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-text-tertiary">{t('headcount')}</p>
            <p className="text-lg font-semibold text-text-primary">{run.headcount}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('basicPay')}</p>
            <p className="text-lg font-semibold text-text-primary">{formatCurrency(run.total_basic_pay)}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('bonusPay')}</p>
            <p className="text-lg font-semibold text-text-primary">{formatCurrency(run.total_bonus_pay)}</p>
          </div>
          <div>
            <p className="text-xs text-text-tertiary">{t('grandTotal')}</p>
            <p className="text-lg font-semibold text-text-primary">{formatCurrency(run.total_pay)}</p>
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
