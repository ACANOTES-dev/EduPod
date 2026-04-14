'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { selfReportAbsenceSchema, type SelfReportAbsenceDto } from '@school/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface Colleague {
  id: string;
  first_name: string;
  last_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SelfReportAbsenceDialog({ open, onOpenChange, onSuccess }: Props) {
  const t = useTranslations('scheduling.selfReport');
  const todayIso = React.useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [colleagues, setColleagues] = React.useState<Colleague[]>([]);

  const form = useForm<SelfReportAbsenceDto>({
    resolver: zodResolver(selfReportAbsenceSchema),
    defaultValues: {
      date: todayIso,
      date_to: null,
      full_day: true,
      period_from: null,
      period_to: null,
      reason: null,
      nominated_substitute_staff_id: null,
    },
  });

  const fullDay = form.watch('full_day');
  const dateFrom = form.watch('date');

  React.useEffect(() => {
    if (!open) return;
    form.reset({
      date: todayIso,
      date_to: null,
      full_day: true,
      period_from: null,
      period_to: null,
      reason: null,
      nominated_substitute_staff_id: null,
    });
    apiClient<{ data: Colleague[] }>('/api/v1/scheduling/colleagues', { silent: true })
      .then((res) => setColleagues(res.data ?? []))
      .catch((err) => console.error('[SelfReportAbsenceDialog.colleagues]', err));
  }, [open, form, todayIso]);

  const onSubmit = async (values: SelfReportAbsenceDto) => {
    try {
      await apiClient('/api/v1/scheduling/absences/self-report', {
        method: 'POST',
        body: JSON.stringify({
          date: values.date,
          date_to: values.date_to || null,
          full_day: values.full_day,
          period_from: values.full_day ? null : values.period_from,
          period_to: values.full_day ? null : values.period_to,
          reason: values.reason?.trim() || null,
          nominated_substitute_staff_id: values.nominated_substitute_staff_id || null,
        }),
      });
      toast.success(t('submittedToast'));
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('submitError');
      toast.error(msg);
    }
  };

  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sr-date" className="block text-sm font-medium text-text-primary mb-1">
                {t('dateFrom')}
              </label>
              <input
                id="sr-date"
                type="date"
                required
                min={todayIso}
                {...form.register('date')}
                className="w-full rounded-md border border-border px-3 py-2 text-base"
              />
            </div>
            <div>
              <label
                htmlFor="sr-date-to"
                className="block text-sm font-medium text-text-primary mb-1"
              >
                {t('dateTo')}
              </label>
              <input
                id="sr-date-to"
                type="date"
                min={dateFrom}
                {...form.register('date_to')}
                placeholder={t('singleDay')}
                className="w-full rounded-md border border-border px-3 py-2 text-base"
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register('full_day')} />
              <span>{t('fullDay')}</span>
            </label>
          </div>

          {!fullDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="sr-p-from"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  {t('periodFrom')}
                </label>
                <input
                  id="sr-p-from"
                  type="number"
                  min={1}
                  max={20}
                  required
                  {...form.register('period_from', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border px-3 py-2 text-base"
                />
              </div>
              <div>
                <label
                  htmlFor="sr-p-to"
                  className="block text-sm font-medium text-text-primary mb-1"
                >
                  {t('periodTo')}
                </label>
                <input
                  id="sr-p-to"
                  type="number"
                  min={1}
                  max={20}
                  {...form.register('period_to', { valueAsNumber: true })}
                  className="w-full rounded-md border border-border px-3 py-2 text-base"
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="sr-reason" className="block text-sm font-medium text-text-primary mb-1">
              {t('reason')}
            </label>
            <textarea
              id="sr-reason"
              rows={2}
              maxLength={500}
              {...form.register('reason')}
              className="w-full rounded-md border border-border px-3 py-2 text-base"
              placeholder={t('reasonPlaceholder')}
            />
          </div>

          <div>
            <label
              htmlFor="sr-nominee"
              className="block text-sm font-medium text-text-primary mb-1"
            >
              {t('nominateLabel')}
            </label>
            <select
              id="sr-nominee"
              {...form.register('nominated_substitute_staff_id')}
              className="w-full rounded-md border border-border px-3 py-2 text-base"
            >
              <option value="">{t('autoAssign')}</option>
              {colleagues.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-secondary mt-1">{t('nominateHelp')}</p>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('submit')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
