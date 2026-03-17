'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

import { Skeleton } from './skeleton';

interface SkeletonCascadeProps {
  count: number;
  className?: string;
  itemClassName?: string;
  delay?: number;
}

export function SkeletonCascade({ count, className, itemClassName, delay = 50 }: SkeletonCascadeProps) {
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);

  React.useEffect(() => {
    setPrefersReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className={cn('h-12 w-full', itemClassName)}
          style={prefersReducedMotion ? undefined : { animationDelay: `${i * delay}ms` }}
        />
      ))}
    </div>
  );
}
