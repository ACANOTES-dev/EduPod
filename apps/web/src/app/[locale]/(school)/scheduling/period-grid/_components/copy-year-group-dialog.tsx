'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YearGroup {
  id: string;
  name: string;
}

interface CopyYearGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  sourceYearGroupId: string;
  yearGroups: YearGroup[];
  onCopied: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_LABELS: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function CopyYearGroupDialog({
  open,
  onOpenChange,
  academicYearId,
  sourceYearGroupId,
  yearGroups,
  onCopied,
}: CopyYearGroupDialogProps) {
  const t = useTranslations('scheduling');
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [selectedDay, setSelectedDay] = React.useState('all');
  const [targetYearGroupIds, setTargetYearGroupIds] = React.useState<string[]>([]);
  const [isCopying, setIsCopying] = React.useState(false);

  const otherYearGroups = yearGroups.filter((yg) => yg.id !== sourceYearGroupId);
  const allSelected =
    otherYearGroups.length > 0 && targetYearGroupIds.length === otherYearGroups.length;

  const toggleYearGroup = (id: string) => {
    setTargetYearGroupIds((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  };

  const handleSelectAll = () => {
    if (allSelected) {
      setTargetYearGroupIds([]);
    } else {
      setTargetYearGroupIds(otherYearGroups.map((yg) => yg.id));
    }
  };

  const handleCopy = async () => {
    if (targetYearGroupIds.length === 0) return;
    setIsCopying(true);
    try {
      const body: Record<string, unknown> = {
        academic_year_id: academicYearId,
        source_year_group_id: sourceYearGroupId,
        target_year_group_ids: targetYearGroupIds,
      };
      if (selectedDay !== 'all') {
        body.weekdays = [Number(selectedDay)];
      }
      await apiClient('/api/v1/period-grid/copy-year-group', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      toast.success(tv('yearGroupsCopied'));
      onOpenChange(false);
      onCopied();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            {tv('copyToYearGroupsTitle')}
          </DialogTitle>
          <p className="text-sm text-text-tertiary">{tv('copyToYearGroupsDesc')}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Day selection */}
          <div className="space-y-1.5">
            <Label>{tv('selectSourceDay')}</Label>
            <Select value={selectedDay} onValueChange={setSelectedDay}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tv('allDays')}</SelectItem>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {t(WEEKDAY_LABELS[d]!)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target year groups */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{tv('targetYearGroups')}</Label>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={handleSelectAll}
              >
                {allSelected ? tc('deselectAll') : tc('selectAll')}
              </button>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
              {otherYearGroups.length === 0 ? (
                <p className="text-sm text-text-tertiary">{tc('noResults')}</p>
              ) : (
                otherYearGroups.map((yg) => (
                  <div key={yg.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`target-yg-${yg.id}`}
                      checked={targetYearGroupIds.includes(yg.id)}
                      onCheckedChange={() => toggleYearGroup(yg.id)}
                    />
                    <Label htmlFor={`target-yg-${yg.id}`} className="cursor-pointer font-normal">
                      {yg.name}
                    </Label>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => void handleCopy()}
            disabled={isCopying || targetYearGroupIds.length === 0}
          >
            {isCopying ? '...' : tv('copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
