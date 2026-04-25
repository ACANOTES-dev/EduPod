'use client';

import {
  AlertTriangle, Banknote, CalendarCheck, ClipboardList, GraduationCap, Home,
  Landmark, ScrollText, ShieldAlert, TrendingUp, UserCog, UserSquare, Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { ReportSubjectKey, SubjectDescriptor } from './builder-types';

interface SubjectPickerProps {
  subjects: SubjectDescriptor[];
  selected: ReportSubjectKey | null;
  onSelect: (subject: ReportSubjectKey) => void;
}

const SUBJECT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  student: GraduationCap, staff: UserCog, household: Home, class: Users,
  invoice: Banknote, application: ClipboardList, behaviour_incident: AlertTriangle,
  safeguarding_concern: ShieldAlert, attendance_record: CalendarCheck,
  grade: TrendingUp, payroll_entry: Landmark,
};

function iconFor(key: string): React.ComponentType<{ className?: string }> {
  return SUBJECT_ICONS[key] ?? ScrollText;
}

export function SubjectPicker({ subjects, selected, onSelect }: SubjectPickerProps) {
  const t = useTranslations('reports.builder.subjects');
  const tPage = useTranslations('reports.builder.page');
  if (subjects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
        <UserSquare className="mx-auto h-10 w-10 text-text-tertiary" />
        <p className="mt-3 text-sm text-text-secondary">{tPage('subjectFirst')}</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-text-primary">{t('title')}</h3>
        <p className="mt-1 text-sm text-text-tertiary">{t('subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((subject) => {
          const Icon = iconFor(subject.key);
          const isSelected = selected === subject.key;
          return (
            <button key={subject.key} type="button" onClick={() => onSelect(subject.key as ReportSubjectKey)}
              className={`flex flex-col gap-2 rounded-xl border-2 p-4 text-start transition-colors ${
                isSelected ? 'border-primary bg-primary/10' : 'border-border bg-surface hover:bg-surface-secondary'
              }`}
              aria-pressed={isSelected} data-testid={`subject-card-${subject.key}`}>
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-text-primary">{t(`${subject.key}.name`)}</span>
              </div>
              <p className="text-xs text-text-tertiary">{t(`${subject.key}.description`)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
