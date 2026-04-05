'use client';

import * as React from 'react';

import { cn } from '../lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  trend?: { direction: 'up' | 'down' | 'neutral'; label: string };
  className?: string;
}

export function StatCard({ label, value, trend, className }: StatCardProps) {
  const [displayValue, setDisplayValue] = React.useState<number | string>(value);
  const prevValueRef = React.useRef(value);

  React.useEffect(() => {
    if (typeof value !== 'number') {
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    const duration = 400;
    const startTime = performance.now();
    const startValue = typeof prevValueRef.current === 'number' ? prevValueRef.current : 0;
    let rafId: number;

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out curve
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + (value as number - startValue) * eased);
      setDisplayValue(current);
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    }

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      prevValueRef.current = value;
    };
  }, [value]);

  return (
    <div className={cn('rounded-[16px] border border-border bg-surface p-4 shadow-sm', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{label}</p>
      <p className="mt-1 text-[28px] font-bold leading-tight text-text-primary">{displayValue}</p>
      {trend && (
        <p
          className={cn(
            'mt-1 text-xs font-medium',
            trend.direction === 'up' && 'text-success-text',
            trend.direction === 'down' && 'text-danger-text',
            trend.direction === 'neutral' && 'text-text-tertiary',
          )}
        >
          {trend.direction === 'up' ? '+' : trend.direction === 'down' ? '-' : ''} {trend.label}
        </p>
      )}
    </div>
  );
}
