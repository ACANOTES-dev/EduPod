'use client';

import {
  AlertTriangle,
  BarChart3,
  BrainCircuit,
  Loader2,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  ReportKpiKey,
  ReportsAiModuleKey,
  ReportsDefaultsDto,
  ReportsSettingsResponse,
} from '@school/shared/reports';
import type { TenantAiFlag } from '@school/shared/wellbeing';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient, unwrap } from '@/lib/api-client';

import { AiFeaturesTab } from './_components/ai-features-tab';
import { DefaultsTab } from './_components/defaults-tab';
import { KpiDashboardTab } from './_components/kpi-dashboard-tab';
import {
  findAiFeature,
  resolveActiveTab,
  resolveScrollTarget,
  toggleHiddenKpi,
  type SettingsTabKey,
} from './_components/reports-settings.helpers';

// ─── Constants ──────────────────────────────────────────────────────────────

const ADMIN_ROLES = [
  'school_owner',
  'school_principal',
  'school_vice_principal',
  'admin',
] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ReportsSettingsPage() {
  const t = useTranslations('reportsSettings');
  const searchParams = useSearchParams();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole(...ADMIN_ROLES);

  const [settings, setSettings] = React.useState<ReportsSettingsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const initialTab = resolveActiveTab(searchParams?.get('tab') ?? null);
  const [activeTab, setActiveTab] = React.useState<SettingsTabKey>(initialTab);
  const [aiDisableConfirm, setAiDisableConfirm] = React.useState<ReportsAiModuleKey | null>(
    null,
  );

  const loadSettings = React.useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient<{ data: ReportsSettingsResponse }>(
        '/api/v1/reports/settings',
      );
      setSettings(unwrap(res));
    } catch (err) {
      console.error('[ReportsSettingsPage.loadSettings]', err);
      const status = (err as { status?: number; error?: { code?: string } }).status;
      if (status === 403) {
        setLoadError('permission_denied');
      } else {
        setLoadError('load_failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!canManage) {
      setLoading(false);
      setLoadError('permission_denied');
      return;
    }
    void loadSettings();
  }, [canManage, loadSettings]);

  // Scroll a specific AI feature card into view when arriving via deep link.
  React.useEffect(() => {
    if (!settings) return;
    const target = resolveScrollTarget(
      typeof window !== 'undefined' ? window.location.hash : null,
    );
    if (target && activeTab === 'ai-features') {
      // Defer to next paint so the card has actually mounted.
      const id = window.requestAnimationFrame(() => {
        const el = document.getElementById(`ai-feature-${target}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [settings, activeTab]);

  // ─── AI flag toggle ───────────────────────────────────────────────────────

  const handleAiToggle = React.useCallback(
    async (moduleKey: ReportsAiModuleKey, nextEnabled: boolean) => {
      if (!settings) return;
      const previous = settings.ai_features;
      // Optimistic: flip the relevant feature's enabled state.
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              ai_features: prev.ai_features.map((f) =>
                f.module_key === moduleKey ? { ...f, enabled: nextEnabled } : f,
              ),
            }
          : prev,
      );
      try {
        await apiClient<{ data: TenantAiFlag } | TenantAiFlag>(
          `/api/v1/ai-flags/${moduleKey}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ enabled: nextEnabled }),
          },
        );
        toast.success(
          nextEnabled ? t('aiFeatures.toastEnabled') : t('aiFeatures.toastDisabled'),
        );
      } catch (err) {
        console.error('[ReportsSettingsPage.handleAiToggle]', err);
        // Revert
        setSettings((prev) => (prev ? { ...prev, ai_features: previous } : prev));
        const errMsg = (err as { error?: { message?: string } }).error?.message;
        toast.error(errMsg ?? t('aiFeatures.toastFailed'));
      } finally {
        setAiDisableConfirm(null);
      }
    },
    [settings, t],
  );

  // ─── KPI visibility ───────────────────────────────────────────────────────

  const handleKpiToggle = React.useCallback(
    async (kpiKey: ReportKpiKey, showOnDashboard: boolean) => {
      if (!settings) return;
      const previous = settings.kpi_preferences.hidden_kpi_keys;
      const nextHidden = toggleHiddenKpi(previous, kpiKey, !showOnDashboard);
      // Optimistic
      setSettings((prev) =>
        prev
          ? {
              ...prev,
              kpi_preferences: { ...prev.kpi_preferences, hidden_kpi_keys: nextHidden },
            }
          : prev,
      );
      try {
        await apiClient<{ data: { hidden_kpi_keys: ReportKpiKey[] } }>(
          '/api/v1/reports/settings/kpi-visibility',
          {
            method: 'PUT',
            body: JSON.stringify({ hidden_kpi_keys: nextHidden }),
          },
        );
      } catch (err) {
        console.error('[ReportsSettingsPage.handleKpiToggle]', err);
        // Revert
        setSettings((prev) =>
          prev
            ? {
                ...prev,
                kpi_preferences: { ...prev.kpi_preferences, hidden_kpi_keys: previous },
              }
            : prev,
        );
        const errMsg = (err as { error?: { message?: string } }).error?.message;
        toast.error(errMsg ?? t('kpiDashboard.toastFailed'));
      }
    },
    [settings, t],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-text-tertiary" />
        </div>
      </div>
    );
  }

  if (loadError === 'permission_denied') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <SettingsIcon className="mx-auto mb-3 h-10 w-10 text-text-tertiary" />
          <p className="text-base font-semibold text-text-primary">
            {t('permissionDeniedTitle')}
          </p>
          <p className="mt-1 text-sm text-text-secondary">{t('permissionDeniedDesc')}</p>
        </div>
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-warning-600" />
          <p className="text-sm font-medium text-warning-800">{t('loadFailedTitle')}</p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => void loadSettings()}
          >
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b" data-testid="reports-settings-tabs">
        <TabButton
          tabKey="ai-features"
          activeTab={activeTab}
          onClick={() => setActiveTab('ai-features')}
          icon={BrainCircuit}
          label={t('tabs.aiFeatures')}
        />
        <TabButton
          tabKey="kpi-dashboard"
          activeTab={activeTab}
          onClick={() => setActiveTab('kpi-dashboard')}
          icon={BarChart3}
          label={t('tabs.kpiDashboard')}
        />
        <TabButton
          tabKey="defaults"
          activeTab={activeTab}
          onClick={() => setActiveTab('defaults')}
          icon={SettingsIcon}
          label={t('tabs.defaults')}
        />
      </div>

      {/* Tab content */}
      {activeTab === 'ai-features' && (
        <AiFeaturesTab
          features={settings.ai_features}
          onRequestToggle={(moduleKey, nextEnabled) => {
            if (!nextEnabled) {
              const feature = findAiFeature(settings.ai_features, moduleKey);
              if (feature.usage.monthly_usage > 0) {
                setAiDisableConfirm(moduleKey);
                return;
              }
            }
            void handleAiToggle(moduleKey, nextEnabled);
          }}
        />
      )}
      {activeTab === 'kpi-dashboard' && (
        <KpiDashboardTab
          hiddenKpiKeys={settings.kpi_preferences.hidden_kpi_keys}
          onToggle={(kpiKey, show) => void handleKpiToggle(kpiKey, show)}
        />
      )}
      {activeTab === 'defaults' && (
        <DefaultsTab
          settings={settings}
          onSaved={(updated: ReportsDefaultsDto) =>
            setSettings((prev) => (prev ? { ...prev, defaults: updated } : prev))
          }
        />
      )}

      {/* Confirm-disable AI dialog (when usage > 0) */}
      <Dialog
        open={aiDisableConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setAiDisableConfirm(null);
        }}
      >
        <DialogContent data-testid="ai-disable-confirm">
          <DialogHeader>
            <DialogTitle>{t('aiFeatures.disableConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('aiFeatures.disableConfirmDesc')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAiDisableConfirm(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (aiDisableConfirm) void handleAiToggle(aiDisableConfirm, false);
              }}
            >
              {t('aiFeatures.disableConfirmConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab button ─────────────────────────────────────────────────────────────

function TabButton({
  tabKey,
  activeTab,
  onClick,
  icon: Icon,
  label,
}: {
  tabKey: SettingsTabKey;
  activeTab: SettingsTabKey;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  const isActive = tabKey === activeTab;
  return (
    <button
      type="button"
      data-testid={`reports-settings-tab-${tabKey}`}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
        isActive
          ? 'border-b-2 border-primary-600 text-primary-700'
          : 'text-text-secondary hover:text-text-primary'
      }`}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  );
}
