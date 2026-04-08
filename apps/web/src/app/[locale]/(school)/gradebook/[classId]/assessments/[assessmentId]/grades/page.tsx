'use client';

import { ArrowLeft, CalendarClock, Clock, Lock, ShieldAlert } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssessmentDetail {
  id: string;
  title: string;
  category_name: string;
  max_score: number;
  status: string;
  due_date: string | null;
  grading_deadline: string | null;
}

interface StudentGrade {
  student_id: string;
  student_name: string;
  score: number | null;
  is_missing: boolean;
  comment: string;
}

interface AssessmentResponse {
  data: AssessmentDetail & {
    category?: { id: string; name: string };
    subject?: { id: string; name: string };
    class_entity?: { id: string; name: string };
  };
}

interface GradeRecord {
  id: string;
  student_id: string;
  raw_score: number | null;
  is_missing: boolean;
  comment: string | null;
  student?: { id: string; first_name: string; last_name: string; student_number?: string };
}

interface GradesListResponse {
  data: GradeRecord[];
}

/** Parse a Prisma Decimal object (serialised as { s, e, d }) to a JS number. */
function parseDecimal(
  val: { s: number; e: number; d: number[] } | number | string | null | undefined,
): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || null;
  if (typeof val === 'object' && 'd' in val && 'e' in val && 's' in val) {
    const firstDigit = val.d[0] ?? 0;
    const digitLen = String(firstDigit).length;
    return val.s * firstDigit * Math.pow(10, val.e - digitLen + 1);
  }
  return null;
}

const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'neutral' | 'danger'> = {
  draft: 'warning',
  open: 'info',
  closed: 'danger',
  locked: 'neutral',
  submitted_locked: 'success',
  unlock_requested: 'warning',
  reopened: 'info',
  final_locked: 'neutral',
};

// ─── Computed status display ──────────────────────────────────────────────────

const STATUS_DISPLAY: Record<string, string> = {
  draft: 'statusDraft',
  open: 'statusOpen',
  closed: 'statusClosed',
  locked: 'statusLocked',
  submitted_locked: 'statusSubmittedLocked',
  unlock_requested: 'statusUnlockRequested',
  reopened: 'statusReopened',
  final_locked: 'statusFinalLocked',
};

type GradingWindowState = 'before_due_date' | 'in_window' | 'past_deadline' | 'no_dates';

function computeGradingWindow(assessment: AssessmentDetail): GradingWindowState {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!assessment.due_date) return 'no_dates';

  const dueDate = new Date(assessment.due_date);
  dueDate.setHours(0, 0, 0, 0);

  if (today < dueDate) return 'before_due_date';

  if (assessment.grading_deadline) {
    const deadline = new Date(assessment.grading_deadline);
    deadline.setHours(0, 0, 0, 0);
    if (today > deadline) return 'past_deadline';
  }

  return 'in_window';
}

function computeDisplayStatusKey(assessment: AssessmentDetail): string {
  if (assessment.status === 'open') {
    const window = computeGradingWindow(assessment);
    if (window === 'before_due_date') return 'statusScheduled';
    if (window === 'past_deadline') return 'statusOverdue';
    return 'statusPendingGrading';
  }
  return STATUS_DISPLAY[assessment.status] ?? 'statusDraft';
}

