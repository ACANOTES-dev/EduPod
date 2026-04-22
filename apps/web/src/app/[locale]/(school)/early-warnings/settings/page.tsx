'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  updateEarlyWarningConfigSchema,
  type UpdateEarlyWarningConfigDto,
} from '@school/shared/early-warning';
import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import type { EarlyWarningConfig, RiskTier, SignalDomain } from '@/lib/early-warning';

import { DigestConfig } from './_components/digest-config';
import { RoutingRulesConfig } from './_components/routing-rules-config';
import { ThresholdConfig } from './_components/threshold-config';
import { WeightSliders } from './_components/weight-sliders';

const DEFAULT_WEIGHTS: Record<SignalDomain, number> = {
  attendance: 25,
  grades: 25,
  behaviour: 20,
  wellbeing: 20,
  engagement: 10,
};

const DEFAULT_THRESHOLDS: Record<RiskTier, number> = {
  green: 0,
  yellow: 30,
  amber: 50,
  red: 75,
};

function hasCompleteConfig(cfg: EarlyWarningConfig | null | undefined): cfg is EarlyWarningConfig {
  if (!cfg) return false;
  if (!cfg.weights_json || typeof cfg.weights_json.attendance !== 'number') return false;
  if (!cfg.thresholds_json || typeof cfg.thresholds_json.amber !== 'number') return false;
  if (!cfg.routing_rules_json) return false;
  if (cfg.id === null) return false;
  return true;
}

export default function EarlyWarningSettingsPage() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  // True when no per-tenant config row exists yet. The form shows sensible
  // defaults; saving will POST them and materialise the row on the backend.
  const [usingDefaults, setUsingDefaults] = React.useState(false);

  const form = useForm<UpdateEarlyWarningConfigDto>({
    resolver: zodResolver(updateEarlyWarningConfigSchema),
    defaultValues: {
      weights_json: DEFAULT_WEIGHTS,
      thresholds_json: DEFAULT_THRESHOLDS,
      hysteresis_buffer: 10,
      routing_rules_json: {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      },
      digest_day: 1,
      digest_recipients_json: ['principal'],
    },
  });

  // ─── Load existing config ──────────────────────────────────────────────────
  // Backend may return a partial/empty payload on tenants that have never
  // saved settings. When the config is incomplete, we fall back to the
  // inline defaults (which mirror the impl 01 seed) and surface a banner so
  // the admin understands why the form is pre-filled.
  React.useEffect(() => {
    apiClient<{ data: EarlyWarningConfig | null }>('/api/v1/early-warnings/config')
      .then((res) => {
        const cfg = res.data;
        if (!hasCompleteConfig(cfg)) {
          setUsingDefaults(true);
          return;
        }
        setUsingDefaults(false);
        form.reset({
          weights_json: cfg.weights_json,
          thresholds_json: cfg.thresholds_json,
          hysteresis_buffer: cfg.hysteresis_buffer,
          routing_rules_json: cfg.routing_rules_json,
          digest_day: cfg.digest_day,
          digest_recipients_json: cfg.digest_recipients_json,
        });
      })
      .catch((err) => {
        console.error('[EarlyWarningSettings.load]', err);
        // Missing config row is a common benign case on fresh tenants; surface
        // defaults instead of the load-failure toast.
        setUsingDefaults(true);
      })
      .finally(() => setLoading(false));
  }, [form, t]);

  // ─── Save ──────────────────────────────────────────────────────────────────
  const onSubmit = async (data: UpdateEarlyWarningConfigDto) => {
    setSaving(true);
    try {
      await apiClient('/api/v1/early-warnings/config', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      toast.success(t('settings.saved'));
    } catch (err) {
      console.error('[EarlyWarningSettings.save]', err);
      toast.error(t('errors.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-surface-secondary" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <PageHeader
        title={t('settings.title')}
        back={{ href: `/${locale}/early-warnings`, label: t('cohort.back_to_list') }}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              <Save className="me-2 h-4 w-4" />
              {t('settings.save')}
            </Button>
          </div>
        }
      />

      {usingDefaults && (
        <div className="rounded-2xl border border-border bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/10 dark:text-amber-200">
          {t('settings.defaults_notice')}
        </div>
      )}

      {/* Domain Weights */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">{t('settings.weights')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.weights_description')}</p>
        <div className="mt-4">
          <Controller
            control={form.control}
            name="weights_json"
            render={({ field }) => (
              <WeightSliders
                weights={field.value as Record<SignalDomain, number>}
                onChange={field.onChange}
              />
            )}
          />
        </div>
      </section>

      {/* Thresholds */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">{t('settings.thresholds')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.thresholds_description')}</p>
        <div className="mt-4">
          <Controller
            control={form.control}
            name="thresholds_json"
            render={({ field }) => (
              <ThresholdConfig
                thresholds={field.value as Record<RiskTier, number>}
                hysteresisBuffer={form.watch('hysteresis_buffer') ?? 10}
                onThresholdsChange={field.onChange}
                onHysteresisChange={(v) => form.setValue('hysteresis_buffer', v)}
              />
            )}
          />
        </div>
      </section>

      {/* Routing Rules */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">{t('settings.routing')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.routing_description')}</p>
        <div className="mt-4">
          <Controller
            control={form.control}
            name="routing_rules_json"
            render={({ field }) => (
              <RoutingRulesConfig
                routingRules={
                  field.value as {
                    yellow: { role: string };
                    amber: { role: string };
                    red: { roles: string[] };
                  }
                }
                onChange={field.onChange}
              />
            )}
          />
        </div>
      </section>

      {/* Digest */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">{t('settings.digest')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.digest_description')}</p>
        <div className="mt-4">
          <Controller
            control={form.control}
            name="digest_day"
            render={({ field }) => (
              <DigestConfig
                digestDay={field.value ?? 1}
                digestRecipients={
                  (form.watch('digest_recipients_json') as string[]) ?? ['principal']
                }
                onDayChange={field.onChange}
                onRecipientsChange={(v) => form.setValue('digest_recipients_json', v)}
              />
            )}
          />
        </div>
      </section>
    </form>
  );
}
