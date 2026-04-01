'use client';

import { UserPlus, X } from 'lucide-react';
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
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

interface RoleRef {
  id: string;
  role_key: string;
  display_name: string;
  role_tier: string;
}

interface InvitationRow {
  id: string;
  email: string;
  invited_role_payload: { role_ids: string[] };
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
}

interface InvitationsResponse {
  data: InvitationRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface RolesResponse {
  data: RoleRef[];
}

// ─── Status badge helper ──────────────────────────────────────────────────────

function invitationStatusBadge(status: InvitationStatus, t: ReturnType<typeof useTranslations>) {
  switch (status) {
    case 'pending':
      return (
        <StatusBadge status="warning" dot>
          {t('pending')}
        </StatusBadge>
      );
    case 'accepted':
      return (
        <StatusBadge status="success" dot>
          {t('accepted')}
        </StatusBadge>
      );
    case 'expired':
      return (
        <StatusBadge status="neutral" dot>
          {t('expired')}
        </StatusBadge>
      );
    case 'revoked':
      return (
        <StatusBadge status="danger" dot>
          {t('revoked')}
        </StatusBadge>
      );
    default:
      return <StatusBadge status="neutral">{status}</StatusBadge>;
  }
}

// ─── Invite Dialog ────────────────────────────────────────────────────────────

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function InviteDialog({ open, onOpenChange, onSuccess }: InviteDialogProps) {
  const t = useTranslations('invitations');
  const tc = useTranslations('common');

  const [email, setEmail] = React.useState('');
  const [selectedRoleId, setSelectedRoleId] = React.useState('');
  const [roles, setRoles] = React.useState<RoleRef[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (!open) return;
    apiClient<RolesResponse>('/api/v1/roles')
      .then((res) => setRoles(res.data.filter((r) => r.role_tier !== 'platform')))
      .catch(() => setRoles([]));
  }, [open]);

  const handleClose = () => {
    setEmail('');
    setSelectedRoleId('');
    setError('');
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError(t('emailRequired'));
      return;
    }
    if (!selectedRoleId) {
      setError(t('roleRequired'));
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('create')}</DialogTitle>
          <DialogDescription>{t('createDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="inv-email">{t('email')}</Label>
            <Input
              id="inv-email"
              type="email"
              dir="ltr"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSubmit();
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-role">{t('role')}</Label>
            <Select value={selectedRoleId} onValueChange={setSelectedRoleId}>
              <SelectTrigger id="inv-role">
                <SelectValue placeholder={t('selectRole')} />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
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
            {loading ? tc('loading') : t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Revoke Confirm Dialog ────────────────────────────────────────────────────

interface RevokeDialogProps {
  open: boolean;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function RevokeDialog({ open, loading, onConfirm, onCancel }: RevokeDialogProps) {
  const t = useTranslations('invitations');
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
          <DialogTitle>{t('revokeConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('revokeConfirmDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? tc('loading') : t('revoke')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InvitationsPage() {
  const t = useTranslations('invitations');

  const [data, setData] = React.useState<InvitationRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [successBanner, setSuccessBanner] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<string | null>(null);
  const [revokeLoading, setRevokeLoading] = React.useState(false);

  const fetchInvitations = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const res = await apiClient<InvitationsResponse>(
        `/api/v1/invitations?page=${p}&pageSize=${PAGE_SIZE}`,
      );
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      // silently swallowed
      console.error('[setTotal]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchInvitations(page);
  }, [page, fetchInvitations]);

  React.useEffect(() => {
    if (!successBanner) return;
    const id = setTimeout(() => setSuccessBanner(false), 4000);
    return () => clearTimeout(id);
  }, [successBanner]);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      await apiClient(`/api/v1/invitations/${revokeTarget}/revoke`, { method: 'POST' });
      setRevokeTarget(null);
      void fetchInvitations(page);
    } catch (err) {
      // keep dialog open on error
      console.error('[fetchInvitations]', err);
    } finally {
      setRevokeLoading(false);
    }
  };

  const formatDateLocal = (iso: string) => formatDate(iso);

  const columns = [
    {
      key: 'email',
      header: t('email'),
      render: (row: InvitationRow) => (
        <span dir="ltr" className="font-medium text-text-primary">
          {row.email}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: InvitationRow) => invitationStatusBadge(row.status, t),
    },
    {
      key: 'expires_at',
      header: t('expiresAt'),
      render: (row: InvitationRow) => (
        <span className="text-text-secondary">{formatDateLocal(row.expires_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (row: InvitationRow) =>
        row.status === 'pending' ? (
          <Button variant="ghost" size="sm" onClick={() => setRevokeTarget(row.id)}>
            <X className="me-1.5 h-3.5 w-3.5" />
            {t('revoke')}
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="me-2 h-4 w-4" />
            {t('create')}
          </Button>
        }
      />

      {successBanner && (
        <div className="rounded-lg border border-success-text/20 bg-success-fill px-4 py-3 text-sm text-success-text">
          {t('inviteSuccess')}
        </div>
      )}

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
          setSuccessBanner(true);
          void fetchInvitations(page);
        }}
      />

      <RevokeDialog
        open={!!revokeTarget}
        loading={revokeLoading}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
