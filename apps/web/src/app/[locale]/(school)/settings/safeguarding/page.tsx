'use client';

import { Save, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SafeguardingSettings {
  dlp_user_id: string;
  deputy_dlp_user_id: string;
  board_contact_user_id: string;
  sla_critical_hours: number;
  sla_high_hours: number;
  sla_medium_hours: number;
  sla_low_hours: number;
  retention_years: number;
  module_enabled: boolean;
}

interface SettingsResponse {
  data: SafeguardingSettings;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SafeguardingSettingsPage() {
  const t = useTranslations('safeguarding.settings');
  const [settings, setSettings] = React.useState<SafeguardingSettings>({
    dlp_user_id: '',
    deputy_dlp_user_id: '',
    board_contact_user_id: '',
    sla_critical_hours: 24,
    sla_high_hours: 48,
    sla_medium_hours: 120,
    sla_low_hours: 240,
    retention_years: 75,
    module_enabled: true,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    apiClient<SettingsResponse>('/api/v1/safeguarding/settings')
      .then((res) => {
        if (res.data) setSettings(res.data);
      })
      .catch((err) => { console.error('[SettingsSafeguardingPage]', err); })
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      await apiClient('/api/v1/safeguarding/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      // Error handled by global toast
      console.error('[setTimeout]', err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = <K extends keyof SafeguardingSettings>(
    key: K,
    value: SafeguardingSettings[K],
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-surface-secondary" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              t('saving')
            ) : saved ? (
              t('saved')
            ) : (
              <>
                <Save className="me-2 h-4 w-4" />
                {t('saveChanges')}
              </>
            )}
          </Button>
        }
      />

      {/* Module Status */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <ShieldCheck className="h-4 w-4" />
          {t('sections.moduleStatus')}
        </h2>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => updateField('module_enabled', !settings.module_enabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              settings.module_enabled ? 'bg-primary' : 'bg-gray-300'
            }`}
            role="switch"
            aria-checked={settings.module_enabled}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                settings.module_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm text-text-primary">
            {settings.module_enabled ? t('moduleEnabled') : t('moduleDisabled')}
          </span>
        </div>
      </div>

      {/* DLP Assignment */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text-primary">{t('sections.dlp')}</h2>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="dlp">{t('dlpLabel')}</Label>
            <Input
              id="dlp"
              type="text"
              placeholder={t('dlpPlaceholder')}
              value={settings.dlp_user_id}
              onChange={(e) => updateField('dlp_user_id', e.target.value)}
              className="w-full text-base"
            />
            <p className="text-xs text-text-tertiary">{t('labels.dlpDescription')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deputy-dlp">{t('deputyDlpLabel')}</Label>
            <Input
              id="deputy-dlp"
              type="text"
              placeholder={t('deputyDlpPlaceholder')}
              value={settings.deputy_dlp_user_id}
              onChange={(e) => updateField('deputy_dlp_user_id', e.target.value)}
              className="w-full text-base"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="board-contact">{t('boardContactLabel')}</Label>
            <Input
              id="board-contact"
              type="text"
              placeholder={t('boardContactPlaceholder')}
              value={settings.board_contact_user_id}
              onChange={(e) => updateField('board_contact_user_id', e.target.value)}
              className="w-full text-base"
            />
          </div>
        </div>
      </div>

      {/* SLA Thresholds */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text-primary">{t('sections.slaThresholds')}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="sla-critical">{t('slaCritical')}</Label>
            <Input
              id="sla-critical"
              type="number"
              min={1}
              value={settings.sla_critical_hours}
              onChange={(e) => updateField('sla_critical_hours', Number(e.target.value))}
              className="w-full text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-high">{t('slaHigh')}</Label>
            <Input
              id="sla-high"
              type="number"
              min={1}
              value={settings.sla_high_hours}
              onChange={(e) => updateField('sla_high_hours', Number(e.target.value))}
              className="w-full text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-medium">{t('slaMedium')}</Label>
            <Input
              id="sla-medium"
              type="number"
              min={1}
              value={settings.sla_medium_hours}
              onChange={(e) => updateField('sla_medium_hours', Number(e.target.value))}
              className="w-full text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sla-low">{t('slaLow')}</Label>
            <Input
              id="sla-low"
              type="number"
              min={1}
              value={settings.sla_low_hours}
              onChange={(e) => updateField('sla_low_hours', Number(e.target.value))}
              className="w-full text-base"
            />
          </div>
        </div>
      </div>

      {/* Retention */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="text-base font-semibold text-text-primary">{t('sections.dataRetention')}</h2>
        <div className="mt-4 space-y-1.5">
          <Label htmlFor="retention">{t('retentionLabel')}</Label>
          <Input
            id="retention"
            type="number"
            min={1}
            value={settings.retention_years}
            onChange={(e) => updateField('retention_years', Number(e.target.value))}
            className="w-full text-base sm:w-32"
          />
          <p className="text-xs text-text-tertiary">{t('labels.retentionHint')}</p>
        </div>
      </div>
    </div>
  );
}
