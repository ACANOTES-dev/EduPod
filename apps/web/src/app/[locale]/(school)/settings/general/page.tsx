'use client';

import { Button, toast } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

import { AiSection } from './_components/ai-section';
import { AttendanceSection } from './_components/attendance-section';
import { GradebookSection } from './_components/gradebook-section';
import { ReportCardsSection } from './_components/report-cards-section';
import {
  DEFAULT_SETTINGS,
  SettingsApiResponse,
  SettingsSectionKey,
  TenantSettings,
} from './_components/settings-types';
import { BooleanRow, NumberRow, SectionCard, SelectRow } from './_components/settings-ui';

// ─── Page ─────────────────────────────────────────────────────────────────────

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
        const settingsData =
          'data' in data && data.data ? data.data : (data as TenantSettings);
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
                  mergedSection[sk] = {
                    ...(mergedSection[sk] as Record<string, unknown>),
                    ...(sv as Record<string, unknown>),
                  };
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
      const result = await apiClient<SettingsApiResponse | TenantSettings>('/api/v1/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
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
        <AttendanceSection
          settings={settings.attendance}
          onChange={(updates) => updateSection('attendance', updates)}
        />

        {/* Gradebook */}
        <GradebookSection
          settings={settings.gradebook}
          onChange={(updates) => updateSection('gradebook', updates)}
        />

        {/* Admissions */}
        <SectionCard title={t('sectionAdmissions')} description={t('sectionAdmissionsDesc')}>
          <BooleanRow
            label={t('requireApprovalForAcceptance')}
            value={settings.admissions.requireApprovalForAcceptance}
            onChange={(v) => updateSection('admissions', { requireApprovalForAcceptance: v })}
          />
        </SectionCard>

        {/* Finance */}
        <SectionCard title={t('sectionFinance')} description={t('sectionFinanceDesc')}>
          <BooleanRow
            label={t('requireApprovalForInvoiceIssue')}
            value={settings.finance.requireApprovalForInvoiceIssue}
            onChange={(v) => updateSection('finance', { requireApprovalForInvoiceIssue: v })}
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
            onChange={(v) => updateSection('payroll', { requireApprovalForNonPrincipal: v })}
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
            onChange={(v) =>
              updateSection('compliance', { auditLogRetentionMonths: v ?? 36 })
            }
            min={1}
          />
        </SectionCard>

        {/* AI Functions */}
        <AiSection
          settings={settings.ai}
          onChange={(updates) => updateSection('ai', updates)}
        />

        {/* Report Cards */}
        <ReportCardsSection
          settings={settings.reportCards}
          onChange={(updates) => updateSection('reportCards', updates)}
        />
      </div>

      <div className="mt-6 flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  );
}
