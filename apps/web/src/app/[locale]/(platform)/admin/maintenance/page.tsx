'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarClock, RefreshCw, XCircle } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  cancelAlertMaintenanceWindowSchema,
  type CancelAlertMaintenanceWindowDto,
  createAlertMaintenanceWindowSchema,
  type CreateAlertMaintenanceWindowDto,
} from '@school/shared';
import { Button, Input, Label, Textarea, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface PlatformMaintenanceWindow {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  cancelled_at: string | null;
}

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

export default function PlatformMaintenancePage() {
  const [windows, setWindows] = React.useState<PlatformMaintenanceWindow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const form = useForm<CreateAlertMaintenanceWindowDto>({
    resolver: zodResolver(createAlertMaintenanceWindowSchema),
    defaultValues: {
      title: '',
      description: '',
      starts_at: new Date(),
      ends_at: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<PlatformMaintenanceWindow[]>(
        '/api/v1/admin/alert-maintenance-windows',
      );
      setWindows(result);
    } catch (err: unknown) {
      console.error('[PlatformMaintenancePage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load maintenance windows.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function submit(values: CreateAlertMaintenanceWindowDto) {
    try {
      setSaving(true);
      const created = await apiClient<PlatformMaintenanceWindow>(
        '/api/v1/admin/alert-maintenance-windows',
        { method: 'POST', body: JSON.stringify(values) },
      );
      setWindows((current) => [created, ...current]);
      form.reset({
        title: '',
        description: '',
        starts_at: new Date(),
        ends_at: new Date(Date.now() + 60 * 60 * 1000),
      });
      toast.success('Maintenance window scheduled.');
    } catch (err: unknown) {
      console.error('[PlatformMaintenancePage.submit]', err);
      toast.error(getErrorMessage(err, 'Failed to schedule maintenance window.'));
    } finally {
      setSaving(false);
    }
  }

  async function cancelWindow(id: string) {
    const reason = window.prompt('Reason for cancelling this window');
    if (!reason) return;
    const parsed = cancelAlertMaintenanceWindowSchema.safeParse({ reason });
    if (!parsed.success) {
      toast.error('Give a clear cancellation reason.');
      return;
    }

    try {
      const body: CancelAlertMaintenanceWindowDto = parsed.data;
      const updated = await apiClient<PlatformMaintenanceWindow>(
        `/api/v1/admin/alert-maintenance-windows/${id}`,
        { method: 'DELETE', body: JSON.stringify(body) },
      );
      setWindows((current) =>
        current.map((windowRow) => (windowRow.id === id ? updated : windowRow)),
      );
      toast.success('Maintenance window cancelled.');
    } catch (err: unknown) {
      console.error('[PlatformMaintenancePage.cancelWindow]', err);
      toast.error(getErrorMessage(err, 'Failed to cancel maintenance window.'));
    }
  }

  const now = Date.now();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Alert Maintenance"
        description="Schedule platform alert suppression for planned work."
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
          <div className="md:col-span-2">
            <Label htmlFor="maintenance-title">Title</Label>
            <Input id="maintenance-title" className="mt-1" {...form.register('title')} />
          </div>
          <div>
            <Label htmlFor="maintenance-start">Starts</Label>
            <Input
              id="maintenance-start"
              className="mt-1"
              type="datetime-local"
              defaultValue={toDateTimeLocal(new Date())}
              {...form.register('starts_at', { valueAsDate: true })}
            />
          </div>
          <div>
            <Label htmlFor="maintenance-end">Ends</Label>
            <Input
              id="maintenance-end"
              className="mt-1"
              type="datetime-local"
              defaultValue={toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000))}
              {...form.register('ends_at', { valueAsDate: true })}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="maintenance-description">Description</Label>
            <Textarea
              id="maintenance-description"
              className="mt-1 min-h-24"
              {...form.register('description')}
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={saving}>
            <CalendarClock className="me-1.5 h-4 w-4" />
            Schedule window
          </Button>
        </div>
      </form>

      <section className="rounded-lg border border-border bg-surface">
        <header className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Scheduled windows</h2>
        </header>
        {loading ? (
          <div className="p-4 text-sm text-text-secondary">Loading windows...</div>
        ) : windows.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-secondary">
            No alert maintenance windows scheduled.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {windows.map((windowRow) => {
              const active =
                !windowRow.cancelled_at &&
                new Date(windowRow.starts_at).getTime() <= now &&
                new Date(windowRow.ends_at).getTime() > now;
              return (
                <li
                  key={windowRow.id}
                  className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-info-bg px-2 py-1 text-xs font-semibold text-info-text">
                        {active ? 'Active' : windowRow.cancelled_at ? 'Cancelled' : 'Scheduled'}
                      </span>
                      <span className="text-sm font-semibold text-text-primary">
                        {windowRow.title}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-tertiary">
                      {formatWindow(windowRow.starts_at, windowRow.ends_at)}
                    </p>
                    {windowRow.description ? (
                      <p className="mt-1 text-sm text-text-secondary">{windowRow.description}</p>
                    ) : null}
                  </div>
                  {!windowRow.cancelled_at && new Date(windowRow.ends_at).getTime() > now ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void cancelWindow(windowRow.id)}
                    >
                      <XCircle className="me-1.5 h-3.5 w-3.5" />
                      Cancel
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
