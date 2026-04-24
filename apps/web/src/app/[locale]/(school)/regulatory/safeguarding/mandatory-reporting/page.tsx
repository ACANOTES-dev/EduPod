'use client';

import { FileText } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, StatusBadge } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MandatoryReport {
  id: string;
  concern_number: string;
  student_reference: string;
  concern_type: string;
  severity: string;
  status: string;
  tusla_referred_at: string | null;
  tusla_reference_number: string | null;
  reported_at: string;
}

interface ListResponse {
  data: MandatoryReport[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function severityStatus(severity: string): 'danger' | 'warning' | 'info' | 'neutral' {
  if (severity === 'critical' || severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  if (severity === 'low') return 'info';
  return 'neutral';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MandatoryReportingPage() {
  const t = useTranslations('regulatory.safeguarding.mandatoryReporting');
  const locale = useLocale();

  const [reports, setReports] = React.useState<MandatoryReport[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiClient<ListResponse>(
      '/api/v1/regulatory/safeguarding/mandatory-reports?page=1&pageSize=50',
      { silent: true },
    )
      .then((res) => {
        if (!cancelled) {
          setReports(res.data);
          setTotal(res.meta.total);
        }
      })
      .catch((err) => {
        console.error('[MandatoryReportingPage] fetch', err);
        if (!cancelled) {
          setReports([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{
          href: `/${locale}/regulatory/safeguarding`,
          label: t('backToSafeguarding'),
        }}
        actions={
          <Link href={`/${locale}/safeguarding/concerns`}>
            <Button variant="outline" className="min-h-[44px]">
              <FileText className="me-2 h-4 w-4" />
              {t('logNewReport')}
            </Button>
          </Link>
        }
      />

      <div className="rounded-2xl border border-border bg-slate-50 px-4 py-4 sm:px-6">
        <p className="text-xs text-text-secondary leading-relaxed">{t('childrenFirstNotice')}</p>
      </div>

      <section className="rounded-2xl border border-border bg-surface">
        <header className="border-b border-border px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-text-primary">{t('tableTitle')}</h2>
            <span className="text-xs text-text-tertiary">
              {t('totalReports', { count: total })}
            </span>
          </div>
        </header>
        {isLoading ? (
          <div className="px-4 py-8 text-sm text-text-tertiary sm:px-6">{t('loading')}</div>
        ) : reports.length === 0 ? (
          <div className="px-4 py-8 sm:px-6">
            <EmptyState title={t('emptyTitle')} description={t('emptyDescription')} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.reference')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.student')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.type')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.severity')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.tuslaRef')}</th>
                  <th className="px-4 py-2 text-start sm:px-6">{t('columns.referredAt')}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-b-0">
                    <td className="px-4 py-3 font-medium text-text-primary sm:px-6">
                      <Link
                        href={`/${locale}/safeguarding/concerns/${r.id}`}
                        className="hover:underline"
                      >
                        {r.concern_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary sm:px-6">
                      {r.student_reference}…
                    </td>
                    <td className="px-4 py-3 text-text-secondary sm:px-6">
                      {t(`concernType.${r.concern_type}` as never, {
                        defaultValue: r.concern_type,
                      })}
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <StatusBadge status={severityStatus(r.severity)}>
                        {t(`severity.${r.severity}` as never, { defaultValue: r.severity })}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-secondary sm:px-6">
                      {r.tusla_reference_number ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary sm:px-6">
                      {r.tusla_referred_at
                        ? new Date(r.tusla_referred_at).toLocaleDateString(locale)
                        : t('pendingReferral')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
