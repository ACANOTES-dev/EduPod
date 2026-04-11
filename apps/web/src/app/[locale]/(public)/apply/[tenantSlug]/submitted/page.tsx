'use client';

import { Check } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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

interface BatchApplication {
  id: string;
  application_number: string;
  status: string;
  student_first_name: string;
  student_last_name: string;
  target_year_group_id: string;
}

interface BatchResult {
  mode: 'new_household' | 'existing_household';
  submission_batch_id: string;
  household_number: string | null;
  applications: BatchApplication[];
}

const STATUS_LABELS: Record<string, string> = {
  ready_to_admit: 'Ready to admit',
  waiting_list: 'Waiting list',
  awaiting_year_setup: 'Awaiting year setup',
  submitted: 'Submitted',
};

const STORAGE_KEY_PREFIX = 'public-apply-draft-';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PublicApplySubmittedPage() {
  const params = useParams<{ locale: string; tenantSlug: string }>();
  const searchParams = useSearchParams();
  const t = useTranslations('publicApplyForm');

  const locale = params?.locale ?? 'en';
  const tenantSlug = params?.tenantSlug ?? '';
  const batchId = searchParams?.get('batch') ?? '';
  // Legacy single-app fallback
  const legacyRef = searchParams?.get('ref') ?? '';
  const isRtl = locale === 'ar';

  const [tenant, setTenant] = React.useState<PublicTenantConfig | null>(null);
  const [batchResult, setBatchResult] = React.useState<BatchResult | null>(null);

  // Load tenant
  React.useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    apiClient<{ data: PublicTenantConfig } | PublicTenantConfig>(
      `/api/v1/public/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
      { skipAuth: true, silent: true },
    )
      .then((res) => {
        if (!cancelled) setTenant(unwrap(res));
      })
      .catch((err) => {
        console.error('[PublicApplySubmittedPage.loadTenant]', err);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  // Restore batch result from sessionStorage
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${tenantSlug}-batch`);
      if (raw) {
        const parsed = JSON.parse(raw) as BatchResult;
        if (batchId && parsed.submission_batch_id === batchId) {
          setBatchResult(parsed);
        }
      }
    } catch (err) {
      console.error('[PublicApplySubmittedPage.restoreBatch]', err);
    }
  }, [tenantSlug, batchId]);

  const displayName = isRtl
    ? (tenant?.display_name_ar ?? tenant?.display_name ?? tenant?.name ?? '')
    : (tenant?.display_name ?? tenant?.name ?? '');

  const applications = batchResult?.applications ?? [];
  const householdNumber = batchResult?.household_number ?? null;
  const hasMultipleApps = applications.length > 1;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-surface">
        <Check className="h-8 w-8 text-success-text" aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-semibold text-text-primary">
        {hasMultipleApps ? t('submittedTitlePlural') : t('submittedTitle')}
      </h1>
      <p className="mt-3 text-sm text-text-secondary">{t('submittedBody')}</p>

      {/* Household number for existing-family submissions */}
      {householdNumber && (
        <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-2">
          <p className="text-xs text-text-tertiary">{t('submittedHouseholdLabel')}</p>
          <p className="font-mono text-base font-semibold text-text-primary" dir="ltr">
            {householdNumber}
          </p>
        </div>
      )}

      {/* Batch applications list */}
      {applications.length > 0 && (
        <div className="mt-6 w-full space-y-3">
          {applications.map((app) => (
            <div
              key={app.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 text-start"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {app.student_first_name} {app.student_last_name}
                </p>
                <p className="mt-0.5 font-mono text-xs text-text-tertiary" dir="ltr">
                  {app.application_number}
                </p>
              </div>
              <span className="ms-3 shrink-0 rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
                {STATUS_LABELS[app.status] ?? app.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Legacy single ref fallback */}
      {applications.length === 0 && legacyRef && (
        <div className="mt-6 w-full rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            {t('submittedRefLabel')}
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-text-primary" dir="ltr">
            {legacyRef}
          </p>
        </div>
      )}

      <p className="mt-6 text-xs text-text-tertiary">{t('submittedNextSteps')}</p>

      {(tenant?.support_email || tenant?.support_phone) && (
        <div className="mt-10 w-full border-t border-border pt-6 text-xs text-text-tertiary">
          {displayName && <p className="font-medium text-text-secondary">{displayName}</p>}
          <p className="mt-1 flex flex-wrap items-center justify-center gap-2">
            {tenant?.support_email && (
              <a href={`mailto:${tenant.support_email}`} dir="ltr" className="underline">
                {tenant.support_email}
              </a>
            )}
            {tenant?.support_email && tenant?.support_phone && <span aria-hidden>•</span>}
            {tenant?.support_phone && (
              <a href={`tel:${tenant.support_phone}`} dir="ltr" className="underline">
                {tenant.support_phone}
              </a>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
