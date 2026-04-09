'use client';

import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import * as XLSX from 'xlsx';

import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

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

  // Local grade view (merged from server data)
  const [localGrades, setLocalGrades] = React.useState<Record<string, Record<string, GradeEntry>>>(
    {},
  );

  // Load filter options
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch((err) => {
        console.error('[ResultsMatrix]', err);
      });
  }, []);

  // Fetch matrix when period changes
  React.useEffect(() => {
    if (!periodId) return;
    setIsLoading(true);
    const url =
      periodId === 'all'
        ? `/api/v1/gradebook/classes/${classId}/results-matrix`
        : `/api/v1/gradebook/classes/${classId}/results-matrix?academic_period_id=${periodId}`;
    apiClient<{ data: MatrixData }>(url)
      .then((res) => {
        const matrixData = res.data;
        setMatrix(matrixData);
        setLocalGrades(matrixData.grades ?? {});
      })
      .catch((err) => {
        console.error('[ResultsMatrix]', err);
        setMatrix(null);
        setLocalGrades({});
      })
      .finally(() => setIsLoading(false));
  }, [classId, periodId]);

  // Get grade value for a cell
  const getGrade = (studentId: string, assessmentId: string): GradeEntry => {
    return localGrades[studentId]?.[assessmentId] ?? { raw_score: null, is_missing: false };
  };

  // Filter subjects (guard against undefined subjects in API response)
  const displaySubjects = matrix?.subjects
    ? subjectFilter === 'all'
      ? matrix.subjects
      : matrix.subjects.filter((s) => s.id === subjectFilter)
    : [];

  // Count stats
  const totalAssessments = displaySubjects.reduce((acc, s) => acc + s.assessments.length, 0);
  const totalCells = (matrix?.students.length ?? 0) * totalAssessments;
  const filledCells = matrix
    ? matrix.students.reduce((acc, student) => {
        return (
          acc +
          displaySubjects.reduce((sacc, subject) => {
            return (
              sacc +
              subject.assessments.reduce((aacc, assessment) => {
                const grade = getGrade(student.id, assessment.id);
                return aacc + (grade.raw_score != null || grade.is_missing ? 1 : 0);
              }, 0)
            );
          }, 0)
        );
      }, 0)
    : 0;

  // ─── Export helpers ─────────────────────────────────────────────────────

  /** Build a flat 2D array from the matrix for export */
  const buildExportRows = (): { headers: string[][]; rows: (string | number)[][] } => {
    // Row 1: subject group headers
    const subjectRow: string[] = ['Student'];
    for (const subject of displaySubjects) {
      subjectRow.push(subject.name);
      // fill remaining columns for this subject's assessments
      for (let i = 1; i < subject.assessments.length; i++) {
        subjectRow.push('');
      }
    }

    // Row 2: assessment titles
    const assessmentRow: string[] = [''];
    for (const subject of displaySubjects) {
      for (const a of subject.assessments) {
        assessmentRow.push(`${a.title} (/${a.max_score})`);
      }
    }

    // Data rows
    const rows: (string | number)[][] = [];
    if (matrix) {
      for (const student of matrix.students) {
        const row: (string | number)[] = [`${student.first_name} ${student.last_name}`];
        for (const subject of displaySubjects) {
          for (const a of subject.assessments) {
            const grade = getGrade(student.id, a.id);
            row.push(grade.raw_score != null ? grade.raw_score : '—');
          }
        }
        rows.push(row);
      }
    }

    return { headers: [subjectRow, assessmentRow], rows };
  };

  const exportToExcel = () => {
    const { headers, rows } = buildExportRows();
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...rows]);

    // Merge subject header cells
    const merges: XLSX.Range[] = [];
    let col = 1;
    for (const subject of displaySubjects) {
      if (subject.assessments.length > 1) {
        merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + subject.assessments.length - 1 } });
      }
      col += subject.assessments.length;
    }
    ws['!merges'] = merges;

    // Set column widths
    ws['!cols'] = [
      { wch: 25 },
      ...displaySubjects.flatMap((s) => s.assessments.map(() => ({ wch: 18 }))),
    ];

    const wb = XLSX.utils.book_new();
    const periodLabel =
      periodId === 'all'
        ? 'All Periods'
        : (periods.find((p) => p.id === periodId)?.name ?? 'Results');
    XLSX.utils.book_append_sheet(wb, ws, periodLabel.slice(0, 31));

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(
      new Blob([buf], { type: 'application/octet-stream' }),
      `results-matrix-${periodLabel}.xlsx`,
    );
  };

  const exportToPdf = () => {
    const { headers, rows } = buildExportRows();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    const periodLabel =
      periodId === 'all'
        ? 'All Periods'
        : (periods.find((p) => p.id === periodId)?.name ?? 'Results');

    doc.setFontSize(14);
    doc.text(`Results Matrix — ${periodLabel}`, 14, 15);

    autoTable(doc, {
      head: headers,
      body: rows.map((r) => r.map(String)),
      startY: 22,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [34, 120, 74], textColor: 255, fontSize: 7 },
      theme: 'grid',
    });

    doc.save(`results-matrix-${periodLabel}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-52">
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

        {matrix && matrix.subjects.length > 1 && (
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={t('subject')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allSubjects')}</SelectItem>
              {matrix.subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Export dropdown — right side */}
        {matrix && displaySubjects.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="ms-auto">
                <Download className="me-1.5 h-3.5 w-3.5" />
                {tc('export')}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-40 p-1">
              <button
                onClick={exportToExcel}
                className="w-full rounded-md px-3 py-2 text-start text-sm hover:bg-surface-secondary transition-colors"
              >
                Export as Excel
              </button>
              <button
                onClick={exportToPdf}
                className="w-full rounded-md px-3 py-2 text-start text-sm hover:bg-surface-secondary transition-colors"
              >
                Export as PDF
              </button>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* No period selected */}
      {!periodId && (
        <p className="py-12 text-center text-sm text-text-tertiary">{t('selectAPeriodToView')}</p>
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
                                width: 72,
                                minWidth: 72,
                                padding: '8px 4px',
                                textAlign: 'center',
                                verticalAlign: 'bottom',
                                whiteSpace: 'normal',
                              }}
                            >
                              <span className="block text-[10px] font-semibold text-text-primary leading-tight">
                                {assessment.title}
                              </span>
                              <span className="block text-[10px] font-bold text-danger-text mt-0.5">
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

                            return (
                              <td
                                key={assessment.id}
                                className={`px-0.5 py-1 text-center border-b border-border ${
                                  isLastInSubject && si < displaySubjects.length - 1
                                    ? 'border-e-2 border-e-primary-100'
                                    : 'border-e border-e-border/50'
                                }`}
                                style={{ width: 72 }}
                              >
                                <span
                                  className="inline-block w-[60px] rounded bg-surface-secondary px-1 py-1 text-center text-xs font-medium text-text-tertiary"
                                  dir="ltr"
                                >
                                  {grade.raw_score != null ? grade.raw_score : '—'}
                                </span>
                              </td>
                            );
                          }),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Stats bar */}
              <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-secondary/50 px-4 py-3">
                <p className="text-xs text-text-secondary">
                  <strong className="text-text-primary">{matrix.students.length}</strong>{' '}
                  {tc('student').toLowerCase()}s{' · '}
                  <strong className="text-text-primary">{displaySubjects.length}</strong>{' '}
                  {t('subject').toLowerCase()}s{' · '}
                  <strong className="text-text-primary">{filledCells}</strong>
                  {t('of')} <strong className="text-text-primary">{totalCells}</strong>
                  {t('gradesEntered')}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
