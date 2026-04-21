'use client';

import { ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

// WB-C-27 — Parent-facing banner shown when access to a student's record is
// blocked by an active entry in `guardian_restrictions`. Deliberately does
// NOT leak any information about:
//   • WHO set the restriction
//   • WHEN it was set
//   • WHY it was set
//   • HOW LONG it will last
//
// Call sites: wrap the empty state of any parent-scoped view (grades,
// homework, behaviour, attendance, pastoral). Detection is by the API
// returning `GUARDIAN_RESTRICTED` (WB-C-02 guardian-restriction
// interceptor); consumers pass `restricted={true}` when that error is
// observed.

interface Props {
  studentName?: string;
  className?: string;
}

export function GuardianRestrictionBanner({ studentName, className }: Props) {
  const t = useTranslations('guardianRestriction');

  return (
    <div
      className={`rounded-xl border border-warning-300 bg-warning-50 p-5 ${className ?? ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning-700" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-text-primary">
            {studentName ? t('titleWithName', { name: studentName }) : t('title')}
          </p>
          <p className="text-xs text-text-secondary">{t('body')}</p>
        </div>
      </div>
    </div>
  );
}
