'use client';

import {
  ArrowRight,
  Award,
  Bell,
  BookOpen,
  Calendar,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  FileText,
  GraduationCap,
  HeartHandshake,
  Inbox as InboxIcon,
  Languages,
  Megaphone,
  MessageCircle,
  ScrollText,
  Shield,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Button, EmptyState, StatusBadge } from '@school/ui';

import { useModuleEnabled } from '@/hooks/use-module-enabled';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import { AiInsightCard } from './_components/ai-insight-card';
import { FinancesTab } from './_components/finances-tab';
import { GradesTab } from './_components/grades-tab';
import { TimetableTab } from './_components/timetable-tab';

// ─── Parent hub tiles catalogue ────────────────────────────────────────────────

interface ParentNavTile {
  key:
    | 'inbox'
    | 'announcements'
    | 'inquiries'
    | 'applications'
    | 'sen'
    | 'behaviour'
    | 'recognition'
    | 'homework'
    | 'events'
    | 'household';
  href: string;
  icon: LucideIcon;
  iconBg: string;
  accent: string;
}

const PARENT_NAV_TILES: ParentNavTile[] = [
  {
    key: 'inbox',
    href: '/inbox',
    icon: InboxIcon,
    iconBg: 'bg-primary-100 text-primary-700',
    accent: 'from-primary-400 via-primary-500 to-primary-600',
  },
  {
    key: 'announcements',
    href: '/announcements',
    icon: Megaphone,
    iconBg: 'bg-amber-100 text-amber-700',
    accent: 'from-amber-400 via-amber-500 to-amber-600',
  },
  {
    key: 'inquiries',
    href: '/inquiries',
    icon: MessageCircle,
    iconBg: 'bg-sky-100 text-sky-700',
    accent: 'from-sky-400 via-sky-500 to-sky-600',
  },
  {
    key: 'applications',
    href: '/applications',
    icon: ScrollText,
    iconBg: 'bg-indigo-100 text-indigo-700',
    accent: 'from-indigo-400 via-indigo-500 to-indigo-600',
  },
  {
    key: 'sen',
    href: '/parent/sen',
    icon: HeartHandshake,
    iconBg: 'bg-teal-100 text-teal-700',
    accent: 'from-teal-400 via-teal-500 to-teal-600',
  },
  {
    key: 'behaviour',
    href: '/behaviour/parent-portal',
    icon: Shield,
    iconBg: 'bg-rose-100 text-rose-700',
    accent: 'from-rose-400 via-rose-500 to-rose-600',
  },
  {
    key: 'recognition',
    href: '/behaviour/parent-portal/recognition',
    icon: Award,
    iconBg: 'bg-violet-100 text-violet-700',
    accent: 'from-violet-400 via-violet-500 to-violet-600',
  },
  {
    key: 'homework',
    href: '/homework/parent',
    icon: BookOpen,
    iconBg: 'bg-emerald-100 text-emerald-700',
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
  },
  {
    key: 'events',
    href: '/engagement/parent/events',
    icon: CalendarClock,
    iconBg: 'bg-fuchsia-100 text-fuchsia-700',
    accent: 'from-fuchsia-400 via-fuchsia-500 to-fuchsia-600',
  },
  {
    key: 'household',
    href: '/parent/household',
    icon: Languages,
    iconBg: 'bg-cyan-100 text-cyan-700',
    accent: 'from-cyan-400 via-cyan-500 to-cyan-600',
  },
];