function computeDisplayVariant(
  assessment: AssessmentDetail,
): 'warning' | 'info' | 'success' | 'neutral' | 'danger' {
  if (assessment.status === 'open') {
    const window = computeGradingWindow(assessment);
    if (window === 'before_due_date') return 'info';
    if (window === 'past_deadline') return 'danger';
    return 'warning';
  }
  return STATUS_VARIANT[assessment.status] ?? 'neutral';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradeEntryPage() {
  const t = useTranslations('gradebook');
  const tCommon = useTranslations('common');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const params = useParams();
  const classId = params?.classId as string;
  const assessmentId = params?.assessmentId as string;

  const tUnlock = useTranslations('teacherAssessments');

  const [assessment, setAssessment] = React.useState<AssessmentDetail | null>(null);
  const [grades, setGrades] = React.useState<StudentGrade[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [unlockDialogOpen, setUnlockDialogOpen] = React.useState(false);
  const [unlockReason, setUnlockReason] = React.useState('');
  const [submittingUnlock, setSubmittingUnlock] = React.useState(false);
  const [submitDialogOpen, setSubmitDialogOpen] = React.useState(false);

  const scoreRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  // ─── Grading permissions ─────────────────────────────────────────────────
  const gradingWindow = assessment ? computeGradingWindow(assessment) : 'no_dates';

  // Assessment is locked if not in an editable status
  const isLocked = assessment?.status !== 'open' && assessment?.status !== 'reopened';

  // Can enter grades: must be open (in grading window) or reopened
  const canEnterGrades = assessment
    ? (assessment.status === 'open' &&
        (gradingWindow === 'in_window' || gradingWindow === 'no_dates')) ||
      assessment.status === 'reopened'
    : false;

  const canRequestUnlock =
    assessment?.status === 'submitted_locked' || assessment?.status === 'final_locked';

  const fetchAssessmentData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [assessmentRes, gradesRes, studentsRes] = await Promise.all([
        apiClient<AssessmentResponse>(`/api/v1/gradebook/assessments/${assessmentId}`),
        apiClient<GradesListResponse>(`/api/v1/gradebook/assessments/${assessmentId}/grades`),
        apiClient<{
          data: Array<{
            student_id: string;
            status: string;
            student?: {
              id: string;
              first_name: string;
              last_name: string;
              student_number?: string;
            };
          }>;
        }>(`/api/v1/classes/${classId}/enrolments?pageSize=100`, {
          silent: true,
        }).catch(() => ({
          data: [] as Array<{
            student_id: string;
            status: string;
            student?: { id: string; first_name: string; last_name: string };
          }>,
        })),
      ]);

      const a = assessmentRes.data;
      const rawAssessment = a as unknown as Record<string, unknown>;
      setAssessment({
        id: a.id,
        title: a.title,
        category_name: a.category?.name ?? '',
        max_score: typeof a.max_score === 'number' ? a.max_score : Number(a.max_score),
        status: a.status,
        due_date: (rawAssessment.due_date as string) ?? null,
        grading_deadline: (rawAssessment.grading_deadline as string) ?? null,
      });

      // Build grade map from existing grades
      const gradeRecords = Array.isArray(gradesRes.data) ? gradesRes.data : [];
      const gradeMap = new Map(gradeRecords.map((g) => [g.student_id, g]));

      // Merge enrolled students with existing grades (via class enrolments endpoint)
      const enrolments = (Array.isArray(studentsRes.data) ? studentsRes.data : []).filter(
        (e) => e.status === 'active' && e.student,
      );
      const merged: StudentGrade[] = enrolments.map((e) => {
        const s = e.student!;
        const existing = gradeMap.get(e.student_id);
        return {
          student_id: e.student_id,
          student_name: `${s.first_name} ${s.last_name}`,
          score: parseDecimal(existing?.raw_score),
          is_missing: existing?.is_missing ?? false,
          comment: existing?.comment ?? '',
        };
      });

      // Include any graded students not in enrolled list (edge case)
      for (const g of gradeRecords) {
        if (!enrolments.find((e) => e.student_id === g.student_id)) {
          merged.push({
            student_id: g.student_id,
            student_name: g.student
              ? `${g.student.first_name} ${g.student.last_name}`
              : g.student_id,
            score: parseDecimal(g.raw_score),
            is_missing: g.is_missing,
            comment: g.comment ?? '',
          });
        }
      }

      setGrades(merged);
    } catch (err) {
      console.error('[AssessmentsGradesPage]', err);
      setAssessment(null);
      setGrades([]);
    } finally {
      setIsLoading(false);
    }
  }, [assessmentId, classId]);

  const handleUnlockRequest = async () => {
    if (!unlockReason.trim()) return;
    setSubmittingUnlock(true);
    try {
      await apiClient(`/api/v1/gradebook/assessments/${assessmentId}/unlock-request`, {
        method: 'POST',
        body: JSON.stringify({ reason: unlockReason.trim() }),
      });
      toast.success(tUnlock('unlockRequested'));
      setUnlockDialogOpen(false);
      setUnlockReason('');
      void fetchAssessmentData();
    } catch (err) {
      console.error('[AssessmentsGradesPage] unlock request', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSubmittingUnlock(false);
    }
  };

  React.useEffect(() => {
    void fetchAssessmentData();
  }, [fetchAssessmentData]);

  const updateGrade = React.useCallback(
    (studentId: string, field: keyof StudentGrade, value: unknown) => {
      setGrades((prev) =>
        prev.map((g) => {
          if (g.student_id !== studentId) return g;
          if (field === 'is_missing' && value === true) {
            return { ...g, is_missing: true, score: null };
          }
          if (field === 'is_missing' && value === false) {
            return { ...g, is_missing: false };
          }
          if (field === 'score') {
            const num = Number(value);
            const capped = assessment ? Math.min(num, assessment.max_score) : num;
            return { ...g, score: Number.isNaN(num) ? null : Math.max(0, capped) };
          }
          return { ...g, [field]: value };
        }),
      );
    },
    [assessment],
  );

  // Submit grades and auto-lock — called after user confirms the dialog
  const handleSubmitGrades = async () => {
    if (!assessment) return;
    setSaving(true);
    setSubmitDialogOpen(false);
    try {
      // 1. Save the grades
      await apiClient(`/api/v1/gradebook/assessments/${assessmentId}/grades`, {
        method: 'PUT',
        body: JSON.stringify({
          grades: grades.map((g) => ({
            student_id: g.student_id,
            raw_score: g.score,
            is_missing: g.is_missing,
            comment: g.comment || null,
          })),
        }),
      });

      // 2. Auto-transition to submitted_locked
      try {
        await apiClient(`/api/v1/gradebook/assessments/${assessmentId}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'submitted_locked' }),
        });
      } catch (lockErr) {
        // Grades saved but lock failed — notify user
        console.error('[AssessmentsGradesPage] auto-lock failed', lockErr);
        toast.error(t('submitLockFailed'));
        void fetchAssessmentData();
        return;
      }

      toast.success(t('submitSuccess'));
      void fetchAssessmentData();
    } catch (err) {
      console.error('[AssessmentsGradesPage]', err);
      const apiErr = err as { message?: string };
      toast.error(apiErr.message ?? tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleScoreKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      // Find next score input
      const nextIdx = idx + 1;
      if (nextIdx < scoreRefs.current.length && scoreRefs.current[nextIdx]) {
        e.preventDefault();
        scoreRefs.current[nextIdx]?.focus();
      }
    }
  };

  const gradedCount = grades.filter((g) => g.score != null || g.is_missing).length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  if (!assessment) {
    return <div className="py-12 text-center text-text-tertiary">{t('assessmentNotFound')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${locale}/gradebook/${classId}`)}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <PageHeader title={t('gradeEntry')} />
      </div>

      {/* Assessment header */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-4">
          <h2 className="text-lg font-semibold text-text-primary">{assessment.title}</h2>
          <StatusBadge status={computeDisplayVariant(assessment)} dot>
            {t(computeDisplayStatusKey(assessment))}
          </StatusBadge>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-text-secondary">
          <span>
            {t('category')}: {assessment.category_name}
          </span>
          <span>
            {t('maxScore')}: <span dir="ltr">{assessment.max_score}</span>
          </span>
          {assessment.due_date && (
            <span>
              {t('dueDate')}:{' '}
              <span dir="ltr">{new Date(assessment.due_date).toLocaleDateString()}</span>
            </span>
          )}
          {assessment.grading_deadline && (
            <span>
              {t('gradingDeadline')}:{' '}
              <span dir="ltr">{new Date(assessment.grading_deadline).toLocaleDateString()}</span>
            </span>
          )}
        </div>
      </div>

      {/* Grading window banners */}
      {assessment.status === 'open' && gradingWindow === 'before_due_date' && (
        <div className="flex items-center gap-2 rounded-xl border border-info-fill bg-info-fill/10 p-4 text-sm text-info-text">
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span>
            {t('gradingNotYetOpen')}{' '}
            <span dir="ltr" className="font-medium">
              {assessment.due_date ? new Date(assessment.due_date).toLocaleDateString() : ''}
            </span>
          </span>
        </div>
      )}

      {assessment.status === 'open' && gradingWindow === 'past_deadline' && (
        <div className="flex items-center gap-2 rounded-xl border border-danger-fill bg-danger-fill/10 p-4 text-sm text-danger-text">
          <Clock className="h-4 w-4 shrink-0" />
          <span>{t('gradingDeadlinePassed')}</span>
        </div>
      )}

      {assessment.status === 'open' &&
        (gradingWindow === 'in_window' || gradingWindow === 'no_dates') && (
          <div className="flex items-center gap-2 rounded-xl border border-warning-fill bg-warning-fill/10 p-4 text-sm text-warning-text">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{t('submitWarningBanner')}</span>
          </div>
        )}

      {assessment.status === 'reopened' && (
        <div className="flex items-center gap-2 rounded-xl border border-info-fill bg-info-fill/10 p-4 text-sm text-info-text">
          <Lock className="h-4 w-4 shrink-0" />
          <span>{t('reopenedBanner')}</span>
        </div>
      )}

      {isLocked && !canEnterGrades && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-warning-fill bg-warning-fill/10 p-4 text-sm text-warning-text">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            {t('locked')}
          </div>
          {canRequestUnlock && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUnlockDialogOpen(true)}
              className="shrink-0"
            >
              <Lock className="me-1.5 h-3.5 w-3.5" />
              {tUnlock('requestUnlock')}
            </Button>
          )}
        </div>
      )}

      {/* Status bar */}
      <div className="text-sm text-text-secondary">
        {t('studentsGraded', { count: String(gradedCount), total: String(grades.length) })}
      </div>

      {/* Grade entry grid */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-secondary">
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {tCommon('student')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('score')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('missing')}
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                {t('comment')}
              </th>
            </tr>
          </thead>
          <tbody>
            {grades.map((grade, idx) => (
              <tr key={grade.student_id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-sm font-medium text-text-primary">
                  {grade.student_name}
                </td>
                <td className="px-4 py-3">
                  <Input
                    ref={(el) => {
                      scoreRefs.current[idx] = el;
                    }}
                    type="number"
                    min={0}
                    max={assessment.max_score}
                    value={grade.score != null ? String(grade.score) : ''}
                    onChange={(e) => updateGrade(grade.student_id, 'score', e.target.value)}
                    onKeyDown={(e) => handleScoreKeyDown(e, idx)}
                    disabled={!canEnterGrades || grade.is_missing}
                    className="w-24"
                    placeholder="—"
                    dir="ltr"
                  />
                </td>
                <td className="px-4 py-3">
                  <Checkbox
                    checked={grade.is_missing}
                    onCheckedChange={(v) => updateGrade(grade.student_id, 'is_missing', v)}
                    disabled={!canEnterGrades}
                    aria-label={t('missing')}
                  />
                </td>
                <td className="px-4 py-3">
                  <Textarea
                    value={grade.comment}
                    onChange={(e) => updateGrade(grade.student_id, 'comment', e.target.value)}
                    disabled={!canEnterGrades}
                    className="min-h-[36px] resize-none"
                    rows={1}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEnterGrades && (
        <div className="flex justify-end">
          <Button onClick={() => setSubmitDialogOpen(true)} disabled={saving}>
            {saving ? tc('loading') : t('submitGrades')}
          </Button>
        </div>
      )}

      {/* Submit confirmation dialog */}
      <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('submitGradesTitle')}</DialogTitle>
            <DialogDescription>{t('submitGradesWarning')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitDialogOpen(false)} disabled={saving}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSubmitGrades} disabled={saving}>
              {saving ? tc('loading') : t('submitGradesConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock request dialog */}
      <Dialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tUnlock('requestUnlock')}</DialogTitle>
            <DialogDescription>{tUnlock('unlockReason')}</DialogDescription>
          </DialogHeader>
          <Textarea
            value={unlockReason}
            onChange={(e) => setUnlockReason(e.target.value)}
            placeholder={tUnlock('unlockReasonPlaceholder')}
            rows={4}
            className="mt-2"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUnlockDialogOpen(false);
                setUnlockReason('');
              }}
              disabled={submittingUnlock}
            >
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleUnlockRequest}
              disabled={submittingUnlock || !unlockReason.trim()}
            >
              {submittingUnlock ? tc('loading') : tc('submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
