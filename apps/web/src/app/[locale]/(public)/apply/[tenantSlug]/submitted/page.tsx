'use client';

import { Check } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

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

export default function PublicApplySubmittedPage() {
  const params = useParams<{ locale: string; tenantSlug: string }>();
  const searchParams = useSearchParams();
  const t = useTranslations('publicApplyForm');

  const locale = params?.locale ?? 'en';
  const tenantSlug = params?.tenantSlug ?? '';
  const applicationRef = searchParams?.get('ref') ?? '';
  const isRtl = locale === 'ar';

  const [tenant, setTenant] = React.useState<PublicTenantConfig | null>(null);

  React.useEffect(() => {
    if (!tenantSlug) return;
    let cancelled = false;
    apiClient<PublicTenantConfig>(
      `/api/v1/public/tenants/by-slug/${encodeURIComponent(tenantSlug)}`,
      { skipAuth: true, silent: true },
    )
      .then((res) => {
        if (!cancelled) setTenant(res);
      })
      .catch((err) => {
        console.error('[PublicApplySubmittedPage.loadTenant]', err);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  const displayName = isRtl
    ? (tenant?.display_name_ar ?? tenant?.display_name ?? tenant?.name ?? '')
    : (tenant?.display_name ?? tenant?.name ?? '');

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-success-surface">
        <Check className="h-8 w-8 text-success-text" aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-semibold text-text-primary">{t('submittedTitle')}</h1>
      <p className="mt-3 text-sm text-text-secondary">{t('submittedBody')}</p>

      {applicationRef && (
        <div className="mt-6 w-full rounded-xl border border-border bg-surface p-4">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            {t('submittedRefLabel')}
          </p>
          <p className="mt-1 font-mono text-lg font-semibold text-text-primary" dir="ltr">
            {applicationRef}
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
