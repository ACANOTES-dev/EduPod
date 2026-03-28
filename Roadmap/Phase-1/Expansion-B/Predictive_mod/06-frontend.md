# Phase F — Frontend (Early Warning Pages & Components)

> **Depends on:** Phase E (API layer must be deployed and returning data)
> **Spec:** `docs/superpowers/specs/2026-03-28-predictive-early-warning-design.md`

---

## Deliverables

| # | File | Type | Description |
|---|------|------|-------------|
| 1 | `apps/web/src/app/[locale]/(school)/early-warnings/page.tsx` | Page | List page — main entry point |
| 2 | `apps/web/src/app/[locale]/(school)/early-warnings/_components/early-warning-list.tsx` | Component | Table (desktop) + card layout (mobile) |
| 3 | `apps/web/src/app/[locale]/(school)/early-warnings/_components/risk-tier-badge.tsx` | Component | Green/yellow/amber/red tier badge |
| 4 | `apps/web/src/app/[locale]/(school)/early-warnings/_components/trend-sparkline.tsx` | Component | 30-day SVG mini chart |
| 5 | `apps/web/src/app/[locale]/(school)/early-warnings/_components/student-detail-panel.tsx` | Component | Sheet slide-over with full breakdown |
| 6 | `apps/web/src/app/[locale]/(school)/early-warnings/_components/domain-score-bars.tsx` | Component | 5-domain horizontal bar chart |
| 7 | `apps/web/src/app/[locale]/(school)/early-warnings/_components/signal-breakdown.tsx` | Component | Individual signal list with severity |
| 8 | `apps/web/src/app/[locale]/(school)/early-warnings/_components/tier-transition-timeline.tsx` | Component | History of tier changes |
| 9 | `apps/web/src/app/[locale]/(school)/early-warnings/cohort/page.tsx` | Page | Cohort heatmap page |
| 10 | `apps/web/src/app/[locale]/(school)/early-warnings/cohort/_components/cohort-heatmap.tsx` | Component | Dimensional pivot heatmap |
| 11 | `apps/web/src/app/[locale]/(school)/early-warnings/cohort/_components/cohort-filters.tsx` | Component | Group-by selector + filters |
| 12 | `apps/web/src/app/[locale]/(school)/early-warnings/settings/page.tsx` | Page | Settings page (admin only) |
| 13 | `apps/web/src/app/[locale]/(school)/early-warnings/settings/_components/weight-sliders.tsx` | Component | 5 domain weight sliders summing to 100 |
| 14 | `apps/web/src/app/[locale]/(school)/early-warnings/settings/_components/threshold-config.tsx` | Component | Tier threshold number inputs |
| 15 | `apps/web/src/app/[locale]/(school)/early-warnings/settings/_components/routing-rules-config.tsx` | Component | Tier -> role dropdown mapping |
| 16 | `apps/web/src/app/[locale]/(school)/early-warnings/settings/_components/digest-config.tsx` | Component | Day of week + recipient multiselect |
| 17 | `apps/web/src/app/[locale]/(school)/dashboard/_components/early-warning-card.tsx` | Component | Dashboard donut tile |
| 18 | `apps/web/messages/en.json` | i18n | Add `early_warning` namespace |
| 19 | `apps/web/messages/ar.json` | i18n | Add `early_warning` namespace (Arabic) |

---

## Prerequisite Check

Before starting, verify these exist (produced by Phases A-E):

- API endpoints responding at `/api/v1/early-warnings`, `/api/v1/early-warnings/:studentId`, `/api/v1/early-warnings/cohort`, `/api/v1/early-warnings/summary`, `/api/v1/early-warnings/config`
- Shared types in `packages/shared/src/early-warning/types.ts` (or equivalent)
- Zod schemas: `updateEarlyWarningConfigSchema` in `packages/shared/src/early-warning/schemas.ts`
- Permission `early_warning.view` / `early_warning.manage` seeded

---

## API Response Shapes (consumed by frontend)

These are the response types the frontend components will type against. Define them locally in each component or in a shared `apps/web/src/lib/early-warning.ts` types file.

```typescript
// ─── List endpoint: GET /api/v1/early-warnings ────────────────────────────────

interface RiskProfileListItem {
  id: string;
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  class_name: string | null;
  composite_score: number;
  risk_tier: 'green' | 'yellow' | 'amber' | 'red';
  top_signal: string | null;           // summaryFragments[0] from signal_summary_json
  trend_data: number[];                // last 30 daily composite scores from trend_json
  assigned_to_name: string | null;
  last_computed_at: string;
}

interface RiskProfileListResponse {
  data: RiskProfileListItem[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Detail endpoint: GET /api/v1/early-warnings/:studentId ───────────────────

interface RiskProfileDetail {
  id: string;
  student_id: string;
  student_name: string;
  composite_score: number;
  risk_tier: 'green' | 'yellow' | 'amber' | 'red';
  tier_entered_at: string;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  summary_text: string;                // NL summary from signal_summary_json
  trend_data: number[];                // last 30 daily scores
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  signals: RiskSignal[];
  transitions: TierTransition[];
}

interface RiskSignal {
  id: string;
  domain: 'attendance' | 'grades' | 'behaviour' | 'wellbeing' | 'engagement';
  signal_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score_contribution: number;
  summary_fragment: string;
  detected_at: string;
}

interface TierTransition {
  id: string;
  from_tier: 'green' | 'yellow' | 'amber' | 'red' | null;
  to_tier: 'green' | 'yellow' | 'amber' | 'red';
  composite_score: number;
  transitioned_at: string;
}

// ─── Summary endpoint: GET /api/v1/early-warnings/summary ─────────────────────

interface TierSummaryResponse {
  data: {
    green: number;
    yellow: number;
    amber: number;
    red: number;
  };
}

// ─── Cohort endpoint: GET /api/v1/early-warnings/cohort ───────────────────────

interface CohortRow {
  group_id: string;
  group_name: string;
  student_count: number;
  avg_composite: number;
  avg_attendance: number;
  avg_grades: number;
  avg_behaviour: number;
  avg_wellbeing: number;
  avg_engagement: number;
}

interface CohortResponse {
  data: CohortRow[];
}

// ─── Config endpoint: GET/PUT /api/v1/early-warnings/config ───────────────────

interface EarlyWarningConfig {
  id: string;
  is_enabled: boolean;
  weights: {
    attendance: number;
    grades: number;
    behaviour: number;
    wellbeing: number;
    engagement: number;
  };
  thresholds: {
    green: number;
    yellow: number;
    amber: number;
    red: number;
  };
  hysteresis_buffer: number;
  routing_rules: {
    yellow: { role: string };
    amber: { role: string };
    red: { roles: string[] };
  };
  digest_day: number;
  digest_recipients: string[];
}
```

---

## Implementation Order

Build in this sequence to allow incremental testing:

1. **Types file + translation keys** (`early-warning.ts` types, `en.json`, `ar.json`)
2. **Atomic components** (risk-tier-badge, trend-sparkline, domain-score-bars)
3. **Student detail panel** (sheet, signal-breakdown, tier-transition-timeline)
4. **List page** (early-warning-list + page.tsx)
5. **Dashboard card** (early-warning-card on main dashboard)
6. **Cohort heatmap** (cohort-heatmap, cohort-filters, cohort page.tsx)
7. **Settings page** (weight-sliders, threshold-config, routing-rules-config, digest-config, settings page.tsx)

