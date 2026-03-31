'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { useTranslations } from 'next-intl';

import type { InterventionGoal, ReviewAutoPopulate } from './intervention-types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ReviewFormState {
  progress: string;
  notes: string;
  next_review_date: string;
  goal_updates: Array<{ goal_id: string; status: string; notes: string }>;
}

interface AddReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  autoPopData: ReviewAutoPopulate | null;
  reviewForm: ReviewFormState;
  onFormChange: (updater: (prev: ReviewFormState) => ReviewFormState) => void;
  goals: InterventionGoal[];
  reviewSubmitting: boolean;
  reviewError: string;
  onSubmit: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AddReviewDialog({
  open,
  onOpenChange,
  autoPopData,
  reviewForm,
  onFormChange,
  goals,
  reviewSubmitting,
  reviewError,
  onSubmit,
}: AddReviewDialogProps) {
  const t = useTranslations('behaviour.interventionDetail');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('dialog.addReview')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Auto-populated stats (read only) */}
          {autoPopData && (
            <div className="rounded-lg border border-border bg-surface-secondary p-3">
              <p className="mb-2 text-xs font-medium text-text-tertiary">Auto-populated Stats</p>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  <span className="text-text-tertiary">Points since last: </span>
                  <span className="font-medium text-text-primary">
                    {autoPopData.points_since_last}
                  </span>
                </span>
                <span>
                  <span className="text-text-tertiary">Attendance: </span>
                  <span className="font-medium text-text-primary">
                    {autoPopData.attendance_rate}%
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Progress */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Overall Progress *</Label>
            <Select
              value={reviewForm.progress}
              onValueChange={(v) => onFormChange((prev) => ({ ...prev, progress: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on_track">On Track</SelectItem>
                <SelectItem value="some_progress">Some Progress</SelectItem>
                <SelectItem value="no_progress">No Progress</SelectItem>
                <SelectItem value="regression">Regression</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Goal updates */}
          {reviewForm.goal_updates.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Goal Updates</Label>
              {reviewForm.goal_updates.map((gu, idx) => {
                const goalMatch = goals.find((g) => g.id === gu.goal_id);
                const autoGoal = autoPopData?.goal_statuses?.find(
                  (gs) => gs.goal_id === gu.goal_id,
                );
                return (
                  <div
                    key={gu.goal_id}
                    className="rounded-lg border border-border bg-surface-secondary p-3"
                  >
                    <p className="mb-2 text-xs font-medium text-text-primary">
                      {autoGoal?.goal_text ?? goalMatch?.goal_text ?? `Goal ${idx + 1}`}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Select
                        value={gu.status}
                        onValueChange={(v) => {
                          onFormChange((prev) => {
                            const updated = [...prev.goal_updates];
                            const current = updated[idx] ?? { goal_id: '', status: '', notes: '' };
                            updated[idx] = { ...current, status: v };
                            return { ...prev, goal_updates: updated };
                          });
                        }}
                      >
                        <SelectTrigger className="text-sm">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_started">Not Started</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="achieved">Achieved</SelectItem>
                          <SelectItem value="not_achieved">Not Achieved</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={gu.notes}
                        onChange={(e) => {
                          onFormChange((prev) => {
                            const updated = [...prev.goal_updates];
                            const current = updated[idx] ?? { goal_id: '', status: '', notes: '' };
                            updated[idx] = {
                              ...current,
                              notes: e.target.value,
                            };
                            return { ...prev, goal_updates: updated };
                          });
                        }}
                        placeholder="Notes..."
                        className="text-sm"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Notes</Label>
            <Textarea
              value={reviewForm.notes}
              onChange={(e) => onFormChange((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Review observations, recommendations..."
              rows={3}
            />
          </div>

          {/* Next review date */}
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Next Review Date</Label>
            <Input
              type="date"
              value={reviewForm.next_review_date}
              onChange={(e) =>
                onFormChange((prev) => ({
                  ...prev,
                  next_review_date: e.target.value,
                }))
              }
              className="text-base"
            />
          </div>

          {reviewError && <p className="text-sm text-danger-text">{reviewError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reviewSubmitting}>
            {t('cancel')}
          </Button>
          <Button onClick={onSubmit} disabled={reviewSubmitting}>
            {reviewSubmitting ? t('saving') : t('saveReview')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
