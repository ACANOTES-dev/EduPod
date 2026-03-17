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
  Switch,
} from '@school/ui';
import type { BillingFrequency } from '@school/shared';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YearGroup {
  id: string;
  name: string;
}

export interface FeeStructureFormValues {
  name: string;
  amount: string;
  billing_frequency: BillingFrequency;
  year_group_id: string;
  active: boolean;
}

interface FeeStructureFormProps {
  initialValues?: Partial<FeeStructureFormValues>;
  onSubmit: (values: FeeStructureFormValues) => Promise<void>;
  isEdit?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

const DEFAULT_VALUES: FeeStructureFormValues = {
  name: '',
  amount: '',
  billing_frequency: 'one_off',
  year_group_id: '',
  active: true,
};

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

  const [values, setValues] = React.useState<FeeStructureFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data))
      .catch(() => setYearGroups([]));
  }, []);

  const set =
    (field: keyof FeeStructureFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [field]: e.target.value }));

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
          {t('feeStructures.sectionDetails')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">{t('feeStructures.fieldName')}</Label>
            <Input
              id="name"
              value={values.name}
              onChange={set('name')}
              required
              maxLength={150}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">{t('feeStructures.fieldAmount')}</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              value={values.amount}
              onChange={set('amount')}
              required
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="billing_frequency">{t('feeStructures.fieldFrequency')}</Label>
            <Select
              value={values.billing_frequency}
              onValueChange={(v) =>
                setValues((p) => ({ ...p, billing_frequency: v as BillingFrequency }))
              }
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="year_group_id">{t('feeStructures.fieldYearGroup')}</Label>
            <Select
              value={values.year_group_id || 'none'}
              onValueChange={(v) =>
                setValues((p) => ({ ...p, year_group_id: v === 'none' ? '' : v }))
              }
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
          </div>

          {isEdit && (
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch
                id="active"
                checked={values.active}
                onCheckedChange={(checked) =>
                  setValues((p) => ({ ...p, active: checked }))
                }
              />
              <Label htmlFor="active">{t('feeStructures.fieldActive')}</Label>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-danger-text">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            {tc('cancel')}
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? tc('loading') : (submitLabel ?? tc('save'))}
        </Button>
      </div>
    </form>
  );
}
