'use client';

import { CheckCircle2, MinusCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge } from '@school/ui';

import { apiClient } from '@/lib/api-client';

type EvaluationResult = 'matched' | 'no_match';

interface ActionExecution {
  action_type: string;
  execution_status: string;
  created_entity_type?: string | null;
  created_entity_id?: string | null;
}

interface Evaluation {
  id: string;
  stage: string;
  evaluation_result: EvaluationResult;
  rules_evaluated_count: number;
  rule_version?: { id: string; name: string; version: number } | null;
  action_executions?: ActionExecution[];
  created_at: string;
}

interface PolicyEvaluationResponse {
  data: Evaluation[];
}

const STAGE_ORDER = [
  'consequence',
  'approval_stage',
  'notification_stage',
  'support',
  'alerting',
] as const;

interface IncidentPolicyPanelProps {
  incidentId: string;
}

export function IncidentPolicyPanel({ incidentId }: IncidentPolicyPanelProps) {
  const t = useTranslations('behaviour.incidentDetail.policyPanel');
  const [evals, setEvals] = React.useState<Evaluation[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!incidentId) return;
    setLoading(true);
    apiClient<PolicyEvaluationResponse>(
      `/api/v1/behaviour/incidents/${incidentId}/policy-evaluation`,
    )
      .then((res) => setEvals(res.data ?? []))
      .catch((err) => {
        console.error('[IncidentPolicyPanel]', err);
        setEvals([]);
      })
      .finally(() => setLoading(false));
  }, [incidentId]);

  // Group by stage; surface the first matched evaluation per stage (engine
  // picks one via match_strategy). If only no_match rows exist for a stage,
  // surface one of those so we can show "no rule matched" per stage.
  const byStage = React.useMemo(() => {
    if (!evals) return new Map<string, Evaluation | null>();
    const m = new Map<string, Evaluation | null>();
    for (const stage of STAGE_ORDER) {
      const matched = evals.find((e) => e.stage === stage && e.evaluation_result === 'matched');
      const any = matched ?? evals.find((e) => e.stage === stage) ?? null;
      m.set(stage, any);
    }
    return m;
  }, [evals]);

  const hasAnyEvaluation = evals !== null && evals.length > 0;

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('title')}</h3>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-surface-secondary" />
          ))}
        </div>
      ) : !hasAnyEvaluation ? (
        <div className="space-y-1">
          <p className="text-sm text-text-tertiary">{t('notYetEvaluated')}</p>
          <p className="text-xs text-text-tertiary">{t('autoEvalNote')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {STAGE_ORDER.map((stage) => {
            const ev = byStage.get(stage);
            if (!ev) {
              return (
                <li key={stage} className="flex items-center gap-2 py-1 text-xs">
                  <MinusCircle className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                  <span className="capitalize text-text-tertiary">
                    {t('stageName', { stage: stage.replace(/_/g, ' ') })}
                  </span>
                  <span className="text-text-tertiary">·</span>
                  <span className="text-text-tertiary">{t('notRun')}</span>
                </li>
              );
            }
            const matched = ev.evaluation_result === 'matched';
            return (
              <li
                key={stage}
                className="rounded-lg border border-border bg-surface-secondary px-3 py-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  {matched ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <MinusCircle className="h-4 w-4 shrink-0 text-text-tertiary" />
                  )}
                  <span className="text-sm font-medium capitalize text-text-primary">
                    {t('stageName', { stage: stage.replace(/_/g, ' ') })}
                  </span>
                  <Badge variant={matched ? 'success' : 'secondary'} className="text-xs">
                    {matched ? t('matched') : t('noMatch')}
                  </Badge>
                </div>
                {matched && ev.rule_version && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {t('rule', {
                      name: ev.rule_version.name,
                      version: ev.rule_version.version,
                    })}
                  </p>
                )}
                {matched && ev.action_executions && ev.action_executions.length > 0 && (
                  <p className="mt-1 text-xs text-text-tertiary">
                    {t('actions', { count: ev.action_executions.length })}
                  </p>
                )}
                {!matched && (
                  <p className="mt-1 text-xs text-text-tertiary">
                    {t('evaluatedAgainst', { count: ev.rules_evaluated_count })}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
