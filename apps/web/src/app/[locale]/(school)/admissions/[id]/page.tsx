'use client';

import {
  ArrowLeft,
  Banknote,
  CheckCircle,
  Clock,
  ExternalLink,
  Link as LinkIcon,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { Button, Textarea, toast } from '@school/ui';

import { DynamicFormRenderer } from '@/components/admissions/dynamic-form-renderer';
import { RecordHub } from '@/components/record-hub';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

import { CapacityPanel } from './_components/capacity-panel';
import { ForceApproveModal } from './_components/force-approve-modal';
import { PaymentTab } from './_components/payment-tab';
import { RecordBankTransferModal } from './_components/record-bank-transfer-modal';
import { RecordCashModal } from './_components/record-cash-modal';
import { RejectDialog } from './_components/reject-dialog';
import { TimelineTab } from './_components/timeline-tab';
import type { ApplicationDetail, NoteRow } from './_components/types';

// ─── Status variant map ───────────────────────────────────────────────────────

const STATUS_VARIANT_MAP: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  submitted: 'info',
  waiting_list: 'neutral',
  ready_to_admit: 'warning',
  conditional_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
  withdrawn: 'neutral',
};

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  waiting_list: 'Waiting list',
  ready_to_admit: 'Ready to admit',
  conditional_approval: 'Conditional approval',
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

// ─── Notes tab ────────────────────────────────────────────────────────────────

