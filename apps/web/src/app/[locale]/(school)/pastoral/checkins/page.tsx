'use client';

import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { SearchPicker } from '@/components/pastoral/search-picker';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import {
  PASTORAL_CHECKIN_FLAG_REASONS,
  searchStudents,
  type PastoralApiDetailResponse,
  type PastoralApiListResponse,
  type PastoralCheckinConfig,
  type PastoralCheckinPrerequisiteStatus,
  type PastoralDayOfWeekPattern,
  type PastoralExamComparisonResult,
  type PastoralMonitoringCheckinRecord,
  type PastoralMoodTrendDataPoint,
  type SearchOption,
} from '@/lib/pastoral';
import { formatDate } from '@/lib/format-date';

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default function PastoralCheckinsPage() {
  const t = useTranslations('pastoral.checkins');
  const sharedT = useTranslations('pastoral.shared');
  const [config, setConfig] = React.useState<PastoralCheckinConfig | null>(null);
  const [prerequisites, setPrerequisites] =
    React.useState<PastoralCheckinPrerequisiteStatus | null>(null);
  const [flagged, setFlagged] = React.useState<PastoralMonitoringCheckinRecord[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<SearchOption[]>([]);
  const [studentHistory, setStudentHistory] = React.useState<PastoralMonitoringCheckinRecord[]>([]);
  const [dateFrom, setDateFrom] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 60);
    return toDateInputValue(date);
  });
  const [dateTo, setDateTo] = React.useState(() => toDateInputValue(new Date()));
  const [flagReason, setFlagReason] = React.useState('all');
  const [keywordInput, setKeywordInput] = React.useState('');
  const [moodTrends, setMoodTrends] = React.useState<PastoralMoodTrendDataPoint[]>([]);
  const [dayPatterns, setDayPatterns] = React.useState<PastoralDayOfWeekPattern[]>([]);
  const [examStart, setExamStart] = React.useState('');
  const [examEnd, setExamEnd] = React.useState('');
  const [examComparison, setExamComparison] = React.useState<PastoralExamComparisonResult | null>(
    null,
  );
  const [error, setError] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const loadConfig = React.useCallback(async () => {
    const [configResponse, prerequisitesResponse] = await Promise.all([
      apiClient<PastoralApiDetailResponse<PastoralCheckinConfig>>(
        '/api/v1/pastoral/checkins/config',
        {
          silent: true,
        },
      ),
      apiClient<PastoralCheckinPrerequisiteStatus>(
        '/api/v1/pastoral/checkins/config/prerequisites',
        {
          silent: true,
        },
      ),
    ]);

    setConfig(configResponse.data);
    setKeywordInput(configResponse.data.flagged_keywords.join(', '));
    setPrerequisites(prerequisitesResponse);
  }, []);

  const loadFlagged = React.useCallback(async () => {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '20',
      date_from: dateFrom,
      date_to: dateTo,
    });

    if (flagReason !== 'all') {
      params.set('flag_reason', flagReason);
    }

    const response = await apiClient<PastoralApiListResponse<PastoralMonitoringCheckinRecord>>(
      `/api/v1/pastoral/checkins/flagged?${params.toString()}`,
      { silent: true },
    );

    setFlagged(response.data ?? []);
  }, [dateFrom, dateTo, flagReason]);

  const loadAnalytics = React.useCallback(async () => {
    const [trendResponse, patternResponse] = await Promise.all([
      apiClient<PastoralMoodTrendDataPoint[]>(
        `/api/v1/pastoral/checkins/analytics/mood-trends?date_from=${dateFrom}&date_to=${dateTo}&group_by=week`,
        { silent: true },
      ),
      apiClient<PastoralDayOfWeekPattern[]>(
        `/api/v1/pastoral/checkins/analytics/day-of-week?date_from=${dateFrom}&date_to=${dateTo}&group_by=week`,
        { silent: true },
      ),
    ]);

    setMoodTrends(trendResponse ?? []);
    setDayPatterns(patternResponse ?? []);

    if (examStart && examEnd) {
      const examResponse = await apiClient<PastoralExamComparisonResult | null>(
        `/api/v1/pastoral/checkins/analytics/exam-comparison?exam_start=${examStart}&exam_end=${examEnd}`,
        { silent: true },
      );
      setExamComparison(examResponse);
    } else {
      setExamComparison(null);
    }
  }, [dateFrom, dateTo, examEnd, examStart]);

  React.useEffect(() => {
    void Promise.all([loadConfig(), loadFlagged(), loadAnalytics()]).catch((loadError: unknown) => {
      const apiError = loadError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.load'));
    });
  }, [loadAnalytics, loadConfig, loadFlagged, t]);

  React.useEffect(() => {
    const studentId = selectedStudent[0]?.id;
    if (!studentId) {
      setStudentHistory([]);
      return;
    }

    void apiClient<PastoralApiListResponse<PastoralMonitoringCheckinRecord>>(
      `/api/v1/pastoral/checkins/students/${studentId}?page=1&pageSize=20`,
      { silent: true },
    )
      .then((response) => setStudentHistory(response.data ?? []))
      .catch(() => setStudentHistory([]));
  }, [selectedStudent]);

  const runAction = async (key: string, action: () => Promise<void>) => {
    setError('');
    setBusyAction(key);

    try {
      await action();
      await Promise.all([loadConfig(), loadFlagged(), loadAnalytics()]);
    } catch (submissionError: unknown) {
      const apiError = submissionError as { error?: { message?: string } };
      setError(apiError.error?.message ?? t('errors.generic'));
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t('configSection')}</h2>
                <p className="mt-1 text-sm text-text-secondary">{t('configDescription')}</p>
              </div>
            </div>

            {config ? (
              <div className="mt-4 space-y-4">
                <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(event) =>
                      setConfig((current) =>
                        current ? { ...current, enabled: event.target.checked } : current,
                      )
                    }
                    className="h-4 w-4 rounded border-border text-emerald-600"
                  />
                  <span className="text-sm text-text-primary">{t('fields.enabled')}</span>
                </label>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{t('fields.frequency')}</Label>
                    <Select
                      value={config.frequency}
                      onValueChange={(value) =>
                        setConfig((current) =>
                          current
                            ? { ...current, frequency: value as 'daily' | 'weekly' }
                            : current,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">{t('frequency.daily')}</SelectItem>
                        <SelectItem value="weekly">{t('frequency.weekly')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="threshold">{t('fields.threshold')}</Label>
                    <Input
                      id="threshold"
                      type="number"
                      min={2}
                      value={config.consecutive_low_threshold}
                      onChange={(event) =>
                        setConfig((current) =>
                          current
                            ? {
                                ...current,
                                consecutive_low_threshold: Number(event.target.value) || 2,
                              }
                            : current,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="start">{t('fields.hoursStart')}</Label>
                    <Input
                      id="start"
                      type="time"
                      value={config.monitoring_hours_start}
                      onChange={(event) =>
                        setConfig((current) =>
                          current
                            ? { ...current, monitoring_hours_start: event.target.value }
                            : current,
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="end">{t('fields.hoursEnd')}</Label>
                    <Input
                      id="end"
                      type="time"
                      value={config.monitoring_hours_end}
                      onChange={(event) =>
                        setConfig((current) =>
                          current
                            ? { ...current, monitoring_hours_end: event.target.value }
                            : current,
                        )
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="keywords">{t('fields.keywords')}</Label>
                  <Textarea
                    id="keywords"
                    value={keywordInput}
                    onChange={(event) => setKeywordInput(event.target.value)}
                    rows={4}
                    placeholder={t('fields.keywordsPlaceholder')}
                  />
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                  <input
                    type="checkbox"
                    checked={config.prerequisites_acknowledged}
                    onChange={(event) =>
                      setConfig((current) =>
                        current
                          ? { ...current, prerequisites_acknowledged: event.target.checked }
                          : current,
                      )
                    }
                    className="h-4 w-4 rounded border-border text-emerald-600"
                  />
                  <span className="text-sm text-text-primary">{t('fields.acknowledged')}</span>
                </label>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    disabled={busyAction === 'save-config'}
                    onClick={() =>
                      void runAction('save-config', async () => {
                        if (!config) {
                          return;
                        }

                        await apiClient('/api/v1/pastoral/checkins/config', {
                          method: 'PATCH',
                          body: JSON.stringify({
                            enabled: config.enabled,
                            frequency: config.frequency,
                            monitoring_owner_user_ids: config.monitoring_owner_user_ids,
                            monitoring_hours_start: config.monitoring_hours_start,
                            monitoring_hours_end: config.monitoring_hours_end,
                            monitoring_days: config.monitoring_days,
                            flagged_keywords: keywordInput
                              .split(',')
                              .map((item) => item.trim())
                              .filter(Boolean),
                            consecutive_low_threshold: config.consecutive_low_threshold,
                            min_cohort_for_aggregate: config.min_cohort_for_aggregate,
                            prerequisites_acknowledged: config.prerequisites_acknowledged,
                          }),
                          silent: true,
                        });
                      })
                    }
                  >
                    <Save className="me-2 h-4 w-4" />
                    {t('saveConfig')}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="date_from">{t('filters.dateFrom')}</Label>
                <Input
                  id="date_from"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_to">{t('filters.dateTo')}</Label>
                <Input
                  id="date_to"
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('filters.flagReason')}</Label>
                <Select value={flagReason} onValueChange={setFlagReason}>
                  <SelectTrigger className="min-w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('filters.all')}</SelectItem>
                    {PASTORAL_CHECKIN_FLAG_REASONS.map((reason) => (
                      <SelectItem key={reason} value={reason}>
                        {t(`flagReason.${reason}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" variant="outline" onClick={() => void loadFlagged()}>
                {t('refreshFlagged')}
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {flagged.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('noFlagged')}
                </p>
              ) : (
                flagged.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border px-4 py-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {item.student_name ?? item.student_id}
                        </p>
                        <p className="mt-1 text-xs text-text-tertiary">
                          {t('flaggedMeta', {
                            date: formatDate(item.checkin_date),
                            reason: t(`flagReason.${item.flag_reason ?? 'keyword_match'}` as never),
                          })}
                        </p>
                        {item.freeform_text ? (
                          <p className="mt-3 text-sm text-text-secondary">{item.freeform_text}</p>
                        ) : null}
                      </div>
                      <div className="text-sm font-medium text-text-primary">
                        {t('moodScore', { score: item.mood_score })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('prerequisitesSection')}</h2>
            <div className="mt-4 space-y-3">
              {prerequisites
                ? [
                    ['monitoring_ownership_defined', t('prerequisites.owner')],
                    ['monitoring_hours_defined', t('prerequisites.hours')],
                    ['escalation_protocol_defined', t('prerequisites.escalation')],
                    ['prerequisites_acknowledged', t('prerequisites.acknowledgement')],
                  ].map(([key, label]) => {
                    const met = prerequisites[key as keyof PastoralCheckinPrerequisiteStatus];
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between rounded-2xl border border-border px-4 py-3"
                      >
                        <span className="text-sm text-text-primary">{label}</span>
                        <span className={met ? 'text-emerald-700' : 'text-rose-700'}>
                          {met ? t('met') : t('missing')}
                        </span>
                      </div>
                    );
                  })
                : null}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">
              {t('studentHistorySection')}
            </h2>
            <div className="mt-4 space-y-4">
              <SearchPicker
                label={t('fields.historyStudent')}
                placeholder={t('fields.historyStudentPlaceholder')}
                search={searchStudents}
                selected={selectedStudent}
                onChange={(next) => setSelectedStudent(next.slice(0, 1))}
                multiple={false}
                emptyText={sharedT('noStudents')}
                minSearchLengthText={sharedT('minSearchLength')}
              />

              {studentHistory.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-text-tertiary">
                  {t('noHistory')}
                </p>
              ) : (
                studentHistory.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-text-primary">
                        {formatDate(item.checkin_date)}
                      </p>
                      <p className="text-sm text-text-secondary">
                        {t('moodScore', { score: item.mood_score })}
                      </p>
                    </div>
                    {item.freeform_text ? (
                      <p className="mt-3 text-sm text-text-secondary">{item.freeform_text}</p>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="text-lg font-semibold text-text-primary">{t('analyticsSection')}</h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('trendTitle')}</h3>
                <div className="mt-3 space-y-2 text-sm text-text-secondary">
                  {moodTrends.length === 0 ? (
                    <p>{t('noTrendData')}</p>
                  ) : (
                    moodTrends.map((point) => (
                      <div key={point.period} className="flex items-center justify-between gap-3">
                        <span>{point.period}</span>
                        <span>
                          {point.average_mood.toFixed(1)} · {point.response_count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('dayPatternTitle')}</h3>
                <div className="mt-3 space-y-2 text-sm text-text-secondary">
                  {dayPatterns.length === 0 ? (
                    <p>{t('noPatternData')}</p>
                  ) : (
                    dayPatterns.map((pattern) => (
                      <div key={pattern.day} className="flex items-center justify-between gap-3">
                        <span>{t(`days.${pattern.day}` as never)}</span>
                        <span>
                          {pattern.average_mood.toFixed(1)} · {pattern.response_count}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-surface-secondary/60 p-4">
                <h3 className="text-sm font-semibold text-text-primary">{t('examTitle')}</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="exam_start">{t('fields.examStart')}</Label>
                    <Input
                      id="exam_start"
                      type="date"
                      value={examStart}
                      onChange={(event) => setExamStart(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="exam_end">{t('fields.examEnd')}</Label>
                    <Input
                      id="exam_end"
                      type="date"
                      value={examEnd}
                      onChange={(event) => setExamEnd(event.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <Button type="button" variant="outline" onClick={() => void loadAnalytics()}>
                    {t('refreshAnalytics')}
                  </Button>
                </div>
                {examComparison ? (
                  <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-2xl border border-border px-3 py-3">
                      <p className="font-medium text-text-primary">{t('exam.before')}</p>
                      <p className="mt-2 text-text-secondary">
                        {examComparison.before_period.average_mood.toFixed(1)} ·{' '}
                        {examComparison.before_period.response_count}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border px-3 py-3">
                      <p className="font-medium text-text-primary">{t('exam.during')}</p>
                      <p className="mt-2 text-text-secondary">
                        {examComparison.during_period.average_mood.toFixed(1)} ·{' '}
                        {examComparison.during_period.response_count}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border px-3 py-3">
                      <p className="font-medium text-text-primary">{t('exam.after')}</p>
                      <p className="mt-2 text-text-secondary">
                        {examComparison.after_period.average_mood.toFixed(1)} ·{' '}
                        {examComparison.after_period.response_count}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {error ? (
            <section className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-800">
              {error}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
