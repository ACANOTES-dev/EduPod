import { Edit2, Plus, Trash2 } from 'lucide-react';

import type { CreateAlertRuleDto } from '@school/shared';
import { Button, Skeleton, Switch } from '@school/ui';

import { AlertSeverityBadge, type AlertSeverity } from './alert-severity-badge';
import { ConditionDisplay } from './condition-display';

export type AlertMetric = CreateAlertRuleDto['metric'];

export interface AlertConditionConfig {
  operator: CreateAlertRuleDto['condition_config']['operator'];
  threshold: number;
  duration_minutes?: number;
  component?: CreateAlertRuleDto['condition_config']['component'];
  queue?: string;
  tenant_id?: string;
}

export interface PlatformAlertRule {
  id: string;
  name: string;
  metric: AlertMetric;
  condition_config: AlertConditionConfig;
  severity: AlertSeverity;
  cooldown_minutes: number;
  is_enabled: boolean;
  is_security_critical: boolean;
  notify_emails: string[];
  channel_ids: string[];
  created_at: string;
  updated_at: string;
}

interface AlertRuleListProps {
  rules: PlatformAlertRule[];
  loading: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (rule: PlatformAlertRule) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function AlertRuleList({
  loading,
  onAdd,
  onDelete,
  onEdit,
  onToggle,
  rules,
}: AlertRuleListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Rules</h2>
          <p className="text-sm text-text-secondary">
            Threshold checks evaluated every 30 seconds.
          </p>
        </div>
        <Button onClick={onAdd}>
          <Plus className="me-1.5 h-4 w-4" />
          Add rule
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[104px] rounded-lg" />
          ))}
        </div>
      ) : null}

      {!loading && rules.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-sm text-text-secondary">
          No alert rules configured yet.
        </div>
      ) : null}

      {!loading && rules.length > 0 ? (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-text-primary">
                      {rule.name}
                    </h3>
                    <AlertSeverityBadge severity={rule.severity} />
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    <ConditionDisplay rule={rule} />
                  </p>
                  <p className="mt-1 text-xs text-text-tertiary">
                    Cooldown {rule.cooldown_minutes} min · {rule.notify_emails.length} email
                    recipient{rule.notify_emails.length === 1 ? '' : 's'}
                    {rule.channel_ids.length > 0
                      ? ` · ${rule.channel_ids.length} channel${
                          rule.channel_ids.length === 1 ? '' : 's'
                        }`
                      : ''}
                    {rule.is_security_critical ? ' · security critical' : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={rule.is_enabled}
                    onCheckedChange={(enabled) => onToggle(rule.id, enabled)}
                    aria-label={rule.is_enabled ? 'Disable alert rule' : 'Enable alert rule'}
                  />
                  <Button size="icon" variant="ghost" onClick={() => onEdit(rule)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => onDelete(rule.id)}>
                    <Trash2 className="h-4 w-4 text-danger-text" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
