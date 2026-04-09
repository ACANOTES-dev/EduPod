'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

interface GradeCell {
  computed: number | null;
  display: string | null;
}

interface CrossSubjectData {
  students: Array<{
    student_id: string;
    student_name: string;
    subject_grades: Record<string, GradeCell>;
    overall: GradeCell;
  }>;
  subjects: Array<{ id: string; name: string; weight: number }>;
}

// ─── Grading helpers ──────────────────────────────────────────────────────────

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];
const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#3b82f6',
  C: '#f59e0b',
  D: '#f97316',
  F: '#ef4444',
};

function letterFromDisplay(display: string | null): string {
  if (!display) return 'N/A';
  const letter = display.replace(/[+-]/g, '').trim().charAt(0).toUpperCase();
  return GRADE_ORDER.includes(letter) ? letter : 'N/A';
}

/** Derive a letter grade from a numeric score. Uses same ranges as the tenant grading scale. */
function scoreToLetter(score: number | null): string {
  if (score == null) return 'N/A';
  if (score >= 90) return 'A';
  if (score >= 81) return 'B';
  if (score >= 71) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function computeStats(values: number[]): {
  mean: number;
  median: number;
  min: number;
  max: number;
  stdDev: number;
  passRate: number;
} {
  if (values.length === 0) return { mean: 0, median: 0, min: 0, max: 0, stdDev: 0, passRate: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const passCount = values.filter((v) => v >= 60).length;
  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
    passRate: Math.round((passCount / values.length) * 100),
  };
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number | null;
  accent?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <span className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        {label}
      </span>
      <span
        className="text-2xl font-bold tabular-nums"
        style={{ color: accent ?? 'var(--color-text-primary)' }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      <div className="border-b border-border bg-surface-secondary/50 px-5 py-3">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

const tooltipStyle = {
  backgroundColor: 'var(--color-surface, #fff)',
  border: '1px solid var(--color-border, #e5e7eb)',
  borderRadius: 10,
  fontSize: 12,
  padding: '8px 12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

// ─── Main Component ─────────────────────────────────────────────────────────

export function AnalyticsTab({ classId }: { classId: string }) {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');

  // ─── Filter state ───────────────────────────────────────────────────────
  const [periods, setPeriods] = React.useState<SelectOption[]>([]);
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [periodId, setPeriodId] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('all');
  const [studentId, setStudentId] = React.useState('');
  const [academicYearId, setAcademicYearId] = React.useState('');

  // ─── Data ───────────────────────────────────────────────────────────────
  const [data, setData] = React.useState<CrossSubjectData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // ─── View mode derived from filters ─────────────────────────────────────
  const isAllSubjects = subjectId === 'all';
  const viewMode: 'class-overview' | 'subject-dive' | 'student-profile' = studentId
    ? 'student-profile'
    : isAllSubjects
      ? 'class-overview'
      : 'subject-dive';

  // ─── Load filter options ────────────────────────────────────────────────
  React.useEffect(() => {
    // Load class → academic year → periods
    apiClient<{ data: { academic_year_id: string } }>(`/api/v1/classes/${classId}`)
      .then((res) => {
        const yearId = res.data.academic_year_id;
        setAcademicYearId(yearId);
        return apiClient<ListResponse<SelectOption>>(
          `/api/v1/academic-periods?pageSize=50&academic_year_id=${yearId}`,
        );
      })
      .then((res) => setPeriods(res.data))
      .catch((err) => console.error('[AnalyticsTab]', err));

    // Load class-specific subjects from allocations (more reliable than grade-configs)
    apiClient<{ data: Array<{ subject_id: string; subject_name: string }> }>(
      `/api/v1/gradebook/classes/${classId}/allocations`,
    )
      .then((res) => {
        const subjectMap = new Map<string, string>();
        for (const a of res.data) {
          if (!subjectMap.has(a.subject_id)) subjectMap.set(a.subject_id, a.subject_name);
        }
        const subs = [...subjectMap.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(subs);
      })
      .catch((err) => console.error('[AnalyticsTab]', err));
  }, [classId]);

  // ─── Fetch data when filters change ─────────────────────────────────────
  React.useEffect(() => {
    if (!periodId || !academicYearId) return;
    setIsLoading(true);

    const params = new URLSearchParams({ class_id: classId });
    let url: string;

    if (periodId === 'all') {
      // Year overview gives us cross-subject data for all periods combined
      params.set('academic_year_id', academicYearId);
      url = `/api/v1/gradebook/period-grades/year-overview?${params.toString()}`;
    } else {
      params.set('academic_period_id', periodId);
      url = `/api/v1/gradebook/period-grades/cross-subject?${params.toString()}`;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiClient<any>(url)
      .then((raw) => {
        // Unwrap potential { data: ... } wrapper
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any =
          raw?.data && typeof raw.data === 'object' && 'students' in raw.data ? raw.data : raw;

        // Normalize year-overview (has periods[] + per-student year_overall) into CrossSubjectData shape
        if (periodId === 'all' && res.periods) {
          const subjects = (res.subjects ?? []) as Array<{ id: string; name: string }>;
          const normalized: CrossSubjectData = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            students: (res.students ?? []).map((s: any) => {
              // Average each subject's grades across all periods
              const subjectGrades: Record<string, GradeCell> = {};
              for (const sub of subjects) {
                const periodScores: number[] = [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                for (const p of res.periods as any[]) {
                  const cell = s.grades?.[p.id]?.[sub.id];
                  if (cell?.computed != null) periodScores.push(Number(cell.computed));
                }
                if (periodScores.length > 0) {
                  const avg =
                    periodScores.reduce((a: number, b: number) => a + b, 0) / periodScores.length;
                  subjectGrades[sub.id] = { computed: Math.round(avg * 100) / 100, display: null };
                } else {
                  subjectGrades[sub.id] = { computed: null, display: null };
                }
              }
              return {
                student_id: s.student_id as string,
                student_name: s.student_name as string,
                subject_grades: subjectGrades,
                overall: {
                  computed:
                    s.year_overall?.computed != null ? Number(s.year_overall.computed) : null,
                  display: (s.year_overall?.display as string) ?? null,
                },
              };
            }),
            subjects: subjects.map((s) => ({ ...s, weight: 0 })),
          };
          setData(normalized);
        } else {
          setData(res as CrossSubjectData);
        }
      })
      .catch((err) => {
        console.error('[AnalyticsTab]', err);
        setData(null);
      })
      .finally(() => setIsLoading(false));
  }, [classId, periodId, academicYearId]);

  // ─── Derived analytics data ─────────────────────────────────────────────

  const students = data?.students ?? [];
  const allSubjects = data?.subjects ?? [];

  // Overall scores for all students
  const overallScores = students
    .map((s) => s.overall?.computed)
    .filter((v): v is number => v != null);

  const overallStats = React.useMemo(() => computeStats(overallScores), [overallScores]);

  // Subject averages
  const subjectAverages = React.useMemo(() => {
    if (!data) return [];
    return allSubjects.map((sub) => {
      const scores = students
        .map((s) => s.subject_grades?.[sub.id]?.computed)
        .filter((v): v is number => v != null);
      const avg = scores.length > 0 ? scores.reduce((s, v) => s + v, 0) / scores.length : 0;
      return {
        name: sub.name,
        average: Math.round(avg * 100) / 100,
        count: scores.length,
      };
    });
  }, [data, allSubjects, students]);

  // Grade distribution (A-F count)
  const gradeDistribution = React.useMemo(() => {
    const counts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    for (const student of students) {
      if (isAllSubjects) {
        // Use overall score — display is always a percentage for overalls
        const letter = scoreToLetter(student.overall?.computed ?? null);
        if (letter in counts) counts[letter]!++;
      } else {
        const cell = student.subject_grades?.[subjectId];
        // Prefer letter from display, fall back to score-based
        const display = cell?.display ?? null;
        const letter =
          display && !display.endsWith('%')
            ? letterFromDisplay(display)
            : scoreToLetter(cell?.computed ?? null);
        if (letter in counts) counts[letter]!++;
      }
    }
    return GRADE_ORDER.map((grade) => ({
      grade,
      count: counts[grade] ?? 0,
      color: GRADE_COLORS[grade]!,
    }));
  }, [students, isAllSubjects, subjectId]);

  // Top & bottom performers
  const rankedStudents = React.useMemo(() => {
    if (!data) return [];
    const scored = students
      .map((s) => {
        const score = isAllSubjects ? s.overall?.computed : s.subject_grades?.[subjectId]?.computed;
        const rawDisplay = isAllSubjects
          ? s.overall?.display
          : s.subject_grades?.[subjectId]?.display;
        // Resolve letter grade: prefer API display, fall back to score-derived
        const display =
          rawDisplay && !rawDisplay.endsWith('%') ? rawDisplay : scoreToLetter(score ?? null);
        return {
          student_id: s.student_id,
          student_name: s.student_name,
          score: score ?? null,
          display: display !== 'N/A' ? display : null,
        };
      })
      .filter((s) => s.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return scored;
  }, [data, students, isAllSubjects, subjectId]);

  // Subject-specific stats
  const subjectStats = React.useMemo(() => {
    if (isAllSubjects || !data) return null;
    const scores = students
      .map((s) => s.subject_grades?.[subjectId]?.computed)
      .filter((v): v is number => v != null);
    return computeStats(scores);
  }, [data, students, isAllSubjects, subjectId]);

  // Student profile data
  const selectedStudent = React.useMemo(() => {
    if (!studentId || !data) return null;
    return students.find((s) => s.student_id === studentId) ?? null;
  }, [studentId, data, students]);

  const studentRadarData = React.useMemo(() => {
    if (!selectedStudent || !data) return [];
    return allSubjects.map((sub) => {
      const score = selectedStudent.subject_grades?.[sub.id]?.computed ?? 0;
      const classScores = students
        .map((s) => s.subject_grades?.[sub.id]?.computed)
        .filter((v): v is number => v != null);
      const classAvg =
        classScores.length > 0 ? classScores.reduce((s, v) => s + v, 0) / classScores.length : 0;
      return {
        subject: sub.name,
        score: Math.round(score * 10) / 10,
        classAverage: Math.round(classAvg * 10) / 10,
      };
    });
  }, [selectedStudent, data, allSubjects, students]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={periodId}
          onValueChange={(v) => {
            setPeriodId(v);
            setStudentId('');
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('period')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allPeriods')}</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={subjectId}
          onValueChange={(v) => {
            setSubjectId(v);
            setStudentId('');
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('subject')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allSubjects')}</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Student selector */}
        {data && students.length > 0 && (
          <Select value={studentId} onValueChange={(v) => setStudentId(v === '__none' ? '' : v)}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder={t('student')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">
                {tc('all')} {t('student')}s
              </SelectItem>
              {students
                .slice()
                .sort((a, b) => a.student_name.localeCompare(b.student_name))
                .map((s) => (
                  <SelectItem key={s.student_id} value={s.student_id}>
                    {s.student_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* No period selected */}
      {!periodId ? (
        <p className="py-16 text-center text-sm text-text-tertiary">
          Select a period to view analytics.
        </p>
      ) : isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : !data || students.length === 0 ? (
        <p className="py-16 text-center text-sm text-text-tertiary">
          No grade data available for this selection.
        </p>
      ) : viewMode === 'student-profile' && selectedStudent ? (
        /* ──────────────────────────────────────────────────────────────────
         *  VIEW 3: Student Profile
         * ────────────────────────────────────────────────────────────────── */
        <div className="space-y-5">
          {/* Student header */}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-gradient-to-r from-primary-50 to-surface p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-lg font-bold text-white">
              {selectedStudent.student_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                {selectedStudent.student_name}
              </h2>
              <p className="text-sm text-text-secondary">
                Overall:{' '}
                <span className="font-semibold text-primary-700">
                  {selectedStudent.overall?.computed != null
                    ? `${selectedStudent.overall.computed}%`
                    : '—'}
                  {selectedStudent.overall?.display &&
                  !selectedStudent.overall.display.endsWith('%')
                    ? ` (${selectedStudent.overall.display})`
                    : ''}
                </span>
                {(() => {
                  const rank =
                    rankedStudents.findIndex((r) => r.student_id === selectedStudent.student_id) +
                    1;
                  return rank > 0 && rank <= 3 ? (
                    <>
                      {' · '}
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 px-2 py-0.5 text-xs font-semibold text-warning-800">
                        Top {rank}
                      </span>
                    </>
                  ) : null;
                })()}
              </p>
            </div>
          </div>

          {/* Radar Chart */}
          {studentRadarData.length > 2 && (
            <Section title="Performance Across Subjects">
              <div className="flex justify-center">
                <ResponsiveContainer width="100%" height={350}>
                  <RadarChart data={studentRadarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="var(--color-border, #e5e7eb)" />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: '#1a1a1a' }}
                    />
                    <Radar
                      name="Class Average"
                      dataKey="classAverage"
                      stroke="#2563eb"
                      fill="#2563eb"
                      fillOpacity={0.12}
                      strokeWidth={2}
                      strokeDasharray="5 3"
                    />
                    <Radar
                      name={selectedStudent.student_name}
                      dataKey="score"
                      stroke="#15803d"
                      fill="#86efac"
                      fillOpacity={0.35}
                      strokeWidth={2.5}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 flex justify-center gap-6 text-xs text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: '#15803d' }}
                  />
                  {selectedStudent.student_name}
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: '#2563eb' }}
                  />
                  Class Average
                </span>
              </div>
            </Section>
          )}

          {/* Strengths & Weaknesses */}
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Strengths">
              <div className="space-y-2">
                {studentRadarData
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3)
                  .map((d) => (
                    <div
                      key={d.subject}
                      className="flex items-center justify-between rounded-lg bg-success-50 px-4 py-2.5"
                    >
                      <span className="text-sm font-medium text-text-primary">{d.subject}</span>
                      <span className="font-mono text-sm font-bold text-success-700" dir="ltr">
                        {d.score}%
                      </span>
                    </div>
                  ))}
              </div>
            </Section>
            <Section title="Areas for Improvement">
              <div className="space-y-2">
                {studentRadarData
                  .slice()
                  .sort((a, b) => a.score - b.score)
                  .slice(0, 3)
                  .map((d) => (
                    <div
                      key={d.subject}
                      className="flex items-center justify-between rounded-lg bg-danger-50 px-4 py-2.5"
                    >
                      <span className="text-sm font-medium text-text-primary">{d.subject}</span>
                      <span className="font-mono text-sm font-bold text-danger-700" dir="ltr">
                        {d.score}%
                      </span>
                    </div>
                  ))}
              </div>
            </Section>
          </div>

          {/* Full Grade Table */}
          <Section title="Grade Summary">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-start font-medium text-text-secondary">
                      Subject
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium text-text-secondary">
                      Score
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium text-text-secondary">
                      Grade
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium text-text-secondary">
                      Class Avg
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium text-text-secondary">
                      vs. Class
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allSubjects.map((sub) => {
                    const cell = selectedStudent.subject_grades?.[sub.id];
                    const score = cell?.computed ?? null;
                    const classScores = students
                      .map((s) => s.subject_grades?.[sub.id]?.computed)
                      .filter((v): v is number => v != null)
                      .sort((a, b) => b - a);
                    const classAvg =
                      classScores.length > 0
                        ? classScores.reduce((s, v) => s + v, 0) / classScores.length
                        : 0;
                    const diff = score != null ? score - classAvg : null;

                    return (
                      <tr key={sub.id} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 font-medium text-text-primary">{sub.name}</td>
                        <td className="px-4 py-3 text-center font-mono" dir="ltr">
                          {score != null ? `${score}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cell?.display && !cell.display.endsWith('%') ? (
                            <span
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                              style={{
                                backgroundColor:
                                  GRADE_COLORS[letterFromDisplay(cell.display)] ?? '#6b7280',
                              }}
                            >
                              {cell.display}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-center font-mono text-text-secondary"
                          dir="ltr"
                        >
                          {classAvg > 0 ? `${Math.round(classAvg * 10) / 10}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs" dir="ltr">
                          {diff != null ? (
                            <span
                              className={`font-semibold ${diff >= 0 ? 'text-success-700' : 'text-danger-700'}`}
                            >
                              {diff >= 0 ? '+' : ''}
                              {Math.round(diff * 10) / 10}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      ) : (
        /* ──────────────────────────────────────────────────────────────────
         *  VIEW 1 & 2: Class Overview / Subject Deep Dive
         * ────────────────────────────────────────────────────────────────── */
        <div className="space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="Mean"
              value={
                isAllSubjects
                  ? `${overallStats.mean}%`
                  : subjectStats
                    ? `${subjectStats.mean}%`
                    : '—'
              }
            />
            <StatCard
              label="Median"
              value={
                isAllSubjects
                  ? `${overallStats.median}%`
                  : subjectStats
                    ? `${subjectStats.median}%`
                    : '—'
              }
            />
            <StatCard
              label="Std Dev"
              value={isAllSubjects ? overallStats.stdDev : subjectStats ? subjectStats.stdDev : '—'}
            />
            <StatCard
              label="Pass Rate"
              value={
                isAllSubjects
                  ? `${overallStats.passRate}%`
                  : subjectStats
                    ? `${subjectStats.passRate}%`
                    : '—'
              }
              accent={
                (isAllSubjects ? overallStats.passRate : (subjectStats?.passRate ?? 0)) >= 60
                  ? '#22c55e'
                  : '#ef4444'
              }
            />
            <StatCard
              label="Highest"
              value={
                isAllSubjects ? `${overallStats.max}%` : subjectStats ? `${subjectStats.max}%` : '—'
              }
              accent="#22c55e"
            />
            <StatCard
              label="Lowest"
              value={
                isAllSubjects ? `${overallStats.min}%` : subjectStats ? `${subjectStats.min}%` : '—'
              }
              accent="#ef4444"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Grade Distribution */}
            <Section title="Grade Distribution">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={gradeDistribution}
                  margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border, #e5e7eb)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="grade"
                    tick={{ fontSize: 13, fontWeight: 600, fill: 'var(--color-text-primary)' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => {
                      const n = typeof value === 'number' ? value : 0;
                      return [`${n} student${n !== 1 ? 's' : ''}`, 'Count'];
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={44}>
                    {gradeDistribution.map((entry) => (
                      <Cell key={entry.grade} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 flex justify-center gap-3 text-xs text-text-secondary">
                {gradeDistribution.map((d) => (
                  <span key={d.grade} className="flex items-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: d.color }}
                    />
                    {d.grade}: {d.count}
                  </span>
                ))}
              </div>
            </Section>

            {/* Subject Averages (class overview) or Score Distribution (subject dive) */}
            {isAllSubjects ? (
              <Section title="Average Score by Subject">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={subjectAverages}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 5, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border, #e5e7eb)"
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      tick={{ fontSize: 11, fill: 'var(--color-text-primary)' }}
                      tickLine={false}
                      axisLine={false}
                      width={90}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [`${value}%`, 'Average']}
                    />
                    <Bar dataKey="average" radius={[0, 6, 6, 0]} barSize={22}>
                      {subjectAverages.map((entry) => {
                        const color =
                          entry.average >= 80
                            ? '#22c55e'
                            : entry.average >= 60
                              ? '#3b82f6'
                              : entry.average >= 40
                                ? '#f59e0b'
                                : '#ef4444';
                        return <Cell key={entry.name} fill={color} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            ) : (
              <Section title="Student Scores">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={rankedStudents.slice(0, 15).map((s) => ({
                      name: s.student_name.split(' ')[0],
                      score: s.score,
                    }))}
                    margin={{ top: 10, right: 10, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border, #e5e7eb)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                      tickLine={false}
                      axisLine={false}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value) => [`${value}%`, 'Score']}
                    />
                    <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={24}>
                      {rankedStudents.slice(0, 15).map((s) => {
                        const color =
                          (s.score ?? 0) >= 80
                            ? '#22c55e'
                            : (s.score ?? 0) >= 60
                              ? '#3b82f6'
                              : (s.score ?? 0) >= 40
                                ? '#f59e0b'
                                : '#ef4444';
                        return <Cell key={s.student_id} fill={color} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Section>
            )}
          </div>

          {/* Top & Bottom Performers */}
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Top 5 Performers">
              <div className="space-y-2">
                {rankedStudents.slice(0, 5).map((s, i) => (
                  <div
                    key={s.student_id}
                    className="flex items-center gap-3 rounded-lg bg-surface-secondary/50 px-4 py-2.5"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-text-primary">
                      {s.student_name}
                    </span>
                    <span className="font-mono text-sm font-bold text-success-700" dir="ltr">
                      {s.score != null ? `${s.score}%` : '—'}
                    </span>
                    {s.display && !s.display.endsWith('%') && (
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                        style={{
                          backgroundColor: GRADE_COLORS[letterFromDisplay(s.display)] ?? '#6b7280',
                        }}
                      >
                        {s.display}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Bottom 5 Performers">
              <div className="space-y-2">
                {rankedStudents
                  .slice(-5)
                  .reverse()
                  .map((s, i) => (
                    <div
                      key={s.student_id}
                      className="flex items-center gap-3 rounded-lg bg-surface-secondary/50 px-4 py-2.5"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-100 text-xs font-bold text-danger-700">
                        {rankedStudents.length - (4 - i)}
                      </span>
                      <span className="flex-1 text-sm font-medium text-text-primary">
                        {s.student_name}
                      </span>
                      <span className="font-mono text-sm font-bold text-danger-700" dir="ltr">
                        {s.score != null ? `${s.score}%` : '—'}
                      </span>
                      {s.display && !s.display.endsWith('%') && (
                        <span
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{
                            backgroundColor:
                              GRADE_COLORS[letterFromDisplay(s.display)] ?? '#6b7280',
                          }}
                        >
                          {s.display}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </Section>
          </div>

          {/* Full Student Rankings Table */}
          <Section title="Full Student Rankings">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 text-start font-medium text-text-secondary w-12">
                      #
                    </th>
                    <th className="px-4 py-2.5 text-start font-medium text-text-secondary">
                      {t('student')}
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium text-text-secondary">
                      Score
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium text-text-secondary">
                      Grade
                    </th>
                    <th className="px-4 py-2.5 text-start font-medium text-text-secondary">
                      Percentile
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rankedStudents.map((s, i) => {
                    const percentile = Math.round(
                      ((rankedStudents.length - i) / rankedStudents.length) * 100,
                    );
                    const barWidth = s.score ?? 0;
                    return (
                      <tr
                        key={s.student_id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50 transition-colors cursor-pointer"
                        onClick={() => setStudentId(s.student_id)}
                      >
                        <td className="px-4 py-2.5 font-mono text-text-tertiary">{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-text-primary">
                          {s.student_name}
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono" dir="ltr">
                          {s.score != null ? `${s.score}%` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {s.display && !s.display.endsWith('%') ? (
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{
                                backgroundColor:
                                  GRADE_COLORS[letterFromDisplay(s.display)] ?? '#6b7280',
                              }}
                            >
                              {s.display}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-secondary">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${barWidth}%`,
                                  backgroundColor:
                                    barWidth >= 80
                                      ? '#22c55e'
                                      : barWidth >= 60
                                        ? '#3b82f6'
                                        : barWidth >= 40
                                          ? '#f59e0b'
                                          : '#ef4444',
                                }}
                              />
                            </div>
                            <span className="text-xs text-text-tertiary whitespace-nowrap">
                              P{percentile}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
