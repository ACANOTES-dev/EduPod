'use client';

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { CellViolation } from './schedule-grid';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  score: number;
  tier1_count: number;
  tier2_count: number;
  tier3_count: number;
  tier1_violations: ViolationDetail[];
  tier2_violations: ViolationDetail[];
  tier3_violations: ViolationDetail[];
  unassigned_count: number;
  unassigned_slots: UnassignedSlot[];
  cell_violations: Record<string, CellViolation[]>;
}

export interface ViolationDetail {
  code: string;
  message: string;
  message_ar?: string;
  affected_cells?: string[];
}

export interface UnassignedSlot {
  year_group_name: string;
  subject_name: string;
  reason: string;
}

interface HealthScoreProps {
  result: ValidationResult;
  onCellClick?: (cellKey: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColour(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700';
  if (score >= 60) return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700';
  return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HealthScore({ result, onCellClick }: HealthScoreProps) {
  const t = useTranslations('scheduling');
  const [expandTier2, setExpandTier2] = React.useState(false);
  const [expandTier3, setExpandTier3] = React.useState(false);
  const [expandUnassigned, setExpandUnassigned] = React.useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Score header */}
      <div className={`px-4 py-4 border-b border-border ${scoreBg(result.score)}`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('runs.healthScore')}
          </h3>
          <span className={`text-2xl font-bold tabular-nums ${scoreColour(result.score)}`}>
            {result.score}
            <span className="text-sm font-normal text-text-tertiary"> / 100</span>
          </span>
        </div>
      </div>

      <div className="divide-y divide-border">
        {/* Tier 1: Blocking */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            {result.tier1_count === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <span className="text-sm text-text-primary flex-1">
              {result.tier1_count === 0
                ? t('runs.noBlockingIssues')
                : t('runs.blockingIssues', { count: result.tier1_count })}
            </span>
          </div>
          {result.tier1_violations.length > 0 && (
            <div className="mt-2 space-y-1.5 ps-6">
              {result.tier1_violations.map((v, i) => (
                <div key={i} className="text-xs text-red-700 dark:text-red-400">
                  <span className="font-medium">{v.code}:</span> {v.message}
                  {v.affected_cells?.map((cell) => (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => onCellClick?.(cell)}
                      className="ms-1 underline text-red-600 dark:text-red-300 hover:opacity-70"
                    >
                      [{cell}]
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tier 2: Hard violations */}
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setExpandTier2(!expandTier2)}
            className="flex items-center gap-2 w-full text-start"
          >
            {result.tier2_count === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            )}
            <span className="text-sm text-text-primary flex-1">
              {t('runs.hardViolations', { count: result.tier2_count })}
            </span>
            {result.tier2_count > 0 && (
              expandTier2 ? (
                <ChevronUp className="h-4 w-4 text-text-tertiary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-text-tertiary" />
              )
            )}
          </button>
          {expandTier2 && result.tier2_violations.length > 0 && (
            <div className="mt-2 space-y-1.5 ps-6">
              {result.tier2_violations.map((v, i) => (
                <div key={i} className="text-xs text-red-700 dark:text-red-400">
                  <span className="font-medium">{v.code}:</span> {v.message}
                  {v.affected_cells?.map((cell) => (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => onCellClick?.(cell)}
                      className="ms-1 underline text-red-600 dark:text-red-300 hover:opacity-70"
                    >
                      [{cell}]
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tier 3: Preferences */}
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setExpandTier3(!expandTier3)}
            className="flex items-center gap-2 w-full text-start"
          >
            {result.tier3_count === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            )}
            <span className="text-sm text-text-primary flex-1">
              {t('runs.preferenceIssues', { count: result.tier3_count })}
            </span>
            {result.tier3_count > 0 && (
              expandTier3 ? (
                <ChevronUp className="h-4 w-4 text-text-tertiary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-text-tertiary" />
              )
            )}
          </button>
          {expandTier3 && result.tier3_violations.length > 0 && (
            <div className="mt-2 space-y-1.5 ps-6">
              {result.tier3_violations.map((v, i) => (
                <div key={i} className="text-xs text-amber-700 dark:text-amber-400">
                  <span className="font-medium">{v.code}:</span> {v.message}
                  {v.affected_cells?.map((cell) => (
                    <button
                      key={cell}
                      type="button"
                      onClick={() => onCellClick?.(cell)}
                      className="ms-1 underline text-amber-600 dark:text-amber-300 hover:opacity-70"
                    >
                      [{cell}]
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Unassigned slots */}
        {result.unassigned_count > 0 && (
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => setExpandUnassigned(!expandUnassigned)}
              className="flex items-center gap-2 w-full text-start"
            >
              <AlertTriangle className="h-4 w-4 text-text-tertiary shrink-0" />
              <span className="text-sm text-text-primary flex-1">
                {t('runs.unassignedCount', { count: result.unassigned_count })}
              </span>
              {expandUnassigned ? (
                <ChevronUp className="h-4 w-4 text-text-tertiary" />
              ) : (
                <ChevronDown className="h-4 w-4 text-text-tertiary" />
              )}
            </button>
            {expandUnassigned && (
              <div className="mt-2 space-y-1.5 ps-6">
                {result.unassigned_slots.map((slot, i) => (
                  <div key={i} className="text-xs text-text-secondary">
                    <span className="font-medium">{slot.year_group_name}</span> —{' '}
                    {slot.subject_name}: {slot.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
