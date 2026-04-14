'use client';

import { ArrowLeft, FileText, GraduationCap, MessageSquare, Users } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, toast } from '@school/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { ExtendWindowModal } from './_components/extend-window-modal';
import { OpenWindowModal } from './_components/open-window-modal';
import { RequestReopenModal } from './_components/request-reopen-modal';
import type { ActiveWindow } from './_components/window-banner';
import { WindowBanner } from './_components/window-banner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListResponse<T> {
  data: T[];
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
  homeroom_teacher_staff_id?: string | null;
  _count?: { class_enrolments: number };
}

interface SubjectRecord {
  id: string;
  name: string;
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface AssignmentCard {
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  year_group_id: string | null;
  year_group_name: string;
  year_group_order: number;
  student_count: number;
  finalised_count: number;
  total_count: number;
}

interface HomeroomCard {
  class_id: string;
  class_name: string;
  student_count: number;
  finalised_count: number;
  total_count: number;
}

interface LandingScope {
  is_admin: boolean;
  overall_class_ids: string[];
  subject_assignments: Array<{ class_id: string; subject_id: string }>;
  active_window_id: string | null;
  no_timetable_applied?: boolean;
}

interface GroupedCards {
  year_group_id: string | null;
  year_group_name: string;
  year_group_order: number;
  cards: AssignmentCard[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCommentsLandingPage() {
  const t = useTranslations('reportComments');
  const tCard = useTranslations('reportComments.assignmentCard');
  const tHomeroom = useTranslations('reportComments.homeroomCard');
  const tClose = useTranslations('reportComments.closeConfirm');
  const tRC = useTranslations('reportCards');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'admin', 'school_vice_principal');

  const [prefilledPeriodId, setPrefilledPeriodId] = React.useState<string | null>(null);
  const [activeWindow, setActiveWindow] = React.useState<ActiveWindow | null>(null);
  const [period, setPeriod] = React.useState<AcademicPeriod | null>(null);
  const [grouped, setGrouped] = React.useState<GroupedCards[]>([]);
  const [homeroomCards, setHomeroomCards] = React.useState<HomeroomCard[]>([]);
  const [noTimetable, setNoTimetable] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const [openWindowModalOpen, setOpenWindowModalOpen] = React.useState(false);
  const [extendWindowModalOpen, setExtendWindowModalOpen] = React.useState(false);
  const [requestReopenModalOpen, setRequestReopenModalOpen] = React.useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false);
  const [closingInFlight, setClosingInFlight] = React.useState(false);

  const bumpRefresh = React.useCallback((): void => {
    setRefreshToken((n) => n + 1);
  }, []);

  // Query-param handoff from the Teacher Requests approve flow: detect
  // ?open_window_period=<id> and auto-open the OpenWindow modal pre-filled
  // with that period. Clear the query param after consumption so it doesn't
  // stick on refresh.
  const openWindowHandoffRef = React.useRef(false);
  React.useEffect(() => {
    if (openWindowHandoffRef.current) return;
    if (!searchParams || !isAdmin) return;
    const periodId = searchParams.get('open_window_period');
    if (!periodId) return;
    openWindowHandoffRef.current = true;
    setPrefilledPeriodId(periodId);
    setOpenWindowModalOpen(true);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('open_window_period');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams, isAdmin]);

  // ─── Load data ──────────────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        // 1. Fetch active window (may be null if closed)
        let currentWindow: ActiveWindow | null = null;
        try {
          const activeRes = await apiClient<{ data: ActiveWindow | null }>(
            '/api/v1/report-comment-windows/active',
            { silent: true },
          );
          currentWindow = activeRes.data ?? null;
        } catch (err) {
          // 404 or similar => no open window
          console.error('[ReportCommentsLanding] active window', err);
        }
        if (cancelled) return;
        setActiveWindow(currentWindow);

        // 2. Fetch landing scope (B6 / B9): the backend tells us which
        // overall homeroom classes the actor can write and which
        // (class, subject) pairs they can write subject comments for.
        // Stage 8: the subject side now derives from the live `schedules`
        // table (pairs the teacher is actually timetabled to teach). If no
        // timetable has been applied yet, the backend sets
        // `no_timetable_applied=true` so we can render a dedicated empty
        // state linking to the scheduler.
        let scope: LandingScope = {
          is_admin: true,
          overall_class_ids: [],
          subject_assignments: [],
          active_window_id: currentWindow?.id ?? null,
        };
        try {
          const scopeRes = await apiClient<LandingScope | { data: LandingScope }>(
            '/api/v1/report-comment-windows/landing',
            { silent: true },
          );
          // Backend wraps single-object responses in { data: ... }; tolerate
          // either shape so we don't crash if the envelope changes.
          scope = 'data' in scopeRes ? scopeRes.data : scopeRes;
        } catch (err) {
          console.error('[ReportCommentsLanding] landing scope', err);
        }
        if (cancelled) return;
        setNoTimetable(scope.no_timetable_applied === true);

