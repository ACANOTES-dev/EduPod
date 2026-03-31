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
} from '@school/ui';
import { Play } from 'lucide-react';

import type { PolicyRule, ReplayResult } from './policy-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ReplayPanelProps {
  stageRules: PolicyRule[];
  replayRuleId: string;
  onReplayRuleIdChange: (id: string) => void;
  replayFrom: string;
  onReplayFromChange: (val: string) => void;
  replayTo: string;
  onReplayToChange: (val: string) => void;
  replayLoading: boolean;
  replayResult: ReplayResult | null;
  onReplay: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReplayPanel({
  stageRules,
  replayRuleId,
  onReplayRuleIdChange,
  replayFrom,
  onReplayFromChange,
  replayTo,
  onReplayToChange,
  replayLoading,
  replayResult,
  onReplay,
}: ReplayPanelProps) {
  return (
    <div className="mt-6 rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">Test this stage against past data</h3>
      </div>
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={replayFrom}
              onChange={(e) => onReplayFromChange(e.target.value)}
              className="w-40 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={replayTo}
              onChange={(e) => onReplayToChange(e.target.value)}
              className="w-40 text-base"
            />
          </div>
          <div className="min-w-[200px] space-y-1.5">
            <Label className="text-xs">Rule</Label>
            <Select value={replayRuleId} onValueChange={onReplayRuleIdChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a rule" />
              </SelectTrigger>
              <SelectContent>
                {stageRules.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onReplay} disabled={replayLoading}>
            <Play className="me-2 h-4 w-4" />
            {replayLoading ? 'Running...' : 'Run Replay'}
          </Button>
        </div>

        {replayResult && (
          <div className="rounded-lg border border-border bg-surface-secondary p-4 text-sm">
            <p className="font-medium">{replayResult.rule_name}</p>
            <p className="text-text-tertiary">
              {replayResult.replay_period.from} {'\u2014'} {replayResult.replay_period.to}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <span className="text-text-tertiary">Evaluated</span>
                <p className="text-lg font-semibold">{replayResult.incidents_evaluated}</p>
              </div>
              <div>
                <span className="text-text-tertiary">Matched</span>
                <p className="text-lg font-semibold">{replayResult.incidents_matched}</p>
              </div>
              <div>
                <span className="text-text-tertiary">Students</span>
                <p className="text-lg font-semibold">{replayResult.students_affected}</p>
              </div>
              <div>
                <span className="text-text-tertiary">Year Groups</span>
                <p className="text-lg font-semibold">
                  {replayResult.affected_year_groups.join(', ') || '\u2014'}
                </p>
              </div>
            </div>
            {Object.keys(replayResult.actions_that_would_fire).length > 0 && (
              <div className="mt-2">
                <span className="text-text-tertiary">Actions:</span>
                <ul className="ms-4 mt-1 list-disc">
                  {Object.entries(replayResult.actions_that_would_fire).map(([action, count]) => (
                    <li key={action}>
                      {action}: {count} times
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
