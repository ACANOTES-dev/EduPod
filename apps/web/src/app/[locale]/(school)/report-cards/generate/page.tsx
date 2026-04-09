'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import type { GenerationScopeMode, PersonalInfoField, StartGenerationRunDto } from '@school/shared';
import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { PollingStatus, isTerminalStatus } from './_components/wizard/polling-status';
import { buildScopePayload } from './_components/wizard/scope-helpers';
import { Step1Scope } from './_components/wizard/step-1-scope';
import { Step2Period } from './_components/wizard/step-2-period';
import { Step3Template } from './_components/wizard/step-3-template';
import { Step4Fields } from './_components/wizard/step-4-fields';
import { Step5CommentGate } from './_components/wizard/step-5-comment-gate';
import { Step6Review } from './_components/wizard/step-6-review';
import {
  WIZARD_STEPS,
  initialWizardState,
  wizardReducer,
  type GenerationRunSnapshot,
  type RunStatus,
  type WizardStep,
} from './_components/wizard/types';

const ADMIN_ROLES = ['school_owner', 'school_principal', 'admin', 'school_vice_principal'];

// ─── Settings payload (used to pre-fill defaults) ────────────────────────────

interface SettingsResponse {
  settings: {
    default_personal_info_fields: PersonalInfoField[];
    default_template_id: string | null;
  };
}

interface GenerationRunResponse {
  batch_job_id: string;
}

