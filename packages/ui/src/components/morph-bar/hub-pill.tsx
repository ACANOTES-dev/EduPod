import * as React from 'react';

import { cn } from '../../lib/utils';

interface HubPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const HubPill = React.forwardRef<HTMLButtonElement, HubPillProps>(
  ({ className, active, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'rounded-pill px-3.5 py-2 text-[13px] font-medium transition-colors',
          active
            ? 'bg-[var(--color-bar-active-bg)] text-[var(--color-bar-text-active)] font-semibold'
            : 'text-[var(--color-bar-text)] bg-transparent hover:bg-white/5',
          className
        )}
        {...props}
      />
    );
  }
);
HubPill.displayName = 'HubPill';
