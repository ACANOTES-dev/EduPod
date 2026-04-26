'use client';

import { Lock, LockOpen, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Input, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../../../../_components/currency-display';

import { CategorySection } from './category-section';
import { CATEGORY_ORDER, type LineItemCategory, type LineItemRow } from './workspace-types';

interface Props {
  /** Server-side stored line item rows for the active scenario (or base = scenario_id null). */
  storedRows: LineItemRow[];
  activeYear: number;
  activeScenarioId: string | null;
  modelId: string;
  currencyCode: string;
  locale: string;
  canManage: boolean;
  onLineMutated: () => void;
}

export function LineItemTable({
  storedRows,
  activeYear,
  activeScenarioId,
  modelId,
  currencyCode,
  locale,
  canManage,
  onLineMutated,
}: Props) {
  const t = useTranslations('financeBudgetingWorkspace.table');

  /**
   * Base case (activeScenarioId === null): show only rows pinned to the base
   * (`scenario_id === null`).
   *
   * Active scenario: show base rows merged with scenario override rows so the
   * line-item table matches the KPI strip's engine output. Override rows
   * replace base rows that share the same (category, subcategory, fiscal_year)
   * triple. Rows without an override fall through to base, preserving the
   * "scenarios layer on top of base" mental model. The existing per-row source
   * badge (`Driver` / `Override` / `Custom`) makes overrides visually obvious.
   */
  const filtered = React.useMemo(() => {
    const yearRows = storedRows.filter((r) => r.fiscal_year === activeYear);
    if (activeScenarioId === null) {
      return yearRows.filter((r) => r.scenario_id === null);
    }
    const overrides = yearRows.filter((r) => r.scenario_id === activeScenarioId);
    const overrideKey = (r: LineItemRow): string =>
      `${r.category}::${r.subcategory}::${r.fiscal_year}`;
    const overriddenKeys = new Set(overrides.map(overrideKey));
    const baseRows = yearRows.filter(
      (r) => r.scenario_id === null && !overriddenKeys.has(overrideKey(r)),
    );
    return [...baseRows, ...overrides];
  }, [storedRows, activeYear, activeScenarioId]);

  const grouped = React.useMemo(() => {
    const map = new Map<LineItemCategory, LineItemRow[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const row of filtered) {
      const list = map.get(row.category as LineItemCategory);
      if (list) list.push(row);
    }
    return map;
  }, [filtered]);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      {CATEGORY_ORDER.map((cat) => {
        const rows = grouped.get(cat) ?? [];
        const total = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);
        return (
          <CategorySection
            key={cat}
            title={t(`categories.${cat}`)}
            totalDisplay={
              <CurrencyDisplay amount={total} currency_code={currencyCode} locale={locale} />
            }
            canManage={canManage}
            addLabel={t('addLine')}
            // add-line modal lives in a v1.5 follow-up — for now the button is a no-op.
            onAddLine={canManage ? () => toast.info(t('addLineComingSoon')) : undefined}
            defaultOpen={cat === 'income'}
          >
            {rows.length === 0 ? (
              <p className="px-4 py-3 text-sm text-text-tertiary">{t('emptyCategory')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <LineItemRowView
                    key={row.id}
                    row={row}
                    modelId={modelId}
                    currencyCode={currencyCode}
                    locale={locale}
                    canManage={canManage}
                    onMutated={onLineMutated}
                  />
                ))}
              </ul>
            )}
          </CategorySection>
        );
      })}
    </section>
  );
}

function LineItemRowView({
  row,
  modelId,
  currencyCode,
  locale,
  canManage,
  onMutated,
}: {
  row: LineItemRow;
  modelId: string;
  currencyCode: string;
  locale: string;
  canManage: boolean;
  onMutated: () => void;
}) {
  const t = useTranslations('financeBudgetingWorkspace.table');
  const [editing, setEditing] = React.useState<boolean>(false);
  const [draftAmount, setDraftAmount] = React.useState<string>(String(row.amount));

  const persistAmount = async (): Promise<void> => {
    const next = Number(draftAmount);
    if (!Number.isFinite(next) || next === Number(row.amount)) {
      setEditing(false);
      return;
    }
    try {
      if (row.source === 'driver_derived') {
        // First override of a derived row creates a new override row server-side.
        await apiClient(`/api/v1/budgeting/financial-models/${modelId}/line-items`, {
          method: 'POST',
          body: JSON.stringify({
            scenario_id: row.scenario_id,
            category: row.category,
            subcategory: row.subcategory,
            name: row.name,
            fiscal_year: row.fiscal_year,
            source: 'override',
            amount: next,
          }),
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        await apiClient(`/api/v1/budgeting/financial-models/${modelId}/line-items/${row.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ amount: next }),
          headers: { 'Content-Type': 'application/json' },
        });
      }
      onMutated();
      setEditing(false);
    } catch (err) {
      console.error('[LineItem.persist]', err);
      toast.error(t('saveFailed'));
      setDraftAmount(String(row.amount));
      setEditing(false);
    }
  };

  const toggleLock = async (): Promise<void> => {
    if (!canManage || row.source === 'driver_derived') return;
    try {
      await apiClient(`/api/v1/budgeting/financial-models/${modelId}/line-items/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_locked: !row.is_locked }),
        headers: { 'Content-Type': 'application/json' },
      });
      onMutated();
    } catch (err) {
      console.error('[LineItem.toggleLock]', err);
      toast.error(t('saveFailed'));
    }
  };

  const removeRow = async (): Promise<void> => {
    if (!canManage || row.source === 'driver_derived') return;
    try {
      await apiClient(`/api/v1/budgeting/financial-models/${modelId}/line-items/${row.id}`, {
        method: 'DELETE',
      });
      onMutated();
    } catch (err) {
      console.error('[LineItem.delete]', err);
      toast.error(t('saveFailed'));
    }
  };

  return (
    <li className="flex min-w-0 items-center gap-3 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm text-text-primary">{row.name}</span>
        <div className="flex items-center gap-2">
          <Badge variant={row.source === 'driver_derived' ? 'secondary' : 'info'}>
            {t(`source.${row.source}`)}
          </Badge>
          {row.is_locked && (
            <span title={t('unlockTitle')} className="text-text-tertiary">
              <Lock className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>
      {editing && canManage ? (
        <Input
          type="number"
          step="0.01"
          value={draftAmount}
          onChange={(e) => setDraftAmount(e.target.value)}
          onBlur={() => void persistAmount()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void persistAmount();
            if (e.key === 'Escape') {
              setDraftAmount(String(row.amount));
              setEditing(false);
            }
          }}
          autoFocus
          className="h-8 w-32 text-end font-mono"
        />
      ) : (
        <button
          type="button"
          disabled={!canManage || row.is_locked}
          onClick={() => setEditing(true)}
          className="rounded px-2 py-1 font-mono tabular-nums text-text-primary hover:bg-surface-secondary disabled:cursor-default disabled:opacity-90"
        >
          <CurrencyDisplay
            amount={Number(row.amount)}
            currency_code={currencyCode}
            locale={locale}
          />
        </button>
      )}
      {canManage && row.source !== 'driver_derived' && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void toggleLock()}
            title={row.is_locked ? t('unlockTitle') : t('lockTitle')}
            className="rounded p-1 text-text-tertiary hover:bg-surface-secondary hover:text-text-primary"
          >
            {row.is_locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void removeRow()}
            title={t('deleteTitle')}
            className="rounded p-1 text-text-tertiary hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
    </li>
  );
}
