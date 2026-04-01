'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@school/ui';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface PayrollRun {
  id: string;
  period_label: string;
  headcount: number;
  total_pay: number;
  total_basic_pay: number;
  total_bonus_pay: number;
}

interface FinaliseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: PayrollRun;
  onConfirm: () => void;
}

export function FinaliseDialog({ open, onOpenChange, run, onConfirm }: FinaliseDialogProps) {
  const t = useTranslations('payroll');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('finaliseRun')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('finaliseConfirm')}</p>
          <p className="text-xs text-warning-text bg-warning-50 border border-warning-border rounded-lg px-3 py-2">
            {t('finaliseImmutableWarning')}
          </p>

          <div className="rounded-xl border border-border bg-surface-secondary p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{t('period')}</span>
              <span className="font-medium text-text-primary">{run.period_label}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{t('headcount')}</span>
              <span className="font-medium text-text-primary">{run.headcount}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{t('basicPay')}</span>
              <span className="font-medium text-text-primary">
                {formatCurrency(run.total_basic_pay)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">{t('bonusPay')}</span>
              <span className="font-medium text-text-primary">
                {formatCurrency(run.total_bonus_pay)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm border-t border-border pt-2">
              <span className="font-semibold text-text-primary">{t('grandTotal')}</span>
              <span className="font-bold text-text-primary">{formatCurrency(run.total_pay)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? '...' : t('finalise')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
