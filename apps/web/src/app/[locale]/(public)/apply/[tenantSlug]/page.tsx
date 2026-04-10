'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, toast } from '@school/ui';

import { DynamicFormRenderer } from '@/components/admissions/dynamic-form-renderer';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PublicTenantConfig {
  tenant_id: string;
  slug: string;
  name: string;
  display_name: string;
  display_name_ar: string | null;
  logo_url: string | null;
  primary_color: string | null;
  support_email: string | null;
  support_phone: string | null;
  default_locale: string;
  public_domain: string | null;
}

interface PublicFormField {
  id?: string;
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
  version_number: number;
  fields: PublicFormField[];
  tenant_name?: string;
}

interface ApplicationCreatedResponse {
  id: string;
  application_number: string;
  status: string;
}

type LoadState = 'loading' | 'tenant-not-found' | 'form-not-found' | 'ready' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const CORE_FIELD_KEYS = new Set(['target_academic_year_id', 'target_year_group_id']);
const STORAGE_KEY_PREFIX = 'public-apply-draft-';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicApplyPage() {
  const params = useParams<{ locale: string; tenantSlug: string }>();
  const router = useRouter();
  const t = useTranslations('publicApplyForm');
  const tc = useTranslations('common');

  const locale = params?.locale ?? 'en';
  const tenantSlug = params?.tenantSlug ?? '';
  const isRtl = locale === 'ar';

  const [loadState, setLoadState] = React.useState<LoadState>('loading');
  const [tenant, setTenant] = React.useState<PublicTenantConfig | null>(null);
  const [form, setForm] = React.useState<PublicForm | null>(null);

  const [studentFirstName, setStudentFirstName] = React.useState('');
  const [studentLastName, setStudentLastName] = React.useState('');
  const [dateOfBirth, setDateOfBirth] = React.useState('');
  const [formValues, setFormValues] = React.useState<Record<string, unknown>>({});
  const [honeypot, setHoneypot] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  // Resolve tenant by slug → fetch form
  React.useEffect(() => {
    if (!tenantSlug) {
      setLoadState('tenant-not-found');
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const tenantConfig = await apiClient<PublicTenantConfig>(
          `/api/v1/public/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
          { skipAuth: true, silent: true },
        );
        if (cancelled) return;
        setTenant(tenantConfig);

        try {
          const formResponse = await apiClient<PublicForm>('/api/v1/public/admissions/form', {
            skipAuth: true,
            silent: true,
            headers: { 'X-Tenant-Slug': tenantConfig.slug },
          });
          if (cancelled) return;
          setForm(formResponse);
          setLoadState('ready');
        } catch (formError) {
          if (cancelled) return;
          console.error('[PublicApplyPage.loadForm]', formError);
          setLoadState('form-not-found');
        }
      } catch (tenantError) {
        if (cancelled) return;
        const status = (tenantError as { status?: number })?.status;
        if (status === 404) {
          setLoadState('tenant-not-found');
        } else {
          console.error('[PublicApplyPage.loadTenant]', tenantError);
          setLoadState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Restore a draft from sessionStorage (best-effort — lets a parent recover
  // after an accidental refresh without introducing server-side state).
  React.useEffect(() => {
    if (loadState !== 'ready' || typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${tenantSlug}`);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        studentFirstName?: string;
        studentLastName?: string;
        dateOfBirth?: string;
        formValues?: Record<string, unknown>;
      };
      if (draft.studentFirstName) setStudentFirstName(draft.studentFirstName);
      if (draft.studentLastName) setStudentLastName(draft.studentLastName);
      if (draft.dateOfBirth) setDateOfBirth(draft.dateOfBirth);
      if (draft.formValues) setFormValues(draft.formValues);
    } catch (err) {
      console.error('[PublicApplyPage.restoreDraft]', err);
    }
  }, [loadState, tenantSlug]);

  // Persist draft on change
  React.useEffect(() => {
    if (loadState !== 'ready' || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        `${STORAGE_KEY_PREFIX}${tenantSlug}`,
        JSON.stringify({ studentFirstName, studentLastName, dateOfBirth, formValues }),
      );
    } catch (err) {
      console.error('[PublicApplyPage.persistDraft]', err);
    }
  }, [loadState, tenantSlug, studentFirstName, studentLastName, dateOfBirth, formValues]);

  const displayName = isRtl
    ? (tenant?.display_name_ar ?? tenant?.display_name ?? tenant?.name ?? '')
    : (tenant?.display_name ?? tenant?.name ?? '');

  // Split form fields — target year group + academic year are rendered inside
  // the "School year" card alongside the core student fields; the rest go in
  // the dynamic renderer card.
  const targetAcademicYearField = React.useMemo(
    () => form?.fields.find((f) => f.field_key === 'target_academic_year_id'),
    [form],
  );
  const targetYearGroupField = React.useMemo(
    () => form?.fields.find((f) => f.field_key === 'target_year_group_id'),
    [form],
  );
  const dynamicFields = React.useMemo(
    () => (form?.fields ?? []).filter((f) => !CORE_FIELD_KEYS.has(f.field_key)),
    [form],
  );

  const canSubmit =
    loadState === 'ready' &&
    !!form &&
    !!tenant &&
    studentFirstName.trim().length > 0 &&
    studentLastName.trim().length > 0 &&
    typeof formValues.target_academic_year_id === 'string' &&
    typeof formValues.target_year_group_id === 'string';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (honeypot) return; // bot
    if (!canSubmit || !form || !tenant) return;

    setSubmitting(true);
    try {
      const targetAcademicYearId = formValues.target_academic_year_id as string;
      const targetYearGroupId = formValues.target_year_group_id as string;
      const residualPayload = Object.fromEntries(
        Object.entries(formValues).filter(([key]) => !CORE_FIELD_KEYS.has(key)),
      );

      const created = await apiClient<ApplicationCreatedResponse>(
        '/api/v1/public/admissions/applications',
        {
          method: 'POST',
          skipAuth: true,
          silent: true,
          headers: { 'X-Tenant-Slug': tenant.slug },
          body: JSON.stringify({
            form_definition_id: form.id,
            student_first_name: studentFirstName.trim(),
            student_last_name: studentLastName.trim(),
            date_of_birth: dateOfBirth || null,
            target_academic_year_id: targetAcademicYearId,
            target_year_group_id: targetYearGroupId,
            payload_json: residualPayload,
            website_url: honeypot || undefined,
          }),
        },
      );

      // Clear draft on success — non-fatal if sessionStorage is unavailable
      // (e.g. private browsing with storage disabled); just log and move on.
      try {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${tenantSlug}`);
        }
      } catch (storageError) {
        console.error('[PublicApplyPage.clearDraft]', storageError);
      }

      router.push(
        `/${locale}/apply/${encodeURIComponent(tenantSlug)}/submitted?ref=${encodeURIComponent(
          created.application_number,
        )}`,
      );
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 429) {
        toast.error(t('rateLimitError'));
      } else {
        const message =
          (err as { error?: { message?: string } })?.error?.message ?? tc('errorGeneric');
        toast.error(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="space-y-4" aria-busy="true">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-secondary" />
          <div className="h-4 w-48 animate-pulse rounded bg-surface-secondary" />
          <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
        </div>
      </div>
    );
  }

  // ─── School not found ─────────────────────────────────────────────────────
  if (loadState === 'tenant-not-found') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-text-primary">{t('schoolNotFoundTitle')}</h1>
          <p className="mt-3 text-sm text-text-secondary">{t('schoolNotFoundBody')}</p>
        </div>
      </div>
    );
  }

  if (loadState === 'form-not-found') {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-text-primary">{t('formUnavailableTitle')}</h1>
          <p className="mt-3 text-sm text-text-secondary">{t('formUnavailableBody')}</p>
        </div>
      </div>
    );
  }

  if (loadState === 'error' || !form || !tenant) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-text-primary">{t('genericErrorTitle')}</h1>
          <p className="mt-3 text-sm text-text-secondary">{t('genericErrorBody')}</p>
        </div>
      </div>
    );
  }

  // ─── Ready ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      {/* School header */}
      <header className="mb-8 flex items-center gap-4">
        {tenant.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo is an external URL
          <img
            src={tenant.logo_url}
            alt={displayName}
            className="h-14 w-14 rounded-lg object-contain"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-surface-secondary text-lg font-semibold text-text-secondary">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">{t('headerEyebrow')}</p>
          <h1 className="truncate text-2xl font-semibold text-text-primary">{displayName}</h1>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Student fields */}
        <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-text-primary">{t('studentSection')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="student-first-name">
                {t('firstName')}
                <span className="ms-0.5 text-emerald-600">*</span>
              </Label>
              <Input
                id="student-first-name"
                value={studentFirstName}
                onChange={(e) => setStudentFirstName(e.target.value)}
                required
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="student-last-name">
                {t('lastName')}
                <span className="ms-0.5 text-emerald-600">*</span>
              </Label>
              <Input
                id="student-last-name"
                value={studentLastName}
                onChange={(e) => setStudentLastName(e.target.value)}
                required
                autoComplete="family-name"
              />
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="student-dob">{t('dateOfBirth')}</Label>
            <Input
              id="student-dob"
              type="date"
              dir="ltr"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
            />
          </div>
        </section>

        {/* Target year / academic year */}
        {(targetAcademicYearField || targetYearGroupField) && (
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">{t('yearSection')}</h2>
            <DynamicFormRenderer
              fields={
                [targetAcademicYearField, targetYearGroupField].filter(Boolean) as PublicFormField[]
              }
              values={formValues}
              onChange={setFormValues}
            />
          </section>
        )}

        {/* Dynamic fields */}
        {dynamicFields.length > 0 && (
          <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-text-primary">
              {t('detailsSection')}
            </h2>
            <DynamicFormRenderer
              fields={dynamicFields}
              values={formValues}
              onChange={setFormValues}
            />
          </section>
        )}

        {/* Honeypot — hidden from real users, rejected server-side if filled */}
        <div className="absolute -start-[9999px] opacity-0" aria-hidden="true">
          <label>
            {t('honeypotLabel')}
            <Input
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              name="website_url"
            />
          </label>
        </div>

        {/* Legal + submit */}
        <div className="space-y-4">
          <p className="text-xs text-text-tertiary">{t('privacyNotice')}</p>
          <div className="flex justify-end">
            <Button type="submit" disabled={!canSubmit || submitting}>
              {submitting ? tc('loading') : t('submitCta')}
            </Button>
          </div>
        </div>
      </form>

      {/* Footer contact */}
      {(tenant.support_email || tenant.support_phone) && (
        <footer className="mt-10 border-t border-border pt-6 text-center text-xs text-text-tertiary">
          <p>{t('needHelp')}</p>
          <p className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {tenant.support_email && (
              <a href={`mailto:${tenant.support_email}`} dir="ltr" className="underline">
                {tenant.support_email}
              </a>
            )}
            {tenant.support_email && tenant.support_phone && <span aria-hidden>•</span>}
            {tenant.support_phone && (
              <a href={`tel:${tenant.support_phone}`} dir="ltr" className="underline">
                {tenant.support_phone}
              </a>
            )}
          </p>
        </footer>
      )}
    </div>
  );
}
