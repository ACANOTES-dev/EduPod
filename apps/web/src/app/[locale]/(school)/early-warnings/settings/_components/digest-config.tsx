'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

interface DigestConfigProps {
  digestDay: number;
  digestRecipients: string[];
  onDayChange: (day: number) => void;
  onRecipientsChange: (recipients: string[]) => void;
}

const DAYS_OF_WEEK = [
  { value: 1, labelKey: 'monday' },
  { value: 2, labelKey: 'tuesday' },
  { value: 3, labelKey: 'wednesday' },
  { value: 4, labelKey: 'thursday' },
  { value: 5, labelKey: 'friday' },
  { value: 6, labelKey: 'saturday' },
  { value: 0, labelKey: 'sunday' },
];

const RECIPIENT_ROLE_OPTIONS = [
  { value: 'principal', labelKey: 'principal' },
  { value: 'deputy_principal', labelKey: 'deputy_principal' },
  { value: 'pastoral_lead', labelKey: 'pastoral_lead' },
  { value: 'year_head', labelKey: 'year_head' },
  { value: 'homeroom_teacher', labelKey: 'homeroom_teacher' },
];

export function DigestConfig({
  digestDay,
  digestRecipients,
  onDayChange,
  onRecipientsChange,
}: DigestConfigProps) {
  const t = useTranslations('early_warning.settings');

  const toggleRecipient = (value: string) => {
    const next = digestRecipients.includes(value)
      ? digestRecipients.filter((r) => r !== value)
      : [...digestRecipients, value];
    onRecipientsChange(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm text-text-secondary">{t('digest_day')}</Label>
        <Select value={String(digestDay)} onValueChange={(v) => onDayChange(Number(v))}>
          <SelectTrigger className="mt-1 w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAYS_OF_WEEK.map((day) => (
              <SelectItem key={day.value} value={String(day.value)}>
                {t(`days.${day.labelKey}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="text-sm text-text-secondary">{t('digest_recipients')}</Label>
        <p className="mt-1 text-xs text-text-tertiary">{t('digest_recipients_description')}</p>
        <div className="mt-2 space-y-2">
          {RECIPIENT_ROLE_OPTIONS.map((opt) => {
            const checked = digestRecipients.includes(opt.value);
            return (
              <label key={opt.value} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleRecipient(opt.value)}
                  className="h-4 w-4 rounded border-border text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-text-primary">
                  {t(`roles.${opt.labelKey}` as never)}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
