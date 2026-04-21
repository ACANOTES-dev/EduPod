'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  createSanctionSchema,
  SANCTION_TYPES,
  type CreateSanctionDto,
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
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentRow {
  id: string;
  incident_number: string | null;
  occurred_at: string;
  summary: string | null;
  subject_student_id: string | null;
  subject_student_name: string | null;
}

interface SanctionResponse {
  data: {
    id: string;
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SanctionNewPage() {
  const t = useTranslations('behaviour.sanctionNew');
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillIncidentId = searchParams?.get('incident_id') ?? null;
  const prefillStudentId = searchParams?.get('student_id') ?? null;

  const [incidents, setIncidents] = React.useState<IncidentRow[]>([]);
  const [loadingIncidents, setLoadingIncidents] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  const form = useForm<CreateSanctionDto>({
    resolver: zodResolver(createSanctionSchema),
    defaultValues: {
      incident_id: prefillIncidentId ?? '',
      student_id: prefillStudentId ?? '',
      type: 'detention',
      scheduled_date: new Date().toISOString().split('T')[0] ?? '',
      scheduled_start_time: null,
      scheduled_end_time: null,
      scheduled_room_id: null,
      supervised_by_id: null,
      parent_meeting_required: false,
      notes: null,
    },
  });

  // Load recent incidents as picker options
  React.useEffect(() => {
    apiClient<{ data: IncidentRow[] }>('/api/v1/behaviour/incidents?page=1&pageSize=100', {
      silent: true,
    })
      .then((res) => {
        setIncidents(res.data ?? []);
        setLoadingIncidents(false);
      })
      .catch((err) => {
        console.error('[SanctionNewPage]', err);
        setLoadingIncidents(false);
      });
  }, []);

  const selectedIncidentId = form.watch('incident_id');
  const selectedIncident = incidents.find((i) => i.id === selectedIncidentId);

  // Auto-fill student_id when incident is picked
  React.useEffect(() => {
    if (selectedIncident?.subject_student_id) {
      form.setValue('student_id', selectedIncident.subject_student_id);
    }
  }, [selectedIncident, form]);

  const onSubmit = async (values: CreateSanctionDto) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await apiClient<SanctionResponse>('/api/v1/behaviour/sanctions', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      router.push(`/${locale}/behaviour/sanctions/${res.data.id}`);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string; code?: string } };
      setSubmitError(ex.error?.message ?? t('errorGeneric'));
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <Link
          href={`/${locale}/behaviour/sanctions`}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-3 w-3" />
          {t('backToList')}
        </Link>
      </div>
      <PageHeader title={t('title')} description={t('description')} />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
          <div className="space-y-5">
            {/* Incident picker — sanctions are linked to incidents */}
            <div className="space-y-1.5">
              <Label htmlFor="incident_id">{t('incident')}</Label>
              <Select
                value={form.watch('incident_id')}
                onValueChange={(v) => form.setValue('incident_id', v)}
                disabled={loadingIncidents || !!prefillIncidentId}
              >
                <SelectTrigger id="incident_id">
                  <SelectValue
                    placeholder={loadingIncidents ? t('loading') : t('incidentPlaceholder')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {incidents.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.incident_number ? `${i.incident_number} — ` : ''}
                      {i.subject_student_name ?? t('unknownStudent')} ·{' '}
                      {new Date(i.occurred_at).toLocaleDateString(
                        locale === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB',
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.incident_id && (
                <p className="text-xs text-danger-text">{t('incidentRequired')}</p>
              )}
            </div>

            {/* Sanction type */}
            <div className="space-y-1.5">
              <Label htmlFor="type">{t('type')}</Label>
              <Select
                value={form.watch('type')}
                onValueChange={(v) => form.setValue('type', v as (typeof SANCTION_TYPES)[number])}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SANCTION_TYPES.map((typeKey) => (
                    <SelectItem key={typeKey} value={typeKey}>
                      {t(`types.${typeKey}` as Parameters<typeof t>[0])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Scheduled date */}
            <div className="space-y-1.5">
              <Label htmlFor="scheduled_date">{t('scheduledDate')}</Label>
              <Input
                id="scheduled_date"
                type="date"
                {...form.register('scheduled_date')}
                className="w-full sm:w-56"
              />
              {form.formState.errors.scheduled_date && (
                <p className="text-xs text-danger-text">{t('scheduledDateRequired')}</p>
              )}
            </div>

            {/* Time range (optional) */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="scheduled_start_time">{t('startTime')}</Label>
                <Input
                  id="scheduled_start_time"
                  type="time"
                  {...form.register('scheduled_start_time')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scheduled_end_time">{t('endTime')}</Label>
                <Input
                  id="scheduled_end_time"
                  type="time"
                  {...form.register('scheduled_end_time')}
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">{t('notes')}</Label>
              <Textarea
                id="notes"
                placeholder={t('notesPlaceholder')}
                className="min-h-[96px] text-base"
                {...form.register('notes')}
              />
            </div>
          </div>
        </div>

        {submitError && (
          <div className="rounded-xl border border-danger-300 bg-danger-50 p-4">
            <p className="text-sm text-text-primary">{submitError}</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Link href={`/${locale}/behaviour/sanctions`}>
            <Button type="button" variant="outline">
              {t('cancel')}
            </Button>
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              t('submit')
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
