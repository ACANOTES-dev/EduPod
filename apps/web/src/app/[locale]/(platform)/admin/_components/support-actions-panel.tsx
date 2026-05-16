'use client';

import {
  KeyRound,
  Loader2,
  Mail,
  ShieldOff,
  ToggleLeft,
  ToggleRight,
  UserRoundCog,
} from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import { SupportActionDialog } from './support-action-dialog';

interface SupportUserSummary {
  email: string;
  first_name: string;
  id: string;
  last_name: string;
}

interface SupportUsersResponse {
  data: SupportUserSummary[];
  meta: { page: number; pageSize: number; total: number };
}

interface SupportActionsPanelProps {
  isOwner?: boolean;
  onActionComplete: () => void;
  tenantId?: string;
  tenantName?: string;
  userEmail: string;
  userId: string;
  userStatus: string;
}

type SupportActionKey =
  | 'reset-password'
  | 'reset-mfa'
  | 'resend-invite'
  | 'unlock'
  | 'disable'
  | 'enable';

interface SupportActionButton {
  icon: React.ComponentType<{ className?: string }>;
  key: SupportActionKey;
  label: string;
}

const ACTION_COPY: Record<
  SupportActionKey,
  {
    confirmLabel: string;
    description: (email: string) => string;
    endpoint: (userId: string) => string;
    permission: string;
    title: string;
    variant: 'default' | 'destructive';
  }
> = {
  'reset-password': {
    confirmLabel: 'Trigger reset',
    description: (email) =>
      `Generate a password reset token for ${email}. The password is never shown.`,
    endpoint: (userId) => `/api/v1/admin/users/${userId}/reset-password`,
    permission: 'platform.users.reset_password',
    title: 'Reset password',
    variant: 'default',
  },
  'reset-mfa': {
    confirmLabel: 'Reset MFA',
    description: (email) => `Disable MFA for ${email} so they can enrol again on next setup.`,
    endpoint: (userId) => `/api/v1/admin/users/${userId}/reset-mfa`,
    permission: 'platform.users.reset_mfa',
    title: 'Reset MFA',
    variant: 'default',
  },
  'resend-invite': {
    confirmLabel: 'Re-send invite',
    description: (email) =>
      `Regenerate the pending invitation token and re-send the invite to ${email}.`,
    endpoint: (userId) => `/api/v1/admin/users/${userId}/resend-invite`,
    permission: 'platform.users.resend_invite',
    title: 'Re-send welcome invite',
    variant: 'default',
  },
  unlock: {
    confirmLabel: 'Unlock account',
    description: (email) => `Clear brute-force lockout and failed login state for ${email}.`,
    endpoint: (userId) => `/api/v1/admin/users/${userId}/unlock`,
    permission: 'platform.users.unlock_account',
    title: 'Unlock account',
    variant: 'default',
  },
  disable: {
    confirmLabel: 'Disable user',
    description: (email) =>
      `Disable ${email} across the platform and invalidate all active sessions.`,
    endpoint: (userId) => `/api/v1/admin/users/${userId}/disable`,
    permission: 'platform.users.disable',
    title: 'Disable user',
    variant: 'destructive',
  },
  enable: {
    confirmLabel: 'Enable user',
    description: (email) =>
      `Restore platform access for ${email}. They will need to sign in again.`,
    endpoint: (userId) => `/api/v1/admin/users/${userId}/enable`,
    permission: 'platform.users.disable',
    title: 'Enable user',
    variant: 'default',
  },
};

