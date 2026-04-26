'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createPayrollRunSchema } from '@school/shared';
import type { CreatePayrollRunDto } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface CreateRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (runId: string) => void;
}

export function CreateRunDialog({ open, onOpenChange, onSuccess }: CreateRunDialogProps) {
  const t = useTranslations('payroll');
  const locale = useLocale();

  const currentDate = React.useMemo(() => new Date(), []);

  const form = useForm<CreatePayrollRunDto>({
    resolver: zodResolver(createPayrollRunSchema),
    defaultValues: {
      period_label: '',
      period_month: currentDate.getMonth() + 1,
      period_year: currentDate.getFullYear(),
      total_working_days: 22,
    },
  });

  const periodMonth = form.watch('period_month');
  const periodYear = form.watch('period_year');

  // Localised month names — replaces the hardcoded English array.
  const months = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { month: 'long' });
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: fmt.format(new Date(2000, i, 1)),
    }));
  }, [locale]);

  const years = React.useMemo(
    () => Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i),
    [currentDate],
  );

  // Auto-fill period_label whenever the month/year changes (and the user hasn't
  // manually edited the label). The user can still override.
  const labelTouched = form.formState.dirtyFields.period_label;
  React.useEffect(() => {
    if (!open || labelTouched) return;
    const monthLabel = months.find((m) => m.value === periodMonth)?.label ?? '';
    form.setValue('period_label', `${monthLabel} ${periodYear}`.trim(), {
      shouldDirty: false,
    });
  }, [open, periodMonth, periodYear, months, labelTouched, form]);

  // Reset on close so the next open starts clean.
  React.useEffect(() => {
    if (!open) {
      form.reset({
        period_label: '',
        period_month: currentDate.getMonth() + 1,
        period_year: currentDate.getFullYear(),
        total_working_days: 22,
      });
    }
  }, [open, currentDate, form]);

  const onSubmit = async (data: CreatePayrollRunDto) => {
    try {
      const res = await apiClient<{ id: string }>('/api/v1/payroll/runs', {
        method: 'POST',
        body: JSON.stringify(data),
        silent: true,
      });
      toast.success(t('runCreated'));
      onSuccess(res.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('runCreateFailed');
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createRun')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="period-label">{t('periodLabel')}</Label>
            <Input
              id="period-label"
              {...form.register('period_label')}
              aria-invalid={!!form.formState.errors.period_label}
            />
            {form.formState.errors.period_label && (
              <p className="text-xs text-danger-600">
                {form.formState.errors.period_label.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period-month">{t('periodMonth')}</Label>
              <Controller
                name="period_month"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={String(field.value ?? '')}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger id="period-month">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {months.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-year">{t('periodYear')}</Label>
              <Controller
                name="period_year"
                control={form.control}
                render={({ field }) => (
                  <Select
                    value={String(field.value ?? '')}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger id="period-year">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="total-working-days">{t('totalWorkingDays')}</Label>
            <Input
              id="total-working-days"
              type="number"
              min={1}
              max={31}
              {...form.register('total_working_days', { valueAsNumber: true })}
              aria-invalid={!!form.formState.errors.total_working_days}
            />
            {form.formState.errors.total_working_days && (
              <p className="text-xs text-danger-600">
                {form.formState.errors.total_working_days.message}
              </p>
            )}
            <p className="text-xs text-text-tertiary">{t('totalWorkingDaysHint')}</p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? '…' : t('createRun')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
