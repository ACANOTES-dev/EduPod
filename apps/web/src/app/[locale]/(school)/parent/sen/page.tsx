'use client';

import { Eye, HeartHandshake } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, Skeleton, StatusBadge } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LinkedStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  year_group_name: string | null;
  status: string;
}

interface SenProfileSummary {
  id: string;
  student_id: string;
  student_name: string;
  student_year_group: string | null;
  primary_category: string;
  support_level: string;
  is_active: boolean;
  has_active_plan: boolean;
  active_plan_id: string | null;
}

interface StudentSenData {
  student: LinkedStudent;
  profile: SenProfileSummary | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentSenOverviewPage() {
  const t = useTranslations('sen');
  const locale = useLocale();

  const [studentData, setStudentData] = React.useState<StudentSenData[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const studentsRes = await apiClient<{ data: LinkedStudent[] }>('/api/v1/students/my', {
          silent: true,
        });
        const students = studentsRes.data ?? [];

        const results: StudentSenData[] = await Promise.all(
          students.map(async (student) => {
            try {
              const profileRes = await apiClient<{ data: SenProfileSummary }>(
                `/api/v1/sen/students/${student.id}/profile`,
                { silent: true },
              );
              return { student, profile: profileRes.data };
            } catch {
              return { student, profile: null };
            }
          }),
        );

        if (!cancelled) {
          setStudentData(results);
        }
      } catch {
        console.error('[ParentSenOverview] Failed to load student data');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('parent.title')} description={t('parent.description')} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={`skel-${i}`} className="h-48 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Empty state ────────────────────────────────────────────────────────────

  const studentsWithProfiles = studentData.filter((d) => d.profile !== null);

  if (studentData.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('parent.title')} description={t('parent.description')} />
        <EmptyState
          icon={HeartHandshake}
          title={t('parent.noStudents')}
          description={t('parent.noStudentsDescription')}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('parent.title')} description={t('parent.description')} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {studentData.map(({ student, profile }) => (
          <div
            key={student.id}
            className="rounded-2xl border border-border bg-surface p-6 space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">
                  {student.first_name} {student.last_name}
                </h3>
                <p className="text-sm text-text-secondary">{student.year_group_name ?? '—'}</p>
              </div>
              {profile ? (
                <StatusBadge status={profile.is_active ? 'success' : 'neutral'}>
                  {profile.is_active ? t('profile.isActive') : t('profile.inactive')}
                </StatusBadge>
              ) : null}
            </div>

            {profile ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-text-tertiary">{t('profile.primaryCategory')}</p>
                    <p className="text-sm font-medium text-text-primary">
                      {t(`category.${profile.primary_category}`)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-tertiary">{t('profile.supportLevel')}</p>
                    <p className="text-sm font-medium text-text-primary">
                      {t(`supportLevel.${profile.support_level}`)}
                    </p>
                  </div>
                </div>

                {profile.has_active_plan && profile.active_plan_id && (
                  <div className="pt-2">
                    <Link href={`/${locale}/parent/sen/${profile.active_plan_id}`}>
                      <Button variant="outline" size="sm" className="w-full sm:w-auto">
                        <Eye className="me-2 h-4 w-4" />
                        {t('parent.viewPlan')}
                      </Button>
                    </Link>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-text-tertiary">{t('parent.noSenProfile')}</p>
            )}
          </div>
        ))}
      </div>

      {studentsWithProfiles.length === 0 && studentData.length > 0 && (
        <p className="text-center text-sm text-text-tertiary">{t('parent.noProfilesOnFile')}</p>
      )}
    </div>
  );
}
