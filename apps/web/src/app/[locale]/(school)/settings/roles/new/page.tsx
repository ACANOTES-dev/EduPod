'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { PermissionPicker, type RoleTier } from '../_components/permission-picker';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';


// ─── Types ────────────────────────────────────────────────────────────────────

interface PermissionItem {
  id: string;
  key: string;
  description: string;
  tier: string;
}

interface PermissionsResponse {
  data: PermissionItem[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TIER_OPTIONS: RoleTier[] = ['admin', 'staff', 'parent'];

export default function NewRolePage() {
  const t = useTranslations('roles');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const localePrefix = '/' + ((pathname ?? '').split('/').filter(Boolean)[0] ?? 'en');

  // Form state
  const [roleKey, setRoleKey] = React.useState('');
  const [displayName, setDisplayName] = React.useState('');
  const [roleTier, setRoleTier] = React.useState<RoleTier>('admin');
  const [selectedPermIds, setSelectedPermIds] = React.useState<string[]>([]);

  // Available permissions (id + key + description mapping from API)
  const [availablePermissions, setAvailablePermissions] = React.useState<
    { id: string; key: string; tier: RoleTier; description?: string }[]
  >([]);
  const [permLoading, setPermLoading] = React.useState(true);

  // Submission state
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [serverError, setServerError] = React.useState('');

  // Load all permissions from the dedicated endpoint
  React.useEffect(() => {
    async function loadPermissions() {
      try {
        const res = await apiClient<PermissionsResponse>('/api/v1/permissions');
        const perms = res.data.map((p) => ({
          id: p.id,
          key: p.key,
          tier: p.tier as RoleTier,
          description: p.description,
        }));
        setAvailablePermissions(perms);
      } catch (err) {
        // non-fatal; picker will be empty
        console.error('[setAvailablePermissions]', err);
      } finally {
        setPermLoading(false);
      }
    }
    void loadPermissions();
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!roleKey.trim()) e.roleKey = 'Required';
    else if (!/^[a-z0-9_]+$/.test(roleKey)) e.roleKey = t('keyHint');
    if (!displayName.trim()) e.displayName = 'Required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setServerError('');
    try {
      await apiClient('/api/v1/roles', {
        method: 'POST',
        body: JSON.stringify({
          role_key: roleKey.trim(),
          display_name: displayName.trim(),
          role_tier: roleTier,
          permission_ids: selectedPermIds,
        }),
      });
      router.push(`${localePrefix}/settings/roles`);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setServerError(ex?.error?.message ?? 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('create')}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {tc('back')}
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic info card */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Role key */}
            <div className="space-y-1.5">
              <Label htmlFor="role-key">{t('key')}</Label>
              <Input
                id="role-key"
                dir="ltr"
                placeholder={t('keyPlaceholder')}
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
                aria-invalid={!!errors.roleKey}
              />
              {errors.roleKey ? (
                <p className="text-xs text-danger-text">{errors.roleKey}</p>
              ) : (
                <p className="text-xs text-text-tertiary">{t('keyHint')}</p>
              )}
            </div>

            {/* Display name */}
            <div className="space-y-1.5">
              <Label htmlFor="display-name">{t('displayName')}</Label>
              <Input
                id="display-name"
                placeholder={t('displayName')}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                aria-invalid={!!errors.displayName}
              />
              {errors.displayName && (
                <p className="text-xs text-danger-text">{errors.displayName}</p>
              )}
            </div>

            {/* Tier */}
            <div className="space-y-1.5">
              <Label htmlFor="role-tier">{t('tier')}</Label>
              <Select
                value={roleTier}
                onValueChange={(v) => {
                  setRoleTier(v as RoleTier);
                  // Clear permissions that would violate tier on change
                  setSelectedPermIds([]);
                }}
              >
                <SelectTrigger id="role-tier">
                  <SelectValue placeholder={t('selectTier')} />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {t(tier as 'admin' | 'staff' | 'parent')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Permissions section */}
        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-text-primary">
            {t('permissionsSection')}
          </h2>
          {permLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          ) : (
            <PermissionPicker
              roleTier={roleTier}
              selectedIds={selectedPermIds}
              availablePermissions={availablePermissions}
              onChange={setSelectedPermIds}
            />
          )}
        </div>

        {serverError && <p className="text-sm text-danger-text">{serverError}</p>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>
            {tc('cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? tc('loading') : tc('create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
