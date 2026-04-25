'use client';

import { Loader2, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  type CreateReportAlertDto,
  createReportAlertSchema,
  type ReportAlertMetric,
  type ReportAlertOperator,
} from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

/**
 * Create modal for report alerts (impl 17).
 *
 * Wraps the legacy backend `POST /v1/reports/alerts` route. Impl 17
 * widens both `metric` (legacy 6 + new 8) and `operator` (legacy 3 + new
 * 3) so this form can surface the full new metric registry without
 * breaking pre-rebuild alerts. The legacy worker (`checkThresholds()`)
 * still routes most metrics through the unified dashboard; impl 09's
 * dedicated worker (`reports:alert-evaluate`) covers the new keys via
 * its own metric-registry implementation.
 *
 * UX:
 *   - Metric — dropdown of the 8 new keys + the 6 legacy keys grouped at
 *     the bottom. A grouped Select keeps the new keys visually primary
 *     for new alerts while preserving full editability for legacy rows.
 *   - Operator — full 6-operator set: <, ≤, >, ≥, =, ≠.
 *   - Threshold — number input. The metric type currently doesn't drive
 *     the input semantics (percent vs count); a future enhancement can
 *     attach a metric-type registry. For now the placeholder hints at
 *     the unit ("e.g. 80 (percent)" or "e.g. 5 (count)").
 *   - Recipients — comma-separated email field today. The legacy column
 *     is `notification_recipients_json` (array of emails). When impl 13
 *     widens to user ids the inbox audience picker can drop in.
 *   - Active toggle — defaults to true.
 *
 * Impl 17 is create-only; row-level toggle/delete on the parent page
 * cover the common edit cases. A later UI iteration can add full
 * edit-in-modal.
 */

interface AlertFormProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface MetricOption {
  value: ReportAlertMetric;
  labelKey: string;
  group: 'new' | 'legacy';
}

const METRIC_OPTIONS: MetricOption[] = [
  // ─── Impl 09 + impl 17 — the new 8-key metric registry ─────────────
  { value: 'overdue_invoices_count', labelKey: 'overdue_invoices_count', group: 'new' },
  { value: 'attendance_rate_today', labelKey: 'attendance_rate_today', group: 'new' },
  {
    value: 'open_safeguarding_concerns_count',
    labelKey: 'open_safeguarding_concerns_count',
    group: 'new',
  },
  { value: 'at_risk_students_count', labelKey: 'at_risk_students_count', group: 'new' },
  { value: 'unpaid_balance_total', labelKey: 'unpaid_balance_total', group: 'new' },
  { value: 'behaviour_incidents_week', labelKey: 'behaviour_incidents_week', group: 'new' },
  {
    value: 'teacher_submission_compliance_week',
    labelKey: 'teacher_submission_compliance_week',
    group: 'new',
  },
  { value: 'cover_gaps_week', labelKey: 'cover_gaps_week', group: 'new' },
  // ─── Legacy keys (kept editable) ────────────────────────────────────
  { value: 'attendance_rate', labelKey: 'attendance_rate', group: 'legacy' },
  { value: 'collection_rate', labelKey: 'collection_rate', group: 'legacy' },
  { value: 'overdue_invoice_count', labelKey: 'overdue_invoice_count', group: 'legacy' },
  { value: 'at_risk_student_count', labelKey: 'at_risk_student_count', group: 'legacy' },
  { value: 'average_grade', labelKey: 'average_grade', group: 'legacy' },
  { value: 'staff_absence_rate', labelKey: 'staff_absence_rate', group: 'legacy' },
];

const OPERATORS: Array<{ value: ReportAlertOperator; symbol: string; labelKey: string }> = [
  { value: 'lt', symbol: '<', labelKey: 'lt' },
  { value: 'lte', symbol: '≤', labelKey: 'lte' },
  { value: 'gt', symbol: '>', labelKey: 'gt' },
  { value: 'gte', symbol: '≥', labelKey: 'gte' },
  { value: 'eq', symbol: '=', labelKey: 'eq' },
  { value: 'ne', symbol: '≠', labelKey: 'ne' },
];

interface FormState {
  name: string;
  metric: ReportAlertMetric | '';
  operator: ReportAlertOperator;
  threshold: string; // string in form, coerced to number on submit
  check_frequency: 'daily' | 'weekly';
  recipients_raw: string;
  active: boolean;
}

const DEFAULT_STATE: FormState = {
  name: '',
  metric: '',
  operator: 'gt',
  threshold: '',
  check_frequency: 'daily',
  recipients_raw: '',
  active: true,
};

