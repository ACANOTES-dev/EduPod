'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Calendar, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  REPORTS_DEFAULT_EXPORT_FORMATS,
  REPORTS_SHARE_SNAPSHOT_RETENTION_DAYS,
  reportsDefaultsSchema,
  type ReportsDefaultExportFormat,
  type ReportsDefaultsDto,
  type ReportsDefaultShareVisibility,
  type ReportsSettingsResponse,
} from '@school/shared/reports';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

import { buildDefaultsFormValues } from './reports-settings.helpers';

// Curated timezone list for the schedule dropdown. Matches the locales the
// product supports plus the most common school operating regions. Backend
// accepts any non-empty IANA identifier.
const TIMEZONES = [
  'Europe/Dublin',
  'Europe/London',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Africa/Cairo',
  'Asia/Karachi',
  'Asia/Singapore',
  'America/New_York',
] as const;

/**
 * Defaults tab — react-hook-form + zodResolver, three Select fields plus
 * a read-only snapshot retention info card. The Save button is enabled
 * only when the form is dirty.
 */
export function DefaultsTab({
  settings,
  onSaved,
}: {
  settings: ReportsSettingsResponse;
  onSaved: (updated: ReportsDefaultsDto) => void;
}) {
  const t = useTranslations('reportsSettings');
  const [saving, setSaving] = React.useState(false);
  const form = useForm<ReportsDefaultsDto>({
    resolver: zodResolver(reportsDefaultsSchema),
    defaultValues: buildDefaultsFormValues(settings),
  });

  // Reset form whenever the loaded settings change (e.g., after an
  // optimistic update from another tab).
  React.useEffect(() => {
    form.reset(buildDefaultsFormValues(settings));
  }, [form, settings]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const res = await apiClient<{ data: ReportsDefaultsDto }>(
        '/api/v1/reports/settings/defaults',
        {
          method: 'PUT',
          body: JSON.stringify(values),
        },
      );
      const data = unwrap(res);
      onSaved(data);
      form.reset(data);
      toast.success(t('defaults.toastSaved'));
    } catch (err) {
      console.error('[ReportsSettingsPage.DefaultsTab.onSubmit]', err);
      const errMsg = (err as { error?: { message?: string } }).error?.message;
      toast.error(errMsg ?? t('defaults.toastFailed'));
    } finally {
      setSaving(false);
    }
  });

  const isDirty = form.formState.isDirty;

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 sm:p-6"
    >
      {/* Default export format */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="default_export_format">{t('defaults.exportFormatLabel')}</Label>
        <Controller
          control={form.control}
          name="default_export_format"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => field.onChange(value as ReportsDefaultExportFormat)}
            >
              <SelectTrigger
                id="default_export_format"
                data-testid="defaults-export-format-trigger"
                className="w-full sm:w-72"
              >
                <SelectValue placeholder={t('defaults.exportFormatPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {REPORTS_DEFAULT_EXPORT_FORMATS.map((fmt) => (
                  <SelectItem key={fmt} value={fmt}>
                    {t(`defaults.exportFormatOption.${fmt}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-text-tertiary">{t('defaults.exportFormatHelp')}</p>
      </div>

      {/* Default schedule timezone */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="default_schedule_timezone">
          {t('defaults.scheduleTimezoneLabel')}
        </Label>
        <Controller
          control={form.control}
          name="default_schedule_timezone"
          render={({ field }) => (
            <Select value={field.value} onValueChange={(value) => field.onChange(value)}>
              <SelectTrigger
                id="default_schedule_timezone"
                data-testid="defaults-timezone-trigger"
                className="w-full sm:w-72"
              >
                <SelectValue
                  placeholder={t('defaults.scheduleTimezonePlaceholder')}
                />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-text-tertiary">{t('defaults.scheduleTimezoneHelp')}</p>
      </div>

      {/* Default share visibility */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="default_share_visibility">
          {t('defaults.shareVisibilityLabel')}
        </Label>
        <Controller
          control={form.control}
          name="default_share_visibility"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={(value) => field.onChange(value as ReportsDefaultShareVisibility)}
            >
              <SelectTrigger
                id="default_share_visibility"
                data-testid="defaults-share-visibility-trigger"
                className="w-full sm:w-72"
              >
                <SelectValue placeholder={t('defaults.shareVisibilityPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">
                  {t('defaults.shareVisibilityOption.private')}
                </SelectItem>
                <SelectItem value="shared">
                  {t('defaults.shareVisibilityOption.shared')}
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-text-tertiary">{t('defaults.shareVisibilityHelp')}</p>
      </div>

      {/* Snapshot retention (read-only) */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-surface-secondary p-4">
        <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-text-tertiary" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-text-primary">
            {t('defaults.snapshotRetentionLabel')}
          </p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {t('defaults.snapshotRetentionDesc', {
              days: REPORTS_SHARE_SNAPSHOT_RETENTION_DAYS,
            })}
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button
          type="submit"
          disabled={saving || !isDirty}
          data-testid="defaults-save-button"
        >
          {saving ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('defaults.saving')}
            </>
          ) : (
            t('defaults.save')
          )}
        </Button>
      </div>
    </form>
  );
}
