'use client';

import {
  Badge,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@school/ui';
import { ChevronDown, ChevronUp, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeroomClass {
  id: string;
  name: string;
  enrolled_count: number;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string;
  current_homeroom_class_id: string | null;
  current_homeroom_class_name: string | null;
}

interface YearGroup {
  id: string;
  name: string;
  display_order: number;
  homeroom_classes: HomeroomClass[];
  students: Student[];
}

interface ClassAssignmentsResponse {
  data: {
    year_groups: YearGroup[];
    unassigned_count: number;
  };
}

interface BulkAssignResponse {
  data: {
    assigned: number;
    skipped: number;
    errors: string[];
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassAssignmentsPage() {
  const t = useTranslations('classAssignments');

  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [showUnassignedOnly, setShowUnassignedOnly] = React.useState(false);
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = React.useState<Map<string, string>>(new Map());

  const fetchData = React.useCallback(() => {
    setLoading(true);
    apiClient<ClassAssignmentsResponse>('/api/v1/class-assignments')
      .then((res) => {
        const groups = res.data.year_groups;
        setYearGroups(groups);
        // Auto-expand all groups on first load
        setExpandedGroups(new Set(groups.map((g) => g.id)));
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleClassChange = (studentId: string, classId: string, currentClassId: string | null) => {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      // If the selection matches the student's current assignment, remove the pending change
      if (classId === currentClassId) {
        next.delete(studentId);
      } else {
        next.set(studentId, classId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (pendingChanges.size === 0) {
      toast.info(t('noChanges'));
      return;
    }

    setSaving(true);
    try {
      const assignments = Array.from(pendingChanges.entries()).map(([student_id, class_id]) => ({
        student_id,
        class_id,
      }));

      const today = new Date().toISOString().split('T')[0];

      const result = await apiClient<BulkAssignResponse>('/api/v1/class-assignments/bulk', {
        method: 'POST',
        body: JSON.stringify({
          assignments,
          start_date: today,
        }),
      });

      toast.success(
        `${t('savedSuccessfully')} (${result.data.assigned} ${t('assigned').toLowerCase()})`,
      );
      setPendingChanges(new Map());
      fetchData();
    } catch {
      // apiClient handles error toasts via the global handler
    } finally {
      setSaving(false);
    }
  };

  // ─── Loading skeleton ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-4 w-80 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const getAssignedCount = (group: YearGroup): number => {
    return group.students.filter((s) => {
      const pendingClass = pendingChanges.get(s.id);
      if (pendingClass !== undefined) return true;
      return s.current_homeroom_class_id !== null;
    }).length;
  };

  const getVisibleStudents = (group: YearGroup): Student[] => {
    if (!showUnassignedOnly) return group.students;
    return group.students.filter((s) => {
      // Show student if they are currently unassigned AND don't have a pending assignment
      if (pendingChanges.has(s.id)) return false;
      return s.current_homeroom_class_id === null;
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Filter toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="unassigned-filter"
          checked={showUnassignedOnly}
          onCheckedChange={setShowUnassignedOnly}
        />
        <Label htmlFor="unassigned-filter" className="cursor-pointer text-sm text-text-secondary">
          {t('showUnassignedOnly')}
        </Label>
      </div>

      {/* Year group accordions */}
      <div className="space-y-3">
        {yearGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.id);
          const assignedCount = getAssignedCount(group);
          const totalCount = group.students.length;
          const visibleStudents = getVisibleStudents(group);

          return (
            <div
              key={group.id}
              className="overflow-hidden rounded-xl border border-border bg-surface"
            >
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-surface-secondary"
              >
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-text-primary">{group.name}</h2>
                  <Badge
                    variant={assignedCount === totalCount ? 'success' : 'warning'}
                  >
                    {t('assignedOf', { assigned: assignedCount, total: totalCount })}
                  </Badge>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-text-tertiary" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-tertiary" />
                )}
              </button>

              {/* Accordion content */}
              {isExpanded && (
                <div className="border-t border-border">
                  {visibleStudents.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-text-tertiary">{t('noStudents')}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {visibleStudents.map((student) => {
                        const pendingClass = pendingChanges.get(student.id);
                        const effectiveClassId = pendingClass ?? student.current_homeroom_class_id ?? '';
                        const hasChange = pendingChanges.has(student.id);

                        return (
                          <div
                            key={student.id}
                            className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                              hasChange ? 'bg-primary-50/50 dark:bg-primary-950/20' : ''
                            }`}
                          >
                            {/* Student info */}
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {student.first_name} {student.last_name}
                                </p>
                                <p className="font-mono text-xs text-text-tertiary">
                                  {student.student_number}
                                </p>
                              </div>
                              {student.current_homeroom_class_id ? (
                                <Badge variant="success" className="shrink-0">
                                  {student.current_homeroom_class_name}
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="shrink-0">
                                  {t('unassigned')}
                                </Badge>
                              )}
                            </div>

                            {/* Class selector */}
                            <div className="w-full sm:w-48 shrink-0">
                              {group.homeroom_classes.length === 0 ? (
                                <p className="text-xs text-text-tertiary italic">
                                  {t('noClassesAvailable')}
                                </p>
                              ) : (
                                <Select
                                  value={effectiveClassId}
                                  onValueChange={(value) =>
                                    handleClassChange(
                                      student.id,
                                      value,
                                      student.current_homeroom_class_id,
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9 text-sm">
                                    <SelectValue placeholder={t('selectClass')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {group.homeroom_classes.map((cls) => (
                                      <SelectItem key={cls.id} value={cls.id}>
                                        {cls.name} ({cls.enrolled_count})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky save bar */}
      {pendingChanges.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="mx-auto flex max-w-screen-xl items-center justify-between">
            <p className="text-sm font-medium text-text-secondary">
              {t('pendingChanges', { count: pendingChanges.size })}
            </p>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="me-2 h-4 w-4" />
              {saving ? t('saving') : t('saveAssignments')}
            </Button>
          </div>
        </div>
      )}

      {/* Bottom padding when save bar is visible */}
      {pendingChanges.size > 0 && <div className="h-20" />}
    </div>
  );
}
