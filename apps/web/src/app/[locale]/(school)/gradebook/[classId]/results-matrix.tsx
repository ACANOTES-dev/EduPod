'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────

interface MatrixStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface MatrixAssessment {
  id: string;
  title: string;
  category_name: string;
  max_score: number;
  status: string;
}

interface MatrixSubject {
  id: string;
  name: string;
  code: string | null;
  assessments: MatrixAssessment[];
}

interface GradeEntry {
  raw_score: number | null;
  is_missing: boolean;
}

interface MatrixData {
  students: MatrixStudent[];
  subjects: MatrixSubject[];
  grades: Record<string, Record<string, GradeEntry>>;
}

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Component ────────────────────────────────────────────────────────────

export function ResultsMatrix({ classId }: { classId: string }) {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');

  // Filter state
  const [periods, setPeriods] = React.useState<SelectOption[]>([]);
  const [periodId, setPeriodId] = React.useState('');
  const [subjectFilter, setSubjectFilter] = React.useState('all');

  // Matrix data
  const [matrix, setMatrix] = React.useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Dirty grades tracking: { `${studentId}:${assessmentId}`: GradeEntry }
  const [dirtyGrades, setDirtyGrades] = React.useState<
    Map<string, { student_id: string; assessment_id: string; raw_score: number | null; is_missing: boolean }>
  >(new Map());

  // Local grade overrides for UI (merged with server data)
  const [localGrades, setLocalGrades] = React.useState<Record<string, Record<string, GradeEntry>>>({});

  // Load filter options
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
  }, []);

  // Fetch matrix when period changes
  React.useEffect(() => {
    if (!periodId) return;
    setIsLoading(true);
    setDirtyGrades(new Map());
    apiClient<MatrixData>(
      `/api/v1/gradebook/classes/${classId}/results-matrix?academic_period_id=${periodId}`,
    )
      .then((res) => {
        setMatrix(res);
        setLocalGrades(res.grades);
      })
      .catch(() => {
        setMatrix(null);
        setLocalGrades({});
      })
      .finally(() => setIsLoading(false));
  }, [classId, periodId]);

  // Get grade value for a cell
  const getGrade = (studentId: string, assessmentId: string): GradeEntry => {
    return localGrades[studentId]?.[assessmentId] ?? { raw_score: null, is_missing: false };
  };

  // Update a grade cell
  const updateGrade = (studentId: string, assessmentId: string, value: string, maxScore: number) => {
    const numValue = value === '' ? null : Math.min(Math.max(0, Number(value)), maxScore);
    const key = `${studentId}:${assessmentId}`;

    setLocalGrades((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        [assessmentId]: { raw_score: numValue, is_missing: false },
      },
    }));

    setDirtyGrades((prev) => {
      const next = new Map(prev);
      next.set(key, { student_id: studentId, assessment_id: assessmentId, raw_score: numValue, is_missing: false });
      return next;
    });
  };

  // Save dirty grades
  const handleSave = async () => {
    if (dirtyGrades.size === 0) return;
    setIsSaving(true);
    try {
      const grades = Array.from(dirtyGrades.values());
      await apiClient(`/api/v1/gradebook/classes/${classId}/results-matrix`, {
        method: 'PUT',
        body: JSON.stringify({ grades }),
      });
      setDirtyGrades(new Map());
      toast.success(t('save'));
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsSaving(false);
    }
  };

  // Filter subjects
  const displaySubjects = matrix
    ? subjectFilter === 'all'
      ? matrix.subjects
      : matrix.subjects.filter((s) => s.id === subjectFilter)
    : [];

  // Count stats
  const totalAssessments = displaySubjects.reduce((acc, s) => acc + s.assessments.length, 0);
  const totalCells = (matrix?.students.length ?? 0) * totalAssessments;
  const filledCells = matrix
    ? matrix.students.reduce((acc, student) => {
        return acc + displaySubjects.reduce((sacc, subject) => {
          return sacc + subject.assessments.reduce((aacc, assessment) => {
            const grade = getGrade(student.id, assessment.id);
            return aacc + (grade.raw_score != null || grade.is_missing ? 1 : 0);
          }, 0);
        }, 0);
      }, 0)
    : 0;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {matrix && matrix.subjects.length > 1 && (
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t('subject')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {matrix.subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* No period selected */}
      {!periodId && (
        <p className="py-12 text-center text-sm text-text-tertiary">
          Select a period to view the results matrix.
        </p>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      )}

      {/* Matrix */}
      {!isLoading && matrix && periodId && (
        <>
          {matrix.students.length === 0 || displaySubjects.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-tertiary">
              {matrix.students.length === 0
                ? 'No students enrolled in this class.'
                : 'No assessments found for the selected period.'}
            </p>
          ) : (
            <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    {/* Subject group headers */}
                    <tr>
                      <th
                        rowSpan={2}
                        className="sticky start-0 z-20 bg-primary-900 text-white text-xs font-semibold px-3 py-2 text-start align-bottom border-b-2 border-border"
                        style={{ width: 140, maxWidth: 140 }}
                      >
                        {tc('student')}
                      </th>
                      {displaySubjects.map((subject) => (
                        <th
                          key={subject.id}
                          colSpan={subject.assessments.length}
                          className="bg-primary-700 text-white text-xs font-semibold px-2 py-2 text-center border-e-2 border-white/20 last:border-e-0"
                        >
                          {subject.name}
                        </th>
                      ))}
                    </tr>
                    {/* Assessment sub-headers — vertical text */}
                    <tr>
                      {displaySubjects.map((subject, si) =>
                        subject.assessments.map((assessment, ai) => {
                          const isLastInSubject = ai === subject.assessments.length - 1;
                          return (
                            <th
                              key={assessment.id}
                              className={`bg-surface-secondary border-b-2 border-border ${
                                isLastInSubject && si < displaySubjects.length - 1
                                  ? 'border-e-2 border-e-primary-200'
                                  : 'border-e border-e-border'
                              }`}
                              style={{
                                width: 38,
                                minWidth: 38,
                                height: 115,
                                writingMode: 'vertical-rl',
                                transform: 'rotate(180deg)',
                                textAlign: 'center',
                                verticalAlign: 'middle',
                                padding: '6px 2px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span className="text-[11px] font-semibold text-text-primary">
                                {assessment.title}{' '}
                              </span>
                              <span className="text-[11px] font-bold text-danger-text">
                                /{assessment.max_score}
                              </span>
                            </th>
                          );
                        }),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.students.map((student, rowIdx) => (
                      <tr
                        key={student.id}
                        className={`${rowIdx % 2 === 1 ? 'bg-surface-secondary/50' : ''} hover:bg-primary-50 transition-colors`}
                      >
                        <td
                          className="sticky start-0 z-10 bg-inherit px-3 py-1.5 text-sm font-medium text-text-primary border-e-2 border-border whitespace-nowrap overflow-hidden text-ellipsis"
                          style={{ width: 140, maxWidth: 140 }}
                          title={`${student.first_name} ${student.last_name}`}
                        >
                          {student.first_name} {student.last_name}
                        </td>
                        {displaySubjects.map((subject, si) =>
                          subject.assessments.map((assessment, ai) => {
                            const isLastInSubject = ai === subject.assessments.length - 1;
                            const grade = getGrade(student.id, assessment.id);
                            const isLocked = assessment.status === 'closed' || assessment.status === 'locked';

                            return (
                              <td
                                key={assessment.id}
                                className={`px-0.5 py-1 text-center border-b border-border ${
                                  isLastInSubject && si < displaySubjects.length - 1
                                    ? 'border-e-2 border-e-primary-100'
                                    : 'border-e border-e-border/50'
                                }`}
                                style={{ width: 38 }}
                              >
                                {isLocked ? (
                                  <span
                                    className="inline-block w-[34px] rounded bg-surface-secondary px-1 py-1 text-center text-xs font-medium text-text-tertiary"
                                    dir="ltr"
                                  >
                                    {grade.raw_score != null ? grade.raw_score : '—'}
                                  </span>
                                ) : (
                                  <input
                                    type="number"
                                    min={0}
                                    max={assessment.max_score}
                                    value={grade.raw_score != null ? grade.raw_score : ''}
                                    onChange={(e) =>
                                      updateGrade(student.id, assessment.id, e.target.value, assessment.max_score)
                                    }
                                    placeholder="—"
                                    dir="ltr"
                                    className={`w-[34px] rounded border px-1 py-1 text-center text-xs font-medium tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                                      grade.is_missing
                                        ? 'border-danger-200 bg-danger-50 text-danger-text'
                                        : grade.raw_score != null
                                          ? 'border-success-200 bg-success-50 text-text-primary'
                                          : 'border-border bg-surface text-text-tertiary'
                                    }`}
                                  />
                                )}
                              </td>
                            );
                          }),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Save bar */}
              <div className="flex items-center justify-between border-t border-border bg-surface-secondary/50 px-4 py-3">
                <p className="text-xs text-text-secondary">
                  <strong className="text-text-primary">{matrix.students.length}</strong> {tc('student').toLowerCase()}s
                  {' · '}
                  <strong className="text-text-primary">{displaySubjects.length}</strong> {t('subject').toLowerCase()}s
                  {' · '}
                  <strong className="text-text-primary">{filledCells}</strong> of{' '}
                  <strong className="text-text-primary">{totalCells}</strong> grades entered
                  {dirtyGrades.size > 0 && (
                    <span className="ms-2 text-warning-text">
                      ({dirtyGrades.size} unsaved)
                    </span>
                  )}
                </p>
                <Button
                  onClick={handleSave}
                  disabled={dirtyGrades.size === 0 || isSaving}
                  size="sm"
                >
                  <Save className="me-2 h-3.5 w-3.5" />
                  {isSaving ? tc('loading') : t('save')}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
