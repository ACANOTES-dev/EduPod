'use client';

import { ArrowLeft, Lock, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
          <DialogDescription>{t('deleteConfirmDescription')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={loading}>{tc('cancel')}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? tc('loading') : tc('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: { id: string };
}

export default function RoleDetailPage({ params }: PageProps) {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const localePrefix = '/' + ((pathname ?? '').split('/').filter(Boolean)[0] ?? 'en');
  const { id } = params;

  const [role, setRole] = React.useState<RoleDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

  // All available permissions for the picker (derived from a system role)
  const [availablePermissions, setAvailablePermissions] = React.useState<
    { id: string; key: string; tier: RoleTier }[]
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
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        // Load target role
        const roleDetail = await apiClient<RoleDetail>(`/api/v1/roles/${id}`);
        setRole(roleDetail);
        setDisplayName(roleDetail.display_name);
        setSelectedPermIds(roleDetail.role_permissions.map((rp) => rp.permission.id));

        // Load all permissions from the school_owner role (most complete system role)
        const rolesRes = await apiClient<{ data: { id: string; is_system_role: boolean; role_key: string }[] }>('/api/v1/roles');
        const systemRole =
          rolesRes.data.find((r) => r.is_system_role && r.role_key === 'school_owner') ??
          rolesRes.data.find((r) => r.is_system_role);

        if (systemRole && systemRole.id !== id) {
          const ownerDetail = await apiClient<{
            role_permissions: { permission: PermissionFromApi }[];
          }>(`/api/v1/roles/${systemRole.id}`);
          setAvailablePermissions(
            ownerDetail.role_permissions.map((rp) => ({
              id: rp.permission.id,
              key: rp.permission.permission_key,
              tier: rp.permission.permission_tier as RoleTier,
            })),
          );
        } else {
          // Fallback: use the permissions from the current role itself
          setAvailablePermissions(
            roleDetail.role_permissions.map((rp) => ({
              id: rp.permission.id,
              key: rp.permission.permission_key,
              tier: rp.permission.permission_tier as RoleTier,
            })),
          );
        }
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
    if (!role || role.is_system_role) return;
    setSaving(true);
    setSaveError('');
    try {
      // 1. Update display_name if changed
      if (displayName.trim() !== role.display_name) {
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
  const roleTier = role.role_tier as RoleTier;

  return (
    <div className="space-y-6">
      <PageHeader
        title={role.display_name}
        actions={
          <div className="flex items-center gap-2">
            {!isSystemRole && (
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

      {isSystemRole && (
        <div className="flex items-center gap-2 rounded-lg border border-info-text/20 bg-info-fill px-4 py-3 text-sm text-info-text">
          <Lock className="h-4 w-4 shrink-0" />
          <span>{t('readOnly')}</span>
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
                disabled={isSystemRole}
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
            disabled={isSystemRole}
          />
        </div>

        {saveError && <p className="text-sm text-danger-text">{saveError}</p>}

        {/* Actions — only for custom roles */}
        {!isSystemRole && (
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
