'use client';

import { Loader2, Minus, Plus, Users } from 'lucide-react';
import * as React from 'react';

import {
  AUDIENCE_PROVIDER_KEYS,
  type AudienceDefinition,
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
  Switch,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

/**
 * AudienceChipBuilder — the custom-audience builder inside the broadcast
 * tab's audience picker. Stores a flat list of provider leaves (with
 * optional per-row NOT) joined by a single top-level AND / OR. Deeper
 * trees are outside v1 scope; users who need them can save groups and
 * reference them via `saved_group`.
 */

export interface BuilderRow {
  id: string;
  negate: boolean;
  provider: AudienceProviderKey;
  params: Record<string, unknown>;
}

interface ProviderMeta {
  key: AudienceProviderKey;
  display_name: string;
  wired: boolean;
}

interface Props {
  value: BuilderRow[];
  onChange: (rows: BuilderRow[]) => void;
  operator: 'and' | 'or';
  onOperatorChange: (op: 'and' | 'or') => void;
  totalCount: number | null;
  isCountLoading?: boolean;
}

export function buildAudienceFromRows(
  rows: BuilderRow[],
  operator: 'and' | 'or',
): AudienceDefinition | null {
  const leaves = rows
    .filter((r) => rowHasValidParams(r))
    .map<AudienceDefinition>((r) => {
      const leaf: AudienceDefinition = { provider: r.provider, params: r.params };
      return r.negate ? { operator: 'not', operand: leaf } : leaf;
    });
  if (leaves.length === 0) return null;
  const first = leaves[0];
  if (leaves.length === 1 || !first) return first ?? null;
  return { operator, operands: leaves };
}

export function rowsFromAudience(
  def: AudienceDefinition | null,
): { rows: BuilderRow[]; operator: 'and' | 'or' } | null {
  if (!def) return { rows: [], operator: 'and' };
  if (isAudienceLeaf(def)) {
    return {
      rows: [
        {
          id: cryptoRandomId(),
          negate: false,
          provider: def.provider,
          params: (def.params ?? {}) as Record<string, unknown>,
        },
      ],
      operator: 'and',
    };
  }
  if (isAudienceNotNode(def) && isAudienceLeaf(def.operand)) {
    return {
      rows: [
        {
          id: cryptoRandomId(),
          negate: true,
          provider: def.operand.provider,
          params: (def.operand.params ?? {}) as Record<string, unknown>,
        },
      ],
      operator: 'and',
    };
  }
  if (isAudienceAndNode(def) || isAudienceOrNode(def)) {
    const operator = def.operator;
    const rows: BuilderRow[] = [];
    for (const operand of def.operands) {
      if (isAudienceLeaf(operand)) {
        rows.push({
          id: cryptoRandomId(),
          negate: false,
          provider: operand.provider,
          params: (operand.params ?? {}) as Record<string, unknown>,
        });
      } else if (isAudienceNotNode(operand) && isAudienceLeaf(operand.operand)) {
        rows.push({
          id: cryptoRandomId(),
          negate: true,
          provider: operand.operand.provider,
          params: (operand.operand.params ?? {}) as Record<string, unknown>,
        });
      } else {
        return null;
      }
    }
    return { rows, operator };
  }
  return null;
}

export function AudienceChipBuilder({
  value,
  onChange,
  operator,
  onOperatorChange,
  totalCount,
  isCountLoading,
}: Props) {
  const [providers, setProviders] = React.useState<ProviderMeta[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoadingProviders(true);
    apiClient<{ providers: ProviderMeta[] }>('/api/v1/inbox/audiences/providers', {
      method: 'GET',
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        setProviders(res.providers ?? []);
      })
      .catch((err) => {
        console.error('[audience-chip-builder.providers]', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingProviders(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addRow = () => {
    const firstWired = providers.find((p) => p.wired) ?? providers[0];
    if (!firstWired) return;
    const next: BuilderRow = {
      id: cryptoRandomId(),
      negate: false,
      provider: firstWired.key,
      params: {},
    };
    onChange([...value, next]);
  };

  const updateRow = (id: string, patch: Partial<BuilderRow>) => {
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRow = (id: string) => onChange(value.filter((r) => r.id !== id));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-wide text-text-tertiary">
          Custom audience
        </Label>
        {value.length >= 2 && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-text-tertiary">Combine with</Label>
            <Select value={operator} onValueChange={(v) => onOperatorChange(v as 'and' | 'or')}>
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="and">AND</SelectItem>
                <SelectItem value="or">OR</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {value.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-4 text-center text-sm text-text-tertiary">
          No filters yet — add one to start targeting recipients.
        </div>
      ) : (
        <ul className="space-y-2">
          {value.map((row, idx) => (
            <li
              key={row.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 md:flex-row md:items-center"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={row.negate}
                    onCheckedChange={(checked) => updateRow(row.id, { negate: checked })}
                    aria-label="Negate filter"
                  />
                  <span className="text-xs text-text-tertiary">NOT</span>
                </div>
                <Select
                  value={row.provider}
                  onValueChange={(key) =>
                    updateRow(row.id, { provider: key as AudienceProviderKey, params: {} })
                  }
                  disabled={isLoadingProviders}
                >
                  <SelectTrigger className="w-full md:w-56">
                    <SelectValue placeholder="Pick a filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((p) => (
                      <SelectItem key={p.key} value={p.key} disabled={!p.wired}>
                        <span className="flex items-center gap-2">
                          {p.display_name}
                          {!p.wired && (
                            <Badge variant="secondary" className="text-[10px]">
                              Coming soon
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <ParamsEditor
                  provider={row.provider}
                  params={row.params}
                  onChange={(params) => updateRow(row.id, { params })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRow(row.id)}
                aria-label="Remove filter"
              >
                <Minus className="h-4 w-4" />
              </Button>
              {idx < value.length - 1 && (
                <div className="hidden text-xs font-semibold uppercase text-text-tertiary md:block">
                  {operator}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          disabled={isLoadingProviders || providers.length === 0}
        >
          <Plus className="me-1 h-4 w-4" />
          Add filter
        </Button>
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <Users className="h-3.5 w-3.5" />
          {isCountLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : totalCount === null ? (
            <span>Add a filter to preview</span>
          ) : (
            <span>
              ≈ <strong>{totalCount}</strong> recipient{totalCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ParamsEditor({
  provider,
  params,
  onChange,
}: {
  provider: AudienceProviderKey;
  params: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  if (PROVIDERS_WITHOUT_PARAMS.has(provider)) {
    return null;
  }
  if (provider === 'fees_in_arrears') {
    return (
      <div className="flex w-full items-center gap-2 md:w-auto">
        <Input
          type="number"
          min={0}
          placeholder="Min overdue (€)"
          value={(params.min_overdue_amount as number | undefined) ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({
              ...params,
              min_overdue_amount: raw === '' ? undefined : Number(raw),
            });
          }}
          className="w-full md:w-36"
        />
        <Input
          type="number"
          min={0}
          placeholder="Min days overdue"
          value={(params.min_overdue_days as number | undefined) ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({
              ...params,
              min_overdue_days: raw === '' ? undefined : Number(raw),
            });
          }}
          className="w-full md:w-36"
        />
      </div>
    );
  }
  const listKey = PROVIDER_LIST_KEY[provider];
  if (listKey) {
    const current = Array.isArray(params[listKey]) ? (params[listKey] as string[]).join(', ') : '';
    return (
      <Input
        placeholder="UUIDs, comma-separated"
        value={current}
        onChange={(e) => {
          const ids = e.target.value
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
          onChange({ ...params, [listKey]: ids });
        }}
        className="w-full md:w-64"
      />
    );
  }
  return null;
}

const PROVIDERS_WITHOUT_PARAMS = new Set<AudienceProviderKey>([
  'school',
  'parents_school',
  'staff_all',
]);

const PROVIDER_LIST_KEY: Partial<Record<AudienceProviderKey, string>> = {
  staff_role: 'roles',
  department: 'departments',
  year_group_parents: 'year_group_ids',
  class_parents: 'class_ids',
  section_parents: 'section_ids',
  household: 'household_ids',
  year_group_students: 'year_group_ids',
  class_students: 'class_ids',
  handpicked: 'user_ids',
};

function rowHasValidParams(row: BuilderRow): boolean {
  if (PROVIDERS_WITHOUT_PARAMS.has(row.provider)) return true;
  if (row.provider === 'fees_in_arrears') return true;
  const listKey = PROVIDER_LIST_KEY[row.provider];
  if (listKey) {
    const list = row.params[listKey];
    return Array.isArray(list) && list.length > 0;
  }
  return false;
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export { AUDIENCE_PROVIDER_KEYS };
