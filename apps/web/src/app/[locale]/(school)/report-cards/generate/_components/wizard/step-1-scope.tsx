'use client';

import { Check, GraduationCap, Layers, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { GenerationScopeMode } from '@school/shared';
import { Checkbox, Input, Label } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { WizardAction, WizardState } from './types';

interface ListResponse<T> {
  data: T[];
}

interface YearGroup {
  id: string;
  name: string;
  display_order: number;
}

interface ClassRecord {
  id: string;
  name: string;
  year_group?: { id: string; name: string } | null;
  _count?: { class_enrolments: number };
}

interface StudentRecord {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface Step1Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Step 1 — Scope selection ────────────────────────────────────────────────

export function Step1Scope({ state, dispatch }: Step1Props) {
  const t = useTranslations('reportCards.wizard');

  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [studentQuery, setStudentQuery] = React.useState('');
  const [students, setStudents] = React.useState<StudentRecord[]>([]);
  const [searchingStudents, setSearchingStudents] = React.useState(false);
  const [selectedStudents, setSelectedStudents] = React.useState<StudentRecord[]>([]);

  // Load year groups and classes once.
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [ygRes, classRes] = await Promise.all([
          apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
          apiClient<ListResponse<ClassRecord>>('/api/v1/classes?pageSize=200'),
        ]);
        if (cancelled) return;
        setYearGroups((ygRes.data ?? []).slice().sort((a, b) => a.display_order - b.display_order));
        setClasses((classRes.data ?? []).slice());
      } catch (err) {
        console.error('[Step1Scope.load]', err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced student search for the individual scope mode.
  React.useEffect(() => {
    if (state.scope.mode !== 'individual') return;
    const trimmed = studentQuery.trim();
    if (trimmed.length < 2) {
      setStudents([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearchingStudents(true);
        try {
          const params = new URLSearchParams({
            pageSize: '20',
            search: trimmed,
            status: 'active',
          });
          const res = await apiClient<ListResponse<StudentRecord>>(
            `/api/v1/students?${params.toString()}`,
          );
          setStudents(res.data ?? []);
        } catch (err) {
          console.error('[Step1Scope.searchStudents]', err);
          setStudents([]);
        } finally {
          setSearchingStudents(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(handle);
  }, [studentQuery, state.scope.mode]);

  const handleSelectMode = React.useCallback(
    (mode: GenerationScopeMode) => {
      dispatch({ type: 'SET_SCOPE_MODE', mode });
      setSelectedStudents([]);
      setStudentQuery('');
    },
    [dispatch],
  );

  const toggleScopeId = React.useCallback(
    (id: string) => {
      const current = new Set(state.scope.ids);
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      dispatch({ type: 'SET_SCOPE_IDS', ids: Array.from(current) });
    },
    [dispatch, state.scope.ids],
  );

  const addStudent = React.useCallback(
    (student: StudentRecord) => {
      if (state.scope.ids.includes(student.id)) return;
      dispatch({ type: 'SET_SCOPE_IDS', ids: [...state.scope.ids, student.id] });
      setSelectedStudents((prev) => {
        if (prev.some((s) => s.id === student.id)) return prev;
        return [...prev, student];
      });
    },
    [dispatch, state.scope.ids],
  );

  const removeStudent = React.useCallback(
    (id: string) => {
      dispatch({
        type: 'SET_SCOPE_IDS',
        ids: state.scope.ids.filter((x) => x !== id),
      });
      setSelectedStudents((prev) => prev.filter((s) => s.id !== id));
    },
    [dispatch, state.scope.ids],
  );

  const modeOptions: Array<{
    mode: GenerationScopeMode;
    icon: React.ReactNode;
    label: string;
    description: string;
  }> = [
    {
      mode: 'year_group',
      icon: <GraduationCap className="h-5 w-5" />,
      label: t('scopeYear'),
      description: t('scopeYearDescription'),
    },
    {
      mode: 'class',
      icon: <Layers className="h-5 w-5" />,
      label: t('scopeClass'),
      description: t('scopeClassDescription'),
    },
    {
      mode: 'individual',
      icon: <Users className="h-5 w-5" />,
      label: t('scopeIndividual'),
      description: t('scopeIndividualDescription'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Mode selection */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {modeOptions.map((option) => {
          const selected = state.scope.mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => handleSelectMode(option.mode)}
              className={`group relative flex flex-col items-start gap-2 rounded-2xl border p-4 text-start transition-all ${
                selected
                  ? 'border-primary-500 bg-primary-50/50 shadow-sm'
                  : 'border-border bg-surface hover:border-primary-300'
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full ${
                  selected ? 'bg-primary-500 text-white' : 'bg-surface-secondary text-text-tertiary'
                }`}
              >
                {option.icon}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-text-primary">{option.label}</div>
                <div className="mt-1 text-xs text-text-tertiary">{option.description}</div>
              </div>
              {selected ? (
                <div className="absolute end-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500 text-white">
                  <Check className="h-3.5 w-3.5" />
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Mode-specific selection */}
      {state.scope.mode === 'year_group' ? (
        <div className="space-y-2">
          <Label>{t('yearGroupPlaceholder')}</Label>
          {yearGroups.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('noYearGroups')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {yearGroups.map((yg) => (
                <label
                  key={yg.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary-300"
                >
                  <Checkbox
                    checked={state.scope.ids.includes(yg.id)}
                    onCheckedChange={() => toggleScopeId(yg.id)}
                  />
                  <span className="text-sm text-text-primary">{yg.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {state.scope.mode === 'class' ? (
        <div className="space-y-2">
          <Label>{t('classPlaceholder')}</Label>
          {classes.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('noClasses')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {classes.map((cls) => (
                <label
                  key={cls.id}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-primary-300"
                >
                  <Checkbox
                    checked={state.scope.ids.includes(cls.id)}
                    onCheckedChange={() => toggleScopeId(cls.id)}
                  />
                  <span className="text-sm text-text-primary">
                    {cls.name}
                    {cls.year_group?.name ? (
                      <span className="ms-2 text-xs text-text-tertiary">
                        · {cls.year_group.name}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {state.scope.mode === 'individual' ? (
        <div className="space-y-3">
          <Label htmlFor="student-search">{t('individualSearchPlaceholder')}</Label>
          <Input
            id="student-search"
            type="text"
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
            placeholder={t('individualSearchPlaceholder')}
            className="w-full text-base"
          />

          {searchingStudents ? <p className="text-xs text-text-tertiary">...</p> : null}

          {students.length > 0 ? (
            <div className="max-h-60 overflow-y-auto rounded-xl border border-border bg-surface">
              {students.map((student) => {
                const isSelected = state.scope.ids.includes(student.id);
                return (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => addStudent(student)}
                    disabled={isSelected}
                    className="flex w-full items-center justify-between gap-2 border-b border-border/40 p-3 text-start text-sm last:border-b-0 hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="text-text-primary">
                      {student.first_name} {student.last_name}
                    </span>
                    {student.student_number ? (
                      <span className="text-xs text-text-tertiary">{student.student_number}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : studentQuery.length >= 2 && !searchingStudents ? (
            <p className="text-sm text-text-tertiary">{t('noStudentsMatch')}</p>
          ) : null}

          {selectedStudents.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedStudents.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => removeStudent(s.id)}
                  className="flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                >
                  {s.first_name} {s.last_name}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Selection count */}
      {state.scope.mode && state.scope.ids.length > 0 ? (
        <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-3 text-sm text-primary-800">
          {t('studentsSelected', { count: state.scope.ids.length })}
        </div>
      ) : null}
    </div>
  );
}
