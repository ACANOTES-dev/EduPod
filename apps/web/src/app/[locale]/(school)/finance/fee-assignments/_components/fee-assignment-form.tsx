'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { HouseholdSelector } from '../../_components/household-selector';

import { apiClient } from '@/lib/api-client';


// ─── Types ────────────────────────────────────────────────────────────────────

interface FeeStructure {
  id: string;
  name: string;
}

interface Discount {
  id: string;
  name: string;
}

interface Student {
  id: string;
  full_name: string;
}

// Form schema: optional UUID fields accept empty string (mapped to undefined before submit by callers)
const feeAssignmentFormSchema = z.object({
  household_id: z.string().uuid(),
  student_id: z.string().optional(),
  fee_structure_id: z.string().uuid(),
  discount_id: z.string().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type FeeAssignmentFormValues = z.infer<typeof feeAssignmentFormSchema>;

interface FeeAssignmentFormProps {
  initialValues?: Partial<FeeAssignmentFormValues>;
  onSubmit: (values: FeeAssignmentFormValues) => Promise<void>;
  submitLabel?: string;
  onCancel?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FeeAssignmentForm({
  initialValues,
  onSubmit,
  submitLabel,
  onCancel,
}: FeeAssignmentFormProps) {
  const t = useTranslations('finance');
  const tc = useTranslations('common');

  const form = useForm<FeeAssignmentFormValues>({
    resolver: zodResolver(feeAssignmentFormSchema),
    defaultValues: {
      household_id: initialValues?.household_id ?? '',
      student_id: initialValues?.student_id ?? '',
      fee_structure_id: initialValues?.fee_structure_id ?? '',
      discount_id: initialValues?.discount_id ?? '',
      effective_from: initialValues?.effective_from ?? new Date().toISOString().slice(0, 10),
    },
  });

  const [feeStructures, setFeeStructures] = React.useState<FeeStructure[]>([]);
  const [discounts, setDiscounts] = React.useState<Discount[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [formError, setFormError] = React.useState('');

  // Fetch fee structures and discounts on mount
  React.useEffect(() => {
    apiClient<{ data: FeeStructure[] }>('/api/v1/finance/fee-structures?pageSize=100&active=true')
      .then((res) => setFeeStructures(res.data))
      .catch(() => setFeeStructures([]));

    apiClient<{ data: Discount[] }>('/api/v1/finance/discounts?pageSize=100&active=true')
      .then((res) => setDiscounts(res.data))
      .catch(() => setDiscounts([]));
  }, []);

  const watchHouseholdId = form.watch('household_id');

  // Fetch students when household changes
  React.useEffect(() => {
    if (watchHouseholdId) {
      apiClient<{ data: Student[] }>(
        `/api/v1/students?pageSize=100&household_id=${watchHouseholdId}`,
      )
        .then((res) => setStudents(res.data))
        .catch(() => setStudents([]));
    } else {
      setStudents([]);
      form.setValue('student_id', '');
    }
  }, [watchHouseholdId, form]);

  const householdId = form.watch('household_id');
  const feeStructureId = form.watch('fee_structure_id');

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
          {t('feeAssignments.sectionDetails')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('feeAssignments.fieldHousehold')}</Label>
            <Controller
              control={form.control}
              name="household_id"
              render={({ field }) => (
                <HouseholdSelector value={field.value} onValueChange={field.onChange} />
              )}
            />
            {form.formState.errors.household_id && (
              <p className="text-sm text-danger-text">
                {form.formState.errors.household_id.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="student_id">{t('feeAssignments.fieldStudent')}</Label>
            <Controller
              control={form.control}
              name="student_id"
              render={({ field }) => (
                <Select
                  value={field.value || 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                  disabled={!householdId}
                >
                  <SelectTrigger id="student_id">
                    <SelectValue placeholder={t('feeAssignments.studentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('feeAssignments.noStudent')}</SelectItem>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fee_structure_id">{t('feeAssignments.fieldFeeStructure')}</Label>
            <Controller
              control={form.control}
              name="fee_structure_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="fee_structure_id">
                    <SelectValue placeholder={t('feeAssignments.feeStructurePlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {feeStructures.map((fs) => (
                      <SelectItem key={fs.id} value={fs.id}>
                        {fs.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.fee_structure_id && (
              <p className="text-sm text-danger-text">
                {form.formState.errors.fee_structure_id.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="discount_id">{t('feeAssignments.fieldDiscount')}</Label>
            <Controller
              control={form.control}
              name="discount_id"
              render={({ field }) => (
                <Select
                  value={field.value || 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? '' : v)}
                >
                  <SelectTrigger id="discount_id">
                    <SelectValue placeholder={t('feeAssignments.discountPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('feeAssignments.noDiscount')}</SelectItem>
                    {discounts.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="effective_from">{t('feeAssignments.fieldEffectiveFrom')}</Label>
            <Input id="effective_from" type="date" dir="ltr" {...form.register('effective_from')} />
            {form.formState.errors.effective_from && (
              <p className="text-sm text-danger-text">
                {form.formState.errors.effective_from.message}
              </p>
            )}
          </div>
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
        <Button
          type="submit"
          disabled={form.formState.isSubmitting || !householdId || !feeStructureId}
        >
          {form.formState.isSubmitting ? tc('loading') : (submitLabel ?? tc('save'))}
        </Button>
      </div>
    </form>
  );
}
