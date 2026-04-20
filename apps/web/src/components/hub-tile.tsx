'use client';

import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@school/ui';

// ─── Hub Tile ─────────────────────────────────────────────────────────────────

interface HubTileProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  accent: string;
  iconBg: string;
  glow: string;
  count?: number;
  tooltip?: string;
  onClick?: () => void;
  /** Animation index for staggered fade-in. Zero-based. */
  animationIndex?: number;
}

export function HubTile({
  icon: Icon,
  title,
  description,
  href,
  accent,
  iconBg,
  glow,
  count,
  tooltip,
  onClick,
  animationIndex,
}: HubTileProps) {
  const locale = useLocale();
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    router.push(`/${locale}${href}`);
  };

  const delayStyle =
    typeof animationIndex === 'number'
      ? ({ animationDelay: `${animationIndex * 60}ms` } as React.CSSProperties)
      : undefined;

  const button = (
    <button
      type="button"
      onClick={handleClick}
      style={delayStyle}
      className="group relative flex min-w-0 flex-col gap-5 overflow-hidden rounded-3xl border border-border bg-surface p-6 text-start shadow-sm transition-all duration-300 animate-in fade-in slide-in-from-bottom-1 fill-mode-both hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:p-7"
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accent}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${glow} to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-2xl shadow-sm ring-1 ring-inset ring-black/5 ${iconBg}`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex items-center gap-3">
          {typeof count === 'number' && count > 0 && (
            <span className="inline-flex items-center rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-semibold text-text-primary">
              {count}
            </span>
          )}
          <ArrowRight className="h-5 w-5 text-text-tertiary transition-colors duration-300 group-hover:text-primary-600 rtl:rotate-180" />
        </div>
      </div>

      <div className="relative min-w-0 space-y-1.5">
        <h3 className="text-lg font-semibold tracking-tight text-text-primary">{title}</h3>
        <p className="text-sm leading-relaxed text-text-tertiary">{description}</p>
      </div>
    </button>
  );

  if (!tooltip) return button;

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0">{button}</div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8} className="max-w-[280px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
