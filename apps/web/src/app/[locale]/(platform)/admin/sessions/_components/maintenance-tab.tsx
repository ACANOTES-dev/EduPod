'use client';

import { CalendarPlus, Trash2 } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from '@school/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

interface Tenant {
  id: string;
  maintenance_message: string | null;
  maintenance_mode: boolean;
  name: string;
  slug: string;
  status: string;
}

interface TenantListResponse {
  data: Tenant[];
}

interface TenantMaintenanceWindow {
  id: string;
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  message: string | null;
  tenant: { id: string; maintenance_mode: boolean; name: string; slug: string };
  creator: { email: string; first_name: string; last_name: string };
}

interface ScheduleFormState {
  tenant_id: string;
  starts_at: string;
  ends_at: string;
  message: string;
}

export function MaintenanceTab() {
  const [tenants, setTenants] = React.useState<Tenant[]>([]);
  const [windows, setWindows] = React.useState<TenantMaintenanceWindow[]>([]);
  const [messages, setMessages] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(true);
  const [savingTenantId, setSavingTenantId] = React.useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [scheduling, setScheduling] = React.useState(false);
  const [cancelWindowId, setCancelWindowId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<ScheduleFormState>({
    tenant_id: '',
    starts_at: '',
    ends_at: '',
    message: '',
  });

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [tenantResult, windowResult] = await Promise.all([
        apiClient<TenantListResponse>('/api/v1/admin/tenants?page=1&pageSize=100'),
        apiClient<TenantMaintenanceWindow[]>('/api/v1/admin/maintenance-windows'),
      ]);
      setTenants(tenantResult.data);
      setWindows(windowResult);
      setMessages((current) => {
        const next = { ...current };
        for (const tenant of tenantResult.data) {
          if (!(tenant.id in next)) {
            next[tenant.id] = tenant.maintenance_message ?? '';
          }
        }
        return next;
      });
      setForm((current) => ({
        ...current,
        tenant_id: current.tenant_id || tenantResult.data[0]?.id || '',
      }));
    } catch (err: unknown) {
      console.error('[MaintenanceTab.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load maintenance state.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function toggleTenant(tenant: Tenant, enabled: boolean) {
    try {
      setSavingTenantId(tenant.id);
      const message = messages[tenant.id]?.trim();
      const updated = await apiClient<Tenant>(`/api/v1/admin/tenants/${tenant.id}/maintenance`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled,
          ...(enabled && message ? { message } : {}),
        }),
      });
      setTenants((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setMessages((current) => ({
        ...current,
        [updated.id]: updated.maintenance_message ?? current[updated.id] ?? '',
      }));
      toast.success(enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.');
    } catch (err: unknown) {
      console.error('[MaintenanceTab.toggleTenant]', err);
      toast.error(getErrorMessage(err, 'Failed to update maintenance mode.'));
    } finally {
      setSavingTenantId(null);
    }
  }

  async function scheduleWindow() {
    if (!form.tenant_id || !form.starts_at || !form.ends_at) {
      toast.error('Select a tenant and both window times.');
      return;
    }

    try {
      setScheduling(true);
      await apiClient<TenantMaintenanceWindow>('/api/v1/admin/maintenance-windows', {
        method: 'POST',
        body: JSON.stringify({
          tenant_id: form.tenant_id,
          starts_at: new Date(form.starts_at).toISOString(),
          ends_at: new Date(form.ends_at).toISOString(),
          ...(form.message.trim() ? { message: form.message.trim() } : {}),
        }),
      });
      toast.success('Maintenance window scheduled.');
      setScheduleOpen(false);
      setForm({
        tenant_id: tenants[0]?.id ?? '',
        starts_at: '',
        ends_at: '',
        message: '',
      });
      await load();
    } catch (err: unknown) {
      console.error('[MaintenanceTab.scheduleWindow]', err);
      toast.error(getErrorMessage(err, 'Failed to schedule maintenance window.'));
    } finally {
      setScheduling(false);
    }
  }

  async function cancelWindow() {
    if (!cancelWindowId) return;
    try {
      await apiClient(`/api/v1/admin/maintenance-windows/${cancelWindowId}`, {
        method: 'DELETE',
      });
      toast.success('Maintenance window cancelled.');
      setCancelWindowId(null);
      await load();
    } catch (err: unknown) {
      console.error('[MaintenanceTab.cancelWindow]', err);
      toast.error(getErrorMessage(err, 'Failed to cancel maintenance window.'));
    }
  }

  return (
    <section className="space-y-5">
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-text-primary">Active maintenance</h2>
          <p className="text-sm text-text-secondary">
            Tenant mutations are blocked while maintenance mode is active. Reads remain available.
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {loading ? (
            <div className="rounded-lg bg-surface-secondary p-4 text-sm text-text-secondary">
              Loading tenants...
            </div>
          ) : (
            tenants.map((tenant) => (
              <div key={tenant.id} className="rounded-lg border border-border bg-background p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-text-primary">
                      {tenant.name}
                    </h3>
                    <p className="text-xs text-text-secondary">{tenant.slug}</p>
                  </div>
                  <Switch
                    checked={tenant.maintenance_mode}
                    disabled={savingTenantId === tenant.id}
                    onCheckedChange={(checked) => void toggleTenant(tenant, checked)}
                    aria-label={`Toggle maintenance for ${tenant.name}`}
                  />
                </div>
                <div className="mt-4">
                  <Textarea
                    value={messages[tenant.id] ?? ''}
                    onChange={(event) =>
                      setMessages((current) => ({
                        ...current,
                        [tenant.id]: event.target.value,
                      }))
                    }
                    placeholder="Optional maintenance message"
                    maxLength={500}
                  />
                </div>
                {tenant.maintenance_mode ? (
                  <div className="mt-3 rounded-lg border border-warning-border bg-warning-bg p-3 text-sm text-warning-text">
                    {tenant.maintenance_message ||
                      'This school is currently undergoing maintenance.'}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Scheduled windows</h2>
            <p className="mt-1 text-sm text-text-secondary">
              Upcoming windows auto-enter and exit maintenance mode.
            </p>
          </div>
          <Button type="button" onClick={() => setScheduleOpen(true)}>
            <CalendarPlus className="me-2 h-4 w-4" />
            Schedule maintenance
          </Button>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <th className="py-2 pe-4 text-start">Tenant</th>
                <th className="px-4 py-2 text-start">Start</th>
                <th className="px-4 py-2 text-start">End</th>
                <th className="px-4 py-2 text-start">Message</th>
                <th className="px-4 py-2 text-start">Created by</th>
                <th className="py-2 ps-4 text-end">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {windows.length === 0 ? (
                <tr>
                  <td className="py-6 text-text-secondary" colSpan={6}>
                    No upcoming windows.
                  </td>
                </tr>
              ) : (
                windows.map((windowRow) => {
                  const active = isActiveWindow(windowRow);
                  return (
                    <tr key={windowRow.id} className={active ? 'bg-warning-bg/60' : undefined}>
                      <td className="py-3 pe-4">
                        <div className="font-medium text-text-primary">{windowRow.tenant.name}</div>
                        <div className="text-xs text-text-secondary">{windowRow.tenant.slug}</div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDateTime(windowRow.starts_at)}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {formatDateTime(windowRow.ends_at)}
                      </td>
                      <td className="max-w-sm px-4 py-3 text-text-secondary">
                        <span className="line-clamp-2 break-words">
                          {windowRow.message || 'Default message'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {windowRow.creator.first_name} {windowRow.creator.last_name}
                      </td>
                      <td className="py-3 ps-4 text-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setCancelWindowId(windowRow.id)}
                        >
                          <Trash2 className="me-2 h-4 w-4" />
                          Cancel
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule maintenance</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary">Tenant</label>
              <Select
                value={form.tenant_id}
                onValueChange={(value) => setForm((current) => ({ ...current, tenant_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-text-primary">Start</label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, starts_at: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-text-primary">End</label>
                <Input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, ends_at: event.target.value }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-text-primary">Message</label>
              <Textarea
                value={form.message}
                onChange={(event) =>
                  setForm((current) => ({ ...current, message: event.target.value }))
                }
                maxLength={500}
                placeholder="Optional message shown during maintenance"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={scheduling}
              onClick={() => setScheduleOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={scheduling} onClick={() => void scheduleWindow()}>
              {scheduling ? 'Scheduling...' : 'Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelWindowId !== null}
        onOpenChange={(open) => {
          if (!open) setCancelWindowId(null);
        }}
        title="Cancel maintenance window"
        description="This removes the scheduled window. If the tenant is already in maintenance mode, use the tenant toggle to exit maintenance."
        confirmLabel="Cancel window"
        cancelLabel="Keep window"
        variant="warning"
        onConfirm={() => void cancelWindow()}
      />
    </section>
  );
}

function isActiveWindow(windowRow: TenantMaintenanceWindow): boolean {
  const now = Date.now();
  return (
    new Date(windowRow.starts_at).getTime() <= now && new Date(windowRow.ends_at).getTime() > now
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
