'use client';

import { Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  type AudienceDefinition,
  type AudienceLeaf,
  type AudienceProviderKey,
  isAudienceAndNode,
  isAudienceLeaf,
  isAudienceNotNode,
  isAudienceOrNode,
} from '@school/shared/inbox';
import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import type { ProviderInfo } from './types';

// ─── Audience Chip Builder ────────────────────────────────────────────────────
//
// Flat chip composer for audience definitions. The backend supports a full
// AND/OR/NOT tree (depth ≤ 5); this v1 UI edits a flat list of leaves joined
// by a single top-level operator (AND or OR), plus optional per-leaf NOT.
// Trees that exceed the flat shape show a "Complex definition" fallback.

type ChipOperator = 'and' | 'or';

export interface AudienceChip {
  id: string;
  negated: boolean;
  leaf: AudienceLeaf;
}

interface FlatAudience {
  operator: ChipOperator;
  chips: AudienceChip[];
}

function newChipId(): string {
  return `chip_${Math.random().toString(36).slice(2, 10)}`;
}

export function definitionToFlat(def: AudienceDefinition | null): FlatAudience | null {
  if (!def) return { operator: 'and', chips: [] };

  if (isAudienceLeaf(def)) {
    return {
      operator: 'and',
      chips: [{ id: newChipId(), negated: false, leaf: def }],
    };
  }

  if (isAudienceNotNode(def)) {
    if (isAudienceLeaf(def.operand)) {
      return {
        operator: 'and',
        chips: [{ id: newChipId(), negated: true, leaf: def.operand }],
      };
    }
    return null;
  }

  if (isAudienceAndNode(def) || isAudienceOrNode(def)) {
    const op: ChipOperator = isAudienceAndNode(def) ? 'and' : 'or';
    const chips: AudienceChip[] = [];
    for (const operand of def.operands) {
      if (isAudienceLeaf(operand)) {
        chips.push({ id: newChipId(), negated: false, leaf: operand });
        continue;
      }
      if (isAudienceNotNode(operand) && isAudienceLeaf(operand.operand)) {
        chips.push({ id: newChipId(), negated: true, leaf: operand.operand });
        continue;
      }
      return null;
    }
    return { operator: op, chips };
  }

  return null;
}

export function flatToDefinition(flat: FlatAudience): AudienceDefinition | null {
  if (flat.chips.length === 0) return null;

  const operands: AudienceDefinition[] = flat.chips.map((chip) =>
    chip.negated ? { operator: 'not', operand: chip.leaf } : chip.leaf,
  );

  if (operands.length === 1) {
    const only = operands[0];
    if (!only) return null;
    return only;
  }

  if (flat.operator === 'and') {
    return { operator: 'and', operands };
  }
  return { operator: 'or', operands };
}

interface AudienceChipBuilderProps {
  value: AudienceDefinition | null;
  onChange: (value: AudienceDefinition | null) => void;
  providers: ProviderInfo[];
  disabled?: boolean;
}

