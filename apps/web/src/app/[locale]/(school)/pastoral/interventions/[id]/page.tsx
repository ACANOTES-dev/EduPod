'use client';

import { Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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

import { PageHeader } from '@/components/page-header';
import {
  PastoralActionStatusBadge,
  PastoralInterventionStatusBadge,
  PastoralTierBadge,
} from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/format-date';
import {
  formatStudentName,
  getLocaleFromPathname,
  normalizeActionStatus,
  normalizeInterventionStatus,
  searchStaff,
  type InterventionTypeOption,
  type PastoralApiDetailResponse,
  type PastoralInterventionDetail,
  type PastoralInterventionTargetOutcome,
  type SearchOption,
} from '@/lib/pastoral';

const TERMINAL_STATUSES = [
  'achieved',
  'partially_achieved',
  'not_achieved',
  'escalated',
  'withdrawn',
] as const;

const ACTION_FREQUENCIES = ['once', 'daily', 'weekly', 'fortnightly', 'as_needed'] as const;

export default function PastoralInterventionDetailPage() {
  const t = useTranslations('pastoral.interventionDetail');
  const sharedT = useTranslations('pastoral.shared');
  const params = useParams();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const interventionId = params?.id as string;
  const [intervention, setIntervention] = React.useState<PastoralInterventionDetail | null>(null);
  const [types, setTypes] = React.useState<InterventionTypeOption[]>([]);
  const [planType, setPlanType] = React.useState('');
  const [continuumLevel, setContinuumLevel] = React.useState('2');
  const [reviewCycleWeeks, setReviewCycleWeeks] = React.useState('6');
  const [parentInformed, setParentInformed] = React.useState(false);
  const [parentConsented, setParentConsented] = React.useState('unknown');
  const [parentInput, setParentInput] = React.useState('');
  const [studentVoice, setStudentVoice] = React.useState('');
  const [outcomes, setOutcomes] = React.useState<PastoralInterventionTargetOutcome[]>([]);
  const [statusTarget, setStatusTarget] = React.useState('none');
  const [statusNotes, setStatusNotes] = React.useState('');
  const [reviewNotes, setReviewNotes] = React.useState('');
  const [actionDescription, setActionDescription] = React.useState('');
  const [actionAssignee, setActionAssignee] = React.useState<SearchOption[]>([]);
  const [actionFrequency, setActionFrequency] = React.useState('once');
  const [actionDueDate, setActionDueDate] = React.useState('');
  const [progressNote, setProgressNote] = React.useState('');
  const [error, setError] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const populateForm = React.useCallback((detail: PastoralInterventionDetail) => {
    setPlanType(detail.intervention_type);
    setContinuumLevel(String(detail.continuum_level));
    setReviewCycleWeeks(String(detail.review_cycle_weeks));
    setParentInformed(detail.parent_informed);
    setParentConsented(
      detail.parent_consented === null ? 'unknown' : detail.parent_consented ? 'yes' : 'no',
    );
    setParentInput(detail.parent_input ?? '');
    setStudentVoice(detail.student_voice ?? '');
    setOutcomes(
      Array.isArray(detail.target_outcomes) && detail.target_outcomes.length > 0
        ? detail.target_outcomes
        : [{ description: '', measurable_target: '' }],
    );
  }, []);

  const refresh = React.useCallback(async () => {
    const [detailResponse, typeResponse] = await Promise.all([
      apiClient<PastoralApiDetailResponse<PastoralInterventionDetail>>(
        `/api/v1/pastoral/interventions/${interventionId}`,
        { silent: true },
      ),
      apiClient<InterventionTypeOption[]>('/api/v1/pastoral/settings/intervention-types', {
        silent: true,
      }),
    ]);

    setIntervention(detailResponse.data);
    populateForm(detailResponse.data);
    setTypes(typeResponse ?? []);
  }, [interventionId, populateForm]);

  React.useEffect(() => {
    void refresh().catch(() => {
      setIntervention(null);
    });
  }, [refresh]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setError('');
    setBusyAction(key);

    try {
      await action();
      await refresh();
      setStatusTarget('none');
      setStatusNotes('');
      setReviewNotes('');
      setActionDescription('');
      setActionAssignee([]);
      setActionFrequency('once');
      setActionDueDate('');
      setProgressNote('');
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setBusyAction(null);
    }
  };

  const updateOutcome = (
    index: number,
    field: keyof PastoralInterventionTargetOutcome,
    value: string,
  ) => {
    setOutcomes((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    );
  };

  if (!intervention) {
    return (
      <div className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
        {t('notFound')}
      </div>
    );
  }

  const currentStatus = normalizeInterventionStatus(intervention.status);
  const editable = currentStatus === 'active';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', { student: formatStudentName(intervention.student) })}
        description={t('description', {
          caseNumber: intervention.case?.case_number ?? intervention.case_id,
        })}
        actions={
          intervention.case ? (
            <Link href={`/${locale}/pastoral/cases/${intervention.case.id}`}>
              <Button variant="outline">{t('openCase')}</Button>
            </Link>
          ) : null
        }
      />

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PastoralInterventionStatusBadge status={currentStatus} />
          <PastoralTierBadge tier={intervention.continuum_level} />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('student')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {formatStudentName(intervention.student) || sharedT('notAvailable')}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('interventionType')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {t(`types.${intervention.intervention_type}` as never)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('nextReview')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {formatDate(intervention.next_review_date)}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('created')}
            </p>
            <p className="mt-2 text-base font-semibold text-text-primary">
              {formatDateTime(intervention.created_at)}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('planSection')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('planDescription')}</p>
              </div>
              {!editable ? <p className="text-sm text-text-tertiary">{t('readOnly')}</p> : null}
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('fields.type')}</Label>
                  <Select
                    value={planType || 'none'}
                    onValueChange={(value) => setPlanType(value === 'none' ? '' : value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('fields.noType')}</SelectItem>
                      {types
                        .filter((item) => item.active)
                        .map((item) => (
                          <SelectItem key={item.key} value={item.key}>
                            {item.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('fields.continuumLevel')}</Label>
                  <Select value={continuumLevel} onValueChange={setContinuumLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3].map((level) => (
                        <SelectItem key={level} value={String(level)}>
                          {t(`continuum.level${level}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="review_cycle_weeks">{t('fields.reviewCycle')}</Label>
                  <Input
                    id="review_cycle_weeks"
                    type="number"
                    min={1}
                    value={reviewCycleWeeks}
                    onChange={(event) => setReviewCycleWeeks(event.target.value)}
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                <input
                  type="checkbox"
                  checked={parentInformed}
                  onChange={(event) => setParentInformed(event.target.checked)}
                  className="h-4 w-4 rounded border-border text-emerald-600"
                />
                <span className="text-sm text-text-primary">{t('fields.parentInformed')}</span>
              </label>

              <div className="space-y-2">
                <Label>{t('fields.parentConsented')}</Label>
                <Select value={parentConsented} onValueChange={setParentConsented}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unknown">{sharedT('notRecorded')}</SelectItem>
                    <SelectItem value="yes">{t('consent.yes')}</SelectItem>
                    <SelectItem value="no">{t('consent.no')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_input">{t('fields.parentInput')}</Label>
                <Textarea
                  id="parent_input"
                  value={parentInput}
                  onChange={(event) => setParentInput(event.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student_voice">{t('fields.studentVoice')}</Label>
                <Textarea
                  id="student_voice"
                  value={studentVoice}
                  onChange={(event) => setStudentVoice(event.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <Label>{t('fields.outcomes')}</Label>
                  {editable ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setOutcomes((current) => [
                          ...current,
                          { description: '', measurable_target: '' },
                        ])
                      }
                    >
                      <Plus className="me-2 h-4 w-4" />
                      {t('addOutcome')}
                    </Button>
                  ) : null}
                </div>

                {outcomes.map((outcome, index) => (
                  <div
                    key={index}
                    className="rounded-2xl border border-border bg-surface-secondary/60 p-4"
                  >
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <div className="space-y-2">
                        <Label>{t('fields.outcomeDescription')}</Label>
                        <Textarea
                          value={outcome.description}
                          onChange={(event) =>
                            updateOutcome(index, 'description', event.target.value)
                          }
                          rows={3}
                          readOnly={!editable}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('fields.outcomeTarget')}</Label>
                        <Textarea
                          value={outcome.measurable_target}
                          onChange={(event) =>
                            updateOutcome(index, 'measurable_target', event.target.value)
                          }
                          rows={3}
                          readOnly={!editable}
                        />
                      </div>
                      {editable ? (
                        <div className="flex items-start justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={outcomes.length === 1}
                            onClick={() =>
                              setOutcomes((current) =>
                                current.filter((_, itemIndex) => itemIndex !== index),
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={!editable || busyAction === 'save-plan'}
                  onClick={() =>
                    void runAction('save-plan', async () => {
                      await apiClient(`/api/v1/pastoral/interventions/${intervention.id}`, {
                        method: 'PATCH',
                        body: JSON.stringify({
                          intervention_type: planType,
                          continuum_level: Number(continuumLevel),
                          review_cycle_weeks: Number(reviewCycleWeeks),
                          parent_informed: parentInformed,
                          parent_consented:
                            parentConsented === 'unknown' ? null : parentConsented === 'yes',
                          parent_input: parentInput.trim() || undefined,
                          student_voice: studentVoice.trim() || undefined,
                          target_outcomes: outcomes.filter(
                            (item) =>
                              item.description.trim().length > 0 &&
                              item.measurable_target.trim().length > 0,
                          ),
                        }),
                        silent: true,
                      });
                    })
                  }
                >
                  <Save className="me-2 h-4 w-4" />
                  {t('savePlan')}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('actionsSection')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('actionsDescription')}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {intervention.actions.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('noActions')}
                </p>
              ) : (
                intervention.actions.map((action) => (
                  <div key={action.id} className="rounded-2xl border border-border px-4 py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {action.description}
                        </p>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {t('actionMeta', {
                            due: action.due_date
                              ? formatDate(action.due_date)
                              : sharedT('notRecorded'),
                            frequency: t(`frequency.${action.frequency ?? 'once'}` as never),
                          })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <PastoralActionStatusBadge status={normalizeActionStatus(action.status)} />
                        {normalizeActionStatus(action.status) !== 'completed' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={busyAction === `complete-action-${action.id}`}
                            onClick={() =>
                              void runAction(`complete-action-${action.id}`, async () => {
                                await apiClient(
                                  `/api/v1/pastoral/intervention-actions/${action.id}/complete`,
                                  {
                                    method: 'PATCH',
                                    silent: true,
                                  },
                                );
                              })
                            }
                          >
                            {t('completeAction')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface-secondary/60 p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="action_description">{t('fields.actionDescription')}</Label>
                  <Textarea
                    id="action_description"
                    value={actionDescription}
                    onChange={(event) => setActionDescription(event.target.value)}
                    rows={3}
                    placeholder={t('fields.actionDescriptionPlaceholder')}
                  />
                </div>

                <SearchPicker
                  label={t('fields.actionOwner')}
                  placeholder={t('fields.actionOwnerPlaceholder')}
                  search={searchStaff}
                  selected={actionAssignee}
                  onChange={(next) => setActionAssignee(next.slice(0, 1))}
                  multiple={false}
                  emptyText={sharedT('noStaff')}
                  minSearchLengthText={sharedT('minSearchLength')}
                />

                <div className="space-y-2">
                  <Label>{t('fields.actionFrequency')}</Label>
                  <Select value={actionFrequency} onValueChange={setActionFrequency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_FREQUENCIES.map((frequency) => (
                        <SelectItem key={frequency} value={frequency}>
                          {t(`frequency.${frequency}` as never)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="action_due_date">{t('fields.actionDueDate')}</Label>
                  <Input
                    id="action_due_date"
                    type="date"
                    value={actionDueDate}
                    onChange={(event) => setActionDueDate(event.target.value)}
                  />
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  disabled={
                    !editable ||
                    !actionDescription.trim() ||
                    !actionAssignee[0] ||
                    !actionDueDate ||
                    busyAction === 'create-action'
                  }
                  onClick={() =>
                    void runAction('create-action', async () => {
                      await apiClient(`/api/v1/pastoral/interventions/${intervention.id}/actions`, {
                        method: 'POST',
                        body: JSON.stringify({
                          intervention_id: intervention.id,
                          description: actionDescription.trim(),
                          assigned_to_user_id: actionAssignee[0]?.id,
                          frequency: actionFrequency,
                          start_date: new Date().toISOString().slice(0, 10),
                          due_date: actionDueDate,
                        }),
                        silent: true,
                      });
                    })
                  }
                >
                  {t('createAction')}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('progressSection')}</h2>
            <div className="mt-4 space-y-3">
              {intervention.recent_progress.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('noProgress')}
                </p>
              ) : (
                intervention.recent_progress.map((note) => (
                  <div key={note.id} className="rounded-2xl border border-border px-4 py-4">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-text-primary">
                      {note.note}
                    </p>
                    <p className="mt-2 text-xs text-text-tertiary">
                      {formatDateTime(note.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-surface-secondary/60 p-4">
              <div className="space-y-2">
                <Label htmlFor="progress_note">{t('fields.progressNote')}</Label>
                <Textarea
                  id="progress_note"
                  value={progressNote}
                  onChange={(event) => setProgressNote(event.target.value)}
                  rows={4}
                  placeholder={t('fields.progressNotePlaceholder')}
                />
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  type="button"
                  disabled={!progressNote.trim() || busyAction === 'progress'}
                  onClick={() =>
                    void runAction('progress', async () => {
                      await apiClient(
                        `/api/v1/pastoral/interventions/${intervention.id}/progress`,
                        {
                          method: 'POST',
                          body: JSON.stringify({ note: progressNote.trim() }),
                          silent: true,
                        },
                      );
                    })
                  }
                >
                  {t('addProgress')}
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
                    {TERMINAL_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {t(`status.${status}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status_notes">{t('fields.statusNotes')}</Label>
                <Textarea
                  id="status_notes"
                  value={statusNotes}
                  onChange={(event) => setStatusNotes(event.target.value)}
                  rows={4}
                  placeholder={t('fields.statusNotesPlaceholder')}
                />
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={
                  !editable ||
                  statusTarget === 'none' ||
                  !statusNotes.trim() ||
                  busyAction === 'status'
                }
                onClick={() =>
                  void runAction('status', async () => {
                    await apiClient(`/api/v1/pastoral/interventions/${intervention.id}/status`, {
                      method: 'PATCH',
                      body: JSON.stringify({
                        status: statusTarget,
                        outcome_notes: statusNotes.trim(),
                      }),
                      silent: true,
                    });
                  })
                }
              >
                {t('changeStatus')}
              </Button>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('reviewSection')}</h2>
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="review_notes">{t('fields.reviewNotes')}</Label>
                <Textarea
                  id="review_notes"
                  value={reviewNotes}
                  onChange={(event) => setReviewNotes(event.target.value)}
                  rows={4}
                  placeholder={t('fields.reviewNotesPlaceholder')}
                />
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={!editable || busyAction === 'review'}
                onClick={() =>
                  void runAction('review', async () => {
                    await apiClient(`/api/v1/pastoral/interventions/${intervention.id}/review`, {
                      method: 'POST',
                      body: JSON.stringify({
                        review_notes: reviewNotes.trim() || undefined,
                      }),
                      silent: true,
                    });
                  })
                }
              >
                {t('recordReview')}
              </Button>
            </div>
          </section>

          {error ? (
            <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {error}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
