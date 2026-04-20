'use client';

import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import * as React from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@school/ui';

// ─── Quick Action ─────────────────────────────────────────────────────────────

interface QuickActionProps {
  icon: LucideIcon;
  label: string;
  href: string;
  accent: string;
  gradient: string;
  tooltip?: string;
}

export function QuickAction({
  icon: Icon,
  label,
  href,
  accent,
  gradient,
  tooltip,
}: QuickActionProps) {
  const locale = useLocale();

  const link = (
    <Link
      href={`/${locale}${href}`}
      className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-strong hover:shadow-sm"
    >
      <div className={`shrink-0 rounded-lg p-2 ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <ArrowRight className="ms-auto h-4 w-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180" />
      <div
        className={`absolute bottom-0 end-0 start-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r ${gradient} transition-transform group-hover:scale-x-100`}
      />
    </Link>
  );

  if (!tooltip) return link;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="min-w-0">{link}</div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6} className="max-w-[240px] text-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