function NotesTab({
  notes,
  applicationId,
  onNoteAdded,
}: {
  notes: NoteRow[];
  applicationId: string;
  onNoteAdded: () => void;
}) {
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
    } catch (err) {
      console.error('[AdmissionsDetailPage]', err);
      toast.error('Failed to add note');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <Textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add an internal note"
          rows={3}
        />
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={handleAddNote} disabled={submitting || !newNote.trim()}>
            Add note
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-tertiary">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary">
                  {note.author.first_name} {note.author.last_name}
                </span>
                <span className="text-xs text-text-tertiary">
                  {formatDateTime(note.created_at)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary">{note.note}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string; locale: string }>();
  const id = params?.id ?? '';
  const locale = params?.locale ?? 'en';
  const router = useRouter();
  const { isOwner } = useRoleCheck();

  const [application, setApplication] = React.useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [actionLoading, setActionLoading] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);

  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [cashOpen, setCashOpen] = React.useState(false);
  const [bankOpen, setBankOpen] = React.useState(false);
  const [overrideOpen, setOverrideOpen] = React.useState(false);

  const fetchApplication = React.useCallback(async () => {
    if (!id) return;
    try {
      const res = await apiClient<{ data: ApplicationDetail } | ApplicationDetail>(
        `/api/v1/applications/${id}`,
      );
      const payload =
        typeof res === 'object' && res !== null && 'data' in res
          ? (res as { data: ApplicationDetail }).data
          : (res as ApplicationDetail);
      setApplication(payload);
    } catch (err) {
      console.error('[AdmissionsDetailPage]', err);
      const message = err instanceof Error ? err.message : '';
      if (message.toLowerCase().includes('not found')) {
        setNotFound(true);
      } else {
        toast.error('Failed to load application');
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    void fetchApplication();
  }, [fetchApplication]);

  // ─── Resolve labels for the two server-resolved comboboxes ────────────────
  // `target_academic_year_id` and `target_year_group_id` are `single_select`
  // fields whose options are normally fetched at form-render time. In the
  // read-only detail view we don't refetch the option lists, so the
  // comboboxes render empty unless we inject the saved value's label as a
  // single-option list. Joined data already lives on the application.
  const augmentedFormFields = React.useMemo(() => {
    const fields = application?.form_definition?.fields ?? [];
    const yearGroup = application?.target_year_group;
    const academicYear = application?.target_academic_year;
    return fields.map((field) => {
      if (field.field_key === 'target_academic_year_id' && academicYear) {
        return { ...field, options_json: [{ value: academicYear.id, label: academicYear.name }] };
      }
      if (field.field_key === 'target_year_group_id' && yearGroup) {
        return { ...field, options_json: [{ value: yearGroup.id, label: yearGroup.name }] };
      }
      return field;
    });
  }, [
    application?.form_definition?.fields,
    application?.target_academic_year,
    application?.target_year_group,
  ]);

  // The submit-time payload may store labels rather than ids for these two
  // fields (the public form posts the name picked from the combobox). The
  // detail page needs the id for the dropdown to match the augmented option,
  // so prefer the joined-row id when present.
  const augmentedPayloadValues = React.useMemo(() => {
    const base = (application?.payload_json as Record<string, unknown> | undefined) ?? {};
    return {
      ...base,
      ...(application?.target_academic_year
        ? { target_academic_year_id: application.target_academic_year.id }
        : {}),
      ...(application?.target_year_group
        ? { target_year_group_id: application.target_year_group.id }
        : {}),
    };
  }, [
    application?.payload_json,
    application?.target_academic_year,
    application?.target_year_group,
  ]);

  const handleApprove = async () => {
    if (!application) return;
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/applications/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status: 'conditional_approval' }),
      });
      toast.success('Moved to conditional approval. Payment link will be emailed.');
      void fetchApplication();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve application';
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleWithdraw = async () => {
    setActionLoading(true);
    try {
      await apiClient(`/api/v1/applications/${id}/withdraw`, { method: 'POST' });
      toast.success('Application withdrawn');
      void fetchApplication();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to withdraw';
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyPaymentLink = async () => {
    if (!application) return;
    setActionLoading(true);
    try {
      const response = await apiClient<{ checkout_url: string }>(
        `/api/v1/applications/${id}/payment-link/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(response.checkout_url);
        toast.success('Payment link copied to clipboard');
      } else {
        toast.success(`Payment link: ${response.checkout_url}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate payment link';
      toast.error(message);
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

  if (notFound || !application) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> Back
        </Button>
        <div className="rounded-xl border border-border bg-surface p-6 text-center">
          <h2 className="text-lg font-semibold text-text-primary">Application not found</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            It may have been removed or is not visible in this tenant.
          </p>
        </div>
      </div>
    );
  }

  const studentName = `${application.student_first_name} ${application.student_last_name}`.trim();
  const daysInCurrentState = application.reviewed_at
    ? Math.max(
        0,
        Math.floor((Date.now() - new Date(application.reviewed_at).getTime()) / 86_400_000),
      )
    : application.submitted_at
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(application.submitted_at).getTime()) / 86_400_000),
        )
      : 0;

  const statusLabel =
    application.waiting_list_substatus === 'awaiting_year_setup'
      ? 'Waiting · awaiting year setup'
      : (STATUS_LABELS[application.status] ?? application.status.replace(/_/g, ' '));

  const hasPaymentHistory =
    application.payment_amount_cents !== null ||
    application.payment_events.length > 0 ||
    application.override_record !== null;

  const renderActions = () => {
    const actions: React.ReactNode[] = [
      <Button key="back" variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> Back
      </Button>,
    ];

    const seatsAvailable = application.capacity?.available_seats ?? 0;

    switch (application.status) {
      case 'ready_to_admit':
        actions.push(
          <Button
            key="approve"
            onClick={handleApprove}
            disabled={actionLoading || seatsAvailable <= 0}
          >
            <CheckCircle className="me-2 h-4 w-4" /> Move to conditional approval
          </Button>,
          <Button
            key="reject"
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={actionLoading}
          >
            <XCircle className="me-2 h-4 w-4" /> Reject
          </Button>,
          <Button key="withdraw" variant="ghost" onClick={handleWithdraw} disabled={actionLoading}>
            Withdraw
          </Button>,
        );
        break;
      case 'conditional_approval':
        actions.push(
          <Button
            key="copy-link"
            variant="outline"
            onClick={handleCopyPaymentLink}
            disabled={actionLoading}
          >
            <LinkIcon className="me-2 h-4 w-4" /> Copy payment link
          </Button>,
          <Button
            key="cash"
            variant="outline"
            onClick={() => setCashOpen(true)}
            disabled={actionLoading}
          >
            <Banknote className="me-2 h-4 w-4" /> Record cash
          </Button>,
          <Button
            key="bank"
            variant="outline"
            onClick={() => setBankOpen(true)}
            disabled={actionLoading}
          >
            <Banknote className="me-2 h-4 w-4" /> Record bank transfer
          </Button>,
        );
        if (isOwner) {
          actions.push(
            <Button
              key="override"
              variant="destructive"
              onClick={() => setOverrideOpen(true)}
              disabled={actionLoading}
            >
              <ShieldAlert className="me-2 h-4 w-4" /> Force approve
            </Button>,
          );
        }
        actions.push(
          <Button
            key="reject"
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={actionLoading}
          >
            <XCircle className="me-2 h-4 w-4" /> Reject
          </Button>,
          <Button key="withdraw" variant="ghost" onClick={handleWithdraw} disabled={actionLoading}>
            Withdraw
          </Button>,
        );
        break;
      case 'waiting_list':
        actions.push(
          <Button
            key="reject"
            variant="outline"
            onClick={() => setRejectOpen(true)}
            disabled={actionLoading}
          >
            <XCircle className="me-2 h-4 w-4" /> Reject
          </Button>,
          <Button key="withdraw" variant="ghost" onClick={handleWithdraw} disabled={actionLoading}>
            Withdraw
          </Button>,
        );
        break;
      case 'approved':
        if (application.materialised_student) {
          actions.push(
            <Button key="view-student" asChild>
              <Link
                href={`/${locale}/students/${application.materialised_student.id}`}
                className="inline-flex items-center"
              >
                <UserCheck className="me-2 h-4 w-4" /> View student
                <ExternalLink className="ms-2 h-3 w-3" />
              </Link>
            </Button>,
          );
        }
        break;
      default:
        break;
    }

    return actions;
  };

  const tabs = [
    {
      key: 'application',
      label: 'Application',
      content: (
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <DynamicFormRenderer
            fields={augmentedFormFields}
            values={augmentedPayloadValues}
            onChange={() => undefined}
            readOnly
          />
        </div>
      ),
    },
    {
      key: 'timeline',
      label: 'Timeline',
      content: <TimelineTab events={application.timeline} />,
    },
    {
      key: 'notes',
      label: 'Notes',
      content: (
        <NotesTab
          notes={application.notes}
          applicationId={id}
          onNoteAdded={() => void fetchApplication()}
        />
      ),
    },
    ...(hasPaymentHistory
      ? [
          {
            key: 'payment',
            label: 'Payment',
            content: <PaymentTab application={application} />,
          },
        ]
      : []),
  ];

  return (
    <>
      <RecordHub
        title={studentName}
        reference={application.application_number}
        status={{
          label: statusLabel,
          variant: STATUS_VARIANT_MAP[application.status] ?? 'neutral',
        }}
        actions={<div className="flex flex-wrap items-center gap-2">{renderActions()}</div>}
        metrics={[
          {
            label: 'Submitted',
            value: formatDate(application.submitted_at) || '—',
          },
          {
            label: 'Apply date',
            value: formatDate(application.apply_date) || '—',
          },
          {
            label: 'Target year group',
            value: application.target_year_group?.name ?? '—',
          },
          {
            label: 'Academic year',
            value: application.target_academic_year?.name ?? '—',
          },
          {
            label: 'Days in state',
            value: (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-text-tertiary" />
                {daysInCurrentState}
              </span>
            ),
          },
        ]}
        tabs={tabs}
      >
        <CapacityPanel
          capacity={application.capacity}
          yearGroupName={application.target_year_group?.name ?? null}
          academicYearName={application.target_academic_year?.name ?? null}
        />
      </RecordHub>

      <RejectDialog
        open={rejectOpen}
        applicationId={id}
        onClose={() => setRejectOpen(false)}
        onRejected={() => void fetchApplication()}
      />
      <RecordCashModal
        open={cashOpen}
        applicationId={id}
        expectedAmountCents={application.payment_amount_cents}
        currencyCode={application.currency_code}
        onClose={() => setCashOpen(false)}
        onRecorded={() => void fetchApplication()}
      />
      <RecordBankTransferModal
        open={bankOpen}
        applicationId={id}
        expectedAmountCents={application.payment_amount_cents}
        currencyCode={application.currency_code}
        onClose={() => setBankOpen(false)}
        onRecorded={() => void fetchApplication()}
      />
      <ForceApproveModal
        open={overrideOpen}
        applicationId={id}
        expectedAmountCents={application.payment_amount_cents}
        onClose={() => setOverrideOpen(false)}
        onApproved={() => void fetchApplication()}
      />
    </>
  );
}
