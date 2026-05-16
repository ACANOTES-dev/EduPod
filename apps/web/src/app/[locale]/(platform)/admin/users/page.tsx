'use client';

import * as React from 'react';

import type { InvitePlatformUserDto } from '@school/shared';
import { toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { InvitePlatformUserDialog } from './_components/invite-platform-user-dialog';
import { PlatformUserCard } from './_components/platform-user-card';
import type { PlatformUser } from './_components/platform-user-types';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformUsersPage({ params }: { params: { locale: string } }) {
  const [users, setUsers] = React.useState<PlatformUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteLoading, setInviteLoading] = React.useState(false);

  const loadUsers = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<PlatformUser[]>('/api/v1/admin/platform-users');
      setUsers(result);
    } catch (err: unknown) {
      console.error('[PlatformUsersPage.loadUsers]', err);
      toast.error(getErrorMessage(err, 'Failed to load platform users.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function invite(dto: InvitePlatformUserDto) {
    try {
      setInviteLoading(true);
      await apiClient('/api/v1/admin/platform-users/invite', {
        method: 'POST',
        body: JSON.stringify(dto),
      });
      toast.success('Platform invite created.');
      await loadUsers();
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
        title="Platform Users"
        description="Operator accounts with platform-level access."
        actions={<InvitePlatformUserDialog loading={inviteLoading} onSubmit={invite} />}
      />

      {loading ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          Loading platform users...
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          No platform users found.
        </div>
      ) : (
        <div className="grid gap-3">
          {users.map((user) => (
            <PlatformUserCard key={user.id} locale={params.locale} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
