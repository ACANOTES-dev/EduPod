'use client';

import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { PastoralCriticalIncidentStatusBadge } from '@/components/pastoral/pastoral-badges';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  normalizeCriticalIncidentImpactLevel,
  normalizeCriticalIncidentScope,
  normalizeCriticalIncidentStatus,
  normalizeCriticalIncidentType,
  PASTORAL_CRITICAL_INCIDENT_STATUSES,
  type PastoralApiDetailResponse,
  type PastoralCriticalIncidentAffectedPerson,
  type PastoralCriticalIncidentAffectedSummary,
  type PastoralCriticalIncidentDetail,
  type PastoralCriticalIncidentExternalSupportEntry,
  type PastoralCriticalIncidentResponsePlan,
  type PastoralCriticalIncidentResponsePlanProgress,
} from '@/lib/pastoral';

import { ExternalSupportSection } from './_components/external-support-section';
import { RecordSection } from './_components/record-section';
import { ResponsePlanSection } from './_components/response-plan-section';
import {
  AffectedPeoplePanel,
  AffectedSummaryPanel,
  OperatingContextPanel,
  StatusPanel,
} from './_components/sidebar-panels';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_PHASES = ['immediate', 'short_term', 'medium_term', 'long_term'] as const;

const EMPTY_PLAN: PastoralCriticalIncidentResponsePlan = {
  immediate: [],
  short_term: [],
  medium_term: [],
  long_term: [],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PastoralCriticalIncidentDetailPage() {
  const t = useTranslations('pastoral.criticalIncidentDetail');
  const params = useParams();
  const incidentId = params?.id as string;

  const [incident, setIncident] = React.useState<PastoralCriticalIncidentDetail | null>(null);
  const [progress, setProgress] = React.useState<PastoralCriticalIncidentResponsePlanProgress[]>(
    [],
  );
  const [affectedSummary, setAffectedSummary] =
    React.useState<PastoralCriticalIncidentAffectedSummary | null>(null);
  const [affectedPeople, setAffectedPeople] = React.useState<
    PastoralCriticalIncidentAffectedPerson[]
  >([]);
  const [externalSupport, setExternalSupport] = React.useState<
    PastoralCriticalIncidentExternalSupportEntry[]
  >([]);
  const [description, setDescription] = React.useState('');
  const [planNotes, setPlanNotes] = React.useState<Record<string, string>>({});
  const [affectedEdits, setAffectedEdits] = React.useState<
    Record<string, { impact: 'directly_affected' | 'indirectly_affected'; notes: string }>
  >({});
  const [error, setError] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  // ─── Sync helpers ───────────────────────────────────────────────────────

  const syncPlanNotes = React.useCallback((plan: PastoralCriticalIncidentResponsePlan | null) => {
    const nextNotes: Record<string, string> = {};
    for (const phase of PLAN_PHASES) {
      for (const item of plan?.[phase] ?? []) {
        nextNotes[item.id] = item.notes ?? '';
      }
    }
    setPlanNotes(nextNotes);
  }, []);

  const syncAffectedEdits = React.useCallback(
    (people: PastoralCriticalIncidentAffectedPerson[]) => {
      setAffectedEdits(
        Object.fromEntries(
          people.map((person) => [
            person.id,
            {
              impact: normalizeCriticalIncidentImpactLevel(person.impact_level) as
                | 'directly_affected'
                | 'indirectly_affected',
              notes: person.notes ?? '',
            },
          ]),
        ),
      );
    },
    [],
  );

  // ─── Fetch ──────────────────────────────────────────────────────────────

  const refresh = React.useCallback(async () => {
    const [
      detailResponse,
      progressResponse,
      affectedResponse,
      affectedSummaryResponse,
      externalSupportResponse,
    ] = await Promise.all([
      apiClient<PastoralApiDetailResponse<PastoralCriticalIncidentDetail>>(
        `/api/v1/pastoral/critical-incidents/${incidentId}`,
        { silent: true },
      ),
      apiClient<PastoralApiDetailResponse<PastoralCriticalIncidentResponsePlanProgress[]>>(
        `/api/v1/pastoral/critical-incidents/${incidentId}/response-plan`,
        { silent: true },
      ),
      apiClient<PastoralApiDetailResponse<PastoralCriticalIncidentAffectedPerson[]>>(
        `/api/v1/pastoral/critical-incidents/${incidentId}/affected`,
        { silent: true },
      ),
      apiClient<PastoralApiDetailResponse<PastoralCriticalIncidentAffectedSummary>>(
        `/api/v1/pastoral/critical-incidents/${incidentId}/affected/summary`,
        { silent: true },
      ),
      apiClient<PastoralApiDetailResponse<PastoralCriticalIncidentExternalSupportEntry[]>>(
        `/api/v1/pastoral/critical-incidents/${incidentId}/external-support`,
        { silent: true },
      ),
    ]);

    setIncident(detailResponse.data);
    setDescription(detailResponse.data.description);
    setProgress(progressResponse.data ?? []);
    setAffectedPeople(affectedResponse.data ?? []);
    setAffectedSummary(affectedSummaryResponse.data);
    setExternalSupport(externalSupportResponse.data ?? []);
    syncPlanNotes(detailResponse.data.response_plan ?? EMPTY_PLAN);
    syncAffectedEdits(affectedResponse.data ?? []);
  }, [incidentId, syncAffectedEdits, syncPlanNotes]);

  React.useEffect(() => {
    void refresh().catch(() => {
      setIncident(null);
      setProgress([]);
      setAffectedSummary(null);
      setAffectedPeople([]);
      setExternalSupport([]);
    });
  }, [refresh]);

  // ─── Action runner ──────────────────────────────────────────────────────

  const runAction = async (key: string, action: () => Promise<void>) => {
    setError('');
    setBusyAction(key);
    try {
      await action();
      await refresh();
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setBusyAction(null);
    }
  };

  // ─── Loading / Not Found ────────────────────────────────────────────────

  if (!incident) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
        {t('notFound')}
      </div>
    );
  }

  const normalizedStatus = normalizeCriticalIncidentStatus(incident.status);
  const normalizedType = normalizeCriticalIncidentType(incident.incident_type);
  const normalizedScope = normalizeCriticalIncidentScope(incident.scope);
  const availableStatusTargets = PASTORAL_CRITICAL_INCIDENT_STATUSES.filter(
    (status) => status !== normalizedStatus,
  );
  const responsePlan = incident.response_plan ?? EMPTY_PLAN;
  const existingStudentIds = affectedPeople
    .filter((person) => person.student_id)
    .map((person) => person.student_id as string);
  const existingStaffProfileIds = affectedPeople
    .filter((person) => person.staff_profile_id)
    .map((person) => person.staff_profile_id as string);
  const scopeCount = incident.scope_ids?.length ?? 0;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', { type: t(`types.${normalizedType}` as never) })}
        description={t('description', { date: formatDate(incident.occurred_at) })}
      />

      {/* Header stats */}
      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PastoralCriticalIncidentStatusBadge status={normalizedStatus} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('occurred')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {formatDate(incident.occurred_at)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('scope')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {t(`scopeOptions.${normalizedScope}` as never)}
            </p>
            {normalizedScope !== 'whole_school' ? (
              <p className="mt-1 text-xs text-text-tertiary">
                {t('scopeCount', { count: scopeCount })}
              </p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('affectedCount')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {incident.affected_count}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('updated')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {formatDateTime(incident.updated_at)}
            </p>
          </div>
        </div>
      </section>

      {/* Two-column layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        {/* Main content */}
        <div className="space-y-6">
          <RecordSection
            incidentId={incident.id}
            description={description}
            onDescriptionChange={setDescription}
            error={error}
            busyAction={busyAction}
            onRunAction={runAction}
          />

          <ResponsePlanSection
            incidentId={incident.id}
            responsePlan={responsePlan}
            progress={progress}
            planNotes={planNotes}
            onPlanNotesChange={setPlanNotes}
            busyAction={busyAction}
            onRunAction={runAction}
          />

          <ExternalSupportSection
            incidentId={incident.id}
            externalSupport={externalSupport}
            busyAction={busyAction}
            onRunAction={runAction}
          />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <StatusPanel
            incidentId={incident.id}
            normalizedStatus={normalizedStatus}
            availableStatusTargets={availableStatusTargets}
            busyAction={busyAction}
            onRunAction={runAction}
          />

          <AffectedSummaryPanel summary={affectedSummary} />

          <AffectedPeoplePanel
            incidentId={incident.id}
            affectedPeople={affectedPeople}
            affectedEdits={affectedEdits}
            onAffectedEditsChange={setAffectedEdits}
            existingStudentIds={existingStudentIds}
            existingStaffProfileIds={existingStaffProfileIds}
            busyAction={busyAction}
            onRunAction={runAction}
          />

          <OperatingContextPanel />
        </div>
      </div>
    </div>
  );
}
