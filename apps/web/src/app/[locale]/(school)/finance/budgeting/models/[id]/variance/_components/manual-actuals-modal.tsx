'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { manualActualEntrySchema, type ManualActualEntryDto } from '@school/shared/budgeting';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { PeriodOption, VarianceRow } from './variance-types';

interface Props {
  open: boolean;
  onClose: () => void;
  modelId: string;
  row: VarianceRow | null;
  period: PeriodOption;
  onSaved: () => void;
}

interface FormShape extends ManualActualEntryDto {
  notes?: string;
}

export function ManualActualsModal({ open, onClose, modelId, row, period, onSaved }: Props) {
  const t = useTranslations('financeBudgetingVariance.manualActuals');

  const form = useForm<FormShape>({
    resolver: zodResolver(manualActualEntrySchema),
    defaultValues: {
      line_item_key: '',
      period_type: period.type,
      period_label: period.label,
      amount: 0,
    },
  });

  // Reset the form whenever the row / period changes — the modal is
  // re-used across multiple rows.
  React.useEffect(() => {
    if (!row) return;
    form.reset({
      line_item_key: row.line_item_key,
      period_type: period.type,
      period_label: period.label,
      amount: row.actual,
    });
  }, [row, period, form]);

  const isSubmitting = form.formState.isSubmitting;

  const onSubmit = async (values: FormShape): Promise<void> => {
    try {
      await apiClient(`/api/v1/budgeting/financial-models/${modelId}/variance/manual-actuals`, {
        method: 'POST',
        body: JSON.stringify({
          line_item_key: values.line_item_key,
          period_type: values.period_type,
          period_label: values.period_label,
          amount: values.amount,
        }),
      });
      toast.success(t('saved'));
      onSaved();
      onClose();
    } catch (err) {
      console.error('[ManualActualsModal.submit]', err);
      toast.error(err instanceof Error ? err.message : t('saveFailed'));
    }
  };

  if (!row) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('title', { lineName: row.subcategory.replace(/_/g, ' ') })}</DialogTitle>
          <DialogDescription>
            {t('period', { period: `${period.type} · ${period.label}` })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-actual-amount">{t('actual')}</Label>
            <Input
              id="manual-actual-amount"
              type="number"
              step="0.01"
              min={0}
              {...form.register('amount', { valueAsNumber: true })}
            />
            {form.formState.errors.amount?.message && (
              <p className="text-xs text-red-700">{String(form.formState.errors.amount.message)}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manual-actual-notes">{t('notes')}</Label>
            <Textarea id="manual-actual-notes" rows={3} {...form.register('notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? '…' : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
