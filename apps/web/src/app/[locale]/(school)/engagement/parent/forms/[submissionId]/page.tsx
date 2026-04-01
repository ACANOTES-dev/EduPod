'use client';

import { useParams, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import type { EngagementFormField } from '@school/shared';
import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import {
  formatDisplayDateTime,
  humanizeStatus,
  type FormSubmissionRecord,
  type SignatureValue,
} from '../../../_components/engagement-types';
import { FormFieldRenderer } from '../../../_components/form-field-renderer';

interface ParentFormValues {
  responses: Record<string, unknown>;
}

export default function ParentEngagementFormPage() {
  const params = useParams<{ submissionId: string }>();
  const submissionId = params?.submissionId ?? '';
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('engagement');
  const { user } = useAuth();
  const [submission, setSubmission] = React.useState<FormSubmissionRecord | null>(null);
  const [signature, setSignature] = React.useState<SignatureValue | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const form = useForm<ParentFormValues>({
    defaultValues: {
      responses: {},
    },
  });

  const loadSubmission = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient<FormSubmissionRecord>(
        `/api/v1/parent/engagement/forms/${submissionId}`,
      );
      setSubmission(response);
      form.reset({
        responses: (response.responses_json as Record<string, unknown>) ?? {},
      });

      const signatureJson = response.signature_json as SignatureValue | null;
      setSignature(signatureJson ?? null);
    } catch (error) {
      console.error('[ParentEngagementFormPage.loadSubmission]', error);
      toast.error(t('parent.formLoadError'));
    } finally {
      setLoading(false);
    }
  }, [form, submissionId, t]);

  React.useEffect(() => {
    void loadSubmission();
  }, [loadSubmission]);

  const values = form.watch('responses');
  const isReadOnly = submission ? submission.status !== 'pending' : true;
  const fields: EngagementFormField[] = submission?.form_template?.fields_json ?? [];
  const requiresSignature = Boolean(submission?.form_template?.requires_signature);
  const hasSignatureField = fields.some((field) => field.field_type === 'signature');

  const onSubmit = form.handleSubmit(async (valuesToSubmit) => {
    if (!submission) {
      return;
    }

    if (requiresSignature && !signature) {
      toast.error(t('parent.signatureRequired'));
      return;
    }

    setSubmitting(true);

    try {
      await apiClient(`/api/v1/parent/engagement/forms/${submission.id}/submit`, {
        method: 'POST',
        body: JSON.stringify({
          responses: valuesToSubmit.responses,
          signature: signature
            ? {
                ...signature,
                ip_address: 'captured-server-side',
                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
                user_id:
                  user?.id ?? submission.student?.id ?? '00000000-0000-0000-0000-000000000000',
              }
            : undefined,
        }),
      });

      toast.success(t('parent.formSubmitSuccess'));
      await loadSubmission();
    } catch (error) {
      console.error('[ParentEngagementFormPage.onSubmit]', error);
      toast.error(t('parent.formSubmitError'));
    } finally {
      setSubmitting(false);
    }
  });

  if (loading || !submission) {
    return <div className="h-64 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <PageHeader
        title={submission.form_template?.name ?? t('parent.formTitle')}
        description={t('parent.formDescription', {
          student:
            `${submission.student?.first_name ?? ''} ${submission.student?.last_name ?? ''}`.trim(),
        })}
        actions={
          <Button
            variant="outline"
            onClick={() => router.push(`/${locale}/engagement/parent/events`)}
          >
            {t('parent.backToEvents')}
          </Button>
        }
      />

      <div className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
            {t(`statuses.${submission.status}`)}
          </span>
          <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
            {humanizeStatus(submission.form_template?.form_type)}
          </span>
          {submission.submitted_at ? (
            <span className="rounded-full bg-surface-secondary px-3 py-1 text-sm text-text-secondary">
              {formatDisplayDateTime(submission.submitted_at, locale)}
            </span>
          ) : null}
        </div>
      </div>

      <form
        className="space-y-5 rounded-[28px] border border-border bg-surface p-5 sm:p-6"
        onSubmit={onSubmit}
      >
        {fields.map((field) => (
          <Controller
            key={field.id}
            control={form.control}
            name={`responses.${field.field_key}` as const}
            render={({ field: controllerField }) => (
              <FormFieldRenderer
                field={field}
                locale={locale}
                value={controllerField.value}
                values={values}
                disabled={isReadOnly}
                onChange={controllerField.onChange}
                signatureValue={signature}
                onSignatureChange={setSignature}
              />
            )}
          />
        ))}

        {requiresSignature && !hasSignatureField ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-text-primary">{t('parent.signature')}</p>
            <FormFieldRenderer
              field={{
                id: 'generated-signature-field',
                field_key: 'generated_signature',
                label: { en: t('parent.signature'), ar: t('parent.signatureAr') },
                help_text: {
                  en: t('parent.signatureLegalText'),
                  ar: t('parent.signatureLegalTextAr'),
                },
                field_type: 'signature',
                required: true,
                display_order: 999,
              }}
              locale={locale}
              values={values}
              signatureValue={signature}
              onSignatureChange={setSignature}
              disabled={isReadOnly}
            />
          </div>
        ) : null}

        {isReadOnly ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {t('parent.readOnlyMessage')}
          </div>
        ) : (
          <Button type="submit" className="min-h-12 w-full text-base" disabled={submitting}>
            {submitting ? t('parent.submitting') : t('parent.submitForm')}
          </Button>
        )}
      </form>

      {submission.consent_record ? (
        <section className="rounded-3xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold text-text-primary">{t('parent.consentRecord')}</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('parent.consentStatus')}</dt>
              <dd className="font-medium text-text-primary">
                {humanizeStatus(submission.consent_record.status)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('parent.consentType')}</dt>
              <dd className="font-medium text-text-primary">
                {humanizeStatus(submission.consent_record.consent_type)}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
