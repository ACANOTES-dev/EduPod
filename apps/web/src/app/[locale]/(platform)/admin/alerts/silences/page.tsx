'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { BellOff, RefreshCw, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  createAlertSilenceSchema,
  type CreateAlertSilenceDto,
  type RemoveAlertSilenceDto,
} from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import type { PlatformAlertRule } from '../_components/alert-rule-list';

interface PlatformAlertSilence {
  id: string;
  scope: 'single_rule' | 'component' | 'global';
  alert_rule_id: string | null;
  component: string | null;
  reason: string;
  starts_at: string;
  ends_at: string;
  removed_at: string | null;
  alert_rule?: { id: string; name: string; severity: string } | null;
}

const COMPONENTS = ['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk'] as const;

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

function toDateTimeLocal(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatWindow(start: string, end: string): string {
  return `${new Date(start).toLocaleString()} - ${new Date(end).toLocaleString()}`;
}

export default function AlertSilencesPage() {
  const [rules, setRules] = React.useState<PlatformAlertRule[]>([]);
  const [silences, setSilences] = React.useState<PlatformAlertSilence[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const form = useForm<CreateAlertSilenceDto>({
    resolver: zodResolver(createAlertSilenceSchema),
    defaultValues: {
      scope: 'global',
      reason: '',
      starts_at: new Date(),
      ends_at: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const scope = form.watch('scope');

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [rulesResult, silencesResult] = await Promise.all([
        apiClient<PlatformAlertRule[]>('/api/v1/admin/alerts/rules'),
        apiClient<PlatformAlertSilence[]>('/api/v1/admin/alert-silences'),
      ]);
      setRules(rulesResult);
      setSilences(silencesResult);
    } catch (err: unknown) {
      console.error('[AlertSilencesPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load alert silences.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submit(values: CreateAlertSilenceDto) {
    try {
      setSaving(true);
      const created = await apiClient<PlatformAlertSilence>('/api/v1/admin/alert-silences', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setSilences((current) => [created, ...current]);
      form.reset({
        scope: 'global',
        reason: '',
        starts_at: new Date(),
        ends_at: new Date(Date.now() + 60 * 60 * 1000),
      });
      toast.success('Alert silence created.');
    } catch (err: unknown) {
      console.error('[AlertSilencesPage.submit]', err);
      toast.error(getErrorMessage(err, 'Failed to create alert silence.'));
    } finally {
      setSaving(false);
    }
  }

  async function removeSilence(id: string) {
    const reason = window.prompt('Reason for removing this silence early');
    if (!reason) return;
    try {
      const body: RemoveAlertSilenceDto = { reason };
      const updated = await apiClient<PlatformAlertSilence>(`/api/v1/admin/alert-silences/${id}`, {
        method: 'DELETE',
        body: JSON.stringify(body),
      });
      setSilences((current) => current.map((silence) => (silence.id === id ? updated : silence)));
      toast.success('Alert silence removed.');
    } catch (err: unknown) {
      console.error('[AlertSilencesPage.removeSilence]', err);
      toast.error(getErrorMessage(err, 'Failed to remove alert silence.'));
    }
  }

  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Silences"
        description="Suppress noisy platform alerts for a bounded window."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="me-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        }
      />

      <form
        className="rounded-lg border border-border bg-surface p-4"
        onSubmit={form.handleSubmit(submit)}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Scope</Label>
            <Select
              value={scope}
              onValueChange={(value) =>
                form.setValue('scope', value as CreateAlertSilenceDto['scope'], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="component">Component</SelectItem>
                <SelectItem value="single_rule">Single rule</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {scope === 'single_rule' ? (
            <div>
              <Label>Alert rule</Label>
              <Select
                value={form.watch('alert_rule_id') ?? ''}
                onValueChange={(value) =>
                  form.setValue('alert_rule_id', value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose rule" />
                </SelectTrigger>
                <SelectContent>
                  {rules.map((rule) => (
                    <SelectItem key={rule.id} value={rule.id}>
                      {rule.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {scope === 'component' ? (
            <div>
              <Label>Component</Label>
              <Select
                value={form.watch('component') ?? ''}
                onValueChange={(value) =>
                  form.setValue('component', value as CreateAlertSilenceDto['component'], {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose component" />
                </SelectTrigger>
                <SelectContent>
                  {COMPONENTS.map((component) => (
                    <SelectItem key={component} value={component}>
                      {component}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div>
            <Label htmlFor="silence-start">Starts</Label>
            <Input
              id="silence-start"
              className="mt-1"
              type="datetime-local"
              defaultValue={toDateTimeLocal(new Date())}
              {...form.register('starts_at', { valueAsDate: true })}
            />
          </div>

          <div>
            <Label htmlFor="silence-end">Ends</Label>
            <Input
              id="silence-end"
              className="mt-1"
              type="datetime-local"
              defaultValue={toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000))}
              {...form.register('ends_at', { valueAsDate: true })}
            />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="silence-reason">Reason</Label>
            <Textarea id="silence-reason" className="mt-1 min-h-24" {...form.register('reason')} />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={saving}>
            <BellOff className="me-1.5 h-4 w-4" />
            Create silence
          </Button>
        </div>
      </form>

      <section className="rounded-lg border border-border bg-surface">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Active and recent silences</h2>
        </header>
        {loading ? (
          <div className="p-4 text-sm text-text-secondary">Loading silences...</div>
        ) : silences.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">No silences found.</div>
        ) : (
          <ul className="divide-y divide-border">
            {silences.map((silence) => {
              const active =
                !silence.removed_at &&
                new Date(silence.starts_at).getTime() <= now &&
                new Date(silence.ends_at).getTime() > now;
              return (
                <li
                  key={silence.id}
                  className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-warning-bg px-2 py-1 text-xs font-semibold text-warning-text">
                        {active ? 'Active' : silence.removed_at ? 'Removed' : 'Scheduled'}
                      </span>
                      <span className="text-sm font-semibold text-text-primary">
                        {silence.scope === 'single_rule'
                          ? (silence.alert_rule?.name ?? 'Deleted rule')
                          : silence.scope === 'component'
                            ? silence.component
                            : 'Global'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {formatWindow(silence.starts_at, silence.ends_at)}
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{silence.reason}</p>
                  </div>
                  {!silence.removed_at && new Date(silence.ends_at).getTime() > now ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void removeSilence(silence.id)}
                    >
                      <Trash2 className="me-1.5 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
