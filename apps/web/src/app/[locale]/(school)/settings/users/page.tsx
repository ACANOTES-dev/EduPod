/* eslint-disable school/no-hand-rolled-forms -- legacy form, tracked for migration in HR-025 */
'use client';

import { Search, UserX, UserCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleRef {
  id: string;
  role_key: string;
  display_name: string;
  role_tier: string;
  is_system_role: boolean;
}

interface MembershipRow {
  id: string;
  user_id: string;
  membership_status: string;
  user: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    last_login_at: string | null;
    global_status: string;
  };
  membership_roles: { role: RoleRef }[];
}

interface UsersResponse {
  data: MembershipRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface RolesResponse {
  data: RoleRef[];
}

// ─── Invite Dialog ────────────────────────────────────────────────────────────

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function InviteDialog({ open, onOpenChange, onSuccess }: InviteDialogProps) {
  const t = useTranslations('users');
  const ti = useTranslations('invitations');
  const tc = useTranslations('common');

  const [email, setEmail] = React.useState('');
  const [selectedRoleId, setSelectedRoleId] = React.useState('');
  const [roles, setRoles] = React.useState<RoleRef[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    apiClient<RolesResponse>('/api/v1/roles')
      .then((res) => setRoles(res.data))
      .catch((err) => { console.error('[SettingsUsersPage]', err); return setRoles([]); });
  }, [open]);

