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
// independently from the same fields plus the edit-only `active` field.
const discountFormSchema = z
  .object({
    name: z.string().min(1).max(150),
    discount_type: z.enum(['fixed', 'percent']),
    value: z.number().positive(),
    active: z.boolean().optional(),
  })
  .refine((data) => data.discount_type !== 'percent' || data.value <= 100, {
    message: 'Percentage discount value must be <= 100',
    path: ['value'],
  });

export type DiscountFormValues = z.infer<typeof discountFormSchema>;

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

  const form = useForm<DiscountFormValues>({
    resolver: zodResolver(discountFormSchema),
    defaultValues: {
      name: initialValues?.name ?? '',
      discount_type: initialValues?.discount_type ?? 'fixed',
      value: initialValues?.value ?? ('' as unknown as number),
      active: initialValues?.active ?? true,
    },
  });

  const [formError, setFormError] = React.useState('');

  const watchDiscountType = form.watch('discount_type');

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
