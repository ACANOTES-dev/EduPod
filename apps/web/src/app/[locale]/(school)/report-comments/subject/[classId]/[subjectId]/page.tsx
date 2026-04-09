'use client';

import { ArrowLeft, Check, Sparkles } from 'lucide-react';
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
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { RequestReopenModal } from '../../../_components/request-reopen-modal';
import type { SubjectRowState } from '../../../_components/subject-comment-row';
import { SubjectCommentRow } from '../../../_components/subject-comment-row';
import type { ActiveWindow } from '../../../_components/window-banner';
import { WindowBanner } from '../../../_components/window-banner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatrixStudent {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
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
  class: { id: string; name: string; year_group: { id: string; name: string } | null };
  period: { id: string; name: string };
  students: MatrixStudent[];
  subjects: MatrixSubject[];
  cells: Record<string, Record<string, MatrixCell>>;
  overall_by_student: Record<string, MatrixOverall>;
}

interface SubjectCommentRow {
  id: string;
  student_id: string;
  subject_id: string;
  class_id: string;
  academic_period_id: string;
  comment_text: string;
  is_ai_draft: boolean;
  finalised_at: string | null;
}

interface SubjectCommentListResponse {
  data: SubjectCommentRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface AiDraftResponse {
  id: string;
  comment_text: string;
  is_ai_draft: boolean;
  finalised_at: string | null;
}

type FilterMode = 'all' | 'unfinalised' | 'finalised';
type RowState = SubjectRowState;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SubjectCommentEditorPage() {
  const t = useTranslations('reportComments.editor');
  const tLanding = useTranslations('reportComments');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const params = useParams();
  const classId = (params?.classId as string | undefined) ?? '';
  const subjectId = (params?.subjectId as string | undefined) ?? '';
  const { hasAnyRole } = useRoleCheck();
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'admin', 'school_vice_principal');

  const [activeWindow, setActiveWindow] = React.useState<ActiveWindow | null>(null);
  const [matrix, setMatrix] = React.useState<ClassMatrixResponse | null>(null);
  const [rows, setRows] = React.useState<RowState[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [filter, setFilter] = React.useState<FilterMode>('all');
  const [requestReopenOpen, setRequestReopenOpen] = React.useState(false);
  const [bulkInFlight, setBulkInFlight] = React.useState<'none' | 'draft' | 'finalise'>('none');

  const saveTimers = React.useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const cancelledRef = React.useRef(false);

  const windowIsOpen = activeWindow?.status === 'open';
  const canEdit = windowIsOpen;

  // ─── Load window, matrix, and existing comments ────────────────────────
  React.useEffect(() => {
    cancelledRef.current = false;
    if (!classId || !subjectId) return;

    async function load(): Promise<void> {
      setIsLoading(true);
      setLoadFailed(false);
      try {
        // Active window — may be null
        let currentWindow: ActiveWindow | null = null;
        try {
          currentWindow = await apiClient<ActiveWindow | null>(
            '/api/v1/report-comment-windows/active',
            { silent: true },
          );
        } catch (err) {
          console.error('[SubjectCommentEditor] active window', err);
        }
        if (cancelledRef.current) return;
        setActiveWindow(currentWindow);

        // When no active window, we still need a period id to display historical data.
        // We fall back to the latest academic period for display, but editing is blocked.
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

        // Fetch class matrix + existing comments in parallel
        const [matrixRes, commentsRes] = await Promise.all([
          apiClient<ClassMatrixResponse>(
            `/api/v1/report-cards/classes/${classId}/matrix?academic_period_id=${periodId}`,
          ),
          apiClient<SubjectCommentListResponse>(
            `/api/v1/report-card-subject-comments?class_id=${classId}&subject_id=${subjectId}&academic_period_id=${periodId}&pageSize=200`,
          ),
        ]);
        if (cancelledRef.current) return;

        setMatrix(matrixRes);

        const commentByStudent = new Map<string, SubjectCommentRow>();
        for (const c of commentsRes.data ?? []) {
          commentByStudent.set(c.student_id, c);
        }

        const initialRows: RowState[] = matrixRes.students.map((student) => {
          const cell = matrixRes.cells[student.id]?.[subjectId] ?? null;
          const overall = matrixRes.overall_by_student[student.id] ?? null;
          const existing = commentByStudent.get(student.id) ?? null;
          return {
            student_id: student.id,
            first_name: student.first_name,
            last_name: student.last_name,
            student_number: student.student_number,
            score: cell?.score ?? null,
            grade: cell?.grade ?? null,
            weighted_average: overall?.weighted_average ?? null,
            comment_id: existing?.id ?? null,
            text: existing?.comment_text ?? '',
            is_ai_draft: existing?.is_ai_draft ?? false,
            finalised_at: existing?.finalised_at ?? null,
            status: 'idle',
          };
        });
        setRows(initialRows);
      } catch (err) {
        console.error('[SubjectCommentEditor]', err);
        if (!cancelledRef.current) setLoadFailed(true);
      } finally {
        if (!cancelledRef.current) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelledRef.current = true;
      // Clear any pending save timers on unmount
      for (const id of Object.keys(saveTimers.current)) {
        const timer = saveTimers.current[id];
        if (timer) clearTimeout(timer);
      }
      saveTimers.current = {};
    };
  }, [classId, subjectId]);

  // ─── Row mutation helpers ──────────────────────────────────────────────

  const updateRow = (studentId: string, patch: Partial<RowState>): void => {
    setRows((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, ...patch } : r)));
  };

