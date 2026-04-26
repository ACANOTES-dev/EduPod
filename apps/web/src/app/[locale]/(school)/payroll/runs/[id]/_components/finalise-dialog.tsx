'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

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
  updated_at: string;
}

/**
 * Finalisation response from POST /v1/payroll/runs/:id/finalise.
 * `pending: true` indicates the run was submitted for approval (non-owner caller),
 * `pending: false` indicates the run was finalised directly (school-owner caller).
 */
interface FinaliseResponse {
  pending: boolean;
  run: { id: string; status: string };
}

interface FinaliseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  run: PayrollRun;
  onSuccess: (response: FinaliseResponse) => void;
}

export function FinaliseDialog({ open, onOpenChange, run, onSuccess }: FinaliseDialogProps) {
  const t = useTranslations('payroll');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      const res = await apiClient<FinaliseResponse>(`/api/v1/payroll/runs/${run.id}/finalise`, {
        method: 'POST',
        body: JSON.stringify({ expected_updated_at: run.updated_at }),
        silent: true,
      });
      if (res.pending) {
        toast.success(t('finaliseSubmittedForApproval'));
      } else {
        toast.success(t('runFinalised'));
      }
      onSuccess(res);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('finaliseFailed');
      toast.error(message);
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
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {t('cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? '…' : t('finalise')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