interface GenerationRunRow {
  id: string;
  status: string;
  students_generated_count: number;
  students_blocked_count: number;
  total_count: number;
  errors: Array<{ student_id: string; message: string }>;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function GenerateReportCardsPage() {
  const t = useTranslations('reportCards.wizard');
  const router = useRouter();
  const locale = useLocale();
  const { roleKeys } = useRoleCheck();
  const searchParams = useSearchParams();

  const canManage = React.useMemo(
    () => roleKeys.some((role) => ADMIN_ROLES.includes(role)),
    [roleKeys],
  );

  const [state, dispatch] = React.useReducer(wizardReducer, initialWizardState);
  const [defaultsLoaded, setDefaultsLoaded] = React.useState(false);

  // Redirect non-admins.
  React.useEffect(() => {
    if (roleKeys.length === 0) return; // still loading
    if (!canManage) {
      toast.error(t('permissionDenied'));
      router.replace(`/${locale}/report-cards`);
    }
  }, [canManage, locale, roleKeys.length, router, t]);

  // Load tenant settings once to pre-fill default personal-info fields.
  React.useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient<SettingsResponse>('/api/v1/report-card-tenant-settings');
        if (cancelled) return;
        dispatch({
          type: 'SET_FIELDS',
          fields: res.settings?.default_personal_info_fields ?? [],
        });
      } catch (err) {
        console.error('[GenerateReportCardsPage.loadSettings]', err);
      } finally {
        if (!cancelled) setDefaultsLoaded(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  // Pre-fill from query params (e.g. from an approved teacher request).
  // Applied once after defaults load so approved-request handoff jumps to review.
  const prefilledRef = React.useRef(false);
  React.useEffect(() => {
    if (!defaultsLoaded || prefilledRef.current) return;
    const scopeMode = searchParams?.get('scope_mode') as GenerationScopeMode | null;
    const scopeIdsRaw = searchParams?.get('scope_ids') ?? '';
    const periodId = searchParams?.get('period_id');

    if (scopeMode && scopeIdsRaw && periodId) {
      const ids = scopeIdsRaw.split(',').filter(Boolean);
      dispatch({ type: 'SET_SCOPE_MODE', mode: scopeMode });
      dispatch({ type: 'SET_SCOPE_IDS', ids });
      dispatch({ type: 'SET_PERIOD', id: periodId });
      dispatch({
        type: 'SET_CONTENT_SCOPE',
        contentScope: 'grades_only',
        locales: ['en', 'ar'],
      });
      // Jump to the review step — the admin can adjust if needed before
      // submitting. Step 5's dry-run effect will still run when the admin
      // navigates back to it.
      dispatch({ type: 'SET_STEP', step: 6 });
      prefilledRef.current = true;
    }
  }, [defaultsLoaded, searchParams]);

  // Polling effect for in-progress runs.
  React.useEffect(() => {
    if (!state.submit.runId) return;
    if (isTerminalStatus(state.submit.runStatus)) return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await apiClient<GenerationRunRow>(
          `/api/v1/report-cards/generation-runs/${state.submit.runId}`,
          { silent: true },
        );
        if (cancelled) return;
        const snapshot: GenerationRunSnapshot = {
          id: res.id,
          status: normaliseStatus(res.status),
          students_generated_count: res.students_generated_count,
          students_blocked_count: res.students_blocked_count,
          total_count: res.total_count,
          errors: res.errors ?? [],
        };
        dispatch({ type: 'POLL_UPDATE', snapshot });
      } catch (err) {
        console.error('[GenerateReportCardsPage.pollRun]', err);
      }
    };

    void tick();
    const handle = window.setInterval(() => {
      void tick();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [state.submit.runId, state.submit.runStatus]);

  // beforeunload guard while a run is in progress.
  React.useEffect(() => {
    const inProgress = state.submit.runId !== null && !isTerminalStatus(state.submit.runStatus);
    if (!inProgress) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = t('leaveWarning');
      return t('leaveWarning');
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state.submit.runId, state.submit.runStatus, t]);

  // ─── Step gating ────────────────────────────────────────────────────────
  const canGoNext = React.useMemo(() => {
    switch (state.step) {
      case 1:
        return state.scope.mode !== null && state.scope.ids.length > 0;
      case 2:
        return state.academicPeriodId !== null;
      case 3:
        return state.contentScope !== null;
      case 4:
        return state.personalInfoFields.length > 0;
      case 5:
        if (state.dryRun.loading || state.dryRun.error) return false;
        if (!state.dryRun.result) return false;
        if (state.dryRun.result.would_block && !state.overrideCommentGate) return false;
        return true;
      default:
        return false;
    }
  }, [state]);

  // ─── Submit handler ─────────────────────────────────────────────────────
  const handleSubmit = React.useCallback(async () => {
    if (!state.scope.mode || state.academicPeriodId === null || state.contentScope === null) {
      return;
    }

    dispatch({ type: 'SUBMIT_START' });
    try {
      const payload: StartGenerationRunDto = {
        scope: buildScopePayload(state.scope.mode, state.scope.ids),
        academic_period_id: state.academicPeriodId,
        content_scope: state.contentScope,
        personal_info_fields: state.personalInfoFields,
        override_comment_gate: state.overrideCommentGate,
      };
      const res = await apiClient<GenerationRunResponse>('/api/v1/report-cards/generation-runs', {
        method: 'POST',
        body: JSON.stringify(payload),
        silent: true,
      });
      dispatch({ type: 'SUBMIT_SUCCESS', runId: res.batch_job_id });
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : t('submitFailed');
      console.error('[GenerateReportCardsPage.handleSubmit]', err);
      toast.error(t('submitFailed'));
      dispatch({ type: 'SUBMIT_FAILURE', error: message });
    }
  }, [
    state.academicPeriodId,
    state.contentScope,
    state.overrideCommentGate,
    state.personalInfoFields,
    state.scope.ids,
    state.scope.mode,
    t,
  ]);

  if (!canManage) {
    return null;
  }

  const showPolling = state.submit.runId !== null || state.submit.submitting;

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title={t('title')} description={t('subtitle')} />

      {showPolling ? (
        <PollingStatus
          status={state.submit.runStatus}
          snapshot={state.submit.runSnapshot}
          onViewLibrary={() => router.push(`/${locale}/report-cards/library`)}
          onStartAnother={() => dispatch({ type: 'RESET' })}
        />
      ) : (
        <>
          <StepIndicator current={state.step} />

          <div className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-6">
            <div>
              <h2 className="text-base font-semibold text-text-primary">
                {t(`step${state.step}Title`)}
              </h2>
              <p className="text-sm text-text-tertiary">{t(`step${state.step}Description`)}</p>
            </div>

            <div className="pt-2">
              {state.step === 1 ? <Step1Scope state={state} dispatch={dispatch} /> : null}
              {state.step === 2 ? <Step2Period state={state} dispatch={dispatch} /> : null}
              {state.step === 3 ? <Step3Template state={state} dispatch={dispatch} /> : null}
              {state.step === 4 ? <Step4Fields state={state} dispatch={dispatch} /> : null}
              {state.step === 5 ? <Step5CommentGate state={state} dispatch={dispatch} /> : null}
              {state.step === 6 ? <Step6Review state={state} /> : null}
            </div>
          </div>

          {/* Footer navigation */}
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="outline"
              onClick={() => dispatch({ type: 'PREV' })}
              disabled={state.step === 1}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="me-1.5 h-4 w-4" />
              {t('back')}
            </Button>

            {state.step < 6 ? (
              <Button
                onClick={() => dispatch({ type: 'NEXT' })}
                disabled={!canGoNext}
                className="w-full sm:w-auto"
              >
                {t('next')}
                <ArrowRight className="ms-1.5 h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => void handleSubmit()}
                disabled={state.submit.submitting}
                className="w-full sm:w-auto"
              >
                {state.submit.submitting ? t('submitting') : t('submit')}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Step indicator ──────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const t = useTranslations('reportCards.wizard');
  return (
    <div className="flex items-center justify-between gap-1 overflow-x-auto">
      {WIZARD_STEPS.map((step, index) => {
        const isActive = step === current;
        const isComplete = step < current;
        return (
          <div key={step} className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-primary-500 text-white'
                  : isComplete
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-surface-secondary text-text-tertiary'
              }`}
              aria-label={t('stepLabel', { current: step, total: WIZARD_STEPS.length })}
            >
              {step}
            </div>
            {index < WIZARD_STEPS.length - 1 ? (
              <div className={`h-0.5 flex-1 ${isComplete ? 'bg-primary-200' : 'bg-border/60'}`} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ─── Status normalisation ────────────────────────────────────────────────────

function normaliseStatus(raw: string): RunStatus {
  switch (raw) {
    case 'queued':
    case 'running':
    case 'completed':
    case 'partial_success':
    case 'failed':
      return raw;
    default:
      return 'running';
  }
}
