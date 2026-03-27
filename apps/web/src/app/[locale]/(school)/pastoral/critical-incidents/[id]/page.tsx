'use client';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { Save, ShieldPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { PastoralCriticalIncidentStatusBadge } from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import {
  formatStaffProfileName,
  formatStudentName,
  normalizeCriticalIncidentImpactLevel,
  normalizeCriticalIncidentScope,
  normalizeCriticalIncidentStatus,
  normalizeCriticalIncidentType,
  PASTORAL_CRITICAL_INCIDENT_STATUSES,
  searchStaff,
  searchStaffProfiles,
  searchStudents,
  type PastoralApiDetailResponse,
  type PastoralCriticalIncidentAffectedPerson,
  type PastoralCriticalIncidentAffectedSummary,
  type PastoralCriticalIncidentDetail,
  type PastoralCriticalIncidentExternalSupportEntry,
  type PastoralCriticalIncidentResponsePlan,
  type PastoralCriticalIncidentResponsePlanProgress,
  type SearchOption,
} from '@/lib/pastoral';
import { formatDate, formatDateTime } from '@/lib/format-date';

const PLAN_PHASES = ['immediate', 'short_term', 'medium_term', 'long_term'] as const;

const EMPTY_PLAN: PastoralCriticalIncidentResponsePlan = {
  immediate: [],
  short_term: [],
  medium_term: [],
  long_term: [],
};

export default function PastoralCriticalIncidentDetailPage() {
  const t = useTranslations('pastoral.criticalIncidentDetail');
  const sharedT = useTranslations('pastoral.shared');
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
  const [statusTarget, setStatusTarget] = React.useState('none');
  const [statusReason, setStatusReason] = React.useState('');
  const [closureNotes, setClosureNotes] = React.useState('');
  const [planNotes, setPlanNotes] = React.useState<Record<string, string>>({});
  const [newPlanPhase, setNewPlanPhase] = React.useState<(typeof PLAN_PHASES)[number]>('immediate');
  const [newPlanLabel, setNewPlanLabel] = React.useState('');
  const [newPlanDescription, setNewPlanDescription] = React.useState('');
  const [newPlanAssignee, setNewPlanAssignee] = React.useState<SearchOption[]>([]);
  const [personType, setPersonType] = React.useState<'student' | 'staff'>('student');
  const [studentSelection, setStudentSelection] = React.useState<SearchOption[]>([]);
  const [staffSelection, setStaffSelection] = React.useState<SearchOption[]>([]);
  const [impactLevel, setImpactLevel] = React.useState<'directly_affected' | 'indirectly_affected'>(
    'directly_affected',
  );
  const [affectedNotes, setAffectedNotes] = React.useState('');
  const [affectedEdits, setAffectedEdits] = React.useState<
    Record<string, { impact: 'directly_affected' | 'indirectly_affected'; notes: string }>
  >({});
  const [providerType, setProviderType] = React.useState<
    'neps_ci_team' | 'external_counsellor' | 'other'
  >('neps_ci_team');
  const [providerName, setProviderName] = React.useState('');
  const [contactPerson, setContactPerson] = React.useState('');
  const [contactDetails, setContactDetails] = React.useState('');
  const [visitDate, setVisitDate] = React.useState('');
  const [visitTimeStart, setVisitTimeStart] = React.useState('');
  const [visitTimeEnd, setVisitTimeEnd] = React.useState('');
  const [availabilityNotes, setAvailabilityNotes] = React.useState('');
  const [studentsSeen, setStudentsSeen] = React.useState<SearchOption[]>([]);
  const [outcomeNotes, setOutcomeNotes] = React.useState('');
  const [error, setError] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const buildAffectedName = React.useCallback(
    (person: PastoralCriticalIncidentAffectedPerson) => {
      if (person.affected_type === 'student') {
        return formatStudentName(person.student) || sharedT('notAvailable');
      }

      const name = formatStaffProfileName(person.staff_profile);
      if (name) {
        return name;
      }

      return t('staffFallback', {
        id: person.staff_profile?.id.slice(0, 8).toUpperCase() ?? sharedT('notAvailable'),
      });
    },
    [sharedT, t],
  );

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', { type: t(`types.${normalizedType}` as never) })}
        description={t('description', { date: formatDate(incident.occurred_at) })}
      />

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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('recordSection')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('recordDescription')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  {error}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="description">{t('fields.description')}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={7}
                />
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  disabled={busyAction === 'save-record'}
                  onClick={() =>
                    void runAction('save-record', async () => {
                      await apiClient(`/api/v1/pastoral/critical-incidents/${incident.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          description: description.trim(),
                        }),
                        silent: true,
                      });
                    })
                  }
                >
                  <Save className="me-2 h-4 w-4" />
                  {t('saveRecord')}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t('responsePlanSection')}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">{t('responsePlanDescription')}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {progress.map((phase) => (
                <div
                  key={phase.phase}
                  className="rounded-2xl border border-border bg-surface-secondary/60 p-4"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                    {t(`phases.${phase.phase}` as never)}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-text-primary">
                    {phase.completed}/{phase.total}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t('phaseProgress', { percentage: phase.percentage })}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 space-y-5">
              {PLAN_PHASES.map((phase) => (
                <div key={phase} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-text-tertiary">
                      {t(`phases.${phase}` as never)}
                    </h3>
                  </div>

                  {(responsePlan[phase] ?? []).length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-text-tertiary">
                      {t('noPlanItems')}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {(responsePlan[phase] ?? []).map((item) => (
                        <div key={item.id} className="rounded-2xl border border-border px-4 py-4">
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-text-primary">
                                  {item.label}
                                </p>
                                {item.description ? (
                                  <p className="mt-1 text-sm text-text-secondary">
                                    {item.description}
                                  </p>
                                ) : null}
                              </div>
                              <span className="text-xs text-text-tertiary">
                                {item.is_done ? t('completed') : t('pending')}
                              </span>
                            </div>

                            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                              <div className="space-y-2">
                                <Label htmlFor={`plan-note-${item.id}`}>
                                  {t('fields.planNotes')}
                                </Label>
                                <Textarea
                                  id={`plan-note-${item.id}`}
                                  value={planNotes[item.id] ?? ''}
                                  onChange={(event) =>
                                    setPlanNotes((current) => ({
                                      ...current,
                                      [item.id]: event.target.value,
                                    }))
                                  }
                                  rows={3}
                                />
                                <p className="text-xs text-text-tertiary">
                                  {item.assigned_to_name
                                    ? t('assignedTo', { name: item.assigned_to_name })
                                    : item.assigned_to_id
                                      ? t('assignedToId', { id: item.assigned_to_id })
                                      : t('unassigned')}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={busyAction === `save-plan-${item.id}`}
                                  onClick={() =>
                                    void runAction(`save-plan-${item.id}`, async () => {
                                      await apiClient(
                                        `/api/v1/pastoral/critical-incidents/${incident.id}/response-plan/items/${item.id}`,
                                        {
                                          method: 'PATCH',
                                          body: JSON.stringify({
                                            phase,
                                            item_id: item.id,
                                            notes: planNotes[item.id] ?? '',
                                          }),
                                          silent: true,
                                        },
                                      );
                                    })
                                  }
                                >
                                  {t('savePlanItem')}
                                </Button>
                                <Button
                                  type="button"
                                  disabled={busyAction === `toggle-plan-${item.id}`}
                                  onClick={() =>
                                    void runAction(`toggle-plan-${item.id}`, async () => {
                                      await apiClient(
                                        `/api/v1/pastoral/critical-incidents/${incident.id}/response-plan/items/${item.id}`,
                                        {
                                          method: 'PATCH',
                                          body: JSON.stringify({
                                            phase,
                                            item_id: item.id,
                                            is_done: !item.is_done,
                                            notes: planNotes[item.id] ?? item.notes ?? '',
                                          }),
                                          silent: true,
                                        },
                                      );
                                    })
                                  }
                                >
                                  {item.is_done ? t('markPending') : t('markDone')}
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
              <h3 className="text-sm font-semibold text-text-primary">{t('addPlanItem')}</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('fields.phase')}</Label>
                  <Select
                    value={newPlanPhase}
                    onValueChange={(value) =>
                      setNewPlanPhase(value as (typeof PLAN_PHASES)[number])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PLAN_PHASES.map((phase) => (
                        <SelectItem key={phase} value={phase}>
                          {t(`phases.${phase}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <SearchPicker
                  label={t('fields.assignee')}
                  placeholder={t('fields.assigneePlaceholder')}
                  search={searchStaff}
                  selected={newPlanAssignee}
                  onChange={(next) => setNewPlanAssignee(next.slice(0, 1))}
                  multiple={false}
                  emptyText={sharedT('noStaff')}
                  minSearchLengthText={sharedT('minSearchLength')}
                />

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="plan-label">{t('fields.planLabel')}</Label>
                  <Input
                    id="plan-label"
                    value={newPlanLabel}
                    onChange={(event) => setNewPlanLabel(event.target.value)}
                    placeholder={t('fields.planLabelPlaceholder')}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="plan-description">{t('fields.planDescription')}</Label>
                  <Textarea
                    id="plan-description"
                    value={newPlanDescription}
                    onChange={(event) => setNewPlanDescription(event.target.value)}
                    rows={3}
                    placeholder={t('fields.planDescriptionPlaceholder')}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  disabled={busyAction === 'add-plan-item'}
                  onClick={() =>
                    void runAction('add-plan-item', async () => {
                      await apiClient(
                        `/api/v1/pastoral/critical-incidents/${incident.id}/response-plan/items`,
                        {
                          method: 'POST',
                          body: JSON.stringify({
                            phase: newPlanPhase,
                            label: newPlanLabel.trim(),
                            description: newPlanDescription.trim() || undefined,
                            assigned_to_id: newPlanAssignee[0]?.id,
                          }),
                          silent: true,
                        },
                      );

                      setNewPlanLabel('');
                      setNewPlanDescription('');
                      setNewPlanAssignee([]);
                    })
                  }
                >
                  <ShieldPlus className="me-2 h-4 w-4" />
                  {t('createPlanItem')}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t('externalSupportSection')}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {t('externalSupportDescription')}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {externalSupport.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('noExternalSupport')}
                </p>
              ) : (
                externalSupport.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border border-border px-4 py-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {entry.provider_name}
                        </p>
                        <p className="mt-1 text-sm text-text-secondary">
                          {t(`providerTypes.${entry.provider_type}` as never)}
                        </p>
                        <p className="mt-2 text-xs text-text-tertiary">
                          {entry.visit_date
                            ? t('visitMeta', { date: formatDate(entry.visit_date) })
                            : t('visitPending')}
                        </p>
                      </div>
                      <div className="text-xs text-text-tertiary">
                        {t('studentsSeenCount', { count: entry.students_seen.length })}
                      </div>
                    </div>

                    {entry.outcome_notes ? (
                      <p className="mt-3 text-sm text-text-secondary">{entry.outcome_notes}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
              <h3 className="text-sm font-semibold text-text-primary">{t('addExternalSupport')}</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('fields.providerType')}</Label>
                  <Select
                    value={providerType}
                    onValueChange={(value) =>
                      setProviderType(value as 'neps_ci_team' | 'external_counsellor' | 'other')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="neps_ci_team">
                        {t('providerTypes.neps_ci_team')}
                      </SelectItem>
                      <SelectItem value="external_counsellor">
                        {t('providerTypes.external_counsellor')}
                      </SelectItem>
                      <SelectItem value="other">{t('providerTypes.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="provider_name">{t('fields.providerName')}</Label>
                  <Input
                    id="provider_name"
                    value={providerName}
                    onChange={(event) => setProviderName(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact_person">{t('fields.contactPerson')}</Label>
                  <Input
                    id="contact_person"
                    value={contactPerson}
                    onChange={(event) => setContactPerson(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contact_details">{t('fields.contactDetails')}</Label>
                  <Input
                    id="contact_details"
                    value={contactDetails}
                    onChange={(event) => setContactDetails(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visit_date">{t('fields.visitDate')}</Label>
                  <Input
                    id="visit_date"
                    type="date"
                    value={visitDate}
                    onChange={(event) => setVisitDate(event.target.value)}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="visit_time_start">{t('fields.visitTimeStart')}</Label>
                    <Input
                      id="visit_time_start"
                      type="time"
                      value={visitTimeStart}
                      onChange={(event) => setVisitTimeStart(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visit_time_end">{t('fields.visitTimeEnd')}</Label>
                    <Input
                      id="visit_time_end"
                      type="time"
                      value={visitTimeEnd}
                      onChange={(event) => setVisitTimeEnd(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <SearchPicker
                    label={t('fields.studentsSeen')}
                    placeholder={t('fields.studentsSeenPlaceholder')}
                    search={searchStudents}
                    selected={studentsSeen}
                    onChange={setStudentsSeen}
                    emptyText={sharedT('noStudents')}
                    minSearchLengthText={sharedT('minSearchLength')}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="availability_notes">{t('fields.availabilityNotes')}</Label>
                  <Textarea
                    id="availability_notes"
                    value={availabilityNotes}
                    onChange={(event) => setAvailabilityNotes(event.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="outcome_notes">{t('fields.outcomeNotes')}</Label>
                  <Textarea
                    id="outcome_notes"
                    value={outcomeNotes}
                    onChange={(event) => setOutcomeNotes(event.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  disabled={busyAction === 'add-external-support'}
                  onClick={() =>
                    void runAction('add-external-support', async () => {
                      await apiClient(
                        `/api/v1/pastoral/critical-incidents/${incident.id}/external-support`,
                        {
                          method: 'POST',
                          body: JSON.stringify({
                            provider_type: providerType,
                            provider_name: providerName.trim(),
                            contact_person: contactPerson.trim() || undefined,
                            contact_details: contactDetails.trim() || undefined,
                            visit_date: visitDate || undefined,
                            visit_time_start: visitTimeStart || undefined,
                            visit_time_end: visitTimeEnd || undefined,
                            availability_notes: availabilityNotes.trim() || undefined,
                            students_seen: studentsSeen.map((student) => student.id),
                            outcome_notes: outcomeNotes.trim() || undefined,
                          }),
                          silent: true,
                        },
                      );

                      setProviderName('');
                      setContactPerson('');
                      setContactDetails('');
                      setVisitDate('');
                      setVisitTimeStart('');
                      setVisitTimeEnd('');
                      setAvailabilityNotes('');
                      setStudentsSeen([]);
                      setOutcomeNotes('');
                    })
                  }
                >
                  {t('recordExternalSupport')}
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('statusSection')}</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label>{t('fields.statusTarget')}</Label>
                <Select value={statusTarget} onValueChange={setStatusTarget}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('fields.statusTargetPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noStatus')}</SelectItem>
                    {availableStatusTargets.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`status.${status}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status_reason">{t('fields.statusReason')}</Label>
                <Textarea
                  id="status_reason"
                  value={statusReason}
                  onChange={(event) => setStatusReason(event.target.value)}
                  rows={3}
                  placeholder={t('fields.statusReasonPlaceholder')}
                />
              </div>

              {statusTarget === 'closed' ? (
                <div className="space-y-2">
                  <Label htmlFor="closure_notes">{t('fields.closureNotes')}</Label>
                  <Textarea
                    id="closure_notes"
                    value={closureNotes}
                    onChange={(event) => setClosureNotes(event.target.value)}
                    rows={3}
                    placeholder={t('fields.closureNotesPlaceholder')}
                  />
                </div>
              ) : null}

              <Button
                type="button"
                className="w-full"
                disabled={busyAction === 'change-status'}
                onClick={() =>
                  void runAction('change-status', async () => {
                    await apiClient(`/api/v1/pastoral/critical-incidents/${incident.id}/status`, {
                      method: 'POST',
                      body: JSON.stringify({
                        new_status: statusTarget === 'none' ? undefined : statusTarget,
                        reason: statusReason.trim(),
                        closure_notes: closureNotes.trim() || undefined,
                      }),
                      silent: true,
                    });

                    setStatusTarget('none');
                    setStatusReason('');
                    setClosureNotes('');
                  })
                }
              >
                {t('changeStatus')}
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('affectedSummarySection')}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('summary.students')}
                </p>
                <p className="mt-2 text-xl font-semibold text-text-primary">
                  {affectedSummary?.total_students ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('summary.staff')}
                </p>
                <p className="mt-2 text-xl font-semibold text-text-primary">
                  {affectedSummary?.total_staff ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('summary.direct')}
                </p>
                <p className="mt-2 text-xl font-semibold text-text-primary">
                  {affectedSummary?.directly_affected_count ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
                  {t('summary.supportPending')}
                </p>
                <p className="mt-2 text-xl font-semibold text-text-primary">
                  {affectedSummary?.support_pending_count ?? 0}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('affectedSection')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('affectedDescription')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {affectedPeople.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('noAffectedPeople')}
                </p>
              ) : (
                affectedPeople.map((person) => {
                  const edit = affectedEdits[person.id] ?? {
                    impact: 'directly_affected' as const,
                    notes: '',
                  };

                  return (
                    <div key={person.id} className="rounded-2xl border border-border px-4 py-4">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-text-primary">
                              {buildAffectedName(person)}
                            </p>
                            <p className="mt-1 text-xs text-text-tertiary">
                              {t(`personType.${person.affected_type}` as never)}
                              {' · '}
                              {t(
                                `impact.${normalizeCriticalIncidentImpactLevel(person.impact_level)}` as never,
                              )}
                            </p>
                          </div>
                          <span className="text-xs text-text-tertiary">
                            {person.support_offered ? t('supportOffered') : t('supportPending')}
                          </span>
                        </div>

                        <div className="space-y-2">
                          <Label>{t('fields.impactLevel')}</Label>
                          <Select
                            value={edit.impact}
                            onValueChange={(value) =>
                              setAffectedEdits((current) => ({
                                ...current,
                                [person.id]: {
                                  ...edit,
                                  impact: value as 'directly_affected' | 'indirectly_affected',
                                },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="directly_affected">
                                {t('impact.directly_affected')}
                              </SelectItem>
                              <SelectItem value="indirectly_affected">
                                {t('impact.indirectly_affected')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`affected-notes-${person.id}`}>{t('fields.notes')}</Label>
                          <Textarea
                            id={`affected-notes-${person.id}`}
                            value={edit.notes}
                            onChange={(event) =>
                              setAffectedEdits((current) => ({
                                ...current,
                                [person.id]: {
                                  ...edit,
                                  notes: event.target.value,
                                },
                              }))
                            }
                            rows={3}
                          />
                        </div>

                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busyAction === `save-affected-${person.id}`}
                            onClick={() =>
                              void runAction(`save-affected-${person.id}`, async () => {
                                await apiClient(
                                  `/api/v1/pastoral/critical-incidents/${incident.id}/affected/${person.id}`,
                                  {
                                    method: 'PATCH',
                                    body: JSON.stringify({
                                      impact_level: edit.impact,
                                      notes: edit.notes.trim() || undefined,
                                    }),
                                    silent: true,
                                  },
                                );
                              })
                            }
                          >
                            {t('saveAffected')}
                          </Button>
                          {!person.support_offered ? (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busyAction === `support-${person.id}`}
                              onClick={() => {
                                const notes = window.prompt(t('supportPrompt'));
                                if (!notes?.trim()) {
                                  return;
                                }

                                void runAction(`support-${person.id}`, async () => {
                                  await apiClient(
                                    `/api/v1/pastoral/critical-incidents/${incident.id}/affected/${person.id}/support`,
                                    {
                                      method: 'POST',
                                      body: JSON.stringify({ notes: notes.trim() }),
                                      silent: true,
                                    },
                                  );
                                });
                              }}
                            >
                              {t('recordSupport')}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={busyAction === `remove-${person.id}`}
                            onClick={() => {
                              const reason = window.prompt(t('removePrompt'));
                              if (!reason?.trim()) {
                                return;
                              }

                              void runAction(`remove-${person.id}`, async () => {
                                await apiClient(
                                  `/api/v1/pastoral/critical-incidents/${incident.id}/affected/${person.id}`,
                                  {
                                    method: 'DELETE',
                                    body: JSON.stringify({ reason: reason.trim() }),
                                    silent: true,
                                  },
                                );
                              });
                            }}
                          >
                            {t('removeAffected')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-border p-4">
              <h3 className="text-sm font-semibold text-text-primary">{t('addAffected')}</h3>
              <div className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label>{t('fields.personType')}</Label>
                  <Select
                    value={personType}
                    onValueChange={(value) => setPersonType(value as 'student' | 'staff')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">{t('personType.student')}</SelectItem>
                      <SelectItem value="staff">{t('personType.staff')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {personType === 'student' ? (
                  <SearchPicker
                    label={t('fields.student')}
                    placeholder={t('fields.studentPlaceholder')}
                    search={searchStudents}
                    selected={studentSelection}
                    onChange={(next) => setStudentSelection(next.slice(0, 1))}
                    multiple={false}
                    emptyText={sharedT('noStudents')}
                    minSearchLengthText={sharedT('minSearchLength')}
                    disabledIds={existingStudentIds}
                  />
                ) : (
                  <SearchPicker
                    label={t('fields.staff')}
                    placeholder={t('fields.staffPlaceholder')}
                    search={searchStaffProfiles}
                    selected={staffSelection}
                    onChange={(next) => setStaffSelection(next.slice(0, 1))}
                    multiple={false}
                    emptyText={sharedT('noStaff')}
                    minSearchLengthText={sharedT('minSearchLength')}
                    disabledIds={existingStaffProfileIds}
                  />
                )}

                <div className="space-y-2">
                  <Label>{t('fields.impactLevel')}</Label>
                  <Select
                    value={impactLevel}
                    onValueChange={(value) =>
                      setImpactLevel(value as 'directly_affected' | 'indirectly_affected')
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="directly_affected">
                        {t('impact.directly_affected')}
                      </SelectItem>
                      <SelectItem value="indirectly_affected">
                        {t('impact.indirectly_affected')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="affected_notes">{t('fields.notes')}</Label>
                  <Textarea
                    id="affected_notes"
                    value={affectedNotes}
                    onChange={(event) => setAffectedNotes(event.target.value)}
                    rows={3}
                    placeholder={t('fields.notesPlaceholder')}
                  />
                </div>

                <Button
                  type="button"
                  className="w-full"
                  disabled={busyAction === 'add-affected'}
                  onClick={() =>
                    void runAction('add-affected', async () => {
                      await apiClient(
                        `/api/v1/pastoral/critical-incidents/${incident.id}/affected`,
                        {
                          method: 'POST',
                          body: JSON.stringify({
                            person_type: personType,
                            student_id:
                              personType === 'student' ? studentSelection[0]?.id : undefined,
                            staff_id: personType === 'staff' ? staffSelection[0]?.id : undefined,
                            impact_level: impactLevel,
                            notes: affectedNotes.trim() || undefined,
                          }),
                          silent: true,
                        },
                      );

                      setStudentSelection([]);
                      setStaffSelection([]);
                      setAffectedNotes('');
                    })
                  }
                >
                  {t('addAffectedAction')}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('operatingContext')}</h2>
            <div className="mt-4 space-y-3 text-sm text-text-secondary">
              <p>{t('context.visibility')}</p>
              <p>{t('context.workflow')}</p>
              <p>{t('context.childProtection')}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
