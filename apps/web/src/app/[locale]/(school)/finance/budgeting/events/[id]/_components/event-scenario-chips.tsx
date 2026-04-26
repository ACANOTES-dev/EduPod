'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input } from '@school/ui';

import type { EventBudgetScenarioComputed } from './event-types';

interface Props {
  scenarios: EventBudgetScenarioComputed[];
  selectedScenarioId: string | null;
  canEdit: boolean;
  onSelect: (scenarioId: string | null) => void;
  onCreate: (name: string) => Promise<void>;
}

const MAX_SCENARIOS = 3;

export function EventScenarioChips({
  scenarios,
  selectedScenarioId,
  canEdit,
  onSelect,
  onCreate,
}: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.scenarios');
  const [creating, setCreating] = React.useState<boolean>(false);
  const [draftName, setDraftName] = React.useState<string>('');
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  const canAdd = canEdit && scenarios.length < MAX_SCENARIOS;

  const submit = async (): Promise<void> => {
    if (!draftName.trim()) return;
    setSubmitting(true);
    try {
      await onCreate(draftName.trim());
      setDraftName('');
      setCreating(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={t('ariaLabel')}
      className="flex flex-wrap items-center gap-2 overflow-x-auto"
    >
      <Chip
        role="tab"
        aria-selected={selectedScenarioId === null}
        onClick={() => onSelect(null)}
        active={selectedScenarioId === null}
      >
        {t('base')}
      </Chip>
      {scenarios.map((s) => {
        const active = s.scenario.id === selectedScenarioId;
        return (
          <Chip
            key={s.scenario.id}
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(s.scenario.id)}
            active={active}
          >
            {s.scenario.name}
          </Chip>
        );
      })}
      {creating ? (
        <div className="flex items-center gap-2">
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t('newName')}
            className="h-8 w-40"
            disabled={submitting}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void submit()}
            disabled={!draftName.trim() || submitting}
          >
            {t('create')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setCreating(false);
              setDraftName('');
            }}
            disabled={submitting}
          >
            {t('cancel')}
          </Button>
        </div>
      ) : (
        canAdd && (
          <Button type="button" size="sm" variant="outline" onClick={() => setCreating(true)}>
            <Plus className="me-1 h-3 w-3" aria-hidden="true" />
            {t('add')}
          </Button>
        )
      )}
    </div>
  );
}

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active: boolean;
}

function Chip({ active, className, children, ...rest }: ChipProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? 'bg-primary-700 text-white'
          : 'bg-surface-secondary text-text-secondary hover:bg-surface-tertiary'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
