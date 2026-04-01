'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button } from '@school/ui';

import { IncidentCard, type IncidentCardData } from '@/components/behaviour/incident-card';
import { StudentAnalyticsTab } from '@/components/behaviour/student-analytics-tab';
import { StudentBehaviourHeader } from '@/components/behaviour/student-behaviour-header';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentProfile {
  student_id: string;
  first_name: string;
  last_name: string;
  year_group_name: string | null;
  total_points: number;
  positive_count: number;
  negative_count: number;
}

interface StudentTask {
  id: string;
  title: string;
  task_type: string;
  priority: string;
  status: string;
  due_date: string | null;
  assigned_to_user?: { first_name: string; last_name: string } | null;
}

interface StudentIntervention {
  id: string;
  intervention_number: string;
  title: string;
  type: string;
  status: string;
  start_date: string | null;
  assigned_to: { first_name: string; last_name: string } | null;
}

interface StudentSanction {
  id: string;
  sanction_number: string;
  type: string;
  status: string;
  scheduled_date: string | null;
  served_at: string | null;
}

interface StudentAward {
  id: string;
  awarded_at: string;
  notes: string | null;
  award_type: {
    id: string;
    name: string;
    name_ar: string | null;
    icon: string | null;
    color: string | null;
    tier_group: string | null;
    tier_level: number | null;
  };
  awarded_by: { first_name: string; last_name: string } | null;
}

const TAB_KEYS = [
  'timeline',
  'analytics',
  'interventions',
  'sanctions',
  'awards',
  'tasks',
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  overdue: 'bg-red-100 text-red-700',
};

const INTERVENTION_STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  monitoring: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
  paused: 'bg-amber-100 text-amber-700',
};

