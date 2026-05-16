'use client';

import * as React from 'react';

import { Badge, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import type { PlatformPermissionsResponse } from '../users/_components/platform-user-types';

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformPermissionsPage() {
  const [data, setData] = React.useState<PlatformPermissionsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function loadPermissions() {
      try {
        setLoading(true);
        const result = await apiClient<PlatformPermissionsResponse>(
          '/api/v1/admin/platform-permissions',
        );
        setData(result);
      } catch (err: unknown) {
        console.error('[PlatformPermissionsPage.loadPermissions]', err);
        toast.error(getErrorMessage(err, 'Failed to load platform permissions.'));
      } finally {
        setLoading(false);
      }
    }

    void loadPermissions();
  }, []);

  const rolePermissionSets = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const role of data?.roles ?? []) {
      map.set(
        role.role_key,
        new Set(role.permissions.map((entry) => entry.permission.permission_key)),
      );
    }
    return map;
  }, [data?.roles]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, NonNullable<typeof data>['permissions']>();
    for (const permission of data?.permissions ?? []) {
      const list = groups.get(permission.category) ?? [];
      list.push(permission);
      groups.set(permission.category, list);
    }
    return Array.from(groups.entries());
  }, [data?.permissions]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Permissions"
        description="Read-only catalogue of platform role capabilities."
      />

      {loading ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          Loading permissions...
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([category, permissions]) => (
            <section key={category} className="rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold capitalize text-text-primary">
                  {category.replaceAll('_', ' ')}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-sm">
                  <thead className="bg-surface-secondary text-text-secondary">
                    <tr>
                      <th className="px-4 py-3 text-start font-medium">Permission</th>
                      {(data?.roles ?? []).map((role) => (
                        <th key={role.id} className="px-4 py-3 text-center font-medium">
                          {role.display_name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permissions.map((permission) => (
                      <tr key={permission.id} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div className="font-medium text-text-primary">
                            {permission.display_name}
                          </div>
                          <div className="font-mono text-xs text-text-secondary">
                            {permission.permission_key}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {permission.is_destructive ? (
                              <Badge className="bg-danger-bg text-danger-text">Destructive</Badge>
                            ) : null}
                            {permission.requires_two_person ? (
                              <Badge className="bg-warning-bg text-warning-text">Two person</Badge>
                            ) : null}
                          </div>
                        </td>
                        {(data?.roles ?? []).map((role) => {
                          const enabled = rolePermissionSets
                            .get(role.role_key)
                            ?.has(permission.permission_key);
                          return (
                            <td key={role.id} className="px-4 py-3 text-center">
                              <span
                                className={enabled ? 'text-success-text' : 'text-text-tertiary'}
                              >
                                {enabled ? 'Yes' : 'No'}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
