'use client';

import { FileText, GraduationCap, MessageSquare, Users } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { EmptyState, toast } from '@school/ui';

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
  subject?: { id: string; name: string } | null;
  homeroom_teacher_staff_id?: string | null;
  _count?: { class_enrolments: number };
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface AssignmentCard {
  class_id: string;
  class_name: string;
  subject_id: string | null;
  subject_name: string | null;
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
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'admin', 'school_vice_principal');

  const [activeWindow, setActiveWindow] = React.useState<ActiveWindow | null>(null);
  const [period, setPeriod] = React.useState<AcademicPeriod | null>(null);
  const [grouped, setGrouped] = React.useState<GroupedCards[]>([]);
  const [homeroomCards, setHomeroomCards] = React.useState<HomeroomCard[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const [openWindowModalOpen, setOpenWindowModalOpen] = React.useState(false);
  const [extendWindowModalOpen, setExtendWindowModalOpen] = React.useState(false);
  const [requestReopenModalOpen, setRequestReopenModalOpen] = React.useState(false);
  const [closingInFlight, setClosingInFlight] = React.useState(false);

  const bumpRefresh = React.useCallback((): void => {
    setRefreshToken((n) => n + 1);
  }, []);

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
          currentWindow = await apiClient<ActiveWindow | null>(
            '/api/v1/report-comment-windows/active',
            { silent: true },
          );
        } catch (err) {
          // 404 or similar => no open window
          console.error('[ReportCommentsLanding] active window', err);
        }
        if (cancelled) return;
        setActiveWindow(currentWindow);

        // 2. Fetch period info, year groups, subject classes, homeroom classes in parallel
        const [yearGroupsRes, subjectClassesRes, homeroomClassesRes, periodsRes] =
          await Promise.all([
            apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
            apiClient<ListResponse<ClassRecord>>(
              '/api/v1/classes?pageSize=200&homeroom_only=false',
            ),
            apiClient<ListResponse<ClassRecord>>('/api/v1/classes?pageSize=200'),
            apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50'),
          ]);

        if (cancelled) return;

        // Resolve period name for the banner
        const resolvedPeriod = currentWindow
          ? ((periodsRes.data ?? []).find((p) => p.id === currentWindow?.academic_period_id) ??
            null)
          : null;
        setPeriod(resolvedPeriod);

        // Build year group lookup
        const yearGroupInfo = new Map<string, { name: string; order: number }>();
        for (const yg of yearGroupsRes.data ?? []) {
          yearGroupInfo.set(yg.id, { name: yg.name, order: yg.display_order ?? 0 });
        }

        // 3. If a window is open, fetch per-assignment comment counts in parallel.
        // Only subject-bearing classes with at least one student are considered.
        const subjectClasses = (subjectClassesRes.data ?? []).filter(
          (c) =>
            (c._count?.class_enrolments ?? 0) > 0 && c.subject && c.subject.id && c.subject.name,
        );

        const academicPeriodId = currentWindow?.academic_period_id ?? null;

        const countPromises = subjectClasses.map(async (cls) => {
          const studentCount = cls._count?.class_enrolments ?? 0;
          let finalised = 0;
          let total = 0;
          if (academicPeriodId && cls.subject) {
            try {
              const res = await apiClient<{ data: unknown[]; meta: { total: number } }>(
                `/api/v1/report-card-subject-comments?class_id=${cls.id}&subject_id=${cls.subject.id}&academic_period_id=${academicPeriodId}&pageSize=1`,
                { silent: true },
              );
              total = res.meta?.total ?? 0;
              const resFinalised = await apiClient<{ data: unknown[]; meta: { total: number } }>(
                `/api/v1/report-card-subject-comments?class_id=${cls.id}&subject_id=${cls.subject.id}&academic_period_id=${academicPeriodId}&finalised=true&pageSize=1`,
                { silent: true },
              );
              finalised = resFinalised.meta?.total ?? 0;
            } catch (err) {
              console.error('[ReportCommentsLanding] count subject', err);
            }
          }
          return { cls, studentCount, finalised, total };
        });

        const countResults = await Promise.all(countPromises);
        if (cancelled) return;

        const assignmentCards: AssignmentCard[] = countResults.map(
          ({ cls, studentCount, finalised, total }) => {
            const ygId = cls.year_group?.id ?? null;
            const ygInfo = ygId ? yearGroupInfo.get(ygId) : null;
            return {
              class_id: cls.id,
              class_name: cls.name,
              subject_id: cls.subject?.id ?? null,
              subject_name: cls.subject?.name ?? null,
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
                  (a.subject_name ?? '').localeCompare(b.subject_name ?? ''),
              ),
          }));
        setGrouped(sortedGroups);

        // 4. Homeroom classes — only when window is open, count overall comments
        const homeroomClasses = (homeroomClassesRes.data ?? []).filter(
          (c) => (c._count?.class_enrolments ?? 0) > 0,
        );

        const homeroomPromises = homeroomClasses.map(async (cls) => {
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
        });

        const homeroomResults = await Promise.all(homeroomPromises);
        if (cancelled) return;
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
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      const confirmed = window.confirm(tClose('description'));
      if (!confirmed) return;
    }
    setClosingInFlight(true);
    try {
      await apiClient(`/api/v1/report-comment-windows/${activeWindow.id}/close`, {
        method: 'PATCH',
      });
      toast.success(tClose('success'));
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
      <PageHeader title={t('title')} description={t('subtitle')} />

      {/* Window banner */}
      <WindowBanner
        window={activeWindow}
        periodName={period?.name ?? null}
        isAdmin={isAdmin}
        locale={locale}
        onOpenWindow={isAdmin ? () => setOpenWindowModalOpen(true) : undefined}
        onCloseWindow={isAdmin ? () => void handleCloseNow() : undefined}
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

      {/* Empty state */}
      {!isLoading && !loadFailed && grouped.length === 0 && homeroomCards.length === 0 && (
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
                const disabled = !card.subject_id;
                return (
                  <button
                    key={`${card.class_id}:${card.subject_id ?? 'none'}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled || !card.subject_id) return;
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
                          {card.subject_name ?? '—'}
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
            onOpenChange={setOpenWindowModalOpen}
            onSuccess={bumpRefresh}
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
