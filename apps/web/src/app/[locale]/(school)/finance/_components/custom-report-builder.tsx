'use client';

import { Download, Printer, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { MultiCheckSelect } from './multi-check-select';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomReportRow {
  student_id: string;
  student_name: string;
  student_number: string | null;
  year_group: string | null;
  household_name: string;
  billing_parent_name: string | null;
  billing_parent_phone: string | null;
  billing_parent_email: string | null;
  fee_type: string;
  amount_billed: number;
  amount_paid: number;
  balance: number;
}

interface YearGroupOption {
  id: string;
  name: string;
}

interface FeeTypeOption {
  id: string;
  name: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CustomReportBuilder() {
  const t = useTranslations('finance');

  const [yearGroupOptions, setYearGroupOptions] = React.useState<YearGroupOption[]>([]);
  const [feeTypeOptions, setFeeTypeOptions] = React.useState<FeeTypeOption[]>([]);
  const [selectedYearGroups, setSelectedYearGroups] = React.useState<string[]>([]);
  const [selectedFeeTypes, setSelectedFeeTypes] = React.useState<string[]>([]);
  const [customDateFrom, setCustomDateFrom] = React.useState('');
  const [customDateTo, setCustomDateTo] = React.useState('');
  const [customStatus, setCustomStatus] = React.useState<'all' | 'outstanding' | 'paid'>('all');
  const [customData, setCustomData] = React.useState<CustomReportRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [generated, setGenerated] = React.useState(false);

  // ─── Load filter options ────────────────────────────────────────────────────

  React.useEffect(() => {
    async function loadOptions() {
      try {
        const [ygRes, ftRes] = await Promise.all([
          apiClient<YearGroupOption[] | { data: YearGroupOption[] }>('/api/v1/year-groups'),
          apiClient<FeeTypeOption[] | { data: FeeTypeOption[] }>(
            '/api/v1/finance/fee-types?pageSize=100',
          ),
        ]);
        setYearGroupOptions(Array.isArray(ygRes) ? ygRes : ygRes.data);
        setFeeTypeOptions(Array.isArray(ftRes) ? ftRes : ftRes.data);
      } catch (err) {
        console.error('[CustomReportBuilder] loadOptions', err);
      }
    }
    void loadOptions();
  }, []);

  // ─── Generate report ────────────────────────────────────────────────────────

  async function handleGenerate() {
    setIsLoading(true);
    setGenerated(true);
    try {
      const params = new URLSearchParams();
      if (selectedYearGroups.length > 0) {
        params.set('year_group_ids', selectedYearGroups.join(','));
      }
      if (selectedFeeTypes.length > 0) {
        params.set('fee_type_ids', selectedFeeTypes.join(','));
      }
      if (customDateFrom) params.set('date_from', customDateFrom);
      if (customDateTo) params.set('date_to', customDateTo);
      if (customStatus !== 'all') params.set('status', customStatus);

      const qs = params.toString() ? `?${params.toString()}` : '';
      const raw = await apiClient<CustomReportRow[] | { data: CustomReportRow[] }>(
        `/api/v1/finance/reports/custom${qs}`,
      );
      setCustomData(Array.isArray(raw) ? raw : raw.data);
    } catch (err) {
      console.error('[CustomReportBuilder] generate', err);
      setCustomData([]);
    } finally {
      setIsLoading(false);
    }
  }

  // ─── Export CSV ─────────────────────────────────────────────────────────────

  function handleExportCsv() {
    if (customData.length === 0) return;
    const headers = [
      t('reports.customStudentName'),
      t('reports.customStudentNumber'),
      t('reports.customClass'),
      t('reports.customHousehold'),
      t('reports.customBillingParent'),
      t('reports.customPhone'),
      t('reports.customEmail'),
      t('reports.customFeeType'),
      t('reports.customAmountBilled'),
      t('reports.customAmountPaid'),
      t('reports.customBalance'),
    ];
    const rows = customData.map((r) => [
      r.student_name,
      r.student_number ?? '',
      r.year_group ?? '',
      r.household_name,
      r.billing_parent_name ?? '',
      r.billing_parent_phone ?? '',
      r.billing_parent_email ?? '',
      r.fee_type,
      r.amount_billed.toFixed(2),
      r.amount_paid.toFixed(2),
      r.balance.toFixed(2),
    ]);
    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `custom-finance-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="me-2 h-4 w-4" />
          {t('reports.customPrint')}
        </Button>
        <Button variant="outline" onClick={handleExportCsv} disabled={customData.length === 0}>
          <Download className="me-2 h-4 w-4" />
          {t('reports.exportCsv')}
        </Button>
      </div>

      {/* Filter section */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Year Group multi-select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('reports.customYearGroup')}
            </label>
            <MultiCheckSelect
              options={yearGroupOptions.map((yg) => ({ value: yg.id, label: yg.name }))}
              selected={selectedYearGroups}
              onChange={setSelectedYearGroups}
              placeholder={t('reports.customSelectYearGroups')}
              allLabel={t('reports.customAllYearGroups')}
            />
          </div>

          {/* Fee Type multi-select */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('reports.customFeeType')}
            </label>
            <MultiCheckSelect
              options={feeTypeOptions.map((ft) => ({ value: ft.id, label: ft.name }))}
              selected={selectedFeeTypes}
              onChange={setSelectedFeeTypes}
              placeholder={t('reports.customSelectFeeTypes')}
              allLabel={t('reports.customAllFeeTypes')}
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('reports.customStatus')}
            </label>
            <select
              value={customStatus}
              onChange={(e) => setCustomStatus(e.target.value as 'all' | 'outstanding' | 'paid')}
              className="flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="all">{t('reports.customStatusAll')}</option>
              <option value="outstanding">{t('reports.customStatusOutstanding')}</option>
              <option value="paid">{t('reports.customStatusPaid')}</option>
            </select>
          </div>

          {/* Date from */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('reports.dateRange')} ({t('from')})
            </label>
            <Input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Date to */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('reports.dateRange')} ({t('to')})
            </label>
            <Input
              type="date"
              value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Generate button */}
          <div className="flex items-end">
            <Button onClick={() => void handleGenerate()} disabled={isLoading} className="w-full">
              <Search className="me-2 h-4 w-4" />
              {t('reports.customGenerate')}
            </Button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
        </div>
      )}

      {/* Results */}
      {!isLoading && generated && (
        <div className="overflow-x-auto rounded-xl border border-border print:border-0">
          {customData.length === 0 ? (
            <p className="py-8 text-center text-sm text-text-tertiary">
              {t('reports.customNoResults')}
            </p>
          ) : (
            <>
              <div className="px-4 py-3 text-xs text-text-tertiary print:hidden">
                {customData.length} {t('reports.invoices')}
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary print:bg-transparent">
                    <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customStudentName')}
                    </th>
                    <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customStudentNumber')}
                    </th>
                    <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customClass')}
                    </th>
                    <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customHousehold')}
                    </th>
                    <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customBillingParent')}
                    </th>
                    <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customPhone')}
                    </th>
                    <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customEmail')}
                    </th>
                    <th className="px-3 py-2.5 text-start text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customFeeType')}
                    </th>
                    <th className="px-3 py-2.5 text-end text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customAmountBilled')}
                    </th>
                    <th className="px-3 py-2.5 text-end text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customAmountPaid')}
                    </th>
                    <th className="px-3 py-2.5 text-end text-xs font-semibold uppercase text-text-tertiary">
                      {t('reports.customBalance')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {customData.map((row, idx) => (
                    <tr
                      key={`${row.student_id}-${row.fee_type}-${idx}`}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-3 py-2 text-text-primary">{row.student_name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-text-secondary" dir="ltr">
                        {row.student_number ?? '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {row.year_group ?? '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{row.household_name}</td>
                      <td className="px-3 py-2 text-text-secondary">
                        {row.billing_parent_name ?? '\u2014'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-text-secondary" dir="ltr">
                        {row.billing_parent_phone ?? '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-xs text-text-secondary break-all" dir="ltr">
                        {row.billing_parent_email ?? '\u2014'}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">{row.fee_type}</td>
                      <td className="px-3 py-2 text-end font-mono text-text-secondary" dir="ltr">
                        {row.amount_billed.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-end font-mono text-text-secondary" dir="ltr">
                        {row.amount_paid.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-end font-mono" dir="ltr">
                        <span
                          className={
                            row.balance > 0 ? 'font-semibold text-danger-700' : 'text-success-700'
                          }
                        >
                          {row.balance.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-surface-secondary font-semibold print:bg-transparent">
                    <td colSpan={8} className="px-3 py-2.5 text-text-primary">
                      {t('reports.customTotal')}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-text-primary" dir="ltr">
                      {customData
                        .reduce((s, r) => s + r.amount_billed, 0)
                        .toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-text-primary" dir="ltr">
                      {customData
                        .reduce((s, r) => s + r.amount_paid, 0)
                        .toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                    <td className="px-3 py-2.5 text-end font-mono text-danger-700" dir="ltr">
                      {customData
                        .reduce((s, r) => s + r.balance, 0)
                        .toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
