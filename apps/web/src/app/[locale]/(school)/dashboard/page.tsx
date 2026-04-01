'use client';

import { GraduationCap, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, StatCard } from '@school/ui';


import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import { EarlyWarningCard } from './_components/early-warning-card';


interface HouseholdNeedingCompletion {
  id: string;
  household_name: string;
  completion_issues: string[];
}

interface DashboardData {
  greeting: string;
  summary: string;
  stats: {
    total_students: number;
    active_students: number;
    applicants: number;
    total_staff: number;
    active_staff: number;
    total_classes: number;
    active_academic_year_name: string | null;
  };
  pending_approvals: number;
  incomplete_households: HouseholdNeedingCompletion[];
  admissions: {
    recent_submissions: number;
    pending_review: number;
    accepted: number;
  };
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Redirect non-admin roles to their specific dashboards
  useEffect(() => {
    if (!user?.memberships) return;
    const roleKeys = user.memberships.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []);
    const isAdmin = roleKeys.some((r) => r === 'school_principal' || r === 'admin');
    const isTeacher = roleKeys.includes('teacher');
    const isParent = roleKeys.includes('parent');

    if (!isAdmin) {
      if (isTeacher) {
        router.replace(`/${locale}/dashboard/teacher`);
      } else if (isParent) {
        router.replace(`/${locale}/dashboard/parent`);
      }
    }
  }, [user, router, locale]);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await apiClient<{ data: DashboardData }>('/api/v1/dashboard/school-admin');
      setData(result.data);
    } catch (err) {
      // Silently fall back to zero state — data remains null
      console.error('[setData]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const stats = {
    total_students: data?.stats?.total_students ?? 0,
    total_staff: data?.stats?.total_staff ?? 0,
    active_classes: data?.stats?.total_classes ?? 0,
    pending_approvals: data?.pending_approvals ?? 0,
  };

  return (
    <div className="space-y-8">
      {/* Greeting header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {(() => {
            if (loading || !user) return t('welcome');
            const hour = new Date().getHours();
            const key = hour < 12 ? 'goodMorning' : hour < 17 ? 'goodAfternoon' : 'goodEvening';
            return t(key, { name: user.first_name });
          })()}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t('summaryLine')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('totalStudents')} value={stats.total_students} />
        <StatCard label={t('totalStaff')} value={stats.total_staff} />
        <StatCard label={t('activeClasses')} value={stats.active_classes} />
        <StatCard label={t('pendingApprovals')} value={stats.pending_approvals} />
      </div>

      {/* Early Warning */}
      <EarlyWarningCard />

      {/* Households needing completion */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t('needsCompletion')}</h2>
          <Link
            href="/households"
            className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            {t('viewAll')}
          </Link>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-9 rounded-lg bg-surface animate-pulse" />
            ))}
          </div>
        ) : data && data.incomplete_households.length > 0 ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-1">
            {data.incomplete_households.map((household) => {
              const issueLabels: Record<string, string> = {
                missing_emergency_contact: t('missingEmergencyContact'),
                missing_billing_parent: t('missingBillingParent'),
              };
              return (
                <Link
                  key={household.id}
                  href={`/households/${household.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface transition-colors group"
                >
                  <span className="font-medium text-text-primary group-hover:text-primary-600 transition-colors">
                    {household.household_name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-warning-text">
                    {household.completion_issues.length > 0
                      ? household.completion_issues
                          .map((issue) => issueLabels[issue] ?? issue)
                          .join(' · ')
                      : t('incomplete')}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-secondary p-6 flex items-center justify-center">
            <p className="text-sm text-text-tertiary">{t('allHouseholdsComplete')}</p>
          </div>
        )}
      </section>

      {/* Today's Attendance */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t('todayAttendance')}</h2>
          <Link
            href="/attendance"
            className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            {t('viewAll')}
          </Link>
        </div>
        <EmptyState
          icon={GraduationCap}
          title={t('todayAttendance')}
          description={t('noAttendanceToday')}
        />
      </section>

      {/* Recent Admissions */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t('recentAdmissions')}</h2>
          <Link
            href="/admissions"
            className="text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors"
          >
            {t('viewAll')}
          </Link>
        </div>
        {data && (data.admissions.recent_submissions > 0 || data.admissions.pending_review > 0) ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-secondary p-4">
              <p className="text-xs text-text-tertiary">{t('recentSubmissions')}</p>
              <p className="text-lg font-semibold text-text-primary">
                {data.admissions.recent_submissions}
              </p>
            </div>
            <div className="rounded-xl bg-surface-secondary p-4">
              <p className="text-xs text-text-tertiary">{t('pendingReview')}</p>
              <p className="text-lg font-semibold text-warning-text">
                {data.admissions.pending_review}
              </p>
            </div>
            <div className="rounded-xl bg-surface-secondary p-4">
              <p className="text-xs text-text-tertiary">{t('accepted')}</p>
              <p className="text-lg font-semibold text-success-text">{data.admissions.accepted}</p>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={t('recentAdmissions')}
            description={t('noAdmissionsActivity')}
          />
        )}
      </section>
    </div>
  );
}
