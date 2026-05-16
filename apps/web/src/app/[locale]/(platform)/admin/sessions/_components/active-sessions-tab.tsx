'use client';

import { ChevronDown, ChevronRight, LogOut, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Button, StatusBadge, toast } from '@school/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

interface UserSession {
  session_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  ip_address: string;
  user_agent: string;
  last_active_at: string;
  created_at: string;
}

interface TenantSessionGroup {
  tenant_id: string | null;
  tenant_name: string | null;
  user_count: number;
  sessions: UserSession[];
}

type PendingLogout =
  | { kind: 'tenant'; id: string; label: string }
  | { kind: 'user'; id: string; label: string }
  | null;

export function ActiveSessionsTab() {
  const [groups, setGroups] = React.useState<TenantSessionGroup[]>([]);
  const [expandedTenants, setExpandedTenants] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [pendingLogout, setPendingLogout] = React.useState<PendingLogout>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const loadSessions = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<TenantSessionGroup[]>('/api/v1/admin/sessions');
      setGroups(result);
    } catch (err: unknown) {
      console.error('[ActiveSessionsTab.loadSessions]', err);
      toast.error(getErrorMessage(err, 'Failed to load active sessions.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadSessions();
    const interval = setInterval(() => void loadSessions(), 30_000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const toggleExpanded = React.useCallback((key: string) => {
    setExpandedTenants((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  async function confirmLogout() {
    if (!pendingLogout) return;
    try {
      setSubmitting(true);
      const endpoint =
        pendingLogout.kind === 'tenant'
          ? `/api/v1/admin/sessions/tenant/${pendingLogout.id}`
          : `/api/v1/admin/sessions/user/${pendingLogout.id}`;
      const result = await apiClient<{ logged_out: number }>(endpoint, { method: 'DELETE' });
      toast.success(
        `Logged out ${result.logged_out} session${result.logged_out === 1 ? '' : 's'}.`,
      );
      setPendingLogout(null);
      await loadSessions();
    } catch (err: unknown) {
      console.error('[ActiveSessionsTab.confirmLogout]', err);
      toast.error(getErrorMessage(err, 'Failed to force logout sessions.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Active sessions</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Grouped by tenant with the platform session group shown first.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void loadSessions()}>
          <RefreshCw className="me-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="mt-5 space-y-3">
        {loading ? (
          <div className="rounded-lg bg-surface-secondary p-4 text-sm text-text-secondary">
            Loading sessions...
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-lg bg-surface-secondary p-4 text-sm text-text-secondary">
            No active sessions found.
          </div>
        ) : (
          groups.map((group) => {
            const key = group.tenant_id ?? 'platform';
            const expanded = expandedTenants.has(key);
            return (
              <div key={key} className="rounded-lg border border-border bg-background">
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-2 text-start"
                    onClick={() => toggleExpanded(key)}
                  >
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-text-primary">
                        {group.tenant_name ?? 'Platform Sessions'}
                      </span>
                      <span className="block text-xs text-text-secondary">
                        {group.user_count} user{group.user_count === 1 ? '' : 's'} online,{' '}
                        {group.sessions.length} session{group.sessions.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={group.tenant_id ? 'success' : 'neutral'} dot>
                      {group.tenant_id ? 'Tenant' : 'Platform'}
                    </StatusBadge>
                    {group.tenant_id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          setPendingLogout({
                            kind: 'tenant',
                            id: group.tenant_id ?? '',
                            label: group.tenant_name ?? 'tenant',
                          })
                        }
                      >
                        <LogOut className="me-2 h-4 w-4" />
                        Force logout tenant
                      </Button>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className="overflow-x-auto border-t border-border">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <thead>
                        <tr className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                          <th className="py-2 pe-4 ps-4 text-start">User</th>
                          <th className="px-4 py-2 text-start">IP</th>
                          <th className="px-4 py-2 text-start">Last active</th>
                          <th className="px-4 py-2 text-start">Device</th>
                          <th className="py-2 pe-4 ps-4 text-end">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {group.sessions.map((session) => (
                          <tr key={session.session_id}>
                            <td className="py-3 pe-4 ps-4">
                              <div className="font-medium text-text-primary">
                                {session.user_name}
                              </div>
                              <div className="break-all text-xs text-text-secondary">
                                {session.user_email}
                              </div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                              {session.ip_address || 'Unknown'}
                            </td>
                            <td className="px-4 py-3 text-text-secondary">
                              {formatDateTime(session.last_active_at)}
                            </td>
                            <td className="max-w-sm px-4 py-3 text-text-secondary">
                              <span className="line-clamp-2 break-words">
                                {session.user_agent || 'Unknown'}
                              </span>
                            </td>
                            <td className="py-3 pe-4 ps-4 text-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setPendingLogout({
                                    kind: 'user',
                                    id: session.user_id,
                                    label: session.user_name,
                                  })
                                }
                              >
                                Force logout
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={pendingLogout !== null}
        onOpenChange={(open) => {
          if (!open) setPendingLogout(null);
        }}
        title="Force logout"
        description={
          pendingLogout
            ? `This will revoke active sessions for ${pendingLogout.label}. Users will need to sign in again.`
            : ''
        }
        confirmLabel={submitting ? 'Logging out...' : 'Force logout'}
        cancelLabel="Cancel"
        variant="destructive"
        busy={submitting}
        onConfirm={() => void confirmLogout()}
      />
    </section>
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
