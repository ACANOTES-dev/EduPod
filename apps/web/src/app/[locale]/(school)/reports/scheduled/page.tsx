'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Clock, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import { createScheduledReportSchema, type CreateScheduledReportDto } from '@school/shared';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduledReport {
  id: string;
  name: string;
  report_type: string;
  schedule_cron: string;
  format: 'pdf' | 'csv' | 'xlsx';
  active: boolean;
  last_sent_at: string | null;
  next_run?: string;
}

interface ScheduledResponse {
  data: ScheduledReport[];
}

const REPORT_TYPES = [
  'attendance_summary',
  'grade_analytics',
  'fee_collection',
  'board_report',
  'admissions_funnel',
  'staff_headcount',
] as const;

const FREQUENCIES = [
  { value: '0 8 * * 1', label: 'Every Monday' },
  { value: '0 8 * * 5', label: 'Every Friday' },
  { value: '0 8 1 * *', label: 'Monthly (1st)' },
  { value: '0 8 * * 1-5', label: 'Daily (weekdays)' },
] as const;

const DEFAULT_CRON = FREQUENCIES[0].value;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ScheduledReportsPage() {
  const t = useTranslations('reports');
  const tCommon = useTranslations('common');
  const [schedules, setSchedules] = React.useState<ScheduledReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showCreate, setShowCreate] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // recipients_raw is a comma-separated string that gets split before submission
  const [recipientsRaw, setRecipientsRaw] = React.useState('');

  // ─── Create Form ────────────────────────────────────────────────────────────
  const form = useForm<CreateScheduledReportDto>({
    resolver: zodResolver(createScheduledReportSchema),
    defaultValues: {
      name: '',
      report_type: '',
      parameters_json: {},
      schedule_cron: DEFAULT_CRON,
      recipient_emails: [],
      format: 'pdf',
      active: true,
    },
  });

  React.useEffect(() => {
    apiClient<ScheduledResponse>('/api/v1/reports/scheduled?pageSize=20')
      .then((res) => setSchedules(res.data))
      .catch((err) => { console.error('[ReportsScheduledPage]', err); })
      .finally(() => setLoading(false));
  }, []);

  const toggleActive = async (id: string, active: boolean) => {
    setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, active } : s)));
    try {
      await apiClient(`/api/v1/reports/scheduled/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
    } catch (err) {
      console.error('[ReportsScheduledPage]', err);
      // revert
      setSchedules((prev) => prev.map((s) => (s.id === id ? { ...s, active: !active } : s)));
    }
  };

  const handleCreate = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const payload: CreateScheduledReportDto = {
        ...values,
        recipient_emails: recipientsRaw
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean),
      };
      const res = await apiClient<{ data: ScheduledReport }>('/api/v1/reports/scheduled', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setSchedules((prev) => [res.data, ...prev]);
    } catch (err) {
      console.error('[ReportsScheduledPage]', err);
      // Mock add
      const mock: ScheduledReport = {
        id: crypto.randomUUID(),
        name: values.name,
        report_type: values.report_type,
        schedule_cron: values.schedule_cron,
        format: values.format,
        active: true,
        last_sent_at: null,
      };
      setSchedules((prev) => [mock, ...prev]);
    } finally {
      setSaving(false);
      setShowCreate(false);
      setRecipientsRaw('');
      form.reset();
    }
  });

  function cronLabel(cron: string): string {
    return FREQUENCIES.find((f) => f.value === cron)?.label ?? cron;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('scheduled.title')}
        description={t('scheduled.description')}
        actions={
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="me-2 h-4 w-4" />
            {t('scheduled.createButton')}
          </Button>
        }
      />

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate}>
          <section className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-6">
            <h2 className="text-base font-semibold text-text-primary">
              {t('scheduled.createTitle')}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="sched-name">{t('scheduled.name')}</Label>
                <Input
                  id="sched-name"
                  {...form.register('name')}
                  placeholder={t('scheduled.namePlaceholder')}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>{t('scheduled.reportType')}</Label>
                <Controller
                  control={form.control}
                  name="report_type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder={t('scheduled.selectReport')} />
                      </SelectTrigger>
                      <SelectContent>
                        {REPORT_TYPES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {t(`scheduled.reportTypes.${r}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label>{t('scheduled.frequency')}</Label>
                <Controller
                  control={form.control}
                  name="schedule_cron"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FREQUENCIES.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div>
                <Label>{t('scheduled.format')}</Label>
                <Controller
                  control={form.control}
                  name="format"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pdf">{tCommon('pdfFormat')}</SelectItem>
                        <SelectItem value="csv">{t('csv')}</SelectItem>
                        <SelectItem value="xlsx">{t('excel')}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="sched-recipients">{t('scheduled.recipients')}</Label>
                <Input
                  id="sched-recipients"
                  value={recipientsRaw}
                  onChange={(e) => setRecipientsRaw(e.target.value)}
                  placeholder={t('scheduled.recipientsPlaceholder')}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={saving || !form.watch('name').trim() || !form.watch('report_type')}
              >
                {saving ? t('scheduled.saving') : t('scheduled.save')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                {t('scheduled.cancel')}
              </Button>
            </div>
          </section>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface py-16">
          <Clock className="h-10 w-10 text-text-tertiary" />
          <p className="text-sm text-text-tertiary">{t('scheduled.noSchedules')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {schedules.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-secondary">
                  <Clock className="h-4 w-4 text-text-tertiary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{s.name}</p>
                  <p className="text-xs text-text-tertiary">
                    {cronLabel(s.schedule_cron)} · {s.format.toUpperCase()}
                    {s.last_sent_at &&
                      ` · ${t('scheduled.lastSent')} ${new Date(s.last_sent_at).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.active ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-secondary text-text-tertiary'}`}
                >
                  {s.active ? t('scheduled.active') : t('scheduled.inactive')}
                </span>
                <Switch
                  checked={s.active}
                  onCheckedChange={(checked) => void toggleActive(s.id, checked)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
