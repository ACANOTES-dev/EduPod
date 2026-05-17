'use client';

import { Pencil, ShieldCheck, Trash2, UserCheck, UserPlus } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { InvitePlatformUserDto } from '@school/shared';
import { Button, StatusBadge, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import { useAuth } from '@/providers/auth-provider';

import type { PlatformUser } from '../users/_components/platform-user-types';

import { InviteDialog } from './_components/invite-dialog';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformUsersPage({ params }: { params: { locale: string } }) {
  const { user } = useAuth();
  const permissions = React.useMemo(
    () => new Set(user?.platform_permissions ?? []),
    [user?.platform_permissions],
  );
  const [platformUsers, setPlatformUsers] = React.useState<PlatformUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteLoading, setInviteLoading] = React.useState(false);
  const [revokingId, setRevokingId] = React.useState<string | null>(null);

  const can = React.useCallback((permission: string) => permissions.has(permission), [permissions]);

  const loadPlatformUsers = React.useCallback(async () => {
    if (!can('platform.platform_users.view')) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await apiClient<PlatformUser[]>('/api/v1/admin/platform-users');
      setPlatformUsers(result);
    } catch (err: unknown) {
      console.error('[PlatformUsersPage.loadPlatformUsers]', err);
      toast.error(getErrorMessage(err, 'Failed to load platform users.'));
    } finally {
      setLoading(false);
    }
  }, [can]);

  React.useEffect(() => {
    void loadPlatformUsers();
  }, [loadPlatformUsers]);

  async function invite(dto: InvitePlatformUserDto) {
    try {
      setInviteLoading(true);
      await apiClient('/api/v1/admin/platform-users/invite', {
        method: 'POST',
        body: JSON.stringify(dto),
      });
      toast.success('Platform invite created.');
      await loadPlatformUsers();
    } catch (err: unknown) {
      console.error('[PlatformUsersPage.invite]', err);
      toast.error(getErrorMessage(err, 'Failed to invite platform user.'));
      throw err;
    } finally {
      setInviteLoading(false);
    }
  }

  async function revoke(platformUser: PlatformUser) {
    if (!window.confirm(`Revoke platform access for ${platformUser.user.email}?`)) {
      return;
    }

    try {
      setRevokingId(platformUser.id);
      await apiClient(`/api/v1/admin/platform-users/${platformUser.id}`, { method: 'DELETE' });
      toast.success('Platform access revoked.');
      await loadPlatformUsers();
    } catch (err: unknown) {
      console.error('[PlatformUsersPage.revoke]', err);
      toast.error(getErrorMessage(err, 'Failed to revoke platform access.'));
    } finally {
      setRevokingId(null);
    }
  }

  async function activate(platformUser: PlatformUser) {
    try {
      setRevokingId(platformUser.id);
      await apiClient(`/api/v1/admin/platform-users/${platformUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: true }),
      });
      toast.success('Platform access restored.');
      await loadPlatformUsers();
    } catch (err: unknown) {
      console.error('[PlatformUsersPage.activate]', err);
      toast.error(getErrorMessage(err, 'Failed to restore platform access.'));
    } finally {
      setRevokingId(null);
    }
  }

  const canInvite = can('platform.platform_users.invite');
  const canAssignRoles = can('platform.platform_users.assign_roles');
  const canRevoke = can('platform.platform_users.revoke');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Users"
        description="Manage operator access for the platform dashboard."
        actions={canInvite ? <InviteDialog loading={inviteLoading} onSubmit={invite} /> : undefined}
      />

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <ShieldCheck className="h-4 w-4" />
              Operators
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Owners have full control. Support users keep read and support access without
              destructive platform powers.
            </p>
          </div>
          {canInvite ? (
            <div className="hidden items-center gap-2 text-xs text-text-secondary sm:flex">
              <UserPlus className="h-4 w-4" />
              Invite support first by default
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="bg-surface-secondary text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <th className="py-3 pe-4 ps-5 text-start">Name</th>
                <th className="px-4 py-3 text-start">Role</th>
                <th className="px-4 py-3 text-start">Status</th>
                <th className="px-4 py-3 text-start">Last login</th>
                <th className="px-4 py-3 text-start">Invited</th>
                <th className="py-3 pe-5 ps-4 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td className="px-5 py-8 text-text-secondary" colSpan={6}>
                    Loading platform users...
                  </td>
                </tr>
              ) : platformUsers.length === 0 ? (
                <tr>
                  <td className="px-5 py-8 text-text-secondary" colSpan={6}>
                    No platform users found.
                  </td>
                </tr>
              ) : (
                platformUsers.map((platformUser) => {
                  const roles = platformUser.roles.map((role) => role.role.role_key);
                  const isOwner = roles.includes('platform_owner');
                  const revoked = Boolean(platformUser.revoked_at);
                  return (
                    <tr key={platformUser.id}>
                      <td className="py-4 pe-4 ps-5">
                        <div className="font-medium text-text-primary">
                          {platformUser.user.first_name} {platformUser.user.last_name}
                        </div>
                        <div className="break-all text-xs text-text-secondary">
                          {platformUser.user.email}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={isOwner ? 'info' : 'neutral'} dot>
                          {isOwner ? 'platform_owner' : 'platform_support'}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge status={revoked ? 'danger' : 'success'} dot>
                          {revoked ? 'Revoked' : 'Active'}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-text-secondary">
                        {formatDateTime(platformUser.user.last_login_at) || 'Never'}
                      </td>
                      <td className="px-4 py-4 text-text-secondary">
                        {formatDateTime(platformUser.invited_at)}
                      </td>
                      <td className="py-4 pe-5 ps-4">
                        <div className="flex justify-end gap-2">
                          {canAssignRoles ? (
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/${params.locale}/admin/users/${platformUser.id}`}>
                                <Pencil className="me-2 h-4 w-4" />
                                Edit
                              </Link>
                            </Button>
                          ) : null}
                          {canAssignRoles && revoked ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void activate(platformUser)}
                              disabled={revokingId === platformUser.id}
                            >
                              <UserCheck className="me-2 h-4 w-4" />
                              {revokingId === platformUser.id ? 'Restoring...' : 'Activate'}
                            </Button>
                          ) : null}
                          {canRevoke && !revoked ? (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => void revoke(platformUser)}
                              disabled={revokingId === platformUser.id}
                            >
                              <Trash2 className="me-2 h-4 w-4" />
                              {revokingId === platformUser.id ? 'Revoking...' : 'Remove'}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
