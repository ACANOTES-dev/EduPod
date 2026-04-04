'use client';

import { Save, Settings } from 'lucide-react';
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
  Switch,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SenSettings {
  review_cycle_weeks: number;
  auto_flag_on_referral: boolean;
  sna_schedule_format: 'weekly' | 'daily';
  enable_parent_portal_access: boolean;
  plan_number_prefix: string;
}

const DEFAULT_SETTINGS: SenSettings = {
  review_cycle_weeks: 6,
  auto_flag_on_referral: false,
  sna_schedule_format: 'weekly',
  enable_parent_portal_access: true,
  plan_number_prefix: 'IEP',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SenSettingsPage() {
  const t = useTranslations('sen.settings');
  const [settings, setSettings] = React.useState<SenSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data?: { sen?: Partial<SenSettings> }; sen?: Partial<SenSettings> }>(
      '/api/v1/settings',
    )
      .then((res) => {
        const root = 'data' in res && res.data ? res.data : res;
        const senConfig = root.sen;
        if (senConfig && typeof senConfig === 'object') {
          setSettings((prev) => ({ ...prev, ...senConfig }));
        }
      })
      .catch((err) => {
        console.error('[SettingsSenPage]', err);
        /* use defaults */
      })
      .finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof SenSettings>(key: K, value: SenSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify({ sen: settings }),
      });
      toast.success(t('toasts.saved'));
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      toast.error(ex?.error?.message ?? t('toasts.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button type="submit" disabled={saving}>
            {saving ? (
              t('saving')
            ) : (
              <>
                <Save className="me-2 h-4 w-4" />
                {t('saveChanges')}
              </>
            )}
          </Button>
        }
      />

      {/* Review Cycle & Plan Prefix */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Settings className="h-4 w-4" />
          {t('sections.general')}
        </h2>
        <div className="mt-5 space-y-5">
          {/* Default review cycle */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor="review-cycle" className="text-sm text-text-primary">
                {t('labels.reviewCycleWeeks')}
              </Label>
              <p className="text-xs text-text-tertiary">{t('descriptions.reviewCycleWeeks')}</p>
            </div>
            <Input
              id="review-cycle"
              type="number"
              min={1}
              max={52}
              value={settings.review_cycle_weeks}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) update('review_cycle_weeks', v);
              }}
              className="w-full shrink-0 text-base sm:w-28"
            />
          </div>

          {/* Plan number prefix */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor="plan-prefix" className="text-sm text-text-primary">
                {t('labels.planNumberPrefix')}
              </Label>
              <p className="text-xs text-text-tertiary">{t('descriptions.planNumberPrefix')}</p>
            </div>
            <Input
              id="plan-prefix"
              type="text"
              maxLength={10}
              value={settings.plan_number_prefix}
              onChange={(e) => update('plan_number_prefix', e.target.value)}
              className="w-full shrink-0 text-base sm:w-28"
            />
          </div>

          {/* SNA schedule format */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor="sna-format" className="text-sm text-text-primary">
                {t('labels.snaScheduleFormat')}
              </Label>
              <p className="text-xs text-text-tertiary">{t('descriptions.snaScheduleFormat')}</p>
            </div>
            <Select
              value={settings.sna_schedule_format}
              onValueChange={(v: 'weekly' | 'daily') => update('sna_schedule_format', v)}
            >
              <SelectTrigger id="sna-format" className="w-full shrink-0 sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">{t('options.weekly')}</SelectItem>
                <SelectItem value="daily">{t('options.daily')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Toggles */}
      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold text-text-primary">{t('sections.automation')}</h2>
        <div className="mt-5 space-y-5">
          {/* Auto-flag on referral */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor="auto-flag" className="text-sm text-text-primary">
                {t('labels.autoFlagOnReferral')}
              </Label>
              <p className="text-xs text-text-tertiary">{t('descriptions.autoFlagOnReferral')}</p>
            </div>
            <Switch
              id="auto-flag"
              checked={settings.auto_flag_on_referral}
              onCheckedChange={(v) => update('auto_flag_on_referral', v)}
              className="shrink-0"
            />
          </div>

          {/* Enable parent portal access */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-0.5">
              <Label htmlFor="parent-portal" className="text-sm text-text-primary">
                {t('labels.enableParentPortalAccess')}
              </Label>
              <p className="text-xs text-text-tertiary">
                {t('descriptions.enableParentPortalAccess')}
              </p>
            </div>
            <Switch
              id="parent-portal"
              checked={settings.enable_parent_portal_access}
              onCheckedChange={(v) => update('enable_parent_portal_access', v)}
              className="shrink-0"
            />
          </div>
        </div>
      </div>

      {/* Bottom save button */}
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  );
}
