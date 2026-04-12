'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { createFeeStructureSchema } from '@school/shared';
import type { BillingFrequency } from '@school/shared';
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

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YearGroup {
  id: string;
  name: string;
}

interface FeeType {
  id: string;
  name: string;
}

// Extend the create schema with `active` (edit-only field)
const feeStructureFormSchema = createFeeStructureSchema.extend({
  active: z.boolean().optional(),
});

export type FeeStructureFormValues = z.infer<typeof feeStructureFormSchema>;

interface FeeStructureFormProps {
  initialValues?: Partial<FeeStructureFormValues>;
  onSubmit: (values: FeeStructureFormValues) => Promise<void>;
  isEdit?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FeeStructureForm({
  initialValues,
  onSubmit,
  isEdit = false,
  submitLabel,
  onCancel,
}: FeeStructureFormProps) {
  const t = useTranslations('finance');
  const tc = useTranslations('common');

  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [feeTypes, setFeeTypes] = React.useState<FeeType[]>([]);

  React.useEffect(() => {
    apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data))
      .catch((err) => {
        console.error('[FeeStructureForm]', err);
        return setYearGroups([]);
      });

    apiClient<{ data: FeeType[] }>('/api/v1/finance/fee-types?pageSize=100&active=true')
      .then((res) => setFeeTypes(res.data))
      .catch((err) => {
        console.error('[FeeStructureForm]', err);
        return setFeeTypes([]);
      });
  }, []);

  const form = useForm<FeeStructureFormValues>({
    resolver: zodResolver(feeStructureFormSchema),
    defaultValues: {
      name: initialValues?.name ?? '',
      amount: initialValues?.amount ?? ('' as unknown as number),
      billing_frequency: initialValues?.billing_frequency ?? 'one_off',
      year_group_id: initialValues?.year_group_id ?? '',
      fee_type_id: initialValues?.fee_type_id ?? '',
      active: initialValues?.active ?? true,
    },
  });

  const [formError, setFormError] = React.useState('');

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
          {t('feeStructures.sectionDetails')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">{t('feeStructures.fieldName')}</Label>
            <Input id="name" {...form.register('name')} maxLength={150} />
            {form.formState.errors.name && (
              <p className="text-sm text-danger-text">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">{t('feeStructures.fieldAmount')}</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              dir="ltr"
              {...form.register('amount', { valueAsNumber: true })}
            />
            {form.formState.errors.amount && (
              <p className="text-sm text-danger-text">{form.formState.errors.amount.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="billing_frequency">{t('feeStructures.fieldFrequency')}</Label>
            <Controller
              control={form.control}
              name="billing_frequency"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as BillingFrequency)}
                >
                  <SelectTrigger id="billing_frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="one_off">{t('feeStructures.freqOneOff')}</SelectItem>
                    <SelectItem value="term">{t('feeStructures.freqTerm')}</SelectItem>
                    <SelectItem value="monthly">{t('feeStructures.freqMonthly')}</SelectItem>
                    <SelectItem value="custom">{t('feeStructures.freqCustom')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.billing_frequency && (
              <p className="text-sm text-danger-text">
                {form.formState.errors.billing_frequency.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="year_group_id">{t('feeStructures.fieldYearGroup')}</Label>
            <Controller
              control={form.control}
              name="year_group_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                >
                  <SelectTrigger id="year_group_id">
                    <SelectValue placeholder={t('feeStructures.yearGroupPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('feeStructures.allYearGroups')}</SelectItem>
                    {yearGroups.map((yg) => (
                      <SelectItem key={yg.id} value={yg.id}>
                        {yg.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fee_type_id">{t('feeStructures.fieldFeeType')}</Label>
            <Controller
              control={form.control}
              name="fee_type_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? undefined : v)}
                >
                  <SelectTrigger id="fee_type_id">
                    <SelectValue placeholder={t('feeStructures.feeTypePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('feeStructures.noFeeType')}</SelectItem>
                    {feeTypes.map((ft) => (
                      <SelectItem key={ft.id} value={ft.id}>
                        {ft.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-text-tertiary">{t('feeStructures.feeTypeHelp')}</p>
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
              <Label htmlFor="active">{t('feeStructures.fieldActive')}</Label>
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
