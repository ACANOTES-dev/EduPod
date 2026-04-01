'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

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

export interface FeeAssignmentFormValues {
  household_id: string;
  student_id: string;
  fee_structure_id: string;
  discount_id: string;
  effective_from: string;
}

interface FeeAssignmentFormProps {
  initialValues?: Partial<FeeAssignmentFormValues>;
  onSubmit: (values: FeeAssignmentFormValues) => Promise<void>;
  submitLabel?: string;
  onCancel?: () => void;
}

const DEFAULT_VALUES: FeeAssignmentFormValues = {
  household_id: '',
  student_id: '',
  fee_structure_id: '',
  discount_id: '',
  effective_from: new Date().toISOString().slice(0, 10),
};

// ─── Component ────────────────────────────────────────────────────────────────

export function FeeAssignmentForm({
  initialValues,
  onSubmit,
  submitLabel,
  onCancel,
}: FeeAssignmentFormProps) {
  const t = useTranslations('finance');
  const tc = useTranslations('common');

  const [values, setValues] = React.useState<FeeAssignmentFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });
  const [feeStructures, setFeeStructures] = React.useState<FeeStructure[]>([]);
  const [discounts, setDiscounts] = React.useState<Discount[]>([]);
  const [students, setStudents] = React.useState<Student[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  // Fetch fee structures and discounts on mount
  React.useEffect(() => {
    apiClient<{ data: FeeStructure[] }>('/api/v1/finance/fee-structures?pageSize=100&active=true')
      .then((res) => setFeeStructures(res.data))
      .catch(() => setFeeStructures([]));

    apiClient<{ data: Discount[] }>('/api/v1/finance/discounts?pageSize=100&active=true')
      .then((res) => setDiscounts(res.data))
      .catch(() => setDiscounts([]));
  }, []);

  // Fetch students when household changes
  React.useEffect(() => {
    if (values.household_id) {
      apiClient<{ data: Student[] }>(
        `/api/v1/students?pageSize=100&household_id=${values.household_id}`,
      )
        .then((res) => setStudents(res.data))
        .catch(() => setStudents([]));
    } else {
      setStudents([]);
      setValues((p) => ({ ...p, student_id: '' }));
    }
  }, [values.household_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold text-text-primary">
          {t('feeAssignments.sectionDetails')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>{t('feeAssignments.fieldHousehold')}</Label>
            <HouseholdSelector
              value={values.household_id}
              onValueChange={(v) => setValues((p) => ({ ...p, household_id: v }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="student_id">{t('feeAssignments.fieldStudent')}</Label>
            <Select
              value={values.student_id || 'none'}
              onValueChange={(v) => setValues((p) => ({ ...p, student_id: v === 'none' ? '' : v }))}
              disabled={!values.household_id}
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fee_structure_id">{t('feeAssignments.fieldFeeStructure')}</Label>
            <Select
              value={values.fee_structure_id}
              onValueChange={(v) => setValues((p) => ({ ...p, fee_structure_id: v }))}
            >
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="discount_id">{t('feeAssignments.fieldDiscount')}</Label>
            <Select
              value={values.discount_id || 'none'}
              onValueChange={(v) =>
                setValues((p) => ({ ...p, discount_id: v === 'none' ? '' : v }))
              }
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="effective_from">{t('feeAssignments.fieldEffectiveFrom')}</Label>
            <Input
              id="effective_from"
              type="date"
              value={values.effective_from}
              onChange={(e) => setValues((p) => ({ ...p, effective_from: e.target.value }))}
              required
              dir="ltr"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-danger-text">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            {tc('cancel')}
          </Button>
        )}
        <Button
          type="submit"
          disabled={loading || !values.household_id || !values.fee_structure_id}
        >
          {loading ? tc('loading') : (submitLabel ?? tc('save'))}
        </Button>
      </div>
    </form>
  );
}