function ParentNavTileCard({ tile, locale }: { tile: ParentNavTile; locale: string }) {
  const t = useTranslations('dashboard.parentDashboard.navTiles');
  const Icon = tile.icon;
  return (
    <Link
      href={`/${locale}${tile.href}`}
      className="group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tile.accent}`}
      />
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tile.iconBg} shadow-sm ring-1 ring-inset ring-black/5`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{t(`${tile.key}.title`)}</p>
        <p className="truncate text-xs text-text-tertiary">{t(`${tile.key}.description`)}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-text-tertiary transition-colors duration-300 group-hover:text-primary-600 rtl:rotate-180" />
    </Link>
  );
}

interface LinkedStudent {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  year_group_name: string | null;
  class_homeroom_name: string | null;
  status: 'applicant' | 'active' | 'withdrawn' | 'graduated' | 'archived';
}

interface ParentDashboardData {
  greeting: string;
  students: LinkedStudent[];
}

interface ParentPendingForm {
  id: string;
}

interface ParentEngagementEvent {
  participants: Array<{
    consent_status: string | null;
    payment_status: string | null;
    status: string;
  }>;
}

interface ParentFinanceSummary {
  invoices: Array<{
    id?: string;
    status: string;
  }>;
}

function studentStatusVariant(
  status: LinkedStudent['status'],
): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (status) {
    case 'active':
      return 'success';
    case 'applicant':
      return 'info';
    case 'withdrawn':
      return 'danger';
    case 'graduated':
      return 'neutral';
    case 'archived':
      return 'neutral';
    default:
      return 'neutral';
  }
}

type ParentTab = 'overview' | 'grades' | 'timetable' | 'finances';

export default function ParentDashboardPage() {
  const t = useTranslations('dashboard');
  const tStudents = useTranslations('students');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { user } = useAuth();
  const financeEnabled = useModuleEnabled('finance');
  const searchParams = useSearchParams();
  const initialTab = ((): ParentTab => {
    const v = searchParams?.get('tab');
    return v === 'grades' || v === 'timetable' || v === 'finances' ? v : 'overview';
  })();
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ParentTab>(initialTab);
  const [hwToday, setHwToday] = useState<
    Array<{
      student: { id: string; first_name: string; last_name: string };
      assignments: Array<{ id: string }>;
    }>
  >([]);
  const [hwOverdue, setHwOverdue] = useState<
    Array<{
      student: { id: string; first_name: string; last_name: string };
      assignments: Array<{ id: string }>;
    }>
  >([]);
  const [unacknowledgedNotes, setUnacknowledgedNotes] = useState(0);
  const [actionCenter, setActionCenter] = useState({
    pendingForms: 0,
    actionableEvents: 0,
    outstandingPayments: 0,
  });

  useEffect(() => {
    if (!financeEnabled && activeTab === 'finances') {
      setActiveTab('overview');
    }
  }, [activeTab, financeEnabled]);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await apiClient<{ data: ParentDashboardData }>('/api/v1/dashboard/parent');
      setData(result.data);
    } catch (err) {
      console.error('[ParentDashboard.fetchDashboard]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  // Fetch homework summary for dashboard card
  useEffect(() => {
    Promise.all([
      apiClient<{ data: typeof hwToday }>('/api/v1/parent/homework/today').catch((err) => {
        console.error('[DashboardParentPage]', err);
        return {
          data: [] as typeof hwToday,
        };
      }),
      apiClient<{ data: typeof hwOverdue }>('/api/v1/parent/homework/overdue').catch((err) => {
        console.error('[DashboardParentPage]', err);
        return {
          data: [] as typeof hwOverdue,
        };
      }),
    ])
      .then(([todayRes, overdueRes]) => {
        setHwToday(todayRes.data ?? []);
        setHwOverdue(overdueRes.data ?? []);
      })
      .catch((err) => console.error('[ParentDashboard] Failed to load homework summary', err));
  }, []);

  // Fetch unacknowledged notes count across all children
  useEffect(() => {
    if (!data?.students.length) return;
    Promise.all(
      data.students.map((s) =>
        apiClient<{ data: Array<{ acknowledged: boolean }>; meta: { total: number } }>(
          `/api/v1/diary/${s.student_id}/parent-notes?page=1&pageSize=50`,
        ).catch((err) => {
          console.error('[DashboardParentPage]', err);
          return { data: [] as Array<{ acknowledged: boolean }>, meta: { total: 0 } };
        }),
      ),
    )
      .then((results) => {
        let count = 0;
        for (const res of results) {
          count += (res.data ?? []).filter((n) => !n.acknowledged).length;
        }
        setUnacknowledgedNotes(count);
      })
      .catch((err) => console.error('[ParentDashboard] Failed to load notes count', err));
  }, [data]);

  useEffect(() => {
    if (!data?.students) return;

    const studentIds = data.students.map((s) => s.student_id);

    Promise.all([
      apiClient<ParentPendingForm[]>('/api/v1/parent/engagement/pending-forms').catch((err) => {
        console.error('[DashboardParentPage]', err);
        return [];
      }),
      apiClient<{ data: ParentEngagementEvent[]; meta: { total: number } }>(
        '/api/v1/parent/engagement/events?page=1&pageSize=20',
      ).catch((err) => {
        console.error('[DashboardParentPage]', err);
        return { data: [], meta: { total: 0 } };
      }),
      financeEnabled
        ? Promise.all(
            studentIds.map((id) =>
              apiClient<{ data: ParentFinanceSummary }>(
                `/api/v1/parent/students/${id}/finances`,
              ).catch((err) => {
                console.error('[DashboardParentPage]', err);
                return { data: { invoices: [] } as ParentFinanceSummary };
              }),
            ),
          )
        : Promise.resolve([]),
    ])
      .then(([forms, eventsResponse, financeResponses]) => {
        const actionableEvents = (eventsResponse.data ?? []).filter((event) =>
          event.participants.some(
            (participant) =>
              participant.consent_status === 'pending' ||
              participant.payment_status === 'pending' ||
              ['invited', 'withdrawn'].includes(participant.status),
          ),
        ).length;

        // Aggregate outstanding invoices across all linked students, deduped by invoice id
        const seenInvoiceIds = new Set<string>();
        let outstandingPayments = 0;
        for (const res of financeResponses) {
          for (const invoice of res.data.invoices ?? []) {
            const invoiceId = (invoice as unknown as { id?: string }).id;
            if (invoiceId && seenInvoiceIds.has(invoiceId)) continue;
            if (invoiceId) seenInvoiceIds.add(invoiceId);
            if (['issued', 'partially_paid', 'overdue'].includes(invoice.status)) {
              outstandingPayments += 1;
            }
          }
        }

        setActionCenter({
          pendingForms: forms.length,
          actionableEvents,
          outstandingPayments,
        });
      })
      .catch((err) => console.error('[ParentDashboard] Failed to load action center', err));
  }, [data, financeEnabled]);

  const children =
    data?.students.map((s) => ({
      id: s.student_id,
      name: `${s.first_name} ${s.last_name}`,
    })) ?? [];

  const hasChildren = children.length > 0;
  const parentName = user?.first_name ?? data?.greeting.split(',').slice(1).join(',').trim() ?? '';
  const hour = new Date().getHours();
  const localizedGreeting =
    hour >= 17
      ? t('goodEvening', { name: parentName })
      : hour >= 12
        ? t('goodAfternoon', { name: parentName })
        : t('goodMorning', { name: parentName });

  return (
    <div className="space-y-6">
      {/* Greeting header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {loading ? t('welcome') : data ? localizedGreeting : t('welcome')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t('summaryLine')}</p>
      </div>

      {/* Top-level tabs */}
      {!loading && hasChildren && (
        <nav className="flex gap-1 border-b border-border">
          {(
            [
              {
                key: 'overview' as const,
                label: t('parentDashboard.overview'),
                icon: GraduationCap,
              },
              { key: 'grades' as const, label: t('parentDashboard.gradesTab'), icon: FileText },
              {
                key: 'timetable' as const,
                label: t('parentDashboard.timetableTab'),
                icon: Calendar,
              },
              ...(financeEnabled
                ? [
                    {
                      key: 'finances' as const,
                      label: t('parentDashboard.financesTab'),
                      icon: CreditCard,
                    },
                  ]
                : []),
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      )}

      {/* Overview tab */}
      {(activeTab === 'overview' || !hasChildren) && (
        <div className="space-y-8">
          {!loading && hasChildren && (
            <section className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 via-white to-amber-50 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-primary px-3 py-3 text-white">
                    <ClipboardCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      {t('parentDashboard.actionCenterTitle')}
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      {actionCenter.pendingForms +
                        actionCenter.actionableEvents +
                        actionCenter.outstandingPayments ===
                      0
                        ? t('parentDashboard.actionCenterClear')
                        : t('parentDashboard.actionCenterDescription')}
                    </p>
                  </div>
                </div>
                <Button asChild>
                  <Link href={`/${locale}/engagement/parent/events`}>
                    {t('parentDashboard.actionCenterCta')}
                  </Link>
                </Button>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-white/80 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-tertiary">
                    {t('parentDashboard.pendingForms')}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-text-primary">
                    {actionCenter.pendingForms}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-tertiary">
                    {t('parentDashboard.upcomingActions')}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-text-primary">
                    {actionCenter.actionableEvents}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/80 p-4">
                  <p className="text-xs uppercase tracking-wide text-text-tertiary">
                    {t('parentDashboard.outstandingPayments')}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-text-primary">
                    {actionCenter.outstandingPayments}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* AI Insight Card */}
          {!loading && hasChildren && <AiInsightCard students={data?.students ?? []} />}

          {/* Parent hub tiles — school navigation */}
          {!loading && hasChildren && (
            <section aria-label={t('parentDashboard.navTiles.ariaLabel')}>
              <h2 className="mb-3 text-base font-semibold text-text-primary">
                {t('parentDashboard.navTiles.title')}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {PARENT_NAV_TILES.map((tile) => (
                  <ParentNavTileCard key={tile.key} tile={tile} locale={locale} />
                ))}
              </div>
            </section>
          )}

          {/* Homework Today card */}
          {!loading && hasChildren && (hwToday.length > 0 || hwOverdue.length > 0) && (
            <section className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary-600" />
                  <h2 className="text-base font-semibold text-text-primary">
                    {t('parentDashboard.homeworkToday')}
                  </h2>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/${locale}/homework/parent`}>{tCommon('view')}</Link>
                </Button>
              </div>
              <div className="space-y-2">
                {data?.students.map((student) => {
                  const todayCount =
                    hwToday.find((s) => s.student.id === student.student_id)?.assignments.length ??
                    0;
                  const overdueCount =
                    hwOverdue.find((s) => s.student.id === student.student_id)?.assignments
                      .length ?? 0;
                  if (todayCount === 0 && overdueCount === 0) return null;
                  return (
                    <div
                      key={student.student_id}
                      className="flex items-center justify-between rounded-xl bg-surface-secondary px-4 py-2.5"
                    >
                      <span className="text-sm font-medium text-text-primary">
                        {student.first_name} {student.last_name}
                      </span>
                      <div className="flex items-center gap-3">
                        {todayCount > 0 && (
                          <span className="text-xs text-text-secondary">
                            {todayCount} {t('parentDashboard.dueToday')}
                          </span>
                        )}
                        {overdueCount > 0 && (
                          <span className="text-xs font-medium text-destructive">
                            {overdueCount} {t('parentDashboard.overdueLabel')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Unacknowledged notes badge */}
          {!loading && hasChildren && unacknowledgedNotes > 0 && (
            <Link
              href={`/${locale}/homework/parent`}
              className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100 dark:border-amber-800/40 dark:bg-amber-900/10 dark:hover:bg-amber-900/20"
            >
              <Bell className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {unacknowledgedNotes} {t('parentDashboard.unacknowledgedNotes')}
                </p>
                <p className="text-xs text-text-secondary">{t('parentDashboard.tapToViewNotes')}</p>
              </div>
            </Link>
          )}

          {!loading && (
            <section className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-text-primary">
                    {t('parentDashboard.privacyConsentTitle')}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t('parentDashboard.privacyConsentDescription')}
                  </p>
                </div>
                <Button asChild variant="outline">
                  <Link href={`/${locale}/privacy-consent`}>
                    {t('parentDashboard.managePrivacyConsent')}
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/${locale}/privacy-notice`}>
                    {t('parentDashboard.howWeUseYourData')}
                  </Link>
                </Button>
              </div>
            </section>
          )}

          {/* Linked students */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-primary">
              {t('parentDashboard.linkedStudents')}
            </h2>

            {loading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-24 rounded-2xl bg-surface-secondary animate-pulse" />
                ))}
              </div>
            ) : data && data.students.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.students.map((student) => (
                  <div
                    key={student.student_id}
                    className="rounded-2xl bg-surface-secondary p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700 flex-shrink-0">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {student.first_name} {student.last_name}
                          </p>
                          <p className="text-xs text-text-secondary">
                            {student.year_group_name ?? ''}
                          </p>
                        </div>
                      </div>
                      <StatusBadge status={studentStatusVariant(student.status)} dot>
                        {tStudents(`statuses.${student.status}`)}
                      </StatusBadge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={GraduationCap}
                title={t('parentDashboard.linkedStudents')}
                description={tCommon('noResults')}
              />
            )}
          </section>

          {/* Outstanding Invoices */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-primary">
              {t('parentDashboard.outstandingInvoices')}
            </h2>
            <EmptyState
              icon={FileText}
              title={t('parentDashboard.noInvoices')}
              description={t('parentDashboard.noInvoices')}
            />
          </section>

          {/* Recent Announcements */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-primary">
              {t('parentDashboard.recentAnnouncements')}
            </h2>
            <EmptyState
              icon={Bell}
              title={t('parentDashboard.noAnnouncements')}
              description={t('parentDashboard.noAnnouncements')}
            />
          </section>
        </div>
      )}

      {/* Grades tab */}
      {activeTab === 'grades' && hasChildren && (
        <section>
          <GradesTab students={children} />
        </section>
      )}

      {/* Timetable tab */}
      {activeTab === 'timetable' && hasChildren && (
        <section>
          <TimetableTab students={children} />
        </section>
      )}

      {/* Finances tab */}
      {financeEnabled && activeTab === 'finances' && (
        <section>
          <FinancesTab />
        </section>
      )}
    </div>
  );
}
