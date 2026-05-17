'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { BellRing, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  createAlertRouteSchema,
  type CreateAlertRouteDto,
  type TestAlertRouteDto,
} from '@school/shared';
import { Button, Skeleton, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type AlertChannelType = 'email' | 'push' | 'telegram' | 'whatsapp';
type AlertUrgencyTier = 'critical_only' | 'info' | 'urgent';

interface AlertChannel {
  id: string;
  is_enabled: boolean;
  name: string;
  type: AlertChannelType;
}

interface AlertRoute {
  id: string;
  channel: AlertChannel;
  display_name: string;
  enabled: boolean;
  health_checks: { ran_at: string; success: boolean }[];
  last_health_check_status: string | null;
  operator_destination: Record<string, unknown>;
  quiet_hours_end: string | null;
  quiet_hours_start: string | null;
  quiet_hours_timezone: string;
  urgency_tier: AlertUrgencyTier;
}

const routeFormInputSchema = z.object({
  channel_id: z.string().uuid(),
  critical_override_quiet: z.coerce.boolean().default(true),
  dead_man_interval_minutes: z.coerce.number().int().min(1).max(1440).default(15),
  display_name: z.string().trim().min(1).max(160),
  enabled: z.coerce.boolean().default(true),
  health_check_destination_json: z.string().trim().min(2),
  operator_destination_json: z.string().trim().min(2),
  quiet_hours_end: z.string().trim().optional(),
  quiet_hours_start: z.string().trim().optional(),
  quiet_hours_timezone: z.string().trim().min(1).max(60).default('Europe/Dublin'),
  urgency_tier: z.enum(['critical_only', 'info', 'urgent']).default('urgent'),
});

const routeFormSchema = routeFormInputSchema
  .transform((value, ctx) => {
    function parseDestination(raw: string, path: string[]): Record<string, unknown> {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch (err: unknown) {
        console.error('[PlatformAlertRoutesPage.parseDestination]', err);
      }
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Destination must be a JSON object',
        path,
      });
      return {};
    }

    return {
      channel_id: value.channel_id,
      critical_override_quiet: value.critical_override_quiet,
      dead_man_interval_minutes: value.dead_man_interval_minutes,
      display_name: value.display_name,
      enabled: value.enabled,
      health_check_destination: parseDestination(value.health_check_destination_json, [
        'health_check_destination_json',
      ]),
      operator_destination: parseDestination(value.operator_destination_json, [
        'operator_destination_json',
      ]),
      quiet_hours_end: value.quiet_hours_end || undefined,
      quiet_hours_start: value.quiet_hours_start || undefined,
      quiet_hours_timezone: value.quiet_hours_timezone,
      urgency_tier: value.urgency_tier,
    };
  })
  .pipe(createAlertRouteSchema);

type RouteFormInput = z.input<typeof routeFormSchema>;

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

function destinationSummary(destination: Record<string, unknown>): string {
  const value =
    destination.email ??
    destination.chat_id ??
    destination.telegram_chat_id ??
    destination.to_number ??
    destination.phone_e164 ??
    destination.endpoint;
  return typeof value === 'string' ? value : JSON.stringify(destination);
}

