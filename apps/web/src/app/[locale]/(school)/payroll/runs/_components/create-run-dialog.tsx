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
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

interface CreateRunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (runId: string) => void;
}

export function CreateRunDialog({ open, onOpenChange, onSuccess }: CreateRunDialogProps) {
  const t = useTranslations('payroll');

  const currentDate = new Date();
  const [periodLabel, setPeriodLabel] = React.useState('');
  const [periodMonth, setPeriodMonth] = React.useState(String(currentDate.getMonth() + 1));
  const [periodYear, setPeriodYear] = React.useState(String(currentDate.getFullYear()));
  const [totalWorkingDays, setTotalWorkingDays] = React.useState('22');
  const [isSaving, setIsSaving] = React.useState(false);

  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const years = Array.from({ length: 5 }, (_, i) => currentDate.getFullYear() - 2 + i);

  React.useEffect(() => {
    if (open) {
      const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ];
      const m = Number(periodMonth);
      const y = periodYear;
      setPeriodLabel(`${monthNames[m - 1]} ${y}`);
    }
  }, [open, periodMonth, periodYear]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/payroll/runs', {
        method: 'POST',
        body: JSON.stringify({
          period_label: periodLabel,
          period_month: Number(periodMonth),
          period_year: Number(periodYear),
          total_working_days: Number(totalWorkingDays),
        }),
      });
      onSuccess(res.data.id);
    } catch {
      // handled by apiClient
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('createRun')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t('periodLabel')}</Label>
            <Input
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('periodMonth')}</Label>
              <Select value={periodMonth} onValueChange={setPeriodMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={String(m)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('periodYear')}</Label>
              <Select value={periodYear} onValueChange={setPeriodYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('totalWorkingDays')}</Label>
            <Input
              type="number"
              min="1"
              max="31"
              value={totalWorkingDays}
              onChange={(e) => setTotalWorkingDays(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? '...' : t('createRun')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
