'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

import { TIER_COLORS, type RiskTier } from '@/lib/early-warning';

interface RiskTierBadgeProps {
  tier: RiskTier;
  className?: string;
}

export function RiskTierBadge({ tier, className }: RiskTierBadgeProps) {
  const t = useTranslations('early_warning.summary');
  const colors = TIER_COLORS[tier];

  const label = t(tier);

  return <Badge className={`${colors.bg} ${colors.text} ${className ?? ''}`}>{label}</Badge>;
}
