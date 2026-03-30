'use client';

import * as React from 'react';

interface CompletionDonutProps {
  completed: number;
  inProgress: number;
  notStarted: number;
  size?: number;
}

const COLORS = { completed: '#22c55e', inProgress: '#f59e0b', notStarted: '#94a3b8' };

export function CompletionDonut({ completed, inProgress, notStarted, size = 120 }: CompletionDonutProps) {
  const total = completed + inProgress + notStarted;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const segments = React.useMemo(() => {
    if (total === 0) return [{ color: '#e2e8f0', dasharray: '100 0', offset: 0 }];
    const c = (completed / total) * 100;
    const ip = (inProgress / total) * 100;
    const ns = (notStarted / total) * 100;
    return [
      { color: COLORS.completed, dasharray: `${c} ${100 - c}`, offset: 0 },
      { color: COLORS.inProgress, dasharray: `${ip} ${100 - ip}`, offset: -c },
      { color: COLORS.notStarted, dasharray: `${ns} ${100 - ns}`, offset: -(c + ip) },
    ];
  }, [completed, inProgress, notStarted, total]);

  const r = 15.9155;
  const half = size / 2;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox="0 0 42 42">
        <circle cx="21" cy="21" r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx="21"
            cy="21"
            r={r}
            fill="none"
            stroke={seg.color}
            strokeWidth="3"
            strokeDasharray={seg.dasharray}
            strokeDashoffset={seg.offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${half / 2 + 0.5} ${half / 2 + 0.5})`}
          />
        ))}
        <text x="21" y="21" textAnchor="middle" dominantBaseline="central" className="text-[8px] font-semibold fill-current text-text-primary">
          {pct}%
        </text>
      </svg>
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORS.completed }} />{completed}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORS.inProgress }} />{inProgress}</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: COLORS.notStarted }} />{notStarted}</span>
      </div>
    </div>
  );
}
