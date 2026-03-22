'use client';

import { Button, Textarea, toast } from '@school/ui';
import { ArrowLeft, CheckCircle, Clock, UserPlus, XCircle } from 'lucide-react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { DynamicFormRenderer } from '@/components/admissions/dynamic-form-renderer';
import { RecordHub } from '@/components/record-hub';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormField {
  field_key: string;
  label: string;
  help_text?: string | null;
  field_type: string;
  required: boolean;
  options_json?: Array<{ value: string; label: string }> | null;
  conditional_visibility_json?: {
    depends_on_field_key: string;
    show_when_value: string | string[];
  } | null;
  display_order: number;
}

interface InternalNote {
  id: string;
  content: string;
  created_at: string;
  user_name: string;
}

interface ApplicationDetail {
  id: string;
  application_number: string;
  student_first_name: string;
  student_last_name: string;
  date_of_birth?: string | null;
  status: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
  payload_json: Record<string, unknown>;
  form_definition: {
    id: string;
    name: string;
    fields: FormField[];
  } | null;
  notes: Array<{
    id: string;
    note: string;
    is_internal: boolean;
    created_at: string;
    author: { id: string; first_name: string; last_name: string };
  }>;
}

// ─── Status variant map ───────────────────────────────────────────────────────

const STATUS_VARIANT_MAP: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'warning',
  pending_acceptance_approval: 'warning',
  accepted: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

// ─── Application Tab ──────────────────────────────────────────────────────────

function ApplicationTab({
  fields,
  payload,
}: {
  fields: FormField[];
  payload: Record<string, unknown>;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <DynamicFormRenderer fields={fields} values={payload} onChange={() => undefined} readOnly />
    </div>
  );
}

// ─── Notes Tab ────────────────────────────────────────────────────────────────

function NotesTab({
  notes,
  applicationId,
  onNoteAdded,
}: {
  notes: InternalNote[];
  applicationId: string;
  onNoteAdded: () => void;
}) {
  const t = useTranslations('admissions');
  const [newNote, setNewNote] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/applications/${applicationId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ note: newNote, is_internal: true }),
      });
      setNewNote('');
      onNoteAdded();
      toast.success('Note added');
    } catch {
      toast.error('Failed to add note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Add note form */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <Textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder={t('internalNote')}
          rows={3}
        />
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={handleAddNote} disabled={submitting || !newNote.trim()}>
            {t('addNote')}
          </Button>
        </div>
      </div>

      {/* Existing notes */}
      {notes.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-tertiary">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded-xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">{note.user_name}</span>
                <span className="text-xs text-text-tertiary">
                  {new Date(note.created_at).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-sm text-text-secondary">{note.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('admissions');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [application, setApplication] = React.useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [showRejectForm, setShowRejectForm] = React.useState(false);
  const [rejectionReason, setRejectionReason] = React.useState('');

  const fetchApplication = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient<{ data: ApplicationDetail }>(`/api/v1/applications/${id}`);
      setApplication(res.data);
    } catch {
      toast.error('Failed to load application');
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchApplication();
  }, [fetchApplication]);

  const handleReviewAction = async (status: 'under_review' | 'pending_acceptance_approval' | 'rejected') => {
    if (!application) return;
    if (status === 'rejected' && !rejectionReason.trim()) {
      setShowRejectForm(true);
      return;
    }
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/applications/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          expected_updated_at: application.updated_at,
          ...(status === 'rejected' ? { rejection_reason: rejectionReason } : {}),
        }),
      });
      toast.success(t('statusUpdateSuccess'));
      setShowRejectForm(false);
      setRejectionReason('');
      void fetchApplication();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/applications/${id}/withdraw`, {
        method: 'POST',
      });
      toast.success(t('statusUpdateSuccess'));
      void fetchApplication();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">Application not found.</p>
      </div>
    );
  }

  const daysPending = application.submitted_at
    ? Math.floor(
        (Date.now() - new Date(application.submitted_at).getTime()) / (1000 * 60 * 60 * 24),
      )
    : 0;

  // Action buttons based on status
  const renderActions = () => {
    const actions: React.ReactNode[] = [
      <Button key="back" variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
      </Button>,
    ];

    switch (application.status) {
      case 'submitted':
        actions.push(
          <Button
            key="review"
            variant="outline"
            onClick={() => handleReviewAction('under_review')}
            disabled={actionLoading}
          >
            <Clock className="me-2 h-4 w-4" />
            {t('startReview')}
          </Button>,
        );
        break;
      case 'under_review':
        actions.push(
          <Button
            key="accept"
            onClick={() => handleReviewAction('pending_acceptance_approval')}
            disabled={actionLoading}
          >
            <CheckCircle className="me-2 h-4 w-4" />
            {t('accept')}
          </Button>,
          <Button
            key="reject"
            variant="outline"
            onClick={() => handleReviewAction('rejected')}
            disabled={actionLoading}
          >
            <XCircle className="me-2 h-4 w-4" />
            {t('reject')}
          </Button>,
        );
        break;
      case 'accepted':
        actions.push(
          <Button
            key="convert"
            onClick={() => router.push(`/${locale}/admissions/${id}/convert`)}
          >
            <UserPlus className="me-2 h-4 w-4" />
            {t('convertToStudent')}
          </Button>,
        );
        break;
    }

    // Withdraw is available when not already withdrawn, rejected, or draft
    if (!['withdrawn', 'rejected', 'draft'].includes(application.status)) {
      actions.push(
        <Button
          key="withdraw"
          variant="ghost"
          onClick={handleWithdraw}
          disabled={actionLoading}
        >
          {t('withdraw')}
        </Button>,
      );
    }

    return actions;
  };

  const tabs = [
    {
      key: 'application',
      label: t('application'),
      content: (
        <ApplicationTab
          fields={application.form_definition?.fields ?? []}
          payload={(application.payload_json as Record<string, unknown>) ?? {}}
        />
      ),
    },
    {
      key: 'notes',
      label: t('notes'),
      content: (
        <NotesTab
          notes={(application.notes ?? []).map((n) => ({
            id: n.id,
            content: n.note,
            created_at: n.created_at,
            user_name: `${n.author.first_name} ${n.author.last_name}`,
          }))}
          applicationId={id}
          onNoteAdded={() => void fetchApplication()}
        />
      ),
    },
  ];

  const studentName = `${application.student_first_name} ${application.student_last_name}`.trim();

  return (
    <RecordHub
      title={studentName}
      reference={application.application_number}
      status={{
        label: application.status.replace(/_/g, ' '),
        variant: STATUS_VARIANT_MAP[application.status] ?? 'neutral',
      }}
      actions={
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">{renderActions()}</div>
          {showRejectForm && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={t('rejectionReasonPlaceholder')}
                  rows={2}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={actionLoading || !rejectionReason.trim()}
                onClick={() => handleReviewAction('rejected')}
              >
                {t('confirmReject')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowRejectForm(false); setRejectionReason(''); }}
              >
                {tc('cancel')}
              </Button>
            </div>
          )}
        </div>
      }
      metrics={[
        {
          label: t('submittedAt'),
          value: application.submitted_at
            ? new Date(application.submitted_at).toLocaleDateString()
            : '—',
        },
        {
          label: 'Days Pending',
          value: daysPending,
        },
      ]}
      tabs={tabs}
    />
  );
}
