'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from './command';
import { Dialog, DialogContent, DialogTitle } from './dialog';

export interface CommandPaletteGroup {
  heading: string;
  items: CommandPaletteItem[];
}

export interface CommandPaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups?: CommandPaletteGroup[];
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
  onQueryChange?: (query: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  groups = [],
  placeholder = 'Search students, invoices, staff...',
  emptyMessage = 'No results found.',
  className,
  onQueryChange,
}: CommandPaletteProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('overflow-hidden p-0 max-w-[520px] bg-[#1C1917] border border-[var(--color-strip-border)] sm:rounded-[20px] shadow-2xl', className)}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={!onQueryChange}>
          <CommandInput placeholder={placeholder} onValueChange={onQueryChange} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    onSelect={() => {
                      item.onSelect();
                      onOpenChange(false);
                    }}
                  >
                    {item.icon && <span className="me-3 flex-shrink-0 text-[var(--color-strip-text)] opacity-70">{item.icon}</span>}
                    <div className="flex flex-col gap-0.5">
                      <p className="font-medium text-[14px] leading-none">{item.label}</p>
                      {item.description && (
                        <p className="text-[12px] opacity-60 leading-none">{item.description}</p>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
