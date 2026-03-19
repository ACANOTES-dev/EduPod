'use client';

import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  DoorClosed,
  Loader2,
  Pin,
  Sparkles,
  UserCog,
  Users,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardOverview {
  total_slots: number;
  assigned_slots: number;
  pinned_slots: number;
  auto_slots: number;
  manual_slots: number;
  unassigned_slots: number;
  completion_pct: number;
  last_run_at?: string;
  is_stale: boolean;
}

interface SchedulingRun {
  id: string;
  status: string;
  mode: string;
  created_at: string;
  completed_at?: string;
  assigned_count?: number;
  pinned_count?: number;
  unassigned_count?: number;
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

// ─── Config Nav Card ──────────────────────────────────────────────────────────

interface NavCardProps {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

function NavCard({ href, icon, title, description }: NavCardProps) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-surface p-5 transition-all hover:border-primary/40 hover:shadow-sm group"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-surface-secondary p-2 text-text-tertiary group-hover:text-primary transition-colors">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors">{title}</h3>
          <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
        </div>
      </div>
    </Link>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SchedulingDashboardPage() {
  const t = useTranslations('scheduling.auto');
  const tv = useTranslations('scheduling.v2');
  const ts = useTranslations('scheduling');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  const [overview, setOverview] = React.useState<DashboardOverview | null>(null);
  const [latestRun, setLatestRun] = React.useState<SchedulingRun | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      apiClient<DashboardOverview>('/api/v1/scheduling-dashboard/overview'),
      apiClient<{ data: SchedulingRun[] }>('/api/v1/scheduling-runs?page=1&pageSize=1'),
    ]).then(([ov, runsRes]) => {
      if (ov.status === 'fulfilled') setOverview(ov.value);
      if (runsRes.status === 'fulfilled' && runsRes.value.data?.[0]) {
        setLatestRun(runsRes.value.data[0]);
      }
    }).finally(() => setLoading(false));
  }, []);

  function statusBadgeVariant(status: string): 'default' | 'secondary' | 'danger' {
    if (status === 'completed' || status === 'applied') return 'default';
    if (status === 'failed') return 'danger';
    return 'secondary';
  }

  const configCards = [
    { key: 'periodGrid', href: `/${locale}/scheduling/period-grid`, icon: <Calendar className="h-5 w-5" />, title: ts('auto.periodGrid'), desc: tv('periodGridDescV2') },
    { key: 'curriculum', href: `/${locale}/scheduling/curriculum`, icon: <BookOpen className="h-5 w-5" />, title: tv('curriculum'), desc: tv('curriculumDesc') },
    { key: 'competencies', href: `/${locale}/scheduling/competencies`, icon: <Users className="h-5 w-5" />, title: tv('competencies'), desc: tv('competenciesDesc') },
    { key: 'breakGroups', href: `/${locale}/scheduling/break-groups`, icon: <Clock className="h-5 w-5" />, title: tv('breakGroups'), desc: tv('breakGroupsDesc') },
    { key: 'teacherConfig', href: `/${locale}/scheduling/teacher-config`, icon: <UserCog className="h-5 w-5" />, title: tv('teacherConfig'), desc: tv('teacherConfigDesc') },
    { key: 'roomClosures', href: `/${locale}/scheduling/room-closures`, icon: <DoorClosed className="h-5 w-5" />, title: tv('roomClosures'), desc: tv('roomClosuresDesc') },
  ];

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

      {/* Stale warning */}
      {overview?.is_stale && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-300">{t('staleWarning')}</span>
        </div>
      )}

      {/* KPI cards */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      ) : overview ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard label={t('totalSlots')} value={overview.total_slots} icon={<BookOpen className="h-5 w-5" />} />
          <KpiCard label={t('assignedSlots')} value={overview.assigned_slots} icon={<CheckCircle2 className="h-5 w-5" />} highlight />
          <KpiCard label={t('pinnedSlots')} value={overview.pinned_slots} icon={<Pin className="h-5 w-5" />} />
          <KpiCard label={t('autoSlots')} value={overview.auto_slots} icon={<Sparkles className="h-5 w-5" />} />
          <KpiCard label={t('unassignedSlots')} value={overview.unassigned_slots} icon={<XCircle className="h-5 w-5" />} />
          <KpiCard label={t('completionPct')} value={`${overview.completion_pct}%`} icon={<BarChart3 className="h-5 w-5" />} highlight />
        </div>
      ) : null}

      {/* Latest run card */}
      {latestRun && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-text-tertiary" />
              <div>
                <p className="text-sm font-medium text-text-primary">{t('lastRun')}</p>
                <p className="text-xs text-text-tertiary">
                  {new Date(latestRun.created_at).toLocaleString()} &middot;{' '}
                  <Badge variant={statusBadgeVariant(latestRun.status)} className="text-[10px]">
                    {latestRun.status}
                  </Badge>
                </p>
              </div>
            </div>
            {latestRun.status === 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/${locale}/scheduling/runs/${latestRun.id}/review`)}
              >
                {t('viewReview')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Configuration cards grid */}
      <div>
        <h2 className="text-base font-semibold text-text-primary mb-3">Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {configCards.map((card) => (
            <NavCard
              key={card.key}
              href={card.href}
              icon={card.icon}
              title={card.title}
              description={card.desc}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
