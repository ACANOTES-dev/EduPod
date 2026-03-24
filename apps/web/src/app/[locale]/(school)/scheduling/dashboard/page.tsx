'use client';

import { Badge, Button } from '@school/ui';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Loader2,
  Pin,
  Sparkles,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardOverview {
  total_classes: number;
  configured_classes: number;
  scheduled_classes: number;
  pinned_entries: number;
  active_run: boolean;
  latest_run: {
    id: string;
    status: string;
    mode: string;
    entries_generated: number | null;
    entries_pinned: number | null;
    entries_unassigned: number | null;
    created_at: string;
    applied_at: string | null;
  } | null;
}

// ─── KPI Card ──────────────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
}

function KpiCard({ label, value, icon, highlight }: KpiCardProps) {
  return (
    <div
      className={`rounded-xl border p-5 ${
        highlight
          ? 'border-brand/40 bg-brand/5'
          : 'border-border bg-surface'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-text-tertiary uppercase tracking-wide">{label}</p>
          <p className="mt-1 text-2xl font-bold text-text-primary">{value}</p>
        </div>
        <div className="text-text-tertiary">{icon}</div>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulingDashboardPage() {
  const t = useTranslations('scheduling.auto');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [overview, setOverview] = React.useState<DashboardOverview | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    // Load academic years first, then use the first one for dashboard queries
    apiClient<{ data: Array<{ id: string; name: string }> }>('/api/v1/academic-years?pageSize=20')
      .then((yearsRes) => {
        const yearId = yearsRes.data?.[0]?.id;
        if (!yearId) {
          setLoading(false);
          return;
        }
        return apiClient<DashboardOverview>(`/api/v1/scheduling-dashboard/overview?academic_year_id=${yearId}`, { silent: true })
          .then((ov) => setOverview(ov));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  function statusBadgeVariant(status: string): 'default' | 'secondary' | 'danger' {
    if (status === 'completed' || status === 'applied') return 'default';
    if (status === 'failed') return 'danger';
    return 'secondary';
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard')}
        actions={
          <Button onClick={() => router.push(`/${locale}/scheduling/auto`)} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            {t('generateTimetable')}
          </Button>
        }
      />

      {/* KPI cards */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : overview ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard label={t('totalSlots')} value={overview.total_classes} icon={<BookOpen className="h-5 w-5" />} />
          <KpiCard label={t('configured')} value={overview.configured_classes} icon={<CheckCircle2 className="h-5 w-5" />} />
          <KpiCard label={t('assignedSlots')} value={overview.scheduled_classes} icon={<Sparkles className="h-5 w-5" />} highlight />
          <KpiCard label={t('pinnedSlots')} value={overview.pinned_entries} icon={<Pin className="h-5 w-5" />} />
          <KpiCard label={t('completionPct')} value={overview.total_classes > 0 ? `${Math.round((overview.scheduled_classes / overview.total_classes) * 100)}%` : '0%'} icon={<BarChart3 className="h-5 w-5" />} highlight />
        </div>
      ) : null}

      {/* Latest run card */}
      {overview?.latest_run && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-text-tertiary" />
              <div>
                <p className="text-sm font-medium text-text-primary">{t('lastRun')}</p>
                <p className="text-xs text-text-tertiary">
                  {new Date(overview.latest_run.created_at).toLocaleString()} &middot;{' '}
                  <Badge variant={statusBadgeVariant(overview.latest_run.status)} className="text-[10px]">
                    {overview.latest_run.status}
                  </Badge>
                </p>
              </div>
            </div>
            {overview.latest_run.status === 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/${locale}/scheduling/runs/${overview.latest_run!.id}/review`)}
              >
                {t('viewReview')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Quick status info */}
      {overview && (
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-2">
          <h2 className="text-base font-semibold text-text-primary">{t('schedulingStatus')}</h2>
          <p className="text-sm text-text-secondary">
            Use the sidebar to configure scheduling: set up the period grid, curriculum requirements,
            teacher competencies, and more. Once all prerequisites are met, use the Auto Scheduler to generate timetables.
          </p>
        </div>
      )}
    </div>
  );
}