  const saveRow = async (row: RowState, text: string): Promise<void> => {
    if (!activeWindow) return;
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      // Nothing to save — empty comments stay unpersisted.
      updateRow(row.student_id, { status: 'idle' });
      return;
    }
    updateRow(row.student_id, { status: 'saving' });
    try {
      const saved = await apiClient<SubjectCommentRow>('/api/v1/report-card-subject-comments', {
        method: 'POST',
        body: JSON.stringify({
          student_id: row.student_id,
          subject_id: subjectId,
          class_id: classId,
          academic_period_id: activeWindow.academic_period_id,
          comment_text: trimmed,
          is_ai_draft: false,
        }),
        silent: true,
      });
      updateRow(row.student_id, {
        comment_id: saved.id,
        is_ai_draft: saved.is_ai_draft,
        finalised_at: saved.finalised_at,
        status: 'saved',
      });
      // Flash "saved" state briefly
      setTimeout(() => {
        updateRow(row.student_id, { status: 'idle' });
      }, 1200);
    } catch (err) {
      console.error('[SubjectCommentEditor] save', err);
      updateRow(row.student_id, { status: 'error' });
      toast.error(t('saveFailed'));
    }
  };

  const scheduleSave = (row: RowState, newText: string): void => {
    const existing = saveTimers.current[row.student_id];
    if (existing) clearTimeout(existing);
    saveTimers.current[row.student_id] = setTimeout(() => {
      void saveRow(row, newText);
    }, 500);
  };

  const handleTextChange = (row: RowState, text: string): void => {
    updateRow(row.student_id, { text, is_ai_draft: false });
    if (!canEdit) return;
    scheduleSave({ ...row, text }, text);
  };

  const handleAiDraft = async (row: RowState): Promise<void> => {
    if (!canEdit || !activeWindow) return;
    updateRow(row.student_id, { status: 'drafting' });
    try {
      const res = await apiClient<AiDraftResponse>(
        '/api/v1/report-card-subject-comments/ai-draft',
        {
          method: 'POST',
          body: JSON.stringify({
            student_id: row.student_id,
            subject_id: subjectId,
            class_id: classId,
            academic_period_id: activeWindow.academic_period_id,
          }),
        },
      );
      updateRow(row.student_id, {
        comment_id: res.id,
        text: res.comment_text,
        is_ai_draft: res.is_ai_draft,
        finalised_at: res.finalised_at,
        status: 'saved',
      });
      toast.success(t('aiSuccess'));
      setTimeout(() => {
        updateRow(row.student_id, { status: 'idle' });
      }, 1200);
    } catch (err) {
      console.error('[SubjectCommentEditor] ai-draft', err);
      updateRow(row.student_id, { status: 'error' });
      toast.error(t('aiFailed'));
    }
  };

  const handleFinalise = async (row: RowState): Promise<void> => {
    if (!canEdit || !row.comment_id) return;
    try {
      const res = await apiClient<SubjectCommentRow>(
        `/api/v1/report-card-subject-comments/${row.comment_id}/finalise`,
        { method: 'PATCH' },
      );
      updateRow(row.student_id, {
        finalised_at: res.finalised_at,
        is_ai_draft: res.is_ai_draft,
      });
      toast.success(t('finaliseSuccess'));
    } catch (err) {
      console.error('[SubjectCommentEditor] finalise', err);
      toast.error(t('finaliseFailed'));
    }
  };

  const handleUnfinalise = async (row: RowState): Promise<void> => {
    if (!canEdit || !row.comment_id) return;
    try {
      const res = await apiClient<SubjectCommentRow>(
        `/api/v1/report-card-subject-comments/${row.comment_id}/unfinalise`,
        { method: 'PATCH' },
      );
      updateRow(row.student_id, {
        finalised_at: res.finalised_at,
        is_ai_draft: res.is_ai_draft,
      });
    } catch (err) {
      console.error('[SubjectCommentEditor] unfinalise', err);
      toast.error(t('finaliseFailed'));
    }
  };

  const handleBulkAiDraft = async (): Promise<void> => {
    if (!canEdit || !activeWindow) return;
    const targets = rows.filter((r) => r.text.trim().length === 0);
    if (targets.length === 0) {
      toast.error(t('noEmptyRows'));
      return;
    }
    setBulkInFlight('draft');
    try {
      for (const row of targets) {
        // eslint-disable-next-line no-await-in-loop
        await handleAiDraft(row);
      }
    } finally {
      setBulkInFlight('none');
    }
  };

  const handleBulkFinalise = async (): Promise<void> => {
    if (!canEdit || !activeWindow) return;
    const targets = rows.filter((r) => !!r.comment_id && !r.finalised_at && r.text.trim());
    if (targets.length === 0) {
      toast.error(t('noCommentsToFinalise'));
      return;
    }
    setBulkInFlight('finalise');
    try {
      const res = await apiClient<{ count: number }>(
        '/api/v1/report-card-subject-comments/bulk-finalise',
        {
          method: 'POST',
          body: JSON.stringify({
            class_id: classId,
            subject_id: subjectId,
            academic_period_id: activeWindow.academic_period_id,
          }),
        },
      );
      // Optimistic local update: mark all non-empty comments as finalised now
      setRows((prev) =>
        prev.map((r) =>
          r.comment_id && !r.finalised_at && r.text.trim()
            ? { ...r, finalised_at: new Date().toISOString() }
            : r,
        ),
      );
      toast.success(t('finaliseAllSuccess', { count: res.count }));
    } catch (err) {
      console.error('[SubjectCommentEditor] bulk finalise', err);
      toast.error(t('finaliseFailed'));
    } finally {
      setBulkInFlight('none');
    }
  };

  // ─── Derived view state ─────────────────────────────────────────────────

  const filteredRows = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'finalised') return !!r.finalised_at;
    return !r.finalised_at;
  });

  const subjectInfo = matrix?.subjects.find((s) => s.id === subjectId) ?? null;
  const className = matrix?.class.name ?? '';
  const periodName = matrix?.period.name ?? '';

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title={
          subjectInfo && className
            ? t('headingSubject', { subject: subjectInfo.name, className })
            : tLanding('title')
        }
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

      {/* Window banner for status visibility */}
      <WindowBanner
        window={activeWindow}
        periodName={periodName || null}
        isAdmin={isAdmin}
        locale={locale}
        onRequestReopen={!isAdmin ? () => setRequestReopenOpen(true) : undefined}
      />

      {/* Toolbar */}
      {!isLoading && !loadFailed && matrix && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleBulkAiDraft()}
              disabled={!canEdit || bulkInFlight !== 'none'}
              className="min-h-11"
            >
              <Sparkles className="me-1.5 h-4 w-4" aria-hidden="true" />
              {bulkInFlight === 'draft' ? t('aiDraftAllInFlight') : t('aiDraftAll')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleBulkFinalise()}
              disabled={!canEdit || bulkInFlight !== 'none'}
              className="min-h-11"
            >
              <Check className="me-1.5 h-4 w-4" aria-hidden="true" />
              {bulkInFlight === 'finalise' ? t('finaliseAllInFlight') : t('finaliseAll')}
            </Button>
          </div>

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

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-surface-secondary" />
          ))}
        </div>
      )}

      {/* Error */}
      {!isLoading && loadFailed && <EmptyState icon={ArrowLeft} title={t('loadFailed')} />}

      {/* Empty */}
      {!isLoading && !loadFailed && matrix && rows.length === 0 && (
        <EmptyState icon={ArrowLeft} title={t('emptyStudents')} />
      )}

      {/* Editor table */}
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
                    style={{ width: 160, minWidth: 160 }}
                  >
                    {t('gradeCol')}
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
                {filteredRows.map((row, rowIdx) => (
                  <SubjectCommentRow
                    key={row.student_id}
                    row={row}
                    rowBg={rowIdx % 2 === 1 ? 'bg-surface-secondary' : 'bg-surface'}
                    canEdit={canEdit}
                    onTextChange={handleTextChange}
                    onAiDraft={(r) => void handleAiDraft(r)}
                    onFinalise={(r) => void handleFinalise(r)}
                    onUnfinalise={(r) => void handleUnfinalise(r)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Closed-window banner */}
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
