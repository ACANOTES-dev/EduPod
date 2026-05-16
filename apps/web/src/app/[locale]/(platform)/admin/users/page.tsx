'use client';

import { Search, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import type { InvitePlatformUserDto } from '@school/shared';
import { Button, Input, StatusBadge, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import { useAuth } from '@/providers/auth-provider';

import { InvitePlatformUserDialog } from './_components/invite-platform-user-dialog';
import { PlatformUserCard } from './_components/platform-user-card';
import type { PlatformUser } from './_components/platform-user-types';

interface SupportUser {
  created_at: string;
  email: string;
  first_name: string;
  global_status: 'active' | 'suspended' | 'disabled';
  id: string;
  last_login_at: string | null;
  last_name: string;
  locked_until: string | null;
  memberships: Array<{
    membership_status: string;
    tenant: { id: string; name: string; slug: string; status: string };
  }>;
  mfa_enabled: boolean;
}

interface SupportUsersResponse {
  data: SupportUser[];
  meta: { page: number; pageSize: number; total: number };
}

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
  const [supportUsers, setSupportUsers] = React.useState<SupportUser[]>([]);
  const [supportTotal, setSupportTotal] = React.useState(0);
  const [search, setSearch] = React.useState('');
  const [loadingSupportUsers, setLoadingSupportUsers] = React.useState(true);
  const [platformUsers, setPlatformUsers] = React.useState<PlatformUser[]>([]);
  const [loadingPlatformUsers, setLoadingPlatformUsers] = React.useState(true);
  const [inviteLoading, setInviteLoading] = React.useState(false);

  const can = React.useCallback((permission: string) => permissions.has(permission), [permissions]);

  const loadSupportUsers = React.useCallback(async () => {
    if (!can('platform.users.reset_password')) {
      setLoadingSupportUsers(false);
      return;
    }
    try {
      setLoadingSupportUsers(true);
      const params = new URLSearchParams({ page: '1', pageSize: '20' });
      if (search.trim()) params.set('search', search.trim());
      const result = await apiClient<SupportUsersResponse>(
        `/api/v1/admin/users?${params.toString()}`,
      );
      setSupportUsers(result.data);
      setSupportTotal(result.meta.total);
    } catch (err: unknown) {
      console.error('[PlatformUsersPage.loadSupportUsers]', err);
      toast.error(getErrorMessage(err, 'Failed to load users.'));
    } finally {
      setLoadingSupportUsers(false);
    }
  }, [can, search]);

  const loadPlatformUsers = React.useCallback(async () => {
    if (!can('platform.platform_users.view')) {
      setLoadingPlatformUsers(false);
      return;
    }
    try {
      setLoadingPlatformUsers(true);
      const result = await apiClient<PlatformUser[]>('/api/v1/admin/platform-users');
      setPlatformUsers(result);
    } catch (err: unknown) {
      console.error('[PlatformUsersPage.loadPlatformUsers]', err);
      toast.error(getErrorMessage(err, 'Failed to load platform users.'));
    } finally {
      setLoadingPlatformUsers(false);
    }
  }, [can]);

  React.useEffect(() => {
    const timeout = setTimeout(() => void loadSupportUsers(), 250);
    return () => clearTimeout(timeout);
  }, [loadSupportUsers]);

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Find school users for support actions and manage platform operator access."
        actions={
          can('platform.platform_users.invite') ? (
            <InvitePlatformUserDialog loading={inviteLoading} onSubmit={invite} />
          ) : undefined
        }
      />

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            <UserRound className="h-4 w-4" />
            Support user search
          </h2>
          <p className="text-sm text-text-secondary">
            Search all platform users by name or email, then open a profile for recovery actions.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              className="ps-9"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => void loadSupportUsers()}>
            Search
          </Button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead>
              <tr className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
                <th className="py-2 pe-4 text-start">Name</th>
                <th className="px-4 py-2 text-start">Status</th>
                <th className="px-4 py-2 text-start">Tenants</th>
                <th className="px-4 py-2 text-start">Last login</th>
                <th className="py-2 ps-4 text-end">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loadingSupportUsers ? (
                <tr>
                  <td className="py-6 text-text-secondary" colSpan={5}>
                    Loading users...
                  </td>
                </tr>
              ) : supportUsers.length === 0 ? (
                <tr>
                  <td className="py-6 text-text-secondary" colSpan={5}>
                    No users found.
                  </td>
                </tr>
              ) : (
                supportUsers.map((supportUser) => (
                  <tr key={supportUser.id}>
                    <td className="py-3 pe-4">
                      <div className="font-medium text-text-primary">
                        {supportUser.first_name} {supportUser.last_name}
                      </div>
                      <div className="break-all text-xs text-text-secondary">
                        {supportUser.email}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={statusVariant(supportUser.global_status)} dot>
                        {supportUser.global_status}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {supportUser.memberships.length}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDateTime(supportUser.last_login_at) || 'Never'}
                    </td>
                    <td className="py-3 ps-4 text-end">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/${params.locale}/admin/users/${supportUser.id}`}>View</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-text-secondary">{supportTotal} users found.</p>
      </section>

      {can('platform.platform_users.view') ? (
        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <ShieldCheck className="h-4 w-4" />
              Platform operators
            </h2>
            <p className="text-sm text-text-secondary">
              Operator accounts with platform-level roles and permissions.
            </p>
          </div>

          {loadingPlatformUsers ? (
            <div className="mt-4 rounded-lg border border-border bg-surface-secondary p-4 text-sm text-text-secondary">
              Loading platform users...
            </div>
          ) : platformUsers.length === 0 ? (
            <div className="mt-4 rounded-lg border border-border bg-surface-secondary p-4 text-sm text-text-secondary">
              No platform users found.
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {platformUsers.map((platformUser) => (
                <PlatformUserCard
                  key={platformUser.id}
                  locale={params.locale}
                  user={platformUser}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function statusVariant(status: SupportUser['global_status']): 'danger' | 'neutral' | 'success' {
  if (status === 'active') return 'success';
  if (status === 'disabled') return 'danger';
  return 'neutral';
}
