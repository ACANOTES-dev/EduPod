'use client';

import { Check, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import type { WizardAction, WizardState } from './types';

interface ContentScopeSummary {
  content_scope: string;
  name: string;
  locales: Array<{ template_id: string; locale: string; is_default: boolean }>;
  is_default: boolean;
  is_available: boolean;
}

interface Step3Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Step 3 — Template selection ─────────────────────────────────────────────

export function Step3Template({ state, dispatch }: Step3Props) {
  const t = useTranslations('reportCards.wizard');
  const [scopes, setScopes] = React.useState<ContentScopeSummary[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient<{ data: ContentScopeSummary[] }>(
          '/api/v1/report-cards/templates/content-scopes',
        );
        if (cancelled) return;
        setScopes(res.data ?? []);
      } catch (err) {
        console.error('[Step3Template.load]', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {scopes.map((scope) => {
        const isSelectable = scope.is_available && scope.locales.length > 0;
        const isSelected = state.contentScope === scope.content_scope;
        const localesLabel = scope.locales.map((l) => l.locale.toUpperCase()).join(', ');

        return (
          <button
            key={scope.content_scope}
            type="button"
            disabled={!isSelectable}
            onClick={() =>
              isSelectable &&
              dispatch({
                type: 'SET_CONTENT_SCOPE',
                contentScope: scope.content_scope as 'grades_only',
                locales: scope.locales.map((l) => l.locale),
              })
            }
            className={`flex w-full items-start justify-between gap-3 rounded-xl border p-4 text-start transition-all ${
              isSelected
                ? 'border-primary-500 bg-primary-50/50 shadow-sm'
                : isSelectable
                  ? 'border-border bg-surface hover:border-primary-300'
                  : 'cursor-not-allowed border-dashed border-border/60 bg-surface-secondary/40 opacity-60'
            }`}
          >
            <div className="flex flex-1 items-start gap-3">
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
                  isSelected
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-secondary text-text-tertiary'
                }`}
              >
                <FileText className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{scope.name}</span>
                  {!scope.is_available ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                      {t('templateComingSoon')}
                    </span>
                  ) : scope.locales.length === 0 ? (
                    <span className="text-xs text-error">{t('templateLocalesNone')}</span>
                  ) : null}
                </div>
                {scope.locales.length > 0 ? (
                  <div className="mt-1 text-xs text-text-tertiary">
                    {t('templateLocales', { locales: localesLabel })}
                  </div>
                ) : null}
              </div>
            </div>
            {isSelected ? (
              <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
                <Check className="h-3.5 w-3.5" />
              </div>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
