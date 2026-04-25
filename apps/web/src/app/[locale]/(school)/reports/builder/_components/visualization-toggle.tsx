'use client';

import { BarChart3, Gauge, LineChart as LineChartIcon, PieChart as PieChartIcon, Table2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { SavedReportChartType } from './builder-types';

interface VisualizationToggleProps { value: SavedReportChartType; onChange: (type: SavedReportChartType) => void; }

const VISUALIZATIONS: Array<{ value: SavedReportChartType; key: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'table', key: 'table', Icon: Table2 },
  { value: 'bar', key: 'bar', Icon: BarChart3 },
  { value: 'line', key: 'line', Icon: LineChartIcon },
  { value: 'pie', key: 'pie', Icon: PieChartIcon },
  { value: 'kpi', key: 'kpi', Icon: Gauge },
];

export function VisualizationToggle({ value, onChange }: VisualizationToggleProps) {
  const t = useTranslations('reports.builder.viz');
  return (
    <div role="radiogroup" aria-label={t('title')} className="flex flex-wrap items-center gap-1 rounded-lg bg-surface-secondary p-1">
      {VISUALIZATIONS.map(({ value: vt, key, Icon }) => {
        const isActive = value === vt;
        return (
          <button key={vt} type="button" role="radio" aria-checked={isActive} onClick={() => onChange(vt)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isActive ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
            }`}
            data-testid={`viz-${vt}`}>
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t(key)}</span>
          </button>
        );
      })}
    </div>
  );
}