---

## File-by-File Implementation

### F.1 — Types File

**File:** `apps/web/src/lib/early-warning.ts`

```typescript
// ─── Early Warning Frontend Types ─────────────────────────────────────────────

export type RiskTier = 'green' | 'yellow' | 'amber' | 'red';
export type SignalDomain = 'attendance' | 'grades' | 'behaviour' | 'wellbeing' | 'engagement';
export type SignalSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RiskProfileListItem {
  id: string;
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  class_name: string | null;
  composite_score: number;
  risk_tier: RiskTier;
  top_signal: string | null;
  trend_data: number[];
  assigned_to_name: string | null;
  last_computed_at: string;
}

export interface RiskProfileListResponse {
  data: RiskProfileListItem[];
  meta: { page: number; pageSize: number; total: number };
}

export interface RiskSignal {
  id: string;
  domain: SignalDomain;
  signal_type: string;
  severity: SignalSeverity;
  score_contribution: number;
  summary_fragment: string;
  detected_at: string;
}

export interface TierTransition {
  id: string;
  from_tier: RiskTier | null;
  to_tier: RiskTier;
  composite_score: number;
  transitioned_at: string;
}

export interface RiskProfileDetail {
  id: string;
  student_id: string;
  student_name: string;
  composite_score: number;
  risk_tier: RiskTier;
  tier_entered_at: string;
  attendance_score: number;
  grades_score: number;
  behaviour_score: number;
  wellbeing_score: number;
  engagement_score: number;
  summary_text: string;
  trend_data: number[];
  assigned_to_user_id: string | null;
  assigned_to_name: string | null;
  signals: RiskSignal[];
  transitions: TierTransition[];
}

export interface TierSummaryResponse {
  data: {
    green: number;
    yellow: number;
    amber: number;
    red: number;
  };
}

export interface CohortRow {
  group_id: string;
  group_name: string;
  student_count: number;
  avg_composite: number;
  avg_attendance: number;
  avg_grades: number;
  avg_behaviour: number;
  avg_wellbeing: number;
  avg_engagement: number;
}

export interface CohortResponse {
  data: CohortRow[];
}

export interface EarlyWarningConfig {
  id: string;
  is_enabled: boolean;
  weights: {
    attendance: number;
    grades: number;
    behaviour: number;
    wellbeing: number;
    engagement: number;
  };
  thresholds: {
    green: number;
    yellow: number;
    amber: number;
    red: number;
  };
  hysteresis_buffer: number;
  routing_rules: {
    yellow: { role: string };
    amber: { role: string };
    red: { roles: string[] };
  };
  digest_day: number;
  digest_recipients: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const TIER_ORDER: RiskTier[] = ['red', 'amber', 'yellow', 'green'];

export const TIER_COLORS: Record<RiskTier, { bg: string; text: string; ring: string }> = {
  red: { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-200' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-700', ring: 'ring-amber-200' },
  yellow: { bg: 'bg-yellow-100', text: 'text-yellow-700', ring: 'ring-yellow-200' },
  green: { bg: 'bg-emerald-100', text: 'text-emerald-700', ring: 'ring-emerald-200' },
};

export const DOMAIN_LABELS: Record<SignalDomain, string> = {
  attendance: 'Attendance',
  grades: 'Grades',
  behaviour: 'Behaviour',
  wellbeing: 'Wellbeing',
  engagement: 'Engagement',
};

export const DOMAIN_COLORS: Record<SignalDomain, string> = {
  attendance: 'bg-blue-500',
  grades: 'bg-purple-500',
  behaviour: 'bg-orange-500',
  wellbeing: 'bg-teal-500',
  engagement: 'bg-pink-500',
};

export const SEVERITY_COLORS: Record<SignalSeverity, { bg: string; text: string }> = {
  low: { bg: 'bg-slate-100', text: 'text-slate-600' },
  medium: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700' },
  critical: { bg: 'bg-red-100', text: 'text-red-700' },
};

/** Returns a heatmap cell colour class based on an average score (0-100). */
export function getHeatmapColor(score: number): string {
  if (score >= 75) return 'bg-red-200 text-red-900';
  if (score >= 50) return 'bg-amber-200 text-amber-900';
  if (score >= 30) return 'bg-yellow-200 text-yellow-900';
  return 'bg-emerald-200 text-emerald-900';
}
```

---

### F.2 — Risk Tier Badge

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/_components/risk-tier-badge.tsx`

A small presentational component reused in list rows, cards, detail panel, and timeline.

```tsx
'use client';

import { Badge } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { TIER_COLORS, type RiskTier } from '@/lib/early-warning';

interface RiskTierBadgeProps {
  tier: RiskTier;
  className?: string;
}

export function RiskTierBadge({ tier, className }: RiskTierBadgeProps) {
  const t = useTranslations('early_warning.summary');
  const colors = TIER_COLORS[tier];

  const label = t(tier);   // green -> "On Track", red -> "Intervention Needed"

  return (
    <Badge className={`${colors.bg} ${colors.text} ${className ?? ''}`}>
      {label}
    </Badge>
  );
}
```

**Notes:**
- Uses the shared `Badge` from `@school/ui` which already supports custom className.
- Translation key `early_warning.summary.green` etc. resolves the tier label.
- No RTL issues — badges are symmetric.

---

### F.3 — Trend Sparkline

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/_components/trend-sparkline.tsx`

Pure SVG polyline. No chart library. Lightweight enough for table cells.

