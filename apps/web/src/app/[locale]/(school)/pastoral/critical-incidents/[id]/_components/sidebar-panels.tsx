'use client';

import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import type {
  PastoralCriticalIncidentAffectedPerson,
  PastoralCriticalIncidentAffectedSummary,
  SearchOption,
} from '@/lib/pastoral';
import {
  formatStaffProfileName,
  formatStudentName,
  normalizeCriticalIncidentImpactLevel,
  searchStaffProfiles,
  searchStudents,
} from '@/lib/pastoral';

// ─── Status Panel ─────────────────────────────────────────────────────────────

interface StatusPanelProps {
  incidentId: string;
  normalizedStatus: string;
  availableStatusTargets: string[];
  busyAction: string | null;
  onRunAction: (key: string, action: () => Promise<void>) => void;
}

export function StatusPanel({
  incidentId,
  normalizedStatus: _normalizedStatus,
  availableStatusTargets,
  busyAction,
  onRunAction,
}: StatusPanelProps) {
  const t = useTranslations('pastoral.criticalIncidentDetail');

  const [statusTarget, setStatusTarget] = React.useState('none');
  const [statusReason, setStatusReason] = React.useState('');
  const [closureNotes, setClosureNotes] = React.useState('');

  return (
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
            void onRunAction('change-status', async () => {
              await apiClient(`/api/v1/pastoral/critical-incidents/${incidentId}/status`, {
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
  );
}

// ─── Affected Summary Panel ───────────────────────────────────────────────────

interface AffectedSummaryPanelProps {
  summary: PastoralCriticalIncidentAffectedSummary | null;
}

export function AffectedSummaryPanel({ summary }: AffectedSummaryPanelProps) {
  const t = useTranslations('pastoral.criticalIncidentDetail');

  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold text-text-primary">{t('affectedSummarySection')}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
            {t('summary.students')}
          </p>
          <p className="mt-2 text-xl font-semibold text-text-primary">
            {summary?.total_students ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
            {t('summary.staff')}
          </p>
          <p className="mt-2 text-xl font-semibold text-text-primary">
            {summary?.total_staff ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
            {t('summary.direct')}
          </p>
          <p className="mt-2 text-xl font-semibold text-text-primary">
            {summary?.directly_affected_count ?? 0}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
            {t('summary.supportPending')}
          </p>
          <p className="mt-2 text-xl font-semibold text-text-primary">
            {summary?.support_pending_count ?? 0}
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Affected People Panel ────────────────────────────────────────────────────

interface AffectedPeoplePanelProps {
  incidentId: string;
  affectedPeople: PastoralCriticalIncidentAffectedPerson[];
  affectedEdits: Record<
    string,
    { impact: 'directly_affected' | 'indirectly_affected'; notes: string }
  >;
  onAffectedEditsChange: React.Dispatch<
    React.SetStateAction<
      Record<string, { impact: 'directly_affected' | 'indirectly_affected'; notes: string }>
    >
  >;
  existingStudentIds: string[];
  existingStaffProfileIds: string[];
  busyAction: string | null;
  onRunAction: (key: string, action: () => Promise<void>) => void;
}

export function AffectedPeoplePanel({
  incidentId,
  affectedPeople,
  affectedEdits,
  onAffectedEditsChange,
  existingStudentIds,
  existingStaffProfileIds,
  busyAction,
  onRunAction,
}: AffectedPeoplePanelProps) {
  const t = useTranslations('pastoral.criticalIncidentDetail');
  const sharedT = useTranslations('pastoral.shared');

  const [personType, setPersonType] = React.useState<'student' | 'staff'>('student');
  const [studentSelection, setStudentSelection] = React.useState<SearchOption[]>([]);
  const [staffSelection, setStaffSelection] = React.useState<SearchOption[]>([]);
  const [impactLevel, setImpactLevel] = React.useState<'directly_affected' | 'indirectly_affected'>(
    'directly_affected',
  );
  const [affectedNotes, setAffectedNotes] = React.useState('');

  const buildAffectedName = React.useCallback(
    (person: PastoralCriticalIncidentAffectedPerson) => {
      if (person.affected_type === 'student') {
        return formatStudentName(person.student) || sharedT('notAvailable');
      }
      const name = formatStaffProfileName(person.staff_profile);
      if (name) return name;
      return t('staffFallback', {
        id: person.staff_profile?.id.slice(0, 8).toUpperCase() ?? sharedT('notAvailable'),
      });
    },
    [sharedT, t],
  );

  return (
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
                        {' \u00B7 '}
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
                        onAffectedEditsChange((current) => ({
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
                        onAffectedEditsChange((current) => ({
                          ...current,
                          [person.id]: { ...edit, notes: event.target.value },
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
                        void onRunAction(`save-affected-${person.id}`, async () => {
                          await apiClient(
                            `/api/v1/pastoral/critical-incidents/${incidentId}/affected/${person.id}`,
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
                          if (!notes?.trim()) return;
                          void onRunAction(`support-${person.id}`, async () => {
                            await apiClient(
                              `/api/v1/pastoral/critical-incidents/${incidentId}/affected/${person.id}/support`,
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
                        if (!reason?.trim()) return;
                        void onRunAction(`remove-${person.id}`, async () => {
                          await apiClient(
                            `/api/v1/pastoral/critical-incidents/${incidentId}/affected/${person.id}`,
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
                <SelectItem value="directly_affected">{t('impact.directly_affected')}</SelectItem>
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
              void onRunAction('add-affected', async () => {
                await apiClient(`/api/v1/pastoral/critical-incidents/${incidentId}/affected`, {
                  method: 'POST',
                  body: JSON.stringify({
                    person_type: personType,
                    student_id: personType === 'student' ? studentSelection[0]?.id : undefined,
                    staff_id: personType === 'staff' ? staffSelection[0]?.id : undefined,
                    impact_level: impactLevel,
                    notes: affectedNotes.trim() || undefined,
                  }),
                  silent: true,
                });

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
  );
}

// ─── Operating Context Panel ──────────────────────────────────────────────────

export function OperatingContextPanel() {
  const t = useTranslations('pastoral.criticalIncidentDetail');

  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold text-text-primary">{t('operatingContext')}</h2>
      <div className="mt-4 space-y-3 text-sm text-text-secondary">
        <p>{t('context.visibility')}</p>
        <p>{t('context.workflow')}</p>
        <p>{t('context.childProtection')}</p>
      </div>
    </section>
  );
}
