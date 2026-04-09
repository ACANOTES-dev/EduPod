'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicPeriod {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

interface OpenWindowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// ─── Form schema (separate from backend schema to avoid the datetime ISO)
// The datetime-local input yields strings like "2026-04-09T17:30" that we
// convert to ISO before POSTing. The form-level refine keeps UX feedback local.
// ─────────────────────────────────────────────────────────────────────────────

const openWindowFormSchema = z
  .object({
    academic_period_id: z.string().uuid({ message: 'periodRequired' }),
    opens_at_local: z.string().min(1),
    closes_at_local: z.string().min(1, { message: 'closesAtRequired' }),
    instructions: z.string().max(2000).optional(),
  })
  .refine(
    (data) => {
      if (!data.opens_at_local || !data.closes_at_local) return true;
      return new Date(data.closes_at_local) > new Date(data.opens_at_local);
    },
    { message: 'validationClosesAfterOpens', path: ['closes_at_local'] },
  );

type OpenWindowFormValues = z.infer<typeof openWindowFormSchema>;

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpenWindowModal({ open, onOpenChange, onSuccess }: OpenWindowModalProps) {
  const t = useTranslations('reportComments.openWindowModal');
  const tc = useTranslations('common');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);

  const form = useForm<OpenWindowFormValues>({
    resolver: zodResolver(openWindowFormSchema),
    defaultValues: {
      academic_period_id: '',
      opens_at_local: nowLocalInput(),
      closes_at_local: '',
      instructions: '',
    },
  });

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => {
        if (!cancelled) setPeriods(res.data ?? []);
      })
      .catch((err) => {
        console.error('[OpenWindowModal]', err);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset defaults whenever the dialog opens so stale state doesn't stick.
  React.useEffect(() => {
    if (open) {
      form.reset({
        academic_period_id: '',
        opens_at_local: nowLocalInput(),
        closes_at_local: '',
        instructions: '',
      });
    }
  }, [open, form]);

  const onSubmit = async (values: OpenWindowFormValues): Promise<void> => {
    try {
      await apiClient('/api/v1/report-comment-windows', {
        method: 'POST',
        body: JSON.stringify({
          academic_period_id: values.academic_period_id,
          opens_at: new Date(values.opens_at_local).toISOString(),
          closes_at: new Date(values.closes_at_local).toISOString(),
          instructions: values.instructions?.trim() ? values.instructions.trim() : null,
        }),
      });
      toast.success(t('success'));
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error('[OpenWindowModal]', err);
      toast.error(t('failure'));
    }
  };

  const errors = form.formState.errors;
  const isSubmitting = form.formState.isSubmitting;
  const selectedPeriod = form.watch('academic_period_id');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void form.handleSubmit(onSubmit)(e);
          }}
          className="space-y-4"
          noValidate
        >
          {/* Academic period */}
          <div className="space-y-1.5">
            <Label htmlFor="period">{t('periodLabel')}</Label>
            <Select
              value={selectedPeriod}
              onValueChange={(v) => {
                form.setValue('academic_period_id', v, { shouldValidate: true });
              }}
            >
              <SelectTrigger id="period" className="w-full">
                <SelectValue placeholder={t('periodPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.academic_period_id && (
              <p className="text-xs text-red-600">{t('periodRequired')}</p>
            )}
          </div>

          {/* Opens at */}
          <div className="space-y-1.5">
            <Label htmlFor="opens_at">{t('opensAtLabel')}</Label>
            <input
              id="opens_at"
              type="datetime-local"
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              {...form.register('opens_at_local')}
            />
          </div>

          {/* Closes at */}
          <div className="space-y-1.5">
            <Label htmlFor="closes_at">{t('closesAtLabel')}</Label>
            <input
              id="closes_at"
              type="datetime-local"
              className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              {...form.register('closes_at_local')}
            />
            {errors.closes_at_local?.message === 'validationClosesAfterOpens' && (
              <p className="text-xs text-red-600">{t('validationClosesAfterOpens')}</p>
            )}
            {errors.closes_at_local?.message === 'closesAtRequired' && (
              <p className="text-xs text-red-600">{t('closesAtRequired')}</p>
            )}
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <Label htmlFor="instructions">{t('instructionsLabel')}</Label>
            <Textarea
              id="instructions"
              rows={3}
              placeholder={t('instructionsPlaceholder')}
              className="text-base"
              {...form.register('instructions')}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="min-h-11"
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-h-11">
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
