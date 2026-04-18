'use client';

import { BookOpen, Calendar, Download, FileText, GraduationCap, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, StatusBadge } from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfile {
  student_id: string;
  first_name: string;
  last_name: string;
  class_name: string | null;
  year_group_name: string | null;
}

interface ReportCard {
  id: string;
  academic_period_name: string | null;
  academic_year_name: string;
  published_at: string;
  status: string;
}

interface SubjectGrade {
  subject_name: string;
  final_score: number | null;
  final_letter: string | null;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function StudentDashboardPage() {
  const t = useTranslations('dashboard');
  const trc = useTranslations('reportCards');
  const tc = useTranslations('common');
  const locale = useLocale();
  const { user } = useAuth();

  const [profile, setProfile] = React.useState<StudentProfile | null>(null);
  const [reportCards, setReportCards] = React.useState<ReportCard[]>([]);
  const [grades, setGrades] = React.useState<SubjectGrade[]>([]);
  const [loading, setLoading] = React.useState(true);

  const firstName = user?.first_name ?? '';

  React.useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      try {
        // Fetch student profile — the dashboard/student endpoint returns
        // the student record linked to the authenticated user
        const profileRes = await apiClient<{ data: StudentProfile }>('/api/v1/dashboard/student', {
          silent: true,
        }).catch(() => null);

        if (cancelled) return;

        if (profileRes?.data) {
          setProfile(profileRes.data);

          // Fetch report cards and grades for this student
          const studentId = profileRes.data.student_id;
          const [rcRes, gradesRes] = await Promise.all([
            apiClient<ListResponse<ReportCard>>(
              `/api/v1/parent/students/${studentId}/report-cards`,
              { silent: true },
            ).catch(() => ({ data: [] })),
            apiClient<{ data: { grades: SubjectGrade[] } }>(
              `/api/v1/gradebook/student-grades?student_id=${studentId}`,
              { silent: true },
            ).catch(() => ({ data: { grades: [] } })),
          ]);

          if (!cancelled) {
            setReportCards(rcRes.data ?? []);
            setGrades(gradesRes.data?.grades ?? []);
          }
        }
      } catch (err) {
        console.error('[StudentDashboard]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Greeting */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-text-primary">
          {t('greeting', { name: firstName })}
        </h1>
        {profile && (
          <p className="text-sm text-text-secondary">
            {profile.class_name && `${profile.class_name}`}
            {profile.year_group_name && ` · ${profile.year_group_name}`}
          </p>
        )}
      </div>

      {/* Timetable quick link (SCHED-032) */}
      <Link
        href={`/${locale}/dashboard/student/timetable`}
        className="group flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm transition-colors hover:bg-primary/10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Calendar className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">{t('todaysSchedule')}</p>
            <p className="text-xs text-text-secondary">{t('parentDashboard.viewTimetable')}</p>
          </div>
        </div>
        <span className="text-xs font-medium text-primary group-hover:underline">→</span>
      </Link>

      {/* Homework quick link (Wave 3) */}
      <Link
        href={`/${locale}/dashboard/student/homework`}
        className="group flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm transition-colors hover:bg-primary/10"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <BookOpen className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">{t('myHomework')}</p>
            <p className="text-xs text-text-secondary">{t('myHomeworkDesc')}</p>
          </div>
        </div>
        <span className="text-xs font-medium text-primary group-hover:underline">→</span>
      </Link>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2 text-text-secondary">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-medium">{trc('title')}</span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
            {reportCards.length}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2 text-text-secondary">
            <BookOpen className="h-4 w-4" />
            <span className="text-xs font-medium">{tc('subjects')}</span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">{grades.length}</p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2 text-text-secondary">
            <GraduationCap className="h-4 w-4" />
            <span className="text-xs font-medium">{tc('status')}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-success-600">{tc('active')}</p>
        </div>
      </div>

      {/* Report cards section */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-text-primary">{trc('title')}</h2>
        {reportCards.length === 0 ? (
          <EmptyState icon={FileText} title={trc('noReportCards')} />
        ) : (
          <div className="space-y-2">
            {reportCards.map((rc) => (
              <div
                key={rc.id}
                className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-text-primary">
                    {rc.academic_period_name ?? rc.academic_year_name}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {new Date(rc.published_at).toLocaleDateString(
                      locale === 'ar' ? 'ar-u-ca-gregory-nu-latn' : 'en-GB',
                      { day: 'numeric', month: 'short', year: 'numeric' },
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status="success">{trc('statusPublished')}</StatusBadge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-h-11"
                    onClick={() => {
                      window.open(`/api/v1/report-cards/${rc.id}/pdf`, '_blank');
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Current grades section */}
      {grades.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-text-primary">{tc('grades')}</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-secondary text-start">
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {tc('subject')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {tc('score')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {tc('grade')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {grades.map((g) => (
                  <tr key={g.subject_name} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">{g.subject_name}</td>
                    <td className="px-4 py-3 tabular-nums text-text-secondary">
                      {g.final_score != null ? `${g.final_score.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{g.final_letter ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
