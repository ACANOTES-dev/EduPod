'use client';

import { Button, Checkbox, Input, Label, toast } from '@school/ui';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { DynamicFormRenderer } from '@/components/admissions/dynamic-form-renderer';
import { apiClient } from '@/lib/api-client';
import { getAccessToken } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormField {
  field_key: string;
  label: string;
  help_text?: string | null;
  field_type: string;
  required: boolean;
  options_json?: Array<{ value: string; label: string }> | null;
  conditional_visibility_json?: {
    depends_on_field_key: string;
    show_when_value: string | string[];
  } | null;
  display_order: number;
}

interface PublicForm {
  id: string;
  name: string;
  fields: FormField[];
  tenant_name: string;
}

interface ConsentCaptureState {
  health_data: boolean;
  whatsapp_channel: boolean;
  ai_features: {
    ai_grading: boolean;
    ai_comments: boolean;
    ai_risk_detection: boolean;
    ai_progress_summary: boolean;
  };
}

const EMPTY_CONSENTS: ConsentCaptureState = {
  health_data: false,
  whatsapp_channel: false,
  ai_features: {
    ai_grading: false,
    ai_comments: false,
    ai_risk_detection: false,
    ai_progress_summary: false,
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicAdmissionsPage() {
  const t = useTranslations('admissions');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [form, setForm] = React.useState<PublicForm | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  // Core fields always present
  const [studentFirstName, setStudentFirstName] = React.useState('');
  const [studentLastName, setStudentLastName] = React.useState('');
  const [dateOfBirth, setDateOfBirth] = React.useState('');

  // Dynamic form values
  const [formValues, setFormValues] = React.useState<Record<string, unknown>>({});
  const [consents, setConsents] = React.useState<ConsentCaptureState>(EMPTY_CONSENTS);

  // Honeypot
  const [honeypot, setHoneypot] = React.useState('');

  React.useEffect(() => {
    apiClient<PublicForm>('/api/v1/public/admissions/form', { skipAuth: true })
      .then((res) => setForm(res))
      .catch((err) => {
        console.error('[PublicAdmissionsPage.loadForm]', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleConsent = React.useCallback(
    (field: 'health_data' | 'whatsapp_channel') => {
      setConsents((prev) => ({ ...prev, [field]: !prev[field] }));
    },
    [],
  );

  const toggleAiConsent = React.useCallback(
    (field: keyof ConsentCaptureState['ai_features']) => {
      setConsents((prev) => ({
        ...prev,
        ai_features: {
          ...prev.ai_features,
          [field]: !prev.ai_features[field],
        },
      }));
    },
    [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check
    if (honeypot) return;

    if (!studentFirstName.trim() || !studentLastName.trim()) {
      toast.error('Student name is required');
      return;
    }

    // Check if authenticated
    const token = getAccessToken();
    if (!token) {
      // Redirect to login with return URL
      toast.info(t('loginToSubmit'));
      router.push(`/${locale}/login?returnTo=${encodeURIComponent(pathname ?? '')}`);
      return;
    }

    if (!form) return;

    setSubmitting(true);
    try {
      const created = await apiClient<{
        id: string;
        application_number: string;
        status: string;
      }>('/api/v1/public/admissions/applications', {
        method: 'POST',
        skipAuth: true,
        silent: true,
        body: JSON.stringify({
          form_definition_id: form.id,
          student_first_name: studentFirstName,
          student_last_name: studentLastName,
          date_of_birth: dateOfBirth || undefined,
          payload_json: formValues,
          consents,
          website_url: honeypot || undefined,
        }),
      });

      await apiClient(`/api/v1/parent/applications/${created.id}/submit`, {
        method: 'POST',
        silent: true,
      });

      setSubmitted(true);
      toast.success(t('applicationSubmitted'));
    } catch (err) {
      const message =
        (err as { error?: { message?: string } })?.error?.message ?? tc('errorGeneric');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="space-y-4">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
          <div className="h-4 w-48 animate-pulse rounded bg-surface-secondary" />
          <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
        </div>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-text-primary">{t('publicFormTitle')}</h1>
        <p className="mt-4 text-sm text-text-secondary">
          No admission form is currently available. Please check back later.
        </p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-surface">
          <svg className="h-8 w-8 text-success-text" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-text-primary">{t('applicationSubmitted')}</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Your application has been received. You will be notified of any status changes.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-text-primary">{t('publicFormTitle')}</h1>
        <p className="mt-1 text-sm text-text-secondary">{form.tenant_name} &middot; {form.name}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core student fields */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-text-primary">{t('studentName')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                First Name <span className="text-emerald-600">*</span>
              </Label>
              <Input
                value={studentFirstName}
                onChange={(e) => setStudentFirstName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                Last Name <span className="text-emerald-600">*</span>
              </Label>
              <Input
                value={studentLastName}
                onChange={(e) => setStudentLastName(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label>{t('dateOfBirth')}</Label>
            <Input
              type="date"
              dir="ltr"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>
        </div>

        {/* Dynamic form fields */}
        {form.fields.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <DynamicFormRenderer
              fields={form.fields}
              values={formValues}
              onChange={setFormValues}
            />
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-text-primary">
              {t('consentTitle')}
            </h2>
            <p className="text-sm text-text-secondary">
              {t('consentDescription')}
            </p>
          </div>

          <div className="mt-5 space-y-4">
            <label className="flex items-start gap-3">
              <Checkbox
                checked={consents.health_data}
                onCheckedChange={() => toggleConsent('health_data')}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-text-primary">
                  {t('consentHealthData')}
                </span>
                <span className="block text-xs text-text-tertiary">
                  {t('consentHealthDataDescription')}
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3">
              <Checkbox
                checked={consents.whatsapp_channel}
                onCheckedChange={() => toggleConsent('whatsapp_channel')}
                className="mt-0.5"
              />
              <span className="space-y-0.5">
                <span className="block text-sm font-medium text-text-primary">
                  {t('consentWhatsApp')}
                </span>
                <span className="block text-xs text-text-tertiary">
                  {t('consentWhatsAppDescription')}
                </span>
              </span>
            </label>

            <div className="rounded-xl bg-surface-secondary p-4">
              <p className="text-sm font-medium text-text-primary">
                {t('consentAiTitle')}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {t('consentAiDescription')}
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['ai_grading', 'consentAiGrading', 'consentAiGradingDescription'],
                    ['ai_comments', 'consentAiComments', 'consentAiCommentsDescription'],
                    ['ai_risk_detection', 'consentAiRiskDetection', 'consentAiRiskDetectionDescription'],
                    ['ai_progress_summary', 'consentAiProgressSummary', 'consentAiProgressSummaryDescription'],
                  ] as const
                ).map(([key, labelKey, descriptionKey]) => (
                  <label
                    key={key}
                    className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-3"
                  >
                    <Checkbox
                      checked={consents.ai_features[key]}
                      onCheckedChange={() => toggleAiConsent(key)}
                      className="mt-0.5"
                    />
                    <span className="space-y-0.5">
                      <span className="block text-sm font-medium text-text-primary">
                        {t(labelKey)}
                      </span>
                      <span className="block text-xs text-text-tertiary">
                        {t(descriptionKey)}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Honeypot — hidden from real users */}
        <div className="absolute -start-[9999px] opacity-0" aria-hidden="true">
          <Input
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            name="website_url"
          />
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={submitting}>
            {t('submitApplication')}
          </Button>
        </div>
      </form>
    </div>
  );
}
