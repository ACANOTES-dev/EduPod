'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ClipboardList } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import type { CreateIncidentReportDto } from '@school/shared';
import { createIncidentReportSchema } from '@school/shared';
import { Button, Input, Label, Textarea, toast } from '@school/ui';

import {
  formatDisplayDateTime,
  pickLocalizedValue,
  type EngagementIncidentReport,
  type EventRecord,
} from '../../../_components/engagement-types';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


export default function EngagementEventIncidentsPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<EventRecord | null>(null);
  const [incidents, setIncidents] = React.useState<EngagementIncidentReport[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const form = useForm<CreateIncidentReportDto>({
    resolver: zodResolver(createIncidentReportSchema),
    defaultValues: {
      title: '',
      description: '',
    },
  });

  const loadData = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const eventResponse = await apiClient<EventRecord>(`/api/v1/engagement/events/${eventId}`);
      setEvent(eventResponse);

      if (['in_progress', 'completed'].includes(eventResponse.status)) {
        const incidentResponse = await apiClient<EngagementIncidentReport[]>(
          `/api/v1/engagement/events/${eventId}/incidents`,
        );
        setIncidents(incidentResponse);
      } else {
        setIncidents([]);
      }
    } catch (error) {
      console.error('[EngagementEventIncidentsPage.loadData]', error);
      toast.error(t('incidents.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const canSubmit = ['in_progress', 'completed'].includes(event?.status ?? '');

  async function onSubmit(values: CreateIncidentReportDto) {
    try {
      await apiClient(`/api/v1/engagement/events/${eventId}/incidents`, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success(t('incidents.createSuccess'));
      form.reset();
      await loadData();
    } catch (error) {
      console.error('[EngagementEventIncidentsPage.onSubmit]', error);
      toast.error(t('incidents.createError'));
    }
  }

  if (isLoading || !event) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickLocalizedValue(locale, event.title, event.title_ar)}
        description={t('incidents.description')}
      />

      {!canSubmit ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5" />
            <div>
              <p className="font-semibold">{t('incidents.statusGateTitle')}</p>
              <p className="text-sm">{t('incidents.statusGateDescription')}</p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="rounded-3xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold text-text-primary">{t('incidents.formTitle')}</h2>
          <form
            onSubmit={form.handleSubmit((values) => void onSubmit(values))}
            className="mt-5 space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="incident-title">{t('incidents.fields.title')}</Label>
              <Input
                id="incident-title"
                disabled={!canSubmit || form.formState.isSubmitting}
                {...form.register('title')}
              />
              {form.formState.errors.title ? (
                <p className="text-xs text-danger-text">{form.formState.errors.title.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="incident-description">{t('incidents.fields.description')}</Label>
              <Textarea
                id="incident-description"
                rows={8}
                disabled={!canSubmit || form.formState.isSubmitting}
                {...form.register('description')}
              />
              {form.formState.errors.description ? (
                <p className="text-xs text-danger-text">
                  {form.formState.errors.description.message}
                </p>
              ) : null}
            </div>

            <Button type="submit" disabled={!canSubmit || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? t('incidents.submitting') : t('incidents.submit')}
            </Button>
          </form>
        </section>

        <section className="rounded-3xl border border-border bg-surface p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary-50 p-3 text-primary-700">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {t('incidents.listTitle')}
              </h2>
              <p className="text-sm text-text-secondary">{t('incidents.listDescription')}</p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {incidents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-surface-secondary/50 px-4 py-6 text-sm text-text-secondary">
                {t('incidents.empty')}
              </div>
            ) : (
              incidents.map((incident) => (
                <article key={incident.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary">{incident.title}</p>
                      <p className="mt-1 text-sm text-text-secondary">{incident.description}</p>
                    </div>
                    <p className="text-xs text-text-tertiary">
                      {formatDisplayDateTime(incident.created_at, locale)}
                    </p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
