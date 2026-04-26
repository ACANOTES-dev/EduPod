'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@school/ui';

import { CurrencyDisplay } from '../../../../../_components/currency-display';

import type { PreviewResult } from './generate-fees-types';

interface Props {
  open: boolean;
  onClose: () => void;
  preview: PreviewResult;
  eventName: string;
  currencyCode: string;
  locale: string;
  isSubmitting: boolean;
  errorMessage: string | null;
  onConfirm: () => void | Promise<void>;
}

export function GenerateFeesConfirmModal({
  open,
  onClose,
  preview,
  eventName,
  currencyCode,
  locale,
  isSubmitting,
  errorMessage,
  onConfirm,
}: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.generateFees.confirm');
  const [confirmed, setConfirmed] = React.useState<boolean>(false);
  const [showAll, setShowAll] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!open) {
      setConfirmed(false);
      setShowAll(false);
    }
  }, [open]);

  const totalFormatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(preview.totals.total_to_invoice);

  const visibleHouseholds = showAll ? preview.households : preview.households.slice(0, 3);

  return (
    <Dialog open={open} onOpenChange={(o) => (o || isSubmitting ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { eventName })}</DialogTitle>
          <DialogDescription>{t('willCreate')}</DialogDescription>
        </DialogHeader>

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {errorMessage}
          </div>
        )}

        <ul className="flex flex-col gap-1 text-sm">
          <li>• {t('invoices', { count: preview.totals.student_count })}</li>
          <li>• {t('forHouseholds', { count: preview.totals.household_count })}</li>
          <li>• {t('forTotal', { amount: totalFormatted })}</li>
        </ul>

        <details
          open={showAll}
          onToggle={(e) => setShowAll((e.target as HTMLDetailsElement).open)}
          className="rounded-2xl border border-border bg-surface p-3"
        >
          <summary className="cursor-pointer text-sm font-medium text-text-primary">
            {t('showAll', { count: preview.households.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-text-secondary">
            {visibleHouseholds.map((h) => (
              <li key={h.household_id} className="flex items-center justify-between gap-2">
                <span className="truncate">{h.household_name}</span>
                <span dir="ltr" className="shrink-0 font-mono">
                  <CurrencyDisplay
                    amount={h.total_amount}
                    currency_code={currencyCode}
                    locale={locale}
                  />
                </span>
              </li>
            ))}
          </ul>
        </details>

        <label className="flex items-start gap-2 text-sm text-text-secondary">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(v) => setConfirmed(v === true)}
            aria-label="confirm-checkbox"
          />
          <span>
            {t('checkbox', {
              count: preview.totals.household_count,
              amount: totalFormatted,
            })}
          </span>
        </label>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void onConfirm()}
            disabled={!confirmed || isSubmitting}
          >
            {isSubmitting ? t('submitting') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
