'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { TIER_COLORS } from '@/lib/early-warning';

interface RoutingRulesConfigProps {
  routingRules: {
    yellow: { role: string };
    amber: { role: string };
    red: { roles: string[] };
  };
  onChange: (rules: RoutingRulesConfigProps['routingRules']) => void;
}

const ROLE_OPTIONS = [
  { value: 'homeroom_teacher', labelKey: 'homeroom_teacher' },
  { value: 'year_head', labelKey: 'year_head' },
  { value: 'principal', labelKey: 'principal' },
  { value: 'pastoral_lead', labelKey: 'pastoral_lead' },
  { value: 'deputy_principal', labelKey: 'deputy_principal' },
];

export function RoutingRulesConfig({ routingRules, onChange }: RoutingRulesConfigProps) {
  const t = useTranslations('early_warning.settings');

  return (
    <div className="space-y-4">
      {/* Yellow tier routing */}
      <div>
        <Label className={`text-sm ${TIER_COLORS.yellow.text}`}>{t('routing_yellow')}</Label>
        <Select
          value={routingRules.yellow.role}
          onValueChange={(v) => onChange({ ...routingRules, yellow: { role: v } })}
        >
          <SelectTrigger className="mt-1 w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(`roles.${opt.labelKey}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Amber tier routing */}
      <div>
        <Label className={`text-sm ${TIER_COLORS.amber.text}`}>{t('routing_amber')}</Label>
        <Select
          value={routingRules.amber.role}
          onValueChange={(v) => onChange({ ...routingRules, amber: { role: v } })}
        >
          <SelectTrigger className="mt-1 w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {t(`roles.${opt.labelKey}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Red tier routing (multiple roles) */}
      <div>
        <Label className={`text-sm ${TIER_COLORS.red.text}`}>{t('routing_red')}</Label>
        <p className="mt-1 text-xs text-text-tertiary">{t('routing_red_description')}</p>
        <div className="mt-2 space-y-2">
          {ROLE_OPTIONS.map((opt) => {
            const checked = routingRules.red.roles.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = checked
                      ? routingRules.red.roles.filter((r) => r !== opt.value)
                      : [...routingRules.red.roles, opt.value];
                    onChange({ ...routingRules, red: { roles: next } });
                  }}
                  className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-text-primary">
                  {t(`roles.${opt.labelKey}` as never)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
