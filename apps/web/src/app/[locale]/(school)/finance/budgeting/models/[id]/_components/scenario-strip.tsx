'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import type { ScenarioDetail } from './workspace-types';

interface Props {
  scenarios: ScenarioDetail[];
  activeScenarioId: string | null;
  onSwitch: (id: string | null) => void;
  onScenarioCreated: (created: ScenarioDetail) => void;
  modelId: string;
  canManage: boolean;
}

const MAX_SCENARIOS = 3;

export function ScenarioStrip({
  scenarios,
  activeScenarioId,
  onSwitch,
  onScenarioCreated,
  modelId,
  canManage,
}: Props) {
  const t = useTranslations('financeBudgetingWorkspace.scenarios');
  const [adding, setAdding] = React.useState<boolean>(false);
  const [newName, setNewName] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  const onCreate = async (): Promise<void> => {
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      // POST returns { scenario: ScenarioDetail, computed: ... }; we surface
      // the scenario row to the parent, which appends it to its scenarios[]
      // array. The `data` envelope is auto-stripped by the api-client.
      const res = await apiClient<{ scenario: ScenarioDetail }>(
        `/api/v1/budgeting/financial-models/${modelId}/scenarios`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: newName.trim(),
            position: scenarios.length,
            driver_overrides: {},
          }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      onScenarioCreated(res.scenario);
      setNewName('');
      setAdding(false);
    } catch (err) {
      console.error('[ScenarioStrip.create]', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-w-0 items-center gap-2 overflow-x-auto rounded-2xl border border-border bg-surface p-3">
      <Chip label={t('base')} active={activeScenarioId === null} onClick={() => onSwitch(null)} />
      {scenarios.map((s) => (
        <Chip
          key={s.id}
          label={s.name}
          active={activeScenarioId === s.id}
          onClick={() => onSwitch(s.id)}
        />
      ))}
      {canManage && scenarios.length < MAX_SCENARIOS && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs font-semibold text-text-secondary hover:border-primary-300 hover:text-primary-700"
        >
          <Plus className="h-3 w-3" />
          {t('addAlternative')}
        </button>
      )}
      {adding && (
        <div className="ms-auto flex shrink-0 items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('newName')}
            className="h-8 w-32"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onCreate();
              if (e.key === 'Escape') {
                setAdding(false);
                setNewName('');
              }
            }}
          />
          <Button
            size="sm"
            onClick={() => void onCreate()}
            disabled={submitting || !newName.trim()}
          >
            {t('create')}
          </Button>
        </div>
      )}
    </section>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? 'bg-primary-600 text-white'
          : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
      }`}
    >
      {label}
    </button>
  );
}
