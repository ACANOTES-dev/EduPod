'use client';

import { ArrowLeft, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import type { ModuleKey } from '@school/shared/modules';
import { Button, Skeleton, StatusBadge, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import {
  MODULE_CATEGORY_LABELS,
  MODULE_CATEGORY_ORDER,
  applyOptimisticModuleToggle,
  buildStandardPresetChanges,
  getAdminTenantModulesErrorMessage,
  getTenantModulesTenant,
  getTenantModulesView,
  groupTenantModules,
  toggleTenantModule,
} from '@/lib/api/admin-tenant-modules';
import type {
  TenantModulesSummary,
  TenantModulesViewResponse,
} from '@/lib/api/admin-tenant-modules';

import { ModuleCompletenessBanner } from './_components/module-completeness-banner';
import { ModuleToggleCard } from './_components/module-toggle-card';
import { PresetDropdown } from './_components/preset-dropdown';

export default function TenantModulesPage() {
  const params = useParams();
  const locale = (params?.locale as string | undefined) ?? 'en';
  const tenantId = params?.id as string;
  const [tenant, setTenant] = React.useState<TenantModulesSummary | null>(null);
  const [view, setView] = React.useState<TenantModulesViewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pendingKeys, setPendingKeys] = React.useState<Set<ModuleKey>>(new Set());

  const load = React.useCallback(
    async (options: { showLoading: boolean } = { showLoading: true }) => {
      try {
        if (options.showLoading) {
          setLoading(true);
        }
        const [tenantResult, modulesResult] = await Promise.all([
          getTenantModulesTenant(tenantId),
          getTenantModulesView(tenantId),
        ]);
        setTenant(tenantResult);
        setView(modulesResult);
      } catch (err) {
        console.error('[TenantModulesPage.load]', err);
        toast.error(getAdminTenantModulesErrorMessage(err, 'Failed to load tenant modules.'));
      } finally {
        if (options.showLoading) {
          setLoading(false);
        }
      }
    },
    [tenantId],
  );

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const interval = setInterval(() => void load({ showLoading: false }), 60_000);
    return () => clearInterval(interval);
  }, [load]);

  const setPending = React.useCallback((key: ModuleKey, pending: boolean) => {
    setPendingKeys((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const handleToggle = React.useCallback(
    async (key: ModuleKey, nextState: boolean) => {
      if (!view) return;
      const previousModules = view.modules;
      const moduleName = previousModules.find((module) => module.key === key)?.display_name ?? key;
      setPending(key, true);
      setView((current) =>
        current
          ? { ...current, modules: applyOptimisticModuleToggle(current.modules, key, nextState) }
          : current,
      );

      try {
        await toggleTenantModule(tenantId, key, nextState);
        toast.success(
          `${moduleName} ${nextState ? 'enabled' : 'disabled'} for ${tenant?.name ?? 'tenant'}.`,
        );
        void load({ showLoading: false });
      } catch (err) {
        console.error('[TenantModulesPage.handleToggle]', err);
        setView((current) => (current ? { ...current, modules: previousModules } : current));
        toast.error(getAdminTenantModulesErrorMessage(err, `Could not update ${moduleName}.`));
        throw err;
      } finally {
        setPending(key, false);
      }
    },
    [load, setPending, tenant?.name, tenantId, view],
  );

  const applyStandardPreset = React.useCallback(async () => {
    if (!view) return;
    const changes = buildStandardPresetChanges(view.modules);
    for (const change of changes) {
      await handleToggle(change.key, change.nextState);
    }
  }, [handleToggle, view]);

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-24 rounded-lg" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!tenant || !view) {
    return (
      <div className="space-y-4">
        <BackLink locale={locale} tenantId={tenantId} tenantName="Tenant" />
        <p className="text-sm text-danger-text">Tenant modules could not be loaded.</p>
      </div>
    );
  }

  const enabledCount = view.modules.filter((module) => module.is_enabled).length;
  const grouped = groupTenantModules(view.modules);

  return (
    <div className="space-y-6">
      <BackLink locale={locale} tenantId={tenant.id} tenantName={tenant.name} />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <PageHeader title={`${tenant.name} Module Toggles`} description={tenant.slug} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge status={tenant.status === 'active' ? 'success' : 'neutral'} dot>
              {tenant.status}
            </StatusBadge>
            <span className="rounded-md bg-surface-secondary px-2 py-1 text-sm text-text-secondary">
              {enabledCount} of {view.modules.length} modules enabled
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <PresetDropdown
            disabled={pendingKeys.size > 0}
            modules={view.modules}
            onApplyStandard={applyStandardPreset}
          />
          <Button asChild variant="outline">
            <Link
              href={`/${locale}/admin/audit-log?action=module_toggle&tenant_id=${encodeURIComponent(
                tenant.id,
              )}`}
            >
              <ExternalLink className="me-2 h-4 w-4" />
              Audit history
            </Link>
          </Button>
        </div>
      </div>

      <ModuleCompletenessBanner completeness={view.completeness} />

      {MODULE_CATEGORY_ORDER.map((category) => {
        const modules = grouped[category];
        if (modules.length === 0) {
          return null;
        }

        return (
          <section key={category} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-text-primary">
                {MODULE_CATEGORY_LABELS[category]}
              </h2>
              <span className="text-sm text-text-secondary">
                {modules.filter((module) => module.is_enabled).length} / {modules.length} on
              </span>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {modules.map((module) => (
                <ModuleToggleCard
                  key={module.key}
                  module={module}
                  modules={view.modules}
                  onToggle={handleToggle}
                  pending={pendingKeys.has(module.key)}
                  tenantId={tenant.id}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BackLink({
  locale,
  tenantId,
  tenantName,
}: {
  locale: string;
  tenantId: string;
  tenantName: string;
}) {
  return (
    <Link
      href={`/${locale}/admin/tenants/${tenantId}`}
      className="inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to {tenantName}
    </Link>
  );
}
