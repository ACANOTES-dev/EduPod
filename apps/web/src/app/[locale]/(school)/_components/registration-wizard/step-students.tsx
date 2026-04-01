'use client';

import { Check, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { StudentFormData, WizardAction, WizardState } from './types';



// ─── Validation ──────────────────────────────────────────────────────────────

export function validateStep2(state: WizardState): boolean {
  if (state.students.length === 0) return false;
  return state.students.every((s) => s.isComplete);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isStudentComplete(student: StudentFormData): boolean {
  return !!(
    student.first_name.trim() &&
    student.last_name.trim() &&
    student.date_of_birth.trim() &&
    student.gender &&
    student.year_group_id &&
    student.national_id.trim() &&
    student.nationality.trim()
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const GENDER_OPTIONS = ['male', 'female', 'other', 'prefer_not_to_say'] as const;

// ─── Props ───────────────────────────────────────────────────────────────────

interface StepStudentsProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function StepStudents({ state, dispatch }: StepStudentsProps) {
  const t = useTranslations('registration');

  const [yearGroups, setYearGroups] = React.useState<{ id: string; name: string }[]>([]);

  // Fetch year groups on mount
  React.useEffect(() => {
    apiClient<{ data: { id: string; name: string }[] }>('/api/v1/year-groups?pageSize=100')
      .then((res) => setYearGroups(res.data))
      .catch(() => {});
  }, []);

  const handleFieldChange = React.useCallback(
    (index: number, field: Exclude<keyof StudentFormData, 'isComplete'>, value: string) => {
      const current = state.students[index];
      if (!current) return;
      const merged: StudentFormData = {
        first_name: current.first_name,
        middle_name: current.middle_name,
        last_name: current.last_name,
        date_of_birth: current.date_of_birth,
        gender: current.gender,
        year_group_id: current.year_group_id,
        national_id: current.national_id,
        nationality: current.nationality,
        city_of_birth: current.city_of_birth,
        isComplete: current.isComplete,
      };
      merged[field] = value;
      const complete = isStudentComplete(merged);
      dispatch({
        type: 'UPDATE_STUDENT',
        index,
        data: { [field]: value, isComplete: complete },
      });
    },
    [state.students, dispatch],
  );

  const handleAddStudent = React.useCallback(() => {
    dispatch({ type: 'ADD_STUDENT' });
  }, [dispatch]);

  const handleRemoveStudent = React.useCallback(
    (index: number) => {
      dispatch({ type: 'REMOVE_STUDENT', index });
    },
    [dispatch],
  );

  const getYearGroupName = React.useCallback(
    (yearGroupId: string) => {
      const yg = yearGroups.find((g) => g.id === yearGroupId);
      return yg?.name ?? '';
    },
    [yearGroups],
  );

  return (
    <div className="space-y-4">
      {state.students.map((student, index) => {
        const isExpanded = index === state.expandedStudentIndex;

        return (
          <div
            key={index}
            className={`rounded-lg border transition-colors ${
              isExpanded
                ? 'border-primary-500 bg-surface-primary'
                : 'border-border-primary bg-surface-primary'
            }`}
          >
            {/* ── Collapsed / Header bar ────────────────────────────── */}
            <button
              type="button"
              onClick={() => dispatch({ type: 'SET_EXPANDED_STUDENT', index })}
              className="flex w-full items-center gap-3 px-4 py-3"
            >
              {/* Number badge */}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {index + 1}
              </span>

              {/* Student summary */}
              <div className="flex flex-1 flex-col items-start text-start">
                <span className="text-sm font-medium text-text-primary">
                  {student.first_name && student.last_name
                    ? `${student.first_name} ${student.last_name}`
                    : t('student', { number: index + 1 })}
                </span>
                {!isExpanded &&
                  (student.year_group_id || student.gender || student.date_of_birth) && (
                    <span className="text-xs text-text-tertiary">
                      {[
                        getYearGroupName(student.year_group_id),
                        student.gender
                          ? t(
                              student.gender === 'prefer_not_to_say'
                                ? 'preferNotToSay'
                                : student.gender,
                            )
                          : '',
                        student.date_of_birth,
                      ]
                        .filter(Boolean)
                        .join(' \u00B7 ')}
                    </span>
                  )}
              </div>

              {/* Completion indicator */}
              {student.isComplete && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success-fill">
                  <Check className="h-3 w-3 text-success-text" />
                </span>
              )}

              {/* Remove button */}
              {state.students.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveStudent(index);
                  }}
                  className="rounded p-1 text-text-tertiary hover:text-danger-text"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}

              {/* Expand/collapse chevron */}
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-text-tertiary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-text-tertiary" />
              )}
            </button>

            {/* ── Expanded form ──────────────────────────────────────── */}
            {isExpanded && (
              <div className="border-t border-border-primary px-4 pb-4 pt-4">
                {/* Name row: 3-column grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
                  {/* First Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`student-${index}-first-name`}>{t('firstName')} *</Label>
                    <Input
                      id={`student-${index}-first-name`}
                      value={student.first_name}
                      onChange={(e) => handleFieldChange(index, 'first_name', e.target.value)}
                    />
                  </div>

                  {/* Middle Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`student-${index}-middle-name`}>{t('middleName')}</Label>
                    <Input
                      id={`student-${index}-middle-name`}
                      value={student.middle_name}
                      onChange={(e) => handleFieldChange(index, 'middle_name', e.target.value)}
                    />
                  </div>

                  {/* Last Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`student-${index}-last-name`}>{t('lastName')} *</Label>
                    <Input
                      id={`student-${index}-last-name`}
                      value={student.last_name}
                      onChange={(e) => handleFieldChange(index, 'last_name', e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Date of Birth */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`student-${index}-dob`}>{t('dateOfBirth')} *</Label>
                    <Input
                      id={`student-${index}-dob`}
                      type="date"
                      dir="ltr"
                      value={student.date_of_birth}
                      onChange={(e) => handleFieldChange(index, 'date_of_birth', e.target.value)}
                    />
                  </div>

                  {/* Gender */}
                  <div className="space-y-1.5">
                    <Label>{t('gender')} *</Label>
                    <Select
                      value={student.gender}
                      onValueChange={(val) => handleFieldChange(index, 'gender', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('gender')} />
                      </SelectTrigger>
                      <SelectContent>
                        {GENDER_OPTIONS.map((g) => (
                          <SelectItem key={g} value={g}>
                            {t(g === 'prefer_not_to_say' ? 'preferNotToSay' : g)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Year Group */}
                  <div className="space-y-1.5">
                    <Label>{t('yearGroup')} *</Label>
                    <Select
                      value={student.year_group_id}
                      onValueChange={(val) => handleFieldChange(index, 'year_group_id', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('yearGroup')} />
                      </SelectTrigger>
                      <SelectContent>
                        {yearGroups.map((yg) => (
                          <SelectItem key={yg.id} value={yg.id}>
                            {yg.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* National ID */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`student-${index}-national-id`}>{t('nationalId')} *</Label>
                    <Input
                      id={`student-${index}-national-id`}
                      dir="ltr"
                      value={student.national_id}
                      onChange={(e) => handleFieldChange(index, 'national_id', e.target.value)}
                    />
                  </div>

                  {/* Nationality */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`student-${index}-nationality`}>{t('nationality')} *</Label>
                    <Input
                      id={`student-${index}-nationality`}
                      value={student.nationality}
                      onChange={(e) => handleFieldChange(index, 'nationality', e.target.value)}
                      placeholder="e.g. Irish, British"
                    />
                  </div>

                  {/* City of Birth */}
                  <div className="space-y-1.5">
                    <Label htmlFor={`student-${index}-city-of-birth`}>{t('cityOfBirth')}</Label>
                    <Input
                      id={`student-${index}-city-of-birth`}
                      value={student.city_of_birth}
                      onChange={(e) => handleFieldChange(index, 'city_of_birth', e.target.value)}
                      placeholder="e.g. Dublin, London"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Add Another Student ─────────────────────────────────── */}
      <Button type="button" variant="outline" onClick={handleAddStudent} className="gap-1.5">
        <Plus className="h-4 w-4" />
        {t('addStudent')}
      </Button>
    </div>
  );
}
