'use client';

import { useTranslations } from 'next-intl';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreviewStudent {
  student_id: string;
  student_name: string;
  current_status: string;
  proposed_action: string;
  year_group_id: string;
  year_group_name: string;
}

export type OverrideMap = Record<string, string>;

interface PromotionPreviewProps {
  students: PreviewStudent[];
  overrides: OverrideMap;
  onOverride: (studentId: string, action: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PromotionPreview({ students, overrides, onOverride }: PromotionPreviewProps) {
  const t = useTranslations('promotion');

  if (!students || students.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-tertiary">{t('noStudentsToPreview')}</p>
    );
  }

  // Group by year group
  const byGroup = students.reduce<Record<string, PreviewStudent[]>>((acc, s) => {
    if (!acc[s.year_group_id]) acc[s.year_group_id] = [];
    acc[s.year_group_id]!.push(s);
    return acc;
  }, {});

  const ACTION_OPTIONS = [
    { value: 'promote', label: t('actionPromote') },
    { value: 'hold_back', label: t('actionHoldBack') },
    { value: 'skip', label: t('actionSkip') },
    { value: 'graduate', label: t('actionGraduate') },
    { value: 'withdraw', label: t('actionWithdraw') },
  ];

  return (
    <div className="space-y-6">
      {Object.entries(byGroup).map(([groupId, groupStudents]) => {
        const groupName = groupStudents[0]?.year_group_name ?? groupId;
        return (
          <div key={groupId} className="rounded-xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-text-primary">{groupName}</h3>
              <p className="text-xs text-text-tertiary">
                {groupStudents.length} {t('students')}
              </p>
            </div>
            <ul className="divide-y divide-border">
              {groupStudents.map((student) => {
                const effectiveAction = overrides[student.student_id] ?? student.proposed_action;
                return (
                  <li
                    key={student.student_id}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {student.student_name}
                      </p>
                      <p className="text-xs text-text-tertiary capitalize">
                        {t('currentStatus')}: {student.current_status}
                      </p>
                    </div>
                    <Select
                      value={effectiveAction}
                      onValueChange={(v) => onOverride(student.student_id, v)}
                    >
                      <SelectTrigger className="h-7 w-36 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACTION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
