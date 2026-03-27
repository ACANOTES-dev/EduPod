'use client';

import { Info, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface SmallSchoolGuidanceProps {
  staffCount: number;
  responseThreshold?: number;
  deptDrillDownThreshold?: number;
}

export function SmallSchoolGuidance({
  staffCount,
  responseThreshold = 5,
  deptDrillDownThreshold = 10,
}: SmallSchoolGuidanceProps) {
  const t = useTranslations('wellbeing.smallSchool');
  const [dismissed, setDismissed] = useState(false);

  if (staffCount >= 15 || dismissed) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-800 sm:flex-row sm:items-start sm:gap-4">
      <Info className="mt-0.5 size-5 shrink-0" aria-hidden="true" />

      <p className="flex-1 text-sm leading-relaxed">
        {t('message', {
          count: staffCount,
          threshold: responseThreshold,
          deptThreshold: deptDrillDownThreshold,
        })}
      </p>

      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="flex shrink-0 items-center gap-1.5 self-end rounded-lg px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 sm:self-start"
        aria-label={t('dismiss')}
      >
        <X className="size-4" aria-hidden="true" />
        {t('dismiss')}
      </button>
    </div>
  );
}
