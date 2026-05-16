'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import type { PlatformRoleKey, PlatformUser } from '../_components/platform-user-types';
import { RoleSelector } from '../_components/role-selector';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformUserDetailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [platformUser, setPlatformUser] = React.useState<PlatformUser | null>(null);
  const [roleKeys, setRoleKeys] = React.useState<PlatformRoleKey[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  const loadUser = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<PlatformUser>(`/api/v1/admin/platform-users/${params.id}`);
      setPlatformUser(result);
      setRoleKeys(result.roles.map((role) => role.role.role_key));
    } catch (err: unknown) {
      console.error('[PlatformUserDetailPage.loadUser]', err);
      toast.error(getErrorMessage(err, 'Failed to load platform user.'));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void loadUser();
  }, [loadUser]);

  async function saveRoles() {
    try {
      setSaving(true);
      const result = await apiClient<PlatformUser>(
        `/api/v1/admin/platform-users/${params.id}/roles`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role_keys: roleKeys }),
        },
      );
      setPlatformUser(result);
      setRoleKeys(result.roles.map((role) => role.role.role_key));
      toast.success('Roles updated.');
    } catch (err: unknown) {
      console.error('[PlatformUserDetailPage.saveRoles]', err);
      toast.error(getErrorMessage(err, 'Failed to update platform roles.'));
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!window.confirm('Revoke platform access for this user?')) return;
    try {
      setRevoking(true);
      await apiClient(`/api/v1/admin/platform-users/${params.id}`, { method: 'DELETE' });
      toast.success('Platform access revoked.');
      router.push(`/${params.locale}/admin/users`);
    } catch (err: unknown) {
      console.error('[PlatformUserDetailPage.revoke]', err);
      toast.error(getErrorMessage(err, 'Failed to revoke platform access.'));
    } finally {
      setRevoking(false);
    }
  }

  if (loading || !platformUser) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
        Loading platform user...
      </div>
    );
  }

  const isSelf = currentUser?.id === platformUser.user_id;
  const ownsRole = roleKeys.includes('platform_owner');

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${platformUser.user.first_name} ${platformUser.user.last_name}`}
        description={platformUser.user.email}
        back={{ href: `/${params.locale}/admin/users`, label: 'Back to platform users' }}
      />

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Roles</h2>
        <div className="mt-4">
          <RoleSelector
            value={roleKeys}
            onChange={setRoleKeys}
            disableOwnerRemoval={isSelf && ownsRole}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={saveRoles} disabled={saving}>
            {saving ? 'Saving...' : 'Save roles'}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={revoke}
            disabled={revoking || (isSelf && ownsRole)}
          >
            <Trash2 className="me-2 h-4 w-4" />
            {revoking ? 'Revoking...' : 'Revoke access'}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-primary">Access</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-secondary">Status</dt>
            <dd className="font-medium text-text-primary">
              {platformUser.revoked_at ? 'Revoked' : 'Active'}
            </dd>
          </div>
          <div>
            <dt className="text-text-secondary">Last login</dt>
            <dd className="font-medium text-text-primary">
              {platformUser.user.last_login_at
                ? new Date(platformUser.user.last_login_at).toLocaleString()
                : 'Never'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
