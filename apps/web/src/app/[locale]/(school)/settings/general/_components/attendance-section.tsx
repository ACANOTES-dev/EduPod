'use client';

import { useTranslations } from 'next-intl';

import { Label, RadioGroup, RadioGroupItem } from '@school/ui';

import { AttendanceSettings } from './settings-types';
import { BooleanRow, NumberRow, SectionCard, SubSectionCard } from './settings-ui';

interface AttendanceSectionProps {
  settings: AttendanceSettings;
  onChange: (updates: Partial<AttendanceSettings>) => void;
}

export function AttendanceSection({ settings, onChange }: AttendanceSectionProps) {
  const t = useTranslations('settings');

  const updatePattern = (updates: Partial<AttendanceSettings['patternDetection']>) => {
    onChange({ patternDetection: { ...settings.patternDetection, ...updates } });
  };

  return (
    <SectionCard title={t('sectionAttendance')} description={t('sectionAttendanceDesc')}>
      {/* Capture mode: per_period vs daily */}
      <div className="space-y-3">
        <div className="space-y-0.5">
          <Label className="text-sm text-text-primary">{t('captureMode')}</Label>
          <p className="text-xs text-text-tertiary">{t('captureModeDesc')}</p>
        </div>
        <RadioGroup
          value={settings.captureMode}
          onValueChange={(v) => onChange({ captureMode: v as 'per_period' | 'daily' })}
          className="space-y-2"
        >
          <div className="flex items-start gap-3">
            <RadioGroupItem value="per_period" id="capture-per-period" className="mt-0.5" />
            <div>
              <Label htmlFor="capture-per-period" className="text-sm text-text-primary">
                {t('capturePerPeriod')}
              </Label>
              <p className="text-xs text-text-tertiary">{t('capturePerPeriodDesc')}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <RadioGroupItem value="daily" id="capture-daily" className="mt-0.5" />
            <div>
              <Label htmlFor="capture-daily" className="text-sm text-text-primary">
                {t('captureDaily')}
              </Label>
              <p className="text-xs text-text-tertiary">{t('captureDailyDesc')}</p>
            </div>
          </div>
        </RadioGroup>
      </div>

      <BooleanRow
        label={t('allowTeacherAmendment')}
        value={settings.allowTeacherAmendment}
        onChange={(v) => onChange({ allowTeacherAmendment: v })}
      />
      <NumberRow
        label={t('autoLockAfterDays')}
        description={t('autoLockAfterDaysDesc')}
        value={settings.autoLockAfterDays}
        onChange={(v) => onChange({ autoLockAfterDays: v })}
        min={1}
        nullable
      />
      <NumberRow
        label={t('pendingAlertTimeHour')}
        description={t('pendingAlertTimeHourDesc')}
        value={settings.pendingAlertTimeHour}
        onChange={(v) => onChange({ pendingAlertTimeHour: v ?? 14 })}
        min={0}
        max={23}
      />

      {/* Work days picker */}
      <div className="space-y-2">
        <div className="space-y-0.5">
          <Label className="text-sm text-text-primary">{t('workDays')}</Label>
          <p className="text-xs text-text-tertiary">{t('workDaysDesc')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              { value: 0, label: t('sunday') },
              { value: 1, label: t('monday') },
              { value: 2, label: t('tuesday') },
              { value: 3, label: t('wednesday') },
              { value: 4, label: t('thursday') },
              { value: 5, label: t('friday') },
              { value: 6, label: t('saturday') },
            ] as const
          ).map((day) => {
            const isActive = settings.workDays.includes(day.value);
            return (
              <button
                key={day.value}
                type="button"
                onClick={() => {
                  const next = isActive
                    ? settings.workDays.filter((d) => d !== day.value)
                    : [...settings.workDays, day.value].sort();
                  onChange({ workDays: next });
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-primary-700 bg-primary-700 text-white'
                    : 'border-border bg-surface text-text-secondary hover:bg-surface-secondary'
                }`}
              >
                {day.label}
              </button>
            );
          })}
        </div>
      </div>

      <BooleanRow
        label={t('defaultPresent')}
        description={t('defaultPresentDescription')}
        value={settings.defaultPresentEnabled}
        onChange={(v) => onChange({ defaultPresentEnabled: v })}
      />
      <BooleanRow
        label={t('notifyParentOnAbsence')}
        description={t('notifyParentOnAbsenceDescription')}
        value={settings.notifyParentOnAbsence}
        onChange={(v) => onChange({ notifyParentOnAbsence: v })}
      />

      {/* Pattern detection sub-section */}
      <SubSectionCard title={t('patternDetection')} description={t('patternDetectionDescription')}>
        <BooleanRow
          label={t('patternEnabled')}
          value={settings.patternDetection.enabled}
          onChange={(v) => updatePattern({ enabled: v })}
        />
        {settings.patternDetection.enabled && (
          <>
            <NumberRow
              label={t('excessiveAbsenceThreshold')}
              value={settings.patternDetection.excessiveAbsenceThreshold}
              onChange={(v) => updatePattern({ excessiveAbsenceThreshold: v ?? 5 })}
              min={1}
            />
            <NumberRow
              label={t('excessiveAbsenceWindowDays')}
              value={settings.patternDetection.excessiveAbsenceWindowDays}
              onChange={(v) => updatePattern({ excessiveAbsenceWindowDays: v ?? 14 })}
              min={1}
            />
            <NumberRow
              label={t('recurringDayThreshold')}
              value={settings.patternDetection.recurringDayThreshold}
              onChange={(v) => updatePattern({ recurringDayThreshold: v ?? 3 })}
              min={1}
            />
            <NumberRow
              label={t('recurringDayWindowDays')}
              value={settings.patternDetection.recurringDayWindowDays}
              onChange={(v) => updatePattern({ recurringDayWindowDays: v ?? 30 })}
              min={1}
            />
            <NumberRow
              label={t('tardinessThreshold')}
              value={settings.patternDetection.tardinessThreshold}
              onChange={(v) => updatePattern({ tardinessThreshold: v ?? 4 })}
              min={1}
            />
            <NumberRow
              label={t('tardinessWindowDays')}
              value={settings.patternDetection.tardinessWindowDays}
              onChange={(v) => updatePattern({ tardinessWindowDays: v ?? 14 })}
              min={1}
            />

            {/* Parent notification mode */}
            <div className="space-y-3">
              <div className="space-y-0.5">
                <Label className="text-sm text-text-primary">{t('parentNotificationMode')}</Label>
              </div>
              <RadioGroup
                value={settings.patternDetection.parentNotificationMode}
                onValueChange={(v) =>
                  updatePattern({ parentNotificationMode: v as 'auto' | 'manual' })
                }
                className="space-y-2"
              >
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="auto" id="pattern-notif-auto" className="mt-0.5" />
                  <div>
                    <Label htmlFor="pattern-notif-auto" className="text-sm text-text-primary">
                      {t('parentNotificationAuto')}
                    </Label>
                    <p className="text-xs text-text-tertiary">
                      {t('parentNotificationAutoDescription')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <RadioGroupItem value="manual" id="pattern-notif-manual" className="mt-0.5" />
                  <div>
                    <Label htmlFor="pattern-notif-manual" className="text-sm text-text-primary">
                      {t('parentNotificationManual')}
                    </Label>
                    <p className="text-xs text-text-tertiary">
                      {t('parentNotificationManualDescription')}
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </>
        )}
      </SubSectionCard>
    </SectionCard>
  );
}
