'use client';

import {
  Button,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from '@school/ui';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface PatternDetectionSettings {
  enabled: boolean;
  excessiveAbsenceThreshold: number;
  excessiveAbsenceWindowDays: number;
  recurringDayThreshold: number;
  recurringDayWindowDays: number;
  tardinessThreshold: number;
  tardinessWindowDays: number;
  parentNotificationMode: 'auto' | 'manual';
}

interface AttendanceSettings {
  allowTeacherAmendment: boolean;
  autoLockAfterDays: number | null;
  pendingAlertTimeHour: number;
  workDays: number[];
  defaultPresentEnabled: boolean;
  notifyParentOnAbsence: boolean;
  patternDetection: PatternDetectionSettings;
}

interface AiSettings {
  enabled: boolean;
  commentStyle: 'formal' | 'warm' | 'balanced';
  commentSampleReference: string | null;
  commentTargetWordCount: number;
  aiProgressSummariesEnabled: boolean;
  aiGradingDailyLimit: number;
}

interface GradebookSettings {
  defaultMissingGradePolicy: 'exclude' | 'zero';
  requireGradeComment: boolean;
  formativeWeightCap: number | null;
  formativeIncludedInPeriodGrade: boolean;
  gpaPrecision: 1 | 2;
  gpaScaleLabel: string;
  atRiskDetectionEnabled: boolean;
  atRiskDetectionFrequency: 'daily' | 'weekly';
  gradingConsistencyThreshold: number;
  requireApprovalForMarkingSchemes: boolean;
}

interface AdmissionsSettings {
  requireApprovalForAcceptance: boolean;
}

interface FinanceSettings {
  requireApprovalForInvoiceIssue: boolean;
  defaultPaymentTermDays: number;
  allowPartialPayment: boolean;
}

interface CommunicationsSettings {
  primaryOutboundChannel: 'email' | 'whatsapp';
  requireApprovalForAnnouncements: boolean;
}

interface PayrollSettings {
  requireApprovalForNonPrincipal: boolean;
  defaultBonusMultiplier: number;
  autoPopulateClassCounts: boolean;
}

interface GeneralSectionSettings {
  parentPortalEnabled: boolean;
  attendanceVisibleToParents: boolean;
  gradesVisibleToParents: boolean;
  inquiryStaleHours: number;
}

interface SchedulingPreferenceWeights {
  low: number;
  medium: number;
  high: number;
}

interface SchedulingGlobalSoftWeights {
  evenSubjectSpread: number;
  minimiseTeacherGaps: number;
  roomConsistency: number;
  workloadBalance: number;
}

interface SchedulingSettings {
  teacherWeeklyMaxPeriods: number | null;
  autoSchedulerEnabled: boolean;
  requireApprovalForNonPrincipal: boolean;
  maxSolverDurationSeconds: number;
  preferenceWeights: SchedulingPreferenceWeights;
  globalSoftWeights: SchedulingGlobalSoftWeights;
}

interface ApprovalsSettings {
  expiryDays: number;
  reminderAfterHours: number;
}

interface ComplianceSettings {
  auditLogRetentionMonths: number;
}

interface TenantSettings {
  general: GeneralSectionSettings;
  attendance: AttendanceSettings;
  gradebook: GradebookSettings;
  admissions: AdmissionsSettings;
  finance: FinanceSettings;
  communications: CommunicationsSettings;
  payroll: PayrollSettings;
  scheduling: SchedulingSettings;
  approvals: ApprovalsSettings;
  compliance: ComplianceSettings;
  ai: AiSettings;
}

type SettingsSectionKey = keyof TenantSettings;

interface SettingsApiResponse {
  data?: TenantSettings;
  warnings?: string[];
}

/* -------------------------------------------------------------------------- */
/*  Defaults                                                                  */
/* -------------------------------------------------------------------------- */

const DEFAULT_SETTINGS: TenantSettings = {
  general: {
    parentPortalEnabled: true,
    attendanceVisibleToParents: true,
    gradesVisibleToParents: true,
    inquiryStaleHours: 48,
  },
  attendance: {
    allowTeacherAmendment: false,
    autoLockAfterDays: null,
    pendingAlertTimeHour: 14,
    workDays: [1, 2, 3, 4, 5],
    defaultPresentEnabled: false,
    notifyParentOnAbsence: false,
    patternDetection: {
      enabled: false,
      excessiveAbsenceThreshold: 5,
      excessiveAbsenceWindowDays: 14,
      recurringDayThreshold: 3,
      recurringDayWindowDays: 30,
      tardinessThreshold: 4,
      tardinessWindowDays: 14,
      parentNotificationMode: 'manual',
    },
  },
  gradebook: {
    defaultMissingGradePolicy: 'exclude',
    requireGradeComment: false,
    formativeWeightCap: null,
    formativeIncludedInPeriodGrade: true,
    gpaPrecision: 2,
    gpaScaleLabel: 'GPA',
    atRiskDetectionEnabled: false,
    atRiskDetectionFrequency: 'weekly',
    gradingConsistencyThreshold: 15,
    requireApprovalForMarkingSchemes: false,
  },
  admissions: {
    requireApprovalForAcceptance: true,
  },
  finance: {
    requireApprovalForInvoiceIssue: false,
    defaultPaymentTermDays: 30,
    allowPartialPayment: true,
  },
  communications: {
    primaryOutboundChannel: 'email',
    requireApprovalForAnnouncements: true,
  },
  payroll: {
    requireApprovalForNonPrincipal: true,
    defaultBonusMultiplier: 1.0,
    autoPopulateClassCounts: true,
  },
  scheduling: {
    teacherWeeklyMaxPeriods: null,
    autoSchedulerEnabled: true,
    requireApprovalForNonPrincipal: true,
    maxSolverDurationSeconds: 120,
    preferenceWeights: { low: 1, medium: 2, high: 3 },
    globalSoftWeights: {
      evenSubjectSpread: 2,
      minimiseTeacherGaps: 1,
      roomConsistency: 1,
      workloadBalance: 1,
    },
  },
  approvals: {
    expiryDays: 7,
    reminderAfterHours: 48,
  },
  compliance: {
    auditLogRetentionMonths: 36,
  },
  ai: {
    enabled: false,
    commentStyle: 'balanced',
    commentSampleReference: null,
    commentTargetWordCount: 100,
    aiProgressSummariesEnabled: false,
    aiGradingDailyLimit: 200,
  },
};

/* -------------------------------------------------------------------------- */
/*  Section Card Component                                                    */
/* -------------------------------------------------------------------------- */

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);

  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-6 py-4 text-start hover:bg-surface-secondary transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <span className="text-sm font-semibold text-text-primary">{title}</span>
          {description && (
            <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-text-tertiary shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-tertiary shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-6 py-5 space-y-4">{children}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row helpers                                                               */
/* -------------------------------------------------------------------------- */

function BooleanRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-text-tertiary">{description}</p>
        )}
      </div>
      <Switch id={id} checked={value} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

