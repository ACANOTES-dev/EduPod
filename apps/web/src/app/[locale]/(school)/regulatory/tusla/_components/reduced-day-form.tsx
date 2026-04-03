'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  type CreateReducedSchoolDayDto,
  type UpdateReducedSchoolDayDto,
  createReducedSchoolDaySchema,
  updateReducedSchoolDaySchema,
} from '@school/shared/regulatory';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ReducedSchoolDayRecord {
  id: string;
  student_id: string;
  student: { id: string; first_name: string; last_name: string };
  start_date: string;
  end_date: string | null;
  hours_per_day: number;
  reason: string;
  reason_detail: string | null;
  parent_consent_date: string | null;
  review_date: string | null;
  tusla_notified: boolean;
  is_active: boolean;
  notes: string | null;
  created_at: string;
}

interface ReducedDayFormProps {
  mode: 'create' | 'edit';
  initialData?: ReducedSchoolDayRecord;
  onSuccess: () => void;
  onCancel: () => void;
}

// ─── Reason Options ─────────────────────────────────────────────────────────

const REASON_OPTIONS = [
  { value: 'behaviour_management', labelKey: 'tusla.reasonBehaviourManagement' },
  { value: 'medical_needs', labelKey: 'tusla.reasonMedicalNeeds' },
  { value: 'phased_return', labelKey: 'tusla.reasonPhasedReturn' },
  { value: 'assessment_pending', labelKey: 'tusla.reasonAssessmentPending' },
  { value: 'other', labelKey: 'tusla.reasonOther' },
] as const;

// ─── Create Form ────────────────────────────────────────────────────────────

function CreateReducedDayForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('regulatory');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  const form = useForm<CreateReducedSchoolDayDto>({
    resolver: zodResolver(createReducedSchoolDaySchema),
    defaultValues: {
      student_id: '',
      start_date: '',
      end_date: null,
      hours_per_day: 0,
      reason: 'other',
      reason_detail: null,
      parent_consent_date: null,
      review_date: null,
      notes: null,
    },
  });

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const values = form.getValues();
      await apiClient('/api/v1/regulatory/reduced-school-days', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      onSuccess();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setSubmitError(ex?.error?.message ?? ex?.message ?? t('tusla.reducedDaysSaveError'));
      console.error('[CreateReducedDayForm]', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Student ID */}
      <div className="space-y-1.5">
        <Label htmlFor="student_id">{t('tusla.reducedDaysStudent')}</Label>
        <Input
          id="student_id"
          placeholder={t('tusla.reducedDaysStudentPlaceholder')}
          className="w-full text-base"
          {...form.register('student_id')}
        />
        {form.formState.errors.student_id && (
          <p className="text-xs text-danger-text">{form.formState.errors.student_id.message}</p>
        )}
      </div>

      {/* Start Date */}
      <div className="space-y-1.5">
        <Label htmlFor="start_date">{t('tusla.reducedDaysStartDate')}</Label>
        <Input
          id="start_date"
          type="date"
          className="w-full sm:w-64 text-base"
          {...form.register('start_date')}
        />
        {form.formState.errors.start_date && (
          <p className="text-xs text-danger-text">{form.formState.errors.start_date.message}</p>
        )}
      </div>

      {/* End Date */}
      <div className="space-y-1.5">
        <Label htmlFor="end_date">{t('tusla.reducedDaysEndDate')}</Label>
        <Input
          id="end_date"
          type="date"
          className="w-full sm:w-64 text-base"
          {...form.register('end_date')}
        />
      </div>

      {/* Hours per Day */}
      <div className="space-y-1.5">
        <Label htmlFor="hours_per_day">{t('tusla.reducedDaysHoursPerDay')}</Label>
        <Input
          id="hours_per_day"
          type="number"
          min={0}
          max={24}
          step="0.5"
          className="w-full sm:w-28 text-base"
          {...form.register('hours_per_day', { valueAsNumber: true })}
        />
        {form.formState.errors.hours_per_day && (
          <p className="text-xs text-danger-text">{form.formState.errors.hours_per_day.message}</p>
        )}
      </div>

      {/* Reason */}
      <div className="space-y-1.5">
        <Label htmlFor="reason">{t('tusla.reducedDaysReason')}</Label>
        <Select
          value={form.watch('reason')}
          onValueChange={(val) =>
            form.setValue('reason', val as CreateReducedSchoolDayDto['reason'], {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder={t('tusla.reducedDaysSelectReason')} />
          </SelectTrigger>
          <SelectContent>
            {REASON_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(opt.labelKey as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {form.formState.errors.reason && (
          <p className="text-xs text-danger-text">{form.formState.errors.reason.message}</p>
        )}
      </div>

      {/* Reason Detail */}
      <div className="space-y-1.5">
        <Label htmlFor="reason_detail">{t('tusla.reducedDaysReasonDetail')}</Label>
        <Textarea
          id="reason_detail"
          rows={3}
          className="w-full text-base"
          placeholder={t('tusla.reducedDaysReasonDetailPlaceholder')}
          {...form.register('reason_detail')}
        />
      </div>

      {/* Parent Consent Date */}
      <div className="space-y-1.5">
        <Label htmlFor="parent_consent_date">{t('tusla.reducedDaysParentConsentDate')}</Label>
        <Input
          id="parent_consent_date"
          type="date"
          className="w-full sm:w-64 text-base"
          {...form.register('parent_consent_date')}
        />
      </div>

      {/* Review Date */}
      <div className="space-y-1.5">
        <Label htmlFor="review_date">{t('tusla.reducedDaysReviewDate')}</Label>
        <Input
          id="review_date"
          type="date"
          className="w-full sm:w-64 text-base"
          {...form.register('review_date')}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">{t('tusla.reducedDaysNotes')}</Label>
        <Textarea
          id="notes"
          rows={3}
          className="w-full text-base"
          placeholder={t('tusla.reducedDaysNotesPlaceholder')}
          {...form.register('notes')}
        />
      </div>

      {/* Error */}
      {submitError && <p className="text-sm text-danger-text">{submitError}</p>}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="min-h-[44px]"
        >
          {t('tusla.reducedDaysCancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="min-h-[44px]">
          {isSubmitting ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('tusla.reducedDaysSaving')}
            </>
          ) : (
            t('tusla.reducedDaysCreate')
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Edit Form ──────────────────────────────────────────────────────────────

function EditReducedDayForm({
  initialData,
  onSuccess,
  onCancel,
}: {
  initialData: ReducedSchoolDayRecord;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations('regulatory');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  const form = useForm<UpdateReducedSchoolDayDto>({
    resolver: zodResolver(updateReducedSchoolDaySchema),
    defaultValues: {
      end_date: initialData.end_date ?? null,
      hours_per_day: initialData.hours_per_day,
      reason_detail: initialData.reason_detail ?? null,
      parent_consent_date: initialData.parent_consent_date ?? null,
      review_date: initialData.review_date ?? null,
      tusla_notified: initialData.tusla_notified,
      is_active: initialData.is_active,
      notes: initialData.notes ?? null,
    },
  });

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const values = form.getValues();
      await apiClient(`/api/v1/regulatory/reduced-school-days/${initialData.id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      });
      onSuccess();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setSubmitError(ex?.error?.message ?? ex?.message ?? t('tusla.reducedDaysSaveError'));
      console.error('[EditReducedDayForm]', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Student Name (read-only) */}
      <div className="space-y-1.5">
        <Label>{t('tusla.reducedDaysStudent')}</Label>
        <p className="text-sm font-medium text-text-primary">
          {initialData.student.first_name} {initialData.student.last_name}
        </p>
      </div>

      {/* End Date */}
      <div className="space-y-1.5">
        <Label htmlFor="end_date">{t('tusla.reducedDaysEndDate')}</Label>
        <Input
          id="end_date"
          type="date"
          className="w-full sm:w-64 text-base"
          {...form.register('end_date')}
        />
      </div>

      {/* Hours per Day */}
      <div className="space-y-1.5">
        <Label htmlFor="hours_per_day">{t('tusla.reducedDaysHoursPerDay')}</Label>
        <Input
          id="hours_per_day"
          type="number"
          min={0}
          max={24}
          step="0.5"
          className="w-full sm:w-28 text-base"
          {...form.register('hours_per_day', { valueAsNumber: true })}
        />
        {form.formState.errors.hours_per_day && (
          <p className="text-xs text-danger-text">{form.formState.errors.hours_per_day.message}</p>
        )}
      </div>

      {/* Reason Detail */}
      <div className="space-y-1.5">
        <Label htmlFor="reason_detail">{t('tusla.reducedDaysReasonDetail')}</Label>
        <Textarea
          id="reason_detail"
          rows={3}
          className="w-full text-base"
          placeholder={t('tusla.reducedDaysReasonDetailPlaceholder')}
          {...form.register('reason_detail')}
        />
      </div>

      {/* Parent Consent Date */}
      <div className="space-y-1.5">
        <Label htmlFor="parent_consent_date">{t('tusla.reducedDaysParentConsentDate')}</Label>
        <Input
          id="parent_consent_date"
          type="date"
          className="w-full sm:w-64 text-base"
          {...form.register('parent_consent_date')}
        />
      </div>

      {/* Review Date */}
      <div className="space-y-1.5">
        <Label htmlFor="review_date">{t('tusla.reducedDaysReviewDate')}</Label>
        <Input
          id="review_date"
          type="date"
          className="w-full sm:w-64 text-base"
          {...form.register('review_date')}
        />
      </div>

      {/* Tusla Notified */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="tusla_notified"
          checked={form.watch('tusla_notified') ?? false}
          onCheckedChange={(checked) =>
            form.setValue('tusla_notified', checked === true, { shouldValidate: true })
          }
        />
        <Label htmlFor="tusla_notified" className="cursor-pointer">
          {t('tusla.reducedDaysTuslaNotified')}
        </Label>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">{t('tusla.reducedDaysNotes')}</Label>
        <Textarea
          id="notes"
          rows={3}
          className="w-full text-base"
          placeholder={t('tusla.reducedDaysNotesPlaceholder')}
          {...form.register('notes')}
        />
      </div>

      {/* Error */}
      {submitError && <p className="text-sm text-danger-text">{submitError}</p>}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="min-h-[44px]"
        >
          {t('tusla.reducedDaysCancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="min-h-[44px]">
          {isSubmitting ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('tusla.reducedDaysSaving')}
            </>
          ) : (
            t('tusla.reducedDaysUpdate')
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Exported Wrapper ───────────────────────────────────────────────────────

export function ReducedDayForm({ mode, initialData, onSuccess, onCancel }: ReducedDayFormProps) {
  if (mode === 'edit' && initialData) {
    return (
      <EditReducedDayForm initialData={initialData} onSuccess={onSuccess} onCancel={onCancel} />
    );
  }

  return <CreateReducedDayForm onSuccess={onSuccess} onCancel={onCancel} />;
}
