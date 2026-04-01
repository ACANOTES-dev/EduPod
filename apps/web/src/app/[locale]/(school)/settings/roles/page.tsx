'use client';

import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoleRow {
  id: string;
  role_key: string;
  display_name: string;
  role_tier: string;
  is_system_role: boolean;
  tenant_id: string | null;
  _count?: { role_permissions: number };
}

interface RolesResponse {
  data: RoleRow[];
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';

function TierBadge({ tier }: { tier: string }) {
  const t = useTranslations('roles');
  const labels: Record<string, string> = {
    platform: t('platform'),
    admin: t('admin'),
    staff: t('staff'),
    parent: t('parent'),
  };
  const variants: Record<string, BadgeVariant> = {
    platform: 'info',
    admin: 'warning',
    staff: 'secondary',
    parent: 'secondary',
  };
  return <Badge variant={variants[tier] ?? 'secondary'}>{labels[tier] ?? tier}</Badge>;
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

interface DeleteDialogProps {
  open: boolean;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteDialog({ open, loading, onConfirm, onCancel }: DeleteDialogProps) {
  const t = useTranslations('roles');
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
          <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('deleteConfirmDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            {tc('cancel')}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? tc('loading') : tc('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  // Extract locale prefix from pathname: /en/settings/roles → /en
  const localePrefix = '/' + ((pathname ?? '').split('/').filter(Boolean)[0] ?? 'en');

  const [data, setData] = React.useState<RoleRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 50;
  const [isLoading, setIsLoading] = React.useState(true);

  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState('');

  const fetchRoles = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<RolesResponse>('/api/v1/roles');
      setData(res.data);
      setTotal(res.data.length);
    } catch (err) {
      console.error('[fetchRoles]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  React.useEffect(() => {
    if (!successMsg) return;
    const id = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(id);
  }, [successMsg]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await apiClient(`/api/v1/roles/${deleteTarget}`, { method: 'DELETE' });
      setDeleteTarget(null);
      setSuccessMsg(t('deleteSuccess'));
      void fetchRoles();
    } catch (err) {
      console.error('[handleDelete]', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Paginate client-side (roles list is usually small)
  const paginatedData = data.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns = [
    {
      key: 'name',
      header: t('name'),
      render: (row: RoleRow) => (
        <div className="flex items-center gap-2">
          {row.is_system_role && <Lock className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />}
          <span className="font-medium text-text-primary">{row.display_name}</span>
        </div>
      ),
    },
    {
      key: 'key',
      header: t('key'),
      render: (row: RoleRow) => <code className="text-xs text-text-secondary">{row.role_key}</code>,
    },
    {
      key: 'tier',
      header: t('tier'),
      render: (row: RoleRow) => <TierBadge tier={row.role_tier} />,
    },
    {
      key: 'system',
      header: t('systemRole'),
      render: (row: RoleRow) =>
        row.is_system_role ? (
          <StatusBadge status="info">{t('yes')}</StatusBadge>
        ) : (
          <span className="text-sm text-text-tertiary">{t('no')}</span>
        ),
    },
    {
      key: 'permissions',
      header: t('permissions'),
      render: (row: RoleRow) => (
        <span className="text-sm text-text-secondary">{row._count?.role_permissions ?? 0}</span>
      ),
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (row: RoleRow) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`${localePrefix}/settings/roles/${row.id}`)}
            title={row.role_key === 'school_owner' ? t('readOnly') : tc('edit')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {!row.is_system_role && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(row.id)}
              className="text-danger-text hover:text-danger-text"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => router.push(`${localePrefix}/settings/roles/new`)}>
            <Plus className="me-2 h-4 w-4" />
            {t('newRole')}
          </Button>
        }
      />

      {successMsg && (
        <div className="rounded-lg border border-success-text/20 bg-success-fill px-4 py-3 text-sm text-success-text">
          {successMsg}
        </div>
      )}

      <DataTable
        columns={columns}
        data={paginatedData}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <DeleteDialog
        open={!!deleteTarget}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
