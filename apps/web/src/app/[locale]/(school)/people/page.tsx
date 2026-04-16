'use client';

import {
  ArrowRight,
  GraduationCap,
  Home,
  Plus,
  Search,
  ShieldAlert,
  UserPlus,
  Users,
  Users2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Input } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import type { RoleKey } from '@/lib/route-roles';
import { ADMIN_ROLES } from '@/lib/route-roles';

import { CardSkeleton, KpiTile } from './_components/dashboard-parts';
import { EnrollmentTable } from './_components/enrollment-table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  counts: {
    students_active: number;
    students_total: number;
    staff_active: number;
    staff_total: number;
    households_active: number;
    households_total: number;
  };
  student_teacher_ratio: number | null;
  year_group_enrollment: Array<{
    year_group_id: string;
    year_group_name: string;
    student_count: number;
    class_count: number;
  }>;
  class_enrollment: Array<{
    class_id: string;
    class_name: string;
    year_group_name: string | null;
    student_count: number;
    max_capacity: number;
  }>;
  recent_students: Array<{
    id: string;
    full_name: string;
    student_number: string | null;
    status: string;
    year_group_name: string | null;
    created_at: string;
  }>;
}

interface DashboardResponse {
  data: DashboardSummary;
}

// ─── Navigation card config ───────────────────────────────────────────────────

interface NavCardConfig {
  key: 'students' | 'staff' | 'households';
  href: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  glow: string;
  roles?: RoleKey[];
}

const NAV_CARDS: NavCardConfig[] = [
  {
    key: 'students',
    href: '/students',
    icon: GraduationCap,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
    glow: 'from-sky-50/80',
  },
  {
    key: 'staff',
    href: '/staff',
    icon: Users,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
    glow: 'from-violet-50/80',
    roles: ADMIN_ROLES,
  },
  {
    key: 'households',
    href: '/households',
    icon: Home,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
    glow: 'from-emerald-50/80',
    roles: ADMIN_ROLES,
  },
];

// ─── Quick action config ──────────────────────────────────────────────────────

interface QuickActionConfig {
  labelKey: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  gradient: string;
  roles?: RoleKey[];
}

const QUICK_ACTIONS: QuickActionConfig[] = [
  {
    labelKey: 'quickActions.addStudent',
    href: '/students/new',
    icon: UserPlus,
    accent: 'bg-sky-100 text-sky-700',
    gradient: 'from-sky-400 to-sky-600',
    roles: ADMIN_ROLES,
  },
  {
    labelKey: 'quickActions.addStaff',
    href: '/staff/new',
    icon: Plus,
    accent: 'bg-violet-100 text-violet-700',
    gradient: 'from-violet-400 to-violet-600',
    roles: ADMIN_ROLES,
  },
  {
    labelKey: 'quickActions.addHousehold',
    href: '/households/new',
    icon: Home,
    accent: 'bg-emerald-100 text-emerald-700',
    gradient: 'from-emerald-400 to-emerald-600',
    roles: ADMIN_ROLES,
  },
  {
    labelKey: 'quickActions.allergyReport',
    href: '/students/allergy-report',
    icon: ShieldAlert,
    accent: 'bg-amber-100 text-amber-700',
    gradient: 'from-amber-400 to-amber-600',
  },
];

