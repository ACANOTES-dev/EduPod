'use client';

import { ArrowLeft, KeyRound, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button, StatusBadge, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import { useAuth } from '@/providers/auth-provider';

import { AuditActionsTable } from '../../_components/audit-actions-table';
import { SupportActionsPanel } from '../../_components/support-actions-panel';
import type { PlatformRoleKey, PlatformUser } from '../_components/platform-user-types';
import { RoleSelector } from '../_components/role-selector';

interface SupportUserDetail {
  created_at: string;
  email: string;
  email_verified_at: string | null;
  failed_login_attempts: number;
  first_name: string;
  global_status: 'active' | 'suspended' | 'disabled';
  id: string;
  last_login_at: string | null;
  last_name: string;
  locked_until: string | null;
  memberships: Array<{
    id: string;
    membership_roles: Array<{
      role: { display_name: string; id: string; role_key: string };
      role_id: string;
    }>;
    membership_status: string;
    tenant: { id: string; name: string; slug: string; status: string };
  }>;
  mfa_enabled: boolean;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function UserDetailPage({ params }: { params: { id: string; locale: string } }) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [supportUser, setSupportUser] = React.useState<SupportUserDetail | null>(null);
  const [platformUser, setPlatformUser] = React.useState<PlatformUser | null>(null);
  const [roleKeys, setRoleKeys] = React.useState<PlatformRoleKey[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);

  const loadUser = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<SupportUserDetail>(`/api/v1/admin/users/${params.id}`, {
        silent: true,
      });
      setSupportUser(result);
      setPlatformUser(null);
    } catch (supportErr: unknown) {
      try {
        const result = await apiClient<PlatformUser>(`/api/v1/admin/platform-users/${params.id}`, {
          silent: true,
        });
        setPlatformUser(result);
        setRoleKeys(result.roles.map((role) => role.role.role_key));
        setSupportUser(null);
      } catch (platformErr: unknown) {
        console.error('[UserDetailPage.loadUser.support]', supportErr);
        console.error('[UserDetailPage.loadUser.platform]', platformErr);
        toast.error(getErrorMessage(platformErr, 'Failed to load user.'));
      }
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void loadUser();
  }, [loadUser]);

  async function saveRoles() {
    if (!platformUser) return;

    try {
      setSaving(true);
      const result = await apiClient<PlatformUser>(
        `/api/v1/admin/platform-users/${platformUser.id}/roles`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role_keys: roleKeys }),
        },
      );
      setPlatformUser(result);
      setRoleKeys(result.roles.map((role) => role.role.role_key));
      toast.success('Roles updated.');
    } catch (err: unknown) {
      console.error('[UserDetailPage.saveRoles]', err);
      toast.error(getErrorMessage(err, 'Failed to update platform roles.'));
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (!platformUser || !window.confirm('Revoke platform access for this user?')) return;
    try {
      setRevoking(true);
      await apiClient(`/api/v1/admin/platform-users/${platformUser.id}`, { method: 'DELETE' });
      toast.success('Platform access revoked.');
      router.push(`/${params.locale}/admin/users`);
    } catch (err: unknown) {
      console.error('[UserDetailPage.revoke]', err);
      toast.error(getErrorMessage(err, 'Failed to revoke platform access.'));
    } finally {
      setRevoking(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
        Loading user...
      </div>
    );
  }

  if (supportUser) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={`${supportUser.first_name} ${supportUser.last_name}`}
          description={supportUser.email}
          back={{ href: `/${params.locale}/admin/users`, label: 'Back to users' }}
        />

        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Profile</h2>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <Info label="Status">
                  <StatusBadge status={statusVariant(supportUser.global_status)} dot>
                    {supportUser.global_status}
                  </StatusBadge>
                </Info>
                <Info label="MFA">{supportUser.mfa_enabled ? 'Enabled' : 'Not enabled'}</Info>
                <Info label="Last login">
                  {formatDateTime(supportUser.last_login_at) || 'Never'}
                </Info>
                <Info label="Locked until">
                  {formatDateTime(supportUser.locked_until) || 'Not locked'}
                </Info>
                <Info label="Failed attempts">{String(supportUser.failed_login_attempts)}</Info>
                <Info label="Created">{formatDateTime(supportUser.created_at)}</Info>
              </dl>
            </div>
            <KeyRound className="hidden h-8 w-8 text-text-tertiary sm:block" />
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">Tenant memberships</h2>
          <div className="mt-4 grid gap-3">
            {supportUser.memberships.length === 0 ? (
              <p className="text-sm text-text-secondary">No tenant memberships.</p>
            ) : (
              supportUser.memberships.map((membership) => (
                <div
                  key={membership.id}
                  className="rounded-lg border border-border bg-surface-secondary p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-medium text-text-primary">{membership.tenant.name}</div>
                      <div className="text-xs text-text-secondary">{membership.tenant.slug}</div>
                    </div>
                    <StatusBadge status={membershipStatusVariant(membership.membership_status)} dot>
                      {membership.membership_status}
                    </StatusBadge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {membership.membership_roles.map((role) => (
                      <span
                        key={role.role_id}
                        className="rounded-pill bg-surface px-3 py-1 text-xs text-text-secondary"
                      >
                        {role.role.display_name}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <SupportActionsPanel
          onActionComplete={loadUser}
          userEmail={supportUser.email}
          userId={supportUser.id}
          userStatus={supportUser.global_status}
        />

        <AuditActionsTable targetUserId={supportUser.id} />
      </div>
    );
  }

  if (platformUser) {
    const isSelf = currentUser?.id === platformUser.user_id;
    const ownsRole = roleKeys.includes('platform_owner');

    return (
      <div className="space-y-6">
        <div>
          <Link
            href={`/${params.locale}/admin/users`}
            className="inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to users
          </Link>
        </div>
        <PageHeader
          title={`${platformUser.user.first_name} ${platformUser.user.last_name}`}
          description={platformUser.user.email}
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
              onClick={() => void revoke()}
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
            <Info label="Status">{platformUser.revoked_at ? 'Revoked' : 'Active'}</Info>
            <Info label="Last login">
              {formatDateTime(platformUser.user.last_login_at) || 'Never'}
            </Info>
          </dl>
        </section>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
      User not found.
    </div>
  );
}

function Info({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <dt className="text-text-secondary">{label}</dt>
      <dd className="font-medium text-text-primary">{children}</dd>
    </div>
  );
}

function statusVariant(
  status: SupportUserDetail['global_status'],
): 'danger' | 'neutral' | 'success' {
  if (status === 'active') return 'success';
  if (status === 'disabled') return 'danger';
  return 'neutral';
}

function membershipStatusVariant(status: string): 'danger' | 'neutral' | 'success' | 'warning' {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'warning';
  if (status === 'disabled' || status === 'left') return 'danger';
  return 'neutral';
}
