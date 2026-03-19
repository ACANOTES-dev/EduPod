'use client';

import { useCallback, useEffect, useState } from 'react';

import { GraduationCap, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EmptyState, StatCard } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface HouseholdNeedingCompletion {
  id: string;
  household_name: string;
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
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await apiClient<{ data: DashboardData }>('/api/v1/dashboard/school-admin');
      setData(result.data);
    } catch {
      // Silently fall back to zero state — data remains null
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
          {loading ? t('welcome') : data ? data.greeting : t('welcome')}
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
            {data.incomplete_households.map((household) => (
              <Link
                key={household.id}
                href={`/households/${household.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface transition-colors group"
              >
                <span className="font-medium text-text-primary group-hover:text-primary-600 transition-colors">
                  {household.household_name}
                </span>
                <span className="text-xs text-warning-text">Incomplete</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-secondary p-6 flex items-center justify-center">
            <p className="text-sm text-text-tertiary">All households are complete.</p>
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
          description="No attendance sessions recorded today."
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
              <p className="text-xs text-text-tertiary">Recent Submissions</p>
              <p className="text-lg font-semibold text-text-primary">{data.admissions.recent_submissions}</p>
            </div>
            <div className="rounded-xl bg-surface-secondary p-4">
              <p className="text-xs text-text-tertiary">Pending Review</p>
              <p className="text-lg font-semibold text-warning-text">{data.admissions.pending_review}</p>
            </div>
            <div className="rounded-xl bg-surface-secondary p-4">
              <p className="text-xs text-text-tertiary">Accepted</p>
              <p className="text-lg font-semibold text-success-text">{data.admissions.accepted}</p>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title={t('recentAdmissions')}
            description="No admissions activity yet."
          />
        )}
      </section>
    </div>
  );
}
