'use client';

import { Badge, Button, Input, TableWrapper } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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
  notes: string | null;
}

interface CalculatePreview {
  basic_pay: number;
  bonus_pay: number;
  total_pay: number;
}

interface EntriesTableProps {
  entries: PayrollEntry[];
  isDraft: boolean;
  runId: string;
  onEntryUpdated: (entry: PayrollEntry) => void;
}

function EntryRow({
  entry,
  isDraft,
  runId,
  onEntryUpdated,
}: {
  entry: PayrollEntry;
  isDraft: boolean;
  runId: string;
  onEntryUpdated: (entry: PayrollEntry) => void;
}) {
  const t = useTranslations('payroll');
  const isSalaried = entry.compensation_type === 'salaried';

  const [inputValue, setInputValue] = React.useState(
    isSalaried
      ? String(entry.days_worked ?? '')
      : String(entry.classes_taught ?? '')
  );
  const [preview, setPreview] = React.useState<CalculatePreview>({
    basic_pay: entry.basic_pay,
    bonus_pay: entry.bonus_pay,
    total_pay: entry.total_pay,
  });
  const [showNotes, setShowNotes] = React.useState(false);
  const [notes, setNotes] = React.useState(entry.notes ?? '');
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInputChange = (val: string) => {
    setInputValue(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const body: Record<string, unknown> = {};
        if (isSalaried) {
          body.days_worked = val ? Number(val) : null;
        } else {
          body.classes_taught = val ? Number(val) : null;
        }
        const res = await apiClient<{ data: CalculatePreview }>(
          `/api/v1/payroll/runs/${runId}/entries/${entry.id}/calculate`,
          { method: 'POST', body: JSON.stringify(body) }
        );
        setPreview(res.data);
      } catch {
        // silent
      }
    }, 300);
  };

  const handleBlur = async () => {
    try {
      const body: Record<string, unknown> = { notes };
      if (isSalaried) {
        body.days_worked = inputValue ? Number(inputValue) : null;
      } else {
        body.classes_taught = inputValue ? Number(inputValue) : null;
      }
      const res = await apiClient<{ data: PayrollEntry }>(
        `/api/v1/payroll/runs/${runId}/entries/${entry.id}`,
        { method: 'PATCH', body: JSON.stringify(body) }
      );
      onEntryUpdated(res.data);
    } catch {
      // silent
    }
  };

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <>
      <tr className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary">
        <td className="px-4 py-3 text-sm font-medium text-text-primary">
          {entry.staff_name}
        </td>
        <td className="px-4 py-3 text-sm">
          <Badge variant={isSalaried ? 'default' : 'secondary'}>
            {isSalaried ? t('salaried') : t('perClass')}
          </Badge>
        </td>
        <td className="px-4 py-3 text-sm">
          {isDraft ? (
            <Input
              type="number"
              min="0"
              step={isSalaried ? '0.5' : '1'}
              className="w-24"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onBlur={handleBlur}
              placeholder={isSalaried ? t('daysWorked') : t('classesTaught')}
            />
          ) : (
            <span>{isSalaried ? entry.days_worked : entry.classes_taught}</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-text-primary text-end">
          {formatCurrency(preview.basic_pay)}
        </td>
        <td className="px-4 py-3 text-sm text-text-primary text-end">
          {formatCurrency(preview.bonus_pay)}
        </td>
        <td className="px-4 py-3 text-sm font-semibold text-text-primary text-end">
          {formatCurrency(preview.total_pay)}
        </td>
        <td className="px-4 py-3 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowNotes(!showNotes)}
          >
            {t('notes')}
          </Button>
        </td>
      </tr>
      {showNotes && (
        <tr className="border-b border-border bg-surface-secondary">
          <td colSpan={7} className="px-4 py-3">
            {isDraft ? (
              <textarea
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={handleBlur}
                placeholder={t('notes')}
              />
            ) : (
              <p className="text-sm text-text-secondary">{entry.notes || '-'}</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function EntriesTable({ entries, isDraft, runId, onEntryUpdated }: EntriesTableProps) {
  const t = useTranslations('payroll');

  const totals = React.useMemo(() => {
    return entries.reduce(
      (acc, e) => ({
        basic_pay: acc.basic_pay + e.basic_pay,
        bonus_pay: acc.bonus_pay + e.bonus_pay,
        total_pay: acc.total_pay + e.total_pay,
      }),
      { basic_pay: 0, bonus_pay: 0, total_pay: 0 }
    );
  }, [entries]);

  return (
    <TableWrapper>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('staffName')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('type')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {isDraft ? (t('daysWorked') + ' / ' + t('classesTaught')) : t('daysWorked')}
            </th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('basicPay')}
            </th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('bonusPay')}
            </th>
            <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('totalPay')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('notes')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-tertiary">
                {t('noData')}
              </td>
            </tr>
          ) : (
            entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                isDraft={isDraft}
                runId={runId}
                onEntryUpdated={onEntryUpdated}
              />
            ))
          )}
        </tbody>
        {entries.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-secondary">
              <td colSpan={3} className="px-4 py-3 text-sm font-semibold text-text-primary">
                {t('grandTotal')}
              </td>
              <td className="px-4 py-3 text-sm font-semibold text-text-primary text-end">
                {formatCurrency(totals.basic_pay)}
              </td>
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
  );
}