function NumberRow({
  label,
  description,
  value,
  onChange,
  min,
  max,
  nullable,
}: {
  label: string;
  description?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  nullable?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-text-tertiary">{description}</p>
        )}
      </div>
      <Input
        id={id}
        type="number"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (nullable && raw === '') {
            onChange(null);
          } else {
            const n = parseInt(raw, 10);
            if (!isNaN(n)) onChange(n);
          }
        }}
        min={min}
        max={max}
        className="w-full shrink-0 text-end sm:w-28"
        placeholder={nullable ? '—' : undefined}
      />
    </div>
  );
}

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-text-tertiary">{description}</p>
        )}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full shrink-0 sm:w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function TextRow({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = React.useId();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 flex-1 space-y-0.5">
        <Label htmlFor={id} className="text-sm text-text-primary">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-text-tertiary">{description}</p>
        )}
      </div>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full shrink-0 sm:w-56"
      />
    </div>
  );
}

function TextareaRow({
  label,
  description,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = React.useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-sm text-text-primary">
        {label}
      </Label>
      {description && (
        <p className="text-xs text-text-tertiary">{description}</p>
      )}
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="text-sm"
      />
    </div>
  );
}

function SubSectionCard({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <div className="rounded-xl border border-border bg-surface-secondary overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-start hover:bg-surface transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <span className="text-sm font-medium text-text-primary">{title}</span>
          {description && (
            <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
          )}
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-text-tertiary shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-tertiary shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-4 space-y-4">{children}</div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function GeneralSettingsPage() {
  const t = useTranslations('settings');

  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [warnings, setWarnings] = React.useState<string[]>([]);
  const [settings, setSettings] = React.useState<TenantSettings>(DEFAULT_SETTINGS);

  React.useEffect(() => {
    async function fetchSettings() {
      try {
        const data = await apiClient<TenantSettings | SettingsApiResponse>('/api/v1/settings');
        // Handle both wrapped and unwrapped response shapes
        const settingsData = ('data' in data && data.data) ? data.data : data as TenantSettings;
        // Deep merge: spread each section individually so nested defaults
        // (e.g. attendance.patternDetection) are preserved when the API
        // response doesn't include them yet.
        setSettings((prev) => {
          const merged = { ...prev } as unknown as Record<string, Record<string, unknown>>;
          const api = settingsData as unknown as Record<string, Record<string, unknown>>;
          for (const key of Object.keys(prev)) {
            const prevSection = merged[key];
            const apiSection = api[key];
            if (
              apiSection &&
              typeof apiSection === 'object' &&
              !Array.isArray(apiSection) &&
              typeof prevSection === 'object' &&
              prevSection !== null
            ) {
              // Two-level deep merge for nested objects (e.g. patternDetection)
              const mergedSection = { ...prevSection };
              for (const [sk, sv] of Object.entries(apiSection)) {
                if (
                  sv !== null &&
                  typeof sv === 'object' &&
                  !Array.isArray(sv) &&
                  typeof mergedSection[sk] === 'object' &&
                  mergedSection[sk] !== null
                ) {
                  mergedSection[sk] = { ...(mergedSection[sk] as Record<string, unknown>), ...(sv as Record<string, unknown>) };
                } else {
                  mergedSection[sk] = sv;
                }
              }
              merged[key] = mergedSection;
            } else if (apiSection !== undefined) {
              merged[key] = apiSection;
            }
          }
          return merged as unknown as TenantSettings;
        });
        if ('warnings' in data && Array.isArray(data.warnings)) {
          setWarnings(data.warnings);
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    }
    void fetchSettings();
  }, []);

  function updateSection<K extends SettingsSectionKey>(
    section: K,
    updates: Partial<TenantSettings[K]>,
  ) {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], ...updates },
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await apiClient<SettingsApiResponse | TenantSettings>(
        '/api/v1/settings',
        {
          method: 'PATCH',
          body: JSON.stringify(settings),
        },
      );
      if ('warnings' in result && Array.isArray(result.warnings)) {
        setWarnings(result.warnings);
      } else {
        setWarnings([]);
      }
      toast.success(t('settingsSaved'));
    } catch (err: unknown) {
      const errorObj = err as { error?: { message?: string } };
      toast.error(errorObj?.error?.message ?? t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('general')}</h2>
          <p className="mt-1 text-sm text-text-secondary">{t('generalDescription')}</p>
        </div>
        <Button type="submit" disabled={saving} className="w-full shrink-0 sm:w-auto">
          {saving ? t('saving') : t('saveChanges')}
        </Button>
      </div>

      {/* Cross-module warnings */}
      {warnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50 p-4">
          <p className="text-sm font-medium text-warning-800">{t('warningsTitle')}</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm text-warning-700">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {/* General */}
        <SectionCard title={t('sectionGeneral')} description={t('sectionGeneralDesc')}>
          <BooleanRow
            label={t('parentPortalEnabled')}
            value={settings.general.parentPortalEnabled}
            onChange={(v) => updateSection('general', { parentPortalEnabled: v })}
          />
          <BooleanRow
            label={t('attendanceVisibleToParents')}
            value={settings.general.attendanceVisibleToParents}
            onChange={(v) => updateSection('general', { attendanceVisibleToParents: v })}
          />
          <BooleanRow
            label={t('gradesVisibleToParents')}
            value={settings.general.gradesVisibleToParents}
            onChange={(v) => updateSection('general', { gradesVisibleToParents: v })}
          />
          <NumberRow
            label={t('inquiryStaleHours')}
            description={t('inquiryStaleHoursDesc')}
            value={settings.general.inquiryStaleHours}
            onChange={(v) => updateSection('general', { inquiryStaleHours: v ?? 48 })}
            min={1}
          />
        </SectionCard>

        {/* Attendance */}
        <SectionCard title={t('sectionAttendance')} description={t('sectionAttendanceDesc')}>
          <BooleanRow
            label={t('allowTeacherAmendment')}
            value={settings.attendance.allowTeacherAmendment}
            onChange={(v) => updateSection('attendance', { allowTeacherAmendment: v })}
          />
          <NumberRow
            label={t('autoLockAfterDays')}
            description={t('autoLockAfterDaysDesc')}
            value={settings.attendance.autoLockAfterDays}
            onChange={(v) => updateSection('attendance', { autoLockAfterDays: v })}
            min={1}
            nullable
          />
          <NumberRow
            label={t('pendingAlertTimeHour')}
            description={t('pendingAlertTimeHourDesc')}
            value={settings.attendance.pendingAlertTimeHour}
            onChange={(v) => updateSection('attendance', { pendingAlertTimeHour: v ?? 14 })}
            min={0}
            max={23}
          />
          <div className="space-y-2">
            <div className="space-y-0.5">
              <Label className="text-sm text-text-primary">{t('workDays')}</Label>
              <p className="text-xs text-text-tertiary">{t('workDaysDesc')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                { value: 0, label: t('sunday') },
                { value: 1, label: t('monday') },
                { value: 2, label: t('tuesday') },
                { value: 3, label: t('wednesday') },
                { value: 4, label: t('thursday') },
                { value: 5, label: t('friday') },
                { value: 6, label: t('saturday') },
              ] as const).map((day) => {
                const isActive = settings.attendance.workDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => {
                      const next = isActive
                        ? settings.attendance.workDays.filter((d) => d !== day.value)
                        : [...settings.attendance.workDays, day.value].sort();
                      updateSection('attendance', { workDays: next });
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
            value={settings.attendance.defaultPresentEnabled}
            onChange={(v) => updateSection('attendance', { defaultPresentEnabled: v })}
          />
          <BooleanRow
            label={t('notifyParentOnAbsence')}
            description={t('notifyParentOnAbsenceDescription')}
            value={settings.attendance.notifyParentOnAbsence}
            onChange={(v) => updateSection('attendance', { notifyParentOnAbsence: v })}
          />
          <SubSectionCard
            title={t('patternDetection')}
            description={t('patternDetectionDescription')}
          >
            <BooleanRow
              label={t('patternEnabled')}
              value={settings.attendance.patternDetection.enabled}
              onChange={(v) =>
                updateSection('attendance', {
                  patternDetection: { ...settings.attendance.patternDetection, enabled: v },
                })
              }
            />
            {settings.attendance.patternDetection.enabled && (
              <>
                <NumberRow
                  label={t('excessiveAbsenceThreshold')}
                  value={settings.attendance.patternDetection.excessiveAbsenceThreshold}
                  onChange={(v) =>
                    updateSection('attendance', {
                      patternDetection: {
                        ...settings.attendance.patternDetection,
                        excessiveAbsenceThreshold: v ?? 5,
                      },
                    })
                  }
                  min={1}
                />
                <NumberRow
                  label={t('excessiveAbsenceWindowDays')}
                  value={settings.attendance.patternDetection.excessiveAbsenceWindowDays}
                  onChange={(v) =>
                    updateSection('attendance', {
                      patternDetection: {
                        ...settings.attendance.patternDetection,
                        excessiveAbsenceWindowDays: v ?? 14,
                      },
                    })
                  }
                  min={1}
                />
                <NumberRow
                  label={t('recurringDayThreshold')}
                  value={settings.attendance.patternDetection.recurringDayThreshold}
                  onChange={(v) =>
                    updateSection('attendance', {
                      patternDetection: {
                        ...settings.attendance.patternDetection,
                        recurringDayThreshold: v ?? 3,
                      },
                    })
                  }
                  min={1}
                />
                <NumberRow
                  label={t('recurringDayWindowDays')}
                  value={settings.attendance.patternDetection.recurringDayWindowDays}
                  onChange={(v) =>
                    updateSection('attendance', {
                      patternDetection: {
                        ...settings.attendance.patternDetection,
                        recurringDayWindowDays: v ?? 30,
                      },
                    })
                  }
                  min={1}
                />
                <NumberRow
                  label={t('tardinessThreshold')}
                  value={settings.attendance.patternDetection.tardinessThreshold}
                  onChange={(v) =>
                    updateSection('attendance', {
                      patternDetection: {
                        ...settings.attendance.patternDetection,
                        tardinessThreshold: v ?? 4,
                      },
                    })
                  }
                  min={1}
                />
                <NumberRow
                  label={t('tardinessWindowDays')}
                  value={settings.attendance.patternDetection.tardinessWindowDays}
                  onChange={(v) =>
                    updateSection('attendance', {
                      patternDetection: {
                        ...settings.attendance.patternDetection,
                        tardinessWindowDays: v ?? 14,
                      },
                    })
                  }
                  min={1}
                />
                <div className="space-y-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm text-text-primary">
                      {t('parentNotificationMode')}
                    </Label>
                  </div>
                  <RadioGroup
                    value={settings.attendance.patternDetection.parentNotificationMode}
                    onValueChange={(v) =>
                      updateSection('attendance', {
                        patternDetection: {
                          ...settings.attendance.patternDetection,
                          parentNotificationMode: v as 'auto' | 'manual',
                        },
                      })
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

        {/* Gradebook */}
        <SectionCard title={t('sectionGradebook')} description={t('sectionGradebookDesc')}>
          <SelectRow
            label={t('defaultMissingGradePolicy')}
            value={settings.gradebook.defaultMissingGradePolicy}
            options={[
              { value: 'exclude', label: t('policyExclude') },
              { value: 'zero', label: t('policyZero') },
            ]}
            onChange={(v) =>
              updateSection('gradebook', {
                defaultMissingGradePolicy: v as 'exclude' | 'zero',
              })
            }
          />
          <BooleanRow
            label={t('requireGradeComment')}
            value={settings.gradebook.requireGradeComment}
            onChange={(v) => updateSection('gradebook', { requireGradeComment: v })}
          />
          <NumberRow
            label={t('formativeWeightCap')}
            description={t('formativeWeightCapDesc')}
            value={settings.gradebook.formativeWeightCap}
            onChange={(v) => updateSection('gradebook', { formativeWeightCap: v })}
            min={0}
            max={100}
            nullable
          />
          <BooleanRow
            label={t('formativeIncludedInPeriodGrade')}
            description={t('formativeIncludedInPeriodGradeDesc')}
            value={settings.gradebook.formativeIncludedInPeriodGrade}
            onChange={(v) => updateSection('gradebook', { formativeIncludedInPeriodGrade: v })}
          />
          <SelectRow
            label={t('gpaPrecision')}
            description={t('gpaPrecisionDesc')}
            value={String(settings.gradebook.gpaPrecision)}
            options={[
              { value: '1', label: t('gpaPrecision1') },
              { value: '2', label: t('gpaPrecision2') },
            ]}
            onChange={(v) =>
              updateSection('gradebook', { gpaPrecision: Number(v) as 1 | 2 })
            }
          />
          <TextRow
            label={t('gpaScaleLabel')}
            description={t('gpaScaleLabelDesc')}
            value={settings.gradebook.gpaScaleLabel}
            onChange={(v) => updateSection('gradebook', { gpaScaleLabel: v })}
            placeholder="GPA"
          />
          <SubSectionCard
            title={t('atRiskDetection')}
            description={t('atRiskDetectionDesc')}
          >
            <BooleanRow
              label={t('atRiskDetectionEnabled')}
              value={settings.gradebook.atRiskDetectionEnabled}
              onChange={(v) => updateSection('gradebook', { atRiskDetectionEnabled: v })}
            />
            {settings.gradebook.atRiskDetectionEnabled && (
              <>
                <SelectRow
                  label={t('atRiskDetectionFrequency')}
                  value={settings.gradebook.atRiskDetectionFrequency}
                  options={[
                    { value: 'daily', label: t('frequencyDaily') },
                    { value: 'weekly', label: t('frequencyWeekly') },
                  ]}
                  onChange={(v) =>
                    updateSection('gradebook', {
                      atRiskDetectionFrequency: v as 'daily' | 'weekly',
                    })
                  }
                />
                <NumberRow
                  label={t('gradingConsistencyThreshold')}
                  description={t('gradingConsistencyThresholdDesc')}
                  value={settings.gradebook.gradingConsistencyThreshold}
                  onChange={(v) =>
                    updateSection('gradebook', { gradingConsistencyThreshold: v ?? 15 })
                  }
                  min={1}
                  max={100}
                />
                <BooleanRow
                  label={t('requireApprovalForMarkingSchemes')}
                  description={t('requireApprovalForMarkingSchemesDesc')}
                  value={settings.gradebook.requireApprovalForMarkingSchemes}
                  onChange={(v) =>
                    updateSection('gradebook', { requireApprovalForMarkingSchemes: v })
                  }
                />
              </>
            )}
          </SubSectionCard>
        </SectionCard>

        {/* Admissions */}
        <SectionCard title={t('sectionAdmissions')} description={t('sectionAdmissionsDesc')}>
          <BooleanRow
            label={t('requireApprovalForAcceptance')}
            value={settings.admissions.requireApprovalForAcceptance}
            onChange={(v) =>
              updateSection('admissions', { requireApprovalForAcceptance: v })
            }
          />
        </SectionCard>

        {/* Finance */}
        <SectionCard title={t('sectionFinance')} description={t('sectionFinanceDesc')}>
          <BooleanRow
            label={t('requireApprovalForInvoiceIssue')}
            value={settings.finance.requireApprovalForInvoiceIssue}
            onChange={(v) =>
              updateSection('finance', { requireApprovalForInvoiceIssue: v })
            }
          />
          <NumberRow
            label={t('defaultPaymentTermDays')}
            description={t('defaultPaymentTermDaysDesc')}
            value={settings.finance.defaultPaymentTermDays}
            onChange={(v) => updateSection('finance', { defaultPaymentTermDays: v ?? 30 })}
            min={0}
          />
          <BooleanRow
            label={t('allowPartialPayment')}
            value={settings.finance.allowPartialPayment}
            onChange={(v) => updateSection('finance', { allowPartialPayment: v })}
          />
        </SectionCard>

        {/* Communications */}
        <SectionCard
          title={t('sectionCommunications')}
          description={t('sectionCommunicationsDesc')}
        >
          <SelectRow
            label={t('primaryOutboundChannel')}
            value={settings.communications.primaryOutboundChannel}
            options={[
              { value: 'email', label: t('channelEmail') },
              { value: 'whatsapp', label: t('channelWhatsApp') },
            ]}
            onChange={(v) =>
              updateSection('communications', {
                primaryOutboundChannel: v as 'email' | 'whatsapp',
              })
            }
          />
          <BooleanRow
            label={t('requireApprovalForAnnouncements')}
            value={settings.communications.requireApprovalForAnnouncements}
            onChange={(v) =>
              updateSection('communications', { requireApprovalForAnnouncements: v })
            }
          />
        </SectionCard>

        {/* Payroll */}
        <SectionCard title={t('sectionPayroll')} description={t('sectionPayrollDesc')}>
          <BooleanRow
            label={t('payrollRequireApproval')}
            value={settings.payroll.requireApprovalForNonPrincipal}
            onChange={(v) =>
              updateSection('payroll', { requireApprovalForNonPrincipal: v })
            }
          />
          <NumberRow
            label={t('defaultBonusMultiplier')}
            description={t('defaultBonusMultiplierDesc')}
            value={settings.payroll.defaultBonusMultiplier}
            onChange={(v) => updateSection('payroll', { defaultBonusMultiplier: v ?? 1.0 })}
            min={0}
          />
          <BooleanRow
            label={t('autoPopulateClassCounts')}
            value={settings.payroll.autoPopulateClassCounts}
            onChange={(v) => updateSection('payroll', { autoPopulateClassCounts: v })}
          />
        </SectionCard>

        {/* Scheduling */}
        <SectionCard title={t('sectionScheduling')} description={t('sectionSchedulingDesc')}>
          <BooleanRow
            label={t('autoSchedulerEnabled')}
            value={settings.scheduling.autoSchedulerEnabled}
            onChange={(v) => updateSection('scheduling', { autoSchedulerEnabled: v })}
          />
          <BooleanRow
            label={t('schedulingRequireApproval')}
            value={settings.scheduling.requireApprovalForNonPrincipal}
            onChange={(v) =>
              updateSection('scheduling', { requireApprovalForNonPrincipal: v })
            }
          />
          <NumberRow
            label={t('teacherWeeklyMaxPeriods')}
            description={t('teacherWeeklyMaxPeriodsDesc')}
            value={settings.scheduling.teacherWeeklyMaxPeriods}
            onChange={(v) => updateSection('scheduling', { teacherWeeklyMaxPeriods: v })}
            min={1}
            nullable
          />
          <NumberRow
            label={t('maxSolverDurationSeconds')}
            description={t('maxSolverDurationSecondsDesc')}
            value={settings.scheduling.maxSolverDurationSeconds}
            onChange={(v) =>
              updateSection('scheduling', { maxSolverDurationSeconds: v ?? 120 })
            }
            min={1}
          />
        </SectionCard>

        {/* Approvals */}
        <SectionCard title={t('sectionApprovals')} description={t('sectionApprovalsDesc')}>
          <NumberRow
            label={t('approvalsExpiryDays')}
            description={t('approvalsExpiryDaysDesc')}
            value={settings.approvals.expiryDays}
            onChange={(v) => updateSection('approvals', { expiryDays: v ?? 7 })}
            min={1}
          />
          <NumberRow
            label={t('approvalsReminderAfterHours')}
            description={t('approvalsReminderAfterHoursDesc')}
            value={settings.approvals.reminderAfterHours}
            onChange={(v) => updateSection('approvals', { reminderAfterHours: v ?? 48 })}
            min={1}
          />
        </SectionCard>

        {/* Compliance */}
        <SectionCard title={t('sectionCompliance')} description={t('sectionComplianceDesc')}>
          <NumberRow
            label={t('auditLogRetentionMonths')}
            description={t('auditLogRetentionMonthsDesc')}
            value={settings.compliance.auditLogRetentionMonths}
            onChange={(v) => updateSection('compliance', { auditLogRetentionMonths: v ?? 36 })}
            min={1}
          />
        </SectionCard>

        {/* AI Functions */}
        <SectionCard title={t('aiTitle')} description={t('aiDescription')}>
          <BooleanRow
            label={t('aiEnabled')}
            description={t('aiEnabledDescription')}
            value={settings.ai.enabled}
            onChange={(v) => updateSection('ai', { enabled: v })}
          />
          {settings.ai.enabled && (
            <>
              <SelectRow
                label={t('aiCommentStyle')}
                description={t('aiCommentStyleDesc')}
                value={settings.ai.commentStyle}
                options={[
                  { value: 'formal', label: t('aiCommentStyleFormal') },
                  { value: 'warm', label: t('aiCommentStyleWarm') },
                  { value: 'balanced', label: t('aiCommentStyleBalanced') },
                ]}
                onChange={(v) =>
                  updateSection('ai', {
                    commentStyle: v as 'formal' | 'warm' | 'balanced',
                  })
                }
              />
              <TextareaRow
                label={t('aiCommentSampleReference')}
                description={t('aiCommentSampleReferenceDesc')}
                value={settings.ai.commentSampleReference ?? ''}
                onChange={(v) =>
                  updateSection('ai', { commentSampleReference: v || null })
                }
                placeholder={t('aiCommentSampleReferencePlaceholder')}
              />
              <NumberRow
                label={t('aiCommentTargetWordCount')}
                description={t('aiCommentTargetWordCountDesc')}
                value={settings.ai.commentTargetWordCount}
                onChange={(v) => updateSection('ai', { commentTargetWordCount: v ?? 100 })}
                min={20}
                max={500}
              />
              <BooleanRow
                label={t('aiProgressSummariesEnabled')}
                description={t('aiProgressSummariesEnabledDesc')}
                value={settings.ai.aiProgressSummariesEnabled}
                onChange={(v) => updateSection('ai', { aiProgressSummariesEnabled: v })}
              />
              <NumberRow
                label={t('aiGradingDailyLimit')}
                description={t('aiGradingDailyLimitDesc')}
                value={settings.ai.aiGradingDailyLimit}
                onChange={(v) => updateSection('ai', { aiGradingDailyLimit: v ?? 200 })}
                min={1}
              />
            </>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  );
}
