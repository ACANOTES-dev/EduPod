'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { createLeaveTypeSchema } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
} from '@school/ui';

export type LeaveTypeFormMode = 'create' | 'edit';

// Form schema extends create-schema with an optional `is_active` toggle used in
// edit mode. In create mode the field is hidden and sent as `true` by default.
const leaveTypeFormSchema = createLeaveTypeSchema.extend({
  is_active: z.boolean().default(true),
});

export type LeaveTypeFormValues = z.infer<typeof leaveTypeFormSchema>;

interface LeaveTypeFormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: LeaveTypeFormMode;
  initialValues?: Partial<LeaveTypeFormValues>;
  onSubmit: (values: LeaveTypeFormValues) => Promise<void>;
}

const DEFAULTS: LeaveTypeFormValues = {
  code: '',
  label: '',
  requires_approval: true,
  is_paid_default: true,
  max_days_per_request: null,
  requires_evidence: false,
  display_order: 100,
  is_active: true,
};

export function LeaveTypeForm({
  open,
  onOpenChange,
  mode,
  initialValues,
  onSubmit,
}: LeaveTypeFormProps) {
  const t = useTranslations('leaveTypes');
  const tc = useTranslations('common');

  const form = useForm<LeaveTypeFormValues>({
    resolver: zodResolver(leaveTypeFormSchema),
    defaultValues: { ...DEFAULTS, ...initialValues },
  });

  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      form.reset({ ...DEFAULTS, ...initialValues });
      setError('');
    }
  }, [open, initialValues, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setError('');
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setError(ex?.error?.message ?? ex?.message ?? tc('errorGeneric'));
    }
  });

  const maxDays = form.watch('max_days_per_request');
  const submitting = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('newType') : t('editType')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="lt-code">{t('fieldCode')}</Label>
              <Input
                id="lt-code"
                disabled={mode === 'edit'}
                placeholder={t('codePlaceholder')}
                {...form.register('code')}
                dir="ltr"
              />
              {form.formState.errors.code && (
                <p className="text-xs text-danger-text">{form.formState.errors.code.message}</p>
              )}
              {mode === 'edit' && (
                <p className="text-xs text-text-tertiary">{t('codeImmutable')}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-label">{t('fieldLabel')}</Label>
              <Input
                id="lt-label"
                placeholder={t('labelPlaceholder')}
                {...form.register('label')}
              />
              {form.formState.errors.label && (
                <p className="text-xs text-danger-text">{form.formState.errors.label.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lt-max">{t('fieldMaxDays')}</Label>
              <Input
                id="lt-max"
                type="number"
                min={1}
                max={365}
                value={maxDays ?? ''}
                onChange={(e) =>
                  form.setValue(
                    'max_days_per_request',
                    e.target.value === '' ? null : Number(e.target.value),
                    { shouldValidate: true, shouldDirty: true },
                  )
                }
                placeholder={t('fieldMaxDaysPlaceholder')}
              />
              <p className="text-xs text-text-tertiary">{t('fieldMaxDaysHelp')}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-order">{t('fieldDisplayOrder')}</Label>
              <Input
                id="lt-order"
                type="number"
                min={0}
                max={9999}
                {...form.register('display_order', { valueAsNumber: true })}
              />
              <p className="text-xs text-text-tertiary">{t('fieldDisplayOrderHelp')}</p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-border bg-surface-secondary/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="lt-approval">{t('fieldRequiresApproval')}</Label>
                <p className="text-xs text-text-tertiary">{t('fieldRequiresApprovalHelp')}</p>
              </div>
              <Switch
                id="lt-approval"
                checked={form.watch('requires_approval') ?? true}
                onCheckedChange={(v) =>
                  form.setValue('requires_approval', Boolean(v), { shouldDirty: true })
                }
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="lt-paid">{t('fieldIsPaid')}</Label>
                <p className="text-xs text-text-tertiary">{t('fieldIsPaidHelp')}</p>
              </div>
              <Switch
                id="lt-paid"
                checked={form.watch('is_paid_default') ?? true}
                onCheckedChange={(v) =>
                  form.setValue('is_paid_default', Boolean(v), { shouldDirty: true })
                }
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label htmlFor="lt-evidence">{t('fieldRequiresEvidence')}</Label>
                <p className="text-xs text-text-tertiary">{t('fieldRequiresEvidenceHelp')}</p>
              </div>
              <Switch
                id="lt-evidence"
                checked={form.watch('requires_evidence') ?? false}
                onCheckedChange={(v) =>
                  form.setValue('requires_evidence', Boolean(v), { shouldDirty: true })
                }
              />
            </div>
            {mode === 'edit' && (
              <div className="flex items-start justify-between gap-3 border-t border-border pt-3">
                <div>
                  <Label htmlFor="lt-active">{t('fieldIsActive')}</Label>
                  <p className="text-xs text-text-tertiary">{t('fieldIsActiveHelp')}</p>
                </div>
                <Switch
                  id="lt-active"
                  checked={form.watch('is_active') ?? true}
                  onCheckedChange={(v) =>
                    form.setValue('is_active', Boolean(v), { shouldDirty: true })
                  }
                />
              </div>
            )}
          </div>

          {error && <p className="text-sm text-danger-text">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? tc('loading') : mode === 'create' ? t('create') : tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
