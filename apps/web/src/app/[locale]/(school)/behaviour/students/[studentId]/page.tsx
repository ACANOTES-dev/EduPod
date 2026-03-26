'use client';

import { Badge, Button } from '@school/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { IncidentCard, type IncidentCardData } from '@/components/behaviour/incident-card';
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

const TABS = ['Timeline', 'Analytics', 'Interventions', 'Sanctions', 'Awards', 'Tasks'] as const;

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentBehaviourProfilePage() {
  const params = useParams();
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const studentId = params?.studentId as string;

  const [profile, setProfile] = React.useState<StudentProfile | null>(null);
  const [incidents, setIncidents] = React.useState<IncidentCardData[]>([]);
  const [tasks, setTasks] = React.useState<StudentTask[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<(typeof TABS)[number]>('Timeline');

  React.useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    Promise.all([
      apiClient<{ data: StudentProfile }>(`/api/v1/behaviour/students/${studentId}`)
        .then((res) => setProfile(res.data))
        .catch(() => setProfile(null)),
      apiClient<{ data: IncidentCardData[] }>(`/api/v1/behaviour/incidents?student_id=${studentId}&pageSize=50&sort=occurred_at&order=desc`)
        .then((res) => setIncidents(res.data ?? []))
        .catch(() => setIncidents([])),
      apiClient<{ data: StudentTask[] }>(`/api/v1/behaviour/tasks?entity_type=incident&pageSize=50&student_id=${studentId}`)
        .then((res) => setTasks(res.data ?? []))
        .catch(() => setTasks([])),
    ]).finally(() => setLoading(false));
  }, [studentId]);

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
        <PageHeader title="Student Not Found" />
        <p className="text-sm text-text-tertiary">Could not load student behaviour profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Profile"
        actions={
          <Link href={`/${locale}/behaviour/students`}>
            <Button variant="ghost">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              Back
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
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'Timeline' && (
        <div className="space-y-2">
          {incidents.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-tertiary">No incidents recorded</p>
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

      {activeTab === 'Tasks' && (
        <div className="space-y-2">
          {tasks.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-tertiary">No tasks for this student</p>
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

      {activeTab === 'Analytics' && (
        <div className="rounded-xl border border-dashed border-border bg-surface py-12 text-center">
          <p className="text-sm font-medium text-text-tertiary">Analytics</p>
          <p className="mt-1 text-xs text-text-tertiary">Coming in Phase E</p>
        </div>
      )}

      {activeTab === 'Interventions' && (
        <div className="rounded-xl border border-dashed border-border bg-surface py-12 text-center">
          <p className="text-sm font-medium text-text-tertiary">Interventions</p>
          <p className="mt-1 text-xs text-text-tertiary">Coming in Phase C</p>
        </div>
      )}

      {activeTab === 'Sanctions' && (
        <div className="rounded-xl border border-dashed border-border bg-surface py-12 text-center">
          <p className="text-sm font-medium text-text-tertiary">Sanctions</p>
          <p className="mt-1 text-xs text-text-tertiary">Coming in Phase C</p>
        </div>
      )}

      {activeTab === 'Awards' && (
        <div className="rounded-xl border border-dashed border-border bg-surface py-12 text-center">
          <p className="text-sm font-medium text-text-tertiary">Awards</p>
          <p className="mt-1 text-xs text-text-tertiary">Coming in Phase B</p>
        </div>
      )}
    </div>
  );
}
