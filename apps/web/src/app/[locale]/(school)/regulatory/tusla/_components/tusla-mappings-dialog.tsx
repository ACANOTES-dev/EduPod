'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  type CreateTuslaAbsenceCodeMappingDto,
  createTuslaAbsenceCodeMappingSchema,
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
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Option lists ───────────────────────────────────────────────────────────

const ATTENDANCE_STATUS_OPTIONS = [
  'absent_excused',
  'absent_unexcused',
  'absent',
  'late',
  'left_early',
] as const;

const TUSLA_CATEGORY_OPTIONS = [
  'illness',
  'urgent_family_reason',
  'holiday',
  'suspension',
  'expulsion',
  'other',
  'unexplained',
] as const;

interface TuslaMappingsDialogProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function TuslaMappingsDialog({ onSuccess, onCancel }: TuslaMappingsDialogProps) {
  const t = useTranslations('regulatory.tusla');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  const form = useForm<CreateTuslaAbsenceCodeMappingDto>({
    resolver: zodResolver(createTuslaAbsenceCodeMappingSchema),
    defaultValues: {
      attendance_status: 'absent_excused',
      reason_pattern: null,
      tusla_category: 'illness',
      display_label: '',
      is_default: false,
    },
  });

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const values = form.getValues();
      await apiClient('/api/v1/regulatory/tusla/absence-mappings', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      onSuccess();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      setSubmitError(ex?.error?.message ?? ex?.message ?? t('mappingsSaveError'));
      console.error('[TuslaMappingsDialog] save failed', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="attendance_status">{t('mappingsAttendanceStatus')}</Label>
        <Select
          value={form.watch('attendance_status')}
          onValueChange={(val) =>
            form.setValue(
              'attendance_status',
              val as CreateTuslaAbsenceCodeMappingDto['attendance_status'],
              { shouldValidate: true },
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ATTENDANCE_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {t(`mappingsAttendanceStatusOptions.${opt}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tusla_category">{t('mappingsTuslaCategory')}</Label>
        <Select
          value={form.watch('tusla_category')}
          onValueChange={(val) =>
            form.setValue(
              'tusla_category',
              val as CreateTuslaAbsenceCodeMappingDto['tusla_category'],
              { shouldValidate: true },
            )
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TUSLA_CATEGORY_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {t(`mappingsTuslaCategoryOptions.${opt}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="display_label">{t('mappingsDisplayLabel')}</Label>
        <Input
          id="display_label"
          className="w-full text-base"
          placeholder={t('mappingsDisplayLabelPlaceholder')}
          {...form.register('display_label')}
        />
        {form.formState.errors.display_label && (
          <p className="text-xs text-danger-text">{form.formState.errors.display_label.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reason_pattern">{t('mappingsReasonPattern')}</Label>
        <Input
          id="reason_pattern"
          className="w-full text-base"
          placeholder={t('mappingsReasonPatternPlaceholder')}
          {...form.register('reason_pattern')}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="is_default"
          checked={form.watch('is_default') ?? false}
          onCheckedChange={(checked) =>
            form.setValue('is_default', checked === true, { shouldValidate: true })
          }
        />
        <Label htmlFor="is_default" className="cursor-pointer">
          {t('mappingsIsDefault')}
        </Label>
      </div>

      {submitError && <p className="text-sm text-danger-text">{submitError}</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="min-h-[44px]"
        >
          {t('mappingsCancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="min-h-[44px]">
          {isSubmitting ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('mappingsSaving')}
            </>
          ) : (
            t('mappingsCreate')
          )}
        </Button>
      </div>
    </div>
  );
}
