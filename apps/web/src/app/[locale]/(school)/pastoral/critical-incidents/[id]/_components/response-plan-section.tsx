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
import { ShieldPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import type {
  PastoralCriticalIncidentResponsePlan,
  PastoralCriticalIncidentResponsePlanProgress,
  SearchOption,
} from '@/lib/pastoral';
import { searchStaff } from '@/lib/pastoral';

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_PHASES = ['immediate', 'short_term', 'medium_term', 'long_term'] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ResponsePlanSectionProps {
  incidentId: string;
  responsePlan: PastoralCriticalIncidentResponsePlan;
  progress: PastoralCriticalIncidentResponsePlanProgress[];
  planNotes: Record<string, string>;
  onPlanNotesChange: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  busyAction: string | null;
  onRunAction: (key: string, action: () => Promise<void>) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ResponsePlanSection({
  incidentId,
  responsePlan,
  progress,
  planNotes,
  onPlanNotesChange,
  busyAction,
  onRunAction,
}: ResponsePlanSectionProps) {
  const t = useTranslations('pastoral.criticalIncidentDetail');
  const sharedT = useTranslations('pastoral.shared');

  const [newPlanPhase, setNewPlanPhase] = React.useState<(typeof PLAN_PHASES)[number]>('immediate');
  const [newPlanLabel, setNewPlanLabel] = React.useState('');
  const [newPlanDescription, setNewPlanDescription] = React.useState('');
  const [newPlanAssignee, setNewPlanAssignee] = React.useState<SearchOption[]>([]);

  return (
    <section className="rounded-3xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('responsePlanSection')}</h2>
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
                          <p className="text-sm font-medium text-text-primary">{item.label}</p>
                          {item.description ? (
                            <p className="mt-1 text-sm text-text-secondary">{item.description}</p>
                          ) : null}
                        </div>
                        <span className="text-xs text-text-tertiary">
                          {item.is_done ? t('completed') : t('pending')}
                        </span>
                      </div>

                      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="space-y-2">
                          <Label htmlFor={`plan-note-${item.id}`}>{t('fields.planNotes')}</Label>
                          <Textarea
                            id={`plan-note-${item.id}`}
                            value={planNotes[item.id] ?? ''}
                            onChange={(event) =>
                              onPlanNotesChange((current) => ({
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
                              void onRunAction(`save-plan-${item.id}`, async () => {
                                await apiClient(
                                  `/api/v1/pastoral/critical-incidents/${incidentId}/response-plan/items/${item.id}`,
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
                              void onRunAction(`toggle-plan-${item.id}`, async () => {
                                await apiClient(
                                  `/api/v1/pastoral/critical-incidents/${incidentId}/response-plan/items/${item.id}`,
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
              onValueChange={(value) => setNewPlanPhase(value as (typeof PLAN_PHASES)[number])}
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
              void onRunAction('add-plan-item', async () => {
                await apiClient(
                  `/api/v1/pastoral/critical-incidents/${incidentId}/response-plan/items`,
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
  );
}
