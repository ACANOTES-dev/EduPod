'use client';

import * as React from 'react';

import { Checkbox, Label } from '@school/ui';

import type { PlatformRoleKey } from './platform-user-types';

const ROLES: Array<{ key: PlatformRoleKey; label: string; helper: string }> = [
  {
    key: 'platform_owner',
    label: 'Platform owner',
    helper: 'Full access',
  },
  {
    key: 'platform_support',
    label: 'Platform support',
    helper: 'Operational support',
  },
];

interface RoleSelectorProps {
  value: PlatformRoleKey[];
  onChange: (value: PlatformRoleKey[]) => void;
  disableOwnerRemoval?: boolean;
}

export function RoleSelector({ value, onChange, disableOwnerRemoval = false }: RoleSelectorProps) {
  const selected = new Set(value);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ROLES.map((role) => {
        const checked = selected.has(role.key);
        const disabled = role.key === 'platform_owner' && checked && disableOwnerRemoval;
        return (
          <Label
            key={role.key}
            className="flex min-h-16 cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <Checkbox
              checked={checked}
              disabled={disabled}
              onCheckedChange={(next) => {
                const nextSet = new Set(selected);
                if (next) {
                  nextSet.add(role.key);
                } else if (!disabled) {
                  nextSet.delete(role.key);
                }
                onChange(Array.from(nextSet));
              }}
            />
            <span>
              <span className="block font-medium text-text-primary">{role.label}</span>
              <span className="block text-xs text-text-secondary">{role.helper}</span>
            </span>
          </Label>
        );
      })}
    </div>
  );
}
