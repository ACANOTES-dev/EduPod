'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@school/ui';
import { CheckCircle2, ChevronDown, ClipboardList, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient, getAccessToken } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SurveyQuestion {
  id: string;
  tenant_id: string;
  survey_id: string;
  question_text: string;
  question_type: 'likert_5' | 'single_choice' | 'freeform';
  display_order: number;
  options: string[] | null;
  is_required: boolean;
}

interface ActiveSurveyResult {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: 'active';
  frequency: string;
  window_opens_at: string;
  window_closes_at: string;
  min_response_threshold: number;
  dept_drill_down_threshold: number;
  moderation_enabled: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  questions: SurveyQuestion[];
  hasResponded: boolean;
}

type AnswerMap = Record<string, { answer_value?: number; answer_text?: string }>;

const LIKERT_VALUES = [1, 2, 3, 4, 5] as const;
const LIKERT_KEYS: Record<number, string> = {
  1: 'stronglyDisagree',
  2: 'disagree',
  3: 'neutral',
  4: 'agree',
  5: 'stronglyAgree',
};

const FREEFORM_MAX_CHARS = 2000;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SurveyPage() {
  const t = useTranslations('wellbeing.survey');

  const [survey, setSurvey] = React.useState<ActiveSurveyResult | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [hasResponded, setHasResponded] = React.useState(false);
  const [answers, setAnswers] = React.useState<AnswerMap>({});
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<'already_responded' | 'closed' | null>(null);
  const [showAnonymityDetail, setShowAnonymityDetail] = React.useState(false);
  const [touchedQuestions, setTouchedQuestions] = React.useState<Set<string>>(new Set());

  // ── Fetch active survey ─────────────────────────────────────────────────────

  React.useEffect(() => {
    let cancelled = false;

    async function fetchSurvey() {
      try {
        const token = getAccessToken();
        const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
        const response = await fetch(`${API_URL}/api/v1/staff-wellbeing/respond/active`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
        });

        if (cancelled) return;

        if (response.status === 204 || response.status === 404) {
          setSurvey(null);
          return;
        }

        if (!response.ok) {
          setSurvey(null);
          return;
        }

        const data = (await response.json()) as ActiveSurveyResult;
        setSurvey(data);
        if (data.hasResponded) {
          setHasResponded(true);
        }
      } catch {
        if (!cancelled) {
          setSurvey(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchSurvey();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Answer helpers ──────────────────────────────────────────────────────────

  function setAnswer(questionId: string, value: { answer_value?: number; answer_text?: string }) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  function markTouched(questionId: string) {
    setTouchedQuestions((prev) => {
      const next = new Set(prev);
      next.add(questionId);
      return next;
    });
  }

  // ── Validation ──────────────────────────────────────────────────────────────

  const requiredQuestions = survey?.questions.filter((q) => q.is_required) ?? [];

  const allRequiredAnswered = requiredQuestions.every((q) => {
    const answer = answers[q.id];
    if (!answer) return false;
    if (q.question_type === 'freeform') {
      return (answer.answer_text ?? '').trim().length > 0;
    }
    return answer.answer_value !== undefined || (answer.answer_text ?? '').trim().length > 0;
  });

  function isQuestionMissing(question: SurveyQuestion): boolean {
    if (!question.is_required) return false;
    if (!touchedQuestions.has(question.id)) return false;
    const answer = answers[question.id];
    if (!answer) return true;
    if (question.question_type === 'freeform') {
      return (answer.answer_text ?? '').trim().length === 0;
    }
    return answer.answer_value === undefined && (answer.answer_text ?? '').trim().length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  function handleSubmitClick() {
    // Mark all required questions as touched to show validation
    const allRequired = new Set(requiredQuestions.map((q) => q.id));
    setTouchedQuestions(allRequired);

    if (!allRequiredAnswered) return;
    setShowConfirm(true);
  }

  async function handleConfirmSubmit() {
    if (!survey) return;
    setIsSubmitting(true);

    const payload = {
      answers: Object.entries(answers).map(([question_id, val]) => ({
        question_id,
        ...(val.answer_value !== undefined ? { answer_value: val.answer_value } : {}),
        ...(val.answer_text !== undefined ? { answer_text: val.answer_text } : {}),
      })),
    };

    try {
      await apiClient<{ submitted: true }>(`/api/v1/staff-wellbeing/respond/${survey.id}`, {
        method: 'POST',
        body: JSON.stringify(payload),
        silent: true,
      });
      setShowConfirm(false);
      setHasResponded(true);
    } catch (err: unknown) {
      setShowConfirm(false);
      const errorObj = err as { error?: { code?: string } } | undefined;
      const code = errorObj?.error?.code;
      if (code === 'ALREADY_RESPONDED' || (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 409)) {
        setSubmitError('already_responded');
      } else if (code === 'SURVEY_CLOSED' || (typeof err === 'object' && err !== null && 'status' in err && (err as { status: number }).status === 403)) {
        setSubmitError('closed');
      } else {
        // For 409 / 403 caught by apiClient error shape
        const errAny = err as Record<string, unknown> | undefined;
        if (errAny?.error && typeof errAny.error === 'object') {
          const nested = errAny.error as Record<string, unknown>;
          if (nested.code === 'ALREADY_RESPONDED' || nested.code === 'CONFLICT') {
            setSubmitError('already_responded');
          } else if (nested.code === 'FORBIDDEN' || nested.code === 'SURVEY_CLOSED') {
            setSubmitError('closed');
          }
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Format closing date ─────────────────────────────────────────────────────

  const closingDate = survey?.window_closes_at
    ? new Date(survey.window_closes_at).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : '';

  // ── Render ──────────────────────────────────────────────────────────────────

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-32 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      </div>
    );
  }

  // State 1: No active survey
  if (!survey) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-secondary">
            <ClipboardList className="h-8 w-8 text-text-tertiary" />
          </div>
          <p className="max-w-sm text-center text-sm text-text-secondary">
            {t('noActiveSurvey')}
          </p>
        </div>
      </div>
    );
  }

  // State 3: Already responded (or just submitted)
  if (hasResponded || submitError === 'already_responded') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <div className="mx-auto max-w-lg">
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-7 w-7 text-green-600" />
            </div>
            {submitError === 'already_responded' ? (
              <p className="text-sm text-text-secondary">{t('alreadyResponded')}</p>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-text-primary">{t('thankYou')}</h2>
                <p className="mt-2 text-sm text-text-secondary">{t('thankYouDetail')}</p>
                {closingDate && (
                  <p className="mt-3 text-sm text-text-tertiary">
                    {t('resultsAvailable', { date: closingDate })}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Survey closed error
  if (submitError === 'closed') {
    return (
      <div className="space-y-6">
        <PageHeader title={t('title')} />
        <div className="mx-auto max-w-lg">
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
              <ClipboardList className="h-7 w-7 text-text-tertiary" />
            </div>
            <p className="text-sm text-text-secondary">{t('surveyClosed')}</p>
          </div>
        </div>
      </div>
    );
  }

  // State 2: Active survey — not yet responded
  const sortedQuestions = [...survey.questions].sort(
    (a, b) => a.display_order - b.display_order,
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} />

      {/* Anonymity explanation panel */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
            <ShieldCheck className="h-5 w-5 text-blue-700" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-relaxed text-blue-900">
              {t('anonymityExplanation')}
            </p>

            {/* Expandable detail */}
            <button
              type="button"
              onClick={() => setShowAnonymityDetail((prev) => !prev)}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:text-blue-800"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  showAnonymityDetail ? 'rotate-180' : ''
                }`}
              />
              {t('howProtected')}
            </button>

            {showAnonymityDetail && (
              <p className="mt-2 text-xs leading-relaxed text-blue-800/80">
                {t('anonymityDetail')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Survey title and description */}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{survey.title}</h2>
        {survey.description && (
          <p className="mt-1 text-sm text-text-secondary">{survey.description}</p>
        )}
      </div>

      {/* Questions */}
      <div className="space-y-6">
        {sortedQuestions.map((question, idx) => (
          <div
            key={question.id}
            className="rounded-xl border border-border bg-surface p-4 sm:p-5"
          >
            <div className="mb-3 flex items-start gap-2">
              <span className="mt-0.5 text-xs font-medium text-text-tertiary" dir="ltr">
                {idx + 1}.
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text-primary">
                  {question.question_text}
                  {question.is_required && (
                    <span className="ms-1 text-red-500">*</span>
                  )}
                </p>
              </div>
            </div>

            {/* Likert 5 */}
            {question.question_type === 'likert_5' && (
              <LikertInput
                questionId={question.id}
                value={answers[question.id]?.answer_value}
                onChange={(val) => {
                  setAnswer(question.id, { answer_value: val });
                  markTouched(question.id);
                }}
                t={t}
              />
            )}

            {/* Single choice */}
            {question.question_type === 'single_choice' && question.options && (
              <SingleChoiceInput
                questionId={question.id}
                options={question.options}
                value={answers[question.id]?.answer_text}
                onChange={(val) => {
                  setAnswer(question.id, { answer_text: val });
                  markTouched(question.id);
                }}
              />
            )}

            {/* Freeform */}
            {question.question_type === 'freeform' && (
              <FreeformInput
                questionId={question.id}
                value={answers[question.id]?.answer_text ?? ''}
                onChange={(val) => {
                  setAnswer(question.id, { answer_text: val });
                  markTouched(question.id);
                }}
                t={t}
              />
            )}

            {/* Required validation hint */}
            {isQuestionMissing(question) && (
              <p className="mt-2 text-xs text-red-500">{t('requiredQuestion')}</p>
            )}
          </div>
        ))}
      </div>

      {/* Submit button */}
      <div className="pb-8">
        <Button
          className="w-full sm:w-auto"
          size="lg"
          disabled={!allRequiredAnswered}
          onClick={handleSubmitClick}
        >
          {t('submitAnonymous')}
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('confirmTitle')}</DialogTitle>
            <DialogDescription>{t('confirmMessage')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleConfirmSubmit()}
              disabled={isSubmitting}
            >
              {isSubmitting ? t('submitting') : t('submitAnonymous')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

interface LikertInputProps {
  questionId: string;
  value: number | undefined;
  onChange: (value: number) => void;
  t: ReturnType<typeof useTranslations>;
}

function LikertInput({ questionId: _questionId, value, onChange, t }: LikertInputProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      {LIKERT_VALUES.map((val) => {
        const isSelected = value === val;
        return (
          <button
            key={val}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={t(LIKERT_KEYS[val] as Parameters<typeof t>[0])}
            onClick={() => onChange(val)}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg border px-3 py-2.5 text-sm transition-colors sm:flex-col sm:gap-1 sm:px-2 sm:py-3 ${
              isSelected
                ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:bg-surface-secondary'
            }`}
          >
            <span className="me-2 text-xs font-semibold sm:me-0" dir="ltr">
              {val}
            </span>
            <span className="text-xs leading-tight">
              {t(LIKERT_KEYS[val] as Parameters<typeof t>[0])}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface SingleChoiceInputProps {
  questionId: string;
  options: string[];
  value: string | undefined;
  onChange: (value: string) => void;
}

function SingleChoiceInput({ questionId: _questionId, options, value, onChange }: SingleChoiceInputProps) {
  return (
    <div className="space-y-2" role="radiogroup">
      {options.map((option) => {
        const isSelected = value === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(option)}
            className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg border px-4 py-3 text-start text-sm transition-colors ${
              isSelected
                ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                : 'border-border bg-surface text-text-secondary hover:border-border-hover hover:bg-surface-secondary'
            }`}
          >
            <div
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                isSelected ? 'border-brand-600' : 'border-border'
              }`}
            >
              {isSelected && (
                <div className="h-2 w-2 rounded-full bg-brand-600" />
              )}
            </div>
            <span>{option}</span>
          </button>
        );
      })}
    </div>
  );
}

interface FreeformInputProps {
  questionId: string;
  value: string;
  onChange: (value: string) => void;
  t: ReturnType<typeof useTranslations>;
}

function FreeformInput({ questionId, value, onChange, t }: FreeformInputProps) {
  const charCount = value.length;

  return (
    <div className="space-y-2">
      {/* Anonymity warning — NON-NEGOTIABLE */}
      <p className="text-xs font-medium text-amber-700">
        {t('freeformWarning')}
      </p>
      <textarea
        id={`freeform-${questionId}`}
        value={value}
        onChange={(e) => {
          if (e.target.value.length <= FREEFORM_MAX_CHARS) {
            onChange(e.target.value);
          }
        }}
        rows={4}
        maxLength={FREEFORM_MAX_CHARS}
        className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2.5 text-base text-text-primary placeholder:text-text-tertiary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        placeholder=""
      />
      <p className="text-end text-xs text-text-tertiary" dir="ltr">
        {charCount} / {FREEFORM_MAX_CHARS}
      </p>
    </div>
  );
}
