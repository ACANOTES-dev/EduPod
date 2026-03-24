'use client';

import {
  Badge,
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { ChevronDown, ChevronUp, Shuffle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Student, YearGroup } from './export-utils';

interface AssignmentListProps {
  yearGroups: YearGroup[];
  pendingChanges: Map<string, string>;
  expandedGroups: Set<string>;
  selectedStudents: Set<string>;
  showUnassignedOnly: boolean;
  onToggleGroup: (groupId: string) => void;
  onClassChange: (
    studentId: string,
    classId: string,
    currentClassId: string | null,
    group?: YearGroup,
  ) => void;
  onToggleStudentSelection: (studentId: string, yearGroupId: string) => void;
  onToggleSelectAll: (group: YearGroup) => void;
  onAutoBalance: (group: YearGroup) => void;
  getAssignedCount: (group: YearGroup) => number;
  getVisibleStudents: (group: YearGroup) => Student[];
}

export function AssignmentList({
  yearGroups,
  pendingChanges,
  expandedGroups,
  selectedStudents,
  onToggleGroup,
  onClassChange,
  onToggleStudentSelection,
  onToggleSelectAll,
  onAutoBalance,
  getAssignedCount,
  getVisibleStudents,
}: AssignmentListProps) {
  const t = useTranslations('classAssignments');

  return (
    <div className="space-y-3">
      {yearGroups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        const assignedCount = getAssignedCount(group);
        const totalCount = group.students.length;
        const visibleStudents = getVisibleStudents(group);
        const allVisibleSelected =
          visibleStudents.length > 0 && visibleStudents.every((s) => selectedStudents.has(s.id));

        return (
          <div
            key={group.id}
            className={`overflow-hidden rounded-xl border transition-colors ${
              isExpanded
                ? 'border-primary-300 bg-primary-50/30 dark:border-primary-700 dark:bg-primary-950/20'
                : 'border-border bg-surface'
            }`}
          >
            {/* Accordion header */}
            <button
              type="button"
              onClick={() => onToggleGroup(group.id)}
              className={`flex w-full items-center justify-between px-4 py-3 transition-colors ${
                isExpanded
                  ? 'bg-primary-100/50 dark:bg-primary-900/30'
                  : 'hover:bg-surface-secondary'
              }`}
            >
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold text-text-primary">{group.name}</h2>
                <Badge variant={assignedCount === totalCount ? 'success' : 'warning'}>
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
              <div className="border-t border-primary-200 dark:border-primary-800">
                {/* Capacity indicators */}
                {group.homeroom_classes.length > 0 && (
                  <div className="flex flex-wrap gap-3 border-b border-primary-200/50 bg-primary-50/10 px-4 py-2 dark:border-primary-800/50 dark:bg-primary-950/5">
                    {group.homeroom_classes.map((cls) => {
                      const count =
                        cls.enrolled_count +
                        Array.from(pendingChanges.values()).filter((v) => v === cls.id).length;
                      const cap = cls.max_capacity;
                      const pct = cap ? Math.min(100, Math.round((count / cap) * 100)) : null;
                      return (
                        <div key={cls.id} className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-text-primary">{cls.name}</span>
                          <span className="text-text-tertiary">
                            {count}{cap ? `/${cap}` : ''}
                          </span>
                          {pct !== null && (
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-border">
                              <div
                                className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-danger-500' : pct >= 70 ? 'bg-warning-500' : 'bg-success-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Select-all + auto-balance row */}
                {visibleStudents.length > 0 && (
                  <div className="flex items-center justify-between border-b border-primary-200/50 bg-primary-50/20 px-4 py-2 dark:border-primary-800/50 dark:bg-primary-950/10">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={`select-all-${group.id}`}
                        checked={allVisibleSelected}
                        onCheckedChange={() => onToggleSelectAll(group)}
                      />
                      <Label
                        htmlFor={`select-all-${group.id}`}
                        className="cursor-pointer text-xs font-medium text-text-secondary"
                      >
                        {t('selectAll')} ({visibleStudents.length})
                      </Label>
                    </div>
                    {group.homeroom_classes.length > 0 &&
                      group.students.some(
                        (s) => !s.current_homeroom_class_id && !pendingChanges.has(s.id),
                      ) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAutoBalance(group);
                          }}
                          className="text-xs"
                        >
                          <Shuffle className="me-1.5 h-3.5 w-3.5" />
                          {t('distributeEvenly')}
                        </Button>
                      )}
                  </div>
                )}

                {visibleStudents.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-text-tertiary">{t('noStudents')}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-primary-100 dark:divide-primary-900/50">
                    {visibleStudents.map((student) => {
                      const pendingClass = pendingChanges.get(student.id);
                      const effectiveClassId =
                        pendingClass ?? student.current_homeroom_class_id ?? '';
                      const hasChange = pendingChanges.has(student.id);
                      const isSelected = selectedStudents.has(student.id);

                      return (
                        <div
                          key={student.id}
                          className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                            hasChange
                              ? 'bg-primary-50/50 dark:bg-primary-950/20'
                              : isSelected
                                ? 'bg-primary-50/30 dark:bg-primary-950/10'
                                : ''
                          }`}
                        >
                          {/* Checkbox + Student info */}
                          <div className="flex min-w-0 items-center gap-3">
                            <Checkbox
                              id={`select-${student.id}`}
                              checked={isSelected}
                              onCheckedChange={() =>
                                onToggleStudentSelection(student.id, group.id)
                              }
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-text-primary">
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
                          <div className="w-full shrink-0 sm:w-48">
                            {group.homeroom_classes.length === 0 ? (
                              <p className="text-xs italic text-text-tertiary">
                                {t('noClassesAvailable')}
                              </p>
                            ) : (
                              <Select
                                value={effectiveClassId}
                                onValueChange={(value) =>
                                  onClassChange(
                                    student.id,
                                    value,
                                    student.current_homeroom_class_id,
                                    group,
                                  )
                                }
                              >
                                <SelectTrigger className="h-9 text-sm">
                                  <SelectValue placeholder={t('selectClass')} />
                                </SelectTrigger>
                                <SelectContent>
                                  {student.current_homeroom_class_id && (
                                    <SelectItem value="__unassign__">
                                      {t('unassignStudent')}
                                    </SelectItem>
                                  )}
                                  {group.homeroom_classes.map((cls) => (
                                    <SelectItem key={cls.id} value={cls.id}>
                                      {cls.name} (
                                      {cls.enrolled_count}
                                      {cls.max_capacity ? `/${cls.max_capacity}` : ''})
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
  );
}
