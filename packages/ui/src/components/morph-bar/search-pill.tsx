import { Search } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

interface SearchPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
}

export const SearchPill = React.forwardRef<HTMLButtonElement, SearchPillProps>(
  ({ className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'flex items-center gap-2 rounded-pill bg-white/10 px-3 py-1.5 text-sm text-[var(--color-bar-text)] transition-colors hover:bg-white/20 w-[200px]',
          className
        )}
        {...props}
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-start">Search...</span>
        <kbd className="hidden md:inline-flex items-center gap-0.5 rounded bg-black/20 px-1.5 py-0.5 text-[10px] font-mono border border-white/10">
          ⌘K
        </kbd>
      </button>
    );
  }
);
SearchPill.displayName = 'SearchPill';