        const overallAllowed = !scope.is_admin ? new Set(scope.overall_class_ids) : null;

        // 3. Fetch period info, year groups, classes, subjects in parallel.
        // We need TWO class lists:
        //   - allClassesRes (homeroom_only=false) — used as an id→class
        //     lookup map when resolving subject_assignments pairs.
        //   - homeroomClassesRes (default filter: subject_id IS NULL) —
        //     the list we actually render as homeroom "overall comment"
        //     cards. In the primary-school model every class is a
        //     homeroom so these overlap; in a secondary-school model the
        //     subject_assignments pairs reference subject-bearing class
        //     rows that aren't themselves homerooms, so the two lists
        //     diverge and both are needed.
        const [yearGroupsRes, allClassesRes, homeroomClassesRes, subjectsRes, periodsRes] =
          await Promise.all([
            apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
            apiClient<ListResponse<ClassRecord>>(
              '/api/v1/classes?pageSize=200&homeroom_only=false',
            ),
            apiClient<ListResponse<ClassRecord>>('/api/v1/classes?pageSize=200'),
            apiClient<ListResponse<SubjectRecord>>('/api/v1/subjects?pageSize=100'),
            apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50'),
          ]);

        if (cancelled) return;

        // Resolve period name for the banner
        const resolvedPeriod = currentWindow
          ? ((periodsRes.data ?? []).find((p) => p.id === currentWindow?.academic_period_id) ??
            null)
          : null;
        setPeriod(resolvedPeriod);

        // Build lookup maps keyed by id for the card-building step below.
        const yearGroupInfo = new Map<string, { name: string; order: number }>();
        for (const yg of yearGroupsRes.data ?? []) {
          yearGroupInfo.set(yg.id, { name: yg.name, order: yg.display_order ?? 0 });
        }

        const classById = new Map<string, ClassRecord>();
        for (const c of allClassesRes.data ?? []) {
          classById.set(c.id, c);
        }

        const subjectById = new Map<string, SubjectRecord>();
        for (const s of subjectsRes.data ?? []) {
          subjectById.set(s.id, s);
        }

        const academicPeriodId = currentWindow?.academic_period_id ?? null;

        // 4. For each (class, subject) pair the backend returned, build a
        // card. Pairs whose class is unknown (stale data) or whose class
        // has zero active enrolments are dropped — those simply aren't
        // meaningful to write comments against.
        const visiblePairs = (scope.subject_assignments ?? []).filter((pair) => {
          const cls = classById.get(pair.class_id);
          if (!cls) return false;
          if ((cls._count?.class_enrolments ?? 0) <= 0) return false;
          return true;
        });

        // B10: for an admin the landing can see the full curriculum
        // matrix — on nhqs that's 108 subject pairs, which means 216
        // per-pair count requests. With the 100 req / 60 s throttler in
        // place the fan-out burned the whole budget in the first few
        // batches and most requests came back 429. Admins don't write
        // the comments themselves (they oversee via the banner), so skip
        // the per-pair count fetch entirely for them. Teachers keep the
        // counts — their card set is small (Sarah sees 11 pairs), two
        // batches cover it comfortably.
        const fetchPairCounts = async (pair: { class_id: string; subject_id: string }) => {
          const cls = classById.get(pair.class_id)!;
          const studentCount = cls._count?.class_enrolments ?? 0;
          let finalised = 0;
          let total = 0;
          if (academicPeriodId) {
            try {
              const res = await apiClient<{ data: unknown[]; meta: { total: number } }>(
                `/api/v1/report-card-subject-comments?class_id=${pair.class_id}&subject_id=${pair.subject_id}&academic_period_id=${academicPeriodId}&pageSize=1`,
                { silent: true },
              );
              total = res.meta?.total ?? 0;
              const resFinalised = await apiClient<{ data: unknown[]; meta: { total: number } }>(
                `/api/v1/report-card-subject-comments?class_id=${pair.class_id}&subject_id=${pair.subject_id}&academic_period_id=${academicPeriodId}&finalised=true&pageSize=1`,
                { silent: true },
              );
              finalised = resFinalised.meta?.total ?? 0;
            } catch (err) {
              console.error('[ReportCommentsLanding] count subject', err);
            }
          }
          return { pair, cls, studentCount, finalised, total };
        };

