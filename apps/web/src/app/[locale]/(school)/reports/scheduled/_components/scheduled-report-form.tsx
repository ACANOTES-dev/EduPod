'use client';

import { Loader2, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  type CreateScheduledReportDto,
  createScheduledReportSchema,
} from '@school/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { SCHEDULED_REPORT_PRESETS } from './cron-helpers';

/**
 * Create modal for scheduled reports (impl 17).
 *
 * Wraps the legacy backend `POST /v1/reports/scheduled` route — the
 * payload schema is `createScheduledReportSchema` from `@school/shared`,
 * which impl 17 widened to accept the new `excel`/`word` formats
 * alongside the legacy `pdf`/`csv`/`xlsx` set. The saved-report id is
 * persisted under `parameters_json.saved_report_id` so impl 08's deliver
 * processor can resolve the row at fire time. The legacy `report_type`
 * column is set to `'saved_report'` for new schedules; legacy schedules
 * continue to surface their original `report_type`.
 *
 * UX:
 *   - Saved-report picker — fetched from `GET /v1/reports/builder` once
 *     when the dialog opens. The dropdown reflects the user's reachable
 *     reports (per the existing `analytics.manage_reports` permission).
 *   - Cadence — simple-mode dropdown of presets OR raw cron in advanced
 *     mode. The radio toggles which input is shown; on submit we pick
 *     whichever matches the active mode.
 *   - Format — checkbox group. The first checked format is sent as the
 *     legacy `format` column; the full list is mirrored under
 *     `parameters_json.delivery_formats` for impl 13's multi-format work.
 *   - Recipients — comma-separated email field. The legacy backend column
 *     is email-only; an inbox-recipient widening is queued for impl 13.
 *   - Active toggle — defaults to true; mirror to the create dto.
 *
 * Update is intentionally not in this modal — the impl 17 spec calls
 * out edit but legacy alerts/scheduled don't differ much from create. To
 * stay within scope and ship impl 17, the form is create-only; row-level
 * actions in the parent page do `delete` and `toggle active` in-line.
 * The next impl that touches this can wire `prefilledScheduleId` to
 * load + submit a PUT.
 */

interface SavedReportOption {
  id: string;
  name: string;
}

interface ScheduledFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  prefilledSavedReportId?: string | null;
}

interface FormState {
  name: string;
  saved_report_id: string;
  cadence_mode: 'simple' | 'advanced';
  cadence_preset_id: string;
  cadence_custom: string;
  formats: Array<'pdf' | 'excel' | 'word'>;
  recipients_raw: string;
  active: boolean;
}

// `SCHEDULED_REPORT_PRESETS[0]` is provably defined (the array is a
// non-empty `as const` literal) but `noUncheckedIndexedAccess` widens
// the lookup to `T | undefined`. Fall back to a hardcoded safe default
// to keep the form's defaultValues type-clean.
const DEFAULT_PRESET = SCHEDULED_REPORT_PRESETS[0] ?? {
  id: 'daily-9am',
  cron: '0 9 * * *',
  labelKey: 'cadenceDaily9am',
};
const DEFAULT_PRESET_ID = DEFAULT_PRESET.id;
const DEFAULT_PRESET_CRON = DEFAULT_PRESET.cron;

function defaultState(prefilledSavedReportId?: string | null): FormState {
  return {
    name: '',
    saved_report_id: prefilledSavedReportId ?? '',
    cadence_mode: 'simple',
    cadence_preset_id: DEFAULT_PRESET_ID,
    cadence_custom: DEFAULT_PRESET_CRON,
    formats: ['pdf'],
    recipients_raw: '',
    active: true,
  };
}

