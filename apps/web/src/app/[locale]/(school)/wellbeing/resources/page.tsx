'use client';

import { AlertTriangle, CheckCircle, ExternalLink, Phone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EapData {
  provider_name: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  management_body: string | null;
  last_verified_date: string | null;
}

interface ResourceItem {
  name: string;
  phone?: string;
  website?: string;
}

interface ResourcesResult {
  eap: EapData;
  resources: ResourceItem[];
}

interface CrisisEntry {
  id: string;
  name: string;
  desc: string;
  number: string;
  displayNumber: string;
  linkType: 'tel' | 'sms';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}

function isStale(dateStr: string | null): boolean {
  if (!dateStr) return true;
  const verified = new Date(dateStr);
  const now = new Date();
  const diffDays = (now.getTime() - verified.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > 90;
}

function formatVerifiedDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium' }).format(new Date(dateStr));
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-surface p-5 space-y-3">
      <div className="h-5 w-1/3 rounded bg-surface-subtle" />
      <div className="h-4 w-1/2 rounded bg-surface-subtle" />
      <div className="h-4 w-2/3 rounded bg-surface-subtle" />
    </div>
  );
}

// ─── EAP Section ─────────────────────────────────────────────────────────────

function EapSection({
  eap,
  labelHours,
  labelManagementBody,
  labelWebsite,
  labelCallNow,
  labelNoEap,
  labelStale,
  labelLastVerified,
}: {
  eap: EapData;
  labelHours: string;
  labelManagementBody: string;
  labelWebsite: string;
  labelCallNow: string;
  labelNoEap: string;
  labelStale: string;
  labelLastVerified: (date: string) => string;
}) {
  if (!eap.provider_name) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <p className="text-sm text-text-secondary">{labelNoEap}</p>
      </div>
    );
  }

  const stale = isStale(eap.last_verified_date);

  return (
    <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <h3 className="text-lg font-semibold text-text-primary">{eap.provider_name}</h3>

      <dl className="grid gap-3 sm:grid-cols-2">
        {eap.hours && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">{labelHours}</dt>
            <dd className="mt-0.5 text-sm text-text-primary">{eap.hours}</dd>
          </div>
        )}
        {eap.management_body && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">{labelManagementBody}</dt>
            <dd className="mt-0.5 text-sm text-text-primary">{eap.management_body}</dd>
          </div>
        )}
        {eap.website && (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-text-secondary">{labelWebsite}</dt>
            <dd className="mt-0.5">
              <a
                href={eap.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-brand-primary hover:underline"
              >
                {eap.website}
                <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </div>
        )}
      </dl>

      {eap.phone && (
        <a
          href={`tel:${stripSpaces(eap.phone)}`}
          className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg bg-brand-primary px-5 py-3 text-base font-semibold text-white shadow-sm hover:bg-brand-primary/90 active:scale-[0.98] transition-transform"
        >
          <Phone className="h-5 w-5" aria-hidden="true" />
          <span dir="ltr">{eap.phone}</span>
          <span className="ms-1">{labelCallNow}</span>
        </a>
      )}

      <div className="flex items-center gap-2">
        {stale ? (
          <>
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
            <span className="text-sm text-warning-text">{labelStale}</span>
          </>
        ) : (
          <>
            <CheckCircle className="h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
            <span className="text-sm text-success-text">
              {labelLastVerified(formatVerifiedDate(eap.last_verified_date!))}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Crisis Resource Card ─────────────────────────────────────────────────────

function CrisisCard({ entry }: { entry: CrisisEntry }) {
  const href = entry.linkType === 'sms' ? `sms:${entry.number}` : `tel:${entry.number}`;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
      <p className="font-semibold text-text-primary">{entry.name}</p>
      <p className="text-sm text-text-secondary">{entry.desc}</p>
      <a
        href={href}
        className="inline-flex min-h-[44px] min-w-[44px] items-center gap-2 rounded-lg bg-danger/10 px-4 py-2.5 text-base font-bold text-danger-text hover:bg-danger/20 active:scale-[0.98] transition-transform"
      >
        <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span dir="ltr">{entry.displayNumber}</span>
      </a>
    </div>
  );
}

// ─── External Resource Card ───────────────────────────────────────────────────

function ExternalResourceCard({
  resource,
  labelPhone,
  labelWebsite,
}: {
  resource: ResourceItem;
  labelPhone: string;
  labelWebsite: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
      <p className="font-semibold text-text-primary">{resource.name}</p>
      {resource.phone && (
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">{labelPhone}: </span>
          <a
            href={`tel:${stripSpaces(resource.phone)}`}
            className="inline-flex min-h-[44px] min-w-[44px] items-center gap-1.5 text-base font-semibold text-brand-primary hover:underline"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            <span dir="ltr">{resource.phone}</span>
          </a>
        </div>
      )}
      {resource.website && (
        <div>
          <span className="text-xs font-medium uppercase tracking-wide text-text-secondary">{labelWebsite}: </span>
          <a
            href={resource.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand-primary hover:underline"
          >
            {resource.website}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const EMPTY_EAP: EapData = {
  provider_name: null,
  phone: null,
  website: null,
  hours: null,
  management_body: null,
  last_verified_date: null,
};

export default function ResourcesPage() {
  const t = useTranslations('wellbeing.resources');

  const [data, setData] = React.useState<ResourcesResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<ResourcesResult>('/api/v1/staff-wellbeing/resources')
      .then((res) => setData(res))
      .catch(() => undefined)
      .finally(() => setIsLoading(false));
  }, []);

  // Resolve crisis entries inside the component where t() is available
  const crisisEntries: CrisisEntry[] = [
    { id: 'pieta', name: t('pietaHouse'), desc: t('pietaHouseDesc'), number: '1800247247', displayNumber: '1800 247 247', linkType: 'tel' },
    { id: 'samaritans', name: t('samaritans'), desc: t('samaritansDesc'), number: '116123', displayNumber: '116 123', linkType: 'tel' },
    { id: 'text50808', name: t('text50808'), desc: t('text50808Desc'), number: '50808', displayNumber: '50808', linkType: 'sms' },
    { id: 'into', name: t('into'), desc: t('intoDesc'), number: '018047700', displayNumber: '01 804 7700', linkType: 'tel' },
    { id: 'tui', name: t('tui'), desc: t('tuiDesc'), number: '014922588', displayNumber: '01 492 2588', linkType: 'tel' },
    { id: 'asti', name: t('asti'), desc: t('astiDesc'), number: '016040160', displayNumber: '01 604 0160', linkType: 'tel' },
  ];

  return (
    <div className="space-y-8 p-4 sm:p-0">
      <PageHeader title={t('title')} />

      {/* ── EAP Section ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">{t('eapSection')}</h2>
        {isLoading ? (
          <SkeletonCard />
        ) : (
          <EapSection
            eap={data?.eap ?? EMPTY_EAP}
            labelHours={t('hours')}
            labelManagementBody={t('managementBody')}
            labelWebsite={t('website')}
            labelCallNow={t('callNow')}
            labelNoEap={t('noEap')}
            labelStale={t('stale')}
            labelLastVerified={(date) => t('lastVerified', { date })}
          />
        )}
      </section>

      {/* ── Crisis Resources — always visible ───────────────────── */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text-primary">{t('crisisResources')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {crisisEntries.map((entry) => (
            <CrisisCard key={entry.id} entry={entry} />
          ))}
        </div>
      </section>

      {/* ── External / Tenant Resources ─────────────────────────── */}
      {!isLoading && data && data.resources.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-text-primary">{t('externalResources')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.resources.map((resource) => (
              <ExternalResourceCard
                key={resource.name}
                resource={resource}
                labelPhone={t('phone')}
                labelWebsite={t('website')}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
