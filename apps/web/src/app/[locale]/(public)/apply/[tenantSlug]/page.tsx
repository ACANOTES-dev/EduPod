'use client';

import { Plus, Users } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, toast } from '@school/ui';

import { DynamicFormRenderer } from '@/components/admissions/dynamic-form-renderer';
import { apiClient, unwrap } from '@/lib/api-client';

import { StudentsSection, createEmptyStudent } from './_components/students-section';
import type { StudentDraft } from './_components/students-section';

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

interface ExistingHousehold {
  household_id: string;
  household_number: string;
  household_name: string;
  active_student_count: number;
}

interface BatchApplication {
  id: string;
  application_number: string;
  status: string;
  student_first_name: string;
  student_last_name: string;
  target_year_group_id: string;
}

interface CreatePublicResponse {
  mode: 'new_household' | 'existing_household';
  submission_batch_id: string;
  household_number: string | null;
  applications: BatchApplication[];
}

type Mode = 'pick' | 'lookup' | 'new_family' | 'existing_family';
type LoadState = 'loading' | 'tenant-not-found' | 'form-not-found' | 'ready' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'public-apply-draft-';

// ─── Grouped field definitions (for the household payload sections) ──────────

const HOUSEHOLD_FIELD_GROUPS: Array<{ id: string; titleKey: string; fieldKeys: string[] }> = [
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
];

const EMERGENCY_FIELD_GROUP = {
  id: 'emergency',
  titleKey: 'emergencySection',
  fieldKeys: ['emergency_name', 'emergency_phone', 'emergency_relationship'],
};

// ─── Year-group option extraction ────────────────────────────────────────────

