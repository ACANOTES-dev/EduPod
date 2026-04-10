'use client';

import { Check, ExternalLink, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import type { WizardAction, WizardState } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LocaleEntry {
  template_id: string;
  template_name: string;
  locale: string;
  is_default: boolean;
}

interface DesignEntry {
  design_key: string;
  name: string;
  description: string;
  preview_pdf_url: string;
  is_default: boolean;
  locales: LocaleEntry[];
}

interface ContentScopeSummary {
  content_scope: string;
  name: string;
  locales: LocaleEntry[];
  designs: DesignEntry[];
  is_default: boolean;
  is_available: boolean;
}

interface Step3Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

// ─── Step 3 — Template design selection ──────────────────────────────────────
// Renders one card per design family (editorial-academic, modern-editorial)
// for the `grades_only` scope. Each card shows a name + description from the
// manifest metadata and an explicit "View sample" link that opens the
// pre-rendered PDF in a new tab so admins can see what the design looks like
// before committing. Scopes without an available design (planned but not
// shipped yet) still render as disabled "Coming soon" cards so the frontend
// catalogue stays stable.

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

  // Auto-select a sensible default on first load so the user can advance
  // without explicitly clicking (the legacy behaviour). We only do this if
  // the wizard state has no contentScope yet.
  React.useEffect(() => {
    if (state.contentScope !== null || state.designKey !== null || scopes.length === 0) return;
    const gradesOnly = scopes.find((s) => s.content_scope === 'grades_only' && s.is_available);
    if (!gradesOnly || gradesOnly.designs.length === 0) return;
    const defaultDesign = gradesOnly.designs.find((d) => d.is_default) ?? gradesOnly.designs[0];
    if (!defaultDesign) return;
    dispatch({
      type: 'SET_TEMPLATE_DESIGN',
      contentScope: 'grades_only',
      designKey: defaultDesign.design_key,
      locales: defaultDesign.locales.map((l) => l.locale),
    });
  }, [scopes, state.contentScope, state.designKey, dispatch]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  const gradesOnlyScope = scopes.find((s) => s.content_scope === 'grades_only');
  const unavailableScopes = scopes.filter((s) => !s.is_available);

  return (
    <div className="space-y-6">
      {/* Available: grades_only with design picker */}
      {gradesOnlyScope && gradesOnlyScope.is_available && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{gradesOnlyScope.name}</h3>
            <p className="text-xs text-text-tertiary">{t('templateDesignHint')}</p>
          </div>

          {gradesOnlyScope.designs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-secondary/40 p-4 text-xs text-text-tertiary">
              {t('templateNoDesigns')}
            </div>
          ) : (
            <div className="space-y-3">
              {gradesOnlyScope.designs.map((design) => (
                <DesignCard
                  key={design.design_key}
                  design={design}
                  isSelected={state.designKey === design.design_key}
                  onSelect={() =>
                    dispatch({
                      type: 'SET_TEMPLATE_DESIGN',
                      contentScope: 'grades_only',
                      designKey: design.design_key,
                      locales: design.locales.map((l) => l.locale),
                    })
                  }
                  previewLabel={t('templateViewSample')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Coming-soon scopes stay in the list so the frontend catalogue is stable */}
      {unavailableScopes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">
            {t('templateComingSoonHeading')}
          </h3>
          <div className="space-y-2">
            {unavailableScopes.map((scope) => (
              <div
                key={scope.content_scope}
                className="flex items-start gap-3 rounded-xl border border-dashed border-border/60 bg-surface-secondary/30 p-4 opacity-60"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-surface-secondary text-text-tertiary">
                  <FileText className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{scope.name}</span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                      {t('templateComingSoon')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Design card ─────────────────────────────────────────────────────────────

function DesignCard({
  design,
  isSelected,
  onSelect,
  previewLabel,
}: {
  design: DesignEntry;
  isSelected: boolean;
  onSelect: () => void;
  previewLabel: string;
}) {
  const localesLabel = design.locales.map((l) => l.locale.toUpperCase()).join(' · ');

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-4 transition-all ${
        isSelected
          ? 'border-primary-500 bg-primary-50/50 shadow-sm'
          : 'border-border bg-surface hover:border-primary-300'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex flex-1 items-start gap-3 text-start focus:outline-none"
      >
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
            isSelected ? 'bg-primary-500 text-white' : 'bg-surface-secondary text-text-tertiary'
          }`}
        >
          <FileText className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{design.name}</span>
            {design.is_default && (
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-700">
                Default
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-text-secondary">{design.description}</p>
          <p className="text-[11px] font-mono text-text-tertiary">Languages · {localesLabel}</p>
        </div>
      </button>
      <div className="flex flex-shrink-0 items-center gap-2">
        <a
          href={design.preview_pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[11px] font-medium text-text-secondary hover:border-primary-300 hover:text-primary-700"
        >
          <ExternalLink className="h-3 w-3" />
          {previewLabel}
        </a>
        {isSelected && (
          <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary-500 text-white">
            <Check className="h-3.5 w-3.5" />
          </div>
        )}
      </div>
    </div>
  );
}
