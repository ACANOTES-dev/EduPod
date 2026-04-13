'use client';

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  DoorClosed,
  FileBarChart2,
  FlaskConical,
  GitBranch,
  Heart,
  History,
  Loader2,
  MonitorPlay,
  Pin,
  ShieldCheck,
  Sparkles,
  UserCog,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardOverview {
  total_classes: number;
  configured_classes: number;
  scheduled_classes: number;
  pinned_entries: number;
  active_run: boolean;
  room_utilisation_pct: number | null;
  teacher_utilisation_pct: number | null;
  avg_gaps: number | null;
  preference_score: number | null;
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

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon: Icon,
  href,
  gradient,
  accent,
  glow,
  subtitle,
}: {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
  href: string;
  gradient: string;
  accent: string;
  glow: string;
  subtitle?: string;
}) {
  const locale = (usePathname() ?? '').split('/').filter(Boolean)[0] ?? 'en';
  return (
    <Link
      href={`/${locale}${href}`}
      className="group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-strong hover:shadow-md"
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${gradient}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${glow} to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div className="relative flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {label}
          </p>
          <div className="mt-1 text-[28px] font-bold leading-tight tracking-tight text-text-primary">
            {value}
          </div>
          {subtitle && <p className="mt-1 text-xs text-text-secondary">{subtitle}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div
        className={`absolute bottom-0 end-0 start-0 h-1 origin-start scale-x-0 bg-gradient-to-r ${gradient} transition-transform group-hover:scale-x-100`}
      />
    </Link>
  );
}

// ─── Quick Action ─────────────────────────────────────────────────────────────

function QuickAction({
  label,
  icon: Icon,
  href,
  accent,
}: {
  label: string;
  icon: LucideIcon;
  href: string;
  accent: string;
}) {
  const locale = (usePathname() ?? '').split('/').filter(Boolean)[0] ?? 'en';
  return (
    <Link
      href={`/${locale}${href}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-strong hover:shadow-sm"
    >
      <div className={`shrink-0 rounded-lg p-2 ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="flex-1 text-sm font-medium text-text-primary">{label}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
    </Link>
  );
}

// ─── Module Tile ──────────────────────────────────────────────────────────────

interface ModuleItem {
  labelKey: string;
  descKey: string;
  href: string;
  icon: LucideIcon;
}

interface ModuleCategory {
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  items: ModuleItem[];
}

function ModuleTile({
  item,
  locale,
  t,
}: {
  item: ModuleItem;
  locale: string;
  t: (key: string) => string;
}) {
  return (
    <Link
      href={`/${locale}${item.href}`}
      className="group flex items-start gap-3.5 rounded-xl border border-border bg-surface p-4 transition-all hover:border-border-strong hover:shadow-sm"
    >
      <div className="shrink-0 rounded-lg bg-surface-secondary p-2 transition-colors group-hover:bg-primary/10">
        <item.icon className="h-4 w-4 text-text-secondary transition-colors group-hover:text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary">{t(item.labelKey)}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{t(item.descKey)}</p>
      </div>
      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
    </Link>
  );
}

function CategorySection({
  category,
  locale,
  t,
}: {
  category: ModuleCategory;
  locale: string;
  t: (key: string) => string;
}) {
  const Icon = category.icon;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${category.accent}`}
      />
      <div className="flex items-start gap-4 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ring-black/5 ${category.iconBg}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-text-primary">
            {t(category.titleKey)}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-text-tertiary">{t(category.descKey)}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 px-5 pb-5 pt-3 sm:grid-cols-2 sm:px-6 sm:pb-6">
        {category.items.map((item) => (
          <ModuleTile key={item.href} item={item} locale={locale} t={t} />
        ))}
      </div>
    </div>
  );
}

// ─── Category definitions ────────────────────────────────────────────────────

const CATEGORIES: ModuleCategory[] = [
  {
    titleKey: 'hub.structure',
    descKey: 'hub.structureDesc',
    icon: Calendar,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    items: [
      {
        labelKey: 'auto.periodGrid',
        descKey: 'hub.periodGridDesc',
        href: '/scheduling/period-grid',
        icon: Calendar,
      },
      {
        labelKey: 'v2.curriculum',
        descKey: 'hub.curriculumDesc',
        href: '/scheduling/curriculum',
        icon: BookOpen,
      },
      {
        labelKey: 'v2.breakGroups',
        descKey: 'hub.breakGroupsDesc',
        href: '/scheduling/break-groups',
        icon: Clock,
      },
      {
        labelKey: 'v2.roomClosures',
        descKey: 'hub.roomClosuresDesc',
        href: '/scheduling/room-closures',
        icon: DoorClosed,
      },
    ],
  },
  {
    titleKey: 'hub.staff',
    descKey: 'hub.staffDesc',
    icon: Users,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    items: [
      {
        labelKey: 'v2.competencies',
        descKey: 'hub.competenciesDesc',
        href: '/scheduling/competencies',
        icon: Users,
      },
      {
        labelKey: 'v2.coverageNav',
        descKey: 'hub.coverageDesc',
        href: '/scheduling/competency-coverage',
        icon: ShieldCheck,
      },
      {
        labelKey: 'v2.teacherConfig',
        descKey: 'hub.teacherConfigDesc',
        href: '/scheduling/teacher-config',
        icon: UserCog,
      },
      {
        labelKey: 'auto.requirements',
        descKey: 'hub.requirementsDesc',
        href: '/scheduling/requirements',
        icon: ClipboardList,
      },
    ],
  },
  {
    titleKey: 'hub.inputs',
    descKey: 'hub.inputsDesc',
    icon: Heart,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    items: [
      {
        labelKey: 'auto.availability',
        descKey: 'hub.availabilityDesc',
        href: '/scheduling/availability',
        icon: Clock,
      },
      {
        labelKey: 'auto.preferences',
        descKey: 'hub.preferencesDesc',
        href: '/scheduling/preferences',
        icon: Heart,
      },
    ],
  },
  {
    titleKey: 'hub.generate',
    descKey: 'hub.generateDesc',
    icon: Sparkles,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    items: [
      {
        labelKey: 'auto.autoScheduler',
        descKey: 'hub.autoSchedulerDesc',
        href: '/scheduling/auto',
        icon: Sparkles,
      },
      {
        labelKey: 'runs.title',
        descKey: 'hub.runsDesc',
        href: '/scheduling/runs',
        icon: History,
      },
      {
        labelKey: 'scenarios.navTitle',
        descKey: 'hub.scenariosDesc',
        href: '/scheduling/scenarios',
        icon: GitBranch,
      },
    ],
  },
  {
    titleKey: 'hub.operations',
    descKey: 'hub.operationsDesc',
    icon: MonitorPlay,
    accent: 'from-indigo-400 via-indigo-500 to-indigo-600',
    iconBg: 'bg-indigo-100 text-indigo-700',
    items: [
      {
        labelKey: 'substitutions.navTitle',
        descKey: 'hub.substitutionsDesc',
        href: '/scheduling/substitutions',
        icon: UserX,
      },
      {
        labelKey: 'board.navTitle',
        descKey: 'hub.boardDesc',
        href: '/scheduling/substitution-board',
        icon: MonitorPlay,
      },
      {
        labelKey: 'myTimetable.navTitle',
        descKey: 'hub.myTimetableDesc',
        href: '/scheduling/my-timetable',
        icon: Calendar,
      },
      {
        labelKey: 'exams.navTitle',
        descKey: 'hub.examsDesc',
        href: '/scheduling/exams',
        icon: FlaskConical,
      },
    ],
  },
  {
    titleKey: 'hub.analytics',
    descKey: 'hub.analyticsDesc',
    icon: BarChart3,
    accent: 'from-rose-400 via-rose-500 to-rose-600',
    iconBg: 'bg-rose-100 text-rose-700',
    items: [
      {
        labelKey: 'hub.analyticsDashboard',
        descKey: 'hub.analyticsDashboardDesc',
        href: '/scheduling/dashboard',
        icon: BarChart3,
      },
      {
        labelKey: 'coverReports.navTitle',
        descKey: 'hub.coverReportsDesc',
        href: '/scheduling/cover-reports',
        icon: FileBarChart2,
      },
    ],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulingHubPage() {
  const t = useTranslations('scheduling');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [overview, setOverview] = React.useState<DashboardOverview | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    apiClient<{ data: Array<{ id: string; name: string }> }>('/api/v1/academic-years?pageSize=20')
      .then((yearsRes) => {
        const yearId = yearsRes.data?.[0]?.id;
        if (!yearId) {
          setLoading(false);
          return;
        }
        return apiClient<DashboardOverview>(
          `/api/v1/scheduling-dashboard/overview?academic_year_id=${yearId}`,
          { silent: true },
        )
          .then((ov) => setOverview(ov))
          .finally(() => setLoading(false));
      })
      .catch((err) => {
        console.error('[SchedulingHubPage]', err);
        setLoading(false);
      });
  }, []);

  const totalClasses = overview?.total_classes ?? 0;
  const scheduledClasses = overview?.scheduled_classes ?? 0;
  const configuredClasses = overview?.configured_classes ?? 0;
  const pinnedEntries = overview?.pinned_entries ?? 0;
  const completionPct = totalClasses > 0 ? Math.round((scheduledClasses / totalClasses) * 100) : 0;

  function statusBadgeVariant(status: string): 'default' | 'secondary' | 'danger' {
    if (status === 'completed' || status === 'applied') return 'default';
    if (status === 'failed') return 'danger';
    return 'secondary';
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader
        title={t('hub.title')}
        description={t('hub.description')}
        actions={
          <Button onClick={() => router.push(`/${locale}/scheduling/auto`)} className="gap-1.5">
            <Sparkles className="h-4 w-4" />
            {t('auto.generateTimetable')}
          </Button>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t('auto.totalSlots')}
          value={loading ? '…' : totalClasses}
          icon={BookOpen}
          href="/scheduling/curriculum"
          gradient="from-primary/60 to-primary"
          accent="bg-primary/10 text-primary"
          glow="from-primary/5"
          subtitle={
            overview && totalClasses > 0
              ? `${configuredClasses} ${t('hub.configuredLabel')}`
              : undefined
          }
        />
        <KpiCard
          label={t('auto.completionPct')}
          value={loading ? '…' : `${completionPct}%`}
          icon={CheckCircle2}
          href="/scheduling/dashboard"
          gradient="from-emerald-400 to-emerald-600"
          accent="bg-emerald-100 text-emerald-700"
          glow="from-emerald-400/10"
          subtitle={
            overview && totalClasses > 0
              ? `${scheduledClasses} / ${totalClasses} ${t('hub.slotsLabel')}`
              : undefined
          }
        />
        <KpiCard
          label={t('auto.pinnedSlots')}
          value={loading ? '…' : pinnedEntries}
          icon={Pin}
          href="/scheduling/runs"
          gradient="from-amber-400 to-amber-600"
          accent="bg-amber-100 text-amber-700"
          glow="from-amber-400/10"
          subtitle={t('hub.pinnedSubtitle')}
        />
        <KpiCard
          label={t('hub.latestRun')}
          value={
            loading
              ? '…'
              : overview?.latest_run
                ? t(`hub.runStatus.${overview.latest_run.status}`)
                : t('hub.noRunYet')
          }
          icon={Sparkles}
          href={
            overview?.latest_run
              ? `/scheduling/runs/${overview.latest_run.id}/review`
              : '/scheduling/auto'
          }
          gradient="from-violet-400 to-violet-600"
          accent="bg-violet-100 text-violet-700"
          glow="from-violet-400/10"
          subtitle={
            overview?.latest_run
              ? new Date(overview.latest_run.created_at).toLocaleDateString()
              : t('hub.noRunSubtitle')
          }
        />
      </div>

      {/* Latest run detail strip */}
      {overview?.latest_run && (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-400 via-violet-500 to-violet-600" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="shrink-0 rounded-xl bg-violet-100 p-2.5 text-violet-700 shadow-sm ring-1 ring-inset ring-black/5">
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Sparkles className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-text-primary">{t('hub.latestRun')}</p>
                  <Badge
                    variant={statusBadgeVariant(overview.latest_run.status)}
                    className="text-[10px]"
                  >
                    {t(`hub.runStatus.${overview.latest_run.status}`)}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {t(`hub.runMode.${overview.latest_run.mode}`)}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-text-tertiary">
                  {new Date(overview.latest_run.created_at).toLocaleString()} ·{' '}
                  {overview.latest_run.entries_generated ?? 0} {t('hub.generated')}
                  {overview.latest_run.entries_unassigned
                    ? ` · ${overview.latest_run.entries_unassigned} ${t('hub.unassigned')}`
                    : ''}
                </p>
              </div>
            </div>
            {overview.latest_run.status === 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  router.push(`/${locale}/scheduling/runs/${overview.latest_run!.id}/review`)
                }
                className="gap-1.5"
              >
                {t('auto.viewReview')}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
          {t('hub.quickActions')}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickAction
            label={t('auto.autoScheduler')}
            icon={Sparkles}
            href="/scheduling/auto"
            accent="bg-violet-100 text-violet-700"
          />
          <QuickAction
            label={t('myTimetable.navTitle')}
            icon={Calendar}
            href="/scheduling/my-timetable"
            accent="bg-emerald-100 text-emerald-700"
          />
          <QuickAction
            label={t('substitutions.navTitle')}
            icon={UserX}
            href="/scheduling/substitutions"
            accent="bg-indigo-100 text-indigo-700"
          />
          <QuickAction
            label={t('board.navTitle')}
            icon={MonitorPlay}
            href="/scheduling/substitution-board"
            accent="bg-sky-100 text-sky-700"
          />
        </div>
      </div>

      {/* Categories */}
      <div>
        <h2 className="mb-5 text-base font-semibold tracking-tight text-text-primary">
          {t('hub.modulesHeading')}
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {CATEGORIES.map((category) => (
            <CategorySection key={category.titleKey} category={category} locale={locale} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
