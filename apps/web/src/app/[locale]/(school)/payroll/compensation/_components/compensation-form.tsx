'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createCompensationSchema } from '@school/shared';
import type { CreateCompensationDto } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface StaffOption {
  id: string;
  full_name: string;
}

interface CompensationRecord {
  id: string;
  staff_profile_id: string;
  compensation_type: 'salaried' | 'per_class';
  base_salary: number | null;
  per_class_rate: number | null;
  assigned_classes: number | null;
  bonus_class_rate: number | null;
  bonus_day_multiplier: number | null;
  effective_from: string;
  effective_to: string | null;
}

interface CompensationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: CompensationRecord | null;
  onSuccess: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function recordToDefaults(record: CompensationRecord | null): CreateCompensationDto {
  if (!record) {
    return {
      staff_profile_id: '',
      compensation_type: 'salaried',
      base_salary: null,
      per_class_rate: null,
      assigned_class_count: null,
      bonus_class_rate: null,
      bonus_day_multiplier: 1.0,
      effective_from: todayISO(),
    };
  }
  return {
    staff_profile_id: record.staff_profile_id,
    compensation_type: record.compensation_type,
    base_salary: record.base_salary,
    per_class_rate: record.per_class_rate,
    assigned_class_count: record.assigned_classes,
    bonus_class_rate: record.bonus_class_rate,
    bonus_day_multiplier: record.bonus_day_multiplier ?? 1.0,
    effective_from: todayISO(), // revisions always start today
  };
}

export function CompensationForm({ open, onOpenChange, record, onSuccess }: CompensationFormProps) {
  const t = useTranslations('payroll');
  const isRevision = !!record;

  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);

  const form = useForm<CreateCompensationDto>({
    resolver: zodResolver(createCompensationSchema),
    defaultValues: recordToDefaults(record),
  });

  React.useEffect(() => {
    if (open) {
      form.reset(recordToDefaults(record));
    }
  }, [open, record, form]);

  // Wave-3 endpoint that flattens `full_name` for the picker.
  React.useEffect(() => {
    if (!open) return;
    void apiClient<{ data: StaffOption[] }>('/api/v1/payroll/staff?pageSize=200', { silent: true })
      .then((res) => setStaffOptions(res.data))
      .catch((err) => {
        const message = err instanceof Error ? err.message : t('staffLoadFailed');
        toast.error(message);
      });
  }, [open, t]);

  const compensationType = form.watch('compensation_type');

  const onSubmit = async (data: CreateCompensationDto) => {
    try {
      // Discriminated payload: salaried vs per_class. The schema's refinements
      // already enforce mutual exclusivity, but we strip nulls before send so
      // the API request is minimal.
      const payload =
        data.compensation_type === 'salaried'
          ? {
              staff_profile_id: data.staff_profile_id,
              compensation_type: 'salaried' as const,
              base_salary: data.base_salary,
              bonus_day_multiplier: data.bonus_day_multiplier,
              effective_from: data.effective_from,
              per_class_rate: null,
              bonus_class_rate: null,
              assigned_class_count: null,
            }
          : {
              staff_profile_id: data.staff_profile_id,
              compensation_type: 'per_class' as const,
              per_class_rate: data.per_class_rate,
              bonus_class_rate: data.bonus_class_rate,
              assigned_class_count: data.assigned_class_count,
              effective_from: data.effective_from,
              base_salary: null,
            };

      await apiClient('/api/v1/payroll/compensation', {
        method: 'POST',
        body: JSON.stringify(payload),
        silent: true,
      });
      toast.success(isRevision ? t('compensationRevised') : t('compensationCreated'));
      onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('saveFailed');
      toast.error(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isRevision ? t('reviseCompensation') : t('addCompensation')}</DialogTitle>
        </DialogHeader>
        {isRevision && <p className="text-xs text-text-secondary">{t('reviseCompensationNote')}</p>}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Staff selector */}
          <div className="space-y-2">
            <Label htmlFor="staff-select">{t('selectStaff')}</Label>
            <Controller
              name="staff_profile_id"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isRevision}>
                  <SelectTrigger id="staff-select">
                    <SelectValue placeholder={t('selectStaff')} />
                  </SelectTrigger>
                  <SelectContent>
                    {staffOptions.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.staff_profile_id && (
              <p className="text-xs text-danger-600">
                {form.formState.errors.staff_profile_id.message}
              </p>
            )}
          </div>

          {/* Compensation type */}
          <div className="space-y-2">
            <Label>{t('compensationType')}</Label>
            <Controller
              name="compensation_type"
              control={form.control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as 'salaried' | 'per_class')}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="salaried" id="type-salaried" />
                    <Label htmlFor="type-salaried">{t('salaried')}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="per_class" id="type-per-class" />
                    <Label htmlFor="type-per-class">{t('perClass')}</Label>
                  </div>
                </RadioGroup>
              )}
            />
          </div>

          {/* Conditional fields */}
          {compensationType === 'salaried' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="base-salary">{t('baseSalary')}</Label>
                <Input
                  id="base-salary"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register('base_salary', { valueAsNumber: true })}
                />
                {form.formState.errors.base_salary && (
                  <p className="text-xs text-danger-600">
                    {form.formState.errors.base_salary.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="bonus-day-multiplier">{t('bonusDayMultiplier')}</Label>
                <Input
                  id="bonus-day-multiplier"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register('bonus_day_multiplier', { valueAsNumber: true })}
                  placeholder="e.g. 1.5"
                />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="per-class-rate">{t('perClassRate')}</Label>
                <Input
                  id="per-class-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register('per_class_rate', { valueAsNumber: true })}
                />
                {form.formState.errors.per_class_rate && (
                  <p className="text-xs text-danger-600">
                    {form.formState.errors.per_class_rate.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="bonus-class-rate">{t('bonusClassRate')}</Label>
                <Input
                  id="bonus-class-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  {...form.register('bonus_class_rate', { valueAsNumber: true })}
                  placeholder={t('rateForExtraClasses')}
                />
              </div>
            </>
          )}

          {/* Effective from date */}
          <div className="space-y-2">
            <Label htmlFor="effective-from">{t('effectiveFrom')}</Label>
            <Input id="effective-from" type="date" {...form.register('effective_from')} />
            {form.formState.errors.effective_from && (
              <p className="text-xs text-danger-600">
                {form.formState.errors.effective_from.message}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || !form.watch('staff_profile_id')}
            >
              {form.formState.isSubmitting ? '…' : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
