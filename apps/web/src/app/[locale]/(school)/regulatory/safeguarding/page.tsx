'use client';

import {
  AlertTriangle,
  BadgeCheck,
  CalendarCheck2,
  ClipboardList,
  FileText,
  ShieldCheck,
  ShieldQuestion,
  UserCheck,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { HubTile } from '@/components/hub-tile';
import { KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { apiClient, unwrap } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecentTuslaReport {
  id: string;
  concern_number: string;
  severity: string;
  status: string;
  tusla_referred_at: string | null;
  tusla_reference_number: string | null;
}

interface SafeguardingDashboard {
  open_concerns: number;
  pending_tusla_reports: number;
  vetting_expiring_soon: number;
  vetting_overdue: number;
  days_until_annual_review: number | null;
  next_review_due: string | null;
  last_review_date: string | null;
  active_dlp_count: number;
  deputy_dlp_count: number;
  recent_tusla_reports: RecentTuslaReport[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RegulatorySafeguardingPage() {
  const t = useTranslations('regulatory.safeguarding');
  const locale = useLocale();

  const [dashboard, setDashboard] = React.useState<SafeguardingDashboard | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    apiClient<{ data: SafeguardingDashboard } | SafeguardingDashboard>(
      '/api/v1/regulatory/safeguarding/dashboard',
      { silent: true },
    )
      .then((res) => {
        if (!cancelled) setDashboard(unwrap(res));
      })
      .catch((err) => {
        console.error('[RegulatorySafeguardingPage] fetch', err);
        if (!cancelled) setDashboard(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const daysUntilReviewLabel = React.useMemo(() => {
    if (!dashboard) return '—';
    if (dashboard.days_until_annual_review === null) return t('noReviewScheduled');
    return String(dashboard.days_until_annual_review);
  }, [dashboard, t]);

  const reviewAccent = React.useMemo<string>(() => {
    if (!dashboard || dashboard.days_until_annual_review === null) return 'text-text-tertiary';
    if (dashboard.days_until_annual_review < 0) return 'text-danger-600';
    if (dashboard.days_until_annual_review < 30) return 'text-warning-600';
    return 'text-success-700';
  }, [dashboard]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
        actions={
          <Link href={`/${locale}/safeguarding`}>
            <Button variant="outline" className="min-h-[44px]">
              <ShieldCheck className="me-2 h-4 w-4" />
              {t('openSafeguardingModule')}
            </Button>
          </Link>
        }
      />

      {/* ── Context banner ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-slate-50 px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-700">
            <ShieldQuestion className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-text-primary">{t('bannerTitle')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-text-secondary">
              {t('bannerDescription')}
            </p>
          </div>
        </div>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────── */}
      <section aria-label={t('kpi.ariaLabel')} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={AlertTriangle}
          label={t('kpi.openConcerns')}
          value={dashboard?.open_concerns}
          isLoading={isLoading}
          accent={
            dashboard && dashboard.open_concerns > 0 ? 'text-danger-600' : 'text-text-tertiary'
          }
          tooltip={t('kpi.openConcernsTooltip')}
        />
        <KpiTile
          icon={FileText}
          label={t('kpi.pendingTusla')}
          value={dashboard?.pending_tusla_reports}
          isLoading={isLoading}
          accent={
            dashboard && dashboard.pending_tusla_reports > 0
              ? 'text-warning-600'
              : 'text-text-tertiary'
          }
          tooltip={t('kpi.pendingTuslaTooltip')}
        />
        <KpiTile
          icon={UserCheck}
          label={t('kpi.vettingExpiringSoon')}
          value={dashboard?.vetting_expiring_soon}
          isLoading={isLoading}
          accent={
            dashboard && dashboard.vetting_expiring_soon > 0
              ? 'text-warning-600'
              : 'text-text-tertiary'
          }
          tooltip={t('kpi.vettingExpiringSoonTooltip')}
        />
        <KpiTile
          icon={CalendarCheck2}
          label={t('kpi.daysUntilReview')}
          value={daysUntilReviewLabel}
          isLoading={isLoading}
          accent={reviewAccent}
          tooltip={t('kpi.daysUntilReviewTooltip')}
        />
      </section>

      {/* ── Hub tiles ─────────────────────────────────────────────────── */}
      <section
        aria-label={t('tiles.ariaLabel')}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <HubTile
          icon={FileText}
          title={t('tiles.mandatoryReporting.title')}
          description={t('tiles.mandatoryReporting.description')}
          href="/regulatory/safeguarding/mandatory-reporting"
          accent="from-teal-400 to-teal-600"
          iconBg="bg-teal-100 text-teal-700"
          glow="from-teal-400/10"
          count={dashboard?.pending_tusla_reports}
          animationIndex={0}
          moduleKey="safeguarding"
        />
        <HubTile
          icon={BadgeCheck}
          title={t('tiles.staffVetting.title')}
          description={t('tiles.staffVetting.description')}
          href="/regulatory/safeguarding/staff-vetting"
          accent="from-teal-400 to-teal-600"
          iconBg="bg-teal-100 text-teal-700"
          glow="from-teal-400/10"
          count={dashboard?.vetting_expiring_soon}
          animationIndex={1}
        />
        <HubTile
          icon={ClipboardList}
          title={t('tiles.annualReview.title')}
          description={t('tiles.annualReview.description')}
          href="/regulatory/safeguarding/annual-review"
          accent="from-teal-400 to-teal-600"
          iconBg="bg-teal-100 text-teal-700"
          glow="from-teal-400/10"
          animationIndex={2}
        />
        <HubTile
          icon={Users}
          title={t('tiles.dlpRegister.title')}
          description={t('tiles.dlpRegister.description')}
          href="/regulatory/safeguarding/dlp-register"
          accent="from-teal-400 to-teal-600"
          iconBg="bg-teal-100 text-teal-700"
          glow="from-teal-400/10"
          count={dashboard ? dashboard.active_dlp_count + dashboard.deputy_dlp_count : undefined}
          animationIndex={3}
        />
      </section>

      {/* ── Recent Tusla reports ──────────────────────────────────────── */}
      <section
        aria-label={t('recentReports.ariaLabel')}
        className="rounded-2xl border border-border bg-surface"
      >
        <header className="border-b border-border px-4 py-3 sm:px-6">
          <h2 className="text-sm font-semibold text-text-primary">{t('recentReports.title')}</h2>
          <p className="mt-0.5 text-xs text-text-tertiary">{t('recentReports.description')}</p>
        </header>
        {isLoading ? (
          <div className="px-4 py-8 text-sm text-text-tertiary sm:px-6">{t('loading')}</div>
        ) : !dashboard || dashboard.recent_tusla_reports.length === 0 ? (
          <div className="px-4 py-8 text-sm text-text-tertiary sm:px-6">
            {t('recentReports.empty')}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {dashboard.recent_tusla_reports.map((report) => (
              <li key={report.id}>
                <Link
                  href={`/${locale}/safeguarding/concerns/${report.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-secondary sm:px-6"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {report.concern_number}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-text-tertiary">
                      {t(`severity.${report.severity}` as never, {
                        defaultValue: report.severity,
                      })}
                      {report.tusla_reference_number
                        ? ` · ${t('recentReports.tuslaRef')}: ${report.tusla_reference_number}`
                        : ''}
                    </p>
                  </div>
                  {report.tusla_referred_at ? (
                    <time
                      dateTime={report.tusla_referred_at}
                      className="shrink-0 text-xs text-text-tertiary"
                    >
                      {new Date(report.tusla_referred_at).toLocaleDateString(locale)}
                    </time>
                  ) : (
                    <span className="shrink-0 rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-700">
                      {t('recentReports.pending')}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── DLP audit footer ──────────────────────────────────────────── */}
      <div className="rounded-2xl border border-dashed border-border bg-surface px-4 py-3 sm:px-6">
        <p className="text-xs text-text-tertiary">
          {t('audit.dlpCount', {
            active: dashboard?.active_dlp_count ?? 0,
            deputy: dashboard?.deputy_dlp_count ?? 0,
          })}
          {dashboard?.last_review_date
            ? ` · ${t('audit.lastReviewDate', {
                date: new Date(dashboard.last_review_date).toLocaleDateString(locale),
              })}`
            : ''}
        </p>
      </div>
    </div>
  );
}
