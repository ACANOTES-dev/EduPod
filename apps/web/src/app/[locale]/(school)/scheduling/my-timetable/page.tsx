'use client';

import {
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Printer,
  Search,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NormalizedCell {
  schedule_id: string;
  weekday: number;
  period_order: number;
  period_name: string;
  subject_name: string;
  class_name: string;
  teacher_name: string | null;
  room_name: string | null;
  is_cover_duty: boolean;
  cover_for_name: string | null;
}

interface NormalizedTimetable {
  label: string | null;
  week_start: string | null;
  week_end: string | null;
  rotation_week_label: string | null;
  cells: NormalizedCell[];
  periods: Array<{ order: number; name: string; start_time: string }>;
  weekdays: number[];
}

interface MyEndpointEntry {
  schedule_id: string;
  weekday: number;
  period_order: number;
  start_time: string;
  end_time: string;
  class_name: string;
  subject_name: string | null;
  room_name: string | null;
  rotation_week: number | null;
}

interface TimetableEntryDto {
  schedule_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_id: string;
  class_name: string;
  room_id?: string;
  room_name?: string;
  teacher_staff_id?: string;
  teacher_name?: string;
  subject_name?: string;
}

interface ParentTimetableResponse {
  class_name: string;
  classroom_model: 'fixed_homeroom' | 'free_movement';
  rotation_week_label: string | null;
  week_start: string;
  week_end: string;
  weekdays: number[];
  periods: Array<{ order: number; name: string; start_time: string; end_time: string }>;
  cells: Array<{
    weekday: number;
    period_order: number;
    period_name: string;
    subject_name: string;
    teacher_name: string | null;
    room_name: string | null;
  }>;
}

interface LookupItem {
  id: string;
  label: string;
  sub?: string | null;
}

type ViewMode = 'mine' | 'class' | 'teacher' | 'student' | 'child';

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
  if (!subjectName) return 'bg-surface-secondary text-text-secondary border-border';
  let hash = 0;
  for (let i = 0; i < subjectName.length; i++) {
    hash = subjectName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SUBJECT_COLOURS[Math.abs(hash) % SUBJECT_COLOURS.length] ?? SUBJECT_COLOURS[0]!;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Normalizers ──────────────────────────────────────────────────────────────

function formatTime(t: string): string {
  // Accept "HH:MM:SS" or "HH:MM" — return "HH:MM"
  return t.slice(0, 5);
}

function normalizeMyEndpoint(
  entries: MyEndpointEntry[],
  weekStart: Date,
  weekEnd: Date,
): NormalizedTimetable {
  const cells: NormalizedCell[] = entries.map((e) => ({
    schedule_id: e.schedule_id,
    weekday: e.weekday,
    period_order: e.period_order,
    period_name: `P${e.period_order}`,
    subject_name: e.subject_name ?? '',
    class_name: e.class_name,
    teacher_name: null,
    room_name: e.room_name,
    is_cover_duty: false,
    cover_for_name: null,
  }));
  const periodMap = new Map<number, { order: number; name: string; start_time: string }>();
  for (const e of entries) {
    if (!periodMap.has(e.period_order)) {
      periodMap.set(e.period_order, {
        order: e.period_order,
        name: `P${e.period_order}`,
        start_time: formatTime(e.start_time),
      });
    }
  }
  const weekdays = [...new Set(entries.map((e) => e.weekday))].sort((a, b) => a - b);
  return {
    label: null,
    week_start: weekStart.toISOString(),
    week_end: weekEnd.toISOString(),
    rotation_week_label: null,
    cells,
    periods: [...periodMap.values()].sort((a, b) => a.order - b.order),
    weekdays,
  };
}

function normalizeTimetableEntries(
  entries: TimetableEntryDto[],
  weekStart: Date,
  weekEnd: Date,
): NormalizedTimetable {
  // Derive period_order per unique start_time across the whole week.
  const uniqueTimes = [...new Set(entries.map((e) => e.start_time))].sort();
  const timeToOrder = new Map(uniqueTimes.map((t, i) => [t, i + 1]));

  const cells: NormalizedCell[] = entries.map((e) => {
    const order = timeToOrder.get(e.start_time) ?? 0;
    return {
      schedule_id: e.schedule_id,
      weekday: e.weekday,
      period_order: order,
      period_name: `P${order}`,
      subject_name: e.subject_name ?? '',
      class_name: e.class_name,
      teacher_name: e.teacher_name ?? null,
      room_name: e.room_name ?? null,
      is_cover_duty: false,
      cover_for_name: null,
    };
  });

  const periods = uniqueTimes.map((t, i) => ({
    order: i + 1,
    name: `P${i + 1}`,
    start_time: formatTime(t),
  }));

  const weekdays = [...new Set(entries.map((e) => e.weekday))].sort((a, b) => a - b);

  return {
    label: null,
    week_start: weekStart.toISOString(),
    week_end: weekEnd.toISOString(),
    rotation_week_label: null,
    cells,
    periods,
    weekdays,
  };
}

function normalizeParentEndpoint(res: ParentTimetableResponse): NormalizedTimetable {
  return {
    label: res.class_name,
    week_start: res.week_start,
    week_end: res.week_end,
    rotation_week_label: res.rotation_week_label,
    cells: res.cells.map((c) => ({
      schedule_id: `${c.weekday}-${c.period_order}`,
      weekday: c.weekday,
      period_order: c.period_order,
      period_name: c.period_name,
      subject_name: c.subject_name,
      class_name: res.class_name,
      teacher_name: c.teacher_name,
      room_name: c.room_name,
      is_cover_duty: false,
      cover_for_name: null,
    })),
    periods: res.periods.map((p) => ({
      order: p.order,
      name: p.name,
      start_time: formatTime(p.start_time),
    })),
    weekdays: res.weekdays,
  };
}

// ─── Rendering ─────────────────────────────────────────────────────────────────

function CoverAlert({ cells }: { cells: NormalizedCell[] }) {
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

function WeeklyGrid({ data, todayWeekday }: { data: NormalizedTimetable; todayWeekday: number }) {
  const t = useTranslations('scheduling.myTimetable');
  const cellMap = new Map<string, NormalizedCell>();
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
                        <p className="font-semibold">{cell.subject_name || '—'}</p>
                        <p className="opacity-80">{cell.class_name}</p>
                        {cell.teacher_name && <p className="opacity-70">{cell.teacher_name}</p>}
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

function DailyList({ data, day }: { data: NormalizedTimetable; day: number }) {
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
              <p className="text-sm font-semibold">{cell.subject_name || '—'}</p>
              <p className="text-xs opacity-80 mt-0.5">{cell.class_name}</p>
              {cell.teacher_name && <p className="text-xs opacity-75">{cell.teacher_name}</p>}
              {cell.room_name && <p className="text-xs opacity-70">{cell.room_name}</p>}
            </div>
            <div className="text-end">
              <p className="text-xs font-medium">{cell.period_name}</p>
              {cell.is_cover_duty && (
                <p className="text-xs text-warning-700 mt-0.5">{t('coverDutyBadge')}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Lookup picker ────────────────────────────────────────────────────────────

function LookupPicker({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  loading,
}: {
  items: LookupItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  loading: boolean;
}) {
  const [q, setQ] = React.useState('');
  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(term) || (i.sub ?? '').toLowerCase().includes(term),
    );
  }, [items, q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 max-w-md">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="ps-9"
        />
      </div>
      <Select value={value} onValueChange={onChange} disabled={loading || items.length === 0}>
        <SelectTrigger className="w-full sm:w-64">
          <SelectValue placeholder={loading ? '…' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {filtered.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.label}
              {i.sub ? <span className="ms-2 text-text-tertiary">{i.sub}</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Calendar subscription modal (unchanged) ──────────────────────────────────

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
  const { hasAnyRole, hasRole } = useRoleCheck();
  const isAdmin = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal');
  const isTeacher = hasRole('teacher') && !isAdmin;
  const isStudent = hasRole('student') && !isTeacher && !isAdmin;
  const isParent = hasRole('parent') && !isStudent && !isTeacher && !isAdmin;

  const modes = React.useMemo<ViewMode[]>(() => {
    if (isAdmin) return ['class', 'teacher', 'student'];
    if (isTeacher) return ['mine', 'class'];
    if (isParent) return ['child'];
    return ['mine']; // student or fallback
  }, [isAdmin, isTeacher, isParent]);

  const [mode, setMode] = React.useState<ViewMode>(modes[0] ?? 'mine');
  const [selectedId, setSelectedId] = React.useState('');
  const [data, setData] = React.useState<NormalizedTimetable | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [mobileDay, setMobileDay] = React.useState<number>(new Date().getDay());
  const [calOpen, setCalOpen] = React.useState(false);
  const [calUrl, setCalUrl] = React.useState('');

  const [academicYearId, setAcademicYearId] = React.useState<string>('');
  const [classes, setClasses] = React.useState<LookupItem[]>([]);
  const [teachers, setTeachers] = React.useState<LookupItem[]>([]);
  const [students, setStudents] = React.useState<LookupItem[]>([]);
  const [children, setChildren] = React.useState<LookupItem[]>([]);
  const [pickerLoading, setPickerLoading] = React.useState(false);

  const todayWeekday = new Date().getDay();

  // Sync default mode to the first allowed mode when role resolves
  React.useEffect(() => {
    if (modes.length > 0 && !modes.includes(mode)) {
      setMode(modes[0]!);
      setSelectedId('');
    }
  }, [modes, mode]);

  // Week range
  const { weekStart, weekEnd, weekDateIso } = React.useMemo(() => {
    const today = new Date();
    const mondayOffset = (today.getDay() + 6) % 7;
    const ws = new Date(today);
    ws.setDate(today.getDate() - mondayOffset + weekOffset * 7);
    ws.setHours(0, 0, 0, 0);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    return { weekStart: ws, weekEnd: we, weekDateIso: we.toISOString().slice(0, 10) };
  }, [weekOffset]);

  // Academic year (for admin + teacher "class" endpoints)
  React.useEffect(() => {
    if (!isAdmin && !isTeacher) return;
    apiClient<{ data: Array<{ id: string; name: string }> }>('/api/v1/academic-years?pageSize=20', {
      silent: true,
    })
      .then((res) => {
        const first = res.data?.[0];
        if (first) setAcademicYearId(first.id);
      })
      .catch((err) => {
        console.error('[MyTimetablePage]', err);
      });
  }, [isAdmin, isTeacher]);

  // Load picker options based on mode
  React.useEffect(() => {
    setPickerLoading(true);
    const load = async () => {
      try {
        if ((mode === 'class' || mode === 'teacher' || mode === 'student') && isAdmin) {
          if (mode === 'class' && classes.length === 0) {
            const res = await apiClient<{
              data: Array<{ id: string; name: string; subject?: { name: string } | null }>;
            }>('/api/v1/classes?pageSize=200&status=active');
            setClasses(
              (res.data ?? []).map((c) => ({
                id: c.id,
                label: c.name,
                sub: c.subject?.name ?? null,
              })),
            );
          } else if (mode === 'teacher' && teachers.length === 0) {
            const res = await apiClient<{
              data: Array<{ id: string; full_name: string; department?: string | null }>;
            }>('/api/v1/scheduling/teachers');
            setTeachers(
              (res.data ?? []).map((t) => ({
                id: t.id,
                label: t.full_name,
                sub: t.department ?? null,
              })),
            );
          } else if (mode === 'student' && students.length === 0) {
            const res = await apiClient<{
              data: Array<{
                id: string;
                first_name: string;
                last_name: string;
                student_number: string | null;
              }>;
            }>('/api/v1/students?pageSize=200&status=active');
            setStudents(
              (res.data ?? []).map((s) => ({
                id: s.id,
                label: `${s.first_name} ${s.last_name}`.trim(),
                sub: s.student_number ?? null,
              })),
            );
          }
        } else if (mode === 'class' && isTeacher && classes.length === 0) {
          const res = await apiClient<{
            data: Array<{ id: string; name: string; subject?: { name: string } | null }>;
          }>('/api/v1/classes?pageSize=200&status=active');
          setClasses(
            (res.data ?? []).map((c) => ({
              id: c.id,
              label: c.name,
              sub: c.subject?.name ?? null,
            })),
          );
        } else if (mode === 'child' && isParent && children.length === 0) {
          const res = await apiClient<{
            students: Array<{ student_id: string; first_name: string; last_name: string }>;
          }>('/api/v1/dashboard/parent', { silent: true });
          const list = (res.students ?? []).map((s) => ({
            id: s.student_id,
            label: `${s.first_name} ${s.last_name}`.trim(),
          }));
          setChildren(list);
          if (list.length > 0 && !selectedId) setSelectedId(list[0]!.id);
        }
      } catch (err) {
        console.error('[MyTimetablePage]', err);
      } finally {
        setPickerLoading(false);
      }
    };
    void load();
  }, [
    mode,
    isAdmin,
    isTeacher,
    isParent,
    classes.length,
    teachers.length,
    students.length,
    children.length,
    selectedId,
  ]);

  // Fetch timetable based on mode
  const fetchTimetable = React.useCallback(async () => {
    setLoading(true);
    setData(null);
    try {
      if (mode === 'mine') {
        // Teacher's own or student's own
        if (isStudent) {
          const res = await apiClient<ParentTimetableResponse>('/api/v1/parent/timetable/self', {
            silent: true,
          });
          setData(normalizeParentEndpoint(res));
        } else {
          const res = await apiClient<{ data: MyEndpointEntry[] }>(
            `/api/v1/scheduling/timetable/my?week_date=${weekDateIso}`,
          );
          setData(normalizeMyEndpoint(res.data ?? [], weekStart, weekEnd));
        }
      } else if (mode === 'class' && selectedId && academicYearId) {
        const res = await apiClient<{ data: TimetableEntryDto[] }>(
          `/api/v1/timetables/class/${selectedId}?academic_year_id=${academicYearId}&week_start=${weekDateIso}`,
        );
        setData(normalizeTimetableEntries(res.data ?? [], weekStart, weekEnd));
      } else if (mode === 'teacher' && selectedId && academicYearId) {
        const res = await apiClient<{ data: TimetableEntryDto[] }>(
          `/api/v1/timetables/teacher/${selectedId}?academic_year_id=${academicYearId}&week_start=${weekDateIso}`,
        );
        setData(normalizeTimetableEntries(res.data ?? [], weekStart, weekEnd));
      } else if (mode === 'student' && selectedId && academicYearId) {
        const res = await apiClient<{ data: TimetableEntryDto[] }>(
          `/api/v1/timetables/student/${selectedId}?academic_year_id=${academicYearId}&week_start=${weekDateIso}`,
        );
        setData(normalizeTimetableEntries(res.data ?? [], weekStart, weekEnd));
      } else if (mode === 'child' && selectedId) {
        const res = await apiClient<ParentTimetableResponse>(
          `/api/v1/parent/timetable?student_id=${selectedId}`,
          { silent: true },
        );
        setData(normalizeParentEndpoint(res));
      }
    } catch (err) {
      console.error('[MyTimetablePage]', err);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [mode, selectedId, academicYearId, weekDateIso, weekStart, weekEnd, isStudent]);

  React.useEffect(() => {
    const needsSelection = mode !== 'mine' && !selectedId;
    const needsAcademicYear =
      (mode === 'class' || mode === 'teacher' || mode === 'student') && !academicYearId;
    if (needsSelection || needsAcademicYear) {
      setData(null);
      setLoading(false);
      return;
    }
    void fetchTimetable();
  }, [fetchTimetable, mode, selectedId, academicYearId]);

  const handleExportCalendar = async () => {
    try {
      const res = await apiClient<{ url: string }>('/api/v1/calendar/subscription-url');
      setCalUrl(res.url);
      setCalOpen(true);
    } catch (err) {
      console.error('[MyTimetablePage]', err);
      toast.error(t('calendarError'));
    }
  };

  const handlePrint = () => window.print();

  const weekDateRange = data?.week_start
    ? `${new Date(data.week_start).toLocaleDateString()} – ${new Date(data.week_end ?? data.week_start).toLocaleDateString()}`
    : `${weekStart.toLocaleDateString()} – ${weekEnd.toLocaleDateString()}`;

  const pageDescription = (() => {
    if (isAdmin) return t('descriptionAdmin');
    if (isTeacher) return t('descriptionTeacher');
    if (isParent) return t('descriptionParent');
    return t('description');
  })();

  const lookupItems =
    mode === 'class'
      ? classes
      : mode === 'teacher'
        ? teachers
        : mode === 'student'
          ? students
          : mode === 'child'
            ? children
            : [];

  const pickerLabel = (() => {
    if (mode === 'class') return t('pickClass');
    if (mode === 'teacher') return t('pickTeacher');
    if (mode === 'student') return t('pickStudent');
    if (mode === 'child') return t('pickChild');
    return '';
  })();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={pageDescription}
        actions={
          !isAdmin && !isParent ? (
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
          ) : null
        }
      />

      {/* Mode tabs (hidden for students) */}
      {modes.length > 1 && (
        <div className="flex gap-1 border-b border-border">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setSelectedId('');
                setData(null);
              }}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                mode === m
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(`mode.${m}`)}
            </button>
          ))}
        </div>
      )}

      {/* Picker */}
      {mode !== 'mine' && (
        <LookupPicker
          items={lookupItems}
          value={selectedId}
          onChange={setSelectedId}
          placeholder={pickerLabel}
          searchPlaceholder={t('searchPlaceholder')}
          loading={pickerLoading}
        />
      )}

      {/* Week navigation — hidden for parent/student self-views (their endpoints return current week) */}
      {(mode === 'mine' || mode === 'class' || mode === 'teacher' || mode === 'student') &&
        !isStudent && (
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>
              <ChevronLeft className="h-4 w-4 rtl:rotate-180 me-1" />
              {t('prevWeek')}
            </Button>
            <div className="flex items-center gap-2">
              {data?.rotation_week_label && (
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  {data.rotation_week_label}
                </Badge>
              )}
              <span className="text-xs text-text-tertiary">{weekDateRange}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
              {t('nextWeek')}
              <ChevronRight className="h-4 w-4 rtl:rotate-180 ms-1" />
            </Button>
          </div>
        )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : !data ? (
        mode !== 'mine' && !selectedId ? (
          <p className="py-8 text-center text-sm text-text-secondary">{t('pickToBegin')}</p>
        ) : (
          <p className="py-8 text-center text-sm text-text-secondary">{t('noTimetable')}</p>
        )
      ) : (
        <>
          {data.label && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-text-secondary">
              <span className="font-medium text-text-primary">{data.label}</span>
            </div>
          )}

          <CoverAlert cells={data.cells} />

          <div className="hidden md:block print:block">
            <WeeklyGrid data={data} todayWeekday={todayWeekday} />
          </div>

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