// ─── Search result type ───────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  type: 'student' | 'staff' | 'household';
  label: string;
  sub: string;
  href: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PeopleDashboardPage() {
  const t = useTranslations('peopleHub');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();

  const [summary, setSummary] = React.useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // ── Search state ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch dashboard ──────────────────────────────────────────────────────
  const fetchSummary = React.useCallback(async () => {
    try {
      const res = await apiClient<DashboardResponse>('/api/v1/people/dashboard-summary');
      setSummary(res.data);
    } catch (err) {
      console.error('[PeopleDashboardPage]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSummary();
  }, [fetchSummary]);

  // ── Search ───────────────────────────────────────────────────────────────
  const handleSearch = React.useCallback(
    async (query: string) => {
      if (query.trim().length < 2) {
        setSearchResults([]);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const q = encodeURIComponent(query.trim());

        const fetches: Promise<SearchResult[]>[] = [
          apiClient<{
            data: Array<{ id: string; full_name: string; student_number: string | null }>;
          }>(`/api/v1/students?search=${q}&pageSize=5`).then((res) =>
            res.data.map((s) => ({
              id: s.id,
              type: 'student' as const,
              label: s.full_name ?? '',
              sub: s.student_number ?? '',
              href: `/students/${s.id}`,
            })),
          ),
        ];

        if (hasAnyRole(...ADMIN_ROLES)) {
          fetches.push(
            apiClient<{
              data: Array<{
                id: string;
                user: { first_name: string; last_name: string };
                job_title: string | null;
              }>;
            }>(`/api/v1/staff-profiles?search=${q}&pageSize=5`).then((res) =>
              res.data.map((s) => ({
                id: s.id,
                type: 'staff' as const,
                label: `${s.user.first_name} ${s.user.last_name}`,
                sub: s.job_title ?? '',
                href: `/staff/${s.id}`,
              })),
            ),
            apiClient<{
              data: Array<{ id: string; household_name: string; status: string }>;
            }>(`/api/v1/households?search=${q}&pageSize=5`).then((res) =>
              res.data.map((h) => ({
                id: h.id,
                type: 'household' as const,
                label: h.household_name,
                sub: h.status,
                href: `/households/${h.id}`,
              })),
            ),
          );
        }

        const results = (await Promise.all(fetches)).flat();
        setSearchResults(results);
      } catch (err) {
        console.error('[PeopleDashboardPage.search]', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    },
    [hasAnyRole],
  );

  const onSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => void handleSearch(val), 300);
  };

  // ── Derived data ─────────────────────────────────────────────────────────
  const visibleCards = React.useMemo(
    () => NAV_CARDS.filter((c) => !c.roles || hasAnyRole(...c.roles)),
    [hasAnyRole],
  );
  const visibleActions = React.useMemo(
    () => QUICK_ACTIONS.filter((a) => !a.roles || hasAnyRole(...a.roles)),
    [hasAnyRole],
  );

  const counts = summary?.counts;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader title={t('title')} description={t('description')} />

      {/* ── Search bar ────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={onSearchChange}
          className="h-12 rounded-2xl ps-12 text-base shadow-sm"
        />
        {(searchResults.length > 0 || (isSearching && searchQuery.length >= 2)) && (
          <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg">
            {isSearching ? (
              <div className="flex items-center gap-3 p-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="text-sm text-text-tertiary">{t('searching')}</span>
              </div>
            ) : searchResults.length === 0 && searchQuery.length >= 2 ? (
              <div className="p-4 text-center text-sm text-text-tertiary">{t('noResults')}</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {searchResults.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => {
                      router.push(`/${locale}${result.href}`);
                      setSearchQuery('');
                      setSearchResults([]);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-surface-secondary"
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        result.type === 'student'
                          ? 'bg-sky-100 text-sky-700'
                          : result.type === 'staff'
                            ? 'bg-violet-100 text-violet-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {result.type === 'student' ? (
                        <GraduationCap className="h-4 w-4" />
                      ) : result.type === 'staff' ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        <Home className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {result.label}
                      </p>
                      {result.sub && (
                        <p className="truncate text-xs text-text-tertiary">{result.sub}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                      {result.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── KPI tiles ─────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          icon={GraduationCap}
          label={t('kpis.activeStudents')}
          value={counts?.students_active}
          subtitle={counts ? `/ ${counts.students_total}` : undefined}
          isLoading={isLoading}
          accent="text-sky-700"
          href={`/${locale}/students`}
        />
        <KpiTile
          icon={Users}
          label={t('kpis.activeStaff')}
          value={counts?.staff_active}
          subtitle={counts ? `/ ${counts.staff_total}` : undefined}
          isLoading={isLoading}
          accent="text-violet-700"
          href={hasAnyRole(...ADMIN_ROLES) ? `/${locale}/staff` : undefined}
        />
        <KpiTile
          icon={Home}
          label={t('kpis.activeHouseholds')}
          value={counts?.households_active}
          subtitle={counts ? `/ ${counts.households_total}` : undefined}
          isLoading={isLoading}
          accent="text-emerald-700"
          href={hasAnyRole(...ADMIN_ROLES) ? `/${locale}/households` : undefined}
        />
        <KpiTile
          icon={Users2}
          label={t('kpis.studentTeacherRatio')}
          value={summary?.student_teacher_ratio ?? undefined}
          isLoading={isLoading}
          accent="text-amber-700"
        />
      </section>

      {/* ── Quick Actions ─────────────────────────────────────────────── */}
      {visibleActions.length > 0 && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.labelKey}
                href={`/${locale}${action.href}`}
                className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-strong hover:shadow-sm"
              >
                <div className={`shrink-0 rounded-lg p-2 ${action.accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium text-text-primary">{t(action.labelKey)}</span>
                <ArrowRight className="ms-auto h-4 w-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
                <div
                  className={`absolute bottom-0 end-0 start-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r ${action.gradient} transition-transform group-hover:scale-x-100`}
                />
              </Link>
            );
          })}
        </section>
      )}

      {/* ── Year Group Enrollment ─────────────────────────────────────── */}
      {summary && summary.year_group_enrollment.length > 0 && (
        <EnrollmentTable
          locale={locale}
          yearGroups={summary.year_group_enrollment}
          classes={summary.class_enrollment}
        />
      )}

      {/* ── Navigation cards ──────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-3" aria-label={t('cardsAria')}>
        {isLoading && summary === null ? (
          <>
            {visibleCards.map((card) => (
              <CardSkeleton key={`skeleton-${card.key}`} />
            ))}
          </>
        ) : (
          visibleCards.map((card) => {
            const Icon = card.icon;
            const count =
              card.key === 'students'
                ? counts?.students_active
                : card.key === 'staff'
                  ? counts?.staff_active
                  : counts?.households_active;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => router.push(`/${locale}${card.href}`)}
                className="group relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-3xl border border-border bg-surface p-6 text-start shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-7"
              >
                <div
                  className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${card.accent}`}
                />
                <div
                  className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.glow} to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
                />

                <div className="relative flex items-start justify-between gap-4">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-black/5 ${card.iconBg}`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex items-center gap-3">
                    {count !== undefined && count > 0 && (
                      <span className="inline-flex items-center rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-primary">
                        {count}
                      </span>
                    )}
                    <ArrowRight className="h-5 w-5 text-text-tertiary transition-colors duration-300 group-hover:text-primary-600 rtl:rotate-180" />
                  </div>
                </div>

                <div className="relative min-w-0 space-y-1.5">
                  <h3 className="text-lg font-semibold tracking-tight text-text-primary">
                    {t(`cards.${card.key}.title`)}
                  </h3>
                  <p className="text-sm leading-relaxed text-text-tertiary">
                    {t(`cards.${card.key}.description`)}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </section>

      {/* ── Recently added students ───────────────────────────────────── */}
      {summary && summary.recent_students.length > 0 && (
        <section className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-violet-400 via-violet-500 to-violet-600" />
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold text-text-primary">{t('recentStudents.title')}</h3>
            <Link
              href={`/${locale}/students`}
              className="text-xs font-medium text-primary hover:underline"
            >
              {t('recentStudents.viewAll')}
            </Link>
          </div>
          <div className="divide-y divide-border/50">
            {summary.recent_students.map((s) => (
              <Link
                key={s.id}
                href={`/${locale}/students/${s.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-secondary"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-700">
                  {(s.full_name ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">{s.full_name}</p>
                  <p className="text-xs text-text-tertiary">
                    {s.year_group_name ?? '—'}
                    {s.student_number ? ` · ${s.student_number}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    s.status === 'active'
                      ? 'bg-success-100 text-success-700'
                      : s.status === 'applicant'
                        ? 'bg-info-100 text-info-700'
                        : 'bg-surface-secondary text-text-tertiary'
                  }`}
                >
                  {s.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
