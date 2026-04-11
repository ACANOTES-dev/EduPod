'use client';

import { Loader2, Save, Users } from 'lucide-react';
import * as React from 'react';

import type {
  AudienceDefinition,
  AudienceProviderKey,
  SavedAudienceKind,
} from '@school/shared/inbox';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
  cn,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import {
  AudienceChipBuilder,
  buildAudienceFromRows,
  rowsFromAudience,
  type BuilderRow,
} from './audience-chip-builder';

/**
 * AudiencePicker — three modes: Quick chip, Saved audience, Custom
 * builder. Emits an `AudienceDefinition` (plus `savedAudienceId` for
 * Mode B) that the compose form submits.
 */

export type AudiencePickerValue =
  | { mode: 'quick'; definition: AudienceDefinition }
  | { mode: 'saved'; savedAudienceId: string; definition: AudienceDefinition }
  | { mode: 'custom'; definition: AudienceDefinition | null };

interface Props {
  value: AudiencePickerValue | null;
  onChange: (value: AudiencePickerValue | null) => void;
  disabled?: boolean;
}

interface SavedAudienceRow {
  id: string;
  name: string;
  description: string | null;
  kind: SavedAudienceKind;
  last_resolved_count: number | null;
}

const QUICK_CHIPS: Array<{ id: string; label: string; provider: AudienceProviderKey }> = [
  { id: 'school', label: 'Whole school', provider: 'school' },
  { id: 'parents', label: 'All parents', provider: 'parents_school' },
  { id: 'staff', label: 'All staff', provider: 'staff_all' },
];

export function AudiencePicker({ value, onChange, disabled }: Props) {
  const [mode, setMode] = React.useState<'quick' | 'saved' | 'custom'>(value?.mode ?? 'quick');
  const [savedAudiences, setSavedAudiences] = React.useState<SavedAudienceRow[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = React.useState(false);

  const initialCustom =
    value?.mode === 'custom' && value.definition ? rowsFromAudience(value.definition) : null;
  const [customRows, setCustomRows] = React.useState<BuilderRow[]>(initialCustom?.rows ?? []);
  const [customOperator, setCustomOperator] = React.useState<'and' | 'or'>(
    initialCustom?.operator ?? 'and',
  );
  const [customCount, setCustomCount] = React.useState<number | null>(null);
  const [isCountLoading, setIsCountLoading] = React.useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (mode !== 'custom') return;
    const definition = buildAudienceFromRows(customRows, customOperator);
    if (!definition) {
      setCustomCount(null);
      onChange({ mode: 'custom', definition: null });
      return;
    }
    onChange({ mode: 'custom', definition });
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setIsCountLoading(true);
      apiClient<{ count: number }>('/api/v1/inbox/audiences/preview', {
        method: 'POST',
        body: JSON.stringify({ definition }),
        signal: controller.signal,
        silent: true,
      })
        .then((res) => {
          if (!controller.signal.aborted) setCustomCount(res.count);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          console.error('[audience-picker.preview]', err);
          setCustomCount(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsCountLoading(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(handle);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customRows, customOperator, mode]);

  React.useEffect(() => {
    if (mode !== 'saved') return;
    let cancelled = false;
    setIsLoadingSaved(true);
    apiClient<{ data: SavedAudienceRow[] }>('/api/v1/inbox/audiences', {
      method: 'GET',
      silent: true,
    })
      .then((res) => {
        if (cancelled) return;
        setSavedAudiences(res.data ?? []);
      })
      .catch((err) => {
        console.error('[audience-picker.savedList]', err);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const pickQuick = (providerKey: AudienceProviderKey) => {
    const definition: AudienceDefinition = { provider: providerKey, params: {} };
    onChange({ mode: 'quick', definition });
  };

  const pickSaved = (audience: SavedAudienceRow) => {
    const definition: AudienceDefinition = {
      provider: 'saved_group',
      params: { saved_audience_id: audience.id },
    };
    onChange({ mode: 'saved', savedAudienceId: audience.id, definition });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Audience mode">
        {(['quick', 'saved', 'custom'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            disabled={disabled}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              mode === m
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-surface text-text-secondary hover:bg-background/60',
            )}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {mode === 'quick' && (
        <div className="flex flex-wrap gap-2">
          {QUICK_CHIPS.map((chip) => {
            const active =
              value?.mode === 'quick' &&
              'provider' in value.definition &&
              value.definition.provider === chip.provider;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => pickQuick(chip.provider)}
                disabled={disabled}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm transition',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-surface text-text-primary hover:bg-background/60',
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

      {mode === 'saved' && (
        <div className="rounded-lg border border-border bg-surface">
          {isLoadingSaved ? (
            <div className="flex items-center gap-2 p-4 text-sm text-text-tertiary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading saved audiences…
            </div>
          ) : savedAudiences.length === 0 ? (
            <div className="p-4 text-sm text-text-tertiary">
              No saved audiences yet. Switch to the Custom tab, build one, then save it.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {savedAudiences.map((a) => {
                const active = value?.mode === 'saved' && value.savedAudienceId === a.id;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => pickSaved(a)}
                      disabled={disabled}
                      className={cn(
                        'flex w-full items-start justify-between gap-3 p-3 text-start transition',
                        active ? 'bg-primary/5' : 'hover:bg-background/40',
                      )}
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-text-primary">{a.name}</span>
                        {a.description && (
                          <span className="truncate text-xs text-text-tertiary">
                            {a.description}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {a.kind}
                        </Badge>
                        {a.last_resolved_count !== null && (
                          <span className="flex items-center gap-1 text-xs text-text-tertiary">
                            <Users className="h-3 w-3" />
                            {a.last_resolved_count}
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {mode === 'custom' && (
        <div className="space-y-3">
          <AudienceChipBuilder
            value={customRows}
            onChange={setCustomRows}
            operator={customOperator}
            onOperatorChange={setCustomOperator}
            totalCount={customCount}
            isCountLoading={isCountLoading}
          />
          {customRows.length > 0 && buildAudienceFromRows(customRows, customOperator) && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSaveDialogOpen(true)}
              >
                <Save className="me-1 h-4 w-4" />
                Save as audience…
              </Button>
            </div>
          )}
        </div>
      )}

      <SaveAudienceDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        definition={buildAudienceFromRows(customRows, customOperator)}
      />
    </div>
  );
}

const MODE_LABELS: Record<'quick' | 'saved' | 'custom', string> = {
  quick: 'Quick pick',
  saved: 'Saved audience',
  custom: 'Build custom',
};

function SaveAudienceDialog({
  open,
  onOpenChange,
  definition,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  definition: AudienceDefinition | null;
}) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
    }
  }, [open]);

  const save = async () => {
    if (!definition) return;
    if (name.trim().length === 0) {
      toast.error('Name is required.');
      return;
    }
    setIsSaving(true);
    try {
      await apiClient('/api/v1/inbox/audiences', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          kind: 'dynamic',
          definition,
        }),
      });
      toast.success('Audience saved.');
      onOpenChange(false);
    } catch (err) {
      console.error('[audience-picker.save]', err);
      toast.error('Could not save audience.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Save audience</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="saved-audience-name">Name</Label>
            <Input
              id="saved-audience-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Parents in arrears"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="saved-audience-desc">Description (optional)</Label>
            <Textarea
              id="saved-audience-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this audience represents"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving || !definition} onClick={save}>
            {isSaving ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