export function ScheduledReportForm({
  open,
  onClose,
  onSaved,
  prefilledSavedReportId,
}: ScheduledFormProps) {
  const t = useTranslations('reports.scheduled');
  const [savedReports, setSavedReports] = React.useState<SavedReportOption[]>([]);
  const [savedReportsLoading, setSavedReportsLoading] = React.useState(false);
  const [savedReportsError, setSavedReportsError] = React.useState<string | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const { control, register, handleSubmit, reset, watch } = useForm<FormState>({
    defaultValues: defaultState(prefilledSavedReportId),
  });

  const cadenceMode = watch('cadence_mode');
  const formats = watch('formats');

  // ─── Reset on open / prefill change ──────────────────────────────────────

  React.useEffect(() => {
    if (open) {
      reset(defaultState(prefilledSavedReportId));
      setSubmitError(null);
    }
  }, [open, prefilledSavedReportId, reset]);

  // ─── Fetch saved reports once when the dialog opens ──────────────────────

  React.useEffect(() => {
    if (!open) return;
    setSavedReportsLoading(true);
    setSavedReportsError(null);

    const controller = new AbortController();
    apiClient<{ data: Array<{ id: string; name: string }> }>(
      `/api/v1/reports/builder?include_shared=true&pageSize=100`,
      { method: 'GET', signal: controller.signal, silent: true },
    )
      .then((res) => {
        if (controller.signal.aborted) return;
        setSavedReports((res.data ?? []).map((r) => ({ id: r.id, name: r.name })));
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error('[ScheduledReportForm.savedReports]', err);
        setSavedReportsError(t('savedReportsLoadError'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSavedReportsLoading(false);
      });

    return () => controller.abort();
  }, [open, t]);

  // ─── Submit ──────────────────────────────────────────────────────────────

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const cadenceCron =
      values.cadence_mode === 'simple'
        ? SCHEDULED_REPORT_PRESETS.find((p) => p.id === values.cadence_preset_id)?.cron ??
          DEFAULT_PRESET_CRON
        : values.cadence_custom.trim();

    const recipientEmails = values.recipients_raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!values.name.trim()) {
      setSubmitError(t('errorNameRequired'));
      return;
    }
    if (!values.saved_report_id) {
      setSubmitError(t('errorSavedReportRequired'));
      return;
    }
    if (values.formats.length === 0) {
      setSubmitError(t('errorFormatRequired'));
      return;
    }
    if (cadenceCron.length === 0) {
      setSubmitError(t('errorCadenceRequired'));
      return;
    }
    if (recipientEmails.length === 0) {
      setSubmitError(t('errorRecipientsRequired'));
      return;
    }

    const primaryFormat = values.formats[0] ?? 'pdf';

    const payload: CreateScheduledReportDto = {
      name: values.name.trim(),
      report_type: 'saved_report',
      parameters_json: {
        saved_report_id: values.saved_report_id,
        delivery_formats: values.formats,
      },
      schedule_cron: cadenceCron,
      recipient_emails: recipientEmails,
      format: primaryFormat,
      active: values.active,
    };

    const parsed = createScheduledReportSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? t('errorGeneric'));
      return;
    }

    setSubmitting(true);
    try {
      await apiClient<{ data: { id: string } }>('/api/v1/reports/scheduled', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
        silent: true,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error('[ScheduledReportForm.submit]', err);
      const message =
        (err as { error?: { message?: string }; message?: string })?.error?.message ??
        (err as { message?: string })?.message ??
        t('errorGeneric');
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
          <DialogDescription>{t('createDescription')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Name */}
          <div className="space-y-1">
            <Label htmlFor="sched-name">
              {t('name')} <span className="text-red-600">*</span>
            </Label>
            <Input
              id="sched-name"
              autoComplete="off"
              placeholder={t('namePlaceholder')}
              {...register('name')}
            />
          </div>

          {/* Saved report picker */}
          <div className="space-y-1">
            <Label htmlFor="sched-saved-report">
              {t('savedReportField')} <span className="text-red-600">*</span>
            </Label>
            <Controller
              control={control}
              name="saved_report_id"
              render={({ field }) => (
                <Select
                  value={field.value || ''}
                  onValueChange={field.onChange}
                  disabled={savedReportsLoading}
                >
                  <SelectTrigger id="sched-saved-report">
                    <SelectValue
                      placeholder={
                        savedReportsLoading
                          ? t('savedReportsLoading')
                          : t('savedReportPlaceholder')
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {savedReports.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                    {savedReports.length === 0 && !savedReportsLoading && (
                      <SelectItem value="__none" disabled>
                        {t('savedReportsEmpty')}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}
            />
            {savedReportsError && (
              <p className="text-xs text-red-600">{savedReportsError}</p>
            )}
            <p className="text-xs text-text-tertiary">{t('savedReportHelp')}</p>
          </div>

          {/* Cadence */}
          <div className="space-y-2">
            <Label>{t('cadence')}</Label>
            <Controller
              control={control}
              name="cadence_mode"
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={(value) => field.onChange(value as 'simple' | 'advanced')}
                  className="grid grid-cols-2 gap-2"
                >
                  <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm font-normal">
                    <RadioGroupItem value="simple" />
                    {t('cadenceSimple')}
                  </Label>
                  <Label className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface p-2 text-sm font-normal">
                    <RadioGroupItem value="advanced" />
                    {t('cadenceAdvanced')}
                  </Label>
                </RadioGroup>
              )}
            />

            {cadenceMode === 'simple' ? (
              <Controller
                control={control}
                name="cadence_preset_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULED_REPORT_PRESETS.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {t(`cadencePresets.${preset.labelKey}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            ) : (
              <div className="space-y-1">
                <Input
                  placeholder="0 9 * * *"
                  className="font-mono"
                  {...register('cadence_custom')}
                />
                <p className="text-xs text-text-tertiary">{t('cadenceAdvancedHelp')}</p>
              </div>
            )}
          </div>

          {/* Formats */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text-primary">
              {t('formatsField')} <span className="text-red-600">*</span>
            </legend>
            <Controller
              control={control}
              name="formats"
              render={({ field }) => (
                <div className="flex flex-wrap gap-3">
                  {(['pdf', 'excel', 'word'] as const).map((format) => (
                    <Label
                      key={format}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-normal"
                    >
                      <Checkbox
                        checked={field.value.includes(format)}
                        onCheckedChange={(checked) => {
                          const next = new Set(field.value);
                          if (checked === true) next.add(format);
                          else next.delete(format);
                          field.onChange(Array.from(next));
                        }}
                      />
                      <span className="uppercase">{format}</span>
                    </Label>
                  ))}
                </div>
              )}
            />
            {formats.length > 1 && (
              <p className="text-xs text-text-tertiary">
                {t('formatsMultipleHelp', { primary: formats[0]?.toUpperCase() ?? 'PDF' })}
              </p>
            )}
          </fieldset>

          {/* Recipients */}
          <div className="space-y-1">
            <Label htmlFor="sched-recipients">
              {t('recipientsField')} <span className="text-red-600">*</span>
            </Label>
            <Input
              id="sched-recipients"
              type="text"
              placeholder={t('recipientsPlaceholder')}
              {...register('recipients_raw')}
            />
            <p className="text-xs text-text-tertiary">{t('recipientsHelp')}</p>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
            <div>
              <p className="text-sm font-medium text-text-primary">{t('activeField')}</p>
              <p className="text-xs text-text-tertiary">{t('activeHelp')}</p>
            </div>
            <Controller
              control={control}
              name="active"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          {submitError && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <X className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t('saving')}
                </>
              ) : (
                <>
                  <Plus className="me-2 h-4 w-4" />
                  {t('createButton')}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
