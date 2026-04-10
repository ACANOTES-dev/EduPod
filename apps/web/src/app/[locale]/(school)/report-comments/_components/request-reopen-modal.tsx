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
  academic_year?: { id: string; name: string } | null;
}

interface AcademicYear {
  id: string;
  name: string;
  status?: string;
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

// Phase 1b — Option B: the scope value is either a period UUID OR a
// `full_year:<yearId>` sentinel. The Zod schema validates the shape of the
// scope token; the submit handler decodes it into the correct API payload.

const FULL_YEAR_PREFIX = 'full_year:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requestReopenFormSchema = z.object({
  scope_token: z
    .string()
    .min(1, { message: 'periodRequired' })
    .refine(
      (v) =>
        UUID_RE.test(v) ||
        (v.startsWith(FULL_YEAR_PREFIX) && UUID_RE.test(v.slice(FULL_YEAR_PREFIX.length))),
      { message: 'periodRequired' },
    ),
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
  const tWizard = useTranslations('reportCards.wizard');
  const tc = useTranslations('common');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [years, setYears] = React.useState<AcademicYear[]>([]);

  const form = useForm<RequestReopenFormValues>({
    resolver: zodResolver(requestReopenFormSchema),
    defaultValues: {
      scope_token: defaultPeriodId ?? '',
      reason: '',
    },
  });

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [periodsRes, yearsRes] = await Promise.all([
          apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50'),
          apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=20'),
        ]);
        if (cancelled) return;
        setPeriods(periodsRes.data ?? []);
        const sortedYears = [...(yearsRes.data ?? [])].sort((a, b) => {
          if (a.status === 'active' && b.status !== 'active') return -1;
          if (b.status === 'active' && a.status !== 'active') return 1;
          return b.name.localeCompare(a.name);
        });
        setYears(sortedYears);
      } catch (err) {
        console.error('[RequestReopenModal]', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  React.useEffect(() => {
    if (open) {
      form.reset({
        scope_token: defaultPeriodId ?? '',
        reason: '',
      });
    }
  }, [open, defaultPeriodId, form]);

  const onSubmit = async (values: RequestReopenFormValues): Promise<void> => {
    try {
      // Decode the scope token into the API payload. Per-period requests
      // send academic_period_id; full-year requests send academic_year_id
      // with academic_period_id explicitly null.
      const isFullYear = values.scope_token.startsWith(FULL_YEAR_PREFIX);
      const payload = isFullYear
        ? {
            request_type: 'open_comment_window' as const,
            academic_period_id: null,
            academic_year_id: values.scope_token.slice(FULL_YEAR_PREFIX.length),
            target_scope_json: null,
            reason: values.reason.trim(),
          }
        : {
            request_type: 'open_comment_window' as const,
            academic_period_id: values.scope_token,
            target_scope_json: null,
            reason: values.reason.trim(),
          };
      await apiClient('/api/v1/report-card-teacher-requests', {
        method: 'POST',
        body: JSON.stringify(payload),
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
  const selectedScope = form.watch('scope_token');

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
              value={selectedScope}
              onValueChange={(v) => {
                form.setValue('scope_token', v, { shouldValidate: true });
              }}
            >
              <SelectTrigger id="req_period" className="w-full">
                <SelectValue placeholder={t('periodPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={`year-${y.id}`} value={`${FULL_YEAR_PREFIX}${y.id}`}>
                    {tWizard('periodFullYear', { year: y.name })}
                  </SelectItem>
                ))}
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.scope_token && (
              <p className="text-xs text-red-600">
                {errors.scope_token.message === 'periodRequired'
                  ? t('periodPlaceholder')
                  : errors.scope_token.message}
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
