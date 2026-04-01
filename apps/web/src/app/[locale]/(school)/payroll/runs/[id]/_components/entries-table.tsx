'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, TableWrapper } from '@school/ui';

import { apiClient } from '@/lib/api-client';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface PayrollEntry {
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

interface CalculatePreview {
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
}

interface EntriesTableProps {
  entries: PayrollEntry[];
  isDraft: boolean;
  totalWorkingDays: number;
  onEntryUpdated: (entry: PayrollEntry) => void;
}

type TabType = 'salaried' | 'per_class';

// ─── Salaried Entry Row ─────────────────────────────────────────────
function SalariedRow({
  entry,
  isDraft,
  totalWorkingDays,
  onEntryUpdated,
}: {
  entry: PayrollEntry;
  isDraft: boolean;
  totalWorkingDays: number;
  onEntryUpdated: (entry: PayrollEntry) => void;
}) {
  const t = useTranslations('payroll');
  const [actualDays, setActualDays] = React.useState(String(entry.days_worked ?? ''));
  const [preview, setPreview] = React.useState<CalculatePreview>({
    basic_pay: entry.basic_pay,
    bonus_pay: entry.bonus_pay,
    total_pay: entry.total_pay,
  });
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [overrideValue, setOverrideValue] = React.useState(
    entry.override_total_pay != null ? String(entry.override_total_pay) : '',
  );
  const [overrideNote, setOverrideNote] = React.useState(entry.override_note ?? '');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const bonusDays = Math.max(0, (entry.days_worked ?? 0) - totalWorkingDays);

  const handleInputChange = (val: string) => {
    setActualDays(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiClient<{ data: CalculatePreview }>(
          `/api/v1/payroll/entries/${entry.id}/calculate`,
          { method: 'POST', body: JSON.stringify({ days_worked: val ? Number(val) : null }) },
        );
        setPreview(res.data);
      } catch (err) {
        console.error('[handleInputChange]', err);
      }
    }, 300);
  };

  const handleBlur = async () => {
    try {
      const res = await apiClient<{ data: PayrollEntry }>(`/api/v1/payroll/entries/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          days_worked: actualDays ? Number(actualDays) : null,
          expected_updated_at: entry.updated_at,
        }),
      });
      onEntryUpdated(res.data);
    } catch (err) {
      console.error('[handleBlur]', err);
    }
  };

  const handleOverrideSave = async () => {
    const val = overrideValue ? Number(overrideValue) : null;
    if (val !== null && !overrideNote.trim()) return;
    try {
      const res = await apiClient<{ data: PayrollEntry }>(`/api/v1/payroll/entries/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          override_total_pay: val,
          override_note: val !== null ? overrideNote : null,
          expected_updated_at: entry.updated_at,
        }),
      });
      onEntryUpdated(res.data);
      setOverrideOpen(false);
    } catch (err) {
      console.error('[handleOverrideSave]', err);
    }
  };

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const effectivePay = entry.override_total_pay ?? preview.total_pay;

  return (
    <>
      <tr className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary">
        <td className="px-4 py-3 text-sm font-medium text-text-primary">{entry.staff_name}</td>
        <td className="px-4 py-3 text-sm text-text-primary text-end">{totalWorkingDays}</td>
        <td className="px-4 py-3 text-sm">
          {isDraft ? (
            <Input
              type="number"
              min="0"
              step="0.5"
              className="w-20"
              value={actualDays}
              onChange={(e) => handleInputChange(e.target.value)}
              onBlur={handleBlur}
            />
          ) : (
            <span className="text-text-primary">{entry.days_worked}</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-text-primary text-end">
          {formatCurrency(preview.basic_pay)}
        </td>
        <td className="px-4 py-3 text-sm text-text-tertiary text-end">{bonusDays}</td>
        <td className="px-4 py-3 text-sm text-text-primary text-end">
          {formatCurrency(preview.bonus_pay)}
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-end">
          {entry.override_total_pay != null ? (
            <span className="flex items-center justify-end gap-2">
              <span className="text-text-tertiary line-through">
                {formatCurrency(preview.total_pay)}
              </span>
              <span className="text-text-primary">{formatCurrency(entry.override_total_pay)}</span>
            </span>
          ) : (
            <span className="text-text-primary">{formatCurrency(effectivePay)}</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm">
          {isDraft && (
            <Button variant="ghost" size="sm" onClick={() => setOverrideOpen(!overrideOpen)}>
              {entry.override_total_pay != null ? t('editOverride') : t('override')}
            </Button>
          )}
          {!isDraft && entry.override_note && (
            <span className="text-xs text-text-tertiary" title={entry.override_note}>
              *
            </span>
          )}
        </td>
      </tr>
      {overrideOpen && (
        <tr className="border-b border-border bg-surface-secondary">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">
                  {t('overrideAmount')}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-32"
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  placeholder={formatCurrency(preview.total_pay)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-text-secondary">
                  {t('overrideReason')}
                </label>
                <Input
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder={t('overrideReasonPlaceholder')}
                />
              </div>
              <Button size="sm" onClick={handleOverrideSave}>
                {t('save')}
              </Button>
              {entry.override_total_pay != null && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOverrideValue('');
                    setOverrideNote('');
                    void handleOverrideSave();
                  }}
                >
                  {t('clearOverride')}
                </Button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Per-Class Entry Row ─────────────────────────────────────────────
function PerClassRow({
  entry,
  isDraft,
  onEntryUpdated,
}: {
  entry: PayrollEntry;
  isDraft: boolean;
  onEntryUpdated: (entry: PayrollEntry) => void;
}) {
  const t = useTranslations('payroll');
  const assignedClasses = entry.snapshot_assigned_class_count ?? 0;
  const [actualClasses, setActualClasses] = React.useState(String(entry.classes_taught ?? ''));
  const [preview, setPreview] = React.useState<CalculatePreview>({
    basic_pay: entry.basic_pay,
    bonus_pay: entry.bonus_pay,
    total_pay: entry.total_pay,
  });
  const [overrideOpen, setOverrideOpen] = React.useState(false);
  const [overrideValue, setOverrideValue] = React.useState(
    entry.override_total_pay != null ? String(entry.override_total_pay) : '',
  );
  const [overrideNote, setOverrideNote] = React.useState(entry.override_note ?? '');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const bonusClasses = Math.max(0, (entry.classes_taught ?? 0) - assignedClasses);

  const handleInputChange = (val: string) => {
    setActualClasses(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiClient<{ data: CalculatePreview }>(
          `/api/v1/payroll/entries/${entry.id}/calculate`,
          { method: 'POST', body: JSON.stringify({ classes_taught: val ? Number(val) : null }) },
        );
        setPreview(res.data);
      } catch (err) {
        console.error('[handleInputChange]', err);
      }
    }, 300);
  };

  const handleBlur = async () => {
    try {
      const res = await apiClient<{ data: PayrollEntry }>(`/api/v1/payroll/entries/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          classes_taught: actualClasses ? Number(actualClasses) : null,
          expected_updated_at: entry.updated_at,
        }),
      });
      onEntryUpdated(res.data);
    } catch (err) {
      console.error('[handleBlur]', err);
    }
  };

  const handleOverrideSave = async () => {
    const val = overrideValue ? Number(overrideValue) : null;
    if (val !== null && !overrideNote.trim()) return;
    try {
      const res = await apiClient<{ data: PayrollEntry }>(`/api/v1/payroll/entries/${entry.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          override_total_pay: val,
          override_note: val !== null ? overrideNote : null,
          expected_updated_at: entry.updated_at,
        }),
      });
      onEntryUpdated(res.data);
      setOverrideOpen(false);
    } catch (err) {
      console.error('[handleOverrideSave]', err);
    }
  };

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const effectivePay = entry.override_total_pay ?? preview.total_pay;

  return (
    <>
      <tr className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary">
        <td className="px-4 py-3 text-sm font-medium text-text-primary">{entry.staff_name}</td>
        <td className="px-4 py-3 text-sm text-text-primary text-end">{assignedClasses}</td>
        <td className="px-4 py-3 text-sm">
          {isDraft ? (
            <Input
              type="number"
              min="0"
              step="1"
              className="w-20"
              value={actualClasses}
              onChange={(e) => handleInputChange(e.target.value)}
              onBlur={handleBlur}
            />
          ) : (
            <span className="text-text-primary">{entry.classes_taught}</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-text-primary text-end">
          {formatCurrency(preview.basic_pay)}
        </td>
        <td className="px-4 py-3 text-sm text-text-tertiary text-end">{bonusClasses}</td>
        <td className="px-4 py-3 text-sm text-text-primary text-end">
          {formatCurrency(preview.bonus_pay)}
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-end">
          {entry.override_total_pay != null ? (
            <span className="flex items-center justify-end gap-2">
              <span className="text-text-tertiary line-through">
                {formatCurrency(preview.total_pay)}
              </span>
              <span className="text-text-primary">{formatCurrency(entry.override_total_pay)}</span>
            </span>
          ) : (
            <span className="text-text-primary">{formatCurrency(effectivePay)}</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm">
          {isDraft && (
            <Button variant="ghost" size="sm" onClick={() => setOverrideOpen(!overrideOpen)}>
              {entry.override_total_pay != null ? t('editOverride') : t('override')}
            </Button>
          )}
          {!isDraft && entry.override_note && (
            <span className="text-xs text-text-tertiary" title={entry.override_note}>
              *
            </span>
          )}
        </td>
      </tr>
      {overrideOpen && (
        <tr className="border-b border-border bg-surface-secondary">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-text-secondary">
                  {t('overrideAmount')}
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-32"
                  value={overrideValue}
                  onChange={(e) => setOverrideValue(e.target.value)}
                  placeholder={formatCurrency(preview.total_pay)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <label className="text-xs font-medium text-text-secondary">
                  {t('overrideReason')}
                </label>
                <Input
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                  placeholder={t('overrideReasonPlaceholder')}
                />
              </div>
              <Button size="sm" onClick={handleOverrideSave}>
                {t('save')}
              </Button>
              {entry.override_total_pay != null && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setOverrideValue('');
                    setOverrideNote('');
                    void handleOverrideSave();
                  }}
                >
                  {t('clearOverride')}
                </Button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main Entries Table with Tabs ─────────────────────────────────
export function EntriesTable({
  entries,
  isDraft,
  totalWorkingDays,
  onEntryUpdated,
}: EntriesTableProps) {
  const t = useTranslations('payroll');
  const [activeTab, setActiveTab] = React.useState<TabType>('salaried');

  const salariedEntries = entries.filter((e) => e.compensation_type === 'salaried');
  const perClassEntries = entries.filter((e) => e.compensation_type === 'per_class');

  const filteredEntries = activeTab === 'salaried' ? salariedEntries : perClassEntries;

  const totals = React.useMemo(() => {
    return filteredEntries.reduce(
      (acc, e) => ({
        basic_pay: acc.basic_pay + e.basic_pay,
        bonus_pay: acc.bonus_pay + e.bonus_pay,
        total_pay: acc.total_pay + (e.override_total_pay ?? e.total_pay),
      }),
      { basic_pay: 0, bonus_pay: 0, total_pay: 0 },
    );
  }, [filteredEntries]);

  const salariedHeaders = [
    t('staffName'),
    t('prescribedDays'),
    t('actualDaysWorked'),
    t('basePay'),
    t('bonusDays'),
    t('bonusPay'),
    t('totalPay'),
    t('override'),
  ];

  const perClassHeaders = [
    t('staffName'),
    t('assignedClasses'),
    t('actualClassesTaught'),
    t('baseClassPay'),
    t('bonusClasses'),
    t('bonusPay'),
    t('totalPay'),
    t('override'),
  ];

  const headers = activeTab === 'salaried' ? salariedHeaders : perClassHeaders;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-surface-secondary p-1">
        <button
          onClick={() => setActiveTab('salaried')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'salaried'
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('salaried')} ({salariedEntries.length})
        </button>
        <button
          onClick={() => setActiveTab('per_class')}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'per_class'
              ? 'bg-surface text-text-primary shadow-sm'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          {t('perClass')} ({perClassEntries.length})
        </button>
      </div>

      {/* Table */}
      <TableWrapper>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {headers.map((header, i) => (
                <th
                  key={i}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary ${
                    i === 0 ? 'text-start' : i === headers.length - 1 ? 'text-start' : 'text-end'
                  }`}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-text-tertiary">
                  {t('noData')}
                </td>
              </tr>
            ) : activeTab === 'salaried' ? (
              salariedEntries.map((entry) => (
                <SalariedRow
                  key={entry.id}
                  entry={entry}
                  isDraft={isDraft}
                  totalWorkingDays={totalWorkingDays}
                  onEntryUpdated={onEntryUpdated}
                />
              ))
            ) : (
              perClassEntries.map((entry) => (
                <PerClassRow
                  key={entry.id}
                  entry={entry}
                  isDraft={isDraft}
                  onEntryUpdated={onEntryUpdated}
                />
              ))
            )}
          </tbody>
          {filteredEntries.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-surface-secondary">
                <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-text-primary">
                  {t('grandTotal')}
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-text-primary text-end">
                  {formatCurrency(totals.basic_pay)}
                </td>
                <td />
                <td className="px-4 py-3 text-sm font-semibold text-text-primary text-end">
                  {formatCurrency(totals.bonus_pay)}
                </td>
                <td className="px-4 py-3 text-sm font-bold text-text-primary text-end">
                  {formatCurrency(totals.total_pay)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </TableWrapper>
    </div>
  );
}
