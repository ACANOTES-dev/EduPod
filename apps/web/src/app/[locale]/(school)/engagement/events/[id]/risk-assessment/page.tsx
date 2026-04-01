'use client';

import { CheckCircle2, FileText, ShieldAlert, XCircle } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import {
  getFieldHelpText,
  getFieldLabel,
  pickLocalizedValue,
  type EventRecord,
  type FormTemplateRecord,
} from '../../../_components/engagement-types';


export default function EngagementRiskAssessmentPage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<EventRecord | null>(null);
  const [template, setTemplate] = React.useState<FormTemplateRecord | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyAction, setBusyAction] = React.useState<'approve' | 'reject' | null>(null);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const eventResponse = await apiClient<EventRecord>(`/api/v1/engagement/events/${eventId}`);
      setEvent(eventResponse);

      if (eventResponse.risk_assessment_template_id) {
        const templateResponse = await apiClient<FormTemplateRecord>(
          `/api/v1/engagement/form-templates/${eventResponse.risk_assessment_template_id}`,
        );
        setTemplate(templateResponse);
      } else {
        setTemplate(null);
      }
    } catch (error) {
      console.error('[EngagementRiskAssessmentPage.loadData]', error);
      toast.error(t('riskAssessment.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  async function runAction(action: 'approve' | 'reject') {
    setBusyAction(action);

    try {
      await apiClient(`/api/v1/engagement/events/${eventId}/risk-assessment/${action}`, {
        method: 'POST',
      });
      toast.success(
        action === 'approve'
          ? t('riskAssessment.approveSuccess')
          : t('riskAssessment.rejectSuccess'),
      );
      await loadData();
    } catch (error) {
      console.error('[EngagementRiskAssessmentPage.runAction]', error);
      toast.error(
        action === 'approve' ? t('riskAssessment.approveError') : t('riskAssessment.rejectError'),
      );
    } finally {
      setBusyAction(null);
    }
  }

  if (isLoading || !event) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  const title = pickLocalizedValue(locale, event.title, event.title_ar);
  const bannerTone = event.risk_assessment_approved
    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
    : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={t('riskAssessment.description')}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => void runAction('reject')}
              disabled={busyAction !== null}
            >
              <XCircle className="me-2 h-4 w-4" />
              {t('riskAssessment.reject')}
            </Button>
            <Button onClick={() => void runAction('approve')} disabled={busyAction !== null}>
              <CheckCircle2 className="me-2 h-4 w-4" />
              {t('riskAssessment.approve')}
            </Button>
          </div>
        }
      />

      <section className={`rounded-3xl border px-5 py-4 ${bannerTone}`}>
        <div className="flex items-center gap-3">
          <ShieldAlert className="h-5 w-5" />
          <div>
            <p className="font-semibold">
              {event.risk_assessment_approved
                ? t('riskAssessment.statusApproved')
                : t('riskAssessment.statusPending')}
            </p>
            <p className="text-sm opacity-90">
              {event.risk_assessment_required
                ? t('riskAssessment.required')
                : t('riskAssessment.notRequired')}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-primary-50 p-3 text-primary-700">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-text-primary">
              {template?.name ?? t('riskAssessment.templateMissing')}
            </h2>
            <p className="text-sm text-text-secondary">{t('riskAssessment.readOnlyHint')}</p>
          </div>
        </div>

        {template ? (
          <div className="mt-6 space-y-4">
            {template.fields_json
              .slice()
              .sort((left, right) => left.display_order - right.display_order)
              .map((field) => (
                <article key={field.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary">
                        {getFieldLabel(field, locale)}
                      </p>
                      {getFieldHelpText(field, locale) ? (
                        <p className="mt-1 text-sm text-text-secondary">
                          {getFieldHelpText(field, locale)}
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-surface-secondary px-3 py-1 text-xs font-semibold text-text-secondary">
                      {field.field_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                </article>
              ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-border bg-surface-secondary/50 px-4 py-6 text-sm text-text-secondary">
            {t('riskAssessment.noTemplate')}
          </div>
        )}
      </section>
    </div>
  );
}
