'use client';

import { Input, Label } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { TIER_COLORS, type RiskTier } from '@/lib/early-warning';

interface ThresholdConfigProps {
  thresholds: Record<RiskTier, number>;
  hysteresisBuffer: number;
  onThresholdsChange: (thresholds: Record<RiskTier, number>) => void;
  onHysteresisChange: (buffer: number) => void;
}

const TIERS: RiskTier[] = ['green', 'yellow', 'amber', 'red'];

export function ThresholdConfig({
  thresholds,
  hysteresisBuffer,
  onThresholdsChange,
  onHysteresisChange,
}: ThresholdConfigProps) {
  const t = useTranslations('early_warning');

  const handleThresholdChange = (tier: RiskTier, value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    onThresholdsChange({ ...thresholds, [tier]: clamped });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {TIERS.map((tier) => {
          const colors = TIER_COLORS[tier];
          return (
            <div key={tier}>
              <Label className={`text-sm ${colors.text}`}>
                {t(`summary.${tier}` as never)}
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={thresholds[tier]}
                onChange={(e) => handleThresholdChange(tier, Number(e.target.value))}
                className="mt-1 font-mono"
              />
              <p className="mt-1 text-xs text-text-tertiary">
                {t('settings.threshold_minimum', { score: thresholds[tier] })}
              </p>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-4">
        <Label className="text-sm text-text-secondary">
          {t('settings.hysteresis')}
        </Label>
        <p className="mt-1 text-xs text-text-tertiary">
          {t('settings.hysteresis_description')}
        </p>
        <Input
          type="number"
          min={0}
          max={30}
          value={hysteresisBuffer}
          onChange={(e) => onHysteresisChange(Number(e.target.value))}
          className="mt-2 w-full font-mono sm:w-28"
        />
      </div>
    </div>
  );
}
