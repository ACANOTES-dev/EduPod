'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HeatmapCell {
  day: string;
  yearGroup: string;
  load: number;
}

interface LoadHeatmapProps {
  data: HeatmapCell[];
  days?: string[];
  yearGroups?: string[];
  maxLoad?: number;
  showLegend?: boolean;
  className?: string;
}

// ─── Color Scale ──────────────────────────────────────────────────────────────

const getCellColor = (load: number, maxLoad: number): string => {
  const ratio = load / maxLoad;
  if (ratio <= 0.2) return '#dcfce7'; // green-100
  if (ratio <= 0.4) return '#bbf7d0'; // green-200
  if (ratio <= 0.6) return '#fde68a'; // yellow-200
  if (ratio <= 0.8) return '#fed7aa'; // orange-200
  return '#fecaca'; // red-200
};

const getCellTextColor = (load: number, maxLoad: number): string => {
  const ratio = load / maxLoad;
  if (ratio <= 0.4) return '#166534'; // green-800
  if (ratio <= 0.6) return '#854d0e'; // yellow-800
  if (ratio <= 0.8) return '#9a3412'; // orange-800
  return '#991b1b'; // red-800
};

// ─── Component ────────────────────────────────────────────────────────────────

export function LoadHeatmap({
  data,
  days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  yearGroups = [],
  maxLoad = 6,
  showLegend = true,
  className = '',
}: LoadHeatmapProps) {
  // Extract unique year groups from data if not provided
  const t = useTranslations('homework');
  const uniqueYearGroups = React.useMemo(() => {
    if (yearGroups.length > 0) return yearGroups;
    const groups = new Set(data.map((d) => d.yearGroup));
    return Array.from(groups);
  }, [data, yearGroups]);

  // Build lookup map
  const cellMap = React.useMemo(() => {
    const map = new Map<string, number>();
    data.forEach((cell) => {
      const key = `${cell.yearGroup}-${cell.day}`;
      map.set(key, cell.load);
    });
    return map;
  }, [data]);

  const getLoad = (yearGroup: string, day: string): number => {
    return cellMap.get(`${yearGroup}-${day}`) ?? 0;
  };

  // Calculate insights
  const insights = React.useMemo(() => {
    const overloads: { day: string; yearGroup: string; load: number }[] = [];
    const dayTotals = new Map<string, number>();

    data.forEach((cell) => {
      // Track overloads (load > 4)
      if (cell.load > 4) {
        overloads.push({
          day: cell.day,
          yearGroup: cell.yearGroup,
          load: cell.load,
        });
      }
      // Track day totals
      const current = dayTotals.get(cell.day) ?? 0;
      dayTotals.set(cell.day, current + cell.load);
    });

    // Find most loaded day
    let mostLoadedDay = '';
    let maxDayLoad = 0;
    dayTotals.forEach((load, day) => {
      if (load > maxDayLoad) {
        maxDayLoad = load;
        mostLoadedDay = day;
      }
    });

    return {
      overloads: overloads.sort((a, b) => b.load - a.load).slice(0, 5),
      mostLoadedDay,
      maxDayLoad,
    };
  }, [data]);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Heatmap Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-start text-xs font-medium text-text-tertiary">{t('yearGroup')}</th>
              {days.map((day) => (
                <th key={day} className="p-2 text-center text-xs font-medium text-text-tertiary">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {uniqueYearGroups.map((yearGroup) => (
              <tr key={yearGroup} className="border-b border-border/50">
                <td className="p-2 text-sm font-medium text-text-primary">{yearGroup}</td>
                {days.map((day) => {
                  const load = getLoad(yearGroup, day);
                  const isOverloaded = load > 4;
                  return (
                    <td key={`${yearGroup}-${day}`} className="p-1">
                      <div
                        className={`flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition-all hover:scale-105 ${
                          isOverloaded ? 'ring-2 ring-red-400' : ''
                        }`}
                        style={{
                          backgroundColor: getCellColor(load, maxLoad),
                          color: getCellTextColor(load, maxLoad),
                        }}
                        title={`${yearGroup} - ${day}: ${load} assignments`}
                      >
                        {load}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-text-secondary">
          <span className="font-medium">{t('load')}</span>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#dcfce7' }} />
            <span>{t('low020')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#bbf7d0' }} />
            <span>{t('light2140')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#fde68a' }} />
            <span>{t('medium4160')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#fed7aa' }} />
            <span>{t('high6180')}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded" style={{ backgroundColor: '#fecaca' }} />
            <span>{t('critical81100')}</span>
          </div>
        </div>
      )}

      {/* Insights */}
      {insights.overloads.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="text-sm font-medium text-text-primary">{t('loadInsights')}</span>
          </div>
          <ul className="space-y-1 text-xs text-text-secondary">
            {insights.overloads.slice(0, 3).map((overload, index) => (
              <li key={index}>
                • {overload.yearGroup}{t('has')}{overload.load}{t('assignmentsOn')}{overload.day}
              </li>
            ))}
            {insights.mostLoadedDay && (
              <li className="mt-2 text-yellow-700">
                💡 {insights.mostLoadedDay}{t('appearsToBeYourMost')}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
