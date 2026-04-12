'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import type { DiscountType } from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

// createDiscountSchema uses .refine() (ZodEffects), so we build the form schema
// independently from the same fields plus the edit-only `active` field. Refine
// messages are sourced from translations via a factory so that Arabic users see
// Arabic validation errors instead of English fallbacks.
const baseDiscountSchema = z.object({
  name: z.string().min(1).max(150),
  discount_type: z.enum(['fixed', 'percent']),
  value: z.number().positive(),
  active: z.boolean().optional(),
  auto_apply: z.boolean().default(false),
  auto_condition_type: z.enum(['sibling', 'staff']).optional(),
  auto_condition_min_students: z.number().int().min(2).optional(),
});

type DiscountBaseValues = z.infer<typeof baseDiscountSchema>;

function makeDiscountFormSchema(messages: { percentMax: string; needCondition: string }) {
  return baseDiscountSchema
    .refine((data) => data.discount_type !== 'percent' || data.value <= 100, {
      message: messages.percentMax,
      path: ['value'],
    })
    .refine((data) => !data.auto_apply || data.auto_condition_type != null, {
      message: messages.needCondition,
      path: ['auto_condition_type'],
    });
}

export type DiscountFormValues = DiscountBaseValues;

interface DiscountFormProps {
  initialValues?: Partial<DiscountFormValues>;
  onSubmit: (values: DiscountFormValues) => Promise<void>;
  isEdit?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DiscountForm({
  initialValues,
  onSubmit,
  isEdit = false,
  submitLabel,
  onCancel,
}: DiscountFormProps) {
  const t = useTranslations('finance');
  const tc = useTranslations('common');

  const schema = React.useMemo(
    () =>
      makeDiscountFormSchema({
        percentMax: t('discountPercentMax'),
        needCondition: t('autoApplyNeedsCondition'),
      }),
    [t],
  );

  const form = useForm<DiscountFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initialValues?.name ?? '',
      discount_type: initialValues?.discount_type ?? 'fixed',
      value: initialValues?.value ?? ('' as unknown as number),
      active: initialValues?.active ?? true,
      auto_apply: initialValues?.auto_apply ?? false,
      auto_condition_type: initialValues?.auto_condition_type ?? undefined,
      auto_condition_min_students: initialValues?.auto_condition_min_students ?? 2,
    },
  });

  const [formError, setFormError] = React.useState('');

  const watchDiscountType = form.watch('discount_type');
  const watchAutoApply = form.watch('auto_apply');
  const watchConditionType = form.watch('auto_condition_type');

  const handleSubmit = form.handleSubmit(async (values) => {
    setFormError('');
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setFormError(ex?.error?.message ?? tc('errorGeneric'));
    }
  });

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {t('discounts.sectionDetails')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">{t('discounts.fieldName')}</Label>
            <Input id="name" {...form.register('name')} maxLength={150} />
            {form.formState.errors.name && (
              <p className="text-sm text-danger-text">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="discount_type">{t('discounts.fieldType')}</Label>
            <Controller
              control={form.control}
              name="discount_type"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as DiscountType)}
                >
                  <SelectTrigger id="discount_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{t('discounts.typeFixed')}</SelectItem>
                    <SelectItem value="percent">{t('discounts.typePercent')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.discount_type && (
              <p className="text-sm text-danger-text">
                {form.formState.errors.discount_type.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="value">{t('discounts.fieldValue')}</Label>
            <div className="relative">
              <Input
                id="value"
                type="number"
                step="0.01"
                min="0.01"
                max={watchDiscountType === 'percent' ? '100' : undefined}
                dir="ltr"
                className={watchDiscountType === 'percent' ? 'pe-8' : ''}
                {...form.register('value', { valueAsNumber: true })}
              />
              {watchDiscountType === 'percent' && (
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
                  %
                </span>
              )}
            </div>
            {form.formState.errors.value && (
              <p className="text-sm text-danger-text">{form.formState.errors.value.message}</p>
            )}
          </div>

          {isEdit && (
            <div className="flex items-center gap-3 sm:col-span-2">
              <Controller
                control={form.control}
                name="active"
                render={({ field }) => (
                  <Switch
                    id="active"
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
              <Label htmlFor="active">{t('discounts.fieldActive')}</Label>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Apply Configuration */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-2 text-base font-semibold text-text-primary">
          {t('discounts.autoApplyTitle')}
        </h2>
        <p className="mb-4 text-sm text-text-secondary">{t('discounts.autoApplyDesc')}</p>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Controller
              control={form.control}
              name="auto_apply"
              render={({ field }) => (
                <Switch id="auto_apply" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <Label htmlFor="auto_apply">{t('discounts.enableAutoApply')}</Label>
          </div>

          {watchAutoApply && (
            <div className="ms-8 space-y-4 border-s-2 border-primary-200 ps-4">
              <div className="space-y-1.5">
                <Label htmlFor="auto_condition_type">{t('discounts.conditionType')}</Label>
                <Controller
                  control={form.control}
                  name="auto_condition_type"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v as 'sibling' | 'staff')}
                    >
                      <SelectTrigger id="auto_condition_type">
                        <SelectValue placeholder={t('discounts.selectCondition')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sibling">{t('discounts.conditionSibling')}</SelectItem>
                        <SelectItem value="staff">{t('discounts.conditionStaff')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {form.formState.errors.auto_condition_type && (
                  <p className="text-sm text-danger-text">
                    {form.formState.errors.auto_condition_type.message}
                  </p>
                )}
              </div>

              {watchConditionType === 'sibling' && (
                <div className="space-y-1.5">
                  <Label htmlFor="min_students">{t('discounts.minStudents')}</Label>
                  <p className="text-xs text-text-tertiary">{t('discounts.minStudentsDesc')}</p>
                  <Input
                    id="min_students"
                    type="number"
                    min="2"
                    dir="ltr"
                    className="w-full sm:w-24"
                    {...form.register('auto_condition_min_students', { valueAsNumber: true })}
                  />
                </div>
              )}

              {watchConditionType === 'staff' && (
                <p className="text-sm text-text-secondary">{t('discounts.staffDesc')}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {formError && <p className="text-sm text-danger-text">{formError}</p>}

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={form.formState.isSubmitting}
          >
            {tc('cancel')}
          </Button>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? tc('loading') : (submitLabel ?? tc('save'))}
        </Button>
      </div>
    </form>
  );
}
