'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createAlertEscalationPolicySchema,
  type CreateAlertEscalationPolicyDto,
} from '@school/shared';
import { Button, Skeleton, Switch, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface AlertRouteOption {
  id: string;
  display_name: string;
  enabled: boolean;
}

interface EscalationPolicy {
  id: string;
  applies_to_alert_keys: string[];
  applies_to_severity: 'critical' | 'warning';
  display_name: string;
  enabled: boolean;
  steps: { ack_window_minutes: number; route_id: string }[];
}

const policyFormInputSchema = z.object({
  ack_window_minutes: z.coerce.number().int().min(1).max(1440),
  alert_keys_csv: z.string().trim().optional(),
  applies_to_severity: z.enum(['critical', 'warning']),
  display_name: z.string().trim().min(1).max(160),
  enabled: z.coerce.boolean().default(true),
  route_id: z.string().uuid(),
});

const policyFormSchema = policyFormInputSchema
  .transform((value) => ({
    applies_to_alert_keys: value.alert_keys_csv
      ? value.alert_keys_csv
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [],
    applies_to_severity: value.applies_to_severity,
    display_name: value.display_name,
    enabled: value.enabled,
    steps: [{ ack_window_minutes: value.ack_window_minutes, route_id: value.route_id }],
  }))
  .pipe(createAlertEscalationPolicySchema);

type PolicyFormInput = z.input<typeof policyFormSchema>;

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformAlertEscalationPage() {
  const [policies, setPolicies] = React.useState<EscalationPolicy[]>([]);
  const [routes, setRoutes] = React.useState<AlertRouteOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const policyForm = useForm<PolicyFormInput>({
    resolver: zodResolver(policyFormInputSchema),
    defaultValues: {
      ack_window_minutes: 15,
      alert_keys_csv: '',
      applies_to_severity: 'critical',
      display_name: '',
      enabled: true,
    },
  });

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [nextPolicies, nextRoutes] = await Promise.all([
        apiClient<EscalationPolicy[]>('/api/v1/admin/alerts/escalation-policies'),
        apiClient<AlertRouteOption[]>('/api/v1/admin/alerts/routes'),
      ]);
      setPolicies(nextPolicies);
      setRoutes(nextRoutes);
      if (!policyForm.getValues('route_id') && nextRoutes[0]) {
        policyForm.setValue('route_id', nextRoutes[0].id);
      }
    } catch (err: unknown) {
      console.error('[PlatformAlertEscalationPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load escalation policies.'));
    } finally {
      setLoading(false);
    }
  }, [policyForm]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function createPolicy(dto: CreateAlertEscalationPolicyDto) {
    try {
      const created = await apiClient<EscalationPolicy>(
        '/api/v1/admin/alerts/escalation-policies',
        {
          body: JSON.stringify(dto),
          method: 'POST',
        },
      );
      setPolicies((current) => [created, ...current]);
      policyForm.reset({
        ack_window_minutes: 15,
        applies_to_severity: 'critical',
        display_name: '',
      });
      toast.success('Escalation policy created.');
    } catch (err: unknown) {
      console.error('[PlatformAlertEscalationPage.createPolicy]', err);
      toast.error(getErrorMessage(err, 'Failed to create escalation policy.'));
    }
  }

  async function togglePolicy(policy: EscalationPolicy, enabled: boolean) {
    try {
      const updated = await apiClient<EscalationPolicy>(
        `/api/v1/admin/alerts/escalation-policies/${policy.id}`,
        { body: JSON.stringify({ enabled }), method: 'PATCH' },
      );
      setPolicies((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (err: unknown) {
      console.error('[PlatformAlertEscalationPage.togglePolicy]', err);
      toast.error(getErrorMessage(err, 'Failed to update escalation policy.'));
    }
  }

  async function deletePolicy(policy: EscalationPolicy) {
    if (!window.confirm(`Delete escalation policy "${policy.display_name}"?`)) return;
    try {
      await apiClient<void>(`/api/v1/admin/alerts/escalation-policies/${policy.id}`, {
        method: 'DELETE',
      });
      setPolicies((current) => current.filter((item) => item.id !== policy.id));
      toast.success('Escalation policy deleted.');
    } catch (err: unknown) {
      console.error('[PlatformAlertEscalationPage.deletePolicy]', err);
      toast.error(getErrorMessage(err, 'Failed to delete escalation policy.'));
    }
  }

  function routeName(routeId: string): string {
    return routes.find((route) => route.id === routeId)?.display_name ?? routeId;
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Escalation Policies"
        description="Ordered acknowledgement windows that move fired alerts through configured routes."
      />

      <form
        onSubmit={policyForm.handleSubmit(
          (values) => void createPolicy(policyFormSchema.parse(values)),
        )}
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-3"
      >
        <input
          {...policyForm.register('display_name')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          placeholder="Policy name"
        />
        <select
          {...policyForm.register('applies_to_severity')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
        >
          <option value="critical">Critical</option>
          <option value="warning">Warning</option>
        </select>
        <select
          {...policyForm.register('route_id')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
        >
          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.display_name}
            </option>
          ))}
        </select>
        <input
          {...policyForm.register('ack_window_minutes')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          placeholder="Ack window minutes"
          type="number"
        />
        <input
          {...policyForm.register('alert_keys_csv')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary md:col-span-2"
          placeholder="Optional alert keys, comma-separated"
        />
        <div className="flex gap-3 md:col-span-3">
          <Button type="submit" disabled={policyForm.formState.isSubmitting || routes.length === 0}>
            <Plus className="me-1.5 h-4 w-4" />
            Add policy
          </Button>
          <Button type="button" variant="ghost" onClick={() => void load()}>
            <RefreshCw className="me-1.5 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-[108px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((policy) => (
            <article key={policy.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-text-primary">{policy.display_name}</h2>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {policy.applies_to_severity} ·{' '}
                    {policy.applies_to_alert_keys.length
                      ? policy.applies_to_alert_keys.join(', ')
                      : 'all alert keys'}
                  </p>
                </div>
                <Switch
                  checked={policy.enabled}
                  onCheckedChange={(enabled) => void togglePolicy(policy, enabled)}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-text-secondary">
                {policy.steps.map((step, index) => (
                  <span
                    key={`${step.route_id}-${index}`}
                    className="rounded-full bg-surface-secondary px-2 py-1"
                  >
                    {index + 1}. {routeName(step.route_id)} · {step.ack_window_minutes}m
                  </span>
                ))}
              </div>
              <div className="mt-4">
                <Button size="icon" variant="ghost" onClick={() => void deletePolicy(policy)}>
                  <Trash2 className="h-4 w-4 text-danger-text" />
                </Button>
              </div>
            </article>
          ))}
          {policies.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface px-4 py-10 text-sm text-text-secondary">
              No escalation policies configured.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