function extractFieldOptions(
  form: PublicForm | null,
  fieldKey: string,
): Array<{ value: string; label: string }> {
  if (!form) return [];
  const field = form.fields.find((f) => f.field_key === fieldKey);
  return field?.options_json ?? [];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicApplyPage() {
  const params = useParams<{ locale: string; tenantSlug: string }>();
  const router = useRouter();
  const t = useTranslations('publicApplyForm');
  const tc = useTranslations('common');

  const locale = params?.locale ?? 'en';
  const tenantSlug = params?.tenantSlug ?? '';
  const isRtl = locale === 'ar';

  // ─── Core state ──────────────────────────────────────────────────────────
  const [loadState, setLoadState] = React.useState<LoadState>('loading');
  const [tenant, setTenant] = React.useState<PublicTenantConfig | null>(null);
  const [form, setForm] = React.useState<PublicForm | null>(null);
  const [mode, setMode] = React.useState<Mode>('pick');

  // Household lookup
  const [lookupHouseholdNumber, setLookupHouseholdNumber] = React.useState('');
  const [lookupParentEmail, setLookupParentEmail] = React.useState('');
  const [lookupSubmitting, setLookupSubmitting] = React.useState(false);
  const [existingHousehold, setExistingHousehold] = React.useState<ExistingHousehold | null>(null);

  // New family household payload (parent/address/emergency form values)
  const [householdValues, setHouseholdValues] = React.useState<Record<string, unknown>>({});

  // Student drafts
  const [students, setStudents] = React.useState<StudentDraft[]>(() => [createEmptyStudent()]);

  // Form state
  const [honeypot, setHoneypot] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const storageKey = `${STORAGE_KEY_PREFIX}${tenantSlug}`;

  // ─── Resolve tenant ──────────────────────────────────────────────────────
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
        setLoadState('ready');
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

  // ─── Fetch form (only after mode is chosen) ──────────────────────────────
  const formNeeded = mode === 'new_family' || mode === 'existing_family';

  React.useEffect(() => {
    if (!formNeeded || !tenant || form) return;

    let cancelled = false;

    void (async () => {
      try {
        const formResponse = unwrap(
          await apiClient<{ data: PublicForm } | PublicForm>('/api/v1/public/admissions/form', {
            skipAuth: true,
            silent: true,
            headers: { 'X-Tenant-Slug': tenant.slug },
          }),
        );
        if (cancelled) return;
        setForm(formResponse);
      } catch (formError) {
        if (cancelled) return;
        console.error('[PublicApplyPage.loadForm]', formError);
        setLoadState('form-not-found');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [formNeeded, tenant, form]);

  // ─── Draft persistence (restore) ─────────────────────────────────────────
  React.useEffect(() => {
    if (loadState !== 'ready' || typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw) as {
        mode?: Mode;
        students?: StudentDraft[];
        householdValues?: Record<string, unknown>;
        existingHousehold?: ExistingHousehold | null;
      };
      if (draft.mode && draft.mode !== 'pick' && draft.mode !== 'lookup') {
        setMode(draft.mode);
      }
      if (draft.students && draft.students.length > 0) {
        setStudents(draft.students);
      }
      if (draft.householdValues) {
        setHouseholdValues(draft.householdValues);
      }
      if (draft.existingHousehold) {
        setExistingHousehold(draft.existingHousehold);
      }
    } catch (err) {
      console.error('[PublicApplyPage.restoreDraft]', err);
    }
  }, [loadState, storageKey]);

  // ─── Draft persistence (save) ────────────────────────────────────────────
  React.useEffect(() => {
    if (loadState !== 'ready' || typeof window === 'undefined') return;
    // Only persist once user has committed to a mode
    if (mode === 'pick' || mode === 'lookup') return;
    try {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ mode, students, householdValues, existingHousehold }),
      );
    } catch (err) {
      console.error('[PublicApplyPage.persistDraft]', err);
    }
  }, [loadState, storageKey, mode, students, householdValues, existingHousehold]);

  // ─── Students CRUD ───────────────────────────────────────────────────────
  const addStudent = React.useCallback(() => {
    setStudents((prev) => [...prev, createEmptyStudent()]);
  }, []);

  const removeStudent = React.useCallback((id: string) => {
    setStudents((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const updateStudent = React.useCallback((id: string, patch: Partial<StudentDraft>) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  // ─── Mode transitions ───────────────────────────────────────────────────
  const handleSelectNewFamily = React.useCallback(() => {
    setMode('new_family');
  }, []);

  const handleSelectExistingFamily = React.useCallback(() => {
    setMode('lookup');
  }, []);

  const handleBackToModePicker = React.useCallback(() => {
    setMode('pick');
    setExistingHousehold(null);
    setLookupHouseholdNumber('');
    setLookupParentEmail('');
    // Clear stale draft
    try {
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(storageKey);
      }
    } catch (err) {
      console.error('[PublicApplyPage.clearDraft]', err);
    }
  }, [storageKey]);

  // ─── Household lookup ────────────────────────────────────────────────────
  const handleLookup = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (lookupSubmitting) return;
      if (!lookupHouseholdNumber.trim() || !lookupParentEmail.trim()) return;

      setLookupSubmitting(true);
      try {
        const res = unwrap(
          await apiClient<{ data: ExistingHousehold }>('/api/v1/public/households/lookup', {
            method: 'POST',
            skipAuth: true,
            silent: true,
            headers: { 'X-Tenant-Slug': tenantSlug },
            body: JSON.stringify({
              tenant_slug: tenantSlug,
              household_number: lookupHouseholdNumber.toUpperCase().trim(),
              parent_email: lookupParentEmail.toLowerCase().trim(),
            }),
          }),
        );
        setExistingHousehold(res);
        setMode('existing_family');
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 403) {
          toast.error(t('lookupRateLimitError'));
        } else {
          toast.error(t('lookupFailedError'));
        }
      } finally {
        setLookupSubmitting(false);
      }
    },
    [lookupHouseholdNumber, lookupParentEmail, lookupSubmitting, tenantSlug, t],
  );

  // ─── Compute grouped form fields (household payload sections) ────────────
  const groupedHouseholdFields = React.useMemo(() => {
    if (!form) return [];
    const byKey = new Map(form.fields.map((f) => [f.field_key, f]));
    return [...HOUSEHOLD_FIELD_GROUPS, EMERGENCY_FIELD_GROUP]
      .map((group) => {
        const fields = group.fieldKeys
          .map((key) => byKey.get(key))
          .filter((f): f is PublicFormField => !!f);
        return { ...group, fields };
      })
      .filter((g) => g.fields.length > 0);
  }, [form]);

  // Separate household-payload groups from the emergency group
  const parentAddressGroups = React.useMemo(
    () => groupedHouseholdFields.filter((g) => g.id !== 'emergency'),
    [groupedHouseholdFields],
  );

  const emergencyGroup = React.useMemo(
    () => groupedHouseholdFields.find((g) => g.id === 'emergency') ?? null,
    [groupedHouseholdFields],
  );

  // Year group and academic year options from form definition
  const academicYearOptions = React.useMemo(
    () => extractFieldOptions(form, 'target_academic_year_id'),
    [form],
  );
  const yearGroupOptions = React.useMemo(
    () => extractFieldOptions(form, 'target_year_group_id'),
    [form],
  );

  // ─── Validation ──────────────────────────────────────────────────────────
  const allStudentsValid = React.useMemo(() => {
    return students.every(
      (s) =>
        s.first_name.trim().length > 0 &&
        s.last_name.trim().length > 0 &&
        s.date_of_birth.length > 0 &&
        s.gender !== '' &&
        s.national_id.trim().length > 0 &&
        s.target_academic_year_id.length > 0 &&
        s.target_year_group_id.length > 0,
    );
  }, [students]);

  const householdPayloadValid = React.useMemo(() => {
    if (mode !== 'new_family') return true;
    const v = householdValues;
    return (
      typeof v.parent1_first_name === 'string' &&
      (v.parent1_first_name as string).trim().length > 0 &&
      typeof v.parent1_last_name === 'string' &&
      (v.parent1_last_name as string).trim().length > 0 &&
      typeof v.parent1_email === 'string' &&
      (v.parent1_email as string).trim().length > 0 &&
      typeof v.parent1_phone === 'string' &&
      (v.parent1_phone as string).trim().length > 0 &&
      typeof v.parent1_relationship === 'string' &&
      (v.parent1_relationship as string).trim().length > 0 &&
      typeof v.address_line_1 === 'string' &&
      (v.address_line_1 as string).trim().length > 0 &&
      typeof v.city === 'string' &&
      (v.city as string).trim().length > 0 &&
      typeof v.country === 'string' &&
      (v.country as string).trim().length > 0
    );
  }, [mode, householdValues]);

  const canSubmit =
    loadState === 'ready' &&
    !!tenant &&
    (mode === 'new_family' || mode === 'existing_family') &&
    students.length > 0 &&
    allStudentsValid &&
    householdPayloadValid &&
    !submitting;

  // ─── Submit handler ──────────────────────────────────────────────────────
  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (honeypot) return;
      if (!canSubmit || !tenant) return;

      setSubmitting(true);
      try {
        const body: Record<string, unknown> = {
          form_definition_id: form?.id,
          mode: mode === 'new_family' ? 'new_household' : 'existing_household',
          website_url: honeypot || undefined,
          students: students.map((s) => ({
            first_name: s.first_name.trim(),
            middle_name: s.middle_name.trim() || undefined,
            last_name: s.last_name.trim(),
            date_of_birth: s.date_of_birth,
            gender: s.gender,
            national_id: s.national_id.trim(),
            target_academic_year_id: s.target_academic_year_id,
            target_year_group_id: s.target_year_group_id,
            medical_notes: s.medical_notes.trim() || undefined,
            has_allergies: s.has_allergies ?? undefined,
          })),
        };

        if (mode === 'existing_family' && existingHousehold) {
          body.existing_household_id = existingHousehold.household_id;
        } else if (mode === 'new_family') {
          body.household_payload = {
            parent1_first_name: (householdValues.parent1_first_name as string)?.trim() ?? '',
            parent1_last_name: (householdValues.parent1_last_name as string)?.trim() ?? '',
            parent1_email: (householdValues.parent1_email as string)?.trim() ?? '',
            parent1_phone: (householdValues.parent1_phone as string)?.trim() ?? '',
            parent1_relationship: (householdValues.parent1_relationship as string)?.trim() ?? '',
            parent2_first_name: (householdValues.parent2_first_name as string)?.trim() || undefined,
            parent2_last_name: (householdValues.parent2_last_name as string)?.trim() || undefined,
            parent2_email: (householdValues.parent2_email as string)?.trim() || undefined,
            parent2_phone: (householdValues.parent2_phone as string)?.trim() || undefined,
            parent2_relationship:
              (householdValues.parent2_relationship as string)?.trim() || undefined,
            address_line_1: (householdValues.address_line_1 as string)?.trim() ?? '',
            address_line_2: (householdValues.address_line_2 as string)?.trim() || undefined,
            city: (householdValues.city as string)?.trim() ?? '',
            country: (householdValues.country as string)?.trim() ?? '',
            postal_code: (householdValues.postal_code as string)?.trim() || undefined,
            emergency_name: (householdValues.emergency_name as string)?.trim() || undefined,
            emergency_phone: (householdValues.emergency_phone as string)?.trim() || undefined,
            emergency_relationship:
              (householdValues.emergency_relationship as string)?.trim() || undefined,
          };
        }

        const res = unwrap(
          await apiClient<{ data: CreatePublicResponse }>(
            '/api/v1/public/admissions/applications',
            {
              method: 'POST',
              skipAuth: true,
              silent: true,
              headers: { 'X-Tenant-Slug': tenant.slug },
              body: JSON.stringify(body),
            },
          ),
        );

        // Stash batch results in sessionStorage for the submitted page
        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(
              `${STORAGE_KEY_PREFIX}${tenantSlug}-batch`,
              JSON.stringify(res),
            );
            window.sessionStorage.removeItem(storageKey);
          }
        } catch (storageError) {
          console.error('[PublicApplyPage.clearDraft]', storageError);
        }

        router.push(
          `/${locale}/apply/${encodeURIComponent(tenantSlug)}/submitted?batch=${encodeURIComponent(res.submission_batch_id)}`,
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
    },
    [
      honeypot,
      canSubmit,
      tenant,
      form,
      mode,
      students,
      existingHousehold,
      householdValues,
      tenantSlug,
      storageKey,
      locale,
      router,
      t,
      tc,
    ],
  );

  const displayName = isRtl
    ? (tenant?.display_name_ar ?? tenant?.display_name ?? tenant?.name ?? '')
    : (tenant?.display_name ?? tenant?.name ?? '');

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

  if (loadState === 'error' || !tenant) {
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

      {/* ─── Mode Picker ─────────────────────────────────────────────────── */}
      {mode === 'pick' && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-text-primary">{t('modePickerTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleSelectNewFamily}
              className="group rounded-xl border border-border bg-surface p-5 text-start shadow-sm transition-colors hover:border-brand hover:bg-brand/5"
            >
              <Users className="mb-3 h-6 w-6 text-text-secondary group-hover:text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('modePickerOptionNewLabel')}
              </h3>
              <p className="mt-1.5 text-xs text-text-secondary">
                {t('modePickerOptionNewDescription')}
              </p>
            </button>
            <button
              type="button"
              onClick={handleSelectExistingFamily}
              className="group rounded-xl border border-border bg-surface p-5 text-start shadow-sm transition-colors hover:border-brand hover:bg-brand/5"
            >
              <Plus className="mb-3 h-6 w-6 text-text-secondary group-hover:text-brand" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('modePickerOptionExistingLabel')}
              </h3>
              <p className="mt-1.5 text-xs text-text-secondary">
                {t('modePickerOptionExistingDescription')}
              </p>
            </button>
          </div>
        </div>
      )}

      {/* ─── Household Lookup ────────────────────────────────────────────── */}
      {mode === 'lookup' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{t('lookupTitle')}</h2>
            <p className="mt-1 text-sm text-text-secondary">{t('lookupSubtitle')}</p>
          </div>

          <form onSubmit={handleLookup} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lookup-household-number">{t('lookupHouseholdNumberLabel')}</Label>
              <Input
                id="lookup-household-number"
                value={lookupHouseholdNumber}
                onChange={(e) => setLookupHouseholdNumber(e.target.value.toUpperCase().slice(0, 6))}
                placeholder={t('lookupHouseholdNumberPlaceholder')}
                dir="ltr"
                className="font-mono"
                maxLength={6}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lookup-parent-email">{t('lookupParentEmailLabel')}</Label>
              <Input
                id="lookup-parent-email"
                type="email"
                value={lookupParentEmail}
                onChange={(e) => setLookupParentEmail(e.target.value)}
                placeholder={t('lookupParentEmailPlaceholder')}
                dir="ltr"
                required
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={lookupSubmitting}>
                {lookupSubmitting ? tc('loading') : t('lookupButton')}
              </Button>
              <Button type="button" variant="ghost" onClick={handleBackToModePicker}>
                {t('backToModePicker')}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ─── New Family Form ─────────────────────────────────────────────── */}
      {mode === 'new_family' && (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Back link */}
          <Button type="button" variant="ghost" size="sm" onClick={handleBackToModePicker}>
            {t('backToModePicker')}
          </Button>

          {/* Parent + Address sections (from form definition) */}
          {parentAddressGroups.map((group) => (
            <section
              key={group.id}
              className="rounded-xl border border-border bg-surface p-6 shadow-sm"
            >
              <h2 className="mb-4 text-base font-semibold text-text-primary">
                {t(group.titleKey)}
              </h2>
              <DynamicFormRenderer
                fields={group.fields}
                values={householdValues}
                onChange={setHouseholdValues}
              />
            </section>
          ))}

          {/* Students section */}
          <StudentsSection
            students={students}
            onAdd={addStudent}
            onRemove={removeStudent}
            onUpdate={updateStudent}
            academicYearOptions={academicYearOptions}
            yearGroupOptions={yearGroupOptions}
            isExistingFamily={false}
          />

          {/* Emergency contact (after students) */}
          {emergencyGroup && (
            <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-text-primary">
                {t(emergencyGroup.titleKey)}
              </h2>
              <DynamicFormRenderer
                fields={emergencyGroup.fields}
                values={householdValues}
                onChange={setHouseholdValues}
              />
            </section>
          )}

          {/* Honeypot */}
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
              <Button type="submit" disabled={!canSubmit}>
                {submitting
                  ? tc('loading')
                  : students.length > 1
                    ? t('submitButtonPlural', { count: students.length })
                    : t('submitButtonSingular')}
              </Button>
            </div>
          </div>
        </form>
      )}

      {/* ─── Existing Family Form ────────────────────────────────────────── */}
      {mode === 'existing_family' && existingHousehold && (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* Back link */}
          <Button type="button" variant="ghost" size="sm" onClick={handleBackToModePicker}>
            {t('backToModePicker')}
          </Button>

          {/* Matched household banner */}
          <div className="rounded-xl border border-success-border bg-success-surface/30 p-5">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('matchedBannerTitle', { householdName: existingHousehold.household_name })}
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              {t('matchedBannerCount', { count: existingHousehold.active_student_count })}
            </p>
          </div>

          {/* Students section */}
          <StudentsSection
            students={students}
            onAdd={addStudent}
            onRemove={removeStudent}
            onUpdate={updateStudent}
            academicYearOptions={academicYearOptions}
            yearGroupOptions={yearGroupOptions}
            isExistingFamily={true}
          />

          {/* Honeypot */}
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
              <Button type="submit" disabled={!canSubmit}>
                {submitting
                  ? tc('loading')
                  : students.length > 1
                    ? t('submitButtonPlural', { count: students.length })
                    : t('submitButtonSingular')}
              </Button>
            </div>
          </div>
        </form>
      )}

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
