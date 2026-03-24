'use client';

import { Badge, Button } from '@school/ui';
import { GripVertical, Shuffle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Student, YearGroup } from './export-utils';

interface AssignmentBoardProps {
  yearGroups: YearGroup[];
  pendingChanges: Map<string, string>;
  draggedStudent: { id: string; yearGroupId: string } | null;
  onDragStart: (studentId: string, yearGroupId: string) => void;
  onDrop: (targetClassId: string | '__unassign__') => void;
  onAutoBalance: (group: YearGroup) => void;
}

export function AssignmentBoard({
  yearGroups,
  pendingChanges,
  draggedStudent,
  onDragStart,
  onDrop,
  onAutoBalance,
}: AssignmentBoardProps) {
  const t = useTranslations('classAssignments');

  return (
    <div className="space-y-6">
      {yearGroups.map((group) => {
        if (group.homeroom_classes.length === 0) return null;

        const unassigned = group.students.filter((s) => {
          const pending = pendingChanges.get(s.id);
          if (pending === '__unassign__') return true;
          if (pending) return false;
          return !s.current_homeroom_class_id;
        });

        return (
          <div key={group.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">{group.name}</h2>
              {unassigned.length > 0 && group.homeroom_classes.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAutoBalance(group)}
                  className="text-xs"
                >
                  <Shuffle className="me-1.5 h-3.5 w-3.5" />
                  {t('distributeEvenly')}
                </Button>
              )}
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2">
              {/* Unassigned column */}
              <UnassignedColumn
                unassigned={unassigned}
                groupId={group.id}
                onDragStart={onDragStart}
                onDrop={onDrop}
                t={t}
              />

              {/* Subclass columns */}
              {group.homeroom_classes.map((cls) => {
                const classStudents = group.students.filter((s) => {
                  const pending = pendingChanges.get(s.id);
                  if (pending === '__unassign__') return false;
                  if (pending) return pending === cls.id;
                  return s.current_homeroom_class_id === cls.id;
                });
                const count = classStudents.length;
                const cap = cls.max_capacity;
                const pct = cap ? Math.min(100, Math.round((count / cap) * 100)) : null;

                return (
                  <div
                    key={cls.id}
                    className={`min-w-[200px] flex-1 rounded-xl border p-3 transition-colors ${
                      draggedStudent
                        ? 'border-primary-300 bg-primary-50/20 dark:border-primary-700 dark:bg-primary-950/10'
                        : 'border-border bg-surface'
                    }`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(cls.id)}
                  >
                    <div className="mb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-text-primary">{cls.name}</span>
                        <Badge variant={pct !== null && pct >= 90 ? 'danger' : 'success'}>
                          {count}{cap ? `/${cap}` : ''}
                        </Badge>
                      </div>
                      {pct !== null && (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-border">
                          <div
                            className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-danger-500' : pct >= 70 ? 'bg-warning-500' : 'bg-success-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
                      {classStudents.map((student) => (
                        <StudentCard
                          key={student.id}
                          student={student}
                          isPending={pendingChanges.has(student.id)}
                          groupId={group.id}
                          onDragStart={onDragStart}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface UnassignedColumnProps {
  unassigned: Student[];
  groupId: string;
  onDragStart: (studentId: string, yearGroupId: string) => void;
  onDrop: (targetClassId: string | '__unassign__') => void;
  t: ReturnType<typeof useTranslations<'classAssignments'>>;
}

function UnassignedColumn({ unassigned, groupId, onDragStart, onDrop, t }: UnassignedColumnProps) {
  return (
    <div
      className="min-w-[200px] flex-1 rounded-xl border border-warning-border bg-warning-surface/30 p-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => onDrop('__unassign__')}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-warning-text">{t('unassigned')}</span>
        <Badge variant="warning">{unassigned.length}</Badge>
      </div>
      <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
        {unassigned.map((student) => (
          <div
            key={student.id}
            draggable
            onDragStart={() => onDragStart(student.id, groupId)}
            className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-surface p-2 transition-colors hover:bg-surface-secondary active:cursor-grabbing"
          >
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-text-primary">
                {student.first_name} {student.last_name}
              </p>
              <p className="font-mono text-[10px] text-text-tertiary">{student.student_number}</p>
            </div>
          </div>
        ))}
        {unassigned.length === 0 && (
          <p className="py-4 text-center text-xs text-text-tertiary">{t('allAssigned')}</p>
        )}
      </div>
    </div>
  );
}

interface StudentCardProps {
  student: Student;
  isPending: boolean;
  groupId: string;
  onDragStart: (studentId: string, yearGroupId: string) => void;
}

function StudentCard({ student, isPending, groupId, onDragStart }: StudentCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(student.id, groupId)}
      className={`flex cursor-grab items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-surface-secondary active:cursor-grabbing ${
        isPending
          ? 'border-primary-300 bg-primary-50/30 dark:bg-primary-950/10'
          : 'border-border bg-surface'
      }`}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-text-primary">
          {student.first_name} {student.last_name}
        </p>
        <p className="font-mono text-[10px] text-text-tertiary">{student.student_number}</p>
      </div>
    </div>
  );
}
