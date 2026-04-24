'use client';

import {
  Archive,
  BookLock,
  Database,
  FileText,
  Lock,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { RegulatoryGdprDashboard } from '@school/shared/regulatory';
import { StatusBadge } from '@school/ui';

import { HubTile } from '@/components/hub-tile';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { apiClient, unwrap } from '@/lib/api-client';
import { fmtLocale } from '@/lib/i18n-format';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusVariantMap: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger'> = {
  submitted: 'neutral',
  classified: 'info',
  approved: 'warning',
  completed: 'success',
  rejected: 'danger',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegulatoryGdprPage() {
  const t = useTranslations('regulatory.gdpr');
  const locale = useLocale();

  const [dashboard, setDashboard] = React.useState<RegulatoryGdprDashboard | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiClient<{ data: RegulatoryGdprDashboard } | RegulatoryGdprDashboard>(
      '/api/v1/regulatory/gdpr/dashboard',
      { silent: true },
    )
      .then((res) => {
        if (!cancelled) setDashboard(unwrap(res));
      })
      .catch((err) => {
        console.error('[RegulatoryGdprPage] fetch', err);
        if (!cancelled) setDashboard(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const privacyNoticeLabel = React.useMemo(() => {
    if (!dashboard) return '—';
    if (dashboard.active_privacy_notice_version === null) return t('kpi.privacyNoticeNone');
    return t('kpi.privacyNoticeValue', { version: dashboard.active_privacy_notice_version });
  }, [dashboard, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
      />

      {/* ── Context banner ──────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700">
            <Lock className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary">{t('bannerTitle')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {t('bannerDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <section aria-label={t('kpi.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={FileText}
          label={t('kpi.openDsars')}
          value={dashboard?.open_dsar_count}
          isLoading={isLoading}
          accent={
            dashboard && dashboard.open_dsar_count > 0 ? 'text-warning-600' : 'text-text-tertiary'
          }
          tooltip={t('kpi.openDsarsTooltip')}
        />
        <KpiTile
          icon={ShieldAlert}
          label={t('kpi.overdueDsars')}
          value={dashboard?.overdue_dsar_count}
          isLoading={isLoading}
          accent={
            dashboard && dashboard.overdue_dsar_count > 0 ? 'text-danger-600' : 'text-text-tertiary'
          }
          tooltip={t('kpi.overdueDsarsTooltip')}
        />
        <KpiTile
          icon={BookLock}
          label={t('kpi.privacyNotice')}
          value={privacyNoticeLabel}
          isLoading={isLoading}
          accent={
            dashboard && dashboard.active_privacy_notice_version !== null
              ? 'text-success-700'
              : 'text-text-tertiary'
          }
          tooltip={t('kpi.privacyNoticeTooltip')}
        />
        <KpiTile
          icon={Archive}
          label={t('kpi.itemsPastRetention')}
          value={dashboard?.data_items_past_retention_count}
          isLoading={isLoading}
          accent={
            dashboard && dashboard.data_items_past_retention_count > 0
              ? 'text-danger-600'
              : 'text-text-tertiary'
          }
          tooltip={t('kpi.itemsPastRetentionTooltip')}
        />
      </section>

      {/* ── Hub tiles ───────────────────────────────────────────────────── */}
      <section
        aria-label={t('tiles.ariaLabel')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <HubTile
          icon={FileText}
          title={t('tiles.dsar.title')}
          description={t('tiles.dsar.description')}
          href="/regulatory/gdpr/dsar"
          accent="from-teal-400 to-teal-600"
          iconBg="bg-teal-100 text-teal-700"
          glow="from-teal-400/10"
          count={dashboard?.open_dsar_count}
          animationIndex={0}
        />
        <HubTile
          icon={BookLock}
          title={t('tiles.privacyNotices.title')}
          description={t('tiles.privacyNotices.description')}
          href="/regulatory/gdpr/privacy-notices"
          accent="from-teal-400 to-teal-600"
          iconBg="bg-teal-100 text-teal-700"
          glow="from-teal-400/10"
          animationIndex={1}
        />
        <HubTile
          icon={Database}
          title={t('tiles.dataRetention.title')}
          description={t('tiles.dataRetention.description')}
          href="/regulatory/gdpr/data-retention"
          accent="from-teal-400 to-teal-600"
          iconBg="bg-teal-100 text-teal-700"
          glow="from-teal-400/10"
          count={dashboard?.data_items_past_retention_count}
          animationIndex={2}
        />
        <HubTile
          icon={ScrollText}
          title={t('tiles.dpaPolicy.title')}
          description={t('tiles.dpaPolicy.description')}
          href="/regulatory/gdpr/dpa-policy"
          accent="from-teal-400 to-teal-600"
          iconBg="bg-teal-100 text-teal-700"
          glow="from-teal-400/10"
          animationIndex={3}
        />
      </section>

      {/* ── Recent DSAR activity ────────────────────────────────────────── */}
      <section
        aria-label={t('recentActivity.ariaLabel')}
        className="rounded-2xl border border-border bg-surface"
      >
        <header className="border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-text-primary">{t('recentActivity.title')}</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">{t('recentActivity.description')}</p>
        </header>
        {isLoading ? (
          <div className="px-4 py-8 text-sm text-text-tertiary sm:px-6">{t('loading')}</div>
        ) : !dashboard || dashboard.recent_dsar_activity.length === 0 ? (
          <div className="px-4 py-8 text-sm text-text-tertiary sm:px-6">
            {t('recentActivity.empty')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {dashboard.recent_dsar_activity.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/${locale}/regulatory/gdpr/dsar`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-secondary sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {t(`requestType.${row.request_type}` as never, {
                        defaultValue: row.request_type.replace(/_/g, ' '),
                      })}
                      {' · '}
                      <span className="text-text-secondary">
                        {t(`subjectType.${row.subject_type}` as never, {
                          defaultValue: row.subject_type,
                        })}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-text-tertiary">
                      {row.subject_reference}…
                    </p>
                  </div>
                  <StatusBadge status={statusVariantMap[row.status] ?? 'neutral'} dot>
                    {t(`status.${row.status}` as never, { defaultValue: row.status })}
                  </StatusBadge>
                  <time dateTime={row.created_at} className="shrink-0 text-xs text-text-tertiary">
                    {new Date(row.created_at).toLocaleDateString(fmtLocale(locale))}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── DPA audit footer ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-3 text-xs text-text-secondary">
          <ShieldCheck className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span>{t('auditFooter.prefix')}</span>
          {dashboard?.active_dpa_accepted ? (
            <StatusBadge status="success" dot>
              {t('auditFooter.dpaAccepted', {
                version: dashboard.active_dpa_version ?? '—',
              })}
            </StatusBadge>
          ) : (
            <StatusBadge status="warning" dot>
              {t('auditFooter.dpaPending')}
            </StatusBadge>
          )}
        </div>
      </div>
    </div>
  );
}
