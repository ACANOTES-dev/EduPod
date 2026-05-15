'use client';

import * as React from 'react';

import { cn } from '@school/ui';

interface LatencySparklineProps {
  data: number[];
  height?: number;
  className?: string;
}

export function LatencySparkline({ data, height = 40, className }: LatencySparklineProps) {
  const points = React.useMemo(() => {
    if (data.length < 2) {
      return '';
    }

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const width = 200;

    return data
      .map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - min) / range) * (height - 4) - 2;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [data, height]);

  if (!points) {
    return <div className="h-10 rounded-md bg-surface-secondary" aria-hidden="true" />;
  }

  return (
    <svg
      aria-hidden="true"
      className={cn('h-10 w-full text-primary-700', className)}
      preserveAspectRatio="none"
      viewBox={`0 0 200 ${height}`}
    >
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
