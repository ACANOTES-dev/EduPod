'use client';

import type { SubProcessorRegisterVersion } from '@school/shared';
import { Button } from '@school/ui';
import Link from 'next/link';
import * as React from 'react';
import { ArrowLeftRight, Globe2, ShieldCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

interface SubProcessorsResponse {
  current_version: SubProcessorRegisterVersion;
  history: SubProcessorRegisterVersion[];
}

export default function PublicSubProcessorsPage() {
  const t = useTranslations('legal');
  const locale = useLocale();
  const [data, setData] = React.useState<SubProcessorsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function load() {
      try {
        const response = await apiClient<SubProcessorsResponse>('/api/v1/public/sub-processors', {
          skipAuth: true,
        });
        setData(response);
      } catch (err) {
        console.error('[PublicSubProcessorsPage.load]', err);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const currentVersion = data?.current_version ?? null;
  const versionHistory = data?.history ?? [];

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_45%),linear-gradient(180deg,#f8fafc_0%,#eef6ff_100%)]">
      <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8">
        <section className="rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
            {t('subProcessorsEyebrow')}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-900">
            {t('subProcessorsTitle')}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">
            {t('subProcessorsDescription')}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm text-slate-700">
              <ShieldCheck className="h-4 w-4" />
              {currentVersion
                ? t('subProcessorsVersionLabel', { version: currentVersion.version })
                : t('subProcessorsUnavailable')}
            </div>
            {currentVersion?.objection_deadline ? (
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm text-amber-900">
                <ArrowLeftRight className="h-4 w-4" />
                {t('subProcessorsObjectionDeadline', {
                  date: formatDate(currentVersion.objection_deadline),
                })}
              </div>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm text-emerald-900">
              <Globe2 className="h-4 w-4" />
              {t('subProcessorsPublicAccess')}
            </div>
          </div>
        </section>

        {loading ? (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[1, 2, 3, 4].map((index) => (
              <div
                key={index}
                className="h-40 animate-pulse rounded-3xl border border-white/70 bg-white/70"
              />
            ))}
          </div>
        ) : currentVersion ? (
          <div className="mt-8 space-y-8">
            <section className="grid gap-4 md:grid-cols-2">
              {currentVersion.entries.map((entry) => (
                <article
                  key={entry.id}
                  className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{entry.name}</h2>
                      <p className="mt-1 text-sm text-slate-600">{entry.purpose}</p>
                    </div>
                    {entry.is_planned ? (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        {t('subProcessorsPlanned')}
                      </span>
                    ) : null}
                  </div>

                  <dl className="mt-5 space-y-3 text-sm">
                    <div>
                      <dt className="font-medium text-slate-500">{t('subProcessorsDataCategories')}</dt>
                      <dd className="mt-1 text-slate-800">{entry.data_categories}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">{t('subProcessorsLocation')}</dt>
                      <dd className="mt-1 text-slate-800">{entry.location}</dd>
                    </div>
                    <div>
                      <dt className="font-medium text-slate-500">{t('subProcessorsTransferMechanism')}</dt>
                      <dd className="mt-1 text-slate-800">{entry.transfer_mechanism}</dd>
                    </div>
                    {entry.notes ? (
                      <div>
                        <dt className="font-medium text-slate-500">{t('subProcessorsNotes')}</dt>
                        <dd className="mt-1 text-slate-800">{entry.notes}</dd>
                      </div>
                    ) : null}
                  </dl>
                </article>
              ))}
            </section>

            <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-slate-900">{t('subProcessorsHistoryTitle')}</h2>
              <div className="mt-5 space-y-3">
                {versionHistory.map((version) => (
                  <article
                    key={version.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {t('subProcessorsVersionLabel', { version: version.version })}
                      </p>
                      <p className="text-sm text-slate-600">
                        {formatDate(version.published_at)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{version.change_summary}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="mt-8 rounded-3xl border border-white/70 bg-white/90 p-8 text-sm text-slate-600">
            {t('subProcessorsUnavailable')}
          </div>
        )}

        <div className="mt-8">
          <Button asChild variant="outline">
            <Link href={`/${locale}`}>{t('subProcessorsBackHome')}</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
