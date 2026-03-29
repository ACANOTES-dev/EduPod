'use client';

import * as React from 'react';

interface TrendSparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
}

export function TrendSparkline({
  data,
  width = 80,
  height = 24,
  className,
}: TrendSparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 100);
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * width},${height - (v / max) * height}`)
    .join(' ');

  // Determine stroke colour: if last value > first value, trending worse (red); else green
  const last = data[data.length - 1] ?? 0;
  const first = data[0] ?? 0;
  const trending = last > first;
  const stroke = trending ? '#ef4444' : '#10b981';

  return (
    <svg
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
