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

interface CopyDayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  academicYearId: string;
  yearGroupId: string;
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

export function CopyDayDialog({
  open,
  onOpenChange,
  academicYearId,
  yearGroupId,
  onCopied,
}: CopyDayDialogProps) {
  const t = useTranslations('scheduling');
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [sourceDay, setSourceDay] = React.useState('1');
  const [targetDays, setTargetDays] = React.useState<number[]>([]);
  const [isCopying, setIsCopying] = React.useState(false);

  const toggleTarget = (day: number) => {
    setTargetDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  // Reset targets when source changes
  React.useEffect(() => {
    setTargetDays([]);
  }, [sourceDay]);

  const handleCopy = async () => {
    if (targetDays.length === 0) return;
    setIsCopying(true);
    try {
      await apiClient('/api/v1/period-grid/copy-day', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: academicYearId,
          year_group_id: yearGroupId,
          source_weekday: Number(sourceDay),
          target_weekdays: targetDays,
        }),
      });
      toast.success(tv('daysCopied'));
      onOpenChange(false);
      onCopied();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsCopying(false);
    }
  };

  const sourceDayNum = Number(sourceDay);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            {tv('copyDayTitle')}
          </DialogTitle>
          <p className="text-sm text-text-tertiary">{tv('copyDayDesc')}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Source day */}
          <div className="space-y-1.5">
            <Label>{tv('sourceDay')}</Label>
            <Select value={sourceDay} onValueChange={setSourceDay}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {t(WEEKDAY_LABELS[d]!)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Target days */}
          <div className="space-y-2">
            <Label>{tv('targetDays')}</Label>
            <div className="space-y-2 rounded-lg border p-3">
              {WEEKDAYS.filter((d) => d !== sourceDayNum).map((d) => (
                <div key={d} className="flex items-center gap-2">
                  <Checkbox
                    id={`target-day-${d}`}
                    checked={targetDays.includes(d)}
                    onCheckedChange={() => toggleTarget(d)}
                  />
                  <Label htmlFor={`target-day-${d}`} className="cursor-pointer font-normal">
                    {t(WEEKDAY_LABELS[d]!)}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => void handleCopy()} disabled={isCopying || targetDays.length === 0}>
            {isCopying ? '...' : tv('copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
