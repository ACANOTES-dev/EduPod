'use client';

import { Info } from 'lucide-react';
import * as React from 'react';

interface InfoTooltipProps {
  /** Plain-text tooltip body. Keep to 1–3 sentences. */
  text: string;
  /** Override the trigger icon size. Defaults to `h-3.5 w-3.5`. */
  iconClassName?: string;
  /** Optional accessible label for the trigger. Defaults to "More info". */
  ariaLabel?: string;
}

/**
 * Lightweight hover/focus tooltip used for sub-KPI explanations on report
 * pages. Pure CSS hover plus keyboard focus — no external popover library.
 * Renders a small info icon button next to the metric label; the tooltip
 * body appears below on hover or focus.
 *
 * Tooltip text is always plain text — pass translated strings in. Keep to
 * 1–3 sentences explaining what the metric means and how it's computed.
 */
export function InfoTooltip({
  text,
  iconClassName = 'h-3.5 w-3.5',
  ariaLabel = 'More info',
}: InfoTooltipProps) {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label={ariaLabel}
        className="inline-flex items-center justify-center rounded-full text-text-tertiary transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
      >
        <Info className={iconClassName} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="invisible absolute start-0 top-full z-20 mt-1 w-60 rounded-lg border border-border bg-surface p-2.5 text-xs text-text-secondary shadow-lg group-hover:visible group-focus-within:visible"
      >
        {text}
      </span>
    </span>
  );
}
