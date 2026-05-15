'use client';

import { Check, Circle, Loader2, Lock, Play, SkipForward } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from '@school/ui';

export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';

export interface TenantOnboardingStep {
  id: string;
  phase: 'infrastructure' | 'data' | 'configuration' | 'go_live';
  step_key: string;
  label: string;
  description: string;
  status: OnboardingStepStatus;
  is_auto: boolean;
  blocked_by: string[];
  completed_at: string | null;
  completed_by: string | null;
  metadata: Record<string, unknown> | null;
  sort_order: number;
  completer?: { first_name: string; last_name: string } | null;
}

interface OnboardingStepCardProps {
  step: TenantOnboardingStep;
  isBlocked: boolean;
  blockerLabels: string[];
  onUpdateStatus: (
    stepId: string,
    status: Exclude<OnboardingStepStatus, 'blocked'>,
  ) => Promise<void>;
  updating: boolean;
}

const statusLabelMap: Record<OnboardingStepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
  blocked: 'Blocked',
};

const statusVariantMap: Record<OnboardingStepStatus, 'success' | 'info' | 'neutral' | 'warning'> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
  skipped: 'neutral',
  blocked: 'warning',
};

export function OnboardingStepCard({
  step,
  isBlocked,
  blockerLabels,
  onUpdateStatus,
  updating,
}: OnboardingStepCardProps) {
  const effectiveStatus: OnboardingStepStatus = isBlocked ? 'blocked' : step.status;
  const completedBy = step.completer
    ? `${step.completer.first_name} ${step.completer.last_name}`
    : null;

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      {step.status === 'pending' && (
        <Button
          aria-label={`Mark ${step.label} as in progress`}
          disabled={updating || isBlocked}
          size="sm"
          variant="outline"
          onClick={() => onUpdateStatus(step.id, 'in_progress')}
        >
          <Play className="me-1.5 h-3.5 w-3.5" />
          Start
        </Button>
      )}
      {(step.status === 'pending' || step.status === 'in_progress') && (
        <Button
          aria-label={`Complete ${step.label}`}
          disabled={updating || isBlocked}
          size="sm"
          onClick={() => onUpdateStatus(step.id, 'completed')}
        >
          {updating ? (
            <Loader2 className="me-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="me-1.5 h-3.5 w-3.5" />
          )}
          Complete
        </Button>
      )}
      {step.status === 'pending' && (
        <Button
          aria-label={`Skip ${step.label}`}
          disabled={updating || isBlocked}
          size="sm"
          variant="ghost"
          onClick={() => onUpdateStatus(step.id, 'skipped')}
        >
          <SkipForward className="me-1.5 h-3.5 w-3.5" />
          Skip
        </Button>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-4 transition-colors',
        effectiveStatus === 'completed' && 'border-s-4 border-s-success-text',
        effectiveStatus === 'in_progress' && 'border-s-4 border-s-info-text',
        effectiveStatus === 'blocked' && 'bg-surface-secondary',
        effectiveStatus === 'skipped' && 'opacity-75',
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <StatusIcon status={effectiveStatus} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h4
                  className={cn(
                    'text-sm font-semibold text-text-primary',
                    effectiveStatus === 'skipped' && 'line-through',
                  )}
                >
                  {step.label}
                </h4>
                <StatusBadge status={statusVariantMap[effectiveStatus]}>
                  {statusLabelMap[effectiveStatus]}
                </StatusBadge>
                <StatusBadge status={step.is_auto ? 'info' : 'neutral'}>
                  {step.is_auto ? 'Auto' : 'Manual'}
                </StatusBadge>
              </div>
              <p className="mt-1 text-sm text-text-secondary">{step.description}</p>
              {effectiveStatus === 'blocked' && blockerLabels.length > 0 && (
                <p className="mt-2 text-xs font-medium text-warning-text">
                  Blocked by: {blockerLabels.join(', ')}
                </p>
              )}
              {step.completed_at && (
                <p className="mt-2 text-xs text-text-tertiary">
                  Completed{' '}
                  {new Date(step.completed_at).toLocaleDateString('en', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {completedBy ? ` by ${completedBy}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        {!step.is_auto && step.status !== 'completed' && step.status !== 'skipped' && (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>{actionButtons}</div>
              </TooltipTrigger>
              {isBlocked && blockerLabels.length > 0 && (
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Complete {blockerLabels.join(', ')} first.
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: OnboardingStepStatus }) {
  const className = 'mt-0.5 h-5 w-5 shrink-0';
  if (status === 'completed') return <Check className={cn(className, 'text-success-text')} />;
  if (status === 'in_progress')
    return <Loader2 className={cn(className, 'animate-spin text-info-text')} />;
  if (status === 'blocked') return <Lock className={cn(className, 'text-warning-text')} />;
  return <Circle className={cn(className, 'text-text-tertiary')} />;
}
