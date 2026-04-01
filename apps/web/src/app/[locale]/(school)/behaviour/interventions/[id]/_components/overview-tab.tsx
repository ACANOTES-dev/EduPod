'use client';

import { CalendarClock, Clock, ListChecks, Shield, Target, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge, Button } from '@school/ui';

import { formatDate, formatDateTime } from '@/lib/format-date';

import type { InterventionDetail } from './intervention-types';
import { daysUntil, STATUS_TRANSITIONS } from './intervention-types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface OverviewTabProps {
  intervention: InterventionDetail;
  onOpenTransition: (status: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InterventionOverviewTab({ intervention, onOpenTransition }: OverviewTabProps) {
  const t = useTranslations('behaviour.interventionDetail');
  const reviewDaysLeft = daysUntil(intervention.next_review_date);
  const availableTransitions = STATUS_TRANSITIONS[intervention.status] ?? [];

  return (
    <div className="grid gap-6 md:grid-cols-3">
      {/* Main content — 2 cols */}
      <div className="space-y-6 md:col-span-2">
        {/* Trigger description */}
        {intervention.trigger_description && (
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-2 text-sm font-semibold text-text-primary">
              {t('sections.triggerReason')}
            </h3>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">
              {intervention.trigger_description}
            </p>
          </div>
        )}

        {/* SEND Notes */}
        {intervention.send_awareness && intervention.send_notes && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">{t('sections.sendNotes')}</h3>
            </div>
            <p className="whitespace-pre-wrap text-sm text-amber-900">{intervention.send_notes}</p>
          </div>
        )}

        {/* Goals */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sections.goals')}</h3>
          {intervention.goals.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('noGoals')}</p>
          ) : (
            <div className="space-y-3">
              {intervention.goals.map((goal) => (
                <div
                  key={goal.id}
                  className="rounded-lg border border-border bg-surface-secondary p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 shrink-0 text-primary-500" />
                        <p className="text-sm font-medium text-text-primary">{goal.goal_text}</p>
                      </div>
                      {goal.measurable_target && (
                        <p className="mt-1 ps-6 text-xs text-text-tertiary">
                          Target: {goal.measurable_target}
                        </p>
                      )}
                      {goal.deadline && (
                        <p className="mt-0.5 ps-6 text-xs text-text-tertiary">
                          Deadline: {formatDate(goal.deadline)}
                        </p>
                      )}
                    </div>
                    <Badge
                      variant="secondary"
                      className={`shrink-0 text-xs capitalize ${
                        goal.status === 'achieved'
                          ? 'bg-green-100 text-green-700'
                          : goal.status === 'not_started'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {goal.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  {goal.progress_pct != null && (
                    <div className="mt-3 ps-6">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="h-full rounded-full bg-primary-500 transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, goal.progress_pct))}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-text-secondary">
                          {goal.progress_pct}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Strategies */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">
            {t('sections.strategies')}
          </h3>
          {intervention.strategies.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('noStrategies')}</p>
          ) : (
            <div className="space-y-3">
              {intervention.strategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className="rounded-lg border border-border bg-surface-secondary p-4"
                >
                  <div className="flex items-start gap-2">
                    <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-text-primary">{strategy.strategy_text}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
                        {strategy.responsible_staff_user && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {strategy.responsible_staff_user.first_name}{' '}
                            {strategy.responsible_staff_user.last_name}
                          </span>
                        )}
                        {strategy.frequency && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {strategy.frequency}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar — 1 col */}
      <div className="space-y-4">
        {/* Next Review countdown */}
        {intervention.next_review_date && (
          <div
            className={`rounded-xl border p-5 ${
              reviewDaysLeft != null && reviewDaysLeft < 0
                ? 'border-red-200 bg-red-50'
                : reviewDaysLeft != null && reviewDaysLeft <= 3
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-border bg-surface'
            }`}
          >
            <h3 className="mb-1 text-sm font-semibold text-text-primary">
              {t('sections.nextReview')}
            </h3>
            <p className="font-mono text-lg font-bold text-text-primary">
              {formatDate(intervention.next_review_date)}
            </p>
            {reviewDaysLeft != null && (
              <p
                className={`mt-1 text-sm font-medium ${
                  reviewDaysLeft < 0
                    ? 'text-red-600'
                    : reviewDaysLeft <= 3
                      ? 'text-amber-600'
                      : 'text-text-secondary'
                }`}
              >
                {reviewDaysLeft < 0
                  ? `${Math.abs(reviewDaysLeft)} days overdue`
                  : reviewDaysLeft === 0
                    ? 'Due today'
                    : `${reviewDaysLeft} days remaining`}
              </p>
            )}
          </div>
        )}

        {/* Details */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-semibold text-text-primary">{t('sections.details')}</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Student</dt>
                <dd className="text-text-primary">
                  {intervention.student
                    ? `${intervention.student.first_name} ${intervention.student.last_name}`
                    : '\u2014'}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Assigned To</dt>
                <dd className="text-text-primary">
                  {intervention.assigned_to_user
                    ? `${intervention.assigned_to_user.first_name} ${intervention.assigned_to_user.last_name}`
                    : '\u2014'}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Start Date</dt>
                <dd className="text-text-primary">{formatDate(intervention.start_date)}</dd>
              </div>
            </div>
            {intervention.target_end_date && (
              <div className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                <div>
                  <dt className="text-xs text-text-tertiary">Target End</dt>
                  <dd className="text-text-primary">{formatDate(intervention.target_end_date)}</dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Review Frequency</dt>
                <dd className="text-text-primary">
                  Every {intervention.review_frequency_days} days
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
              <div>
                <dt className="text-xs text-text-tertiary">Created</dt>
                <dd className="text-text-primary">{formatDateTime(intervention.created_at)}</dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Status actions */}
        {availableTransitions.length > 0 && (
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">
              {t('sections.actions')}
            </h3>
            <div className="flex flex-col gap-2">
              {availableTransitions.map((tr) => (
                <Button
                  key={tr.value}
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onOpenTransition(tr.value)}
                >
                  {tr.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* SEND badge */}
        {intervention.send_awareness && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800">SEND Awareness</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
