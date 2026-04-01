'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Input, Label } from '@school/ui';

import type { SignalDomain } from '@/lib/early-warning';

const DOMAINS: SignalDomain[] = ['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement'];

interface WeightSlidersProps {
  weights: Record<SignalDomain, number>;
  onChange: (weights: Record<SignalDomain, number>) => void;
}

export function WeightSliders({ weights, onChange }: WeightSlidersProps) {
  const t = useTranslations('early_warning');
  const total = DOMAINS.reduce((sum, d) => sum + weights[d], 0);
  const isValid = total === 100;

  const handleChange = (domain: SignalDomain, value: number) => {
    const clamped = Math.max(0, Math.min(100, value));
    const next = { ...weights, [domain]: clamped };
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {DOMAINS.map((domain) => (
        <div key={domain} className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-text-secondary">{t(`domains.${domain}` as never)}</Label>
            <span className="font-mono text-sm text-text-primary">{weights[domain]}%</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={weights[domain]}
              onChange={(e) => handleChange(domain, Number(e.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-secondary accent-primary-600
                [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-primary-600"
            />
            <Input
              type="number"
              min={0}
              max={100}
              step={5}
              value={weights[domain]}
              onChange={(e) => handleChange(domain, Number(e.target.value))}
              className="w-20 text-center font-mono"
            />
          </div>
        </div>
      ))}

      <div
        className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm font-medium ${
          isValid ? 'bg-emerald-50 text-emerald-700' : 'bg-danger-fill text-danger-text'
        }`}
      >
        <span>{t('settings.total')}</span>
        <span className="font-mono">{total}%</span>
      </div>
      {!isValid && <p className="text-xs text-danger-text">{t('settings.weights_must_sum')}</p>}
    </div>
  );
}
