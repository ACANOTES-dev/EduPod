'use client';

import { AlertTriangle } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@school/ui';

import type { ModuleView } from '@/lib/api/admin-tenant-modules';

interface DependentModulesWarningDialogProps {
  dependents: ModuleView[];
  moduleName: string;
  onCancel: () => void;
  onDisableBoth: () => void;
  onDisableParentOnly: () => void;
  open: boolean;
}

export function DependentModulesWarningDialog({
  dependents,
  moduleName,
  onCancel,
  onDisableBoth,
  onDisableParentOnly,
  open,
}: DependentModulesWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => (!nextOpen ? onCancel() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-warning-bg text-warning-text">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle>Dependent modules are still enabled</DialogTitle>
          <DialogDescription>
            Disabling {moduleName} may affect modules that depend on it.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-surface-secondary p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            Enabled dependents
          </p>
          <ul className="mt-2 space-y-2">
            {dependents.map((module) => (
              <li key={module.key} className="text-sm text-text-primary">
                {module.display_name}
                <span className="ms-2 font-mono text-xs text-text-tertiary">{module.key}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={onDisableParentOnly}>
              Disable only parent
            </Button>
            <Button type="button" variant="destructive" onClick={onDisableBoth}>
              Disable both
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
