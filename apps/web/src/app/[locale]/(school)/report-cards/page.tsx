'use client';

import {
  FileText,
  GraduationCap,
  Inbox,
  Library,
  MessageSquare,
  Settings,
  Sparkles,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { translateYearGroupName } from '@/lib/year-group-name';

import {
  AnalyticsSnapshotPanel,
  LiveRunStatusPanel,
  QuickActionTile,
} from './_components/dashboard-panels';
import type { AnalyticsSummary, GenerationRunRow } from './_components/dashboard-panels';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListResponse<T> {
  data: T[];
  meta?: { total?: number };
}

interface YearGroup {
  id: string;
  name: string;
  display_order: number;
}

interface ClassRecord {
  id: string;
  name: string;
  year_group?: { id: string; name: string } | null;
  _count?: { class_enrolments: number };
}

interface AcademicPeriodOption {
  id: string;
  name: string;
  status?: string;
}

interface ClassCard {
  class_id: string;
  class_name: string;
  student_count: number;
  year_group_id: string | null;
  year_group_name: string;
  year_group_order: number;
}

interface GroupedCards {
  year_group_id: string | null;
  year_group_name: string;
  year_group_order: number;
  cards: ClassCard[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTIVE_RUN_STATUSES: ReadonlyArray<GenerationRunRow['status']> = ['queued', 'processing'];
const POLL_INTERVAL_MS = 5000;

// Sentinel period id that represents "Full Year" report cards — the
// generation wizard, library, and analytics endpoints all accept this
// literal to scope to rows where `academic_period_id IS NULL` (Phase 1b —
// Option B). Kept at the module level so the state type stays `string`.
const FULL_YEAR_PERIOD_ID = 'full_year';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardsDashboardPage() {
  const t = useTranslations('reportCards');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const tYearGroups = useTranslations('reportComments.yearGroupLabels');
  const translateYearGroup = React.useCallback(
    (name: string) =>
      translateYearGroupName(name, (key, fallback) => {
        try {
          return tYearGroups(key);
        } catch {
          return fallback;
        }
      }),
    [tYearGroups],
  );
  // B11: teachers see a reduced dashboard — no Generate / Requests /
  // Live run / Settings entry points. Admin-only affordances are hidden
  // rather than disabled, so the page looks coherent for both audiences.
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal', 'admin');

  // ─── Period state ──────────────────────────────────────────────────────────
  const [periods, setPeriods] = React.useState<AcademicPeriodOption[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<string | null>(null);

  // ─── Quick-action counts ──────────────────────────────────────────────────
  const [libraryCount, setLibraryCount] = React.useState<number | null>(null);
  const [pendingRequestCount, setPendingRequestCount] = React.useState<number>(0);

  // ─── Analytics snapshot ────────────────────────────────────────────────────
  const [analytics, setAnalytics] = React.useState<AnalyticsSummary | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = React.useState(false);

  // ─── Active run polling ────────────────────────────────────────────────────
  const [activeRun, setActiveRun] = React.useState<GenerationRunRow | null>(null);

  // ─── Classes-by-year-group section ─────────────────────────────────────────
  const [grouped, setGrouped] = React.useState<GroupedCards[]>([]);
  const [classesLoading, setClassesLoading] = React.useState(true);

  // ─── Initial data: periods, classes, library count, pending requests ─────
  React.useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setClassesLoading(true);
      try {
        // Fetch core data in parallel. For teachers, also fetch the landing
        // scope so we can filter the class grid to taught classes only.
        const [periodsRes, yearGroupsRes, classesRes, libraryRes, pendingRes, landingRes] =
          await Promise.all([
            apiClient<ListResponse<AcademicPeriodOption>>('/api/v1/academic-periods?pageSize=50'),
            apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
            apiClient<ListResponse<ClassRecord>>('/api/v1/classes?pageSize=100'),
            apiClient<ListResponse<unknown>>('/api/v1/report-cards/library?page=1&pageSize=1', {
              silent: true,
            }),
            apiClient<ListResponse<unknown>>(
              '/api/v1/report-card-teacher-requests?status=pending&page=1&pageSize=1',
              { silent: true },
            ),
            // Landing scope: returns the teacher's allowed class/subject pairs
            !isAdmin
              ? apiClient<{
                  is_admin: boolean;
                  overall_class_ids: string[];
                  subject_assignments: Array<{ class_id: string; subject_id: string }>;
                }>('/api/v1/report-comment-windows/landing', { silent: true }).catch(() => null)
              : Promise.resolve(null),
          ]);

        if (cancelled) return;

        // Periods — default to the first `active` one if present.
        const periodList = periodsRes.data ?? [];
        setPeriods(periodList);
        const activePeriod = periodList.find((p) => p.status === 'active') ?? periodList[0] ?? null;
        setSelectedPeriodId(activePeriod?.id ?? null);

        // Library count (meta.total preferred)
        setLibraryCount(libraryRes.meta?.total ?? libraryRes.data?.length ?? 0);

        // Pending teacher requests
        setPendingRequestCount(pendingRes.meta?.total ?? pendingRes.data?.length ?? 0);

        // For teachers, build the set of allowed class IDs from the landing scope
        let allowedClassIds: Set<string> | null = null;
        if (!isAdmin && landingRes) {
          allowedClassIds = new Set<string>([
            ...landingRes.overall_class_ids,
            ...landingRes.subject_assignments.map((a) => a.class_id),
          ]);
        }

        // Classes grouped by year group (same logic as the old landing page)
        const yearGroupInfo = new Map<string, { name: string; order: number }>();
        for (const yg of yearGroupsRes.data ?? []) {
          yearGroupInfo.set(yg.id, { name: yg.name, order: yg.display_order ?? 0 });
        }

        const cards: ClassCard[] = [];
        for (const cls of classesRes.data ?? []) {
          const studentCount = cls._count?.class_enrolments ?? 0;
          if (studentCount === 0) continue;
          // Teacher scoping: only include classes the teacher is assigned to
          if (allowedClassIds && !allowedClassIds.has(cls.id)) continue;
          const ygId = cls.year_group?.id ?? null;
          const ygInfo = ygId ? yearGroupInfo.get(ygId) : null;
          cards.push({
            class_id: cls.id,
            class_name: cls.name,
            student_count: studentCount,
            year_group_id: ygId,
            year_group_name: cls.year_group?.name ?? 'Unassigned',
            year_group_order: ygInfo?.order ?? 999,
          });
        }

        const groupMap = new Map<string, GroupedCards>();
        for (const card of cards) {
          const key = card.year_group_id ?? '__unassigned';
          const existing = groupMap.get(key);
          if (existing) {
            existing.cards.push(card);
          } else {
            groupMap.set(key, {
              year_group_id: card.year_group_id,
              year_group_name: card.year_group_name,
              year_group_order: card.year_group_order,
              cards: [card],
            });
          }
        }

        const sortedGroups = Array.from(groupMap.values())
          .sort((a, b) => a.year_group_order - b.year_group_order)
          .map((g) => ({
            ...g,
            cards: g.cards.slice().sort((a, b) => a.class_name.localeCompare(b.class_name)),
          }));

        setGrouped(sortedGroups);
      } catch (err) {
        console.error('[ReportCardsDashboard.loadInitial]', err);
        if (!cancelled) setGrouped([]);
      } finally {
        if (!cancelled) setClassesLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isAdmin is stable after auth loads
  }, [isAdmin]);

  // ─── Analytics snapshot (re-fetch when period changes) ────────────────────
  React.useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      setAnalyticsLoading(true);
      try {
        const qs = selectedPeriodId ? `?academic_period_id=${selectedPeriodId}` : '';
        const res = await apiClient<{ data: AnalyticsSummary }>(
          `/api/v1/report-cards/analytics/dashboard${qs}`,
          { silent: true },
        );
        if (cancelled) return;
        setAnalytics(res.data);
      } catch (err) {
        console.error('[ReportCardsDashboard.loadAnalytics]', err);
        if (!cancelled) setAnalytics(null);
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    }

    void loadAnalytics();
    return () => {
      cancelled = true;
    };
  }, [selectedPeriodId]);

  // ─── Active run polling ────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function pollRuns() {
      try {
        const res = await apiClient<ListResponse<GenerationRunRow>>(
          '/api/v1/report-cards/generation-runs?page=1&pageSize=5',
          { silent: true },
        );
        if (cancelled) return;
        const active =
          (res.data ?? []).find((run) => ACTIVE_RUN_STATUSES.includes(run.status)) ?? null;
        setActiveRun(active);
        if (active) {
          timer = setTimeout(pollRuns, POLL_INTERVAL_MS);
        }
      } catch (err) {
        console.error('[ReportCardsDashboard.pollRuns]', err);
      }
    }

    void pollRuns();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // ─── Render helpers ────────────────────────────────────────────────────────
  const selectedPeriodName = React.useMemo(() => {
    if (!selectedPeriodId) return null;
    if (selectedPeriodId === FULL_YEAR_PERIOD_ID) return t('dashboard.fullYearLabel');
    return periods.find((p) => p.id === selectedPeriodId)?.name ?? null;
  }, [periods, selectedPeriodId, t]);

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      {/* ─── Header ─────────────────────────────────────────────────────── */}
      <PageHeader
        title={t('title')}
        description={selectedPeriodName ?? undefined}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {periods.length > 0 && (
              <Select
                value={selectedPeriodId ?? undefined}
                onValueChange={(val) => setSelectedPeriodId(val)}
              >
                <SelectTrigger className="h-9 min-w-[12rem]">
                  <SelectValue placeholder={t('dashboard.selectPeriod')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FULL_YEAR_PERIOD_ID}>
                    {t('dashboard.fullYearLabel')}
                  </SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/${locale}/report-cards/settings`)}
                aria-label={t('dashboard.settingsAria')}
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        }
      />

      {/* ─── Quick action tiles ───────────────────────────────────────────
          B11: teachers see only the two tiles they can act on (Write
          comments + Library read-only). Generate and Teacher Requests
          are admin-only affordances. */}
      <section
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${isAdmin ? 'lg:grid-cols-4' : 'lg:grid-cols-2'}`}
        aria-label={t('dashboard.quickActionsAria')}
      >
        {isAdmin && (
          <QuickActionTile
            icon={Sparkles}
            title={t('dashboard.tileGenerateTitle')}
            description={t('dashboard.tileGenerateDescription')}
            actionLabel={t('dashboard.tileGenerateAction')}
            accent="from-violet-400 via-violet-500 to-violet-600"
            iconBg="bg-violet-100 text-violet-700"
            onClick={() => router.push(`/${locale}/report-cards/generate`)}
          />
        )}
        <QuickActionTile
          icon={MessageSquare}
          title={t('dashboard.tileCommentsTitle')}
          description={t('dashboard.tileCommentsDescription')}
          actionLabel={t('dashboard.tileCommentsAction')}
          accent="from-amber-400 via-amber-500 to-amber-600"
          iconBg="bg-amber-100 text-amber-700"
          onClick={() => router.push(`/${locale}/report-comments`)}
        />
        <QuickActionTile
          icon={Library}
          title={t('dashboard.tileLibraryTitle')}
          description={
            libraryCount === null
              ? t('dashboard.tileLibraryLoading')
              : t('dashboard.tileLibraryDescription', { count: libraryCount })
          }
          actionLabel={t('dashboard.tileLibraryAction')}
          accent="from-sky-400 via-sky-500 to-sky-600"
          iconBg="bg-sky-100 text-sky-700"
          onClick={() => router.push(`/${locale}/report-cards/library`)}
        />
        {isAdmin && (
          <QuickActionTile
            icon={Inbox}
            title={t('dashboard.tileRequestsTitle')}
            description={
              pendingRequestCount > 0
                ? t('dashboard.tileRequestsPending', { count: pendingRequestCount })
                : t('dashboard.tileRequestsAllClear')
            }
            actionLabel={t('dashboard.tileRequestsAction')}
            accent="from-rose-400 via-rose-500 to-rose-600"
            iconBg="bg-rose-100 text-rose-700"
            badge={pendingRequestCount > 0 ? pendingRequestCount : null}
            onClick={() => router.push(`/${locale}/report-cards/requests`)}
          />
        )}
      </section>

      {/* ─── Live run status + Analytics snapshot ─────────────────────────
          B11: both panels are admin-focused (run orchestration + school-wide
          analytics). Teachers don't see either. */}
      {isAdmin && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LiveRunStatusPanel run={activeRun} locale={locale} />
          <AnalyticsSnapshotPanel
            analytics={analytics}
            loading={analyticsLoading}
            locale={locale}
            periodId={selectedPeriodId}
          />
        </section>
      )}

      {/* ─── Classes by year group ───────────────────────────────────────── */}
      <section className="space-y-6">
        <header className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('dashboard.classesHeading')}
          </h2>
          <p className="text-xs text-text-tertiary">{t('dashboard.classesHint')}</p>
        </header>

        {classesLoading ? (
          <div className="space-y-8">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="h-5 w-32 animate-pulse rounded bg-surface-secondary" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 3 }).map((_, j) => (
                    <div key={j} className="h-32 animate-pulse rounded-2xl bg-surface-secondary" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState icon={FileText} title={t('noClasses')} />
        ) : (
          <div className="space-y-10">
            {grouped.map((group) => (
              <section key={group.year_group_id ?? '__unassigned'} className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">
                      {translateYearGroup(group.year_group_name)}
                    </h3>
                    <p className="text-xs text-text-tertiary">
                      {t('classesCount', { count: group.cards.length })}
                    </p>
                  </div>
                  <div className="flex-1 border-t border-border/60" />
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {group.cards.map((card) => (
                    <button
                      key={card.class_id}
                      onClick={() => router.push(`/${locale}/report-cards/${card.class_id}`)}
                      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-5 text-start shadow-sm transition-all hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    >
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600 opacity-80" />
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="text-2xl font-bold tracking-tight text-text-primary">
                          {card.class_name}
                        </h4>
                        <FileText className="h-5 w-5 text-primary-500/70 transition-colors group-hover:text-primary-600" />
                      </div>
                      <div className="text-sm font-medium text-text-tertiary">
                        {t('studentsCount', { count: card.student_count })}
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
