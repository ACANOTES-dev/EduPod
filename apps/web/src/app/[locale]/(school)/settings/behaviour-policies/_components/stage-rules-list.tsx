'use client';

import {
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Heart,
  History,
  Pencil,
  Shield,
  Trash2,
} from 'lucide-react';

import { Badge, Button, Switch } from '@school/ui';

import type { PolicyRule } from './policy-types';
import { actionSummary, conditionSummary, STAGES } from './policy-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface StageRulesListProps {
  activeStage: string;
  stageRules: PolicyRule[];
  loading: boolean;
  onToggle: (rule: PolicyRule) => void;
  onEdit: (rule: PolicyRule) => void;
  onDelete: (rule: PolicyRule) => void;
  onPriorityMove: (rule: PolicyRule, direction: 'up' | 'down') => void;
  onViewHistory: (ruleId: string) => void;
}

// ─── Stage Icon Map ───────────────────────────────────────────────────────────

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  consequence: AlertTriangle,
  approval: Shield,
  notification: Bell,
  support: Heart,
  alerting: AlertTriangle,
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StageRulesList({
  activeStage,
  stageRules,
  loading,
  onToggle,
  onEdit,
  onDelete,
  onPriorityMove,
  onViewHistory,
}: StageRulesListProps) {
  const stage = STAGES.find((s) => s.key === activeStage);
  if (!stage) return null;

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-text-tertiary">{stage.desc}</p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : stageRules.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface py-8 text-center text-sm text-text-tertiary">
          No rules configured for this stage.
        </div>
      ) : (
        <div className="space-y-2">
          {stageRules.map((rule, idx) => (
            <div
              key={rule.id}
              className={`rounded-xl border border-border bg-surface px-4 ${!rule.is_active ? 'opacity-50' : ''}`}
            >
              <div className="flex items-center gap-3 py-3">
                {/* Reorder */}
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => onPriorityMove(rule, 'up')}
                    disabled={idx === 0}
                    className="rounded p-0.5 hover:bg-surface-secondary disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onPriorityMove(rule, 'down')}
                    disabled={idx === stageRules.length - 1}
                    className="rounded p-0.5 hover:bg-surface-secondary disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <GripVertical className="h-4 w-4 text-text-tertiary" />

                {/* Rule info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {rule.match_strategy === 'first_match' ? 'FIRST MATCH' : 'ALL MATCHING'}
                    </Badge>
                    {rule.stop_processing_stage && (
                      <Badge variant="danger" className="text-[10px]">
                        STOPS STAGE
                      </Badge>
                    )}
                    <span className="text-xs text-text-tertiary">P{rule.priority}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-text-secondary">
                    <span>{conditionSummary(rule.conditions)}</span>
                    <span>{'\u2192'}</span>
                    <span>{actionSummary(rule.actions)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Switch checked={rule.is_active} onCheckedChange={() => onToggle(rule)} />
                  <Button variant="ghost" size="sm" onClick={() => onViewHistory(rule.id)}>
                    <History className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onEdit(rule)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-text hover:text-danger-text"
                    onClick={() => onDelete(rule)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Stage Tabs ───────────────────────────────────────────────────────────────

interface StageTabsProps {
  activeStage: string;
  onStageChange: (stage: string) => void;
  rules: PolicyRule[];
}

export function StageTabs({ activeStage, onStageChange, rules }: StageTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-border pb-1">
      {STAGES.map((s) => {
        const Icon = STAGE_ICONS[s.key] ?? AlertTriangle;
        return (
          <button
            key={s.key}
            onClick={() => onStageChange(s.key)}
            className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeStage === s.key
                ? 'border-b-2 border-emerald-600 text-emerald-700'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon className="h-4 w-4" />
            {s.label}
            <Badge variant="secondary" className="ms-1 text-xs">
              {rules.filter((r) => r.stage === s.key).length}
            </Badge>
          </button>
        );
      })}
    </div>
  );
}
