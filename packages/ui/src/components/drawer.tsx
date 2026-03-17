import * as React from 'react';

import { cn } from '../lib/utils';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './sheet';

interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  width?: string;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  width = 'sm:max-w-[400px]',
}: DrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="end" className={cn(width, className)}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-4 flex-1 overflow-y-auto">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
