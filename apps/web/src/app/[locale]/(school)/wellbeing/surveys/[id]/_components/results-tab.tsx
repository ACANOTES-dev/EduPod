'use client';

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, Skeleton } from '@school/ui';

import type {
  FreeformResult,
  LikertResult,
  ModeratedComment,
  QuestionResult,
  SingleChoiceResult,
  Survey,
  SurveyResultsResponse,
} from './survey-types';
import { CHOICE_COLORS, LIKERT_COLORS } from './survey-types';

// ─── Results Tab Props ───────────────────────────────────────────────────────

interface ResultsTabProps {
  survey: Survey;
  results: SurveyResultsResponse | null;
  resultsLoading: boolean;
  selectedDepartment: string;
  filterBlocked: boolean;
  comments: ModeratedComment[];
  commentsVisible: boolean;
  commentsLoading: boolean;
  onDepartmentChange: (dept: string) => void;
  onViewComments: () => void;
}

// ─── Results Tab ─────────────────────────────────────────────────────────────

export function ResultsTab({
  survey,
  results,
  resultsLoading,
  selectedDepartment,
  filterBlocked,
  comments,
  commentsVisible,
  commentsLoading,
  onDepartmentChange,
  onViewComments,
}: ResultsTabProps) {
  const t = useTranslations('wellbeing.surveyDetail');

  // Survey still active — show message instead of results
  if (survey.status === 'active') {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50">
          <BarChart3 className="h-7 w-7 text-blue-600" />
        </div>
        <p className="max-w-sm text-center text-sm text-text-secondary">{t('surveyActive')}</p>
      </div>
    );
  }

  // Loading skeleton
  if (resultsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    );
  }

  // No results
  if (!results) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
          <BarChart3 className="h-7 w-7 text-text-tertiary" />
        </div>
        <p className="text-sm text-text-secondary">{t('title')}</p>
      </div>
    );
  }

  // Below threshold
  if (results.below_threshold) {
    return (
      <div className="space-y-6">
        <AnonymityPanel />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-amber-200 bg-amber-50 p-8">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
          <p className="max-w-sm text-center text-sm text-amber-800">
            {t('belowThreshold', { threshold: survey.min_response_threshold })}
          </p>
        </div>
      </div>
    );
  }

  // Eligible departments for filter
  const eligibleDepartments = (results.departments ?? []).filter((d) => d.eligible);

  return (
    <div className="space-y-6">
      {/* Anonymity explanation panel */}
      <AnonymityPanel />

      {/* Department filter */}
      {eligibleDepartments.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="dept-filter" className="text-sm font-medium text-text-primary">
            {t('departmentFilter')}
          </label>
          <select
            id="dept-filter"
            value={selectedDepartment}
            onChange={(e) => onDepartmentChange(e.target.value)}
            className="min-h-[44px] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="">{t('allDepartments')}</option>
            {eligibleDepartments.map((dept) => (
              <option key={dept.department} value={dept.department}>
                {dept.department} ({dept.staff_count})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Cross-filter blocking message */}
      {filterBlocked && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{t('filterBlocked')}</p>
        </div>
      )}

      {/* Question results */}
      {!filterBlocked &&
        results.questions.map((question) => (
          <QuestionResultCard
            key={question.question_id}
            question={question}
            survey={survey}
            comments={comments}
            commentsVisible={commentsVisible}
            commentsLoading={commentsLoading}
            onViewComments={onViewComments}
          />
        ))}
    </div>
  );
}

// ─── Anonymity Panel ─────────────────────────────────────────────────────────

function AnonymityPanel() {
  const t = useTranslations('wellbeing.surveyDetail');

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100">
          <ShieldCheck className="h-5 w-5 text-blue-700" />
        </div>
        <p className="min-w-0 flex-1 text-sm leading-relaxed text-blue-900">{t('anonymityNote')}</p>
      </div>
    </div>
  );
}

// ─── Question Result Card ────────────────────────────────────────────────────

interface QuestionResultCardProps {
  question: QuestionResult;
  survey: Survey;
  comments: ModeratedComment[];
  commentsVisible: boolean;
  commentsLoading: boolean;
  onViewComments: () => void;
}

function QuestionResultCard({
  question,
  survey,
  comments,
  commentsVisible,
  commentsLoading,
  onViewComments,
}: QuestionResultCardProps) {
  const t = useTranslations('wellbeing.surveyDetail');

  return (
    <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
      <h3 className="mb-4 text-sm font-semibold text-text-primary">{question.question_text}</h3>

      {question.question_type === 'likert_5' && <LikertResultChart question={question} />}

      {question.question_type === 'single_choice' && (
        <SingleChoiceResultChart question={question} />
      )}

      {question.question_type === 'freeform' && (
        <FreeformResultSection
          question={question}
          survey={survey}
          comments={comments.filter((c) => c.question_id === question.question_id)}
          commentsVisible={commentsVisible}
          commentsLoading={commentsLoading}
          onViewComments={onViewComments}
        />
      )}

      <p className="mt-3 text-xs text-text-tertiary">
        <span dir="ltr">{question.response_count}</span>{' '}
        {t('responsesReceived', { count: question.response_count })}
      </p>
    </div>
  );
}

