'use client';

import { CheckCircle2, Loader2, Star, User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoverCandidate {
  staff_profile_id: string;
  name: string;
  is_primary: boolean;
  current_day_load: number;
  current_week_load: number;
  max_periods_per_day: number | null;
  max_periods_per_week: number | null;
}

interface CoverTeacherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  slotDetails: {
    weekday: number;
    periodOrder: number;
    periodName: string;
    startTime: string;
    endTime: string;
    subjectName: string;
    yearGroupName: string;
    yearGroupId: string;
    subjectId?: string;
  } | null;
  onAssign?: (staffProfileId: string) => void;
}

const WEEKDAY_LABELS: Record<number, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CoverTeacherDialog({
  open,
  onOpenChange,
  runId,
  slotDetails,
  onAssign,
}: CoverTeacherDialogProps) {
  const t = useTranslations('scheduling');
  const [candidates, setCandidates] = React.useState<CoverCandidate[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [assigning, setAssigning] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !slotDetails) {
      setCandidates([]);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({
      weekday: String(slotDetails.weekday),
      period_order: String(slotDetails.periodOrder),
      year_group_id: slotDetails.yearGroupId,
      ...(slotDetails.subjectId ? { subject_id: slotDetails.subjectId } : {}),
    });

    apiClient<{ data: CoverCandidate[] }>(
      `/api/v1/scheduling-runs/${runId}/cover-candidates?${params.toString()}`,
    )
      .then((res) => setCandidates(res.data ?? []))
      .catch((err) => { console.error('[CoverTeacherDialog]', err); return setCandidates([]); })
      .finally(() => setLoading(false));
  }, [open, slotDetails, runId]);

  async function handleAssign(staffProfileId: string) {
    if (!slotDetails) return;
    setAssigning(staffProfileId);
    try {
      await apiClient(`/api/v1/scheduling-runs/${runId}/adjustments`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'assign_cover',
          staff_profile_id: staffProfileId,
          weekday: slotDetails.weekday,
          period_order: slotDetails.periodOrder,
          year_group_id: slotDetails.yearGroupId,
        }),
      });
      toast.success(t('runs.coverAssigned'));
      onAssign?.(staffProfileId);
      onOpenChange(false);
    } catch (err) {
      console.error('[CoverTeacherDialog]', err);
      toast.error(t('runs.coverFailed'));
    } finally {
      setAssigning(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand" />
            {t('runs.coverTeacherTitle')}
          </DialogTitle>
        </DialogHeader>

        {/* Slot details */}
        {slotDetails && (
          <div className="rounded-lg border border-border bg-surface-secondary p-3 text-sm space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-text-tertiary">{t('runs.coverDay')}</span>
              <span className="font-medium text-text-primary">
                {WEEKDAY_LABELS[slotDetails.weekday]} — {slotDetails.periodName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-tertiary">{t('runs.coverTime')}</span>
              <span className="font-mono text-text-primary">
                {slotDetails.startTime} - {slotDetails.endTime}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-tertiary">{t('runs.coverSubject')}</span>
              <span className="font-medium text-text-primary">{slotDetails.subjectName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-text-tertiary">{t('runs.coverYearGroup')}</span>
              <span className="text-text-primary">{slotDetails.yearGroupName}</span>
            </div>
          </div>
        )}

        {/* Candidates */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-text-tertiary">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">{t('runs.loadingCandidates')}</span>
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-tertiary">
              {t('runs.noCandidates')}
            </div>
          ) : (
            candidates.map((candidate) => (
              <div
                key={candidate.staff_profile_id}
                className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-surface-secondary/50 transition-colors"
              >
                {/* Teacher info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-text-primary truncate">
                      {candidate.name}
                    </span>
                    {candidate.is_primary && (
                      <Badge variant="success" className="text-[10px] px-1.5 py-0">
                        <Star className="h-2.5 w-2.5 me-0.5" />
                        {t('runs.primaryTeacher')}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    {t('runs.coverLoad', {
                      day: candidate.current_day_load,
                      week: candidate.current_week_load,
                    })}
                    {candidate.max_periods_per_week != null && (
                      <span className="opacity-60">{t('max')}{candidate.max_periods_per_week}/w)</span>
                    )}
                  </div>
                </div>

                {/* Assign button */}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAssign(candidate.staff_profile_id)}
                  disabled={assigning !== null}
                  className="shrink-0"
                >
                  {assigning === candidate.staff_profile_id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 me-1" />
                  )}
                  {t('runs.assign')}
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
