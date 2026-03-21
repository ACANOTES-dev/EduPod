'use client';

import type { FeeGenerationPreviewLine } from '@school/shared';
import { Checkbox, StatusBadge, TableWrapper } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { CurrencyDisplay } from '../../_components/currency-display';

interface FeeGenerationPreviewProps {
  lines: FeeGenerationPreviewLine[];
  excludedHouseholds: Set<string>;
  onToggleExclude: (householdId: string) => void;
  currencyCode: string;
}

export function FeeGenerationPreview({
  lines,
  excludedHouseholds,
  onToggleExclude,
  currencyCode,
}: FeeGenerationPreviewProps) {
  const t = useTranslations('finance');

  return (
    <TableWrapper>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary w-10">
              {t('feeGeneration.colInclude')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('feeGeneration.colHousehold')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('feeGeneration.colStudent')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('feeGeneration.colFeeStructure')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('feeGeneration.colBaseAmount')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('feeGeneration.colDiscount')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('feeGeneration.colLineTotal')}
            </th>
            <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              {t('feeGeneration.colFlags')}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => {
            const isExcluded = excludedHouseholds.has(line.household_id);
            const isDuplicate = line.is_duplicate;
            const rowClass = isDuplicate
              ? 'opacity-40 bg-surface-secondary'
              : isExcluded
                ? 'opacity-60'
                : '';

            return (
              <tr
                key={`${line.household_id}-${line.fee_structure_id}-${idx}`}
                className={`border-b border-border last:border-b-0 ${rowClass}`}
              >
                <td className="px-4 py-3">
                  <Checkbox
                    checked={!isExcluded && !isDuplicate}
                    onCheckedChange={() => onToggleExclude(line.household_id)}
                    disabled={isDuplicate}
                    aria-label={`Include ${line.household_name}`}
                  />
                </td>
                <td className="px-4 py-3 text-sm font-medium text-text-primary">
                  {line.household_name}
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {line.student_name ?? '—'}
                </td>
                <td className="px-4 py-3 text-sm text-text-secondary">
                  {line.fee_structure_name}
                </td>
                <td className="px-4 py-3 text-sm">
                  <CurrencyDisplay
                    amount={line.base_amount}
                    currency_code={currencyCode}
                    className="font-mono text-text-primary"
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  {line.discount_name ? (
                    <span className="text-text-secondary">
                      {line.discount_name} (
                      <CurrencyDisplay
                        amount={line.discount_amount}
                        currency_code={currencyCode}
                        className="font-mono text-danger-text"
                      />
                      )
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-sm">
                  <CurrencyDisplay
                    amount={line.line_total}
                    currency_code={currencyCode}
                    className="font-mono font-medium text-text-primary"
                  />
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap gap-1">
                    {isDuplicate && (
                      <StatusBadge status="neutral" className="text-xs">
                        Duplicate
                      </StatusBadge>
                    )}
                    {line.missing_billing_parent && (
                      <StatusBadge status="warning" className="text-xs">
                        No Billing Parent
                      </StatusBadge>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr>
              <td
                colSpan={8}
                className="px-4 py-12 text-center text-sm text-text-tertiary"
              >
                {t('feeGeneration.noPreviewLines')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </TableWrapper>
  );
}
