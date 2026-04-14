'use client';

import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Printer,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, Dialog, DialogContent, DialogHeader, DialogTitle, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimetableCell {
  schedule_id: string;
  period_name: string;
  period_order: number;
  weekday: number; // 0=Sun … 6=Sat
  subject_name: string;
  subject_color: string | null;
  class_name: string;
  room_name: string | null;
  is_cover_duty: boolean;
  cover_for_name: string | null;
}

interface WeekInfo {
  rotation_week_label: string | null; // e.g. "Week A"
  week_start: string; // ISO date
  week_end: string;
}

interface MyTimetableResponse {
  week: WeekInfo;
  cells: TimetableCell[];
  periods: Array<{ order: number; name: string; start_time: string; end_time: string }>;
  weekdays: number[]; // active weekday numbers
}

// ─── Colour helpers ────────────────────────────────────────────────────────────

const SUBJECT_COLOURS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-green-100 text-green-800 border-green-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
  'bg-yellow-100 text-yellow-800 border-yellow-200',
  'bg-red-100 text-red-800 border-red-200',
];

function subjectColour(subjectName: string): string {
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SUBJECT_COLOURS[Math.abs(hash) % SUBJECT_COLOURS.length] ?? SUBJECT_COLOURS[0]!;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Cover Alert ──────────────────────────────────────────────────────────────

function CoverAlert({ cells }: { cells: TimetableCell[] }) {
  const t = useTranslations('scheduling.myTimetable');
  const covers = cells.filter((c) => c.is_cover_duty);
  if (covers.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3">
      <AlertCircle className="h-4 w-4 shrink-0 text-warning-600 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-warning-800">{t('coverDutyAlert')}</p>
        {covers.map((c) => (
          <p key={c.schedule_id} className="text-xs text-warning-700">
            {c.period_name}: {t('coveringFor', { name: c.cover_for_name ?? '—' })}
          </p>
        ))}
      </div>
    </div>
  );
}

// ─── Weekly Grid (desktop) ────────────────────────────────────────────────────

function WeeklyGrid({ data, todayWeekday }: { data: MyTimetableResponse; todayWeekday: number }) {
  const t = useTranslations('scheduling.myTimetable');
  const cellMap = new Map<string, TimetableCell>();
  for (const c of data.cells) {
    cellMap.set(`${c.weekday}-${c.period_order}`, c);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-20 border border-border bg-surface-secondary px-3 py-2 text-start text-xs font-semibold text-text-tertiary uppercase">
              {t('period')}
            </th>
            {data.weekdays.map((wd) => (
              <th
                key={wd}
                className={`border border-border px-3 py-2 text-center text-xs font-semibold uppercase ${
                  wd === todayWeekday
                    ? 'bg-primary/10 text-primary'
                    : 'bg-surface-secondary text-text-tertiary'
                }`}
              >
                {WEEKDAY_SHORT[wd] ?? wd}
                {wd === todayWeekday && (
                  <span className="ms-1 rounded-full bg-primary px-1 py-0.5 text-[9px] text-white">
                    {t('today')}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.periods.map((period) => (
            <tr key={period.order}>
              <td className="border border-border bg-surface-secondary px-3 py-2 text-xs font-medium text-text-secondary">
                <p>{period.name}</p>
                <p className="text-text-tertiary font-normal">{period.start_time}</p>
              </td>
              {data.weekdays.map((wd) => {
                const cell = cellMap.get(`${wd}-${period.order}`);
                const isToday = wd === todayWeekday;
                return (
                  <td
                    key={wd}
                    className={`border border-border p-1.5 align-top ${isToday ? 'bg-primary/5' : 'bg-surface'}`}
                  >
                    {cell ? (
                      <div
                        className={`rounded-lg border p-2 text-xs space-y-0.5 ${
                          cell.is_cover_duty
                            ? 'border-warning-300 bg-warning-50'
                            : subjectColour(cell.subject_name)
                        }`}
                      >
                        <p className="font-semibold">{cell.subject_name}</p>
                        <p className="opacity-80">{cell.class_name}</p>
                        {cell.room_name && <p className="opacity-70">{cell.room_name}</p>}
                        {cell.is_cover_duty && (
                          <p className="font-medium text-warning-700">{t('cover')}</p>
                        )}
                      </div>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Daily List (mobile) ──────────────────────────────────────────────────────

function DailyList({ data, day }: { data: MyTimetableResponse; day: number }) {
  const t = useTranslations('scheduling.myTimetable');
  const dayCells = data.cells
    .filter((c) => c.weekday === day)
    .sort((a, b) => a.period_order - b.period_order);

  if (dayCells.length === 0) {
    return <p className="py-8 text-center text-sm text-text-secondary">{t('noPeriods')}</p>;
  }

  return (
    <div className="space-y-2">
      {dayCells.map((cell) => (
        <div
          key={cell.schedule_id}
          className={`rounded-xl border p-4 ${
            cell.is_cover_duty
              ? 'border-warning-300 bg-warning-50'
              : subjectColour(cell.subject_name)
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{cell.subject_name}</p>
              <p className="text-xs opacity-80 mt-0.5">{cell.class_name}</p>
              {cell.room_name && <p className="text-xs opacity-70">{cell.room_name}</p>}
            </div>
            <div className="text-end">
              <p className="text-xs font-medium">{cell.period_name}</p>
              {cell.is_cover_duty && (
                <p className="text-xs text-warning-700 mt-0.5">{t('coverDutyBadge')}</p>
              )}
            </div>
          </div>
          {cell.cover_for_name && (
            <p className="mt-1 text-xs text-warning-700">
              {t('coveringFor', { name: cell.cover_for_name })}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Calendar Subscription Modal ──────────────────────────────────────────────

function CalendarModal({
  open,
  onOpenChange,
  url,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  url: string;
}) {
  const t = useTranslations('scheduling.myTimetable');
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('calendarSubscription')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-secondary">{t('calendarDesc')}</p>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary p-3">
          <code className="flex-1 min-w-0 truncate text-xs text-text-primary">{url}</code>
          <Button size="sm" variant="outline" onClick={() => void handleCopy()}>
            <Copy className="h-3.5 w-3.5 me-1" />
            {copied ? t('copied') : t('copy')}
          </Button>
        </div>
        <p className="text-xs text-text-tertiary">{t('calendarHint')}</p>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyTimetablePage() {
  const t = useTranslations('scheduling.myTimetable');
  const [data, setData] = React.useState<MyTimetableResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [mobileDay, setMobileDay] = React.useState<number>(new Date().getDay());
  const [calOpen, setCalOpen] = React.useState(false);
  const [calUrl, setCalUrl] = React.useState('');

  const todayWeekday = new Date().getDay();

  const fetchTimetable = React.useCallback(async () => {
    setLoading(true);
    try {
      // Target date for the requested week — Monday of the offset week.
      const today = new Date();
      const mondayOffset = (today.getDay() + 6) % 7;
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - mondayOffset + weekOffset * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      // Use the END of the requested week as the "as-of" date so the server's
      // `effective_start_date <= asOf` filter always matches a schedule that
      // starts anywhere within or before that week.
      const weekDateIso = weekEnd.toISOString().slice(0, 10);
      const res = await apiClient<{
        data: Array<{
          schedule_id: string;
          weekday: number;
          period_order: number;
          start_time: string;
          end_time: string;
          class_name: string;
          subject_name: string | null;
          room_name: string | null;
          rotation_week: number | null;
        }>;
      }>(`/api/v1/scheduling/timetable/my?week_date=${weekDateIso}`);

      const entries = res.data;
      const cells: TimetableCell[] = entries.map((e) => ({
        schedule_id: e.schedule_id,
        period_name: `P${e.period_order}`,
        period_order: e.period_order,
        weekday: e.weekday,
        subject_name: e.subject_name ?? '',
        subject_color: null,
        class_name: e.class_name,
        room_name: e.room_name,
        is_cover_duty: false,
        cover_for_name: null,
      }));

      const periodMap = new Map<
        number,
        { order: number; name: string; start_time: string; end_time: string }
      >();
      for (const e of entries) {
        if (!periodMap.has(e.period_order)) {
          periodMap.set(e.period_order, {
            order: e.period_order,
            name: `P${e.period_order}`,
            start_time: e.start_time,
            end_time: e.end_time,
          });
        }
      }

      const weekdays = [...new Set(entries.map((e) => e.weekday))].sort((a, b) => a - b);

      setData({
        week: {
          rotation_week_label: null,
          week_start: weekStart.toISOString(),
          week_end: weekEnd.toISOString(),
        },
        cells,
        periods: [...periodMap.values()].sort((a, b) => a.order - b.order),
        weekdays,
      });
    } catch (err) {
      console.error('[SchedulingMyTimetablePage]', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [weekOffset]);

  React.useEffect(() => {
    void fetchTimetable();
  }, [fetchTimetable]);

  const handleExportCalendar = async () => {
    try {
      const res = await apiClient<{ url: string }>('/api/v1/calendar/subscription-url');
      setCalUrl(res.url);
      setCalOpen(true);
    } catch (err) {
      console.error('[SchedulingMyTimetablePage]', err);
      toast.error(t('calendarError'));
    }
  };

  const handlePrint = () => window.print();

  const weekLabel = data?.week.rotation_week_label ? `${data.week.rotation_week_label} · ` : '';

  const weekDateRange = data
    ? `${new Date(data.week.week_start).toLocaleDateString()} – ${new Date(data.week.week_end).toLocaleDateString()}`
    : '';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={`${weekLabel}${weekDateRange}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void handleExportCalendar()}>
              <Calendar className="h-4 w-4 me-2" />
              {t('exportCalendar')}
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 me-2" />
              {t('print')}
            </Button>
          </div>
        }
      />

      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>
          <ChevronLeft className="h-4 w-4 rtl:rotate-180 me-1" />
          {t('prevWeek')}
        </Button>
        {data?.week.rotation_week_label && (
          <Badge variant="secondary" className="text-sm px-3 py-1">
            {data.week.rotation_week_label}
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
          {t('nextWeek')}
          <ChevronRight className="h-4 w-4 rtl:rotate-180 ms-1" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : !data ? (
        <p className="py-8 text-center text-sm text-text-secondary">{t('noTimetable')}</p>
      ) : (
        <>
          {/* Cover duty alerts */}
          <CoverAlert cells={data.cells} />

          {/* Desktop: weekly grid */}
          <div className="hidden md:block print:block">
            <WeeklyGrid data={data} todayWeekday={todayWeekday} />
          </div>

          {/* Mobile: day picker + daily list */}
          <div className="md:hidden">
            <div className="flex gap-1 overflow-x-auto pb-1">
              {data.weekdays.map((wd) => (
                <button
                  key={wd}
                  type="button"
                  onClick={() => setMobileDay(wd)}
                  className={`flex-shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                    mobileDay === wd
                      ? 'bg-primary text-white'
                      : wd === todayWeekday
                        ? 'bg-primary/10 text-primary'
                        : 'bg-surface-secondary text-text-secondary hover:bg-surface'
                  }`}
                >
                  {WEEKDAY_SHORT[wd] ?? wd}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <DailyList data={data} day={mobileDay} />
            </div>
          </div>
        </>
      )}

      <CalendarModal open={calOpen} onOpenChange={setCalOpen} url={calUrl} />
    </div>
  );
}
