'use client';

import * as React from 'react';

import { ALERT_METRICS, ALERT_SEVERITIES, type CreateAlertRuleDto } from '@school/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast } from '@school/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiClient } from '@/lib/api-client';

import { AlertRuleList, type AlertMetric, type PlatformAlertRule } from './alert-rule-list';
import { RuleFormDialog } from './rule-form-dialog';

type SeverityFilter = 'all' | (typeof ALERT_SEVERITIES)[number];
type StatusFilter = 'all' | 'enabled' | 'disabled';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') {
      return maybeError.message;
    }
  }
  return fallback;
}

function metricLabel(metric: AlertMetric): string {
  return metric
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function AlertRulesManager() {
  const [rules, setRules] = React.useState<PlatformAlertRule[]>([]);
  const [rulesLoading, setRulesLoading] = React.useState(true);
  const [formLoading, setFormLoading] = React.useState(false);
  const [showRuleForm, setShowRuleForm] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<PlatformAlertRule | null>(null);
  const [metricFilter, setMetricFilter] = React.useState<'all' | AlertMetric>('all');
  const [severityFilter, setSeverityFilter] = React.useState<SeverityFilter>('all');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [deleteRuleId, setDeleteRuleId] = React.useState<string | null>(null);

  const loadRules = React.useCallback(async () => {
    try {
      setRulesLoading(true);
      const result = await apiClient<PlatformAlertRule[]>('/api/v1/admin/alerts/rules');
      setRules(result);
    } catch (err: unknown) {
      console.error('[AlertRulesManager.loadRules]', err);
      toast.error(getErrorMessage(err, 'Failed to load alert rules.'));
    } finally {
      setRulesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRules();
  }, [loadRules]);

  const metricOptions = React.useMemo(() => {
    const values = new Set<AlertMetric>(ALERT_METRICS);
    for (const rule of rules) {
      values.add(rule.metric);
    }
    return Array.from(values).sort();
  }, [rules]);

  const filteredRules = React.useMemo(
    () =>
      rules.filter((rule) => {
        const metricMatches = metricFilter === 'all' || rule.metric === metricFilter;
        const severityMatches = severityFilter === 'all' || rule.severity === severityFilter;
        const statusMatches =
          statusFilter === 'all' ||
          (statusFilter === 'enabled' ? rule.is_enabled : !rule.is_enabled);
        return metricMatches && severityMatches && statusMatches;
      }),
    [metricFilter, rules, severityFilter, statusFilter],
  );

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const updated = await apiClient<PlatformAlertRule>(
        `/api/v1/admin/alerts/rules/${id}/toggle`,
        {
          method: 'PATCH',
          body: JSON.stringify({ is_enabled: enabled }),
        },
      );
      setRules((current) => current.map((rule) => (rule.id === id ? updated : rule)));
    } catch (err: unknown) {
      console.error('[AlertRulesManager.handleToggle]', err);
      toast.error(getErrorMessage(err, 'Failed to update alert rule.'));
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient<void>(`/api/v1/admin/alerts/rules/${id}`, { method: 'DELETE' });
      setRules((current) => current.filter((rule) => rule.id !== id));
      setDeleteRuleId(null);
      toast.success('Alert rule deleted.');
    } catch (err: unknown) {
      console.error('[AlertRulesManager.handleDelete]', err);
      toast.error(getErrorMessage(err, 'Failed to delete alert rule.'));
    }
  }

  async function handleSubmitRule(data: CreateAlertRuleDto) {
    try {
      setFormLoading(true);
      if (editingRule) {
        const updated = await apiClient<PlatformAlertRule>(
          `/api/v1/admin/alerts/rules/${editingRule.id}`,
          { method: 'PATCH', body: JSON.stringify(data) },
        );
        setRules((current) => current.map((rule) => (rule.id === updated.id ? updated : rule)));
        toast.success('Alert rule updated.');
      } else {
        const created = await apiClient<PlatformAlertRule>('/api/v1/admin/alerts/rules', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        setRules((current) => [created, ...current]);
        toast.success('Alert rule created.');
      }
      setShowRuleForm(false);
      setEditingRule(null);
    } catch (err: unknown) {
      console.error('[AlertRulesManager.handleSubmitRule]', err);
      toast.error(getErrorMessage(err, 'Failed to save alert rule.'));
    } finally {
      setFormLoading(false);
    }
  }

  function startCreate() {
    setEditingRule(null);
    setShowRuleForm(true);
  }

  function startEdit(rule: PlatformAlertRule) {
    setEditingRule(rule);
    setShowRuleForm(true);
  }

  const deleteRule = rules.find((rule) => rule.id === deleteRuleId) ?? null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-3">
        <Select
          value={metricFilter}
          onValueChange={(value) => setMetricFilter(value as 'all' | AlertMetric)}
        >
          <SelectTrigger aria-label="Filter by metric">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All metrics</SelectItem>
            {metricOptions.map((metric) => (
              <SelectItem key={metric} value={metric}>
                {metricLabel(metric)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={severityFilter}
          onValueChange={(value) => setSeverityFilter(value as SeverityFilter)}
        >
          <SelectTrigger aria-label="Filter by severity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            {ALERT_SEVERITIES.map((severity) => (
              <SelectItem key={severity} value={severity}>
                {severity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={statusFilter}
          onValueChange={(value) => setStatusFilter(value as StatusFilter)}
        >
          <SelectTrigger aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <AlertRuleList
        loading={rulesLoading}
        onAdd={startCreate}
        onDelete={setDeleteRuleId}
        onEdit={startEdit}
        onToggle={(id, enabled) => void handleToggle(id, enabled)}
        rules={filteredRules}
      />

      <RuleFormDialog
        initialData={editingRule}
        loading={formLoading}
        onOpenChange={(open) => {
          setShowRuleForm(open);
          if (!open) {
            setEditingRule(null);
          }
        }}
        onSubmit={handleSubmitRule}
        open={showRuleForm}
      />

      <ConfirmDialog
        open={deleteRule !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRuleId(null);
        }}
        title="Delete Alert Rule"
        description={
          deleteRule
            ? `Delete "${deleteRule.name}" and its alert history? This cannot be undone.`
            : 'Delete this alert rule and its alert history? This cannot be undone.'
        }
        confirmLabel="Delete rule"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={() => {
          if (deleteRuleId) void handleDelete(deleteRuleId);
        }}
      />
    </div>
  );
}
