'use client';

import { CheckCircle2, FileText, RotateCcw, Send } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubmissionAttachment {
  id: string;
  attachment_type: string;
  file_name: string | null;
  url: string | null;
}

interface SubmissionRow {
  id: string;
  student: { id: string; first_name: string; last_name: string; student_number: string | null };
  status: 'submitted' | 'returned_for_revision' | 'graded';
  is_late: boolean;
  submitted_at: string;
  submission_text: string | null;
  teacher_feedback: string | null;
  graded_at: string | null;
  points_awarded: number | null;
  attachments: SubmissionAttachment[];
}

interface ListResponse {
  data: SubmissionRow[];
  assignment: { id: string; title: string; max_points: number | null };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomeworkSubmissionsPage() {
  const t = useTranslations('homework');
  const tc = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const [data, setData] = React.useState<ListResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState<{
    mode: 'grade' | 'return';
    submission: SubmissionRow;
  } | null>(null);
  const [pointsValue, setPointsValue] = React.useState('');
  const [feedbackValue, setFeedbackValue] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<ListResponse>(`/api/v1/homework/${id}/submissions`, {
        silent: true,
      });
      setData(res);
    } catch (err) {
      console.error('[HomeworkSubmissions] Failed to load', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openDialog = (mode: 'grade' | 'return', submission: SubmissionRow) => {
    setDialog({ mode, submission });
    setPointsValue(submission.points_awarded != null ? String(submission.points_awarded) : '');
    setFeedbackValue(submission.teacher_feedback ?? '');
  };

  const handleConfirm = async () => {
    if (!dialog) return;
    setBusy(true);
    try {
      if (dialog.mode === 'grade') {
        const points = pointsValue === '' ? null : Number(pointsValue);
        await apiClient(`/api/v1/homework/${id}/submissions/${dialog.submission.id}/grade`, {
          method: 'POST',
          body: JSON.stringify({
            points_awarded: points,
            teacher_feedback: feedbackValue || null,
          }),
        });
        toast.success(t('submissions.graded'));
      } else {
        if (!feedbackValue.trim()) {
          toast.error(t('submissions.feedbackRequired'));
          setBusy(false);
          return;
        }
        await apiClient(`/api/v1/homework/${id}/submissions/${dialog.submission.id}/return`, {
          method: 'POST',
          body: JSON.stringify({ teacher_feedback: feedbackValue }),
        });
        toast.success(t('submissions.returned'));
      }
      setDialog(null);
      void fetchData();
    } catch (err) {
      console.error('[HomeworkSubmissions]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader title={t('submissions.title')} description={data?.assignment.title ?? ''} />

      {data && data.data.length === 0 ? (
        <EmptyState
          icon={Send}
          title={t('submissions.emptyTitle')}
          description={t('submissions.emptyDesc')}
        />
      ) : (
        <div className="space-y-3">
          {data?.data.map((sub) => (
            <div
              key={sub.id}
              className="rounded-2xl border border-border-subtle bg-surface-primary p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-text-primary">
                    {sub.student.first_name} {sub.student.last_name}
                  </h3>
                  <p className="text-xs text-text-tertiary">
                    {sub.student.student_number ?? ''} · {t('submissions.submittedOn')}{' '}
                    {formatDate(sub.submitted_at)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    status={
                      sub.status === 'graded'
                        ? 'success'
                        : sub.status === 'returned_for_revision'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {t(`submissions.status.${sub.status}`)}
                  </StatusBadge>
                  {sub.is_late && (
                    <StatusBadge status="warning">{t('submissions.late')}</StatusBadge>
                  )}
                  {sub.points_awarded != null && data.assignment.max_points != null && (
                    <span className="text-sm font-semibold text-success-600 tabular-nums">
                      {sub.points_awarded} / {data.assignment.max_points}
                    </span>
                  )}
                </div>
              </div>

              {sub.submission_text && (
                <div className="mt-3 rounded-lg bg-surface-secondary p-3">
                  <p className="whitespace-pre-wrap break-words text-sm text-text-primary">
                    {sub.submission_text}
                  </p>
                </div>
              )}

              {sub.attachments.length > 0 && (
                <div className="mt-3 space-y-1">
                  {sub.attachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-text-tertiary" />
                      {a.url ? (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-600 hover:underline break-all"
                        >
                          {a.file_name ?? a.url}
                        </a>
                      ) : (
                        <span>{a.file_name ?? '—'}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sub.teacher_feedback && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-1 text-xs font-semibold text-amber-700">
                    {t('submissions.teacherFeedback')}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-text-primary">
                    {sub.teacher_feedback}
                  </p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {sub.status !== 'graded' && (
                  <Button size="sm" onClick={() => openDialog('grade', sub)}>
                    <CheckCircle2 className="me-1 h-4 w-4" />
                    {t('submissions.grade')}
                  </Button>
                )}
                {sub.status === 'submitted' && (
                  <Button size="sm" variant="outline" onClick={() => openDialog('return', sub)}>
                    <RotateCcw className="me-1 h-4 w-4" />
                    {t('submissions.return')}
                  </Button>
                )}
                {sub.status === 'graded' && (
                  <Button size="sm" variant="outline" onClick={() => openDialog('grade', sub)}>
                    {t('submissions.editGrade')}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'grade'
                ? t('submissions.gradeTitle')
                : t('submissions.returnTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {dialog?.mode === 'grade' && data?.assignment.max_points != null && (
              <div className="space-y-1.5">
                <Label>
                  {t('submissions.points')} ({tc('all')} {data.assignment.max_points})
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={data.assignment.max_points}
                  value={pointsValue}
                  onChange={(e) => setPointsValue(e.target.value)}
                  className="text-base"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>
                {t('submissions.feedback')}
                {dialog?.mode === 'return' && ' *'}
              </Label>
              <Textarea
                rows={4}
                value={feedbackValue}
                onChange={(e) => setFeedbackValue(e.target.value)}
                placeholder={
                  dialog?.mode === 'grade'
                    ? t('submissions.feedbackOptional')
                    : t('submissions.feedbackRequiredPlaceholder')
                }
                className="text-base"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={busy}>
              {busy
                ? tc('saving')
                : dialog?.mode === 'grade'
                  ? t('submissions.saveGrade')
                  : t('submissions.returnAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
