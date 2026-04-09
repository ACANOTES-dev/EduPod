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

interface RequestReopenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fill the period when triggered from a specific window's closed state. */
  defaultPeriodId?: string | null;
}

// The request-reopen form is a superset of the teacher-request submit schema
// with request_type locked to `open_comment_window` and no target_scope_json.

const requestReopenFormSchema = z.object({
  academic_period_id: z.string().uuid({ message: 'periodRequired' }),
  reason: z.string().min(10, { message: 'reasonMinLength' }).max(2000),
});

type RequestReopenFormValues = z.infer<typeof requestReopenFormSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

export function RequestReopenModal({
  open,
  onOpenChange,
  defaultPeriodId,
}: RequestReopenModalProps) {
  const t = useTranslations('reportComments.requestReopenModal');
  const tc = useTranslations('common');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);

  const form = useForm<RequestReopenFormValues>({
    resolver: zodResolver(requestReopenFormSchema),
    defaultValues: {
      academic_period_id: defaultPeriodId ?? '',
      reason: '',
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
        console.error('[RequestReopenModal]', err);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      form.reset({
        academic_period_id: defaultPeriodId ?? '',
        reason: '',
      });
    }
  }, [open, defaultPeriodId, form]);

  const onSubmit = async (values: RequestReopenFormValues): Promise<void> => {
    try {
      await apiClient('/api/v1/report-card-teacher-requests', {
        method: 'POST',
        body: JSON.stringify({
          request_type: 'open_comment_window',
          academic_period_id: values.academic_period_id,
          target_scope_json: null,
          reason: values.reason.trim(),
        }),
      });
      toast.success(t('success'));
      onOpenChange(false);
    } catch (err) {
      console.error('[RequestReopenModal]', err);
      toast.error(t('failure'));
    }
  };

  const errors = form.formState.errors;
  const isSubmitting = form.formState.isSubmitting;
  const selectedPeriod = form.watch('academic_period_id');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
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
          <div className="space-y-1.5">
            <Label htmlFor="req_period">{t('periodLabel')}</Label>
            <Select
              value={selectedPeriod}
              onValueChange={(v) => {
                form.setValue('academic_period_id', v, { shouldValidate: true });
              }}
            >
              <SelectTrigger id="req_period" className="w-full">
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
              <p className="text-xs text-red-600">
                {errors.academic_period_id.message === 'periodRequired'
                  ? t('periodPlaceholder')
                  : errors.academic_period_id.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="req_reason">{t('reasonLabel')}</Label>
            <Textarea
              id="req_reason"
              rows={4}
              placeholder={t('reasonPlaceholder')}
              className="text-base"
              {...form.register('reason')}
            />
            {errors.reason?.message === 'reasonMinLength' && (
              <p className="text-xs text-red-600">{t('reasonMinLength')}</p>
            )}
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
