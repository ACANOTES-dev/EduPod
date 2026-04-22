'use client';

import { AlertCircle, CheckCircle2, FileText, Info, ShieldAlert, ShieldX } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Label, Textarea } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import { getLocaleFromPathname } from '@/lib/pastoral';

// ─── Types ────────────────────────────────────────────────────────────────────

type DsarDecision = 'include' | 'redact' | 'exclude';

interface DsarReviewRow {
  id: string;
  compliance_request_id: string;
  entity_type: string;
  entity_id: string;
  tier: number;
  decision: DsarDecision | null;
  legal_basis: string | null;
  justification: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DsarSummaryResponse {
  total: number;
  pending: number;
  included: number;
  redacted: number;
  excluded: number;
  all_complete: boolean;
}

interface DraftDecision {
  decision: DsarDecision | null;
  legal_basis: string;
  justification: string;
  saving: boolean;
  saved_at: string | null;
  error: string | null;
}

const EMPTY_DRAFT: DraftDecision = {
  decision: null,
  legal_basis: '',
  justification: '',
  saving: false,
  saved_at: null,
  error: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrap<T>(value: { data?: T } | T): T {
  if (value && typeof value === 'object' && 'data' in (value as object)) {
    const inner = (value as { data?: T }).data;
    if (inner !== undefined && inner !== null) return inner;
  }
  return value as T;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PastoralDsarDetailPage() {
  const t = useTranslations('dsarReview');
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const complianceRequestId = params?.complianceRequestId as string;

  const [reviews, setReviews] = React.useState<DsarReviewRow[]>([]);
  const [summary, setSummary] = React.useState<DsarSummaryResponse | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, DraftDecision>>({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [globalError, setGlobalError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [listRes, summaryRes] = await Promise.all([
        apiClient<DsarReviewRow[] | { data: DsarReviewRow[] }>(
          `/api/v1/pastoral/dsar-reviews/by-request/${complianceRequestId}`,
          { silent: true },
        ),
        apiClient<DsarSummaryResponse | { data: DsarSummaryResponse }>(
          `/api/v1/pastoral/dsar-reviews/by-request/${complianceRequestId}/summary`,
          { silent: true },
        ),
      ]);

      const list = unwrap<DsarReviewRow[]>(listRes);
      setReviews(list);
      setSummary(unwrap<DsarSummaryResponse>(summaryRes));

      const nextDrafts: Record<string, DraftDecision> = {};
      for (const row of list) {
        nextDrafts[row.id] = {
          decision: row.decision,
          legal_basis: row.legal_basis ?? '',
          justification: row.justification ?? '',
          saving: false,
          saved_at: row.reviewed_at,
          error: null,
        };
      }
      setDrafts(nextDrafts);
    } catch (err) {
      console.error('[PastoralDsarDetailPage]', err);
      setReviews([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [complianceRequestId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateDraft = React.useCallback((reviewId: string, patch: Partial<DraftDecision>) => {
    setDrafts((current) => ({
      ...current,
      [reviewId]: { ...(current[reviewId] ?? EMPTY_DRAFT), ...patch },
    }));
  }, []);

  const submitOne = React.useCallback(
    async (reviewId: string): Promise<boolean> => {
      const draft = drafts[reviewId];
      if (!draft || !draft.decision) return false;

      if (
        (draft.decision === 'exclude' || draft.decision === 'redact') &&
        !draft.legal_basis.trim()
      ) {
        updateDraft(reviewId, { error: t('errors.legalBasisRequired') });
        return false;
      }

      updateDraft(reviewId, { saving: true, error: null });
      try {
        await apiClient(`/api/v1/pastoral/dsar-reviews/${reviewId}/decide`, {
          method: 'POST',
          body: JSON.stringify({
            decision: draft.decision,
            legal_basis: draft.legal_basis.trim() || undefined,
            justification: draft.justification.trim() || undefined,
          }),
          silent: true,
        });
        updateDraft(reviewId, {
          saving: false,
          saved_at: new Date().toISOString(),
        });
        return true;
      } catch (err: unknown) {
        const apiError = err as { error?: { message?: string }; message?: string };
        updateDraft(reviewId, {
          saving: false,
          error: apiError.error?.message ?? apiError.message ?? t('errors.saveFailed'),
        });
        return false;
      }
    },
    [drafts, t, updateDraft],
  );

  const submitAll = React.useCallback(async () => {
    setGlobalError(null);
    setSubmitting(true);

    const pendingIds = reviews
      .filter((r) => {
        if (r.decision !== null) return false;
        const draft = drafts[r.id];
        return draft?.decision != null;
      })
      .map((r) => r.id);

    if (pendingIds.length === 0) {
      setGlobalError(t('errors.nothingToSubmit'));
      setSubmitting(false);
      return;
    }

    let anyFailed = false;
    for (const id of pendingIds) {
      const ok = await submitOne(id);
      if (!ok) anyFailed = true;
    }

    setSubmitting(false);

    if (!anyFailed) {
      router.push(`/${locale}/pastoral/dsar`);
    } else {
      await refresh();
    }
  }, [drafts, locale, refresh, reviews, router, submitOne, t]);

  // ─── Render ─────────────────────────────────────────────────────────────

  const decidedCount = reviews.filter((r) => r.decision !== null).length;
  const pendingReviewable = reviews.filter((r) => r.decision === null);
  const stagedCount = pendingReviewable.filter((r) => drafts[r.id]?.decision != null).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('detailTitle', {
          id: complianceRequestId.slice(0, 8).toUpperCase(),
        })}
        description={t('detailDescription')}
        back={{ href: `/${locale}/pastoral/dsar`, label: 'Back' }}
      />

      {summary ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-text-tertiary">
              {t('stats.total')}
            </p>
            <p className="mt-2 text-xl font-semibold text-text-primary">{summary.total}</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-amber-800">
              {t('stats.pending')}
            </p>
            <p className="mt-2 text-xl font-semibold text-amber-900">{summary.pending}</p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-emerald-800">
              {t('stats.included')}
            </p>
            <p className="mt-2 text-xl font-semibold text-emerald-900">{summary.included}</p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-sky-800">
              {t('stats.redacted')}
            </p>
            <p className="mt-2 text-xl font-semibold text-sky-900">{summary.redacted}</p>
          </div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-rose-800">
              {t('stats.excluded')}
            </p>
            <p className="mt-2 text-xl font-semibold text-rose-900">{summary.excluded}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{t('auditNotice')}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-48 animate-pulse rounded-3xl bg-surface-secondary" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-text-tertiary">
          {t('detailEmpty')}
        </section>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => {
            const draft = drafts[review.id] ?? EMPTY_DRAFT;
            const isDecided = review.decision !== null;

            return (
              <section key={review.id} className="rounded-3xl border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 text-xs text-text-tertiary">
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      <span className="font-mono">{review.entity_type}</span>
                      <span>·</span>
                      <span className="font-mono">
                        {review.entity_id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-text-secondary">
                      {t('tierLabel', { tier: review.tier })}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {t('itemCreated', { date: formatDateTime(review.created_at) })}
                    </p>
                  </div>
                  {isDecided ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      {t(`decision.${review.decision}` as never)}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <Button
                    variant={draft.decision === 'include' ? 'default' : 'outline'}
                    disabled={isDecided || draft.saving}
                    onClick={() => updateDraft(review.id, { decision: 'include', error: null })}
                    title={t('decisionHints.include')}
                  >
                    <CheckCircle2 className="me-2 h-4 w-4" aria-hidden="true" />
                    {t('decision.include')}
                  </Button>
                  <Button
                    variant={draft.decision === 'redact' ? 'default' : 'outline'}
                    disabled={isDecided || draft.saving}
                    onClick={() => updateDraft(review.id, { decision: 'redact', error: null })}
                    title={t('decisionHints.redact')}
                  >
                    <ShieldAlert className="me-2 h-4 w-4" aria-hidden="true" />
                    {t('decision.redact')}
                  </Button>
                  <Button
                    variant={draft.decision === 'exclude' ? 'default' : 'outline'}
                    disabled={isDecided || draft.saving}
                    onClick={() => updateDraft(review.id, { decision: 'exclude', error: null })}
                    title={t('decisionHints.exclude')}
                  >
                    <ShieldX className="me-2 h-4 w-4" aria-hidden="true" />
                    {t('decision.exclude')}
                  </Button>
                </div>

                {draft.decision && !isDecided ? (
                  <div className="mt-4 space-y-3">
                    {draft.decision === 'exclude' || draft.decision === 'redact' ? (
                      <div className="space-y-2">
                        <Label htmlFor={`legal-basis-${review.id}`}>
                          {t('fields.legalBasis')}
                          <span className="ms-1 text-rose-700">*</span>
                        </Label>
                        <input
                          id={`legal-basis-${review.id}`}
                          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
                          value={draft.legal_basis}
                          onChange={(event) =>
                            updateDraft(review.id, { legal_basis: event.target.value })
                          }
                          placeholder={t('fields.legalBasisPlaceholder')}
                          maxLength={100}
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor={`justification-${review.id}`}>
                        {t('fields.justification')}
                      </Label>
                      <Textarea
                        id={`justification-${review.id}`}
                        value={draft.justification}
                        onChange={(event) =>
                          updateDraft(review.id, { justification: event.target.value })
                        }
                        rows={2}
                        placeholder={t('fields.justificationPlaceholder')}
                      />
                    </div>
                  </div>
                ) : null}

                {draft.error ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-rose-700">
                    <AlertCircle className="h-4 w-4" aria-hidden="true" />
                    {draft.error}
                  </p>
                ) : null}
              </section>
            );
          })}

          <div className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {t('submitSummary', {
                    staged: stagedCount,
                    pending: pendingReviewable.length,
                    decided: decidedCount,
                  })}
                </p>
                {globalError ? <p className="mt-2 text-sm text-rose-700">{globalError}</p> : null}
              </div>
              <Button disabled={submitting || stagedCount === 0} onClick={() => void submitAll()}>
                {submitting ? t('submitting') : t('submitDecisions')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
