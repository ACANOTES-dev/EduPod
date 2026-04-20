'use client';

import {
  AlertTriangle,
  BrainCircuit,
  Heart,
  Shield,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { TenantAiFlag, WellbeingAiModuleKey } from '@school/shared/wellbeing';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Switch,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient, unwrap } from '@/lib/api-client';

// ─── Module metadata ────────────────────────────────────────────────────────

interface ModuleMeta {
  key: WellbeingAiModuleKey;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
}

const MODULE_META: ModuleMeta[] = [
  {
    key: 'behaviour',
    icon: Shield,
    accent: 'from-emerald-400 via-emerald-500 to-emerald-600',
    iconBg: 'bg-emerald-100 text-emerald-700',
  },
  {
    key: 'pastoral',
    icon: Heart,
    accent: 'from-pink-400 via-pink-500 to-pink-600',
    iconBg: 'bg-pink-100 text-pink-700',
  },
  {
    key: 'staff_wellbeing',
    icon: Users,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
  },
  {
    key: 'early_warning',
    icon: TrendingUp,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
  },
];

const ADMIN_ROLES = ['school_owner', 'school_principal'] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function AiFlagsAdminPage() {
  const t = useTranslations('aiFlagsAdmin');
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole(...ADMIN_ROLES);

  const [flags, setFlags] = React.useState<TenantAiFlag[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [bulkDialog, setBulkDialog] = React.useState<null | 'enable' | 'disable'>(null);
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const [disableConfirmText, setDisableConfirmText] = React.useState('');

  const loadFlags = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: TenantAiFlag[] } | TenantAiFlag[]>('/api/v1/ai-flags');
      const list = unwrap<TenantAiFlag[]>(res);
      setFlags(Array.isArray(list) ? list : []);
      setLoadError(null);
    } catch (err) {
      console.error('[AiFlagsAdminPage.loadFlags]', err);
      setLoadError('load_failed');
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
    void loadFlags();
  }, [canManage, loadFlags]);

  const setFlagLocal = React.useCallback(
    (moduleKey: WellbeingAiModuleKey, updater: (flag: TenantAiFlag) => TenantAiFlag) => {
      setFlags((prev) =>
        prev ? prev.map((f) => (f.module_key === moduleKey ? updater(f) : f)) : prev,
      );
    },
    [],
  );

  const handleToggle = React.useCallback(
    async (moduleKey: WellbeingAiModuleKey, nextValue: boolean) => {
      const previous = flags?.find((f) => f.module_key === moduleKey);
      if (!previous) return;

      // Optimistic update
      setFlagLocal(moduleKey, (f) => ({ ...f, enabled: nextValue }));

      try {
        const res = await apiClient<{ data: TenantAiFlag } | TenantAiFlag>(
          `/api/v1/ai-flags/${moduleKey}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ enabled: nextValue }),
          },
        );
        const updated = unwrap<TenantAiFlag>(res);
        setFlagLocal(moduleKey, () => updated);
        toast.success(nextValue ? t('toggleEnabled') : t('toggleDisabled'));
      } catch (err) {
        console.error('[AiFlagsAdminPage.handleToggle]', err);
        // Revert
        setFlagLocal(moduleKey, () => previous);
        const errorObj = err as { error?: { message?: string } };
        toast.error(errorObj?.error?.message ?? t('toggleFailed'));
      }
    },
    [flags, setFlagLocal, t],
  );

  const handleBulk = React.useCallback(
    async (enabled: boolean) => {
      if (!flags) return;
      setBulkBusy(true);

      const snapshot = flags;
      // Optimistic
      setFlags((prev) => (prev ? prev.map((f) => ({ ...f, enabled })) : prev));

      let failed = 0;
      for (const flag of snapshot) {
        if (flag.enabled === enabled) continue;
        try {
          const res = await apiClient<{ data: TenantAiFlag } | TenantAiFlag>(
            `/api/v1/ai-flags/${flag.module_key}`,
            {
              method: 'PATCH',
              body: JSON.stringify({ enabled }),
            },
          );
          const updated = unwrap<TenantAiFlag>(res);
          setFlagLocal(flag.module_key, () => updated);
        } catch (err) {
          failed += 1;
          console.error('[AiFlagsAdminPage.handleBulk]', flag.module_key, err);
          // Revert just this one
          setFlagLocal(flag.module_key, () => flag);
        }
      }

      setBulkBusy(false);
      setBulkDialog(null);
      setDisableConfirmText('');

      if (failed === 0) {
        toast.success(enabled ? t('bulkEnabledAll') : t('bulkDisabledAll'));
      } else {
        toast.error(t('bulkPartialFailure', { failed }));
      }
    },
    [flags, setFlagLocal, t],
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
        </div>
      </div>
    );
  }

  if (loadError === 'permission_denied') {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <Shield className="mx-auto mb-3 h-10 w-10 text-text-tertiary" />
          <p className="text-base font-semibold text-text-primary">{t('permissionDeniedTitle')}</p>
          <p className="mt-1 text-sm text-text-secondary">{t('permissionDeniedDesc')}</p>
        </div>
      </div>
    );
  }

  if (loadError || !flags) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-warning-600" />
          <p className="text-sm font-medium text-warning-800">{t('loadFailedTitle')}</p>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              setLoadError(null);
              void loadFlags();
            }}
          >
            {t('retry')}
          </Button>
        </div>
      </div>
    );
  }

  const allEnabled = flags.every((f) => f.enabled);
  const allDisabled = flags.every((f) => !f.enabled);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Bulk action bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-700">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-primary">{t('bulkTitle')}</p>
            <p className="mt-0.5 text-xs text-text-tertiary">{t('bulkDesc')}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={bulkBusy || allEnabled}
            onClick={() => setBulkDialog('enable')}
          >
            {t('enableAll')}
          </Button>
          <Button
            variant="outline"
            disabled={bulkBusy || allDisabled}
            onClick={() => setBulkDialog('disable')}
          >
            {t('disableAll')}
          </Button>
        </div>
      </div>

      {/* Module cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {MODULE_META.map((meta) => {
          const flag = flags.find((f) => f.module_key === meta.key);
          if (!flag) return null;
          return (
            <ModuleCard
              key={meta.key}
              meta={meta}
              flag={flag}
              onToggle={(next) => void handleToggle(meta.key, next)}
            />
          );
        })}
      </div>

      {/* Cost note */}
      <p className="text-xs text-text-tertiary">{t('costNote')}</p>

      {/* Bulk enable dialog */}
      <Dialog open={bulkDialog === 'enable'} onOpenChange={(open) => !open && setBulkDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bulkEnableTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('bulkEnableDesc')}</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBulkDialog(null)} disabled={bulkBusy}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleBulk(true)} disabled={bulkBusy}>
              {bulkBusy ? t('applying') : t('confirmEnableAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk disable dialog with typed confirmation */}
      <Dialog
        open={bulkDialog === 'disable'}
        onOpenChange={(open) => {
          if (!open) {
            setBulkDialog(null);
            setDisableConfirmText('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bulkDisableTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-text-secondary">{t('bulkDisableDesc')}</p>
            <div className="rounded-lg border border-warning-200 bg-warning-50 p-3">
              <p className="text-xs text-warning-800">{t('bulkDisableWarning')}</p>
            </div>
            <div>
              <Label htmlFor="confirm-disable">
                {t('bulkDisableConfirmLabel', { phrase: t('disablePhrase') })}
              </Label>
              <Input
                id="confirm-disable"
                value={disableConfirmText}
                onChange={(e) => setDisableConfirmText(e.target.value)}
                placeholder={t('disablePhrase')}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setBulkDialog(null);
                setDisableConfirmText('');
              }}
              disabled={bulkBusy}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleBulk(false)}
              disabled={bulkBusy || disableConfirmText.trim() !== t('disablePhrase')}
            >
              {bulkBusy ? t('applying') : t('confirmDisableAll')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Module card ────────────────────────────────────────────────────────────

function ModuleCard({
  meta,
  flag,
  onToggle,
}: {
  meta: ModuleMeta;
  flag: TenantAiFlag;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations('aiFlagsAdmin');
  const Icon = meta.icon;
  const updatedLabel = formatUpdated(flag.updated_at);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${meta.accent}`}
      />
      <div className="flex items-start gap-4 p-5 sm:p-6">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ring-black/5 ${meta.iconBg}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-text-primary">
                  {t(`module.${meta.key}.name`)}
                </h2>
                <Badge variant={flag.enabled ? 'default' : 'secondary'}>
                  {flag.enabled ? t('enabled') : t('disabled')}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
                {t(`module.${meta.key}.description`)}
              </p>
            </div>
            <Switch
              checked={flag.enabled}
              onCheckedChange={onToggle}
              aria-label={t('toggleAria', { module: t(`module.${meta.key}.name`) })}
              className="mt-0.5 shrink-0"
            />
          </div>
          <div className="text-xs text-text-tertiary">
            {updatedLabel ? t('lastChanged', { when: updatedLabel }) : t('neverChanged')}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUpdated(iso: string): string | null {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}
