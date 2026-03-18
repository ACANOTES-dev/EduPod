'use client';

import * as React from 'react';

import { cn } from '../../lib/utils';
import { Sheet, SheetContent } from '../sheet';

interface MobileSidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

export function MobileSidebar({ open, onOpenChange, children, className }: MobileSidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="start" className={cn('w-[260px] p-0 flex flex-col overflow-hidden', className)}>
        {children}
      </SheetContent>
    </Sheet>
  );
}
