'use client';

import { BrainCircuit, Lightbulb, Sparkles, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type {
  ReportsAiFeatureState,
  ReportsAiModuleKey,
} from '@school/shared/reports';
import { Badge, Switch } from '@school/ui';

import { findAiFeature, formatCostUsd, formatUsageCount } from './reports-settings.helpers';

interface AiFeatureMeta {
  key: ReportsAiModuleKey;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
}

const AI_FEATURES: AiFeatureMeta[] = [
  {
    key: 'reports_narration',
    icon: Sparkles,
    accent: 'from-violet-400 via-violet-500 to-violet-600',
    iconBg: 'bg-violet-100 text-violet-700',
  },
  {
    key: 'reports_ask_ai',
    icon: BrainCircuit,
    accent: 'from-sky-400 via-sky-500 to-sky-600',
    iconBg: 'bg-sky-100 text-sky-700',
  },
  {
    key: 'reports_predictions',
    icon: Lightbulb,
    accent: 'from-amber-400 via-amber-500 to-amber-600',
    iconBg: 'bg-amber-100 text-amber-700',
  },
];

/**
 * AI Features tab — three toggle cards (narration, ask-AI, predictions).
 *
 * The parent page owns the toggle state; this component is a presentational
 * wrapper plus optimistic-toggle confirmation glue. The "request" callback
 * exists so the parent can intercept and show a confirmation modal when
 * disabling a feature with non-zero monthly usage.
 */
export function AiFeaturesTab({
  features,
  onRequestToggle,
}: {
  features: ReportsAiFeatureState[];
  onRequestToggle: (moduleKey: ReportsAiModuleKey, nextEnabled: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {AI_FEATURES.map((meta) => (
        <AiFeatureCard
          key={meta.key}
          meta={meta}
          state={findAiFeature(features, meta.key)}
          onToggle={(next) => onRequestToggle(meta.key, next)}
        />
      ))}
    </div>
  );
}

function AiFeatureCard({
  meta,
  state,
  onToggle,
}: {
  meta: AiFeatureMeta;
  state: ReportsAiFeatureState;
  onToggle: (next: boolean) => void;
}) {
  const t = useTranslations('reportsSettings');
  const Icon = meta.icon;
  const usageCount = formatUsageCount(state.usage.monthly_usage);
  const costLabel = formatCostUsd(state.usage.cost_estimate_usd);
  return (
    <div
      id={`ai-feature-${meta.key}`}
      data-testid={`ai-feature-card-${meta.key}`}
      className="relative overflow-hidden rounded-2xl border border-border bg-surface"
    >
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
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight text-text-primary">
                  {t(`aiFeatures.${meta.key}.label`)}
                </h2>
                <Badge variant={state.enabled ? 'default' : 'secondary'}>
                  {state.enabled ? t('aiFeatures.enabled') : t('aiFeatures.disabled')}
                </Badge>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
                {t(`aiFeatures.${meta.key}.description`)}
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                {t('aiFeatures.usageLine', { count: usageCount, cost: costLabel })}
              </p>
            </div>
            <Switch
              checked={state.enabled}
              onCheckedChange={onToggle}
              aria-label={t('aiFeatures.toggleAria', {
                module: t(`aiFeatures.${meta.key}.label`),
              })}
              className="mt-0.5 shrink-0"
              data-testid={`ai-feature-toggle-${meta.key}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