        const COUNT_BATCH_SIZE = 5;
        const countResults: Array<{
          pair: { class_id: string; subject_id: string };
          cls: ClassRecord;
          studentCount: number;
          finalised: number;
          total: number;
        }> = [];
        if (scope.is_admin) {
          // Admin path: skip fan-out, build cards with zero counts. The
          // card UI already handles zero-count by showing "No comments
          // yet" instead of a progress bar.
          for (const pair of visiblePairs) {
            const cls = classById.get(pair.class_id)!;
            countResults.push({
              pair,
              cls,
              studentCount: cls._count?.class_enrolments ?? 0,
              finalised: 0,
              total: 0,
            });
          }
        } else {
          for (let i = 0; i < visiblePairs.length; i += COUNT_BATCH_SIZE) {
            const batch = visiblePairs.slice(i, i + COUNT_BATCH_SIZE);
            const settled = await Promise.all(batch.map(fetchPairCounts));
            if (cancelled) return;
            countResults.push(...settled);
          }
        }
        if (cancelled) return;

        const assignmentCards: AssignmentCard[] = countResults.map(
          ({ pair, cls, studentCount, finalised, total }) => {
            const ygId = cls.year_group?.id ?? null;
            const ygInfo = ygId ? yearGroupInfo.get(ygId) : null;
            const subject = subjectById.get(pair.subject_id);
            return {
              class_id: cls.id,
              class_name: cls.name,
              subject_id: pair.subject_id,
              subject_name: subject?.name ?? '—',
              year_group_id: ygId,
              year_group_name: cls.year_group?.name ?? 'Unassigned',
              year_group_order: ygInfo?.order ?? 999,
              student_count: studentCount,
              finalised_count: finalised,
              total_count: total,
            };
          },
        );