export function AlertForm({ open, onClose, onSaved }: AlertFormProps) {
  const t = useTranslations('reports.alerts');
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const { control, register, handleSubmit, reset } = useForm<FormState>({
    defaultValues: DEFAULT_STATE,
  });

  React.useEffect(() => {
    if (open) {
      reset(DEFAULT_STATE);
      setSubmitError(null);
    }
  }, [open, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);

    const recipientEmails = values.recipients_raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!values.name.trim()) {
      setSubmitError(t('errorNameRequired'));
      return;
    }
    if (!values.metric) {
      setSubmitError(t('errorMetricRequired'));
      return;
    }
    const thresholdNumber = Number(values.threshold);
    if (!Number.isFinite(thresholdNumber)) {
      setSubmitError(t('errorThresholdRequired'));
      return;
    }
    if (recipientEmails.length === 0) {
      setSubmitError(t('errorRecipientsRequired'));
      return;
    }

    const payload: CreateReportAlertDto = {
      name: values.name.trim(),
      metric: values.metric,
      operator: values.operator,
      threshold: thresholdNumber,
      check_frequency: values.check_frequency,
      notification_recipients_json: recipientEmails,
      active: values.active,
    };

    const parsed = createReportAlertSchema.safeParse(payload);
    if (!parsed.success) {
      setSubmitError(parsed.error.issues[0]?.message ?? t('errorGeneric'));
      return;
    }

    setSubmitting(true);
    try {
      await apiClient<{ data: { id: string } }>('/api/v1/reports/alerts', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
        silent: true,
      });
      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error('[AlertForm.submit]', err);
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
            <Label htmlFor="alert-name">
              {t('name')} <span className="text-red-600">*</span>
            </Label>
            <Input
              id="alert-name"
              autoComplete="off"
              placeholder={t('namePlaceholder')}
              {...register('name')}
            />
          </div>

          {/* Metric + operator + threshold row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            <div className="space-y-1 sm:col-span-6">
              <Label htmlFor="alert-metric">
                {t('metric')} <span className="text-red-600">*</span>
              </Label>
              <Controller
                control={control}
                name="metric"
                render={({ field }) => (
                  <Select
                    value={field.value || ''}
                    onValueChange={(v) => field.onChange(v as ReportAlertMetric)}
                  >
                    <SelectTrigger id="alert-metric">
                      <SelectValue placeholder={t('selectMetric')} />
                    </SelectTrigger>
                    <SelectContent>
                      {METRIC_OPTIONS.filter((m) => m.group === 'new').map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {t(`metricLabels.${m.labelKey}`)}
                        </SelectItem>
                      ))}
                      {/* Visual divider between new + legacy keys.
                          Radix Select uses raw <SelectItem>, no group
                          headings supported in this version. We bracket
                          the legacy items with a disabled placeholder. */}
                      <SelectItem value="__legacy_divider" disabled>
                        ── {t('legacyMetricsHeading')} ──
                      </SelectItem>
                      {METRIC_OPTIONS.filter((m) => m.group === 'legacy').map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {t(`metricLabels.${m.labelKey}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor="alert-operator">
                {t('operator')} <span className="text-red-600">*</span>
              </Label>
              <Controller
                control={control}
                name="operator"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(v) => field.onChange(v as ReportAlertOperator)}
                  >
                    <SelectTrigger id="alert-operator">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>
                          <span className="font-mono me-2">{op.symbol}</span>
                          {t(`operatorLabels.${op.labelKey}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1 sm:col-span-3">
              <Label htmlFor="alert-threshold">
                {t('threshold')} <span className="text-red-600">*</span>
              </Label>
              <Input
                id="alert-threshold"
                type="number"
                inputMode="decimal"
                step="any"
                placeholder={t('thresholdPlaceholder')}
                {...register('threshold')}
              />
            </div>
          </div>

          {/* Frequency */}
          <div className="space-y-1">
            <Label htmlFor="alert-frequency">
              {t('frequency')} <span className="text-red-600">*</span>
            </Label>
            <Controller
              control={control}
              name="check_frequency"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v as 'daily' | 'weekly')}
                >
                  <SelectTrigger id="alert-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t('daily')}</SelectItem>
                    <SelectItem value="weekly">{t('weekly')}</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            <p className="text-xs text-text-tertiary">{t('frequencyHelp')}</p>
          </div>

          {/* Recipients */}
          <div className="space-y-1">
            <Label htmlFor="alert-recipients">
              {t('recipientsField')} <span className="text-red-600">*</span>
            </Label>
            <Input
              id="alert-recipients"
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