const SANCTION_STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-700',
  scheduled: 'bg-blue-100 text-blue-700',
  served: 'bg-green-100 text-green-700',
  partially_served: 'bg-teal-100 text-teal-700',
  no_show: 'bg-red-100 text-red-700',
  excused: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-500',
  rescheduled: 'bg-purple-100 text-purple-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentBehaviourProfilePage() {
  const t = useTranslations('behaviour.studentProfile');
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const studentId = params?.studentId as string;

  const [profile, setProfile] = React.useState<StudentProfile | null>(null);
  const [incidents, setIncidents] = React.useState<IncidentCardData[]>([]);
  const [tasks, setTasks] = React.useState<StudentTask[]>([]);
  const [interventions, setInterventions] = React.useState<StudentIntervention[]>([]);
  const [sanctions, setSanctions] = React.useState<StudentSanction[]>([]);
  const [awards, setAwards] = React.useState<StudentAward[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tabLoading, setTabLoading] = React.useState<
    Partial<Record<(typeof TAB_KEYS)[number], boolean>>
  >({});
  const [activeTab, setActiveTab] = React.useState<(typeof TAB_KEYS)[number]>('timeline');

  React.useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    Promise.all([
      apiClient<{ data: StudentProfile }>(`/api/v1/behaviour/students/${studentId}`)
        .then((res) => setProfile(res.data))
        .catch(() => setProfile(null)),
      apiClient<{ data: IncidentCardData[] }>(
        `/api/v1/behaviour/incidents?student_id=${studentId}&pageSize=50&sort=occurred_at&order=desc`,
      )
        .then((res) => setIncidents(res.data ?? []))
        .catch(() => setIncidents([])),
      apiClient<{ data: StudentTask[] }>(
        `/api/v1/behaviour/tasks?entity_type=incident&pageSize=50&student_id=${studentId}`,
      )
        .then((res) => setTasks(res.data ?? []))
        .catch(() => setTasks([])),
    ]).finally(() => setLoading(false));
  }, [studentId]);

  // Lazy-load tab data when a deferred tab is first activated
  React.useEffect(() => {
    if (!studentId) return;

    if (activeTab === 'interventions' && interventions.length === 0 && !tabLoading.interventions) {
      setTabLoading((prev) => ({ ...prev, interventions: true }));
      apiClient<{ data: StudentIntervention[] }>(
        `/api/v1/behaviour/students/${studentId}/interventions?pageSize=50`,
      )
        .then((res) => setInterventions(res.data ?? []))
        .catch(() => setInterventions([]))
        .finally(() => setTabLoading((prev) => ({ ...prev, interventions: false })));
    }

    if (activeTab === 'sanctions' && sanctions.length === 0 && !tabLoading.sanctions) {
      setTabLoading((prev) => ({ ...prev, sanctions: true }));
      apiClient<{ data: StudentSanction[] }>(
        `/api/v1/behaviour/students/${studentId}/sanctions?pageSize=50`,
      )
        .then((res) => setSanctions(res.data ?? []))
        .catch(() => setSanctions([]))
        .finally(() => setTabLoading((prev) => ({ ...prev, sanctions: false })));
    }

    if (activeTab === 'awards' && awards.length === 0 && !tabLoading.awards) {
      setTabLoading((prev) => ({ ...prev, awards: true }));
      apiClient<{ data: StudentAward[] }>(
        `/api/v1/behaviour/students/${studentId}/awards?pageSize=50`,
      )
        .then((res) => setAwards(res.data ?? []))
        .catch(() => setAwards([]))
        .finally(() => setTabLoading((prev) => ({ ...prev, awards: false })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, studentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('notFound')} />
        <p className="text-sm text-text-tertiary">{t('notFoundDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Link href={`/${locale}/behaviour/students`}>
            <Button variant="ghost">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('back')}
            </Button>
          </Link>
        }
      />

      <StudentBehaviourHeader
        studentName={`${profile.first_name} ${profile.last_name}`}
        yearGroup={profile.year_group_name}
        totalPoints={profile.total_points}
        positiveCount={profile.positive_count}
        negativeCount={profile.negative_count}
      />

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {t(`tabs.${key}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'timeline' && (
        <div className="space-y-2">
          {incidents.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-tertiary">{t('noIncidents')}</p>
          ) : (
            incidents.map((inc) => (
              <IncidentCard
                key={inc.id}
                incident={inc}
                onClick={() => router.push(`/${locale}/behaviour/incidents/${inc.id}`)}
              />
            ))
          )}
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-tertiary">{t('noTasks')}</p>
          ) : (
            tasks.map((task) => (
              <div
                key={task.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">{task.title}</p>
                  <p className="text-xs text-text-tertiary capitalize">
                    {task.task_type.replace(/_/g, ' ')}
                  </p>
                </div>
                <Badge variant="secondary" className={PRIORITY_COLORS[task.priority] ?? ''}>
                  {task.priority}
                </Badge>
                <Badge variant="secondary" className={TASK_STATUS_COLORS[task.status] ?? ''}>
                  {task.status.replace(/_/g, ' ')}
                </Badge>
                {task.due_date && (
                  <span className="text-xs text-text-tertiary">{formatDate(task.due_date)}</span>
                )}
                {task.assigned_to_user && (
                  <span className="text-xs text-text-tertiary">
                    {task.assigned_to_user.first_name} {task.assigned_to_user.last_name}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'analytics' && <StudentAnalyticsTab studentId={studentId} />}

      {activeTab === 'interventions' && (
        <div className="space-y-2">
          {tabLoading.interventions ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
            </div>
          ) : interventions.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-tertiary">{t('noInterventions')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    <th className="ps-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('interventionColumns.title')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('interventionColumns.type')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('interventionColumns.status')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('interventionColumns.assignedTo')}
                    </th>
                    <th className="pe-4 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('interventionColumns.startDate')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {interventions.map((intervention) => (
                    <tr key={intervention.id} className="hover:bg-surface-hover transition-colors">
                      <td className="ps-4 py-3 font-medium text-text-primary">
                        {intervention.title}
                      </td>
                      <td className="px-4 py-3 text-text-secondary capitalize">
                        {intervention.type.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className={INTERVENTION_STATUS_COLORS[intervention.status] ?? ''}
                        >
                          {intervention.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {intervention.assigned_to
                          ? `${intervention.assigned_to.first_name} ${intervention.assigned_to.last_name}`
                          : '—'}
                      </td>
                      <td className="pe-4 px-4 py-3 text-text-tertiary">
                        {intervention.start_date ? formatDate(intervention.start_date) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sanctions' && (
        <div className="space-y-2">
          {tabLoading.sanctions ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
            </div>
          ) : sanctions.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-tertiary">{t('noSanctions')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    <th className="ps-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('sanctionColumns.type')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('sanctionColumns.status')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('sanctionColumns.scheduledDate')}
                    </th>
                    <th className="pe-4 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('sanctionColumns.servedDate')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {sanctions.map((sanction) => (
                    <tr key={sanction.id} className="hover:bg-surface-hover transition-colors">
                      <td className="ps-4 py-3 font-medium text-text-primary capitalize">
                        {sanction.type.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className={SANCTION_STATUS_COLORS[sanction.status] ?? ''}
                        >
                          {sanction.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {sanction.scheduled_date ? formatDate(sanction.scheduled_date) : '—'}
                      </td>
                      <td className="pe-4 px-4 py-3 text-text-secondary">
                        {sanction.served_at ? formatDate(sanction.served_at) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'awards' && (
        <div className="space-y-2">
          {tabLoading.awards ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
            </div>
          ) : awards.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-tertiary">{t('noAwards')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-hover">
                    <th className="ps-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('awardColumns.awardName')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('awardColumns.tier')}
                    </th>
                    <th className="px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('awardColumns.dateAwarded')}
                    </th>
                    <th className="pe-4 px-4 py-3 text-start text-xs font-medium uppercase tracking-wide text-text-tertiary">
                      {t('awardColumns.reason')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface">
                  {awards.map((award) => (
                    <tr key={award.id} className="hover:bg-surface-hover transition-colors">
                      <td className="ps-4 py-3">
                        <div className="flex items-center gap-2">
                          {award.award_type.icon && (
                            <span className="text-base">{award.award_type.icon}</span>
                          )}
                          <span className="font-medium text-text-primary">
                            {award.award_type.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {award.award_type.tier_group != null &&
                        award.award_type.tier_level != null ? (
                          <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                            {award.award_type.tier_group} {award.award_type.tier_level}
                          </Badge>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDate(award.awarded_at)}
                      </td>
                      <td className="pe-4 px-4 py-3 text-text-secondary">{award.notes ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
