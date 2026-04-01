'use client';

import { BookOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { toast } from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ChildSwitcher } from './_components/child-switcher';
import { OverdueAlertCard } from './_components/overdue-alert-card';
import { ParentHomeworkList } from './_components/parent-homework-list';


// ─── Types ────────────────────────────────────────────────────────────────────

interface Assignment {
  id: string;
  title: string;
  description: string | null;
  homework_type: string;
  due_date: string;
  due_time: string | null;
  max_points: number | null;
  subject: { id: string; name: string } | null;
  class_entity: { id: string; name: string };
  completion: {
    status: string;
    completed_at: string | null;
    points_awarded: number | null;
  } | null;
}

interface StudentHomework {
  student: { id: string; first_name: string; last_name: string };
  assignments: Assignment[];
}

interface DayGroup {
  date: string;
  students: StudentHomework[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentHomeworkPage() {
  const t = useTranslations('homework');

  const [todayData, setTodayData] = React.useState<StudentHomework[]>([]);
  const [overdueData, setOverdueData] = React.useState<StudentHomework[]>([]);
  const [weekData, setWeekData] = React.useState<DayGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [activeChildId, setActiveChildId] = React.useState<string | null>(null);
  const [markingId, setMarkingId] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [todayRes, overdueRes, weekRes] = await Promise.all([
        apiClient<{ data: StudentHomework[] }>('/api/v1/parent/homework/today'),
        apiClient<{ data: StudentHomework[] }>('/api/v1/parent/homework/overdue'),
        apiClient<{ data: DayGroup[] }>('/api/v1/parent/homework/week'),
      ]);
      setTodayData(todayRes.data ?? []);
      setOverdueData(overdueRes.data ?? []);
      setWeekData(weekRes.data ?? []);

      // Auto-select first child
      const allStudents = todayRes.data ?? [];
      if (allStudents.length > 0 && allStudents[0]) {
        setActiveChildId((prev) => prev ?? allStudents[0]!.student.id);
      } else {
        // Try overdue
        const overdueStudents = overdueRes.data ?? [];
        if (overdueStudents.length > 0 && overdueStudents[0]) {
          setActiveChildId((prev) => prev ?? overdueStudents[0]!.student.id);
        }
      }
    } catch {
      console.error('[ParentHomework] Failed to load homework data');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ─── Derive children list ─────────────────────────────────────────────────

  const children = React.useMemo(() => {
    const studentMap = new Map<string, string>();
    const addStudents = (items: StudentHomework[]) => {
      for (const item of items) {
        if (!studentMap.has(item.student.id)) {
          studentMap.set(item.student.id, `${item.student.first_name} ${item.student.last_name}`);
        }
      }
    };
    addStudents(todayData);
    addStudents(overdueData);
    for (const day of weekData) {
      addStudents(day.students);
    }
    return Array.from(studentMap.entries()).map(([id, name]) => ({ id, name }));
  }, [todayData, overdueData, weekData]);

  // Auto-select first child if none selected
  React.useEffect(() => {
    if (!activeChildId && children.length > 0 && children[0]) {
      setActiveChildId(children[0].id);
    }
  }, [activeChildId, children]);

  // ─── Per-child data ───────────────────────────────────────────────────────

  const childTodayAssignments = React.useMemo(() => {
    return todayData.find((s) => s.student.id === activeChildId)?.assignments ?? [];
  }, [todayData, activeChildId]);

  const childOverdueAssignments = React.useMemo(() => {
    return overdueData.find((s) => s.student.id === activeChildId)?.assignments ?? [];
  }, [overdueData, activeChildId]);

  const childWeekAssignments = React.useMemo(() => {
    const result: Assignment[] = [];
    for (const day of weekData) {
      const studentEntry = day.students.find((s) => s.student.id === activeChildId);
      if (studentEntry) {
        result.push(...studentEntry.assignments);
      }
    }
    return result;
  }, [weekData, activeChildId]);

  // Overdue badge counts
  const overdueBadges = React.useMemo(() => {
    const badges: Record<string, number> = {};
    for (const s of overdueData) {
      badges[s.student.id] = s.assignments.length;
    }
    return badges;
  }, [overdueData]);

  // ─── Mark as done ─────────────────────────────────────────────────────────

  const handleMarkDone = React.useCallback(
    async (assignmentId: string) => {
      setMarkingId(assignmentId);
      try {
        await apiClient(`/api/v1/homework/${assignmentId}/completions`, {
          method: 'POST',
          body: JSON.stringify({ status: 'completed' }),
        });
        toast.success(t('parent.markAsDoneSuccess'));
        void fetchData();
      } catch {
        toast.error(t('common.errorGeneric'));
      } finally {
        setMarkingId(null);
      }
    },
    [fetchData, t],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('parent.title')} description={t('parent.description')} />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  const isEmpty = todayData.length === 0 && overdueData.length === 0 && weekData.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('parent.title')} description={t('parent.description')} />

      {isEmpty ? (
        <div className="rounded-xl border border-border bg-surface py-16 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-text-tertiary/30" />
          <p className="mt-3 text-sm text-text-primary">{t('parent.noHomework')}</p>
        </div>
      ) : (
        <>
          {/* Child switcher */}
          <ChildSwitcher
            childList={children}
            activeId={activeChildId ?? ''}
            onSelect={setActiveChildId}
            badges={overdueBadges}
          />

          {/* Overdue section */}
          {childOverdueAssignments.length > 0 && (
            <section>
              <h2 className="mb-3 text-base font-semibold text-destructive">
                {t('parent.overdue')} ({childOverdueAssignments.length})
              </h2>
              <div className="space-y-2">
                {childOverdueAssignments.map((assignment) => (
                  <OverdueAlertCard
                    key={assignment.id}
                    assignment={assignment}
                    studentName={children.find((c) => c.id === activeChildId)?.name ?? ''}
                    onMarkDone={handleMarkDone}
                    showCompletionToggle
                    markingId={markingId}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Today's homework */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-primary">{t('parent.today')}</h2>
            <ParentHomeworkList
              assignments={childTodayAssignments}
              onMarkDone={handleMarkDone}
              showCompletionToggle
              markingId={markingId}
            />
          </section>

          {/* This week */}
          <section>
            <h2 className="mb-3 text-base font-semibold text-text-primary">
              {t('parent.thisWeek')}
            </h2>
            <ParentHomeworkList
              assignments={childWeekAssignments}
              onMarkDone={handleMarkDone}
              showCompletionToggle
              markingId={markingId}
            />
          </section>
        </>
      )}
    </div>
  );
}
