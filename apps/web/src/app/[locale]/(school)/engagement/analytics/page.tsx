'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatCard,
} from '@school/ui';

import {
  EVENT_TYPE_OPTIONS,
  formatDisplayDate,
  pickLocalizedValue,
  type AcademicYearOption,
  type EngagementAnalyticsOutstandingItem,
} from '../_components/engagement-types';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsOverviewResponse {
  summary: {
    total_events: number;
    total_forms_distributed: number;
    total_submissions: number;
    average_response_time_hours: number;
    average_completion_rate_pct: number;
    outstanding_action_items_count: number;
  };
  response_time_trend: Array<{
    bucket: string;
    submissions: number;
    average_response_time_hours: number;
  }>;
  outstanding_items: EngagementAnalyticsOutstandingItem[];
}

interface CompletionRatesResponse {
  event_type_completion: Array<{
    event_type: string;
    total_events: number;
    total_distributed: number;
    submitted: number;
    expired: number;
    outstanding_count: number;
    completion_percentage: number;
  }>;
}

interface AcademicYearsResponse {
  data: AcademicYearOption[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatHoursAsLabel(value: number, t: ReturnType<typeof useTranslations>) {
  if (value <= 0) {
    return t('pages.analytics.zeroHours');
  }

  if (value >= 24) {
    return t('pages.analytics.responseTimeDays', { days: (value / 24).toFixed(1) });
  }

  return t('pages.analytics.responseTimeHours', { hours: value.toFixed(1) });
}

function formatMonthBucket(locale: string, bucket: string) {
  const date = new Date(`${bucket}-01T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return bucket;
  }

  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-IE', {
    month: 'short',
    year: '2-digit',
  }).format(date);
}

function toTooltipNumber(
  value: number | string | Array<number | string> | ReadonlyArray<number | string> | undefined,
): number {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    return Number(value);
  }

  if (Array.isArray(value)) {
    return toTooltipNumber(value[0]);
  }

  return 0;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EngagementAnalyticsPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('engagement');

  const [academicYears, setAcademicYears] = React.useState<AcademicYearOption[]>([]);
  const [academicYearId, setAcademicYearId] = React.useState('all');
  const [eventType, setEventType] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [overview, setOverview] = React.useState<AnalyticsOverviewResponse | null>(null);
  const [completionRates, setCompletionRates] = React.useState<CompletionRatesResponse | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);

  React.useEffect(() => {
    apiClient<AcademicYearsResponse>('/api/v1/academic-years?pageSize=100', { silent: true })
      .then((response) => {
        setAcademicYears(response.data);
      })
      .catch((error) => {
        console.error('[EngagementAnalyticsPage.fetchAcademicYears]', error);
        setAcademicYears([]);
      });
  }, []);

  const fetchAnalytics = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const params = new URLSearchParams();

      if (academicYearId !== 'all') {
        params.set('academic_year_id', academicYearId);
      }

      if (eventType !== 'all') {
        params.set('event_type', eventType);
      }

      if (dateFrom) {
        params.set('date_from', dateFrom);
      }

      if (dateTo) {
        params.set('date_to', dateTo);
      }

      const query = params.toString();
      const [overviewResponse, completionResponse] = await Promise.all([
        apiClient<AnalyticsOverviewResponse>(
          `/api/v1/engagement/analytics/overview${query ? `?${query}` : ''}`,
          { silent: true },
        ),
        apiClient<CompletionRatesResponse>(
          `/api/v1/engagement/analytics/completion-rates${query ? `?${query}` : ''}`,
          { silent: true },
        ),
      ]);

      setOverview(overviewResponse);
      setCompletionRates(completionResponse);
    } catch (error) {
      console.error('[EngagementAnalyticsPage.fetchAnalytics]', error);
      setOverview(null);
      setCompletionRates(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [academicYearId, dateFrom, dateTo, eventType]);

  React.useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const completionChartData = React.useMemo(() => {
    return (completionRates?.event_type_completion ?? []).map((entry) => {
      const labelKey =
        EVENT_TYPE_OPTIONS.find((option) => option.value === entry.event_type)?.label ??
        'inSchoolEvent';

      return {
        ...entry,
        label: t(`eventTypes.${labelKey}`),
      };
    });
  }, [completionRates?.event_type_completion, t]);

  const responseTrendData = React.useMemo(() => {
    return (overview?.response_time_trend ?? []).map((entry) => ({
      ...entry,
      label: formatMonthBucket(locale, entry.bucket),
    }));
  }, [locale, overview?.response_time_trend]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.analytics.title')}
        description={t('pages.analytics.description')}
        actions={
          <Button variant="ghost" onClick={() => router.push(`/${locale}/engagement/events`)}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
            {t('pages.analytics.backToEvents')}
          </Button>
        }
      />

      <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4 lg:grid-cols-4">
        <Select value={academicYearId} onValueChange={setAcademicYearId}>
          <SelectTrigger>
            <SelectValue placeholder={t('pages.analytics.filters.academicYear')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pages.analytics.filters.allAcademicYears')}</SelectItem>
            {academicYears.map((year) => (
              <SelectItem key={year.id} value={year.id}>
                {year.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger>
            <SelectValue placeholder={t('pages.analytics.filters.eventType')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('pages.analytics.filters.allEventTypes')}</SelectItem>
            {EVENT_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(`eventTypes.${option.label}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
          aria-label={t('pages.analytics.filters.dateFrom')}
        />

        <Input
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
          aria-label={t('pages.analytics.filters.dateTo')}
        />
      </div>

      {loading ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-3xl bg-surface-secondary" />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="h-[360px] animate-pulse rounded-3xl bg-surface-secondary" />
            <div className="h-[360px] animate-pulse rounded-3xl bg-surface-secondary" />
          </div>
          <div className="h-[360px] animate-pulse rounded-3xl bg-surface-secondary" />
        </>
      ) : loadError || !overview || !completionRates ? (
        <div className="rounded-3xl border border-dashed border-border bg-surface p-10 text-center text-sm text-text-tertiary">
          {t('pages.analytics.loadError')}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label={t('pages.analytics.cards.totalEvents')}
              value={overview.summary.total_events}
            />
            <StatCard
              label={t('pages.analytics.cards.totalForms')}
              value={overview.summary.total_forms_distributed}
            />
            <StatCard
              label={t('pages.analytics.cards.totalSubmissions')}
              value={overview.summary.total_submissions}
            />
            <StatCard
              label={t('pages.analytics.cards.averageCompletionRate')}
              value={`${overview.summary.average_completion_rate_pct.toFixed(1)}%`}
            />
            <StatCard
              label={t('pages.analytics.cards.averageResponseTime')}
              value={formatHoursAsLabel(overview.summary.average_response_time_hours, t)}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-3xl border border-border bg-surface p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-text-primary">
                  {t('pages.analytics.completionChart.title')}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {t('pages.analytics.completionChart.description')}
                </p>
              </div>

              {completionChartData.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center rounded-2xl bg-surface-secondary/60 text-sm text-text-tertiary">
                  {t('pages.analytics.emptyChart')}
                </div>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={completionChartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                      <Tooltip
                        formatter={(value) => [
                          `${toTooltipNumber(value)}%`,
                          t('pages.analytics.tooltip.completion'),
                        ]}
                      />
                      <Bar dataKey="completion_percentage" fill="#0f766e" radius={[10, 10, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-border bg-surface p-6">
              <div className="mb-5">
                <h2 className="text-base font-semibold text-text-primary">
                  {t('pages.analytics.responseTrend.title')}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {t('pages.analytics.responseTrend.description')}
                </p>
              </div>

              {responseTrendData.length === 0 ? (
                <div className="flex h-[280px] items-center justify-center rounded-2xl bg-surface-secondary/60 text-sm text-text-tertiary">
                  {t('pages.analytics.emptyChart')}
                </div>
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={responseTrendData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tickFormatter={(value) => `${value}h`} />
                      <Tooltip
                        formatter={(value) => [
                          formatHoursAsLabel(toTooltipNumber(value), t),
                          t('pages.analytics.tooltip.responseTime'),
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="average_response_time_hours"
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          </div>

          <section className="rounded-3xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary">
                  {t('pages.analytics.outstanding.title')}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  {t('pages.analytics.outstanding.description')}
                </p>
              </div>
              <StatCard
                label={t('pages.analytics.cards.outstandingItems')}
                value={overview.summary.outstanding_action_items_count}
                className="min-w-[180px]"
              />
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-surface-secondary/70">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary">
                      {t('pages.analytics.outstanding.columns.name')}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary">
                      {t('pages.analytics.outstanding.columns.kind')}
                    </th>
                    <th className="px-4 py-3 text-start font-medium text-text-secondary">
                      {t('pages.analytics.outstanding.columns.dueDate')}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-text-secondary">
                      {t('pages.analytics.outstanding.columns.outstanding')}
                    </th>
                    <th className="px-4 py-3 text-end font-medium text-text-secondary">
                      {t('pages.analytics.outstanding.columns.completionRate')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.outstanding_items.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">
                        {t('pages.analytics.outstanding.empty')}
                      </td>
                    </tr>
                  ) : (
                    overview.outstanding_items.map((item) => (
                      <tr key={`${item.kind}-${item.id}`} className="border-t border-border">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-text-primary">
                              {pickLocalizedValue(locale, item.name, item.title_ar)}
                            </p>
                            {item.event_type && (
                              <p className="mt-1 text-xs text-text-tertiary">
                                {t(
                                  `eventTypes.${
                                    EVENT_TYPE_OPTIONS.find(
                                      (option) => option.value === item.event_type,
                                    )?.label ?? 'inSchoolEvent'
                                  }`,
                                )}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {item.kind === 'event'
                            ? t('pages.analytics.outstanding.kinds.event')
                            : t('pages.analytics.outstanding.kinds.form')}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {formatDisplayDate(item.due_date, locale)}
                        </td>
                        <td className="px-4 py-3 text-end font-medium text-text-primary">
                          {item.outstanding_count}
                        </td>
                        <td className="px-4 py-3 text-end font-medium text-text-primary">
                          {item.completion_percentage.toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
