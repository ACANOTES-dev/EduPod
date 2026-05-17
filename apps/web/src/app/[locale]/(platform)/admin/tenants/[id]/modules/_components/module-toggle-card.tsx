'use client';

import { Clock, Loader2 } from 'lucide-react';
import * as React from 'react';

import type { ModuleKey } from '@school/shared/modules';
import { cn, StatusBadge, Switch } from '@school/ui';

import type { ModuleView } from '@/lib/api/admin-tenant-modules';
import { getEnabledDependentModules } from '@/lib/api/admin-tenant-modules';

import { DependentModulesWarningDialog } from './dependent-modules-warning-dialog';
import { JurisdictionWarningDialog } from './jurisdiction-warning-dialog';

interface ModuleToggleCardProps {
  module: ModuleView;
  modules: ModuleView[];
  onToggle: (key: ModuleKey, nextState: boolean) => Promise<void>;
  pending: boolean;
  tenantId: string;
}

export function ModuleToggleCard({
  module,
  modules,
  onToggle,
  pending,
  tenantId: _tenantId,
}: ModuleToggleCardProps) {
  const [dependentWarningOpen, setDependentWarningOpen] = React.useState(false);
  const [jurisdictionWarningOpen, setJurisdictionWarningOpen] = React.useState(false);
  const dependents = React.useMemo(
    () => getEnabledDependentModules(module.key, modules),
    [module.key, modules],
  );

  const requestToggle = React.useCallback(
    async (nextState: boolean) => {
      if (!nextState && dependents.length > 0) {
        setDependentWarningOpen(true);
        return;
      }
      if (nextState && module.key === 'compliance_advanced') {
        setJurisdictionWarningOpen(true);
        return;
      }

      await onToggle(module.key, nextState);
    },
    [dependents.length, module.key, onToggle],
  );

  const disableParentOnly = React.useCallback(() => {
    setDependentWarningOpen(false);
    void onToggle(module.key, false);
  }, [module.key, onToggle]);

  const disableBoth = React.useCallback(() => {
    setDependentWarningOpen(false);
    void (async () => {
      await onToggle(module.key, false);
      for (const dependent of dependents) {
        await onToggle(dependent.key, false);
      }
    })();
  }, [dependents, module.key, onToggle]);

  const confirmJurisdiction = React.useCallback(() => {
    setJurisdictionWarningOpen(false);
    void onToggle(module.key, true);
  }, [module.key, onToggle]);

  return (
    <>
      <article
        className={cn(
          'flex min-h-[224px] flex-col rounded-lg border bg-surface p-4 shadow-sm transition-colors',
          module.is_enabled ? 'border-primary-600/40' : 'border-border',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-text-primary">{module.display_name}</h3>
            <p className="mt-1 text-sm text-text-secondary">{module.description}</p>
          </div>
          <Switch
            checked={module.is_enabled}
            disabled={pending}
            onCheckedChange={(checked) => void requestToggle(checked)}
            aria-label={`Toggle ${module.display_name}`}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={module.is_enabled ? 'success' : 'neutral'} dot>
            {module.is_enabled ? 'On' : 'Off'}
          </StatusBadge>
          <span className="rounded-md bg-surface-secondary px-2 py-1 text-xs text-text-secondary">
            Default {module.default_enabled ? 'on' : 'off'}
          </span>
          <span className="rounded-md bg-surface-secondary px-2 py-1 font-mono text-xs text-text-secondary">
            {module.key}
          </span>
        </div>

        {module.depends_on && module.depends_on.length > 0 ? (
          <p className="mt-3 text-xs text-text-tertiary">
            Depends on <span className="font-mono">{module.depends_on.join(', ')}</span>
          </p>
        ) : null}

        <div className="mt-auto border-t border-border pt-3 text-xs text-text-tertiary">
          <div className="flex items-start gap-2">
            {pending ? (
              <Loader2 className="mt-0.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Clock className="mt-0.5 h-3.5 w-3.5" />
            )}
            <span>
              {module.last_toggled_at && module.last_toggled_by
                ? `Last toggled by ${module.last_toggled_by.display_name} on ${new Intl.DateTimeFormat(
                    'en',
                    {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    },
                  ).format(new Date(module.last_toggled_at))}`
                : 'Last toggled: never'}
            </span>
          </div>
        </div>
      </article>

      <DependentModulesWarningDialog
        dependents={dependents}
        moduleName={module.display_name}
        onCancel={() => setDependentWarningOpen(false)}
        onDisableBoth={disableBoth}
        onDisableParentOnly={disableParentOnly}
        open={dependentWarningOpen}
      />
      <JurisdictionWarningDialog
        onCancel={() => setJurisdictionWarningOpen(false)}
        onConfirm={confirmJurisdiction}
        open={jurisdictionWarningOpen}
      />
    </>
  );
}
