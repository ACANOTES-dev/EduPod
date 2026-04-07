'use client';

import { ArrowLeft, Lock } from 'lucide-react';
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

const STATUS_VARIANT: Record<string, 'warning' | 'info' | 'success' | 'neutral' | 'danger'> = {
  draft: 'warning',
  open: 'info',
  closed: 'success',
  locked: 'neutral',
  submitted_locked: 'success',
  unlock_requested: 'warning',
  reopened: 'info',
  final_locked: 'neutral',
};

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

  const scoreRefs = React.useRef<(HTMLInputElement | null)[]>([]);

  const isLocked =
    assessment?.status !== 'draft' &&
    assessment?.status !== 'open' &&
    assessment?.status !== 'reopened';

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
            id: string;
            first_name: string;
            last_name: string;
            student_number?: string;
          }>;
        }>(`/api/v1/students?class_id=${classId}&pageSize=200&status=active`, {
          silent: true,
        }).catch(() => ({
          data: [] as Array<{ id: string; first_name: string; last_name: string }>,
        })),
      ]);

      const a = assessmentRes.data;
      setAssessment({
        id: a.id,
        title: a.title,
        category_name: a.category?.name ?? '',
        max_score: typeof a.max_score === 'number' ? a.max_score : Number(a.max_score),
        status: a.status,
      });

      // Build grade map from existing grades
      const gradeRecords = Array.isArray(gradesRes.data) ? gradesRes.data : [];
      const gradeMap = new Map(gradeRecords.map((g) => [g.student_id, g]));

      // Merge enrolled students with existing grades
      const enrolled = Array.isArray(studentsRes.data) ? studentsRes.data : [];
      const merged: StudentGrade[] = enrolled.map((s) => {
        const existing = gradeMap.get(s.id);
        return {
          student_id: s.id,
          student_name: `${s.first_name} ${s.last_name}`,
          score:
            existing?.raw_score !== null && existing?.raw_score !== undefined
              ? Number(existing.raw_score)
              : null,
          is_missing: existing?.is_missing ?? false,
          comment: existing?.comment ?? '',
        };
      });

      // Include any graded students not in enrolled list (edge case)
      for (const g of gradeRecords) {
        if (!enrolled.find((s) => s.id === g.student_id)) {
          merged.push({
            student_id: g.student_id,
            student_name: g.student
              ? `${g.student.first_name} ${g.student.last_name}`
              : g.student_id,
            score: g.raw_score !== null ? Number(g.raw_score) : null,
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

  const handleSave = async () => {
    if (!assessment) return;
    setSaving(true);
    try {
      await apiClient(`/api/v1/gradebook/assessments/${assessmentId}/grades`, {
        method: 'PUT',
        body: JSON.stringify({
          grades: grades.map((g) => ({
            student_id: g.student_id,
            score: g.score,
            is_missing: g.is_missing,
            comment: g.comment || undefined,
          })),
        }),
      });
      toast.success('Grades saved');
    } catch (err) {
      console.error('[AssessmentsGradesPage]', err);
      toast.error(tc('errorGeneric'));
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
          <StatusBadge status={STATUS_VARIANT[assessment.status] ?? 'neutral'} dot>
            {assessment.status}
          </StatusBadge>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-sm text-text-secondary">
          <span>
            {t('category')}: {assessment.category_name}
          </span>
          <span>
            {t('maxScore')}: <span dir="ltr">{assessment.max_score}</span>
          </span>
        </div>
      </div>

      {isLocked && (
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
                    disabled={isLocked || grade.is_missing}
                    className="w-24"
                    placeholder="—"
                    dir="ltr"
                  />
                </td>
                <td className="px-4 py-3">
                  <Checkbox
                    checked={grade.is_missing}
                    onCheckedChange={(v) => updateGrade(grade.student_id, 'is_missing', v)}
                    disabled={isLocked}
                    aria-label={t('missing')}
                  />
                </td>
                <td className="px-4 py-3">
                  <Textarea
                    value={grade.comment}
                    onChange={(e) => updateGrade(grade.student_id, 'comment', e.target.value)}
                    disabled={isLocked}
                    className="min-h-[36px] resize-none"
                    rows={1}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!isLocked && (
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? tc('loading') : t('save')}
          </Button>
        </div>
      )}

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
