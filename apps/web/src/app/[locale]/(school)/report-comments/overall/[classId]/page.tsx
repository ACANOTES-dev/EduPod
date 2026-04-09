'use client';

import { ArrowLeft, Check, RotateCw } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { RequestReopenModal } from '../../_components/request-reopen-modal';
import type { ActiveWindow } from '../../_components/window-banner';
import { WindowBanner } from '../../_components/window-banner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatrixStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface MatrixOverall {
  weighted_average: number | null;
  overall_grade: string | null;
  rank_position: number | null;
}

interface ClassMatrixResponse {
  class: { id: string; name: string; year_group: { id: string; name: string } | null };
  period: { id: string; name: string };
  students: MatrixStudent[];
  subjects: Array<{ id: string; name: string }>;
  cells: Record<string, Record<string, unknown>>;
  overall_by_student: Record<string, MatrixOverall>;
}

interface OverallCommentRow {
  id: string;
  student_id: string;
  class_id: string;
  academic_period_id: string;
  comment_text: string;
  finalised_at: string | null;
}

interface OverallCommentListResponse {
  data: OverallCommentRow[];
  meta: { page: number; pageSize: number; total: number };
}

type RowStatus = 'idle' | 'saving' | 'saved' | 'error';
type FilterMode = 'all' | 'unfinalised' | 'finalised';

interface RowState {
  student_id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  weighted_average: number | null;
  overall_grade: string | null;
  comment_id: string | null;
  text: string;
  finalised_at: string | null;
  status: RowStatus;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OverallCommentEditorPage() {
  const t = useTranslations('reportComments.editor');
  const tLanding = useTranslations('reportComments');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const params = useParams();
  const classId = (params?.classId as string | undefined) ?? '';
  const { hasAnyRole } = useRoleCheck();
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'admin', 'school_vice_principal');