export function AudienceChipBuilder({
  value,
  onChange,
  providers,
  disabled = false,
}: AudienceChipBuilderProps) {
  const t = useTranslations('inbox.audiences.chipBuilder');

  const [flat, setFlat] = React.useState<FlatAudience>(
    () => definitionToFlat(value) ?? { operator: 'and', chips: [] },
  );
  const [tooComplex, setTooComplex] = React.useState<boolean>(() => {
    if (!value) return false;
    return definitionToFlat(value) === null;
  });

  const lastSyncedValueRef = React.useRef<AudienceDefinition | null>(value);
  React.useEffect(() => {
    if (value !== lastSyncedValueRef.current) {
      lastSyncedValueRef.current = value;
      const parsed = definitionToFlat(value);
      if (parsed === null) {
        setTooComplex(true);
        setFlat({ operator: 'and', chips: [] });
      } else {
        setTooComplex(false);
        setFlat(parsed);
      }
    }
  }, [value]);

  const emit = React.useCallback(
    (next: FlatAudience) => {
      setFlat(next);
      const asDef = flatToDefinition(next);
      lastSyncedValueRef.current = asDef;
      onChange(asDef);
    },
    [onChange],
  );

  const addChip = (providerKey: AudienceProviderKey) => {
    const next: FlatAudience = {
      operator: flat.operator,
      chips: [
        ...flat.chips,
        { id: newChipId(), negated: false, leaf: { provider: providerKey, params: {} } },
      ],
    };
    emit(next);
  };

  const updateChip = (chipId: string, patch: Partial<AudienceChip>) => {
    const next: FlatAudience = {
      operator: flat.operator,
      chips: flat.chips.map((c) => (c.id === chipId ? { ...c, ...patch } : c)),
    };
    emit(next);
  };

  const removeChip = (chipId: string) => {
    emit({ operator: flat.operator, chips: flat.chips.filter((c) => c.id !== chipId) });
  };

  const setOperator = (operator: ChipOperator) => {
    emit({ operator, chips: flat.chips });
  };

  if (tooComplex) {
    return (
      <div className="rounded-md border border-warning-fill bg-warning-fill/40 p-4 text-sm text-warning-text">
        <p className="font-medium">{t('complex.title')}</p>
        <p className="mt-1 text-xs">{t('complex.body')}</p>
      </div>
    );
  }

  const wiredProviders = providers.filter((p) => p.wired);

  return (
    <div className="space-y-4">
      {flat.chips.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs font-medium text-text-secondary">{t('operator.label')}</Label>
          <div className="flex gap-1 rounded-full border border-border bg-surface-secondary p-0.5">
            <button
              type="button"
              onClick={() => setOperator('and')}
              disabled={disabled}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                flat.operator === 'and'
                  ? 'bg-background text-text-primary shadow-sm'
                  : 'text-text-secondary'
              }`}
            >
              {t('operator.and')}
            </button>
            <button
              type="button"
              onClick={() => setOperator('or')}
              disabled={disabled}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                flat.operator === 'or'
                  ? 'bg-background text-text-primary shadow-sm'
                  : 'text-text-secondary'
              }`}
            >
              {t('operator.or')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {flat.chips.map((chip) => (
          <ChipRow
            key={chip.id}
            chip={chip}
            providers={providers}
            disabled={disabled}
            onChange={(patch) => updateChip(chip.id, patch)}
            onRemove={() => removeChip(chip.id)}
          />
        ))}

        {flat.chips.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-text-secondary">
            {t('empty')}
          </p>
        )}
      </div>

      <AddChipControl providers={wiredProviders} disabled={disabled} onAdd={addChip} />
    </div>
  );
}

interface ChipRowProps {
  chip: AudienceChip;
  providers: ProviderInfo[];
  disabled: boolean;
  onChange: (patch: Partial<AudienceChip>) => void;
  onRemove: () => void;
}

function ChipRow({ chip, providers, disabled, onChange, onRemove }: ChipRowProps) {
  const t = useTranslations('inbox.audiences.chipBuilder');
  const provider = providers.find((p) => p.key === chip.leaf.provider);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-secondary p-3 sm:flex-row sm:items-start">
      <div className="flex items-center gap-2">
        <Badge variant={chip.negated ? 'warning' : 'default'} className="shrink-0">
          {chip.negated ? t('negated') : t('included')}
        </Badge>
        <button
          type="button"
          onClick={() => onChange({ negated: !chip.negated })}
          disabled={disabled}
          className="text-xs font-medium text-primary-500 hover:underline disabled:opacity-50"
        >
          {chip.negated ? t('actions.unNegate') : t('actions.negate')}
        </button>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm font-medium text-text-primary">
          {provider?.display_name ?? chip.leaf.provider}
          {provider && !provider.wired && (
            <Badge variant="secondary" className="ms-2">
              {t('stub')}
            </Badge>
          )}
        </div>
        <ChipParamsEditor
          providerKey={chip.leaf.provider}
          params={chip.leaf.params ?? {}}
          disabled={disabled}
          onChange={(params) => onChange({ leaf: { provider: chip.leaf.provider, params } })}
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t('actions.remove')}
        className="shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface AddChipControlProps {
  providers: ProviderInfo[];
  disabled: boolean;
  onAdd: (providerKey: AudienceProviderKey) => void;
}

function AddChipControl({ providers, disabled, onAdd }: AddChipControlProps) {
  const t = useTranslations('inbox.audiences.chipBuilder');
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [selectedKey, setSelectedKey] = React.useState<AudienceProviderKey | ''>('');

  if (!pickerOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setPickerOpen(true)}
        disabled={disabled}
      >
        <Plus className="me-2 h-4 w-4" />
        {t('actions.add')}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-border p-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1 space-y-1">
        <Label htmlFor="audience-provider-select" className="text-xs font-medium">
          {t('addPicker.providerLabel')}
        </Label>
        <Select
          value={selectedKey}
          onValueChange={(v) => setSelectedKey(v as AudienceProviderKey)}
          disabled={disabled}
        >
          <SelectTrigger id="audience-provider-select">
            <SelectValue placeholder={t('addPicker.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setPickerOpen(false);
            setSelectedKey('');
          }}
          disabled={disabled}
        >
          {t('addPicker.cancel')}
        </Button>
        <Button
          type="button"
          onClick={() => {
            if (!selectedKey) return;
            onAdd(selectedKey);
            setPickerOpen(false);
            setSelectedKey('');
          }}
          disabled={disabled || !selectedKey}
        >
          {t('addPicker.confirm')}
        </Button>
      </div>
    </div>
  );
}