        // Group by year group
        const groupMap = new Map<string, GroupedCards>();
        for (const card of assignmentCards) {
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
            cards: g.cards
              .slice()
              .sort(
                (a, b) =>
                  a.class_name.localeCompare(b.class_name) ||
                  a.subject_name.localeCompare(b.subject_name),
              ),
          }));
        setGrouped(sortedGroups);

        // 5. Homeroom overall-comment cards. Non-admins see only the
        // classes they were picked for as homeroom teacher on the active
        // comment window (overall_class_ids from the landing scope). Admins
        // render every homeroom class with active enrolments.
        const homeroomClasses = (homeroomClassesRes.data ?? []).filter((c) => {
          if ((c._count?.class_enrolments ?? 0) <= 0) return false;
          if (overallAllowed === null) return true;
          return overallAllowed.has(c.id);
        });

        // B10: same batching pattern as subject counts. For an admin with
        // 14 homeroom classes this is 28 sequential count calls; in
        // batches of 5 that finishes in well under a second without
        // tripping the rate limiter.
        const fetchHomeroomCounts = async (cls: ClassRecord) => {
          const studentCount = cls._count?.class_enrolments ?? 0;
          let finalised = 0;
          let total = 0;
          if (academicPeriodId) {
            try {
              const res = await apiClient<{ data: unknown[]; meta: { total: number } }>(
                `/api/v1/report-card-overall-comments?class_id=${cls.id}&academic_period_id=${academicPeriodId}&pageSize=1`,
                { silent: true },
              );
              total = res.meta?.total ?? 0;
              const resFinalised = await apiClient<{ data: unknown[]; meta: { total: number } }>(
                `/api/v1/report-card-overall-comments?class_id=${cls.id}&academic_period_id=${academicPeriodId}&finalised=true&pageSize=1`,
                { silent: true },
              );
              finalised = resFinalised.meta?.total ?? 0;
            } catch (err) {
              console.error('[ReportCommentsLanding] count overall', err);
            }
          }
          return {
            class_id: cls.id,
            class_name: cls.name,
            student_count: studentCount,
            finalised_count: finalised,
            total_count: total,
          };
        };

        const homeroomResults: HomeroomCard[] = [];
        if (scope.is_admin) {
          // Admin path: skip count fan-out here too. The homeroom card
          // list for an admin shows every class with active enrolments
          // (up to 14 in nhqs); without this guard the same rate-limit
          // fan-out repeats for the overall-comment counts.
          for (const cls of homeroomClasses) {
            homeroomResults.push({
              class_id: cls.id,
              class_name: cls.name,
              student_count: cls._count?.class_enrolments ?? 0,
              finalised_count: 0,
              total_count: 0,
            });
          }
        } else {
          for (let i = 0; i < homeroomClasses.length; i += COUNT_BATCH_SIZE) {
            const batch = homeroomClasses.slice(i, i + COUNT_BATCH_SIZE);
            const settled = await Promise.all(batch.map(fetchHomeroomCounts));
            if (cancelled) return;
            homeroomResults.push(...settled);
          }
        }
        setHomeroomCards(homeroomResults);
      } catch (err) {
        console.error('[ReportCommentsLanding]', err);
        if (!cancelled) {
          setLoadFailed(true);
          setGrouped([]);
          setHomeroomCards([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  // ─── Window controls (admin) ────────────────────────────────────────────

  const handleCloseNow = async (): Promise<void> => {
    if (!activeWindow) return;
    setClosingInFlight(true);
    try {
      await apiClient(`/api/v1/report-comment-windows/${activeWindow.id}/close`, {
        method: 'PATCH',
      });
      toast.success(tClose('success'));
      setCloseConfirmOpen(false);
      bumpRefresh();
    } catch (err) {
      console.error('[ReportCommentsLanding] close', err);
      toast.error(tClose('failure'));
    } finally {
      setClosingInFlight(false);
    }
  };

  const handleReopen = async (): Promise<void> => {
    if (!activeWindow) return;
    try {
      await apiClient(`/api/v1/report-comment-windows/${activeWindow.id}/reopen`, {
        method: 'PATCH',
      });
      bumpRefresh();
    } catch (err) {
      console.error('[ReportCommentsLanding] reopen', err);
    }
  };

  // ─── Render helpers ─────────────────────────────────────────────────────

  const progressPercent = (card: AssignmentCard | HomeroomCard): number => {
    if (card.total_count === 0) return 0;
    return Math.min(100, Math.round((card.finalised_count / card.total_count) * 100));
  };

  const windowIsOpen = activeWindow?.status === 'open';

  const cardDisabledClasses = windowIsOpen
    ? 'hover:border-primary-300 hover:shadow-md'
    : 'opacity-75 hover:border-border/80';

  return (
    <div className="space-y-8 pb-8">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${locale}/report-cards`)}
            className="min-h-11"
          >
            <ArrowLeft className="me-1.5 h-4 w-4" aria-hidden="true" />
            {tRC('backToReportCards')}
          </Button>
        }
      />

      {/* Window banner */}
      <WindowBanner
        window={activeWindow}
        periodName={period?.name ?? null}
        isAdmin={isAdmin}
        locale={locale}
        onOpenWindow={isAdmin ? () => setOpenWindowModalOpen(true) : undefined}
        onCloseWindow={isAdmin ? () => setCloseConfirmOpen(true) : undefined}
        onExtendWindow={isAdmin ? () => setExtendWindowModalOpen(true) : undefined}
        onReopenWindow={isAdmin ? () => void handleReopen() : undefined}
        onRequestReopen={!isAdmin ? () => setRequestReopenModalOpen(true) : undefined}
        closingInFlight={closingInFlight}
      />

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <div className="h-5 w-32 animate-pulse rounded bg-surface-secondary" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-36 animate-pulse rounded-2xl bg-surface-secondary" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load failed */}
      {!isLoading && loadFailed && <EmptyState icon={FileText} title={t('loadFailed')} />}

      {/* Empty state — no timetable applied (Stage 8) takes precedence */}
      {!isLoading && !loadFailed && noTimetable && (
        <EmptyState
          icon={MessageSquare}
          title={t('noTimetableApplied')}
          description={t('noTimetableAppliedDesc')}
          action={{
            label: t('goToScheduler'),
            onClick: () => router.push(`/${locale}/scheduling/auto`),
          }}
        />
      )}

      {/* Empty state — window/assignment variants */}
      {!isLoading &&
        !loadFailed &&
        !noTimetable &&
        grouped.length === 0 &&
        homeroomCards.length === 0 && (
          <EmptyState
            icon={MessageSquare}
            title={activeWindow ? t('noAssignments') : t('noActivity')}
          />
        )}

      {/* Homeroom overall comments card */}
      {!isLoading && !loadFailed && homeroomCards.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-text-primary">{tHomeroom('title')}</h2>
            <div className="flex-1 border-t border-border/60" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {homeroomCards.map((card) => (
              <button
                key={card.class_id}
                type="button"
                onClick={() => router.push(`/${locale}/report-comments/overall/${card.class_id}`)}
                className={`group relative flex min-h-36 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-5 text-start shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${cardDisabledClasses}`}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 opacity-80" />
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-text-primary tracking-tight">
                      {tHomeroom('title')}
                    </h3>
                    <p className="mt-0.5 text-sm text-text-secondary">{card.class_name}</p>
                  </div>
                  <MessageSquare
                    className="h-5 w-5 text-amber-500/70 transition-colors group-hover:text-amber-600"
                    aria-hidden="true"
                  />
                </div>
                <ProgressBar percent={progressPercent(card)} tone="amber" />
                <div className="text-xs font-medium text-text-tertiary tabular-nums">
                  {card.total_count === 0
                    ? tCard('progressZero')
                    : tCard('progress', {
                        done: card.finalised_count,
                        total: card.total_count,
                      })}
                </div>
                {!windowIsOpen && (
                  <span className="text-xs text-text-tertiary">{tCard('readonly')}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Subject assignment cards grouped by year group */}
      {!isLoading &&
        !loadFailed &&
        grouped.map((group) => (
          <section key={group.year_group_id ?? '__unassigned'} className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-700">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  {group.year_group_name}
                </h2>
                <p className="text-xs text-text-tertiary">
                  {t('classesCount', { count: group.cards.length })}
                </p>
              </div>
              <div className="flex-1 border-t border-border/60" />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.cards.map((card) => {
                return (
                  <button
                    key={`${card.class_id}:${card.subject_id}`}
                    type="button"
                    onClick={() => {
                      router.push(
                        `/${locale}/report-comments/subject/${card.class_id}/${card.subject_id}`,
                      );
                    }}
                    className={`group relative flex min-h-36 flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-5 text-start shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${cardDisabledClasses} disabled:cursor-not-allowed`}
                  >
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-400 via-primary-500 to-primary-600 opacity-80" />

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-bold text-text-primary tracking-tight">
                          {card.subject_name}
                        </h3>
                        <p className="mt-0.5 text-sm text-text-secondary">{card.class_name}</p>
                      </div>
                      <FileText
                        className="h-5 w-5 shrink-0 text-primary-500/70 transition-colors group-hover:text-primary-600"
                        aria-hidden="true"
                      />
                    </div>

                    <ProgressBar percent={progressPercent(card)} tone="primary" />
                    <div className="text-xs font-medium text-text-tertiary tabular-nums">
                      {card.total_count === 0
                        ? tCard('progressZero')
                        : tCard('progress', {
                            done: card.finalised_count,
                            total: card.total_count,
                          })}
                    </div>
                    {!windowIsOpen && (
                      <span className="text-xs text-text-tertiary">{tCard('readonly')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}

      {/* Admin modals */}
      {isAdmin && (
        <>
          <OpenWindowModal
            open={openWindowModalOpen}
            onOpenChange={(next) => {
              setOpenWindowModalOpen(next);
              if (!next) setPrefilledPeriodId(null);
            }}
            onSuccess={bumpRefresh}
            defaultPeriodId={prefilledPeriodId}
          />
          <ExtendWindowModal
            open={extendWindowModalOpen}
            onOpenChange={setExtendWindowModalOpen}
            windowId={activeWindow?.id ?? null}
            currentClosesAt={activeWindow?.closes_at ?? null}
            onSuccess={bumpRefresh}
          />
        </>
      )}

      {!isAdmin && (
        <RequestReopenModal
          open={requestReopenModalOpen}
          onOpenChange={setRequestReopenModalOpen}
          defaultPeriodId={activeWindow?.academic_period_id ?? null}
        />
      )}

      {/* Custom confirm dialog for closing the comment window — replaces
          the native window.confirm so styling, focus trap, and i18n stay
          consistent with the rest of the app. */}
      <ConfirmDialog
        open={closeConfirmOpen}
        onOpenChange={setCloseConfirmOpen}
        title={tClose('title')}
        description={tClose('description')}
        confirmLabel={tClose('confirm')}
        cancelLabel={tClose('cancel')}
        variant="warning"
        busy={closingInFlight}
        onConfirm={handleCloseNow}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ percent, tone }: { percent: number; tone: 'primary' | 'amber' }) {
  const toneClasses =
    tone === 'primary'
      ? 'bg-gradient-to-r from-primary-400 to-primary-600'
      : 'bg-gradient-to-r from-amber-400 to-amber-600';
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-secondary"
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-all ${toneClasses}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
