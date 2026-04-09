'use client';

import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, Info } from 'lucide-react';
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

interface MatrixCategory {
  category_id: string;
  category_name: string;
}

interface MatrixSubject {
  id: string;
  name: string;
  code: string | null;
  categories: MatrixCategory[];
}

interface CategoryCell {
  percentage: number | null;
  assessment_count: number;
}

interface MatrixData {
  students: MatrixStudent[];
  subjects: MatrixSubject[];
  cells: Record<string, Record<string, Record<string, CategoryCell>>>;
}

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatCell(cell: CategoryCell | undefined): string {
  if (!cell || cell.percentage == null) return '—';
  return `${cell.percentage.toFixed(1)}%`;
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
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);

  // Clear selection when switching filters or class
  React.useEffect(() => {
    setSelectedStudentId(null);
  }, [classId, periodId, subjectFilter]);

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
        setMatrix(res.data);
      })
      .catch((err) => {
        console.error('[ResultsMatrix]', err);
        setMatrix(null);
      })
      .finally(() => setIsLoading(false));
  }, [classId, periodId]);

  const getCell = (
    studentId: string,
    subjectId: string,
    categoryId: string,
  ): CategoryCell | undefined => {
    return matrix?.cells[studentId]?.[subjectId]?.[categoryId];
  };

  // Filter subjects (guard against undefined subjects in API response)
  const displaySubjects = matrix?.subjects
    ? subjectFilter === 'all'
      ? matrix.subjects
      : matrix.subjects.filter((s) => s.id === subjectFilter)
    : [];

  // Stats
  const totalCategories = displaySubjects.reduce((acc, s) => acc + s.categories.length, 0);
  const totalCells = (matrix?.students.length ?? 0) * totalCategories;
  const filledCells = matrix
    ? matrix.students.reduce((acc, student) => {
        return (
          acc +
          displaySubjects.reduce((sacc, subject) => {
            return (
              sacc +
              subject.categories.reduce((cacc, category) => {
                const cell = getCell(student.id, subject.id, category.category_id);
                return cacc + (cell && cell.percentage != null ? 1 : 0);
              }, 0)
            );
          }, 0)
        );
      }, 0)
    : 0;

  // ─── Context title ──────────────────────────────────────────────────────

  const buildContextTitle = (): string => {
    const periodLabel =
      periodId === 'all' ? 'all periods' : (periods.find((p) => p.id === periodId)?.name ?? '—');
    const subjectLabel =
      subjectFilter === 'all'
        ? 'all subjects'
        : (matrix?.subjects.find((s) => s.id === subjectFilter)?.name ?? '—');
    return `This table displays results for ${periodLabel} and ${subjectLabel}`;
  };

  // ─── Export helpers ─────────────────────────────────────────────────────

  /** Build a flat 2D array from the matrix for export */
  const buildExportRows = (): { headers: string[][]; rows: (string | number)[][] } => {
    // Row 1: subject group headers
    const subjectRow: string[] = ['Student'];
    for (const subject of displaySubjects) {
      subjectRow.push(subject.name);
      for (let i = 1; i < subject.categories.length; i++) {
        subjectRow.push('');
      }
    }

    // Row 2: category titles
    const categoryRow: string[] = [''];
    for (const subject of displaySubjects) {
      for (const cat of subject.categories) {
        categoryRow.push(cat.category_name);
      }
    }

    // Data rows
    const rows: (string | number)[][] = [];
    if (matrix) {
      for (const student of matrix.students) {
        const row: (string | number)[] = [`${student.first_name} ${student.last_name}`];
        for (const subject of displaySubjects) {
          for (const cat of subject.categories) {
            const cell = getCell(student.id, subject.id, cat.category_id);
            row.push(cell && cell.percentage != null ? `${cell.percentage.toFixed(1)}%` : '—');
          }
        }
        rows.push(row);
      }
    }

    return { headers: [subjectRow, categoryRow], rows };
  };

  const exportToExcel = () => {
    const { headers, rows } = buildExportRows();
    const title = buildContextTitle();

    // Build title row padded to the full table width so the merge is clean
    const totalCols = 1 + displaySubjects.reduce((acc, s) => acc + s.categories.length, 0);
    const titleRow: string[] = new Array(totalCols).fill('');
    titleRow[0] = title;

    // Sheet layout: [title, subjectRow, categoryRow, ...data]
    const ws = XLSX.utils.aoa_to_sheet([titleRow, ...headers, ...rows]);

    const merges: XLSX.Range[] = [];
    // Merge title across the full table width
    if (totalCols > 1) {
      merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });
    }
    // Subject group headers are now at row 1 (was row 0 before the title)
    let col = 1;
    for (const subject of displaySubjects) {
      if (subject.categories.length > 1) {
        merges.push({ s: { r: 1, c: col }, e: { r: 1, c: col + subject.categories.length - 1 } });
      }
      col += subject.categories.length;
    }
    ws['!merges'] = merges;

    ws['!cols'] = [
      { wch: 25 },
      ...displaySubjects.flatMap((s) => s.categories.map(() => ({ wch: 20 }))),
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
    const title = buildContextTitle();
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    const periodLabel =
      periodId === 'all'
        ? 'All Periods'
        : (periods.find((p) => p.id === periodId)?.name ?? 'Results');

    doc.setFontSize(14);
    doc.text(title, 14, 15);

    autoTable(doc, {
      head: headers,
      body: rows.map((r) => r.map(String)),
      startY: 22,
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: [34, 120, 74], textColor: 255, fontSize: 8 },
      theme: 'grid',
    });

    doc.save(`results-matrix-${periodLabel}.pdf`);
  };

  return (
    <div className="space-y-4">
      {/* Notice banner — always visible, not included in exports */}
      <div className="flex items-start gap-3 rounded-lg border border-info-text/20 bg-info-fill px-4 py-3 text-sm text-info-text">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong className="font-semibold">Note:</strong> The scores shown here are raw inputs
          pooled by category. They aren&apos;t necessarily the numbers that drive a student&apos;s
          final grade — category weights, period weights and the grading scale decide that. See the{' '}
          <strong className="font-semibold">Grades</strong> tab for the computed result.
        </p>
      </div>

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
              {/* Context title — visible in the UI and also injected into exports */}
              <div className="border-b border-border bg-surface-secondary/60 px-4 py-2.5">
                <p className="text-xs font-medium italic text-text-secondary">
                  {buildContextTitle()}
                </p>
              </div>
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
                          colSpan={subject.categories.length}
                          className="bg-primary-700 text-white text-xs font-semibold px-2 py-2 text-center border-e-2 border-white/20 last:border-e-0"
                        >
                          {subject.name}
                        </th>
                      ))}
                    </tr>
                    {/* Category sub-headers */}
                    <tr>
                      {displaySubjects.map((subject, si) =>
                        subject.categories.map((category, ci) => {
                          const isLastInSubject = ci === subject.categories.length - 1;
                          return (
                            <th
                              key={`${subject.id}:${category.category_id}`}
                              className={`bg-surface-secondary border-b-2 border-border ${
                                isLastInSubject && si < displaySubjects.length - 1
                                  ? 'border-e-2 border-e-primary-200'
                                  : 'border-e border-e-border'
                              }`}
                              style={{
                                width: 96,
                                minWidth: 96,
                                padding: '8px 6px',
                                textAlign: 'center',
                                verticalAlign: 'bottom',
                                whiteSpace: 'normal',
                              }}
                            >
                              <span className="block text-[10px] font-semibold text-text-primary leading-tight">
                                {category.category_name}
                              </span>
                            </th>
                          );
                        }),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.students.map((student, rowIdx) => {
                      const isSelected = selectedStudentId === student.id;
                      const rowBg = isSelected
                        ? 'bg-primary-100'
                        : rowIdx % 2 === 1
                          ? 'bg-surface-secondary'
                          : 'bg-surface';
                      const rowHover = isSelected ? 'hover:bg-primary-100' : 'hover:bg-primary-50';
                      return (
                        <tr
                          key={student.id}
                          onClick={() => setSelectedStudentId(isSelected ? null : student.id)}
                          aria-selected={isSelected}
                          className={`cursor-pointer ${rowBg} ${rowHover} transition-colors`}
                        >
                          <td
                            className="sticky start-0 z-10 bg-inherit px-3 py-1.5 text-sm font-medium text-text-primary border-e-2 border-border whitespace-nowrap overflow-hidden text-ellipsis"
                            style={{ width: 140, maxWidth: 140 }}
                            title={`${student.first_name} ${student.last_name}`}
                          >
                            {student.first_name} {student.last_name}
                          </td>
                          {displaySubjects.map((subject, si) =>
                            subject.categories.map((category, ci) => {
                              const isLastInSubject = ci === subject.categories.length - 1;
                              const cell = getCell(student.id, subject.id, category.category_id);

                              return (
                                <td
                                  key={`${subject.id}:${category.category_id}`}
                                  className={`px-1 py-1 text-center border-b border-border ${
                                    isLastInSubject && si < displaySubjects.length - 1
                                      ? 'border-e-2 border-e-primary-100'
                                      : 'border-e border-e-border/50'
                                  }`}
                                  style={{ width: 96 }}
                                >
                                  <span
                                    className="inline-block w-[80px] rounded bg-surface-secondary px-1 py-1 text-center text-xs font-semibold text-text-primary tabular-nums"
                                    dir="ltr"
                                  >
                                    {formatCell(cell)}
                                  </span>
                                </td>
                              );
                            }),
                          )}
                        </tr>
                      );
                    })}
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
