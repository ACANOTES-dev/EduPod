'use client';

import { RefreshCcw } from 'lucide-react';
import * as React from 'react';

import { Button, Skeleton, toast } from '@school/ui';

import { usePlatformSocket } from '@/hooks/use-platform-socket';
import { apiClient } from '@/lib/api-client';

import { OnboardingProgressBar } from './onboarding-progress-bar';
import {
  OnboardingStepCard,
  type OnboardingStepStatus,
  type TenantOnboardingStep,
} from './onboarding-step-card';

interface OnboardingTrackerProps {
  tenantId: string;
}

interface OnboardingSummary {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
  skipped: number;
  blocked: number;
  percent_complete: number;
}

interface OnboardingTrackerResponse {
  steps: TenantOnboardingStep[];
  phases: Record<string, TenantOnboardingStep[]>;
  summary: OnboardingSummary;
}

interface OnboardingSocketPayload {
  tenant_id?: string;
}

const phaseOrder: Array<TenantOnboardingStep['phase']> = [
  'infrastructure',
  'data',
  'configuration',
  'go_live',
];

const phaseLabels: Record<TenantOnboardingStep['phase'], string> = {
  infrastructure: 'Infrastructure',
  data: 'Data',
  configuration: 'Configuration',
  go_live: 'Go-Live',
};

export function OnboardingTracker({ tenantId }: OnboardingTrackerProps) {
  const { subscribe } = usePlatformSocket();
  const [tracker, setTracker] = React.useState<OnboardingTrackerResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [updatingStepId, setUpdatingStepId] = React.useState<string | null>(null);
  const [resetting, setResetting] = React.useState(false);

  const fetchTracker = React.useCallback(async () => {
    try {
      setError(null);
      const result = await apiClient<OnboardingTrackerResponse>(
        `/api/v1/admin/tenants/${tenantId}/onboarding`,
        { silent: true },
      );
      setTracker(result);
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Failed to load onboarding tracker');
      setError(message);
      console.error('[OnboardingTracker.fetchTracker]', err);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  React.useEffect(() => {
    void fetchTracker();
  }, [fetchTracker]);

  React.useEffect(() => {
    return subscribe('onboarding:update', (payload) => {
      if (isOnboardingSocketPayload(payload) && payload.tenant_id === tenantId) {
        void fetchTracker();
      }
    });
  }, [fetchTracker, subscribe, tenantId]);

  const handleUpdateStatus = React.useCallback(
    async (stepId: string, status: Exclude<OnboardingStepStatus, 'blocked'>) => {
      try {
        setUpdatingStepId(stepId);
        await apiClient(`/api/v1/admin/tenants/${tenantId}/onboarding/${stepId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        await fetchTracker();
      } catch (err: unknown) {
        toast.error(getErrorMessage(err, 'Failed to update onboarding step'));
      } finally {
        setUpdatingStepId(null);
      }
    },
    [fetchTracker, tenantId],
  );

  const handleReset = React.useCallback(async () => {
    try {
      setResetting(true);
      await apiClient(`/api/v1/admin/tenants/${tenantId}/onboarding/reset`, {
        method: 'POST',
      });
      await fetchTracker();
      toast.success('Onboarding tracker reset');
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, 'Failed to reset onboarding tracker'));
    } finally {
      setResetting(false);
    }
  }, [fetchTracker, tenantId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 rounded-lg" />
        <Skeleton className="h-44 rounded-lg" />
        <Skeleton className="h-44 rounded-lg" />
      </div>
    );
  }

  if (error || !tracker) {
    return (
      <div className="rounded-lg border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
        {error ?? 'Onboarding tracker is unavailable'}
      </div>
    );
  }

  const completedKeys = new Set(
    tracker.steps.filter((step) => step.status === 'completed').map((step) => step.step_key),
  );
  const stepLabelByKey = new Map(tracker.steps.map((step) => [step.step_key, step.label]));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-text-primary">Onboarding Progress</h3>
            <div className="mt-3 max-w-xl">
              <OnboardingProgressBar
                completed={tracker.summary.completed}
                percentComplete={tracker.summary.percent_complete}
                total={tracker.summary.total}
              />
            </div>
          </div>
          <Button variant="outline" onClick={handleReset} disabled={resetting}>
            <RefreshCcw className="me-2 h-4 w-4" />
            Reset
          </Button>
        </div>
      </div>

      {phaseOrder.map((phase) => {
        const steps = tracker.phases[phase] ?? [];
        if (steps.length === 0) return null;

        return (
          <section key={phase} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase text-text-tertiary">
              {phaseLabels[phase]}
            </h3>
            <div className="space-y-3">
              {steps.map((step) => {
                const blockerLabels = step.blocked_by
                  .filter((blockerKey) => !completedKeys.has(blockerKey))
                  .map((blockerKey) => stepLabelByKey.get(blockerKey) ?? blockerKey);
                const isBlocked =
                  step.status !== 'completed' &&
                  step.status !== 'skipped' &&
                  blockerLabels.length > 0;

                return (
                  <OnboardingStepCard
                    key={step.id}
                    blockerLabels={blockerLabels}
                    isBlocked={isBlocked}
                    step={step}
                    updating={updatingStepId === step.id}
                    onUpdateStatus={handleUpdateStatus}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function isOnboardingSocketPayload(payload: unknown): payload is OnboardingSocketPayload {
  return payload !== null && typeof payload === 'object' && 'tenant_id' in payload;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'error' in err) {
    const apiError = err as { error?: { message?: string } };
    return apiError.error?.message ?? fallback;
  }
  return fallback;
}
