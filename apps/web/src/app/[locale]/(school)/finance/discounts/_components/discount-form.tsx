'use client';

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
import { useTranslations } from 'next-intl';
import * as React from 'react';


// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscountFormValues {
  name: string;
  discount_type: DiscountType;
  value: string;
  active: boolean;
}

interface DiscountFormProps {
  initialValues?: Partial<DiscountFormValues>;
  onSubmit: (values: DiscountFormValues) => Promise<void>;
  isEdit?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
}

const DEFAULT_VALUES: DiscountFormValues = {
  name: '',
  discount_type: 'fixed',
  value: '',
  active: true,
};

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

  const [values, setValues] = React.useState<DiscountFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const set =
    (field: keyof DiscountFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Client-side validation: percent must be <= 100
    if (values.discount_type === 'percent') {
      const numVal = parseFloat(values.value);
      if (numVal > 100) {
        setError(t('discounts.percentMaxError'));
        return;
      }
    }

    setLoading(true);
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
          {t('discounts.sectionDetails')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">{t('discounts.fieldName')}</Label>
            <Input
              id="name"
              value={values.name}
              onChange={set('name')}
              required
              maxLength={150}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="discount_type">{t('discounts.fieldType')}</Label>
            <Select
              value={values.discount_type}
              onValueChange={(v) =>
                setValues((p) => ({ ...p, discount_type: v as DiscountType }))
              }
            >
              <SelectTrigger id="discount_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">{t('discounts.typeFixed')}</SelectItem>
                <SelectItem value="percent">{t('discounts.typePercent')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="value">{t('discounts.fieldValue')}</Label>
            <div className="relative">
              <Input
                id="value"
                type="number"
                step="0.01"
                min="0.01"
                max={values.discount_type === 'percent' ? '100' : undefined}
                value={values.value}
                onChange={set('value')}
                required
                dir="ltr"
                className={values.discount_type === 'percent' ? 'pe-8' : ''}
              />
              {values.discount_type === 'percent' && (
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
                  %
                </span>
              )}
            </div>
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
              <Label htmlFor="active">{t('discounts.fieldActive')}</Label>
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