// ─── Likert Result Chart ─────────────────────────────────────────────────────

function LikertResultChart({ question }: { question: LikertResult }) {
  const t = useTranslations('wellbeing.surveyDetail');
  const data = [1, 2, 3, 4, 5].map((val) => ({
    name: String(val),
    value: question.distribution[String(val)] ?? 0,
  }));

  return (
    <div className="space-y-4">
      {/* Mean and median */}
      <div className="flex flex-wrap gap-6">
        <div>
          <p className="text-xs font-medium text-text-tertiary">{t('mean')}</p>
          <p className="text-lg font-semibold text-text-primary" dir="ltr">
            {question.mean.toFixed(1)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-tertiary">{t('median')}</p>
          <p className="text-lg font-semibold text-text-primary" dir="ltr">
            {question.median.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Horizontal stacked bar */}
      <div className="w-full" style={{ height: 60 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={[{ ...Object.fromEntries(data.map((d) => [d.name, d.value])), name: 'dist' }]}
            stackOffset="expand"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
          >
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              formatter={(v, name) => {
                const numVal = Number(v);
                const total = data.reduce((sum, d) => sum + d.value, 0);
                const pct = total > 0 ? Math.round((numVal / total) * 100) : 0;
                return [`${String(v)} (${pct}%)`, String(name)];
              }}
            />
            {data.map((entry, index) => (
              <Bar
                key={entry.name}
                dataKey={entry.name}
                stackId="a"
                fill={LIKERT_COLORS[index]}
                radius={
                  index === 0
                    ? [4, 0, 0, 4]
                    : index === data.length - 1
                      ? [0, 4, 4, 0]
                      : [0, 0, 0, 0]
                }
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {data.map((entry, index) => (
          <div key={entry.name} className="flex items-center gap-1.5">
            <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: LIKERT_COLORS[index] }} />
            <span className="text-text-secondary">
              <span dir="ltr">{entry.name}</span> (<span dir="ltr">{entry.value}</span>)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single Choice Result Chart ──────────────────────────────────────────────

function SingleChoiceResultChart({ question }: { question: SingleChoiceResult }) {
  const entries = Object.entries(question.distribution);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  const data = entries.map(([option, count]) => ({
    name: option,
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));

  return (
    <div className="w-full" style={{ height: Math.max(200, data.length * 50) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ top: 0, right: 30, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => [`${String(v)}`]} />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHOICE_COLORS[index % CHOICE_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Freeform Result Section ─────────────────────────────────────────────────

interface FreeformResultSectionProps {
  question: FreeformResult;
  survey: Survey;
  comments: ModeratedComment[];
  commentsVisible: boolean;
  commentsLoading: boolean;
  onViewComments: () => void;
}

function FreeformResultSection({
  question,
  survey,
  comments,
  commentsVisible,
  commentsLoading,
  onViewComments,
}: FreeformResultSectionProps) {
  const t = useTranslations('wellbeing.surveyDetail');
  const belowThreshold = question.response_count < survey.min_response_threshold;

  return (
    <div className="space-y-4">
      {/* Summary counts */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-text-tertiary" />
          <span className="text-text-secondary">
            {t('responsesReceived', { count: question.response_count })}
          </span>
        </div>
        {question.approved_count > 0 && (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-text-secondary" dir="ltr">
              {question.approved_count} {t('approved')}
            </span>
          </div>
        )}
        {question.redacted_count > 0 && (
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-text-secondary" dir="ltr">
              {question.redacted_count} {t('redacted')}
            </span>
          </div>
        )}
      </div>

      {/* View responses button — only if above threshold */}
      {!belowThreshold && !commentsVisible && (
        <Button
          variant="outline"
          size="sm"
          onClick={onViewComments}
          disabled={commentsLoading}
          className="min-h-[44px]"
        >
          <Eye className="me-2 h-4 w-4" />
          {commentsLoading ? '...' : t('viewResponses')}
        </Button>
      )}

      {belowThreshold && (
        <p className="text-xs text-amber-700">
          {t('belowThreshold', { threshold: survey.min_response_threshold })}
        </p>
      )}

      {/* Approved comments display */}
      {commentsVisible && comments.length > 0 && (
        <div className="space-y-3">
          {comments.map((comment, idx) => (
            <div
              key={`${comment.question_id}-${idx}`}
              className="rounded-lg border border-border bg-surface-secondary p-3"
            >
              {comment.moderation_status === 'redacted' ? (
                <p className="text-sm italic text-text-tertiary">[{t('redacted')}]</p>
              ) : (
                <p className="text-sm text-text-primary">{comment.answer_text}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {commentsVisible && comments.length === 0 && (
        <p className="text-sm text-text-tertiary">{t('noModerationItems')}</p>
      )}
    </div>
  );
}
