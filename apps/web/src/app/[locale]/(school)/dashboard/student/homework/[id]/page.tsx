'use client';

import { AlertCircle, CheckCircle2, Clock, FileText, Send } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Attachment {
  id: string;
  attachment_type: string;
  file_name?: string;
  url?: string;
}

type SubmissionAttachment = Attachment;

interface SubmissionRow {
  id: string;
  status: 'submitted' | 'returned_for_revision' | 'graded';
  is_late: boolean;
  submitted_at: string;
  submission_text: string | null;
  teacher_feedback: string | null;
  points_awarded: number | null;
  graded_at: string | null;
  attachments: SubmissionAttachment[];
}

interface StudentHomeworkDetail {
  id: string;
  title: string;
  description: string | null;
  homework_type: string;
  due_date: string;
  due_time: string | null;
  max_points: number | null;
  accept_late_submissions: boolean;
  class_entity: { id: string; name: string };
  subject: { id: string; name: string } | null;
  assigned_by: { first_name: string; last_name: string } | null;
  attachments: Attachment[];
  submissions: SubmissionRow[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudentHomeworkDetailPage() {
  const t = useTranslations('homework');
  const tc = useTranslations('common');
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';

  const [hw, setHw] = React.useState<StudentHomeworkDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitText, setSubmitText] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: StudentHomeworkDetail }>(
        `/api/v1/student/homework/${id}`,
        { silent: true },
      );
      setHw(res.data ?? null);
      if (res.data?.submissions?.[0]?.submission_text) {
        setSubmitText(res.data.submissions[0].submission_text);
      }
    } catch (err) {
      console.error('[StudentHomeworkDetail] Failed to load', err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const submission = hw?.submissions?.[0];
  const isGraded = submission?.status === 'graded';
  const isReturned = submission?.status === 'returned_for_revision';
  const canSubmit = !isGraded;

  const dueDate = hw ? new Date(hw.due_date) : null;
  const now = new Date();
  const isPastDue = dueDate ? now > dueDate : false;
  const lateAllowed = hw?.accept_late_submissions ?? true;
  const hardLocked = isPastDue && !lateAllowed && !submission;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/student/homework/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ submission_text: submitText || undefined }),
      });
      toast.success(t('studentHomework.submitSuccess'));
      void fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to submit';
      console.error('[StudentHomeworkDetail] submit failed', err);
      toast.error(msg);
    } finally {
      setSubmitting(false);
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

  if (!hw) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title={t('notFound')} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader title={hw.title} description={hw.subject?.name ?? t('subjectlessClass')} />

      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-border-subtle bg-surface-secondary p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-text-tertiary">{t('class')}</p>
          <p className="text-sm font-medium text-text-primary">{hw.class_entity.name}</p>
        </div>
        <div>
          <p className="text-xs text-text-tertiary">{t('dueDate')}</p>
          <p className="inline-flex items-center gap-1 text-sm font-medium text-text-primary">
            <Clock className="h-4 w-4" />
            {formatDate(hw.due_date)}
            {hw.due_time ? ` · ${hw.due_time}` : ''}
          </p>
        </div>
        {hw.max_points != null && (
          <div>
            <p className="text-xs text-text-tertiary">{t('maxPoints')}</p>
            <p className="text-sm font-medium text-text-primary">{hw.max_points}</p>
          </div>
        )}
        <div>
          <p className="text-xs text-text-tertiary">{t('assignedBy')}</p>
          <p className="text-sm font-medium text-text-primary">
            {hw.assigned_by ? `${hw.assigned_by.first_name} ${hw.assigned_by.last_name}` : '—'}
          </p>
        </div>
      </div>

      {hw.description && (
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('description')}</h3>
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{hw.description}</p>
        </div>
      )}

      {hw.attachments.length > 0 && (
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">{t('attachments')}</h3>
          <div className="space-y-1">
            {hw.attachments.map((a) => (
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
        </div>
      )}

      {/* Submission result — graded or returned for revision */}
      {isGraded && submission && (
        <div className="rounded-2xl border border-success-200 bg-success-50 p-4">
          <div className="flex items-center gap-2 text-success-700">
            <CheckCircle2 className="h-5 w-5" />
            <h3 className="text-sm font-semibold">{t('studentHomework.graded')}</h3>
            {submission.points_awarded != null && hw.max_points != null && (
              <span className="ms-auto text-base font-bold tabular-nums">
                {submission.points_awarded} / {hw.max_points}
              </span>
            )}
          </div>
          {submission.teacher_feedback && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
              {submission.teacher_feedback}
            </p>
          )}
        </div>
      )}

      {isReturned && submission && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertCircle className="h-5 w-5" />
            <h3 className="text-sm font-semibold">{t('studentHomework.returned')}</h3>
          </div>
          {submission.teacher_feedback && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
              {submission.teacher_feedback}
            </p>
          )}
          <p className="mt-2 text-xs text-amber-700">{t('studentHomework.resubmitInstruction')}</p>
        </div>
      )}

      {/* Submit box */}
      {canSubmit && !hardLocked && (
        <div className="rounded-2xl border border-border-subtle bg-surface-primary p-4">
          <h3 className="mb-2 text-sm font-semibold text-text-primary">
            {submission ? t('studentHomework.resubmit') : t('studentHomework.submit')}
          </h3>
          {isPastDue && lateAllowed && (
            <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
              <AlertCircle className="h-3 w-3" />
              {t('studentHomework.willFlagLate')}
            </p>
          )}
          <Textarea
            value={submitText}
            onChange={(e) => setSubmitText(e.target.value)}
            rows={5}
            placeholder={t('studentHomework.submitPlaceholder')}
            className="text-base"
          />
          <div className="mt-3 flex items-center justify-end">
            <Button onClick={handleSubmit} disabled={submitting}>
              <Send className="me-1 h-4 w-4" />
              {submitting
                ? tc('saving')
                : submission
                  ? t('studentHomework.resubmit')
                  : t('studentHomework.submit')}
            </Button>
          </div>
        </div>
      )}

      {hardLocked && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            <h3 className="text-sm font-semibold">{t('studentHomework.hardLocked')}</h3>
          </div>
          <p className="mt-2 text-sm text-red-700">{t('studentHomework.hardLockedDesc')}</p>
        </div>
      )}
    </div>
  );
}