```tsx
'use client';

import * as React from 'react';

interface TrendSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function TrendSparkline({
  data,
  width = 80,
  height = 24,
  className,
}: TrendSparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 100);
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * height}`)
    .join(' ');

  // Determine stroke colour: if last value > first value, trending worse (red); else green
  const trending = data[data.length - 1] > data[0];
  const stroke = trending ? '#ef4444' : '#10b981';

  return (
    <svg
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
```

**Notes:**
- Higher composite score = worse, so upward trend = red, downward = green.
- `aria-hidden` because the sparkline is decorative; screen readers use the numeric score.
- No RTL concerns for SVG sparklines (data flows left-to-right regardless of text direction).

---

### F.4 — Domain Score Bars

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/_components/domain-score-bars.tsx`

Five horizontal bars showing each domain's score out of 100.

```tsx
'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DOMAIN_COLORS, type SignalDomain } from '@/lib/early-warning';

interface DomainScoreBarsProps {
  scores: Record<SignalDomain, number>;
}

const DOMAINS: SignalDomain[] = ['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement'];

export function DomainScoreBars({ scores }: DomainScoreBarsProps) {
  const t = useTranslations('early_warning');

  return (
    <div className="space-y-3">
      {DOMAINS.map((domain) => {
        const score = scores[domain];
        const color = DOMAIN_COLORS[domain];

        return (
          <div key={domain}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-secondary">
                {t(`domains.${domain}` as never)}
              </span>
              <span className="font-mono text-text-primary">{score.toFixed(0)}</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-surface-secondary">
              <div
                className={`h-2 rounded-full ${color} transition-all duration-500`}
                style={{ width: `${Math.min(score, 100)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Notes:**
- Bars are horizontal, full-width. No RTL issues — `width` style is directionally neutral.
- Translation keys: `early_warning.domains.attendance`, etc.

---

### F.5 — Signal Breakdown

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/_components/signal-breakdown.tsx`

Renders the list of individual detected signals sorted by score contribution.

```tsx
'use client';

import { Badge } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DOMAIN_COLORS, SEVERITY_COLORS, type RiskSignal } from '@/lib/early-warning';
import { formatDateTime } from '@/lib/format-date';

interface SignalBreakdownProps {
  signals: RiskSignal[];
}

export function SignalBreakdown({ signals }: SignalBreakdownProps) {
  const t = useTranslations('early_warning');

  const sorted = [...signals].sort((a, b) => b.score_contribution - a.score_contribution);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">{t('detail.no_signals')}</p>
    );
  }

  return (
    <div className="space-y-2">
      {sorted.map((signal) => {
        const severity = SEVERITY_COLORS[signal.severity];
        const domainColor = DOMAIN_COLORS[signal.domain];

        return (
          <div
            key={signal.id}
            className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${domainColor}`} />
                <span className="text-xs font-medium uppercase text-text-tertiary">
                  {t(`domains.${signal.domain}` as never)}
                </span>
                <Badge className={`${severity.bg} ${severity.text}`}>
                  {signal.severity}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-text-primary">
                {signal.summary_fragment}
              </p>
              <p className="mt-1 text-xs text-text-tertiary">
                {formatDateTime(signal.detected_at)}
              </p>
            </div>
            <div className="shrink-0 text-end">
              <span className="font-mono text-sm font-medium text-text-primary">
                +{signal.score_contribution.toFixed(0)}
              </span>
              <p className="text-xs text-text-tertiary">{t('detail.points')}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Notes:**
- Uses `text-end` not `text-right`. Uses `flex-wrap` for small screens.
- Signals are sorted descending by score contribution — highest-impact signal first.

---

### F.6 — Tier Transition Timeline

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/_components/tier-transition-timeline.tsx`

Vertical timeline showing historical tier changes.

```tsx
'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { TIER_COLORS, type TierTransition } from '@/lib/early-warning';
import { formatDateTime } from '@/lib/format-date';

import { RiskTierBadge } from './risk-tier-badge';

interface TierTransitionTimelineProps {
  transitions: TierTransition[];
}

export function TierTransitionTimeline({ transitions }: TierTransitionTimelineProps) {
  const t = useTranslations('early_warning');

  if (transitions.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">{t('detail.no_transitions')}</p>
    );
  }

  // Most recent first
  const sorted = [...transitions].sort(
    (a, b) => new Date(b.transitioned_at).getTime() - new Date(a.transitioned_at).getTime(),
  );

  return (
    <div className="relative space-y-4 ps-6">
      {/* Vertical line */}
      <div className="absolute start-2 top-1 bottom-1 w-0.5 bg-border" />

      {sorted.map((transition) => {
        const toColors = TIER_COLORS[transition.to_tier];

        return (
          <div key={transition.id} className="relative">
            {/* Dot on the timeline */}
            <div
              className={`absolute start-[-18px] top-1 h-3 w-3 rounded-full ring-2 ring-surface ${toColors.bg}`}
            />
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center gap-2">
                {transition.from_tier ? (
                  <>
                    <RiskTierBadge tier={transition.from_tier} />
                    <span className="text-xs text-text-tertiary">→</span>
                  </>
                ) : null}
                <RiskTierBadge tier={transition.to_tier} />
              </div>
              <span className="font-mono text-xs text-text-tertiary">
                {t('detail.score_at_transition', {
                  score: transition.composite_score.toFixed(0),
                })}
              </span>
              <span className="text-xs text-text-tertiary">
                {formatDateTime(transition.transitioned_at)}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Notes:**
- Uses `ps-6` / `start-2` / `start-[-18px]` for RTL-safe timeline positioning.
- The vertical line uses `start-2` which maps to `left` in LTR and `right` in RTL.
- Arrow `→` is a Unicode character, not directional CSS.

---

### F.7 — Student Detail Panel

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/_components/student-detail-panel.tsx`

Sheet slide-over containing the full breakdown for a student.

```tsx
'use client';

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from '@school/ui';
import { ClipboardCheck, ExternalLink, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import type { RiskProfileDetail } from '@/lib/early-warning';

import { DomainScoreBars } from './domain-score-bars';
import { RiskTierBadge } from './risk-tier-badge';
import { SignalBreakdown } from './signal-breakdown';
import { TierTransitionTimeline } from './tier-transition-timeline';
import { TrendSparkline } from './trend-sparkline';

interface StudentDetailPanelProps {
  studentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAcknowledged?: () => void;
}

export function StudentDetailPanel({
  studentId,
  open,
  onOpenChange,
  onAcknowledged,
}: StudentDetailPanelProps) {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [detail, setDetail] = React.useState<RiskProfileDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [acknowledging, setAcknowledging] = React.useState(false);

  React.useEffect(() => {
    if (!studentId || !open) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    apiClient<{ data: RiskProfileDetail }>(
      `/api/v1/early-warnings/${studentId}`,
    )
      .then((res) => {
        if (!cancelled) setDetail(res.data);
      })
      .catch((err) => {
        console.error('[StudentDetailPanel]', err);
        toast.error(t('errors.load_failed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, open, t]);

  const handleAcknowledge = async () => {
    if (!studentId) return;
    setAcknowledging(true);
    try {
      await apiClient(`/api/v1/early-warnings/${studentId}/acknowledge`, {
        method: 'POST',
      });
      toast.success(t('detail.acknowledged'));
      onAcknowledged?.();
    } catch (err) {
      console.error('[StudentDetailPanel.acknowledge]', err);
      toast.error(t('errors.action_failed'));
    } finally {
      setAcknowledging(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
        {loading || !detail ? (
          <div className="space-y-4 pt-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-secondary" />
            ))}
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{detail.student_name}</SheetTitle>
              <SheetDescription>
                <span className="flex items-center gap-2">
                  <RiskTierBadge tier={detail.risk_tier} />
                  <span className="font-mono text-sm">
                    {t('list.score')}: {detail.composite_score.toFixed(0)}
                  </span>
                </span>
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* NL Summary */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('detail.summary')}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {detail.summary_text}
                </p>
              </section>

              {/* Domain Breakdown */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('detail.domains')}
                </h3>
                <div className="mt-3">
                  <DomainScoreBars
                    scores={{
                      attendance: detail.attendance_score,
                      grades: detail.grades_score,
                      behaviour: detail.behaviour_score,
                      wellbeing: detail.wellbeing_score,
                      engagement: detail.engagement_score,
                    }}
                  />
                </div>
              </section>

              {/* 30-Day Trend */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('detail.trend')}
                </h3>
                <div className="mt-3 rounded-xl border border-border p-4">
                  <TrendSparkline
                    data={detail.trend_data}
                    width={320}
                    height={48}
                  />
                </div>
              </section>

              {/* Signal Breakdown */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('detail.signals')}
                </h3>
                <div className="mt-3">
                  <SignalBreakdown signals={detail.signals} />
                </div>
              </section>

              {/* Tier Transition History */}
              <section>
                <h3 className="text-sm font-semibold text-text-primary">
                  {t('detail.transitions')}
                </h3>
                <div className="mt-3">
                  <TierTransitionTimeline transitions={detail.transitions} />
                </div>
              </section>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAcknowledge}
                  disabled={acknowledging}
                >
                  <ClipboardCheck className="me-2 h-4 w-4" />
                  {t('detail.acknowledge')}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${locale}/early-warnings?assign=${detail.student_id}`}>
                    <UserPlus className="me-2 h-4 w-4" />
                    {t('detail.assign')}
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/${locale}/pastoral/interventions/new?student_id=${detail.student_id}`}>
                    <ExternalLink className="me-2 h-4 w-4" />
                    {t('detail.create_intervention')}
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

**Notes:**
- Sheet opens from `end` side (right in LTR, left in RTL) — matches existing Sheet component.
- Width override: `sm:max-w-lg` (wider than default `sm:max-w-sm` to fit domain bars).
- All icons use `me-2` for RTL-safe spacing.
- `overflow-y-auto` on SheetContent for long detail views.
- Acknowledge fires a POST and calls `onAcknowledged` callback to let parent refresh.
- Create intervention links to the pastoral module's new intervention page, pre-filling student_id.

---

### F.8 — Early Warning List

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/_components/early-warning-list.tsx`

Desktop: table via `DataTable`. Mobile: card layout. Filters for tier, year group, class.

```tsx
'use client';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';
import type { RiskProfileListItem, RiskProfileListResponse, RiskTier } from '@/lib/early-warning';
import { TIER_ORDER } from '@/lib/early-warning';

import { RiskTierBadge } from './risk-tier-badge';
import { StudentDetailPanel } from './student-detail-panel';
import { TrendSparkline } from './trend-sparkline';

const PAGE_SIZE = 20;

interface YearGroupOption {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
}

export function EarlyWarningList() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // ─── State ──────────────────────────────────────────────────────────────────
  const [data, setData] = React.useState<RiskProfileListItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [tierFilter, setTierFilter] = React.useState('all');
  const [yearGroupFilter, setYearGroupFilter] = React.useState('all');
  const [classFilter, setClassFilter] = React.useState('all');

  // Filter options (fetched once)
  const [yearGroups, setYearGroups] = React.useState<YearGroupOption[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);

  // Detail panel
  const [selectedStudentId, setSelectedStudentId] = React.useState<string | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  // ─── Fetch filter options ───────────────────────────────────────────────────
  React.useEffect(() => {
    apiClient<{ data: YearGroupOption[] }>('/api/v1/year-groups', { silent: true })
      .then((res) => setYearGroups(res.data ?? []))
      .catch(() => setYearGroups([]));

    apiClient<{ data: ClassOption[] }>('/api/v1/classes?pageSize=200', { silent: true })
      .then((res) => setClasses(res.data ?? []))
      .catch(() => setClasses([]));
  }, []);

  // ─── Fetch list data ───────────────────────────────────────────────────────
  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (tierFilter !== 'all') params.set('tier', tierFilter);
      if (yearGroupFilter !== 'all') params.set('year_group_id', yearGroupFilter);
      if (classFilter !== 'all') params.set('class_id', classFilter);

      const res = await apiClient<RiskProfileListResponse>(
        `/api/v1/early-warnings?${params.toString()}`,
      );
      setData(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch (err) {
      console.error('[EarlyWarningList]', err);
      toast.error(t('errors.load_failed'));
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, tierFilter, yearGroupFilter, classFilter, t]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const openDetail = (item: RiskProfileListItem) => {
    setSelectedStudentId(item.student_id);
    setPanelOpen(true);
  };

  const handleAcknowledged = () => {
    void fetchData(); // Refresh list after acknowledgement
  };

  // ─── Toolbar (filters) ─────────────────────────────────────────────────────
  const toolbar = (
    <div className="grid gap-3 sm:grid-cols-3">
      <Select
        value={tierFilter}
        onValueChange={(v) => { setTierFilter(v); setPage(1); }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('list.filter_tier')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('list.all_tiers')}</SelectItem>
          {TIER_ORDER.map((tier) => (
            <SelectItem key={tier} value={tier}>
              {t(`summary.${tier}` as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={yearGroupFilter}
        onValueChange={(v) => { setYearGroupFilter(v); setPage(1); }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('cohort.year_group')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('list.all_year_groups')}</SelectItem>
          {yearGroups.map((yg) => (
            <SelectItem key={yg.id} value={yg.id}>{yg.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={classFilter}
        onValueChange={(v) => { setClassFilter(v); setPage(1); }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('cohort.class')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('list.all_classes')}</SelectItem>
          {classes.map((cls) => (
            <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'student_name',
      header: t('list.student'),
      render: (row: RiskProfileListItem) => (
        <div>
          <p className="font-medium text-text-primary">{row.student_name}</p>
          {row.year_group_name && (
            <p className="mt-0.5 text-xs text-text-tertiary">
              {row.year_group_name}
              {row.class_name ? ` · ${row.class_name}` : ''}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'composite_score',
      header: t('list.score'),
      render: (row: RiskProfileListItem) => (
        <span className="font-mono text-sm font-medium text-text-primary">
          {row.composite_score.toFixed(0)}
        </span>
      ),
      className: 'w-20',
    },
    {
      key: 'risk_tier',
      header: t('list.tier'),
      render: (row: RiskProfileListItem) => <RiskTierBadge tier={row.risk_tier} />,
      className: 'w-36',
    },
    {
      key: 'top_signal',
      header: t('list.top_signal'),
      render: (row: RiskProfileListItem) => (
        <p className="max-w-xs truncate text-sm text-text-secondary">
          {row.top_signal ?? t('list.no_signals')}
        </p>
      ),
    },
    {
      key: 'trend',
      header: t('list.trend'),
      render: (row: RiskProfileListItem) => (
        <TrendSparkline data={row.trend_data} />
      ),
      className: 'w-24',
    },
    {
      key: 'assigned_to',
      header: t('list.assigned_to'),
      render: (row: RiskProfileListItem) => (
        <span className="text-sm text-text-secondary">
          {row.assigned_to_name ?? t('list.unassigned')}
        </span>
      ),
    },
  ];

  return (
    <>
      {/* Mobile card layout */}
      <div className="space-y-4 md:hidden">
        {toolbar}
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface-secondary" />
          ))
        ) : data.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
            <p className="text-sm text-text-tertiary">{t('list.no_data')}</p>
          </div>
        ) : (
          data.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openDetail(item)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-start transition-colors hover:bg-surface-secondary"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <RiskTierBadge tier={item.risk_tier} />
                    <span className="font-mono text-sm font-medium text-text-primary">
                      {item.composite_score.toFixed(0)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium text-text-primary">
                    {item.student_name}
                  </p>
                  {item.top_signal && (
                    <p className="mt-1 truncate text-xs text-text-secondary">
                      {item.top_signal}
                    </p>
                  )}
                </div>
                <TrendSparkline data={item.trend_data} width={60} height={20} />
              </div>
            </button>
          ))
        )}

        {/* Mobile pagination */}
        {!loading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {t('list.previous')}
            </Button>
            <span className="text-sm text-text-secondary">
              {page} / {Math.ceil(total / PAGE_SIZE)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= Math.ceil(total / PAGE_SIZE)}
              onClick={() => setPage(page + 1)}
            >
              {t('list.next')}
            </Button>
          </div>
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={data}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={openDetail}
          keyExtractor={(row) => row.id}
          isLoading={loading}
        />
      </div>

      {/* Student detail slide-over */}
      <StudentDetailPanel
        studentId={selectedStudentId}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        onAcknowledged={handleAcknowledged}
      />
    </>
  );
}
```

**Notes:**
- Mobile: card layout hidden at `md:`. Desktop: DataTable hidden below `md:`.
- Card buttons use `text-start` not `text-left`.
- Uses existing `DataTable` component from `@/components/data-table` (same pattern as pastoral concerns).
- Fetches year groups and classes once for filter dropdowns.
- Row click opens the student detail Sheet.

---

### F.9 — List Page

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/page.tsx`

```tsx
'use client';

import { Button } from '@school/ui';
import { BarChart3, Settings } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

import { EarlyWarningList } from './_components/early-warning-list';

export default function EarlyWarningsPage() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/${locale}/early-warnings/cohort`}>
              <Button variant="outline">
                <BarChart3 className="me-2 h-4 w-4" />
                {t('cohort.title')}
              </Button>
            </Link>
            <Link href={`/${locale}/early-warnings/settings`}>
              <Button variant="outline">
                <Settings className="me-2 h-4 w-4" />
                {t('settings.title')}
              </Button>
            </Link>
          </div>
        }
      />

      <EarlyWarningList />
    </div>
  );
}
```

**Notes:**
- Client component (`'use client'`) because it contains interactive children.
- Uses `PageHeader` component matching the behaviour and pastoral pages.
- Links to cohort and settings sub-pages.

---

### F.10 — Dashboard Card

**File:** `apps/web/src/app/[locale]/(school)/dashboard/_components/early-warning-card.tsx`

Donut chart showing tier distribution. Fits into the main dashboard grid.

```tsx
'use client';

import { toast } from '@school/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { TIER_COLORS, type TierSummaryResponse } from '@/lib/early-warning';

// ─── Donut segment SVG ────────────────────────────────────────────────────────

interface DonutSegment {
  tier: 'green' | 'yellow' | 'amber' | 'red';
  count: number;
  color: string;
}

function TierDonut({ segments, total }: { segments: DonutSegment[]; total: number }) {
  if (total === 0) return null;

  const size = 80;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <svg width={size} height={size} className="shrink-0" aria-hidden="true">
      {segments.map((seg) => {
        if (seg.count === 0) return null;
        const fraction = seg.count / total;
        const dashArray = `${fraction * circumference} ${circumference}`;
        const dashOffset = -offset * circumference;
        offset += fraction;

        return (
          <circle
            key={seg.tier}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
      })}
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-text-primary text-sm font-semibold"
      >
        {total}
      </text>
    </svg>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

const DONUT_COLORS: Record<string, string> = {
  red: '#ef4444',
  amber: '#f59e0b',
  yellow: '#eab308',
  green: '#10b981',
};

export function EarlyWarningCard() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [summary, setSummary] = React.useState<TierSummaryResponse['data'] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<TierSummaryResponse>('/api/v1/early-warnings/summary', { silent: true })
      .then((res) => setSummary(res.data))
      .catch((err) => {
        console.error('[EarlyWarningCard]', err);
        // Don't toast on dashboard — fail silently, card just won't show
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!summary) return null; // Module not enabled or no permission — card hidden

  const total = summary.red + summary.amber + summary.yellow + summary.green;

  const segments: DonutSegment[] = [
    { tier: 'red', count: summary.red, color: DONUT_COLORS.red },
    { tier: 'amber', count: summary.amber, color: DONUT_COLORS.amber },
    { tier: 'yellow', count: summary.yellow, color: DONUT_COLORS.yellow },
    { tier: 'green', count: summary.green, color: DONUT_COLORS.green },
  ];

  return (
    <Link
      href={`/${locale}/early-warnings`}
      className="block rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface-secondary"
    >
      <h3 className="text-sm font-semibold text-text-primary">{t('title')}</h3>
      <p className="mt-1 text-xs text-text-secondary">{t('subtitle')}</p>

      <div className="mt-4 flex items-center gap-4">
        <TierDonut segments={segments} total={total} />

        <div className="flex flex-1 flex-wrap gap-x-4 gap-y-1">
          {segments.map((seg) => {
            const colors = TIER_COLORS[seg.tier];
            return (
              <div key={seg.tier} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors.bg}`} />
                <span className="text-xs text-text-secondary">
                  {t(`summary.${seg.tier}` as never)}
                </span>
                <span className="font-mono text-xs font-medium text-text-primary">
                  {seg.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Link>
  );
}
```

**Notes:**
- SVG donut chart built with circle `stroke-dasharray`. No chart library.
- Card is a Link — entire card navigates to `/early-warnings`.
- If the summary API returns error (module not enabled / no permission), card returns `null` and is invisible.
- Legend uses `gap-x-4` / `gap-y-1` with flex-wrap for narrow screens.

**Integration:** Add `<EarlyWarningCard />` to the admin dashboard page (`apps/web/src/app/[locale]/(school)/dashboard/page.tsx`) inside the stats section. Gate behind a check:

```tsx
// Inside DashboardPage, after stat cards section:
<EarlyWarningCard />
```

Since the card self-hides when the API returns nothing, no permission check is needed in the parent — the API handles it.

---

### F.11 — Cohort Filters

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/cohort/_components/cohort-filters.tsx`

```tsx
'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

export type CohortGroupBy = 'year_group' | 'class' | 'subject';

interface CohortFiltersProps {
  groupBy: CohortGroupBy;
  onGroupByChange: (value: CohortGroupBy) => void;
}

export function CohortFilters({ groupBy, onGroupByChange }: CohortFiltersProps) {
  const t = useTranslations('early_warning.cohort');

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm font-medium text-text-secondary">
        {t('group_by')}
      </span>
      <Select
        value={groupBy}
        onValueChange={(v) => onGroupByChange(v as CohortGroupBy)}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="year_group">{t('year_group')}</SelectItem>
          <SelectItem value="class">{t('class')}</SelectItem>
          <SelectItem value="subject">{t('subject')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

---

### F.12 — Cohort Heatmap

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/cohort/_components/cohort-heatmap.tsx`

```tsx
'use client';

import { toast } from '@school/ui';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { getHeatmapColor, type CohortResponse, type CohortRow } from '@/lib/early-warning';

import { CohortFilters, type CohortGroupBy } from './cohort-filters';

const DOMAIN_KEYS = ['avg_attendance', 'avg_grades', 'avg_behaviour', 'avg_wellbeing', 'avg_engagement'] as const;

export function CohortHeatmap() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const router = useRouter();

  const [groupBy, setGroupBy] = React.useState<CohortGroupBy>('year_group');
  const [rows, setRows] = React.useState<CohortRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    apiClient<CohortResponse>(
      `/api/v1/early-warnings/cohort?group_by=${groupBy}`,
    )
      .then((res) => {
        if (!cancelled) setRows(res.data ?? []);
      })
      .catch((err) => {
        console.error('[CohortHeatmap]', err);
        toast.error(t('errors.load_failed'));
        if (!cancelled) setRows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupBy, t]);

  const handleCellClick = (groupId: string, domain?: string) => {
    const params = new URLSearchParams();
    if (groupBy === 'year_group') params.set('year_group_id', groupId);
    if (groupBy === 'class') params.set('class_id', groupId);
    if (domain) params.set('domain', domain);
    router.push(`/${locale}/early-warnings?${params.toString()}`);
  };

  const domainLabels: Record<string, string> = {
    avg_attendance: t('domains.attendance' as never),
    avg_grades: t('domains.grades' as never),
    avg_behaviour: t('domains.behaviour' as never),
    avg_wellbeing: t('domains.wellbeing' as never),
    avg_engagement: t('domains.engagement' as never),
  };

  return (
    <div className="space-y-4">
      <CohortFilters groupBy={groupBy} onGroupByChange={setGroupBy} />

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-text-tertiary">{t('list.no_data')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t(`cohort.${groupBy}` as never)}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('cohort.students')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('cohort.avg_score')}
                </th>
                {DOMAIN_KEYS.map((key) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary"
                  >
                    {domainLabels[key]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.group_id}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">
                    {row.group_name}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-text-secondary">
                    {row.student_count}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleCellClick(row.group_id)}
                      className={`rounded-lg px-3 py-1 font-mono text-sm font-medium transition-opacity hover:opacity-80 ${getHeatmapColor(row.avg_composite)}`}
                    >
                      {row.avg_composite.toFixed(0)}
                    </button>
                  </td>
                  {DOMAIN_KEYS.map((key) => {
                    const value = row[key];
                    const domain = key.replace('avg_', '');
                    return (
                      <td key={key} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleCellClick(row.group_id, domain)}
                          className={`rounded-lg px-3 py-1 font-mono text-sm font-medium transition-opacity hover:opacity-80 ${getHeatmapColor(value)}`}
                        >
                          {value.toFixed(0)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

**Notes:**
- Table wrapped in `overflow-x-auto` for mobile horizontal scroll.
- Heatmap cells are clickable buttons — navigate to the list page pre-filtered.
- Uses `text-start` not `text-left` in all table headers.
- `getHeatmapColor()` maps score ranges to Tailwind colour classes.

---

### F.13 — Cohort Page

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/cohort/page.tsx`

```tsx
'use client';

import { Button } from '@school/ui';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';

import { CohortHeatmap } from './_components/cohort-heatmap';

export default function CohortPage() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('cohort.title')}
        description={t('cohort.description')}
        actions={
          <Link href={`/${locale}/early-warnings`}>
            <Button variant="ghost">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('cohort.back_to_list')}
            </Button>
          </Link>
        }
      />

      <CohortHeatmap />
    </div>
  );
}
```

---

### F.14 — Weight Sliders

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/settings/_components/weight-sliders.tsx`

Five sliders that must sum to 100. When one slider changes, the others redistribute proportionally.

```tsx
'use client';

import { Input, Label } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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
            <Label className="text-sm text-text-secondary">
              {t(`domains.${domain}` as never)}
            </Label>
            <span className="font-mono text-sm text-text-primary">
              {weights[domain]}%
            </span>
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

      <div className={`flex items-center justify-between rounded-xl px-4 py-2 text-sm font-medium ${
        isValid
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-danger-fill text-danger-text'
      }`}>
        <span>{t('settings.total')}</span>
        <span className="font-mono">{total}%</span>
      </div>
      {!isValid && (
        <p className="text-xs text-danger-text">
          {t('settings.weights_must_sum')}
        </p>
      )}
    </div>
  );
}
```

**Notes:**
- Uses native `<input type="range">` styled with Tailwind (no Slider component needed from `@school/ui` — it does not exist).
- Number input beside each slider for precise entry.
- Sum indicator shows green if valid, red if invalid.
- Step size of 5 prevents fractional confusion.

---

### F.15 — Threshold Config

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/settings/_components/threshold-config.tsx`

