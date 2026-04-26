'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  eventDriversSchema,
  runEventEngine,
  type EventDrivers,
  type EventEngineOutputs,
} from '@school/shared/budgeting';
import { Badge, Skeleton, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { useTenantCurrency } from '../../../_components/use-tenant-currency';

import { EventActionsFooter } from './_components/event-actions-footer';
import { EventDriverInputs, type EventEditableShape } from './_components/event-driver-inputs';
import { EventOutputCard } from './_components/event-output-card';
import { EventScenarioChips } from './_components/event-scenario-chips';
import type { EventBudgetDetail } from './_components/event-types';
import { PerHouseholdBreakdown } from './_components/per-household-breakdown';

const SAVE_DEBOUNCE_MS = 500;

const editableSchema = z.object({
  drivers: eventDriversSchema,
  participant_count: z.number().int().min(0),
  household_share_pct: z.number().min(0).max(100),
});

interface Props {
  params: { locale: string; id: string };
}

/**
 * Deep-merge an event scenario's driver overrides on top of the base.
 * Nested sections (transport / tickets / etc.) merge their own keys
 * on top of the base section so a partial override doesn't blank out
 * fields the user didn't touch. `@school/shared/budgeting` only ships
 * a `mergeDriverOverrides` for the annual-model engine; the event
 * engine's overrides are simpler so this lives client-side for now.
 */
function mergeEventOverrides(base: EventDrivers, overrides: Partial<EventDrivers>): EventDrivers {
  const merged: EventDrivers = { ...base };
  for (const k of Object.keys(overrides) as Array<keyof EventDrivers>) {
    const ov = overrides[k];
    if (ov === undefined) continue;
    const baseV = base[k];
    if (
      ov &&
      typeof ov === 'object' &&
      !Array.isArray(ov) &&
      baseV &&
      typeof baseV === 'object' &&
      !Array.isArray(baseV)
    ) {
      (merged as Record<string, unknown>)[k as string] = { ...baseV, ...ov };
    } else {
      (merged as Record<string, unknown>)[k as string] = ov;
    }
  }
  return merged;
}

/**
 * Drop driver subsections whose primary numeric fields are null/undefined.
 * The form fields for transport / tickets / food / accommodation / chaperones
 * always register sub-objects so React Hook Form has a stable shape, but the
 * Zod schema treats those subsections as `.optional()` requiring all-or-none
 * fields. Sending `{ unit_cost: null, units: null }` 400s; sending `undefined`
 * matches the schema and persists cleanly.
 */
function sanitizeEventDriversForSave(drivers: EventDrivers): EventDrivers {
  // React Hook Form fields registered with `valueAsNumber: true` return NaN
  // (not null) when the underlying <input type="number"> is empty — and NaN
  // doesn't equal null, undefined, or ''. JSON.stringify happens to render NaN
  // as `null` so dev-tool logs hide the difference. We treat NaN/null/undefined
  // /empty-string identically as "user didn't enter anything".
  const isEmptyValue = (val: unknown): boolean =>
    val === null ||
    val === undefined ||
    val === '' ||
    (typeof val === 'number' && Number.isNaN(val));
  const isEmptyNumberPair = (v: unknown): boolean => {
    if (!v || typeof v !== 'object') return true;
    const entries = Object.entries(v as Record<string, unknown>).filter(([k]) => k !== 'notes');
    return entries.every(([, val]) => isEmptyValue(val));
  };
  const out: EventDrivers = { ...drivers };
  for (const key of [
    'transport',
    'entry_tickets',
    'food',
    'accommodation',
    'chaperones',
  ] as const) {
    if (isEmptyNumberPair(out[key])) {
      delete (out as Record<string, unknown>)[key];
    }
  }
  // equipment_hire is `{ items: [] }` per schema. Drop the section when its
  // items array is empty so the auto-save payload matches the server's sparse
  // representation (otherwise the form is permanently "dirty" against a server
  // that stores no equipment_hire).
  const eh = out.equipment_hire as { items?: unknown } | undefined;
  if (!eh || !Array.isArray(eh.items) || eh.items.length === 0) {
    delete (out as Record<string, unknown>).equipment_hire;
  }
  return out;
}

export default function EventBudgetWorkspacePage({ params }: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.workspace');
  const tStatus = useTranslations('financeBudgetingEventBudgets.status');
  const router = useRouter();
  const currencyCode = useTenantCurrency();
  const locale = params.locale ?? 'en';
  const eventId = params.id;

  const [event, setEvent] = React.useState<EventBudgetDetail | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(true);
  const [isSaving, setIsSaving] = React.useState<boolean>(false);
  const [isDirty, setIsDirty] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  const form = useForm<EventEditableShape>({
    resolver: zodResolver(editableSchema),
    defaultValues: {
      drivers: eventDriversSchema.parse({}),
      participant_count: 0,
      household_share_pct: 100,
    },
    mode: 'onChange',
  });

  // ─── Load + reset form ────────────────────────────────────────────────

  const reload = React.useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient<EventBudgetDetail>(`/api/v1/budgeting/event-budgets/${eventId}`);
      setEvent(res);
      form.reset({
        drivers: res.drivers,
        participant_count: res.participant_count,
        household_share_pct: res.household_share_pct,
      });
      setIsDirty(false);
    } catch (err) {
      console.error('[EventWorkspace.load]', err);
      const status = (err as { status?: number; statusCode?: number }).status;
      if (status === 404) {
        toast.error(t('notFound'));
        router.replace(`/${locale}/finance/budgeting/events`);
        return;
      }
      setError(err instanceof Error ? err.message : t('loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, locale, router, t, form]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  // ─── Watch form for dirty state + auto-save ───────────────────────────

  const watched = form.watch();
  // Compare the SANITIZED form against the server's stored drivers. Without
  // this, fields registered with `valueAsNumber: true` produce NaN for empty
  // inputs which never equals the server's "undefined" / sparse drivers — so
  // the form was permanently dirty and the auto-save effect ran in a loop.
  // Sanitizing both sides matches the shape the server actually persists.
  const watchedDriversKey = JSON.stringify(sanitizeEventDriversForSave(watched.drivers));
  const watchedParticipants = watched.participant_count;
  const watchedShare = watched.household_share_pct;

  const canEdit = event?.status === 'draft' && selectedScenarioId === null;

  React.useEffect(() => {
    if (!event || !canEdit) return;
    const serverKey = JSON.stringify(sanitizeEventDriversForSave(event.drivers));
    const same =
      serverKey === watchedDriversKey &&
      event.participant_count === watchedParticipants &&
      event.household_share_pct === watchedShare;
    setIsDirty(!same);
  }, [event, canEdit, watchedDriversKey, watchedParticipants, watchedShare]);

  const persist = React.useCallback(async (): Promise<void> => {
    if (!event || !canEdit) return;
    const values = form.getValues();
    // The driver-input fields register transport / entry_tickets / food /
    // accommodation / chaperones / equipment_hire as sub-objects with numeric
    // inputs. When the user hasn't filled a section, those numeric inputs
    // come back as null and Zod (`unit_cost: z.number()`) rejects the PATCH
    // with 400. Strip any section whose required fields are all null/undefined
    // so the server only validates sections the user actually populated.
    const cleanedDrivers = sanitizeEventDriversForSave(values.drivers);
    setIsSaving(true);
    try {
      await apiClient(`/api/v1/budgeting/event-budgets/${eventId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          drivers: cleanedDrivers,
          participant_count: values.participant_count,
          household_share_pct: values.household_share_pct,
        }),
      });
      // Reload so server-computed output (per-household breakdown,
      // engine output) reflects the saved state.
      await reload();
    } catch (err) {
      console.error('[EventWorkspace.save]', err);
      toast.error(t('saveFailed'));
    } finally {
      setIsSaving(false);
    }
  }, [event, canEdit, form, eventId, reload, t]);

  React.useEffect(() => {
    if (!isDirty || !canEdit) return;
    const handle = setTimeout(() => {
      void persist();
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [isDirty, canEdit, persist]);

  // ─── Live engine recompute (no IO) ────────────────────────────────────

  const liveOutput: EventEngineOutputs = React.useMemo(() => {
    if (!event) {
      return runEventEngine({
        drivers: eventDriversSchema.parse({}),
        participant_count: 0,
        household_count: 0,
        household_share_pct: 100,
      });
    }
    const baseDrivers = watched.drivers;
    const drivers =
      selectedScenarioId === null
        ? baseDrivers
        : mergeEventOverrides(
            baseDrivers,
            event.scenarios.find((s) => s.scenario.id === selectedScenarioId)?.scenario
              .driver_overrides ?? {},
          );
    return runEventEngine({
      drivers,
      participant_count: watched.participant_count,
      household_count: event.per_household_breakdown.length || 0,
      household_share_pct: watched.household_share_pct,
    });
    // We deliberately re-run on every key change (cheap pure-TS engine).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, selectedScenarioId, watchedDriversKey, watchedParticipants, watchedShare]);

  // ─── State transition handlers ────────────────────────────────────────

  const transition = React.useCallback(
    async (action: 'confirm' | 'cancel' | 'complete' | 'mark-school-funded'): Promise<void> => {
      try {
        await apiClient(`/api/v1/budgeting/event-budgets/${eventId}/${action}`, {
          method: 'POST',
        });
        toast.success(t(`actions.${action}Success`));
        await reload();
      } catch (err) {
        console.error(`[EventWorkspace.${action}]`, err);
        const apiErr = err as { error?: { code?: string; message?: string } };
        toast.error(apiErr.error?.message ?? t('actionFailed'));
      }
    },
    [eventId, reload, t],
  );

  const handleCreateScenario = React.useCallback(
    async (name: string): Promise<void> => {
      try {
        await apiClient(`/api/v1/budgeting/event-budgets/${eventId}/scenarios`, {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        await reload();
      } catch (err) {
        console.error('[EventWorkspace.createScenario]', err);
        toast.error(t('scenarioCreateFailed'));
      }
    },
    [eventId, reload, t],
  );

  // When user picks a scenario chip, swap the form's drivers + participant
  // count to reflect the merged view. Going back to base resets to the
  // stored event row.
  React.useEffect(() => {
    if (!event) return;
    if (selectedScenarioId === null) {
      form.reset(
        {
          drivers: event.drivers,
          participant_count: event.participant_count,
          household_share_pct: event.household_share_pct,
        },
        { keepDirty: false },
      );
      return;
    }
    const scen = event.scenarios.find((s) => s.scenario.id === selectedScenarioId);
    if (!scen) return;
    form.reset(
      {
        drivers: mergeEventOverrides(event.drivers, scen.scenario.driver_overrides),
        participant_count: event.participant_count,
        household_share_pct: event.household_share_pct,
      },
      { keepDirty: false },
    );
  }, [event, selectedScenarioId, form]);

  // ─── Render ────────────────────────────────────────────────────────────

  if (isLoading || !event) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-12 w-1/2" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  const householdCount = event.per_household_breakdown.length;
  const hasScope = event.class_id !== null || event.year_group_id !== null;

  return (
    <div className="flex min-w-0 flex-col gap-4 p-6 pb-10">
      <PageHeader
        title={event.name}
        description={t('headerDescription', {
          type: event.event_type,
          date: event.event_date ?? '—',
          participants: event.participant_count,
        })}
        back={{
          href: `/${locale}/finance/budgeting/events`,
          label: t('backToList'),
        }}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={badgeVariantForStatus(event.status)}>{tStatus(event.status)}</Badge>
            {isSaving && <span className="text-xs text-text-tertiary">{t('saving')}</span>}
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <EventDriverInputs
          form={form}
          canEdit={canEdit}
          storageKey={`event-budget:${eventId}:accordion`}
        />
        <EventOutputCard
          output={liveOutput}
          currencyCode={currencyCode}
          locale={locale}
          participantCount={watched.participant_count}
          householdCount={householdCount}
        />
      </div>

      <EventScenarioChips
        scenarios={event.scenarios}
        selectedScenarioId={selectedScenarioId}
        canEdit={event.status === 'draft'}
        onSelect={setSelectedScenarioId}
        onCreate={handleCreateScenario}
      />

      <PerHouseholdBreakdown
        rows={event.per_household_breakdown}
        currencyCode={currencyCode}
        locale={locale}
        hasScope={hasScope}
      />

      <EventActionsFooter
        status={event.status}
        householdSharePct={event.household_share_pct}
        feeGenerationRunId={event.fee_generation_run_id}
        isDirty={isDirty}
        isSaving={isSaving}
        canEdit={canEdit}
        canGenerateFees
        onSave={persist}
        onConfirm={() => transition('confirm')}
        onCancel={() => transition('cancel')}
        onComplete={() => transition('complete')}
        onMarkSchoolFunded={() => transition('mark-school-funded')}
        onGenerateFees={() =>
          router.push(`/${locale}/finance/budgeting/events/${eventId}/generate-fees`)
        }
        onExportPdf={() => {
          window.open(`/api/v1/budgeting/event-budgets/${eventId}/exports/pdf`, '_blank');
        }}
      />
    </div>
  );
}

function badgeVariantForStatus(
  status: EventBudgetDetail['status'],
): 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'draft':
      return 'secondary';
    case 'confirmed':
      return 'info';
    case 'fees_generated':
      return 'success';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    default:
      return 'default';
  }
}
