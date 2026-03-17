'use client';

import { useCallback, useEffect, useState } from 'react';

import { GraduationCap, Users } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { EmptyState, StatCard } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface HouseholdNeedingCompletion {
  id: string;
  name: string;
}

interface DashboardData {
  user_name: string;
  total_students: number;
  total_staff: number;
  active_classes: number;
  pending_approvals: number;
  households_needing_completion: HouseholdNeedingCompletion[];
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  return `Good evening, ${name}`;
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
    total_students: data?.total_students ?? 0,
    total_staff: data?.total_staff ?? 0,
    active_classes: data?.active_classes ?? 0,
    pending_approvals: data?.pending_approvals ?? 0,
  };

  return (
    <div className="space-y-8">
      {/* Greeting header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {loading ? t('welcome') : data ? getGreeting(data.user_name) : t('welcome')}
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
        ) : data && data.households_needing_completion.length > 0 ? (
          <div className="rounded-2xl bg-surface-secondary p-4 space-y-1">
            {data.households_needing_completion.map((household) => (
              <Link
                key={household.id}
                href={`/households/${household.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface transition-colors group"
              >
                <span className="font-medium text-text-primary group-hover:text-primary-600 transition-colors">
                  {household.name}
                </span>
                <span className="text-xs text-warning-text">Incomplete</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl bg-surface-secondary p-6 flex items-center justify-center">
            <p className="text-sm text-text-tertiary">{t('comingSoon')}</p>
          </div>
        )}
      </section>

      {/* Today's Attendance — placeholder */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">{t('todayAttendance')}</h2>
        </div>
        <EmptyState
          icon={GraduationCap}
          title={t('todayAttendance')}
          description={t('comingSoon')}
        />
      </section>

      {/* Recent Admissions — placeholder */}
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
        <EmptyState
          icon={Users}
          title={t('recentAdmissions')}
          description={t('comingSoon')}
        />
      </section>
    </div>
  );
}
