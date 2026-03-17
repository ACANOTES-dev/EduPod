'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, toast } from '@school/ui';

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicAdmissionsPage() {
  const t = useTranslations('admissions');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

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

  // Honeypot
  const [honeypot, setHoneypot] = React.useState('');

  React.useEffect(() => {
    apiClient<PublicForm>('/api/v1/public/admission-forms/active', { skipAuth: true })
      .then((res) => setForm(res))
      .catch(() => {
        // No active form
      })
      .finally(() => setLoading(false));
  }, []);

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
      router.push(`/${locale}/login?returnTo=${encodeURIComponent(pathname)}`);
      return;
    }

    if (!form) return;

    setSubmitting(true);
    try {
      await apiClient('/api/v1/applications', {
        method: 'POST',
        body: JSON.stringify({
          form_id: form.id,
          student_first_name: studentFirstName,
          student_last_name: studentLastName,
          date_of_birth: dateOfBirth || undefined,
          payload: formValues,
        }),
      });
      setSubmitted(true);
      toast.success(t('applicationSubmitted'));
    } catch {
      toast.error(tc('errorGeneric'));
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
