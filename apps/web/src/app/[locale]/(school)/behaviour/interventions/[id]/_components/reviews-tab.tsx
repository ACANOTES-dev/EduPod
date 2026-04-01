'use client';

import { CalendarClock, CheckCircle2, Plus, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge, Button } from '@school/ui';

import type { InterventionGoal, ReviewEntry } from './intervention-types';
import { PROGRESS_COLORS } from './intervention-types';

import { formatDate } from '@/lib/format-date';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ReviewsTabProps {
  reviews: ReviewEntry[];
  reviewsLoading: boolean;
  goals: InterventionGoal[];
  onAddReview: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ReviewsTab({ reviews, reviewsLoading, goals, onAddReview }: ReviewsTabProps) {
  const t = useTranslations('behaviour.interventionDetail');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">Reviews ({reviews.length})</h3>
        <Button size="sm" onClick={onAddReview}>
          <Plus className="me-1.5 h-3.5 w-3.5" />
          {t('addReview')}
        </Button>
      </div>

      {reviewsLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-tertiary">{t('noReviews')}</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-medium text-text-primary">
                    {formatDate(review.review_date)}
                  </p>
                  {review.reviewer_user && (
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      by {review.reviewer_user.first_name} {review.reviewer_user.last_name}
                    </p>
                  )}
                </div>
                <Badge
                  variant="secondary"
                  className={`text-xs capitalize ${PROGRESS_COLORS[review.progress] ?? 'bg-gray-100 text-gray-700'}`}
                >
                  {review.progress.replace(/_/g, ' ')}
                </Badge>
              </div>

              {/* Stats */}
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-text-secondary">
                {review.points_since_last != null && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {review.points_since_last} pts since last
                  </span>
                )}
                {review.attendance_rate != null && (
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {review.attendance_rate}% attendance
                  </span>
                )}
                {review.next_review_date && (
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3 w-3" />
                    Next: {formatDate(review.next_review_date)}
                  </span>
                )}
              </div>

              {/* Goal updates */}
              {review.goal_updates.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="mb-1.5 text-xs font-medium text-text-tertiary">Goal Updates</p>
                  <div className="space-y-1">
                    {review.goal_updates.map((gu) => {
                      const goalMatch = goals.find((g) => g.id === gu.goal_id);
                      return (
                        <div key={gu.goal_id} className="flex items-center gap-2 text-xs">
                          <Badge variant="secondary" className="shrink-0 capitalize">
                            {gu.status.replace(/_/g, ' ')}
                          </Badge>
                          <span className="truncate text-text-secondary">
                            {goalMatch?.goal_text ?? gu.goal_id}
                          </span>
                          {gu.notes && (
                            <span className="truncate text-text-tertiary">- {gu.notes}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              {review.notes && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="whitespace-pre-wrap text-sm text-text-secondary">{review.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
