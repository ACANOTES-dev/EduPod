'use client';

import { Button } from '@school/ui';
import { Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AttendanceToggleProps {
  disabled?: boolean;
  onChange: (present: boolean) => void;
  studentName: string;
  value: boolean | null;
}

export function AttendanceToggle({
  disabled = false,
  onChange,
  studentName,
  value,
}: AttendanceToggleProps) {
  const t = useTranslations('engagement');

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        type="button"
        variant={value === true ? 'default' : 'outline'}
        disabled={disabled}
        onClick={() => onChange(true)}
        className={`h-12 min-h-[48px] justify-start rounded-2xl border-2 px-4 text-sm font-semibold ${
          value === true
            ? 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
            : 'border-emerald-200 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50'
        }`}
        aria-pressed={value === true}
        aria-label={t('tripAttendance.markPresentFor', { student: studentName })}
      >
        <Check className="me-2 h-4 w-4" />
        {t('tripAttendance.present')}
      </Button>
      <Button
        type="button"
        variant={value === false ? 'default' : 'outline'}
        disabled={disabled}
        onClick={() => onChange(false)}
        className={`h-12 min-h-[48px] justify-start rounded-2xl border-2 px-4 text-sm font-semibold ${
          value === false
            ? 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700'
            : 'border-rose-200 text-rose-800 hover:border-rose-300 hover:bg-rose-50'
        }`}
        aria-pressed={value === false}
        aria-label={t('tripAttendance.markAbsentFor', { student: studentName })}
      >
        <X className="me-2 h-4 w-4" />
        {t('tripAttendance.absent')}
      </Button>
    </div>
  );
}