export default function PlatformAlertRoutesPage() {
  const [channels, setChannels] = React.useState<AlertChannel[]>([]);
  const [routes, setRoutes] = React.useState<AlertRoute[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [testingId, setTestingId] = React.useState<string | null>(null);
  const [testAllLoading, setTestAllLoading] = React.useState(false);
  const routeForm = useForm<RouteFormInput>({
    resolver: zodResolver(routeFormInputSchema),
    defaultValues: {
      critical_override_quiet: true,
      dead_man_interval_minutes: 15,
      display_name: '',
      enabled: true,
      health_check_destination_json: '{"email":"sink@example.test"}',
      operator_destination_json: '{"email":"operator@example.test"}',
      quiet_hours_timezone: 'Europe/Dublin',
      urgency_tier: 'urgent',
    },
  });

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [nextRoutes, nextChannels] = await Promise.all([
        apiClient<AlertRoute[]>('/api/v1/admin/alerts/routes'),
        apiClient<AlertChannel[]>('/api/v1/admin/alerts/channels'),
      ]);
      setRoutes(nextRoutes);
      setChannels(nextChannels);
      if (!routeForm.getValues('channel_id') && nextChannels[0]) {
        routeForm.setValue('channel_id', nextChannels[0].id);
      }
    } catch (err: unknown) {
      console.error('[PlatformAlertRoutesPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load alert routes.'));
    } finally {
      setLoading(false);
    }
  }, [routeForm]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function createRoute(dto: CreateAlertRouteDto) {
    try {
      const route = await apiClient<AlertRoute>('/api/v1/admin/alerts/routes', {
        body: JSON.stringify(dto),
        method: 'POST',
      });
      setRoutes((current) => [route, ...current]);
      toast.success('Alert route created.');
    } catch (err: unknown) {
      console.error('[PlatformAlertRoutesPage.createRoute]', err);
      toast.error(getErrorMessage(err, 'Failed to create alert route.'));
    }
  }

  async function deleteRoute(route: AlertRoute) {
    if (!window.confirm(`Delete alert route "${route.display_name}"?`)) return;
    try {
      await apiClient<void>(`/api/v1/admin/alerts/routes/${route.id}`, { method: 'DELETE' });
      setRoutes((current) => current.filter((item) => item.id !== route.id));
      toast.success('Alert route deleted.');
    } catch (err: unknown) {
      console.error('[PlatformAlertRoutesPage.deleteRoute]', err);
      toast.error(getErrorMessage(err, 'Failed to delete alert route.'));
    }
  }

  async function testRoute(route: AlertRoute) {
    try {
      setTestingId(route.id);
      const dto: TestAlertRouteDto = { comment: 'Operator-triggered route test from dashboard.' };
      const result = await apiClient<{ message: string; success: boolean }>(
        `/api/v1/admin/alerts/routes/${route.id}/test`,
        { body: JSON.stringify(dto), method: 'POST' },
      );
      toast[result.success ? 'success' : 'error'](result.message);
      await load();
    } catch (err: unknown) {
      console.error('[PlatformAlertRoutesPage.testRoute]', err);
      toast.error(getErrorMessage(err, 'Failed to send route test.'));
    } finally {
      setTestingId(null);
    }
  }

  async function testAllRoutes() {
    try {
      setTestAllLoading(true);
      await apiClient('/api/v1/admin/alerts/test-all', { method: 'POST' });
      toast.success('Synthetic test sent to enabled routes.');
      await load();
    } catch (err: unknown) {
      console.error('[PlatformAlertRoutesPage.testAllRoutes]', err);
      toast.error(getErrorMessage(err, 'Failed to test alert routes.'));
    } finally {
      setTestAllLoading(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Alert Routes"
        description="Operator destinations, sink checks, quiet hours, and urgency tiers."
      />

      <form
        onSubmit={routeForm.handleSubmit(
          (values) => void createRoute(routeFormSchema.parse(values)),
        )}
        className="grid gap-3 rounded-lg border border-border bg-surface p-4 lg:grid-cols-4"
      >
        <input
          {...routeForm.register('display_name')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          placeholder="Route name"
        />
        <select
          {...routeForm.register('channel_id')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
        >
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.name} ({channel.type})
            </option>
          ))}
        </select>
        <select
          {...routeForm.register('urgency_tier')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
        >
          <option value="info">Info</option>
          <option value="urgent">Urgent</option>
          <option value="critical_only">Critical only</option>
        </select>
        <input
          {...routeForm.register('quiet_hours_timezone')}
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-text-primary"
          placeholder="Europe/Dublin"
        />
        <textarea
          {...routeForm.register('operator_destination_json')}
          className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-text-primary lg:col-span-2"
        />
        <textarea
          {...routeForm.register('health_check_destination_json')}
          className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-text-primary lg:col-span-2"
        />
        <div className="flex gap-3 lg:col-span-4">
          <Button
            type="submit"
            disabled={routeForm.formState.isSubmitting || channels.length === 0}
          >
            <Plus className="me-1.5 h-4 w-4" />
            Add route
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void testAllRoutes()}
            disabled={testAllLoading}
          >
            <Send className="me-1.5 h-4 w-4" />
            Test all
          </Button>
          <Button type="button" variant="ghost" onClick={() => void load()}>
            <RefreshCw className="me-1.5 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </form>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[156px] rounded-lg" />
          ))}
        </div>
      ) : routes.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
          <BellRing className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">No alert routes configured.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {routes.map((route) => (
            <article key={route.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-text-primary">
                    {route.display_name}
                  </h2>
                  <p className="mt-1 text-xs text-text-tertiary">
                    {route.channel.type} · {route.urgency_tier.replace('_', ' ')}
                  </p>
                  <p className="mt-3 truncate text-sm text-text-secondary">
                    {destinationSummary(route.operator_destination)}
                  </p>
                </div>
                <span className="rounded-full bg-surface-secondary px-2 py-1 text-xs font-semibold text-text-secondary">
                  {route.last_health_check_status ?? 'unchecked'}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void testRoute(route)}
                  disabled={testingId === route.id}
                >
                  Test
                </Button>
                <Button size="icon" variant="ghost" onClick={() => void deleteRoute(route)}>
                  <Trash2 className="h-4 w-4 text-danger-text" />
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