export function SupportActionsPanel({
  isOwner = false,
  onActionComplete,
  tenantId,
  tenantName,
  userEmail,
  userId,
  userStatus,
}: SupportActionsPanelProps) {
  const { user } = useAuth();
  const permissions = React.useMemo(
    () => new Set(user?.platform_permissions ?? []),
    [user?.platform_permissions],
  );
  const [dialogAction, setDialogAction] = React.useState<SupportActionKey | null>(null);

  const can = React.useCallback((permission: string) => permissions.has(permission), [permissions]);

  async function executeAction(action: SupportActionKey) {
    const copy = ACTION_COPY[action];
    await apiClient(copy.endpoint(userId), { method: 'POST' });
    onActionComplete();
  }

  const statusAction: SupportActionButton =
    userStatus === 'disabled'
      ? { icon: ToggleRight, key: 'enable', label: 'Enable user' }
      : { icon: ToggleLeft, key: 'disable', label: 'Disable user' };

  const actionButtons: SupportActionButton[] = [
    { icon: KeyRound, key: 'reset-password', label: 'Reset password' },
    { icon: ShieldOff, key: 'reset-mfa', label: 'Reset MFA' },
    { icon: Mail, key: 'resend-invite', label: 'Re-send invite' },
    { icon: UserRoundCog, key: 'unlock', label: 'Unlock account' },
    statusAction,
  ];
  const visibleActions = actionButtons.filter((item) => can(ACTION_COPY[item.key].permission));

  const activeCopy = dialogAction ? ACTION_COPY[dialogAction] : null;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-text-primary">Support actions</h2>
        <p className="text-sm text-text-secondary">
          Platform support tools for account recovery and owner handover.
        </p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visibleActions.map((action) => (
          <Button
            key={action.key}
            type="button"
            variant={ACTION_COPY[action.key].variant === 'destructive' ? 'destructive' : 'outline'}
            onClick={() => setDialogAction(action.key)}
            className="justify-start"
          >
            <action.icon className="me-2 h-4 w-4" />
            {action.label}
          </Button>
        ))}
        {tenantId && isOwner && can('platform.users.transfer_ownership') ? (
          <TransferOwnershipDialog
            currentUserId={userId}
            onComplete={onActionComplete}
            tenantId={tenantId}
            tenantName={tenantName ?? 'this tenant'}
          />
        ) : null}
      </div>

      {visibleActions.length === 0 &&
      !(tenantId && isOwner && can('platform.users.transfer_ownership')) ? (
        <p className="mt-4 text-sm text-text-secondary">
          No support actions are available for your platform role.
        </p>
      ) : null}

      {activeCopy && dialogAction ? (
        <SupportActionDialog
          confirmLabel={activeCopy.confirmLabel}
          description={activeCopy.description(userEmail)}
          onConfirm={() => executeAction(dialogAction)}
          onOpenChange={(open) => !open && setDialogAction(null)}
          open={dialogAction !== null}
          title={activeCopy.title}
          variant={activeCopy.variant}
        />
      ) : null}
    </section>
  );
}

function TransferOwnershipDialog({
  currentUserId,
  onComplete,
  tenantId,
  tenantName,
}: {
  currentUserId: string;
  onComplete: () => void;
  tenantId: string;
  tenantName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [users, setUsers] = React.useState<SupportUserSummary[]>([]);
  const [newOwnerUserId, setNewOwnerUserId] = React.useState('');
  const [loadingUsers, setLoadingUsers] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;

    async function loadUsers() {
      try {
        setLoadingUsers(true);
        const response = await apiClient<SupportUsersResponse>(
          `/api/v1/admin/users?tenant_id=${tenantId}&pageSize=100`,
        );
        setUsers(response.data.filter((candidate) => candidate.id !== currentUserId));
      } catch (err: unknown) {
        console.error('[TransferOwnershipDialog.loadUsers]', err);
        toast.error('Failed to load tenant users.');
      } finally {
        setLoadingUsers(false);
      }
    }

    void loadUsers();
  }, [currentUserId, open, tenantId]);

  async function submit() {
    if (!newOwnerUserId) {
      toast.error('Choose the new owner before transferring ownership.');
      return;
    }

    try {
      setSubmitting(true);
      await apiClient(`/api/v1/admin/tenants/${tenantId}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ new_owner_user_id: newOwnerUserId }),
      });
      toast.success('Ownership transferred.');
      setOpen(false);
      setNewOwnerUserId('');
      onComplete();
    } catch (err: unknown) {
      console.error('[TransferOwnershipDialog.submit]', err);
      toast.error(getErrorMessage(err, 'Failed to transfer ownership.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="destructive"
        onClick={() => setOpen(true)}
        className="justify-start"
      >
        <UserRoundCog className="me-2 h-4 w-4" />
        Transfer ownership
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            Move the school owner role for {tenantName} to another active tenant member.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-sm font-medium text-text-primary" htmlFor="new-owner">
            New owner
          </label>
          <Select value={newOwnerUserId} onValueChange={setNewOwnerUserId}>
            <SelectTrigger id="new-owner">
              <SelectValue placeholder={loadingUsers ? 'Loading users...' : 'Select user'} />
            </SelectTrigger>
            <SelectContent>
              {users.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.first_name} {candidate.last_name} · {candidate.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Transferring...' : 'Transfer ownership'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
