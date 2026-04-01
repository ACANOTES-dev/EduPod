'use client';

import { ArrowLeft, Lock, Trash2 } from 'lucide-react';
import { useRouter, usePathname, useParams } from 'next/navigation';
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
  StatusBadge,
} from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { PermissionPicker, type RoleTier } from '../_components/permission-picker';


// ─── Types ────────────────────────────────────────────────────────────────────

interface PermissionFromApi {
  id: string;
  permission_key: string;
  permission_tier: string;
}

interface PermissionItem {
  id: string;
  key: string;
  description: string;
  tier: string;
}

interface PermissionsResponse {
  data: PermissionItem[];
}

interface RoleDetail {
  id: string;
  role_key: string;
  display_name: string;
  role_tier: string;
  is_system_role: boolean;
  tenant_id: string | null;
  role_permissions: { permission: PermissionFromApi }[];
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RoleDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const localePrefix = '/' + ((pathname ?? '').split('/').filter(Boolean)[0] ?? 'en');

  const [role, setRole] = React.useState<RoleDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  // All available permissions for the picker
  const [availablePermissions, setAvailablePermissions] = React.useState<
    { id: string; key: string; tier: RoleTier; description?: string }[]
  >([]);

  // Edit state
  const [displayName, setDisplayName] = React.useState('');
  const [selectedPermIds, setSelectedPermIds] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [saveSuccess, setSaveSuccess] = React.useState(false);

  // Delete state
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  // ─── Load role + all permissions ───────────────────────────────────────────

  React.useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        // Load target role and all permissions in parallel
        const [roleRes, permsRes] = await Promise.all([
          apiClient<{ data: RoleDetail }>(`/api/v1/roles/${id}`),
          apiClient<PermissionsResponse>('/api/v1/permissions'),
        ]);

        const roleData = roleRes.data;
        setRole(roleData);
        setDisplayName(roleData.display_name);
        setSelectedPermIds(roleData.role_permissions.map((rp) => rp.permission.id));

        setAvailablePermissions(
          permsRes.data.map((p) => ({
            id: p.id,
            key: p.key,
            tier: p.tier as RoleTier,
            description: p.description,
          })),
        );
      } catch {
        setLoadError('Failed to load role.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  // Dismiss success banner
  React.useEffect(() => {
    if (!saveSuccess) return;
    const timer = setTimeout(() => setSaveSuccess(false), 4000);
    return () => clearTimeout(timer);
  }, [saveSuccess]);

  // ─── Save handler ──────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!role || role.role_key === 'school_owner') return;
    setSaving(true);
    setSaveError('');
    try {
      // 1. Update display_name if changed (custom roles only — system role names are locked)
      if (!role.is_system_role && displayName.trim() !== role.display_name) {
        await apiClient(`/api/v1/roles/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ display_name: displayName.trim() }),
        });
      }
      // 2. Update permissions
      await apiClient(`/api/v1/roles/${id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permission_ids: selectedPermIds }),
      });
      setSaveSuccess(true);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSaveError(ex?.error?.message ?? 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete handler ────────────────────────────────────────────────────────

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await apiClient(`/api/v1/roles/${id}`, { method: 'DELETE' });
      router.push(`${localePrefix}/settings/roles`);
    } catch {
      setDeleteOpen(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-60 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (loadError || !role) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{loadError || 'Role not found.'}</p>
      </div>
    );
  }

  const isSystemRole = role.is_system_role;
  const isSchoolOwner = role.role_key === 'school_owner';
  const roleTier = role.role_tier as RoleTier;

  // Platform owner: fully locked. Other system roles: permissions editable, name locked.
  const canEditPermissions = !isSchoolOwner;
  const canEditName = !isSystemRole;
  const canDelete = !isSystemRole;

  return (
    <div className="space-y-6">
      <PageHeader
        title={role.display_name}
        actions={
          <div className="flex items-center gap-2">
            {canDelete && (
              <Button
                variant="outline"
                onClick={() => setDeleteOpen(true)}
                className="text-danger-text hover:text-danger-text"
              >
                <Trash2 className="me-2 h-4 w-4" />
                {tc('delete')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {tc('back')}
            </Button>
          </div>
        }
      />

      {isSchoolOwner && (
        <div className="flex items-center gap-2 rounded-lg border border-info-text/20 bg-info-fill px-4 py-3 text-sm text-info-text">
          <Lock className="h-4 w-4 shrink-0" />
          <span>{t('readOnly')}</span>
        </div>
      )}

      {isSystemRole && !isSchoolOwner && (
        <div className="flex items-center gap-2 rounded-lg border border-info-text/20 bg-info-fill px-4 py-3 text-sm text-info-text">
          <Lock className="h-4 w-4 shrink-0" />
          <span>{t('systemRolePermissionsEditable')}</span>
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-lg border border-success-text/20 bg-success-fill px-4 py-3 text-sm text-success-text">
          {t('saveSuccess')}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Basic info */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Display name */}
            <div className="space-y-1.5">
              <Label htmlFor="display-name">{t('displayName')}</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={!canEditName}
              />
            </div>

            {/* Role key — always read-only */}
            <div className="space-y-1.5">
              <Label>{t('key')}</Label>
              <code className="flex h-10 items-center rounded-lg border border-border bg-surface-secondary px-3 text-sm text-text-secondary">
                {role.role_key}
              </code>
            </div>

            {/* Tier */}
            <div className="space-y-1.5">
              <Label>{t('tier')}</Label>
              <div className="flex h-10 items-center">
                <StatusBadge status="info">{roleTier}</StatusBadge>
              </div>
            </div>

            {/* System role badge */}
            <div className="space-y-1.5">
              <Label>{t('systemRole')}</Label>
              <div className="flex h-10 items-center">
                {isSystemRole ? (
                  <StatusBadge status="warning">{t('yes')}</StatusBadge>
                ) : (
                  <span className="text-sm text-text-tertiary">{t('no')}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Permissions */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-text-primary">
            {t('permissionsSection')}
          </h2>
          <PermissionPicker
            roleTier={roleTier}
            selectedIds={selectedPermIds}
            availablePermissions={availablePermissions}
            onChange={setSelectedPermIds}
            disabled={!canEditPermissions}
          />
        </div>

        {saveError && <p className="text-sm text-danger-text">{saveError}</p>}

        {/* Save actions — shown when permissions or name can be edited */}
        {canEditPermissions && (
          <div className="flex items-center justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? tc('loading') : tc('save')}
            </Button>
          </div>
        )}
      </form>

      <DeleteDialog
        open={deleteOpen}
        loading={deleteLoading}
        onConfirm={handleDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </div>
  );
}