  const [activeWindow, setActiveWindow] = React.useState<ActiveWindow | null>(null);
  const [matrix, setMatrix] = React.useState<ClassMatrixResponse | null>(null);
  const [rows, setRows] = React.useState<RowState[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [filter, setFilter] = React.useState<FilterMode>('all');
  const [requestReopenOpen, setRequestReopenOpen] = React.useState(false);

  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const cancelledRef = React.useRef(false);

  const canEdit = activeWindow?.status === 'open';

  React.useEffect(() => {
    cancelledRef.current = false;
    if (!classId) return;

    async function load(): Promise<void> {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        let currentWindow: ActiveWindow | null = null;
        try {
          currentWindow = await apiClient<ActiveWindow | null>(
            '/api/v1/report-comment-windows/active',
            { silent: true },
          );
        } catch (err) {
          console.error('[OverallCommentEditor] active window', err);
        }
        if (cancelledRef.current) return;
        setActiveWindow(currentWindow);

        let periodId = currentWindow?.academic_period_id;
        if (!periodId) {
          const periodsRes = await apiClient<{ data: Array<{ id: string }> }>(
            '/api/v1/academic-periods?pageSize=1',
          );
          periodId = periodsRes.data?.[0]?.id;
        }
        if (!periodId) {
          setRows([]);
          setMatrix(null);
          setIsLoading(false);
          return;
        }

        const [matrixRes, commentsRes] = await Promise.all([
          apiClient<ClassMatrixResponse>(
            `/api/v1/report-cards/classes/${classId}/matrix?academic_period_id=${periodId}`,
          ),
          apiClient<OverallCommentListResponse>(
            `/api/v1/report-card-overall-comments?class_id=${classId}&academic_period_id=${periodId}&pageSize=200`,
          ),
        ]);
        if (cancelledRef.current) return;

        setMatrix(matrixRes);

        const commentByStudent = new Map<string, OverallCommentRow>();
        for (const c of commentsRes.data ?? []) {
          commentByStudent.set(c.student_id, c);
        }

        const initialRows: RowState[] = matrixRes.students.map((student) => {
          const overall = matrixRes.overall_by_student[student.id] ?? null;
          const existing = commentByStudent.get(student.id) ?? null;
          return {
            student_id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            student_number: student.student_number,
            weighted_average: overall?.weighted_average ?? null,
            overall_grade: overall?.overall_grade ?? null,
            comment_id: existing?.id ?? null,
            text: existing?.comment_text ?? '',
            finalised_at: existing?.finalised_at ?? null,
            status: 'idle',
          };
        });
        setRows(initialRows);
      } catch (err) {
        console.error('[OverallCommentEditor]', err);
        if (!cancelledRef.current) setLoadFailed(true);
      } finally {
        if (!cancelledRef.current) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelledRef.current = true;
      for (const id of Object.keys(saveTimers.current)) {
        const timer = saveTimers.current[id];
        if (timer) clearTimeout(timer);
      }
      saveTimers.current = {};
    };
  }, [classId]);

  const updateRow = (studentId: string, patch: Partial<RowState>): void => {
    setRows((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row: RowState, text: string): Promise<void> => {
    if (!activeWindow) return;
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      updateRow(row.student_id, { status: 'idle' });
      return;
    }
    updateRow(row.student_id, { status: 'saving' });
    try {
      const saved = await apiClient<OverallCommentRow>('/api/v1/report-card-overall-comments', {
        method: 'POST',
        body: JSON.stringify({
          student_id: row.student_id,
          class_id: classId,
          academic_period_id: activeWindow.academic_period_id,
          comment_text: trimmed,
        }),
        silent: true,
      });
      updateRow(row.student_id, {
        comment_id: saved.id,
        finalised_at: saved.finalised_at,
        status: 'saved',
      });
      setTimeout(() => updateRow(row.student_id, { status: 'idle' }), 1200);
    } catch (err) {
      console.error('[OverallCommentEditor] save', err);
      updateRow(row.student_id, { status: 'error' });
      toast.error(t('saveFailed'));
    }
  };

  const handleTextChange = (row: RowState, text: string): void => {
    updateRow(row.student_id, { text });
    if (!canEdit) return;
    const existing = saveTimers.current[row.student_id];
    if (existing) clearTimeout(existing);
    saveTimers.current[row.student_id] = setTimeout(() => {
      void saveRow({ ...row, text }, text);
    }, 500);
  };

  const handleFinalise = async (row: RowState): Promise<void> => {
    if (!canEdit || !row.comment_id) return;
    try {
      const res = await apiClient<OverallCommentRow>(
        `/api/v1/report-card-overall-comments/${row.comment_id}/finalise`,
        { method: 'PATCH' },
      );
      updateRow(row.student_id, { finalised_at: res.finalised_at });
      toast.success(t('finaliseSuccess'));
    } catch (err) {
      console.error('[OverallCommentEditor] finalise', err);
      toast.error(t('finaliseFailed'));
    }
  };

  const handleUnfinalise = async (row: RowState): Promise<void> => {
    if (!canEdit || !row.comment_id) return;
    try {
      const res = await apiClient<OverallCommentRow>(
        `/api/v1/report-card-overall-comments/${row.comment_id}/unfinalise`,
        { method: 'PATCH' },
      );
      updateRow(row.student_id, { finalised_at: res.finalised_at });
    } catch (err) {
      console.error('[OverallCommentEditor] unfinalise', err);
      toast.error(t('finaliseFailed'));
    }
  };

  const filteredRows = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'finalised') return !!r.finalised_at;
    return !r.finalised_at;
  });

  const className = matrix?.class.name ?? '';
  const periodName = matrix?.period.name ?? '';

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={className ? t('headingOverall', { className }) : tLanding('title')}
        description={periodName ? t('periodLabel', { period: periodName }) : undefined}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${locale}/report-comments`)}
            className="min-h-11"
          >
            <ArrowLeft className="me-1.5 h-4 w-4" aria-hidden="true" />
            {t('backToLanding')}
          </Button>
        }
      />

      <WindowBanner
        window={activeWindow}
        periodName={periodName || null}
        isAdmin={isAdmin}
        locale={locale}
        onRequestReopen={!isAdmin ? () => setRequestReopenOpen(true) : undefined}
      />

      {!isLoading && !loadFailed && matrix && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          <Select value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
            <SelectTrigger className="min-h-11 w-full sm:w-52">
              <SelectValue placeholder={t('filterLabel')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filterAll')}</SelectItem>
              <SelectItem value="unfinalised">{t('filterUnfinalised')}</SelectItem>
              <SelectItem value="finalised">{t('filterFinalised')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      )}

      {!isLoading && loadFailed && <EmptyState icon={ArrowLeft} title={t('loadFailed')} />}

      {!isLoading && !loadFailed && matrix && rows.length === 0 && (
        <EmptyState icon={ArrowLeft} title={t('emptyStudents')} />
      )}

      {!isLoading && !loadFailed && matrix && rows.length > 0 && (
        <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th
                    className="sticky start-0 z-20 bg-primary-900 text-white text-xs font-semibold px-3 py-3 text-start border-b-2 border-border"
                    style={{ width: 200, minWidth: 200 }}
                  >
                    {t('studentCol')}
                  </th>
                  <th
                    className="bg-primary-700 text-white text-xs font-semibold px-3 py-3 text-start border-e border-white/20"
                    style={{ width: 140, minWidth: 140 }}
                  >
                    {t('overallGradeCol')}
                  </th>
                  <th
                    className="bg-primary-800 text-white text-xs font-semibold px-3 py-3 text-start"
                    style={{ minWidth: 320 }}
                  >
                    {t('commentCol')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, rowIdx) => {
                  const rowBg = rowIdx % 2 === 1 ? 'bg-surface-secondary' : 'bg-surface';
                  return (
                    <tr key={row.student_id} className={rowBg}>
                      <td
                        className="sticky start-0 z-10 bg-inherit px-3 py-3 align-top border-b border-border/60"
                        style={{ width: 200, minWidth: 200 }}
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-text-primary">
                            {row.first_name} {row.last_name}
                          </span>
                          {row.student_number && (
                            <span className="text-xs text-text-tertiary tabular-nums" dir="ltr">
                              #{row.student_number}
                            </span>
                          )}
                        </div>
                      </td>

                      <td
                        className="px-3 py-3 align-top border-b border-border/60"
                        style={{ width: 140, minWidth: 140 }}
                      >
                        <span
                          className="inline-block rounded bg-primary-100 px-2 py-1 text-xs font-bold text-primary-900 tabular-nums"
                          dir="ltr"
                        >
                          {row.weighted_average != null
                            ? `${row.weighted_average.toFixed(1)}%`
                            : (row.overall_grade ?? t('noGrade'))}
                        </span>
                      </td>

                      <td className="px-3 py-3 align-top border-b border-border/60">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {row.finalised_at && (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-100 text-emerald-800"
                              >
                                <Check className="me-1 h-3 w-3" aria-hidden="true" />
                                {t('finalised')}
                              </Badge>
                            )}
                            {row.status === 'saving' && (
                              <span className="text-xs text-text-tertiary">{t('saving')}</span>
                            )}
                            {row.status === 'saved' && (
                              <span className="text-xs text-emerald-700">{t('saved')}</span>
                            )}
                            {row.status === 'error' && (
                              <span className="text-xs text-red-600">{t('saveFailed')}</span>
                            )}
                          </div>

                          <Textarea
                            value={row.text}
                            onChange={(e) => handleTextChange(row, e.target.value)}
                            rows={4}
                            readOnly={!canEdit || !!row.finalised_at}
                            placeholder={t('placeholder')}
                            className="w-full text-base"
                            aria-label={t('commentCol')}
                          />

                          <div className="flex flex-wrap gap-2">
                            {row.finalised_at ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => void handleUnfinalise(row)}
                                disabled={!canEdit}
                                className="min-h-11"
                              >
                                <RotateCw className="me-1 h-4 w-4" aria-hidden="true" />
                                {t('unfinalise')}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                onClick={() => void handleFinalise(row)}
                                disabled={
                                  !canEdit || !row.comment_id || row.text.trim().length === 0
                                }
                                className="min-h-11"
                              >
                                <Check className="me-1 h-4 w-4" aria-hidden="true" />
                                {t('finalise')}
                              </Button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isLoading && !loadFailed && !canEdit && matrix && rows.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-secondary p-4 text-sm text-text-secondary">
          {t('windowClosedBanner')}
        </div>
      )}

      <RequestReopenModal
        open={requestReopenOpen}
        onOpenChange={setRequestReopenOpen}
        defaultPeriodId={activeWindow?.academic_period_id ?? null}
      />
    </div>
  );
}