```tsx
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
```

---

### F.16 — Routing Rules Config

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/settings/_components/routing-rules-config.tsx`

```tsx
'use client';

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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
        <Label className={`text-sm ${TIER_COLORS.yellow.text}`}>
          {t('routing_yellow')}
        </Label>
        <Select
          value={routingRules.yellow.role}
          onValueChange={(v) =>
            onChange({ ...routingRules, yellow: { role: v } })
          }
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
        <Label className={`text-sm ${TIER_COLORS.amber.text}`}>
          {t('routing_amber')}
        </Label>
        <Select
          value={routingRules.amber.role}
          onValueChange={(v) =>
            onChange({ ...routingRules, amber: { role: v } })
          }
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
        <Label className={`text-sm ${TIER_COLORS.red.text}`}>
          {t('routing_red')}
        </Label>
        <p className="mt-1 text-xs text-text-tertiary">
          {t('routing_red_description')}
        </p>
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
```

---

### F.17 — Digest Config

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/settings/_components/digest-config.tsx`

```tsx
'use client';

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

interface DigestConfigProps {
  digestDay: number;
  digestRecipients: string[];
  onDayChange: (day: number) => void;
  onRecipientsChange: (recipients: string[]) => void;
}

const DAYS_OF_WEEK = [
  { value: 1, labelKey: 'monday' },
  { value: 2, labelKey: 'tuesday' },
  { value: 3, labelKey: 'wednesday' },
  { value: 4, labelKey: 'thursday' },
  { value: 5, labelKey: 'friday' },
  { value: 6, labelKey: 'saturday' },
  { value: 0, labelKey: 'sunday' },
];

const RECIPIENT_ROLE_OPTIONS = [
  { value: 'principal', labelKey: 'principal' },
  { value: 'deputy_principal', labelKey: 'deputy_principal' },
  { value: 'pastoral_lead', labelKey: 'pastoral_lead' },
  { value: 'year_head', labelKey: 'year_head' },
  { value: 'homeroom_teacher', labelKey: 'homeroom_teacher' },
];

export function DigestConfig({
  digestDay,
  digestRecipients,
  onDayChange,
  onRecipientsChange,
}: DigestConfigProps) {
  const t = useTranslations('early_warning.settings');

  const toggleRecipient = (value: string) => {
    const next = digestRecipients.includes(value)
      ? digestRecipients.filter((r) => r !== value)
      : [...digestRecipients, value];
    onRecipientsChange(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm text-text-secondary">{t('digest_day')}</Label>
        <Select
          value={String(digestDay)}
          onValueChange={(v) => onDayChange(Number(v))}
        >
          <SelectTrigger className="mt-1 w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS_OF_WEEK.map((day) => (
              <SelectItem key={day.value} value={String(day.value)}>
                {t(`days.${day.labelKey}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm text-text-secondary">{t('digest_recipients')}</Label>
        <p className="mt-1 text-xs text-text-tertiary">{t('digest_recipients_description')}</p>
        <div className="mt-2 space-y-2">
          {RECIPIENT_ROLE_OPTIONS.map((opt) => {
            const checked = digestRecipients.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRecipient(opt.value)}
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
```

---

### F.18 — Settings Page

**File:** `apps/web/src/app/[locale]/(school)/early-warnings/settings/page.tsx`

Uses `react-hook-form` + Zod as required by the codebase conventions.

```tsx
'use client';

import { Button, toast } from '@school/ui';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { updateEarlyWarningConfigSchema, type UpdateEarlyWarningConfigDto } from '@school/shared';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import type { EarlyWarningConfig, SignalDomain, RiskTier } from '@/lib/early-warning';

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

export default function EarlyWarningSettingsPage() {
  const t = useTranslations('early_warning');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const form = useForm<UpdateEarlyWarningConfigDto>({
    resolver: zodResolver(updateEarlyWarningConfigSchema),
    defaultValues: {
      weights: DEFAULT_WEIGHTS,
      thresholds: DEFAULT_THRESHOLDS,
      hysteresis_buffer: 10,
      routing_rules: {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      },
      digest_day: 1,
      digest_recipients: ['principal'],
    },
  });

  // ─── Load existing config ──────────────────────────────────────────────────
  React.useEffect(() => {
    apiClient<{ data: EarlyWarningConfig }>('/api/v1/early-warnings/config')
      .then((res) => {
        const cfg = res.data;
        form.reset({
          weights: cfg.weights,
          thresholds: cfg.thresholds,
          hysteresis_buffer: cfg.hysteresis_buffer,
          routing_rules: cfg.routing_rules,
          digest_day: cfg.digest_day,
          digest_recipients: cfg.digest_recipients,
        });
      })
      .catch((err) => {
        console.error('[EarlyWarningSettings.load]', err);
        toast.error(t('errors.load_failed'));
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
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/${locale}/early-warnings`}>
              <Button variant="ghost" type="button">
                <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
                {t('cohort.back_to_list')}
              </Button>
            </Link>
            <Button type="submit" disabled={saving}>
              <Save className="me-2 h-4 w-4" />
              {t('settings.save')}
            </Button>
          </div>
        }
      />

      {/* Domain Weights */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-lg font-semibold text-text-primary">{t('settings.weights')}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t('settings.weights_description')}</p>
        <div className="mt-4">
          <Controller
            control={form.control}
            name="weights"
            render={({ field }) => (
              <WeightSliders
                weights={field.value}
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
            name="thresholds"
            render={({ field }) => (
              <ThresholdConfig
                thresholds={field.value}
                hysteresisBuffer={form.watch('hysteresis_buffer')}
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
            name="routing_rules"
            render={({ field }) => (
              <RoutingRulesConfig
                routingRules={field.value}
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
                digestDay={field.value}
                digestRecipients={form.watch('digest_recipients')}
                onDayChange={field.onChange}
                onRecipientsChange={(v) => form.setValue('digest_recipients', v)}
              />
            )}
          />
        </div>
      </section>
    </form>
  );
}
```

**Notes:**
- Uses `react-hook-form` with `zodResolver` and the shared Zod schema (codebase convention).
- Each config section is a `Controller` wrapping the custom sub-component.
- Form loads existing config on mount, resets form values.
- Save fires PUT to `/api/v1/early-warnings/config`.
- ArrowLeft icon uses `rtl:rotate-180` for bidirectional support.

---

### F.19 — Translation Keys

#### English (`apps/web/messages/en.json`)

Add the following `early_warning` namespace to the existing JSON file at the top level:

```json
{
  "early_warning": {
    "title": "Early Warning",
    "subtitle": "Students at risk across all domains",
    "summary": {
      "green": "On Track",
      "yellow": "Watch",
      "amber": "Monitoring",
      "red": "Intervention Needed"
    },
    "domains": {
      "attendance": "Attendance",
      "grades": "Grades",
      "behaviour": "Behaviour",
      "wellbeing": "Wellbeing",
      "engagement": "Engagement"
    },
    "list": {
      "student": "Student",
      "score": "Risk Score",
      "tier": "Status",
      "top_signal": "Primary Concern",
      "trend": "Trend",
      "assigned_to": "Assigned To",
      "no_data": "No students flagged",
      "no_signals": "No active signals",
      "loading": "Loading risk profiles...",
      "unassigned": "Unassigned",
      "filter_tier": "Filter by status",
      "all_tiers": "All statuses",
      "all_year_groups": "All year groups",
      "all_classes": "All classes",
      "previous": "Previous",
      "next": "Next"
    },
    "detail": {
      "title": "Risk Detail",
      "domains": "Domain Breakdown",
      "summary": "Summary",
      "signals": "Signal Breakdown",
      "trend": "30-Day Trend",
      "transitions": "Tier History",
      "acknowledge": "Mark Reviewed",
      "acknowledged": "Marked as reviewed",
      "assign": "Assign Staff",
      "create_intervention": "Create Intervention",
      "no_signals": "No signals detected",
      "no_transitions": "No tier changes recorded",
      "points": "pts",
      "score_at_transition": "Score: {score}"
    },
    "cohort": {
      "title": "Cohort Analysis",
      "description": "Average risk scores across student groups",
      "group_by": "Group By",
      "year_group": "Year Group",
      "class": "Class",
      "subject": "Subject",
      "avg_score": "Avg Score",
      "students": "Students",
      "back_to_list": "Back to list"
    },
    "settings": {
      "title": "Early Warning Settings",
      "weights": "Domain Weights",
      "weights_description": "How much each domain contributes to the overall risk score. Must sum to 100.",
      "total": "Total",
      "weights_must_sum": "Weights must sum to 100%",
      "thresholds": "Tier Thresholds",
      "thresholds_description": "Minimum composite score to enter each tier.",
      "threshold_minimum": "Minimum score: {score}",
      "hysteresis": "Stability Buffer",
      "hysteresis_description": "Points below tier threshold required to downgrade (prevents alert fatigue).",
      "routing": "Alert Routing",
      "routing_description": "Who receives alerts when a student enters each tier.",
      "routing_yellow": "Watch tier alert",
      "routing_amber": "Monitoring tier alert",
      "routing_red": "Intervention tier alerts",
      "routing_red_description": "Select all roles that should be notified for red tier.",
      "digest": "Weekly Digest",
      "digest_description": "Summary email sent weekly with top at-risk students.",
      "digest_day": "Day of week",
      "digest_recipients": "Recipients",
      "digest_recipients_description": "Select roles that receive the weekly digest email.",
      "save": "Save Changes",
      "saved": "Settings saved",
      "roles": {
        "homeroom_teacher": "Homeroom Teacher",
        "year_head": "Year Head",
        "principal": "Principal",
        "pastoral_lead": "Pastoral Lead",
        "deputy_principal": "Deputy Principal"
      },
      "days": {
        "monday": "Monday",
        "tuesday": "Tuesday",
        "wednesday": "Wednesday",
        "thursday": "Thursday",
        "friday": "Friday",
        "saturday": "Saturday",
        "sunday": "Sunday"
      }
    },
    "errors": {
      "load_failed": "Failed to load risk data",
      "save_failed": "Failed to save settings",
      "action_failed": "Action failed"
    }
  }
}
```

#### Arabic (`apps/web/messages/ar.json`)

Add the following `early_warning` namespace to the existing Arabic JSON file:

```json
{
  "early_warning": {
    "title": "الإنذار المبكر",
    "subtitle": "الطلاب المعرضون للخطر عبر جميع المجالات",
    "summary": {
      "green": "على المسار الصحيح",
      "yellow": "مراقبة",
      "amber": "متابعة",
      "red": "يحتاج تدخل"
    },
    "domains": {
      "attendance": "الحضور",
      "grades": "الدرجات",
      "behaviour": "السلوك",
      "wellbeing": "الرفاهية",
      "engagement": "المشاركة"
    },
    "list": {
      "student": "الطالب",
      "score": "درجة الخطر",
      "tier": "الحالة",
      "top_signal": "المشكلة الرئيسية",
      "trend": "الاتجاه",
      "assigned_to": "مسؤول المتابعة",
      "no_data": "لا يوجد طلاب مُبلَّغ عنهم",
      "no_signals": "لا توجد إشارات نشطة",
      "loading": "جاري تحميل ملفات المخاطر...",
      "unassigned": "غير محدد",
      "filter_tier": "تصفية حسب الحالة",
      "all_tiers": "جميع الحالات",
      "all_year_groups": "جميع المراحل الدراسية",
      "all_classes": "جميع الفصول",
      "previous": "السابق",
      "next": "التالي"
    },
    "detail": {
      "title": "تفاصيل المخاطر",
      "domains": "تحليل المجالات",
      "summary": "الملخص",
      "signals": "تفصيل الإشارات",
      "trend": "اتجاه ٣٠ يومًا",
      "transitions": "سجل تغييرات المستوى",
      "acknowledge": "تم المراجعة",
      "acknowledged": "تم وضع علامة كمراجَع",
      "assign": "تعيين موظف",
      "create_intervention": "إنشاء تدخل",
      "no_signals": "لم يتم اكتشاف إشارات",
      "no_transitions": "لا توجد تغييرات مسجلة في المستوى",
      "points": "نقاط",
      "score_at_transition": "الدرجة: {score}"
    },
    "cohort": {
      "title": "تحليل المجموعات",
      "description": "متوسط درجات المخاطر عبر مجموعات الطلاب",
      "group_by": "تجميع حسب",
      "year_group": "المرحلة الدراسية",
      "class": "الفصل",
      "subject": "المادة",
      "avg_score": "متوسط الدرجة",
      "students": "الطلاب",
      "back_to_list": "العودة إلى القائمة"
    },
    "settings": {
      "title": "إعدادات الإنذار المبكر",
      "weights": "أوزان المجالات",
      "weights_description": "مدى مساهمة كل مجال في درجة المخاطر الإجمالية. يجب أن يكون المجموع ١٠٠.",
      "total": "المجموع",
      "weights_must_sum": "يجب أن يكون مجموع الأوزان ١٠٠٪",
      "thresholds": "حدود المستويات",
      "thresholds_description": "الحد الأدنى للدرجة المركبة للدخول في كل مستوى.",
      "threshold_minimum": "الحد الأدنى للدرجة: {score}",
      "hysteresis": "هامش الاستقرار",
      "hysteresis_description": "النقاط المطلوبة تحت حد المستوى لخفض التصنيف (يمنع إرهاق التنبيهات).",
      "routing": "توجيه التنبيهات",
      "routing_description": "من يتلقى التنبيهات عند دخول طالب في كل مستوى.",
      "routing_yellow": "تنبيه مستوى المراقبة",
      "routing_amber": "تنبيه مستوى المتابعة",
      "routing_red": "تنبيهات مستوى التدخل",
      "routing_red_description": "حدد جميع الأدوار التي يجب إخطارها للمستوى الأحمر.",
      "digest": "الملخص الأسبوعي",
      "digest_description": "بريد إلكتروني ملخص يُرسل أسبوعيًا بأكثر الطلاب عرضة للخطر.",
      "digest_day": "يوم الأسبوع",
      "digest_recipients": "المستلمون",
      "digest_recipients_description": "حدد الأدوار التي تتلقى البريد الإلكتروني الملخص الأسبوعي.",
      "save": "حفظ التغييرات",
      "saved": "تم حفظ الإعدادات",
      "roles": {
        "homeroom_teacher": "معلم الفصل",
        "year_head": "رئيس المرحلة",
        "principal": "المدير",
        "pastoral_lead": "مسؤول الرعاية",
        "deputy_principal": "نائب المدير"
      },
      "days": {
        "monday": "الإثنين",
        "tuesday": "الثلاثاء",
        "wednesday": "الأربعاء",
        "thursday": "الخميس",
        "friday": "الجمعة",
        "saturday": "السبت",
        "sunday": "الأحد"
      }
    },
    "errors": {
      "load_failed": "فشل في تحميل بيانات المخاطر",
      "save_failed": "فشل في حفظ الإعدادات",
      "action_failed": "فشل الإجراء"
    }
  }
}
```

---

## Integration Points

### Dashboard Integration

In `apps/web/src/app/[locale]/(school)/dashboard/page.tsx`, import and render the card:

```tsx
import { EarlyWarningCard } from './_components/early-warning-card';

// Inside the JSX, after the stat cards section:
<EarlyWarningCard />
```

The card self-hides when the API call fails (module disabled or user lacks permission), so no conditional gate is needed in the parent.

### Navigation

Add the early warning route to the sidebar navigation. In the sidebar configuration file (wherever `nav` items are defined), add:

```typescript
{
  key: 'earlyWarning',
  href: '/early-warnings',
  icon: AlertTriangle,  // from lucide-react
  label: 'nav.earlyWarning',   // translation key
  permission: 'early_warning.view',
}
```

And add to `en.json` nav section:
```json
"earlyWarning": "Early Warning"
```

And to `ar.json` nav section:
```json
"earlyWarning": "الإنذار المبكر"
```

---

## RTL Compliance Checklist

Every component in this plan uses logical CSS properties. Verification points:

| Pattern | Used | Never Used |
|---------|------|------------|
| `ms-`, `me-` | Yes | `ml-`, `mr-` |
| `ps-`, `pe-` | Yes | `pl-`, `pr-` |
| `text-start`, `text-end` | Yes | `text-left`, `text-right` |
| `start-`, `end-` | Yes | `left-`, `right-` |
| `rounded-s-`, `rounded-e-` | N/A | `rounded-l-`, `rounded-r-` |
| `border-s-`, `border-e-` | N/A | `border-l-`, `border-r-` |
| `rtl:rotate-180` on arrows | Yes | Hardcoded arrow direction |

---

## Mobile Responsiveness Checklist

| Requirement | How It Is Met |
|-------------|---------------|
| 375px usable | Card layout on mobile; table hidden below `md:` |
| Touch targets 44x44 | Card buttons full width; filter dropdowns full width on mobile |
| Content padding | `p-4` on all container divs |
| Tables wrapped | `overflow-x-auto` on cohort heatmap table |
| Input font-size >= 16px | Tailwind default `text-base` on inputs |
| Single-column on mobile | Filter grid: `grid-cols-1` → `sm:grid-cols-3` |
| Fixed-width inputs | `w-full sm:w-28` pattern for number inputs |

---

## Testing Guidance

Tests are NOT in scope for this plan (frontend tests are integration/E2E), but the following should be verified manually:

1. List page loads, shows skeleton, then populates with data
2. Tier filter works — selecting "Intervention Needed" shows only red-tier students
3. Clicking a row opens the student detail Sheet
4. Detail panel shows domain bars, sparkline, signals, transitions
5. Acknowledge button fires POST and refreshes the list
6. Cohort heatmap renders with correct colours for each score range
7. Clicking a heatmap cell navigates to the list with correct filter applied
8. Settings page loads existing config into form fields
9. Weight sliders show validation error when sum is not 100
10. Save button fires PUT with form data and shows success toast
11. All pages render correctly in Arabic (RTL) with logical properties
12. All pages are usable at 375px width
13. Dashboard card shows donut with correct tier counts
14. Dashboard card is hidden when module is disabled or user lacks permission

---

## Dependency on Phase E

This phase cannot begin until the API layer (Phase E) is deployed and the following endpoints return valid responses:

- `GET /api/v1/early-warnings` — paginated list
- `GET /api/v1/early-warnings/:studentId` — full detail
- `GET /api/v1/early-warnings/summary` — tier counts
- `GET /api/v1/early-warnings/cohort` — cohort pivot data
- `GET /api/v1/early-warnings/config` — tenant config
- `PUT /api/v1/early-warnings/config` — update config
- `POST /api/v1/early-warnings/:studentId/acknowledge` — mark reviewed
- `POST /api/v1/early-warnings/:studentId/assign` — assign staff

If building frontend before API is ready, mock the responses in `apiClient` calls or use MSW (Mock Service Worker) in development.
