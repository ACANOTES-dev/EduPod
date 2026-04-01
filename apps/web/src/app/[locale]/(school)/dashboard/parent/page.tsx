'use client';

import {
  Bell,
  BookOpen,
  Calendar,
  ClipboardCheck,
  CreditCard,
  FileText,
  GraduationCap,
} from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Button, EmptyState, StatusBadge } from '@school/ui';

import { AiInsightCard } from './_components/ai-insight-card';
import { FinancesTab } from './_components/finances-tab';
import { GradesTab } from './_components/grades-tab';
import { TimetableTab } from './_components/timetable-tab';

import { apiClient } from '@/lib/api-client';

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
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ParentTab>('overview');
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
      apiClient<{ data: typeof hwToday }>('/api/v1/parent/homework/today').catch(() => ({
        data: [] as typeof hwToday,
      })),
      apiClient<{ data: typeof hwOverdue }>('/api/v1/parent/homework/overdue').catch(() => ({
        data: [] as typeof hwOverdue,
      })),
    ])
      .then(([todayRes, overdueRes]) => {
        setHwToday(todayRes.data ?? []);
        setHwOverdue(overdueRes.data ?? []);
      })
      .catch(() => console.error('[ParentDashboard] Failed to load homework summary'));
  }, []);

  // Fetch unacknowledged notes count across all children
  useEffect(() => {
    if (!data?.students.length) return;
    Promise.all(
      data.students.map((s) =>
        apiClient<{ data: Array<{ acknowledged: boolean }>; meta: { total: number } }>(
          `/api/v1/diary/${s.student_id}/parent-notes?page=1&pageSize=50`,
        ).catch(() => ({ data: [] as Array<{ acknowledged: boolean }>, meta: { total: 0 } })),
      ),
    )
      .then((results) => {
        let count = 0;
        for (const res of results) {
          count += (res.data ?? []).filter((n) => !n.acknowledged).length;
        }
        setUnacknowledgedNotes(count);
      })
      .catch(() => console.error('[ParentDashboard] Failed to load notes count'));
  }, [data]);

  useEffect(() => {
    Promise.all([
      apiClient<ParentPendingForm[]>('/api/v1/parent/engagement/pending-forms').catch(() => []),
      apiClient<{ data: ParentEngagementEvent[]; meta: { total: number } }>(
        '/api/v1/parent/engagement/events?page=1&pageSize=20',
      ).catch(() => ({ data: [], meta: { total: 0 } })),
      apiClient<{ data: ParentFinanceSummary }>('/api/v1/parent/finances').catch(() => ({
        data: { invoices: [] },
      })),
    ])
      .then(([forms, eventsResponse, financeResponse]) => {
        const actionableEvents = (eventsResponse.data ?? []).filter((event) =>
          event.participants.some(
            (participant) =>
              participant.consent_status === 'pending' ||
              participant.payment_status === 'pending' ||
              ['invited', 'withdrawn'].includes(participant.status),
          ),
        ).length;

        const outstandingPayments = financeResponse.data.invoices.filter((invoice) =>
          ['issued', 'partially_paid', 'overdue'].includes(invoice.status),
        ).length;

        setActionCenter({
          pendingForms: forms.length,
          actionableEvents,
          outstandingPayments,
        });
      })
      .catch((err) => console.error('[ParentDashboard] Failed to load action center', err));
  }, []);

  const children =
    data?.students.map((s) => ({
      id: s.student_id,
      name: `${s.first_name} ${s.last_name}`,
    })) ?? [];

  const hasChildren = children.length > 0;

  return (
    <div className="space-y-6">
      {/* Greeting header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {loading ? t('welcome') : data ? data.greeting : t('welcome')}
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
              {
                key: 'finances' as const,
                label: t('parentDashboard.financesTab'),
                icon: CreditCard,
              },
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
      {activeTab === 'finances' && (
        <section>
          <FinancesTab />
        </section>
      )}
    </div>
  );
}
