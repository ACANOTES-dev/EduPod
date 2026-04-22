'use client';

import { Info } from 'lucide-react';
import * as React from 'react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@school/ui';

interface InfoTooltipProps {
  content: React.ReactNode;
  ariaLabel?: string;
  iconClassName?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

export function InfoTooltip({
  content,
  ariaLabel = 'More info',
  iconClassName = 'h-3.5 w-3.5',
  side = 'top',
  delayDuration = 150,
}: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={ariaLabel}
          className="inline-flex items-center justify-center text-text-tertiary transition-colors hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Info className={iconClassName} />
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs text-xs leading-snug">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
