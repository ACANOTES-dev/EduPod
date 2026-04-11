'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { DynamicFormRenderer } from '@/components/admissions/dynamic-form-renderer';
import { apiClient, unwrap } from '@/lib/api-client';

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

const YEAR_FIELD_KEYS = new Set(['target_academic_year_id', 'target_year_group_id']);
const STORAGE_KEY_PREFIX = 'public-apply-draft-';

// Ordered field-group definitions — every canonical system-form key belongs
// to exactly one group. Any unrecognised field falls through to "other".
const FIELD_GROUPS: Array<{ id: string; titleKey: string; fieldKeys: string[] }> = [
  {
    id: 'student',
    titleKey: 'studentSection',
    fieldKeys: [
      'student_first_name',
      'student_middle_name',
      'student_last_name',
      'student_dob',
      'student_gender',
      'student_national_id',
      'student_medical_notes',
      'student_allergies',
    ],
  },
  {
    id: 'year',
    titleKey: 'yearSection',
    fieldKeys: ['target_academic_year_id', 'target_year_group_id'],
  },
  {
    id: 'parent1',
    titleKey: 'parent1Section',
    fieldKeys: [
      'parent1_first_name',
      'parent1_last_name',
      'parent1_email',
      'parent1_phone',
      'parent1_relationship',
    ],
  },
  {
    id: 'parent2',
    titleKey: 'parent2Section',
    fieldKeys: [
      'parent2_first_name',
      'parent2_last_name',
      'parent2_email',
      'parent2_phone',
      'parent2_relationship',
    ],
  },
  {
    id: 'address',
    titleKey: 'addressSection',
    fieldKeys: ['address_line_1', 'address_line_2', 'city', 'country', 'postal_code'],
  },
  {
    id: 'emergency',
    titleKey: 'emergencySection',
    fieldKeys: ['emergency_name', 'emergency_phone', 'emergency_relationship'],
  },
];

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
        const tenantConfig = unwrap(
          await apiClient<{ data: PublicTenantConfig } | PublicTenantConfig>(
            `/api/v1/public/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
            { skipAuth: true, silent: true },
          ),
        );
        if (cancelled) return;
        setTenant(tenantConfig);

        try {
          const formResponse = unwrap(
            await apiClient<{ data: PublicForm } | PublicForm>('/api/v1/public/admissions/form', {
              skipAuth: true,
              silent: true,
              headers: { 'X-Tenant-Slug': tenantConfig.slug },
            }),
          );
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
      const draft = JSON.parse(raw) as { formValues?: Record<string, unknown> };
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
        JSON.stringify({ formValues }),
      );
    } catch (err) {
      console.error('[PublicApplyPage.persistDraft]', err);
    }
  }, [loadState, tenantSlug, formValues]);

  const displayName = isRtl
    ? (tenant?.display_name_ar ?? tenant?.display_name ?? tenant?.name ?? '')
    : (tenant?.display_name ?? tenant?.name ?? '');

  // Split form fields into semantic groups by canonical field_key. Any field
  // the canonical template doesn't know about falls through to an "other"
  // bucket so tenants that extend the form in the future still render
  // sensibly.
  const groupedFields = React.useMemo(() => {
    const byKey = new Map((form?.fields ?? []).map((f) => [f.field_key, f]));
    const assigned = new Set<string>();
    const groups = FIELD_GROUPS.map((group) => {
      const fields = group.fieldKeys
        .map((key) => {
          const found = byKey.get(key);
          if (found) assigned.add(key);
          return found;
        })
        .filter((f): f is PublicFormField => !!f);
      return { ...group, fields };
    }).filter((g) => g.fields.length > 0);

    const other = (form?.fields ?? []).filter((f) => !assigned.has(f.field_key));
    if (other.length > 0) {
      groups.push({ id: 'other', titleKey: 'otherSection', fieldKeys: [], fields: other });
    }
    return groups;
  }, [form]);

  const studentFirstName =
    typeof formValues.student_first_name === 'string' ? formValues.student_first_name : '';
  const studentLastName =
    typeof formValues.student_last_name === 'string' ? formValues.student_last_name : '';
  const studentDob = typeof formValues.student_dob === 'string' ? formValues.student_dob : '';

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
        Object.entries(formValues).filter(
          ([key]) =>
            !YEAR_FIELD_KEYS.has(key) &&
            key !== 'student_first_name' &&
            key !== 'student_last_name' &&
            key !== 'student_dob',
        ),
      );

      const created = unwrap(
        await apiClient<{ data: ApplicationCreatedResponse } | ApplicationCreatedResponse>(
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
              date_of_birth: studentDob || null,
              target_academic_year_id: targetAcademicYearId,
              target_year_group_id: targetYearGroupId,
              payload_json: residualPayload,
              website_url: honeypot || undefined,
            }),
          },
        ),
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
        {groupedFields.map((group) => (
          <section
            key={group.id}
            className="rounded-xl border border-border bg-surface p-6 shadow-sm"
          >
            <h2 className="mb-4 text-base font-semibold text-text-primary">{t(group.titleKey)}</h2>
            <DynamicFormRenderer
              fields={group.fields}
              values={formValues}
              onChange={setFormValues}
            />
          </section>
        ))}

        {/* Honeypot — hidden from real users, rejected server-side if filled */}
        <div className="absolute -start-[9999px] opacity-0" aria-hidden="true">
          <label>
            {t('honeypotLabel')}
            <input
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
