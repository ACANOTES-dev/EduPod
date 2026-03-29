'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Gavel,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineStep {
  step: string;
  required_by: string | null;
  completed_at: string | null;
  status: 'complete' | 'pending' | 'overdue' | 'not_started';
}

interface HearingAttendee {
  name: string;
  role: string;
  relationship?: string;
}

interface ExclusionDetail {
  id: string;
  case_number: string;
  type: string;
  status: string;
  formal_notice_issued_at: string | null;
  hearing_date: string | null;
  hearing_attendees: HearingAttendee[] | null;
  student_representation: string | null;
  board_pack_generated_at: string | null;
  decision: string | null;
  decision_date: string | null;
  decision_reasoning: string | null;
  decided_by_id: string | null;
  conditions_for_return: string | null;
  conditions_for_transfer: string | null;
  appeal_deadline: string | null;
  appeal_id: string | null;
  created_at: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    year_group?: { id: string; name: string } | null;
  } | null;
  sanction: {
    id: string;
    sanction_number: string;
    type: string;
    status: string;
  } | null;
  incident: {
    id: string;
    incident_number: string;
    description: string;
    category?: { id: string; name: string; severity: number } | null;
  } | null;
  decided_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  appeal: {
    id: string;
    appeal_number: string;
    status: string;
    grounds_category: string;
    submitted_at: string;
    decision: string | null;
  } | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  changes: Record<string, unknown>;
  performed_by_user?: { first_name: string; last_name: string } | null;
  created_at: string;
}

interface StaffOption {
  id: string;
  user?: { first_name: string; last_name: string } | null;
  first_name?: string;
  last_name?: string;
}

// ─── Badge Colors ─────────────────────────────────���───────────────────────────