interface ChipParamsEditorProps {
  providerKey: AudienceProviderKey;
  params: Record<string, unknown>;
  disabled: boolean;
  onChange: (params: Record<string, unknown>) => void;
}

const NO_PARAM_PROVIDERS: AudienceProviderKey[] = ['school', 'parents_school', 'staff_all'];

const UUID_LIST_PROVIDERS: Record<string, string> = {
  year_group_parents: 'year_group_ids',
  class_parents: 'class_ids',
  section_parents: 'section_ids',
  household: 'household_ids',
  year_group_students: 'year_group_ids',
  class_students: 'class_ids',
  handpicked: 'user_ids',
};

const STRING_LIST_PROVIDERS: Record<string, string> = {
  staff_role: 'roles',
  department: 'departments',
};

function ChipParamsEditor({ providerKey, params, disabled, onChange }: ChipParamsEditorProps) {
  const t = useTranslations('inbox.audiences.chipBuilder.params');

  if (NO_PARAM_PROVIDERS.includes(providerKey)) {
    return <p className="text-xs text-text-secondary">{t('none')}</p>;
  }

  if (providerKey in UUID_LIST_PROVIDERS || providerKey in STRING_LIST_PROVIDERS) {
    const key =
      UUID_LIST_PROVIDERS[providerKey as keyof typeof UUID_LIST_PROVIDERS] ??
      STRING_LIST_PROVIDERS[providerKey as keyof typeof STRING_LIST_PROVIDERS];
    if (!key) return null;
    const current = Array.isArray(params[key]) ? (params[key] as string[]) : [];
    const value = current.join(', ');
    return (
      <div className="space-y-1">
        <Label htmlFor={`param-${providerKey}-${key}`} className="text-xs font-medium">
          {key}
        </Label>
        <Input
          id={`param-${providerKey}-${key}`}
          value={value}
          onChange={(e) => {
            const parts = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            onChange({ [key]: parts });
          }}
          placeholder={t('csvPlaceholder')}
          disabled={disabled}
          className="text-sm"
        />
        <p className="text-xs text-text-secondary">{t('csvHint')}</p>
      </div>
    );
  }

  if (providerKey === 'fees_in_arrears') {
    const minAmount =
      typeof params.min_overdue_amount === 'number' ? params.min_overdue_amount : '';
    const minDays = typeof params.min_overdue_days === 'number' ? params.min_overdue_days : '';
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs font-medium" htmlFor="fees-min-amount">
            {t('labels.minOverdueAmount')}
          </Label>
          <Input
            id="fees-min-amount"
            type="number"
            min={0}
            value={minAmount}
            onChange={(e) => {
              const num = e.target.value === '' ? undefined : Number(e.target.value);
              const next = { ...params };
              if (num === undefined || Number.isNaN(num)) delete next.min_overdue_amount;
              else next.min_overdue_amount = num;
              onChange(next);
            }}
            disabled={disabled}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium" htmlFor="fees-min-days">
            {t('labels.minOverdueDays')}
          </Label>
          <Input
            id="fees-min-days"
            type="number"
            min={0}
            value={minDays}
            onChange={(e) => {
              const num = e.target.value === '' ? undefined : Number(e.target.value);
              const next = { ...params };
              if (num === undefined || Number.isNaN(num)) delete next.min_overdue_days;
              else next.min_overdue_days = num;
              onChange(next);
            }}
            disabled={disabled}
            className="text-sm"
          />
        </div>
      </div>
    );
  }

  const json = JSON.stringify(params, null, 0);
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{t('labels.json')}</Label>
      <Input
        value={json}
        onChange={(e) => {
          try {
            const parsed: unknown = JSON.parse(e.target.value || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              onChange(parsed as Record<string, unknown>);
            }
          } catch (parseErr: unknown) {
            // In-progress typing — silently wait for valid JSON on the next keystroke.
            // Intentionally swallowed: the onChange input is rebound on every keystroke and
            // users routinely transit invalid intermediate JSON states (e.g. after a
            // keystroke but before closing a brace). Logging would spam the console.
            void parseErr;
          }
        }}
        disabled={disabled}
        className="font-mono text-xs"
      />
    </div>
  );
}
