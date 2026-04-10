'use client';

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { CommentGateDryRunResult, DryRunGenerationCommentGateDto } from '@school/shared';
import { Button, Checkbox } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { buildScopePayload } from './scope-helpers';
import type { WizardAction, WizardState } from './types';

interface Step5Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Step 5 — Comment gate dry-run ───────────────────────────────────────────

export function Step5CommentGate({ state, dispatch }: Step5Props) {
  const t = useTranslations('reportCards.wizard');
  const [showDetails, setShowDetails] = React.useState(false);

  const runDryCheck = React.useCallback(async () => {
    // Phase 1b — Option B: the wizard requires either a per-period or
    // full-year scope to run the gate.
    if (!state.scope.mode || state.scope.ids.length === 0) return;
    if (!state.academicPeriodId && !state.academicYearId) return;

    dispatch({ type: 'DRY_RUN_START' });
    try {
      const payload: DryRunGenerationCommentGateDto = {
        scope: buildScopePayload(state.scope.mode, state.scope.ids),
        academic_period_id: state.academicPeriodId,
        academic_year_id: state.academicYearId ?? undefined,
        content_scope: state.contentScope ?? 'grades_only',
      };
      const res = await apiClient<{ data: CommentGateDryRunResult }>(
        '/api/v1/report-cards/generation-runs/dry-run',
        {
          method: 'POST',
          body: JSON.stringify(payload),
          silent: true,
        },
      );
      dispatch({ type: 'DRY_RUN_SUCCESS', result: res.data });
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : t('dryRunFailed');
      console.error('[Step5CommentGate.runDryCheck]', err);
      dispatch({ type: 'DRY_RUN_FAILURE', error: message });
    }
  }, [
    dispatch,
    state.academicPeriodId,
    state.academicYearId,
    state.contentScope,
    state.scope.ids,
    state.scope.mode,
    t,
  ]);

  // Auto-run when the step mounts (or re-mounts).
  React.useEffect(() => {
    void runDryCheck();
    // We intentionally only run once per step entry — when the user navigates
    // away and back we want a fresh check since upstream selections may have
    // changed. The effect dependency list is deliberately narrow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.dryRun.loading) {
    return (
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-surface p-10 text-text-secondary">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{t('dryRunLoading')}</span>
      </div>
    );
  }

  if (state.dryRun.error) {
    return (
      <div className="space-y-3 rounded-2xl border border-error/40 bg-error/5 p-4">
        <p className="text-sm text-error">{state.dryRun.error}</p>
        <Button variant="outline" size="sm" onClick={() => void runDryCheck()}>
          {t('dryRunRetry')}
        </Button>
      </div>
    );
  }

  const result = state.dryRun.result;
  if (!result) return null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-wide text-text-tertiary">
            {t('dryRunStudentsTotal', { count: result.students_total })}
          </div>
          <div className="mt-2 text-2xl font-bold text-text-primary">{result.students_total}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="text-xs uppercase tracking-wide text-text-tertiary">
            {t('dryRunLanguagesPreview', {
              en: result.languages_preview.en,
              ar: result.languages_preview.ar,
            })}
          </div>
          <div className="mt-2 text-sm text-text-secondary">
            <span>{`EN ${result.languages_preview.en}`}</span>
            <span className="mx-2" aria-hidden>
              ·
            </span>
            <span>{`AR ${result.languages_preview.ar}`}</span>
          </div>
        </div>
      </div>

      {/* Status */}
      {result.would_block ? (
        <BlockedBanner result={result} state={state} dispatch={dispatch} />
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-success/40 bg-success/5 p-4 text-success">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <p className="text-sm">{t('dryRunNoIssues')}</p>
        </div>
      )}

      {/* Drill-in lists */}
      {result.missing_subject_comments.length +
        result.unfinalised_subject_comments.length +
        result.missing_overall_comments.length +
        result.unfinalised_overall_comments.length >
      0 ? (
        <div className="rounded-2xl border border-border bg-surface">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="flex w-full items-center justify-between gap-2 p-4 text-sm font-medium text-text-primary"
          >
            <span>{showDetails ? t('dryRunHideList') : t('dryRunShowList')}</span>
            {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showDetails ? (
            <div className="space-y-4 border-t border-border p-4">
              <IssueList
                title={t('dryRunMissingSubject')}
                items={result.missing_subject_comments.map(
                  (i) => `${i.student_name} — ${i.subject_name}`,
                )}
              />
              <IssueList
                title={t('dryRunUnfinalisedSubject')}
                items={result.unfinalised_subject_comments.map(
                  (i) => `${i.student_name} — ${i.subject_name}`,
                )}
              />
              <IssueList
                title={t('dryRunMissingOverall')}
                items={result.missing_overall_comments.map((i) => i.student_name)}
              />
              <IssueList
                title={t('dryRunUnfinalisedOverall')}
                items={result.unfinalised_overall_comments.map((i) => i.student_name)}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── Blocked banner with optional force-generate ─────────────────────────────

function BlockedBanner({
  result,
  state,
  dispatch,
}: {
  result: CommentGateDryRunResult;
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const t = useTranslations('reportCards.wizard');

  return (
    <div className="space-y-3 rounded-2xl border border-warning/40 bg-warning/5 p-4">
      <div className="flex items-start gap-3 text-warning">
        <AlertTriangle className="h-5 w-5 flex-shrink-0" />
        <p className="text-sm font-medium">{t('commentGateBlocked')}</p>
      </div>

      {result.allow_admin_force_generate ? (
        <div className="space-y-2 rounded-xl bg-surface p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <Checkbox
              checked={state.overrideCommentGate}
              onCheckedChange={(checked) =>
                dispatch({ type: 'SET_OVERRIDE', value: checked === true })
              }
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-text-primary">{t('forceGenerate')}</div>
              <p className="mt-1 text-xs text-text-tertiary">{t('forceGenerateWarning')}</p>
            </div>
          </label>
        </div>
      ) : (
        <p className="text-xs text-text-secondary">{t('commentGateBlockedNoOverride')}</p>
      )}
    </div>
  );
}

// ─── Issue list helper ───────────────────────────────────────────────────────

function IssueList({ title, items }: { title: string; items: string[] }) {
  const t = useTranslations('reportCards.wizard');
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {`${title} (${items.length})`}
      </div>
      <ul className="mt-2 space-y-1 text-sm text-text-secondary">
        {items.slice(0, 20).map((item, i) => (
          <li key={`${item}-${i}`} className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-warning" />
            <span>{item}</span>
          </li>
        ))}
        {items.length > 20 ? (
          <li className="text-xs text-text-tertiary">
            {t('dryRunAndMore', { count: items.length - 20 })}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
