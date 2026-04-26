'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { Drivers } from '@school/shared/budgeting';
import {
  Button,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@school/ui';

interface Props {
  open: boolean;
  onClose: () => void;
  drivers: Drivers;
  onChange: (next: Drivers) => void;
  scenarioName: string | null; // null = base case
}

/**
 * Drivers drawer — slides in from the end edge (right LTR / left RTL via
 * Sheet's logical `side="end"`). Edits the working `drivers` object in
 * place via `onChange` callbacks; the workspace orchestrator owns the
 * debounced save.
 *
 * Coverage in v1: flat scalars (salary_uplift_pct, discount_capture_pct,
 * scholarship_capture_pct, utilities_inflation_pct, materials_inflation_pct,
 * donations_forecast, grants_forecast) plus capex item list management.
 * Per-year-group / per-department editing and per-year overrides are
 * tracked as v1.5 follow-ups.
 */
export function DriversDrawer({ open, onClose, drivers, onChange, scenarioName }: Props) {
  const t = useTranslations('financeBudgetingWorkspace.drawer');

  const update = (patch: Partial<Drivers>): void => {
    onChange({ ...drivers, ...patch });
  };

  const updateCapex = (nextItems: Drivers['capex_items']): void => {
    onChange({ ...drivers, capex_items: nextItems });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="end" className="flex w-full flex-col gap-4 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>
            {scenarioName === null
              ? t('editingBase')
              : t('editingScenario', { name: scenarioName })}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-6 overflow-y-auto">
          {/* Enrollment & fees */}
          <Section title={t('sections.enrollmentFees')}>
            <NumberField
              label={t('fields.discountCapture')}
              value={drivers.discount_capture_pct ?? 0}
              suffix="%"
              onChange={(v) => update({ discount_capture_pct: v })}
            />
            <NumberField
              label={t('fields.scholarshipCapture')}
              value={drivers.scholarship_capture_pct ?? 0}
              suffix="%"
              onChange={(v) => update({ scholarship_capture_pct: v })}
            />
          </Section>

          {/* Staff */}
          <Section title={t('sections.staff')}>
            <NumberField
              label={t('fields.salaryUplift')}
              value={drivers.salary_uplift_pct ?? 0}
              suffix="%"
              onChange={(v) => update({ salary_uplift_pct: v })}
            />
          </Section>

          {/* Operations */}
          <Section title={t('sections.operations')}>
            <NumberField
              label={t('fields.utilitiesInflation')}
              value={drivers.utilities_inflation_pct ?? 0}
              suffix="%"
              onChange={(v) => update({ utilities_inflation_pct: v })}
            />
            <NumberField
              label={t('fields.materialsInflation')}
              value={drivers.materials_inflation_pct ?? 0}
              suffix="%"
              onChange={(v) => update({ materials_inflation_pct: v })}
            />
          </Section>

          {/* Capital */}
          <Section title={t('sections.capital')}>
            <CapexEditor
              items={drivers.capex_items ?? []}
              onChange={updateCapex}
              labels={{
                empty: t('fields.capexEmpty'),
                add: t('fields.capexAdd'),
                name: t('fields.capexName'),
                amount: t('fields.capexAmount'),
                year: t('fields.capexFiscalYear'),
                notes: t('fields.capexNotes'),
              }}
            />
          </Section>

          {/* Other income */}
          <Section title={t('sections.otherIncome')}>
            <NumberField
              label={t('fields.donationsForecast')}
              value={drivers.donations_forecast ?? 0}
              onChange={(v) => update({ donations_forecast: v })}
            />
            <NumberField
              label={t('fields.grantsForecast')}
              value={drivers.grants_forecast ?? 0}
              onChange={(v) => update({ grants_forecast: v })}
            />
          </Section>
        </div>

        <Button onClick={onClose} variant="outline">
          {t('done')}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}

function NumberField({ label, value, suffix, onChange }: NumberFieldProps) {
  const [text, setText] = React.useState<string>(String(value));
  // Resync local text if external value changes (e.g., scenario switch).
  React.useEffect(() => {
    setText(String(value));
  }, [value]);

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const num = Number(raw);
            if (Number.isFinite(num)) onChange(num);
          }}
          className="font-mono"
        />
        {suffix && <span className="shrink-0 text-xs text-text-tertiary">{suffix}</span>}
      </div>
    </div>
  );
}

interface CapexEditorProps {
  items: Drivers['capex_items'];
  onChange: (next: Drivers['capex_items']) => void;
  labels: {
    empty: string;
    add: string;
    name: string;
    amount: string;
    year: string;
    notes: string;
  };
}

function CapexEditor({ items, onChange, labels }: CapexEditorProps) {
  const append = (): void => {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `capex-${Date.now()}`;
    onChange([...items, { id, name: '', fiscal_year: 1, amount: 0 }]);
  };

  const updateAt = (index: number, patch: Partial<Drivers['capex_items'][number]>): void => {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const removeAt = (index: number): void => {
    onChange(items.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && <p className="text-xs text-text-tertiary">{labels.empty}</p>}
      {items.map((it, idx) => (
        <div
          key={it.id}
          className="flex flex-col gap-2 rounded-lg border border-border bg-surface-secondary p-2"
        >
          <div className="flex items-center gap-2">
            <Input
              value={it.name}
              onChange={(e) => updateAt(idx, { name: e.target.value })}
              placeholder={labels.name}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeAt(idx)}
              className="shrink-0 rounded p-1 text-text-tertiary hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              value={it.amount}
              onChange={(e) => updateAt(idx, { amount: Number(e.target.value) })}
              placeholder={labels.amount}
              className="font-mono"
            />
            <Input
              type="number"
              min={1}
              max={5}
              value={it.fiscal_year}
              onChange={(e) => updateAt(idx, { fiscal_year: Math.max(1, Number(e.target.value)) })}
              placeholder={labels.year}
              className="font-mono"
            />
          </div>
          <Input
            value={it.notes ?? ''}
            onChange={(e) => updateAt(idx, { notes: e.target.value || undefined })}
            placeholder={labels.notes}
          />
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={append}>
        <Plus className="me-1 h-4 w-4" />
        {labels.add}
      </Button>
    </div>
  );
}
