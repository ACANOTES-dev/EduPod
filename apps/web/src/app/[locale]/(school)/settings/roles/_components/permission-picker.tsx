'use client';

import { PERMISSIONS, PERMISSION_TIER_MAP } from '@school/shared';
import { Checkbox, Label } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';


// ─── Types ────────────────────────────────────────────────────────────────────

export type RoleTier = 'platform' | 'admin' | 'staff' | 'parent';

interface PermissionEntry {
  key: string;
  tier: RoleTier;
}

interface PermissionWithId extends PermissionEntry {
  id: string;
  description?: string;
}

interface PermissionPickerProps {
  /** The role tier — only shows permissions at this tier or below */
  roleTier: RoleTier;
  /** Currently selected permission IDs */
  selectedIds: string[];
  /** All available permissions from the API (with their IDs) */
  availablePermissions: PermissionWithId[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

// ─── Tier rank ────────────────────────────────────────────────────────────────

const TIER_RANK: Record<RoleTier, number> = {
  platform: 4,
  admin: 3,
  staff: 2,
  parent: 1,
};

// ─── Build domain groups from PERMISSIONS constant ────────────────────────────

function buildDomainGroups(): { domain: string; keys: string[] }[] {
  const groups: { domain: string; keys: string[] }[] = [];
  for (const [domain, perms] of Object.entries(PERMISSIONS)) {
    const keys = Object.values(perms as Record<string, string>);
    groups.push({ domain, keys });
  }
  return groups;
}

const DOMAIN_GROUPS = buildDomainGroups();

// ─── Component ────────────────────────────────────────────────────────────────

export function PermissionPicker({
  roleTier,
  selectedIds,
  availablePermissions,
  onChange,
  disabled = false,
}: PermissionPickerProps) {
  const t = useTranslations('roles');
  const roleRank = TIER_RANK[roleTier];

  // Build maps from permission_key → id and key → description
  const { keyToId, keyToDesc } = React.useMemo(() => {
    const ids: Record<string, string> = {};
    const descs: Record<string, string> = {};
    for (const p of availablePermissions) {
      ids[p.key] = p.id;
      if (p.description) descs[p.key] = p.description;
    }
    return { keyToId: ids, keyToDesc: descs };
  }, [availablePermissions]);

  // Filter to only permission keys within tier
  const allowedGroups = React.useMemo(() => {
    return DOMAIN_GROUPS.map(({ domain, keys }) => {
      const filtered = keys.filter((key) => {
        const tier = PERMISSION_TIER_MAP[key] as RoleTier | undefined;
        if (!tier) return false;
        const permRank = TIER_RANK[tier] ?? 0;
        return permRank <= roleRank && keyToId[key]; // only show if API knows about it
      });
      return { domain, keys: filtered };
    }).filter((g) => g.keys.length > 0);
  }, [roleRank, keyToId]);

  const selectedSet = new Set(selectedIds);

  const toggle = (id: string) => {
    if (selectedSet.has(id)) {
      onChange(selectedIds.filter((i) => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const toggleDomain = (keys: string[]) => {
    const ids = keys.map((k) => keyToId[k]).filter(Boolean) as string[];
    const allSelected = ids.every((id) => selectedSet.has(id));
    if (allSelected) {
      const removeSet = new Set(ids);
      onChange(selectedIds.filter((id) => !removeSet.has(id)));
    } else {
      const addSet = new Set([...selectedIds, ...ids]);
      onChange([...addSet]);
    }
  };

  if (allowedGroups.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">{t('permissionsTierNote')}</p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-secondary">{t('permissionsTierNote')}</p>
      {allowedGroups.map(({ domain, keys }) => {
        const ids = keys.map((k) => keyToId[k]).filter(Boolean) as string[];
        const allSelected = ids.every((id) => selectedSet.has(id));
        const someSelected = ids.some((id) => selectedSet.has(id));

        return (
          <div key={domain} className="rounded-lg border border-border p-4">
            {/* Domain header with select-all */}
            <div className="mb-3 flex items-center gap-2">
              <Checkbox
                id={`domain-${domain}`}
                checked={allSelected}
                data-state={someSelected && !allSelected ? 'indeterminate' : undefined}
                onCheckedChange={() => !disabled && toggleDomain(keys)}
                disabled={disabled}
              />
              <Label
                htmlFor={`domain-${domain}`}
                className="cursor-pointer font-semibold text-text-primary capitalize"
              >
                {domain.replace(/_/g, ' ')}
              </Label>
            </div>

            {/* Individual permissions */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {keys.map((key) => {
                const id = keyToId[key];
                if (!id) return null;
                const desc = keyToDesc[key];
                return (
                  <div key={key} className="flex items-start gap-2">
                    <Checkbox
                      id={`perm-${id}`}
                      checked={selectedSet.has(id)}
                      onCheckedChange={() => !disabled && toggle(id)}
                      disabled={disabled}
                      className="mt-0.5"
                    />
                    <Label
                      htmlFor={`perm-${id}`}
                      className="cursor-pointer text-sm leading-snug text-text-secondary"
                    >
                      <code className="text-xs text-text-primary">{key}</code>
                      {desc && (
                        <span className="block text-xs text-text-tertiary">{desc}</span>
                      )}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
