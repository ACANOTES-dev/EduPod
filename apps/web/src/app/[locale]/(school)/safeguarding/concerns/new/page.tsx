'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowLeft, Lock, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  reportSafeguardingConcernSchema,
  type ReportSafeguardingConcernDto,
} from '@school/shared/behaviour';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { searchStudents, type SearchOption } from '@/lib/pastoral';

import {
  CONCERN_SEVERITIES,
  CONCERN_TYPES,
  type ConcernSeverity,
  type ConcernType,
} from '../../_components/concerns';
import { canViewSafeguarding } from '../../_components/visibility';

interface ReportResponse {
  data: { id: string; concern_number: string; status: string };
}

export default function SafeguardingConcernNewPage() {
  const t = useTranslations('safeguardingHub.newConcern');
  const tSev = useTranslations('safeguardingHub.severity');
  const tType = useTranslations('safeguardingHub.concernType');
  const tHub = useTranslations('safeguardingHub');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { roleKeys } = useRoleCheck();
  const canView = canViewSafeguarding(roleKeys);

  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [studentPick, setStudentPick] = React.useState<SearchOption[]>([]);

  const form = useForm<ReportSafeguardingConcernDto>({
    resolver: zodResolver(reportSafeguardingConcernSchema),
    defaultValues: {
      student_id: '',
      concern_type: 'other',
      severity: 'medium',
      description: '',
      immediate_actions_taken: '',
      incident_id: null,
    },
  });

  const studentId = studentPick[0]?.id ?? '';

  React.useEffect(() => {
    form.setValue('student_id', studentId, { shouldValidate: studentId !== '' });
  }, [form, studentId]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: ReportSafeguardingConcernDto = {
        ...values,
        immediate_actions_taken: values.immediate_actions_taken?.trim()
          ? values.immediate_actions_taken
          : null,
        incident_id:
          values.incident_id && values.incident_id.trim() !== '' ? values.incident_id : null,
      };
      const res = await apiClient<ReportResponse>('/api/v1/safeguarding/concerns', {
        method: 'POST',
        body: JSON.stringify(payload),
        silent: true,
      });
      router.push(`/${locale}/safeguarding/concerns/${res.data.id}`);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? ((err as { error: { message?: string } }).error?.message ?? t('submitError'))
          : t('submitError');
      setSubmitError(message);
      console.error('[SafeguardingConcernNew] submit failed', err);
    } finally {
      setSubmitting(false);
    }
  });

  if (!canView) {
    return (
      <div className="flex min-w-0 flex-col gap-6 pb-10">
        <PageHeader title={t('title')} description={t('description')} />
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-6 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-700">
            <Lock className="h-6 w-6" />
          </div>
          <p className="max-w-md text-sm text-text-secondary">{tHub('denied.body')}</p>
          <Link
            href={`/${locale}/safeguarding`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            {tHub('denied.backToHub')}
          </Link>
        </section>
      </div>
    );
  }

  const errors = form.formState.errors;
  const severityValue = form.watch('severity');

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link
            href={`/${locale}/safeguarding/concerns`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-secondary"
          >
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" />
            {t('backToList')}
          </Link>
        }
      />

      {/* Confidentiality banner */}
      <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold">{t('confidentialityTitle')}</p>
          <p className="text-xs text-amber-800">{t('confidentialityBody')}</p>
        </div>
      </section>

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5"
      >
        {/* Student */}
        <div className="space-y-1.5">
          <SearchPicker
            label={t('fields.student.label')}
            placeholder={t('fields.student.placeholder')}
            search={searchStudents}
            selected={studentPick}
            onChange={setStudentPick}
            emptyText={t('fields.student.empty')}
            minSearchLengthText={t('fields.student.minLength')}
            multiple={false}
            helperText={t('fields.student.helper')}
          />
          {errors.student_id && (
            <p className="text-xs text-danger-700">{t('fields.student.required')}</p>
          )}
        </div>

        {/* Type + Severity */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="concern_type" className="text-sm font-medium">
              {t('fields.type.label')}
            </Label>
            <Select
              value={form.watch('concern_type')}
              onValueChange={(v) =>
                form.setValue('concern_type', v as ConcernType, { shouldValidate: true })
              }
            >
              <SelectTrigger id="concern_type" className="text-base sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONCERN_TYPES.map((ct) => (
                  <SelectItem key={ct} value={ct}>
                    {tType(ct)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="severity" className="text-sm font-medium">
              {t('fields.severity.label')}
            </Label>
            <Select
              value={severityValue}
              onValueChange={(v) =>
                form.setValue('severity', v as ConcernSeverity, { shouldValidate: true })
              }
            >
              <SelectTrigger id="severity" className="text-base sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONCERN_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {tSev(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {severityValue === 'critical' && (
              <p className="text-xs text-danger-700">{t('fields.severity.criticalHint')}</p>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-sm font-medium">
            {t('fields.description.label')}
          </Label>
          <Textarea
            id="description"
            {...form.register('description')}
            rows={6}
            placeholder={t('fields.description.placeholder')}
            className="text-base sm:text-sm"
          />
          <p className="text-xs text-text-tertiary">{t('fields.description.helper')}</p>
          {errors.description && (
            <p className="text-xs text-danger-700">{t('fields.description.minLength')}</p>
          )}
        </div>

        {/* Immediate actions */}
        <div className="space-y-1.5">
          <Label htmlFor="immediate_actions_taken" className="text-sm font-medium">
            {t('fields.immediateActions.label')}
          </Label>
          <Textarea
            id="immediate_actions_taken"
            {...form.register('immediate_actions_taken')}
            rows={3}
            placeholder={t('fields.immediateActions.placeholder')}
            className="text-base sm:text-sm"
          />
          <p className="text-xs text-text-tertiary">{t('fields.immediateActions.helper')}</p>
        </div>

        {/* Incident link (optional) */}
        <div className="space-y-1.5">
          <Label htmlFor="incident_id" className="text-sm font-medium">
            {t('fields.incidentId.label')}
          </Label>
          <Input
            id="incident_id"
            {...form.register('incident_id')}
            placeholder={t('fields.incidentId.placeholder')}
            className="text-base sm:text-sm"
          />
          <p className="text-xs text-text-tertiary">{t('fields.incidentId.helper')}</p>
        </div>

        {submitError && (
          <div className="flex items-start gap-2 rounded-2xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{submitError}</p>
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/${locale}/safeguarding/concerns`)}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={submitting || !form.formState.isValid}>
            {submitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
