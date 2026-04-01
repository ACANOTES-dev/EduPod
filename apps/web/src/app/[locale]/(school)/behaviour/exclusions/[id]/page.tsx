'use client';

import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button } from '@school/ui';

import { DecisionDialog } from './_components/decision-dialog';
import type {
  ExclusionDetail,
  HearingAttendee,
  HistoryEntry,
  StaffOption,
  TimelineStep,
} from './_components/exclusion-types';
import { formatLabel, STATUS_COLORS, TYPE_COLORS } from './_components/exclusion-types';
import {
  BoardPackSection,
  DecisionSection,
  ExclusionHistorySection,
  FormalNoticeSection,
  HearingSection,
  StatutoryTimeline,
} from './_components/main-content-sections';
import { AppealSidebar, CaseMetaSidebar } from './_components/sidebar-sections';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExclusionDetailPage() {
  const t = useTranslations('behaviour.exclusionDetail');
  const params = useParams();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const exclusionId = params?.id as string;

  // ─── State ──────────────────────────────────────────────────────────────
  const [exclusion, setExclusion] = React.useState<ExclusionDetail | null>(null);
  const [timeline, setTimeline] = React.useState<TimelineStep[]>([]);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);

  // Action states
  const [generating, setGenerating] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState('');
  const [markingComplete, setMarkingComplete] = React.useState<string | null>(null);

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

  // ─── Fetch data ─────────────────────────────────────────────────────────

  const refreshData = React.useCallback(async () => {
    if (!exclusionId) return;
    try {
      const res = await apiClient<ExclusionDetail>(
        `/api/v1/behaviour/exclusion-cases/${exclusionId}`,
      );
      setExclusion(res);
      if (res.hearing_date) setHearingDate(res.hearing_date.split('T')[0] ?? '');
      if (res.hearing_attendees) setAttendees(res.hearing_attendees as HearingAttendee[]);
      if (res.student_representation) setRepresentation(res.student_representation);
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
    apiClient<{ data: TimelineStep[] }>(`/api/v1/behaviour/exclusion-cases/${exclusionId}/timeline`)
      .then((res) => setTimeline(res.data ?? []))
      .catch(() => setTimeline([]));
  }, [exclusionId]);

  React.useEffect(() => {
    if (!exclusionId) return;
    setHistoryLoading(true);
    apiClient<{ data: HistoryEntry[] }>(`/api/v1/behaviour/incidents/${exclusionId}/history`)
      .then((res) => setHistory(res.data ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [exclusionId]);

  React.useEffect(() => {
    apiClient<{ data: StaffOption[] }>('/api/v1/staff-profiles?pageSize=100')
      .then((res) => setStaffOptions(res.data ?? []))
      .catch(() => setStaffOptions([]));
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────

  const handleGenerateNotice = async () => {
    if (!exclusion) return;
    setGenerating('notice');
    setActionError('');
    try {
      await apiClient(`/api/v1/behaviour/exclusion-cases/${exclusion.id}/generate-notice`, {
        method: 'POST',
      });
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
      await apiClient(`/api/v1/behaviour/exclusion-cases/${exclusion.id}/generate-board-pack`, {
        method: 'POST',
      });
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
      let newStatus: string | null = null;
      if (step.step.toLowerCase().includes('notice')) newStatus = 'notice_issued';
      else if (step.step.toLowerCase().includes('hearing')) newStatus = 'hearing_held';

      if (newStatus && exclusion.status !== newStatus) {
        await apiClient(`/api/v1/behaviour/exclusion-cases/${exclusion.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: newStatus,
            reason: `Timeline step completed: ${step.step}`,
          }),
        });
      }
      await refreshData();
      const res = await apiClient<{ data: TimelineStep[] }>(
        `/api/v1/behaviour/exclusion-cases/${exclusion.id}/timeline`,
      );
      setTimeline(res.data ?? []);
    } catch (err) {
      // silently handled
      console.error('[setTimeline]', err);
    } finally {
      setMarkingComplete(null);
    }
  };

  const handleSaveHearing = async () => {
    if (!exclusion) return;
    setHearingSubmitting(true);
    setActionError('');
    try {
      await apiClient(`/api/v1/behaviour/exclusion-cases/${exclusion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          hearing_date: hearingDate || undefined,
          hearing_attendees: attendees.length > 0 ? attendees : undefined,
          student_representation: representation || undefined,
        }),
      });
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
      await apiClient(`/api/v1/behaviour/exclusion-cases/${exclusion.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'hearing_held', reason: 'Hearing marked as held' }),
      });
      await refreshData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setActionError(ex?.error?.message ?? 'Failed to transition status');
    } finally {
      setHearingSubmitting(false);
    }
  };

  const handleSubmitDecision = async () => {
    if (!exclusion || !decisionValue || !decisionReasoning || !decidedById) return;
    setDecisionSubmitting(true);
    setActionError('');
    try {
      await apiClient(`/api/v1/behaviour/exclusion-cases/${exclusion.id}/record-decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: decisionValue,
          decision_reasoning: decisionReasoning,
          decided_by_id: decidedById,
          conditions_for_return: conditionsReturn || undefined,
          conditions_for_transfer: conditionsTransfer || undefined,
        }),
      });
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
      await apiClient(`/api/v1/behaviour/exclusion-cases/${exclusion.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'finalised',
          reason: 'Appeal deadline passed with no appeal',
        }),
      });
      await refreshData();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setActionError(ex?.error?.message ?? 'Failed to finalise case');
    }
  };

  // ─── Loading / Error states ─────────────────────────────────────────────

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
        <p className="text-sm text-text-tertiary">{t('notFoundDescription')}</p>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

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
        {/* Main content -- 2 cols */}
        <div className="space-y-6 lg:col-span-2">
          <StatutoryTimeline
            timeline={timeline}
            markingComplete={markingComplete}
            onMarkComplete={(step) => void handleMarkTimelineComplete(step)}
          />
          <FormalNoticeSection
            issuedAt={exclusion.formal_notice_issued_at}
            generating={generating}
            onGenerate={() => void handleGenerateNotice()}
          />
          <HearingSection
            exclusion={exclusion}
            hearingDate={hearingDate}
            onHearingDateChange={setHearingDate}
            attendees={attendees}
            onAttendeesChange={setAttendees}
            representation={representation}
            onRepresentationChange={setRepresentation}
            hearingSubmitting={hearingSubmitting}
            onSaveHearing={() => void handleSaveHearing()}
            onMarkHearingHeld={() => void handleMarkHearingHeld()}
          />
          <BoardPackSection
            generatedAt={exclusion.board_pack_generated_at}
            generating={generating}
            onGenerate={() => void handleGenerateBoardPack()}
          />
          <DecisionSection
            exclusion={exclusion}
            onOpenDecisionDialog={() => setDecisionDialogOpen(true)}
          />
          <ExclusionHistorySection history={history} historyLoading={historyLoading} />
        </div>

        {/* Sidebar -- 1 col */}
        <div className="space-y-4">
          <AppealSidebar
            exclusion={exclusion}
            locale={locale}
            onMarkFinalised={() => void handleMarkFinalised()}
          />
          <CaseMetaSidebar exclusion={exclusion} />
        </div>
      </div>

      {/* Decision Dialog */}
      <DecisionDialog
        open={decisionDialogOpen}
        onOpenChange={setDecisionDialogOpen}
        decisionValue={decisionValue}
        onDecisionValueChange={setDecisionValue}
        decisionReasoning={decisionReasoning}
        onDecisionReasoningChange={setDecisionReasoning}
        conditionsReturn={conditionsReturn}
        onConditionsReturnChange={setConditionsReturn}
        conditionsTransfer={conditionsTransfer}
        onConditionsTransferChange={setConditionsTransfer}
        decidedById={decidedById}
        onDecidedByIdChange={setDecidedById}
        staffOptions={staffOptions}
        submitting={decisionSubmitting}
        actionError={actionError}
        onSubmit={() => void handleSubmitDecision()}
      />
    </div>
  );
}
