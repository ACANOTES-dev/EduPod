'use client';

import { ArrowDown, ArrowRight, ArrowUp, Info } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

import type { KpiCard as KpiCardData } from '@school/shared/reports';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@school/ui';

import {
  deltaTone,
  deltaToneClass,
  formatDeltaText,
  isSafeDrillDownHref,
  resolveKpiIdentity,
  severityBorderClass,
  toSparklineSeries,
  type DeltaTone,
} from './kpi-card.helpers';

interface KpiCardProps {
  kpi: KpiCardData;
}

/**
 * Display one KPI on the reports hub dashboard. Driven entirely by the
 * `KpiCard` payload returned from `GET /v1/reports/analytics/dashboard`.
 *
 * - The whole card is a click target; an absolutely positioned `<Link>`
 *   covers the surface but sits below the info icon (which calls
 *   `stopPropagation` so its tooltip does not navigate).
 * - The info-icon trigger is keyboard-focusable; pressing Enter / Space
 *   toggles the Radix tooltip.
 * - Tooltip content reads from `kpi.tooltip_key` directly. The translation
 *   file carries the plain-English description (impl 22 lands Arabic).
 * - Severity drives the start-side border colour.
 */
export function KpiCard({ kpi }: KpiCardProps) {
  // Backend keys carry full paths (`reports.kpis.<key>.label`) so we use
  // the un-namespaced translator and pass the key verbatim.
  const t = useTranslations();
  const identity = resolveKpiIdentity(kpi.key);
  const sparklineSeries = toSparklineSeries(kpi.sparkline);
  const tone = deltaTone(kpi.delta);
  const deltaText = formatDeltaText(kpi.delta);
  const safeHref = isSafeDrillDownHref(kpi.drill_down_href) ? kpi.drill_down_href : '#';
  const Icon = identity.Icon;

  const label = safeTranslate(t, kpi.label_key, kpi.key);
  const tooltipText = safeTranslate(t, kpi.tooltip_key, '');

  return (
    <TooltipProvider delayDuration={150}>
      <article
        className={`group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary ${severityBorderClass(
          kpi.severity,
        )}`}
        aria-label={label}
      >
        <Link
          href={safeHref}
          aria-label={label}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <span className="sr-only">{label}</span>
        </Link>

        <header className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${identity.iconBg} ${identity.iconColor}`}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" />
          </div>
          {tooltipText ? (
            // The header is pointer-events-none so the absolute Link below
            // captures whole-card clicks; the info button re-enables pointer
            // events on itself so its tooltip + click still work.
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`${label} — info`}
                  className="pointer-events-auto relative z-20 -me-1 -mt-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Info className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="end" className="max-w-xs whitespace-normal">
                <p className="text-xs leading-relaxed">{tooltipText}</p>
              </TooltipContent>
            </Tooltip>
          ) : null}
        </header>

        <div className="pointer-events-none relative z-10 flex flex-col gap-1">
          <p className="text-2xl font-bold text-text-primary tabular-nums">
            {formatKpiValue(kpi.value)}
          </p>
          <p className="text-xs text-text-tertiary">{label}</p>
        </div>

        <footer className="pointer-events-none relative z-10 mt-auto flex items-end justify-between gap-2">
          {/*
            Hide the delta whenever the KPI itself has no value (e.g. attendance
            today before the first registers go in). The "no value" signal is
            `formatKpiValue(...) === '—'` which happens when `kpi.value` is a
            non-finite number (NaN/Infinity) — schemas type `value` as
            `string | number`, so explicit `null` never reaches us. A delta
            computed against a missing baseline is meaningless ("−99.9%") and
            confuses readers more than it informs them.
          */}
          <DeltaRow
            tone={tone}
            text={deltaText}
            hasDelta={kpi.delta !== null && hasFiniteValue(kpi.value)}
          />
          {sparklineSeries ? (
            <div
              className="pointer-events-none h-7 w-16 shrink-0"
              aria-hidden="true"
              data-testid="kpi-sparkline"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={[...sparklineSeries]}
                  margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                >
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={identity.accentHex}
                    fill={identity.accentHex}
                    fillOpacity={0.18}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </footer>
      </article>
    </TooltipProvider>
  );
}

interface DeltaRowProps {
  tone: DeltaTone;
  text: string;
  hasDelta: boolean;
}

function DeltaRow({ tone, text, hasDelta }: DeltaRowProps) {
  if (!hasDelta) {
    return <span className="text-xs text-text-tertiary">—</span>;
  }
  const colourClass = deltaToneClass(tone);
  const ArrowIcon = tone === 'good' ? ArrowUp : tone === 'bad' ? ArrowDown : ArrowRight;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${colourClass}`}>
      <ArrowIcon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="tabular-nums">{text}</span>
    </span>
  );
}

/**
 * The KPI value can arrive as a string (already formatted, e.g. "92.4%")
 * or a number (raw count). Numbers render through `Intl.NumberFormat` so
 * the dashboard stays locale-aware without each calculator having to
 * know about presentation. Strings pass through verbatim.
 */
function formatKpiValue(value: string | number): string {
  if (typeof value === 'string') return value;
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat().format(value);
}

/**
 * Mirrors `formatKpiValue`'s "renderable as a real number?" check: strings
 * pass through verbatim, numbers must be finite. Used to decide whether to
 * render a delta row on the card — a delta against an unknown / missing
 * current value is meaningless. Backend calculators emit the literal "—"
 * string as their "no data" sentinel (see `kpi-attendance-today.ts`); we
 * recognise it here so the delta hides regardless of where the value came from.
 */
const NO_DATA_SENTINEL = '—';
function hasFiniteValue(value: string | number): boolean {
  if (typeof value === 'string') return value.length > 0 && value !== NO_DATA_SENTINEL;
  return Number.isFinite(value);
}

/**
 * `useTranslations()` from next-intl returns the key as-is when a
 * translation is missing. We treat that case as "no translation" and
 * substitute the supplied fallback so the UI stays readable.
 */
function safeTranslate(
  t: ReturnType<typeof useTranslations>,
  key: string,
  fallback: string,
): string {
  if (!key) return fallback;
  try {
    const value = t(key);
    if (value === key) return fallback;
    return value;
  } catch {
    return fallback;
  }
}
