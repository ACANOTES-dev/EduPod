'use client';

import { useCallback, useEffect, useState } from 'react';

import { Bell, FileText, GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState, StatusBadge } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { GradesTab } from './_components/grades-tab';

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

export default function ParentDashboardPage() {
  const t = useTranslations('dashboard');
  const tStudents = useTranslations('students');
  const tCommon = useTranslations('common');
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const result = await apiClient<{ data: ParentDashboardData }>('/api/v1/dashboard/parent');
      setData(result.data);
    } catch {
      // Silently fall back to empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  const children =
    data?.students.map((s) => ({
      id: s.student_id,
      name: `${s.first_name} ${s.last_name}`,
    })) ?? [];

  return (
    <div className="space-y-8">
      {/* Greeting header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
          {loading ? t('welcome') : data ? data.greeting : t('welcome')}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{t('summaryLine')}</p>
      </div>

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
                      <p className="text-xs text-text-secondary">{student.year_group_name ?? ''}</p>
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

      {/* Grades & Report Cards */}
      {!loading && children.length > 0 && (
        <section>
          <GradesTab students={children} />
        </section>
      )}

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
  );
}