  const handleClose = () => {
    setEmail('');
    setSelectedRoleId('');
    setError('');
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError(ti('emailRequired'));
      return;
    }
    if (!selectedRoleId) {
      setError(ti('roleRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient('/api/v1/invitations', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), role_ids: [selectedRoleId] }),
      });
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const e = err as { error?: { message?: string } };
      setError(e?.error?.message ?? tc('noResults'));
    } finally {
      setLoading(false);
    }
  };

  // Non-platform roles only for tenant invitation
  const tenantRoles = roles.filter((r) => r.role_tier !== 'platform');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('invite')}</DialogTitle>
          <DialogDescription>{t('inviteDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">{t('email')}</Label>
            <Input
              id="invite-email"
              type="email"
              dir="ltr"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="invite-role">{t('role')}</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger id="invite-role">
                <SelectValue placeholder={ti('selectRole')} />
              </SelectTrigger>
              <SelectContent>
                {tenantRoles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-danger-text">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? tc('loading') : t('invite')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'default' | 'destructive';
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  variant = 'default',
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const tc = useTranslations('common');
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? tc('loading') : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const t = useTranslations('users');

  const [data, setData] = React.useState<MembershipRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filter state
  const [searchValue, setSearchValue] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('');
  const [roles, setRoles] = React.useState<RoleRef[]>([]);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteSuccess, setInviteSuccess] = React.useState(false);

  // Confirm action state
  const [confirmAction, setConfirmAction] = React.useState<null | {
    userId: string;
    action: 'suspend' | 'reactivate';
  }>(null);
  const [actionLoading, setActionLoading] = React.useState(false);

  // Load roles for filter dropdown
  React.useEffect(() => {
    apiClient<RolesResponse>('/api/v1/roles')
      .then((res) => setRoles(res.data))
      .catch((err) => { console.error('[SettingsUsersPage]', err); return setRoles([]); });
  }, []);

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchValue), 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter, statusFilter]);

  const fetchUsers = React.useCallback(
    async (p: number, search: string, roleId: string, status: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (search) params.set('search', search);
        if (roleId) params.set('role_id', roleId);
        if (status) params.set('status', status);
        const res = await apiClient<UsersResponse>(`/api/v1/users?${params.toString()}`);
        setData(res.data);
        setTotal(res.meta.total);
      } catch (err) {
        // errors are silently swallowed; table shows empty state
        console.error('[setTotal]', err);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchUsers(page, debouncedSearch, roleFilter, statusFilter);
  }, [page, debouncedSearch, roleFilter, statusFilter, fetchUsers]);

  // Dismiss invite-success banner after 4 s
  React.useEffect(() => {
    if (!inviteSuccess) return;
    const id = setTimeout(() => setInviteSuccess(false), 4000);
    return () => clearTimeout(id);
  }, [inviteSuccess]);

  const handleConfirmAction = async () => {
    if (!confirmAction) return;
    setActionLoading(true);
    try {
      const path =
        confirmAction.action === 'suspend'
          ? `/api/v1/users/${confirmAction.userId}/suspend`
          : `/api/v1/users/${confirmAction.userId}/reactivate`;
      await apiClient(path, { method: 'POST' });
      setConfirmAction(null);
      void fetchUsers(page, debouncedSearch, roleFilter, statusFilter);
    } catch (err) {
      // keep dialog open on error
      console.error('[fetchUsers]', err);
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadge = (row: MembershipRow) => {
    const s = row.membership_status;
    if (s === 'active')
      return (
        <StatusBadge status="success" dot>
          {t('active')}
        </StatusBadge>
      );
    if (s === 'suspended')
      return (
        <StatusBadge status="danger" dot>
          {t('suspended')}
        </StatusBadge>
      );
    return (
      <StatusBadge status="neutral" dot>
        {s}
      </StatusBadge>
    );
  };

  const columns = [
    {
      key: 'name',
      header: t('name'),
      render: (row: MembershipRow) => (
        <span className="font-medium text-text-primary">
          {row.user.first_name} {row.user.last_name}
        </span>
      ),
    },
    {
      key: 'email',
      header: t('email'),
      render: (row: MembershipRow) => (
        <span dir="ltr" className="text-text-secondary">
          {row.user.email}
        </span>
      ),
    },
    {
      key: 'roles',
      header: t('role'),
      render: (row: MembershipRow) => (
        <span className="text-text-secondary">
          {row.membership_roles.map((mr) => mr.role.display_name).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: statusBadge,
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (row: MembershipRow) => {
        const isSuspended = row.membership_status === 'suspended';
        return (
          <div className="flex items-center gap-2">
            {isSuspended ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmAction({ userId: row.user_id, action: 'reactivate' })}
              >
                <UserCheck className="me-1.5 h-3.5 w-3.5" />
                {t('reactivate')}
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmAction({ userId: row.user_id, action: 'suspend' })}
              >
                <UserX className="me-1.5 h-3.5 w-3.5" />
                {t('suspend')}
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="me-2 h-4 w-4" />
            {t('invite')}
          </Button>
        }
      />

      {inviteSuccess && (
        <div className="rounded-lg border border-success-text/20 bg-success-fill px-4 py-3 text-sm text-success-text">
          {t('inviteSuccess')}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="ps-9"
          />
        </div>

        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('allRoles')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allRoles')}</SelectItem>
            {roles
              .filter((r) => r.role_tier !== 'platform')
              .map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.display_name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder={t('allStatuses')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allStatuses')}</SelectItem>
            <SelectItem value="active">{t('active')}</SelectItem>
            <SelectItem value="suspended">{t('suspended')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSuccess={() => {
          setInviteSuccess(true);
          void fetchUsers(page, debouncedSearch, roleFilter, statusFilter);
        }}
      />

      {confirmAction && (
        <ConfirmDialog
          open={true}
          title={
            confirmAction.action === 'suspend'
              ? t('suspendConfirmTitle')
              : t('reactivateConfirmTitle')
          }
          description={
            confirmAction.action === 'suspend'
              ? t('suspendConfirmDescription')
              : t('reactivateConfirmDescription')
          }
          confirmLabel={confirmAction.action === 'suspend' ? t('suspend') : t('reactivate')}
          variant={confirmAction.action === 'suspend' ? 'destructive' : 'default'}
          loading={actionLoading}
          onConfirm={handleConfirmAction}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
