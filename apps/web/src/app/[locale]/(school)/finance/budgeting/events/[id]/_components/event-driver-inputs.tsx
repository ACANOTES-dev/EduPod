'use client';

import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useFieldArray, type UseFormReturn } from 'react-hook-form';

import type { EventDrivers } from '@school/shared/budgeting';
import { Button, Input, Label, Textarea } from '@school/ui';

export interface EventEditableShape {
  drivers: EventDrivers;
  participant_count: number;
  household_share_pct: number;
}

interface Props {
  form: UseFormReturn<EventEditableShape>;
  canEdit: boolean;
  storageKey: string;
}

const SECTIONS = [
  'transport',
  'tickets',
  'food',
  'accommodation',
  'chaperones',
  'equipment',
  'contingency',
  'custom',
] as const;
type SectionKey = (typeof SECTIONS)[number];

export function EventDriverInputs({ form, canEdit, storageKey }: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.drivers');

  const [openSections, setOpenSections] = React.useState<Record<SectionKey, boolean>>(() =>
    readPersistedSections(storageKey),
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(openSections));
    } catch (err) {
      // UX-only persistence — quota / serialisation failures are
      // non-fatal but worth a console breadcrumb so silent breakage
      // surfaces in devtools.
      console.warn('[EventDriverInputs.persist]', err);
    }
  }, [openSections, storageKey]);

  const toggle = (key: SectionKey): void => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const equipmentArray = useFieldArray({
    control: form.control,
    name: 'drivers.equipment_hire.items',
  });
  const customArray = useFieldArray({
    control: form.control,
    name: 'drivers.custom_lines',
  });

  const drivers = form.watch('drivers');

  return (
    <div className="flex flex-col gap-3">
      {/* Transport */}
      <Section
        title={t('transport.label')}
        summary={summariseTransport(drivers, t)}
        open={openSections.transport}
        onToggle={() => toggle('transport')}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('transport.unitCost')}>
            <Input
              type="number"
              step="0.01"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.transport.unit_cost', { valueAsNumber: true })}
            />
          </Field>
          <Field label={t('transport.units')}>
            <Input
              type="number"
              step="1"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.transport.units', { valueAsNumber: true })}
            />
          </Field>
        </div>
        <Field label={t('transport.notes')}>
          <Textarea rows={2} disabled={!canEdit} {...form.register('drivers.transport.notes')} />
        </Field>
      </Section>

      {/* Tickets */}
      <Section
        title={t('tickets.label')}
        summary={summariseTickets(drivers, t)}
        open={openSections.tickets}
        onToggle={() => toggle('tickets')}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('tickets.perStudent')}>
            <Input
              type="number"
              step="0.01"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.entry_tickets.per_student_cost', {
                valueAsNumber: true,
              })}
            />
          </Field>
          <Field label={t('tickets.count')}>
            <Input
              type="number"
              step="1"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.entry_tickets.count', { valueAsNumber: true })}
            />
          </Field>
        </div>
      </Section>

      {/* Food */}
      <Section
        title={t('food.label')}
        summary={summariseFood(drivers, t)}
        open={openSections.food}
        onToggle={() => toggle('food')}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('food.perPerson')}>
            <Input
              type="number"
              step="0.01"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.food.per_person_cost', { valueAsNumber: true })}
            />
          </Field>
          <Field label={t('food.count')}>
            <Input
              type="number"
              step="1"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.food.count', { valueAsNumber: true })}
            />
          </Field>
        </div>
      </Section>

      {/* Accommodation */}
      <Section
        title={t('accommodation.label')}
        summary={summariseAccommodation(drivers, t)}
        open={openSections.accommodation}
        onToggle={() => toggle('accommodation')}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t('accommodation.perNight')}>
            <Input
              type="number"
              step="0.01"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.accommodation.per_night_cost', {
                valueAsNumber: true,
              })}
            />
          </Field>
          <Field label={t('accommodation.nights')}>
            <Input
              type="number"
              step="1"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.accommodation.nights', { valueAsNumber: true })}
            />
          </Field>
          <Field label={t('accommodation.count')}>
            <Input
              type="number"
              step="1"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.accommodation.count', { valueAsNumber: true })}
            />
          </Field>
        </div>
      </Section>

      {/* Chaperones */}
      <Section
        title={t('chaperones.label')}
        summary={summariseChaperones(drivers, t)}
        open={openSections.chaperones}
        onToggle={() => toggle('chaperones')}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('chaperones.count')}>
            <Input
              type="number"
              step="1"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.chaperones.count', { valueAsNumber: true })}
            />
          </Field>
          <Field label={t('chaperones.perChaperone')}>
            <Input
              type="number"
              step="0.01"
              min={0}
              disabled={!canEdit}
              {...form.register('drivers.chaperones.per_chaperone_cost', {
                valueAsNumber: true,
              })}
            />
          </Field>
        </div>
      </Section>

      {/* Equipment hire */}
      <Section
        title={t('equipment.label')}
        summary={t('equipment.summary', {
          count: drivers.equipment_hire?.items?.length ?? 0,
        })}
        open={openSections.equipment}
        onToggle={() => toggle('equipment')}
      >
        <ul className="flex flex-col gap-2">
          {equipmentArray.fields.map((field, idx) => (
            <li key={field.id} className="flex items-end gap-2">
              <Field label={t('equipment.itemName')} className="flex-1">
                <Input
                  type="text"
                  disabled={!canEdit}
                  {...form.register(`drivers.equipment_hire.items.${idx}.name`)}
                />
              </Field>
              <Field label={t('equipment.itemCost')} className="w-32">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  disabled={!canEdit}
                  {...form.register(`drivers.equipment_hire.items.${idx}.cost`, {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canEdit}
                onClick={() => equipmentArray.remove(idx)}
                title={t('equipment.remove')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canEdit}
          onClick={() => equipmentArray.append({ name: '', cost: 0 })}
        >
          <Plus className="me-1 h-4 w-4" aria-hidden="true" />
          {t('equipment.add')}
        </Button>
      </Section>

      {/* Contingency */}
      <Section
        title={t('contingency.label')}
        summary={t('contingency.summary', { pct: drivers.contingency_pct ?? 0 })}
        open={openSections.contingency}
        onToggle={() => toggle('contingency')}
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={30}
            step={0.5}
            disabled={!canEdit}
            value={drivers.contingency_pct ?? 0}
            onChange={(e) =>
              form.setValue('drivers.contingency_pct', Number(e.target.value), {
                shouldDirty: true,
              })
            }
            className="flex-1 accent-primary-600"
          />
          <Input
            type="number"
            step="0.5"
            min={0}
            max={30}
            disabled={!canEdit}
            className="w-20"
            {...form.register('drivers.contingency_pct', { valueAsNumber: true })}
          />
          <span className="text-sm text-text-tertiary">%</span>
        </div>
      </Section>

      {/* Custom lines */}
      <Section
        title={t('custom.label')}
        summary={t('custom.summary', { count: drivers.custom_lines?.length ?? 0 })}
        open={openSections.custom}
        onToggle={() => toggle('custom')}
      >
        <ul className="flex flex-col gap-2">
          {customArray.fields.map((field, idx) => (
            <li key={field.id} className="flex items-end gap-2">
              <Field label={t('custom.lineName')} className="flex-1">
                <Input
                  type="text"
                  disabled={!canEdit}
                  {...form.register(`drivers.custom_lines.${idx}.name`)}
                />
              </Field>
              <Field label={t('custom.amount')} className="w-32">
                <Input
                  type="number"
                  step="0.01"
                  disabled={!canEdit}
                  {...form.register(`drivers.custom_lines.${idx}.amount`, {
                    valueAsNumber: true,
                  })}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!canEdit}
                onClick={() => customArray.remove(idx)}
                title={t('custom.remove')}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canEdit}
          onClick={() => customArray.append({ name: '', amount: 0 })}
        >
          <Plus className="me-1 h-4 w-4" aria-hidden="true" />
          {t('custom.add')}
        </Button>
      </Section>
    </div>
  );
}

function readPersistedSections(storageKey: string): Record<SectionKey, boolean> {
  const fallback: Record<SectionKey, boolean> = {
    transport: true,
    tickets: false,
    food: false,
    accommodation: false,
    chaperones: false,
    equipment: false,
    contingency: false,
    custom: false,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Record<SectionKey, boolean>>;
    const merged: Record<SectionKey, boolean> = { ...fallback };
    for (const key of SECTIONS) {
      if (typeof parsed[key] === 'boolean') merged[key] = parsed[key]!;
    }
    return merged;
  } catch (err) {
    console.warn('[EventDriverInputs.read]', err);
    return fallback;
  }
}

function Section({
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  title: string;
  summary: string | null;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start"
        aria-expanded={open}
      >
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          {summary && <span className="mt-0.5 text-xs text-text-tertiary">{summary}</span>}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">{children}</div>
      )}
    </section>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ─── Section summaries ────────────────────────────────────────────────────

/**
 * Coerce `unknown` (which may be `null` / `undefined` / `NaN` because RHF
 * returns null for an unset numeric input registered with valueAsNumber) to a
 * finite number. Without this, the section subtitles render "NaN × NaN" or
 * "undefined × undefined" before the user has touched the fields.
 */
function n(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function summariseTransport(
  drivers: EventDrivers,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const transport = drivers.transport;
  if (!transport) return t('transport.empty');
  const unitCost = n(transport.unit_cost);
  const units = n(transport.units);
  if (unitCost === 0 && units === 0) return t('transport.empty');
  return `${unitCost} × ${units}`;
}

function summariseTickets(
  drivers: EventDrivers,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const tickets = drivers.entry_tickets;
  if (!tickets) return t('tickets.empty');
  const perStudent = n(tickets.per_student_cost);
  const count = n(tickets.count);
  if (perStudent === 0 && count === 0) return t('tickets.empty');
  return `${perStudent} × ${count}`;
}

function summariseFood(
  drivers: EventDrivers,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const food = drivers.food;
  if (!food) return t('food.empty');
  const perPerson = n(food.per_person_cost);
  const count = n(food.count);
  if (perPerson === 0 && count === 0) return t('food.empty');
  return `${perPerson} × ${count}`;
}

function summariseAccommodation(
  drivers: EventDrivers,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const a = drivers.accommodation;
  if (!a) return t('accommodation.empty');
  const perNight = n(a.per_night_cost);
  const nights = n(a.nights);
  const count = n(a.count);
  if (perNight === 0 && nights === 0 && count === 0) return t('accommodation.empty');
  return `${perNight} × ${nights}n × ${count}`;
}

function summariseChaperones(
  drivers: EventDrivers,
  t: ReturnType<typeof useTranslations>,
): string | null {
  const c = drivers.chaperones;
  if (!c) return t('chaperones.empty');
  const count = n(c.count);
  const perChaperone = n(c.per_chaperone_cost);
  if (count === 0 && perChaperone === 0) return t('chaperones.empty');
  return `${count} × ${perChaperone}`;
}