const STATUS_COLORS: Record<string, string> = {
  initiated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  notice_issued: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  hearing_scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  hearing_held: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  decision_made: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  appeal_window: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  finalised: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  overturned: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const TYPE_COLORS: Record<string, string> = {
  suspension_extended: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  expulsion: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  managed_move: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  permanent_exclusion: 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200',
};

const APPEAL_STATUS_COLORS: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  hearing_scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  decided: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  withdrawn: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getDaysRemaining(deadline: string | null): number | null {
  if (!deadline) return null;
  const now = new Date();
  const dl = new Date(deadline);
  return Math.ceil((dl.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Timeline Step Dot ───────��────────────────────────────────────────────────

function TimelineDot({ status }: { status: string }) {
  const base = 'h-3 w-3 rounded-full border-2';
  switch (status) {
    case 'complete':
      return <div className={`${base} border-green-500 bg-green-500`} />;
    case 'pending':
      return <div className={`${base} border-amber-500 bg-amber-500`} />;
    case 'overdue':
      return <div className={`${base} border-red-500 bg-red-500`} />;
    default:
      return (
        <div
          className={`${base} border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700`}
        />
      );
  }
}

// ─── Page ──────────────��──────────────────────────────────────────────────────

export default function ExclusionDetailPage() {
  const t = useTranslations('behaviour.exclusionDetail');
  const params = useParams();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const exclusionId = params?.id as string;

  // ─── State ──────────���───────────────────────────────────────────────────
  const [exclusion, setExclusion] = React.useState<ExclusionDetail | null>(
    null,
  );
  const [timeline, setTimeline] = React.useState<TimelineStep[]>([]);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);

  // Action states
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState('');
  const [markingComplete, setMarkingComplete] = React.useState<string | null>(
    null,
  );

  // Hearing form
  const [hearingDate, setHearingDate] = React.useState('');
  const [attendees, setAttendees] = React.useState<HearingAttendee[]>([]);
  const [representation, setRepresentation] = React.useState('');
  const [hearingSubmitting, setHearingSubmitting] = React.useState(false);

  // Decision form
  const [decisionDialogOpen, setDecisionDialogOpen] = React.useState(false);
  const [decisionValue, setDecisionValue] = React.useState('');
  const [decisionReasoning, setDecisionReasoning] = React.useState('');
  const [conditionsReturn, setConditionsReturn] = React.useState('');
  const [conditionsTransfer, setConditionsTransfer] = React.useState('');
  const [decidedById, setDecidedById] = React.useState('');
  const [decisionSubmitting, setDecisionSubmitting] = React.useState(false);

  // ─── Fetch data ───────────���────────────────────────���────────────────────

  const refreshData = React.useCallback(async () => {
    if (!exclusionId) return;

    try {
      const res = await apiClient<ExclusionDetail>(
        `/api/v1/behaviour/exclusion-cases/${exclusionId}`,
      );
      setExclusion(res);

      // Populate hearing form from existing data
      if (res.hearing_date) {
        setHearingDate(res.hearing_date.split('T')[0] ?? '');
      }
      if (res.hearing_attendees) {
        setAttendees(res.hearing_attendees as HearingAttendee[]);
      }
      if (res.student_representation) {
        setRepresentation(res.student_representation);
      }
    } catch {
      setExclusion(null);
    }
  }, [exclusionId]);

  React.useEffect(() => {
    setLoading(true);
    void refreshData().finally(() => setLoading(false));
  }, [refreshData]);

  React.useEffect(() => {
    if (!exclusionId) return;
    apiClient<{ data: TimelineStep[] }>(
      `/api/v1/behaviour/exclusion-cases/${exclusionId}/timeline`,
    )
      .then((res) => setTimeline(res.data ?? []))
      .catch(() => setTimeline([]));
  }, [exclusionId]);

  React.useEffect(() => {
    if (!exclusionId) return;
    setHistoryLoading(true);
    apiClient<{ data: HistoryEntry[] }>(
      `/api/v1/behaviour/incidents/${exclusionId}/history`,
    )
      .then((res) => setHistory(res.data ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [exclusionId]);

  React.useEffect(() => {
    apiClient<{ data: StaffOption[] }>(
      '/api/v1/staff-profiles?pageSize=100',
    )
      .then((res) => setStaffOptions(res.data ?? []))
      .catch(() => setStaffOptions([]));
  }, []);

  // ─── Actions ───────────────���────────────────────────────────────────────

  const handleGenerateNotice = async () => {
    if (!exclusion) return;
    setGenerating('notice');
    setActionError('');
    try {
      await apiClient(
        `/api/v1/behaviour/exclusion-cases/${exclusion.id}/generate-notice`,
        { method: 'POST' },
      );
      await refreshData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setActionError(ex?.error?.message ?? 'Failed to generate notice');
    } finally {
      setGenerating(null);
    }
  };

  const handleGenerateBoardPack = async () => {
    if (!exclusion) return;
    setGenerating('board-pack');
    setActionError('');
    try {
      await apiClient(
        `/api/v1/behaviour/exclusion-cases/${exclusion.id}/generate-board-pack`,
        { method: 'POST' },
      );
      await refreshData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setActionError(ex?.error?.message ?? 'Failed to generate board pack');
    } finally {
      setGenerating(null);
    }
  };

  const handleMarkTimelineComplete = async (step: TimelineStep) => {
    if (!exclusion) return;
    setMarkingComplete(step.step);
    try {
      // Transition status based on step
      let newStatus: string | null = null;
      if (step.step.toLowerCase().includes('notice')) {
        newStatus = 'notice_issued';
      } else if (step.step.toLowerCase().includes('hearing')) {
        newStatus = 'hearing_held';
      }

      if (newStatus && exclusion.status !== newStatus) {
        await apiClient(
          `/api/v1/behaviour/exclusion-cases/${exclusion.id}/status`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              status: newStatus,
              reason: `Timeline step completed: ${step.step}`,
            }),
          },
        );
      }

      await refreshData();

      // Refresh timeline
      const res = await apiClient<{ data: TimelineStep[] }>(
        `/api/v1/behaviour/exclusion-cases/${exclusion.id}/timeline`,
      );
      setTimeline(res.data ?? []);
    } catch {
      // silently handled
    } finally {
      setMarkingComplete(null);
    }
  };

  const handleSaveHearing = async () => {
    if (!exclusion) return;
    setHearingSubmitting(true);
    setActionError('');
    try {
      await apiClient(
        `/api/v1/behaviour/exclusion-cases/${exclusion.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            hearing_date: hearingDate || undefined,
            hearing_attendees: attendees.length > 0 ? attendees : undefined,
            student_representation: representation || undefined,
          }),
        },
      );
      await refreshData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setActionError(ex?.error?.message ?? 'Failed to save hearing details');
    } finally {
      setHearingSubmitting(false);
    }
  };

  const handleMarkHearingHeld = async () => {
    if (!exclusion) return;
    setHearingSubmitting(true);
    setActionError('');
    try {
      await apiClient(
        `/api/v1/behaviour/exclusion-cases/${exclusion.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'hearing_held',
            reason: 'Hearing marked as held',
          }),
        },
      );
      await refreshData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setActionError(ex?.error?.message ?? 'Failed to transition status');
    } finally {
      setHearingSubmitting(false);
    }
  };

  const handleSubmitDecision = async () => {
    if (!exclusion || !decisionValue || !decisionReasoning || !decidedById)
      return;
    setDecisionSubmitting(true);
    setActionError('');
    try {
      await apiClient(
        `/api/v1/behaviour/exclusion-cases/${exclusion.id}/record-decision`,
        {
          method: 'POST',
          body: JSON.stringify({
            decision: decisionValue,
            decision_reasoning: decisionReasoning,
            decided_by_id: decidedById,
            conditions_for_return: conditionsReturn || undefined,
            conditions_for_transfer: conditionsTransfer || undefined,
          }),
        },
      );
      setDecisionDialogOpen(false);
      setDecisionValue('');
      setDecisionReasoning('');
      setConditionsReturn('');
      setConditionsTransfer('');
      setDecidedById('');
      await refreshData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setActionError(ex?.error?.message ?? 'Failed to record decision');
    } finally {
      setDecisionSubmitting(false);
    }
  };

  const handleMarkFinalised = async () => {
    if (!exclusion) return;
    setActionError('');
    try {
      await apiClient(
        `/api/v1/behaviour/exclusion-cases/${exclusion.id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'finalised',
            reason: 'Appeal deadline passed with no appeal',
          }),
        },
      );
      await refreshData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setActionError(ex?.error?.message ?? 'Failed to finalise case');
    }
  };

  // ─── Attendee helpers ─────────────���─────────────────────────────────────

  const addAttendee = () => {
    setAttendees([...attendees, { name: '', role: '', relationship: '' }]);
  };

  const removeAttendee = (index: number) => {
    setAttendees(attendees.filter((_, i) => i !== index));
  };

  const updateAttendee = (
    index: number,
    field: keyof HearingAttendee,
    value: string,
  ) => {
    const updated = [...attendees];
    const item = updated[index];
    if (item) {
      updated[index] = { ...item, [field]: value };
      setAttendees(updated);
    }
  };

  // ─── Loading / Error states ──────���──────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!exclusion) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('notFound')} />
        <p className="text-sm text-text-tertiary">
          {t('notFoundDescription')}
        </p>
      </div>
    );
  }

  const appealDays = getDaysRemaining(exclusion.appeal_deadline);

  // ─── Render ─────────────────���───────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={`Exclusion ${exclusion.case_number}`}
        actions={
          <Link href={`/${locale}/behaviour/exclusions`}>
            <Button variant="ghost">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('backToList')}
            </Button>
          </Link>
        }
      />

      {/* Header Banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${TYPE_COLORS[exclusion.type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
        >
          {formatLabel(exclusion.type)}
        </span>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[exclusion.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
        >
          {formatLabel(exclusion.status)}
        </span>

        {exclusion.student && (
          <Link
            href={`/${locale}/behaviour/students/${exclusion.student.id}`}
            className="flex items-center gap-1 text-sm text-primary-600 hover:underline"
          >
            {exclusion.student.first_name} {exclusion.student.last_name}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}

        {exclusion.sanction && (
          <Link
            href={`/${locale}/behaviour/sanctions/${exclusion.sanction.id}`}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary-600"
          >
            Sanction: {exclusion.sanction.sanction_number}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}

        {exclusion.incident && (
          <Link
            href={`/${locale}/behaviour/incidents/${exclusion.incident.id}`}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-primary-600"
          >
            Incident: {exclusion.incident.incident_number}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content — 2 cols */}
        <div className="space-y-6 lg:col-span-2">
          {/* 1. Statutory Timeline Checklist */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('sections.statutoryTimeline')}
              </h3>
            </div>
            {timeline.length === 0 ? (
              <p className="text-sm text-text-tertiary">
                {t('noTimeline')}
              </p>
            ) : (
              <div className="space-y-3">
                {timeline.map((step) => (
                  <div
                    key={step.step}
                    className="flex items-start gap-3 rounded-lg bg-surface-secondary p-3"
                  >
                    <div className="mt-0.5">
                      <TimelineDot status={step.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">
                        {step.step}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-text-tertiary">
                        {step.required_by && (
                          <span>Due: {formatDate(step.required_by)}</span>
                        )}
                        {step.completed_at && (
                          <span className="text-green-600 dark:text-green-400">
                            Completed: {formatDateTime(step.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    {step.status !== 'complete' && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={markingComplete === step.step}
                        onClick={() => handleMarkTimelineComplete(step)}
                      >
                        {markingComplete === step.step ? (
                          t('saving')
                        ) : (
                          <>
                            <CheckCircle2 className="me-1 h-3.5 w-3.5" />
                            Complete
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. Formal Notice */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('sections.formalNotice')}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {exclusion.formal_notice_issued_at ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  Issued: {formatDateTime(exclusion.formal_notice_issued_at)}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {t('notYetIssued')}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={generating === 'notice'}
                onClick={handleGenerateNotice}
              >
                {generating === 'notice' ? t('generating') : t('generateNotice')}
              </Button>
            </div>
          </div>

          {/* 3. Hearing Section */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('sections.hearing')}
              </h3>
            </div>

            <div className="space-y-4">
              {/* Date picker */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">
                  {t('hearingDate')}
                </label>
                <Input
                  type="date"
                  value={hearingDate}
                  onChange={(e) => setHearingDate(e.target.value)}
                  className="w-full sm:w-56"
                />
              </div>

              {/* Attendees */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-text-primary">
                    Attendees
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addAttendee}
                  >
                    <Plus className="me-1 h-3.5 w-3.5" />
                    Add
                  </Button>
                </div>
                {attendees.length === 0 ? (
                  <p className="text-xs text-text-tertiary">
                    {t('noAttendees')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {attendees.map((att, idx) => (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-secondary p-2"
                      >
                        <Input
                          placeholder="Name"
                          value={att.name}
                          onChange={(e) =>
                            updateAttendee(idx, 'name', e.target.value)
                          }
                          className="w-full text-sm sm:w-36"
                        />
                        <Input
                          placeholder="Role"
                          value={att.role}
                          onChange={(e) =>
                            updateAttendee(idx, 'role', e.target.value)
                          }
                          className="w-full text-sm sm:w-36"
                        />
                        <Input
                          placeholder="Relationship"
                          value={att.relationship ?? ''}
                          onChange={(e) =>
                            updateAttendee(
                              idx,
                              'relationship',
                              e.target.value,
                            )
                          }
                          className="w-full text-sm sm:w-36"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-red-500"
                          onClick={() => removeAttendee(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Student representation */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text-primary">
                  {t('studentRepresentation')}
                </label>
                <Textarea
                  value={representation}
                  onChange={(e) => setRepresentation(e.target.value)}
                  placeholder="Notes on student's representation at the hearing..."
                  rows={3}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={hearingSubmitting}
                  onClick={handleSaveHearing}
                >
                  {hearingSubmitting ? t('saving') : t('saveHearingDetails')}
                </Button>
                {exclusion.status === 'hearing_scheduled' && (
                  <Button
                    disabled={hearingSubmitting}
                    onClick={handleMarkHearingHeld}
                  >
                    {hearingSubmitting
                      ? t('updating')
                      : t('markHearingHeld')}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 4. Board Pack */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-5 w-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('sections.boardPack')}
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {exclusion.board_pack_generated_at ? (
                <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  Generated:{' '}
                  {formatDateTime(exclusion.board_pack_generated_at)}
                </Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {t('notGenerated')}
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={generating === 'board-pack'}
                onClick={handleGenerateBoardPack}
              >
                {generating === 'board-pack'
                  ? t('generating')
                  : t('generateBoardPack')}
              </Button>
            </div>
          </div>

          {/* 5. Decision Form */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <Gavel className="h-5 w-5 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('sections.decision')}
              </h3>
            </div>

            {exclusion.decision ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="secondary">
                    {formatLabel(exclusion.decision)}
                  </Badge>
                  {exclusion.decision_date && (
                    <span className="text-xs text-text-tertiary">
                      Decided: {formatDate(exclusion.decision_date)}
                    </span>
                  )}
                  {exclusion.decided_by && (
                    <span className="text-xs text-text-tertiary">
                      by {exclusion.decided_by.first_name}{' '}
                      {exclusion.decided_by.last_name}
                    </span>
                  )}
                </div>
                {exclusion.decision_reasoning && (
                  <div>
                    <p className="text-xs font-medium text-text-tertiary">
                      Reasoning
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                      {exclusion.decision_reasoning}
                    </p>
                  </div>
                )}
                {exclusion.conditions_for_return && (
                  <div>
                    <p className="text-xs font-medium text-text-tertiary">
                      Conditions for Return
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                      {exclusion.conditions_for_return}
                    </p>
                  </div>
                )}
                {exclusion.conditions_for_transfer && (
                  <div>
                    <p className="text-xs font-medium text-text-tertiary">
                      Conditions for Transfer
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                      {exclusion.conditions_for_transfer}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="mb-3 text-sm text-text-tertiary">
                  {t('noDecision')}
                </p>
                <Button
                  onClick={() => setDecisionDialogOpen(true)}
                  disabled={
                    exclusion.status !== 'hearing_held' &&
                    exclusion.status !== 'decision_made'
                  }
                >
                  {t('recordDecision')}
                </Button>
                {exclusion.status !== 'hearing_held' &&
                  exclusion.status !== 'decision_made' && (
                    <p className="mt-1 text-xs text-text-tertiary">
                      {t('decisionAfterHearing')}
                    </p>
                  )}
              </div>
            )}
          </div>

          {/* 6. Entity History */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">
              {t('sections.history')}
            </h3>
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-10 animate-pulse rounded bg-surface-secondary"
                  />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-text-tertiary">{t('noHistory')}</p>
            ) : (
              <div className="relative space-y-4 ps-6">
                <div className="absolute start-2 top-1 h-full w-px bg-border" />
                {history.map((entry) => (
                  <div key={entry.id} className="relative">
                    <div className="absolute -start-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary-500 bg-surface" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium capitalize text-text-primary">
                          {entry.action.replace(/_/g, ' ')}
                        </span>
                        {entry.performed_by_user && (
                          <span className="text-xs text-text-tertiary">
                            by {entry.performed_by_user.first_name}{' '}
                            {entry.performed_by_user.last_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-tertiary">
                        {formatDateTime(entry.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — 1 col */}
        <div className="space-y-4">
          {/* Appeal Section */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-text-tertiary" />
              <h3 className="text-sm font-semibold text-text-primary">
                {t('sections.appeal')}
              </h3>
            </div>

            {exclusion.appeal_deadline && (
              <div className="mb-3">
                <p className="text-xs text-text-tertiary">Appeal Deadline</p>
                <p className="text-sm font-medium text-text-primary">
                  {formatDate(exclusion.appeal_deadline)}
                </p>
                {appealDays !== null && (
                  <span
                    className={`mt-1 inline-block text-xs font-medium ${
                      appealDays < 0
                        ? 'text-red-600 dark:text-red-400'
                        : appealDays < 3
                          ? 'text-red-600 dark:text-red-400'
                          : appealDays < 5
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-green-600 dark:text-green-400'
                    }`}
                  >
                    {appealDays < 0
                      ? 'Expired'
                      : appealDays === 0
                        ? 'Expires today'
                        : `${appealDays} days remaining`}
                  </span>
                )}
              </div>
            )}

            {exclusion.appeal ? (
              <div className="space-y-2 rounded-lg bg-surface-secondary p-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text-primary">
                    {exclusion.appeal.appeal_number}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${APPEAL_STATUS_COLORS[exclusion.appeal.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
                  >
                    {formatLabel(exclusion.appeal.status)}
                  </span>
                </div>
                <p className="text-xs text-text-tertiary">
                  Grounds: {formatLabel(exclusion.appeal.grounds_category)}
                </p>
                <Link
                  href={`/${locale}/behaviour/appeals/${exclusion.appeal.id}`}
                  className="flex items-center gap-1 text-xs text-primary-600 hover:underline"
                >
                  View Appeal <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-xs text-text-tertiary">{t('noAppeal')}</p>
                {exclusion.status === 'appeal_window' &&
                  appealDays !== null &&
                  appealDays < 0 && (
                    <Button
                      className="mt-2"
                      size="sm"
                      onClick={handleMarkFinalised}
                    >
                      {t('markFinalised')}
                    </Button>
                  )}
              </div>
            )}
          </div>

          {/* Case Meta */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">
              {t('sections.details')}
            </h3>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                <div>
                  <dt className="text-xs text-text-tertiary">Created</dt>
                  <dd className="text-text-primary">
                    {formatDateTime(exclusion.created_at)}
                  </dd>
                </div>
              </div>
              {exclusion.incident?.category && (
                <div>
                  <dt className="text-xs text-text-tertiary">
                    Incident Category
                  </dt>
                  <dd className="text-text-primary">
                    {exclusion.incident.category.name} (Severity:{' '}
                    {exclusion.incident.category.severity}/10)
                  </dd>
                </div>
              )}
              {exclusion.student?.year_group && (
                <div>
                  <dt className="text-xs text-text-tertiary">Year Group</dt>
                  <dd className="text-text-primary">
                    {exclusion.student.year_group.name}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      {/* Decision Dialog */}
      <Dialog open={decisionDialogOpen} onOpenChange={setDecisionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('recordExclusionDecision')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                Decision
              </label>
              <Select value={decisionValue} onValueChange={setDecisionValue}>
                <SelectTrigger>
                  <SelectValue placeholder="Select decision..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusion_confirmed">
                    Exclusion Confirmed
                  </SelectItem>
                  <SelectItem value="exclusion_modified">
                    Exclusion Modified
                  </SelectItem>
                  <SelectItem value="exclusion_reversed">
                    Exclusion Reversed
                  </SelectItem>
                  <SelectItem value="alternative_consequence">
                    Alternative Consequence
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                Reasoning *
              </label>
              <Textarea
                value={decisionReasoning}
                onChange={(e) => setDecisionReasoning(e.target.value)}
                placeholder="Explain the reasoning for this decision (min 10 characters)..."
                rows={4}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                Decided By
              </label>
              <Select value={decidedById} onValueChange={setDecidedById}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff member..." />
                </SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => {
                    const name = s.user
                      ? `${s.user.first_name} ${s.user.last_name}`
                      : s.first_name && s.last_name
                        ? `${s.first_name} ${s.last_name}`
                        : s.id;
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                Conditions for Return
              </label>
              <Textarea
                value={conditionsReturn}
                onChange={(e) => setConditionsReturn(e.target.value)}
                placeholder="Conditions the student must meet to return..."
                rows={2}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">
                Conditions for Transfer
              </label>
              <Textarea
                value={conditionsTransfer}
                onChange={(e) => setConditionsTransfer(e.target.value)}
                placeholder="Conditions for managed move / transfer..."
                rows={2}
              />
            </div>

            {actionError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {actionError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDecisionDialogOpen(false)}
              disabled={decisionSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitDecision}
              disabled={
                decisionSubmitting ||
                !decisionValue ||
                decisionReasoning.length < 10 ||
                !decidedById
              }
            >
              {decisionSubmitting ? 'Submitting...' : 'Submit Decision'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
