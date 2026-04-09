'use client';

/**
 * Minimal inline SVG sparkline for the comment editor.
 * Shows 2–10 score points as a polyline; falls back to a dashed baseline when
 * there is no data. Intentionally kept dependency-free so the 3-column editor
 * stays light.
 */
export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}

const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 24;

export function Sparkline({
  values,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  className,
}: SparklineProps) {
  if (!values || values.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      >
        <line
          x1={2}
          x2={width - 2}
          y1={height / 2}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.25}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  if (values.length === 1) {
    // Render a single dot centred at the only value.
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      >
        <circle cx={width / 2} cy={height / 2} r={2.5} fill="currentColor" />
      </svg>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - 4) / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = 2 + stepX * i;
      const y = height - 2 - ((v - min) / range) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
