'use client';

import { RotateCcw } from 'lucide-react';

import { Button } from '@school/ui';

import type { ModuleView } from '@/lib/api/admin-tenant-modules';
import { buildStandardPresetChanges } from '@/lib/api/admin-tenant-modules';

interface PresetDropdownProps {
  disabled: boolean;
  modules: ModuleView[];
  onApplyStandard: () => Promise<void>;
}

export function PresetDropdown({ disabled, modules, onApplyStandard }: PresetDropdownProps) {
  const changes = buildStandardPresetChanges(modules);

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || changes.length === 0}
      onClick={() => void onApplyStandard()}
    >
      <RotateCcw className="me-2 h-4 w-4" />
      Apply Standard defaults
      {changes.length > 0 ? (
        <span className="ms-2 rounded bg-surface-secondary px-1.5 py-0.5 text-xs">
          {changes.length}
        </span>
      ) : null}
    </Button>
  );
}
