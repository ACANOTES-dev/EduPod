'use client';

import { ArrowLeft, Library, Medal } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types (mirror backend ClassMatrixResponse) ──────────────────────────────

interface MatrixStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  preferred_second_language: string | null;
}

interface MatrixSubject {
  id: string;
  name: string;
  code: string | null;
}

interface MatrixCell {
  score: number | null;
  grade: string | null;
  assessment_count: number;
  has_override: boolean;
}

interface MatrixOverall {
  weighted_average: number | null;
  overall_grade: string | null;
  rank_position: number | null;
}

interface ClassMatrixResponse {
  class: {
    id: string;
    name: string;
    year_group: { id: string; name: string } | null;
  };
  period: { id: string; name: string };
  students: MatrixStudent[];
  subjects: MatrixSubject[];
  cells: Record<string, Record<string, MatrixCell>>;
  overall_by_student: Record<string, MatrixOverall>;
}

interface PeriodOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

type DisplayMode = 'score' | 'grade';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCell(cell: MatrixCell | undefined, mode: DisplayMode): string {
  if (!cell) return '—';
  if (mode === 'grade') {
    return cell.grade ?? '—';
  }
  return cell.score != null ? `${cell.score.toFixed(1)}%` : '—';
}

function formatOverall(overall: MatrixOverall | undefined, mode: DisplayMode): string {
  if (!overall) return '—';
  if (mode === 'grade') {
    return overall.overall_grade ?? '—';
  }
  return overall.weighted_average != null ? `${overall.weighted_average.toFixed(1)}%` : '—';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportCardsClassPage() {
  const t = useTranslations('reportCards');
  const tm = useTranslations('reportCards.classMatrix');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const params = useParams();
  const classId = params?.classId as string;

  const [periods, setPeriods] = React.useState<PeriodOption[]>([]);
  const [periodId, setPeriodId] = React.useState<string>('all');
  const [displayMode, setDisplayMode] = React.useState<DisplayMode>('grade');
  const [matrix, setMatrix] = React.useState<ClassMatrixResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);

  // Load period options once
  React.useEffect(() => {
    let cancelled = false;
    apiClient<ListResponse<PeriodOption>>('/api/v1/academic-periods?pageSize=50')
      .then((res) => {
        if (!cancelled) setPeriods(res.data ?? []);
      })
      .catch((err) => {
        console.error('[ReportCardsClassPage]', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch matrix whenever classId or period changes
  React.useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setLoadFailed(false);
      setNotFound(false);
      try {
        const res = await apiClient<ClassMatrixResponse>(
          `/api/v1/report-cards/classes/${classId}/matrix?academic_period_id=${periodId}`,
        );
        if (!cancelled) setMatrix(res);
      } catch (err) {
        console.error('[ReportCardsClassPage]', err);
        if (!cancelled) {
          setMatrix(null);
          // Detect 404 from the structured error payload
          const maybeError = err as { code?: string; status?: number };
          if (maybeError?.code === 'CLASS_NOT_FOUND' || maybeError?.status === 404) {
            setNotFound(true);
          } else {
            setLoadFailed(true);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [classId, periodId]);

  const yearGroupName = matrix?.class.year_group?.name ?? '';
  const className = matrix?.class.name ?? '';

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={className || t('title')}
        description={yearGroupName}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/${locale}/report-cards`)}
            >
              <ArrowLeft className="me-1.5 h-4 w-4" />
              {t('backToReportCards')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/${locale}/report-cards/library`)}
            >
              <Library className="me-1.5 h-4 w-4" />
              {t('librarySectionButton')}
            </Button>
          </div>
        }
      />

      {/* Toolbar: period selector + display toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder={tm('selectPeriod')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tm('allPeriods')}</SelectItem>
            {periods.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div
          className="inline-flex rounded-lg border border-border bg-surface p-1"
          role="tablist"
          aria-label={tm('displayMode')}
        >
          {(['grade', 'score'] as DisplayMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={displayMode === mode}
              onClick={() => setDisplayMode(mode)}
              className={`min-h-11 rounded-md px-4 text-sm font-medium transition-colors ${
                displayMode === mode
                  ? 'bg-primary-600 text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tm(mode)}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      )}

      {/* Class not found */}
      {!isLoading && notFound && (
        <EmptyState
          icon={ArrowLeft}
          title={tm('classNotFound')}
          action={{
            label: t('backToReportCards'),
            onClick: () => router.push(`/${locale}/report-cards`),
          }}
        />
      )}

      {/* Load failure */}
      {!isLoading && loadFailed && !notFound && (
        <EmptyState icon={ArrowLeft} title={tm('loadFailed')} />
      )}

      {/* Matrix */}
      {!isLoading && matrix && !notFound && !loadFailed && (
        <>
          {matrix.students.length === 0 ? (
            <EmptyState icon={Medal} title={tm('noStudents')} />
          ) : matrix.subjects.length === 0 ? (
            <EmptyState icon={Medal} title={tm('noGradesYet')} />
          ) : (
            <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
                  <thead>
                    <tr>
                      <th
                        className="sticky start-0 z-20 bg-primary-900 text-white text-xs font-semibold px-3 py-3 text-start border-b-2 border-border"
                        style={{ width: 180, maxWidth: 180 }}
                      >
                        {t('student')}
                      </th>
                      {matrix.subjects.map((subject) => (
                        <th
                          key={subject.id}
                          className="bg-primary-700 text-white text-xs font-semibold px-2 py-3 text-center border-e border-white/20 last:border-e-0"
                          style={{ width: 110, minWidth: 110 }}
                        >
                          {subject.name}
                        </th>
                      ))}
                      <th
                        className="bg-primary-800 text-white text-xs font-semibold px-2 py-3 text-center border-s-2 border-white/20"
                        style={{ width: 110, minWidth: 110 }}
                      >
                        {tm('overall')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.students.map((student, rowIdx) => {
                      const rowBg = rowIdx % 2 === 1 ? 'bg-surface-secondary' : 'bg-surface';
                      const overall = matrix.overall_by_student[student.id];
                      const rank = overall?.rank_position ?? null;
                      return (
                        <tr key={student.id} className={`${rowBg} hover:bg-primary-50`}>
                          <td
                            className="sticky start-0 z-10 bg-inherit px-3 py-2 text-sm font-medium text-text-primary border-e-2 border-border whitespace-nowrap overflow-hidden text-ellipsis"
                            style={{ width: 180, maxWidth: 180 }}
                            title={`${student.first_name} ${student.last_name}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="truncate">
                                {student.first_name} {student.last_name}
                              </span>
                              {rank != null && rank >= 1 && rank <= 3 && (
                                <span
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-300"
                                  aria-label={tm('topRankBadge', { rank })}
                                >
                                  <Medal className="h-3 w-3" aria-hidden="true" />
                                  {tm('topRankBadge', { rank })}
                                </span>
                              )}
                            </div>
                          </td>
                          {matrix.subjects.map((subject) => {
                            const cell = matrix.cells[student.id]?.[subject.id];
                            return (
                              <td
                                key={`${student.id}:${subject.id}`}
                                className="px-2 py-2 text-center border-b border-border border-e border-e-border/50"
                                style={{ width: 110 }}
                              >
                                <span
                                  className="inline-block rounded bg-surface-secondary px-2 py-1 text-xs font-semibold text-text-primary tabular-nums"
                                  dir="ltr"
                                >
                                  {formatCell(cell, displayMode)}
                                </span>
                              </td>
                            );
                          })}
                          <td
                            className="px-2 py-2 text-center border-b border-border border-s-2 border-s-primary-100 bg-primary-50/30"
                            style={{ width: 110 }}
                          >
                            <span
                              className="inline-block rounded bg-primary-100 px-2 py-1 text-xs font-bold text-primary-900 tabular-nums"
                              dir="ltr"
                            >
                              {formatOverall(overall, displayMode)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
