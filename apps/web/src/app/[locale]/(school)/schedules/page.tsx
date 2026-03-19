'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ScheduleForm } from './_components/schedule-form';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface SelectOption {
  id: string;
  name: string;
}

interface ScheduleRow {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string | null;
  source: string;
  class: { id: string; name: string };
  teacher: { id: string; name: string } | null;
  room: { id: string; name: string } | null;
}

interface SchedulesResponse {
  data: ScheduleRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_KEYS: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

function formatTime(time: string): string {
  const parts = time.split(':');
  const hours = parts[0] ?? '0';
  const minutes = parts[1] ?? '00';
  const h = parseInt(hours, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${minutes} ${period}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SchedulesPage() {
  const t = useTranslations('scheduling');

  const [data, setData] = React.useState<ScheduleRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [classes, setClasses] = React.useState<SelectOption[]>([]);
  const [teachers, setTeachers] = React.useState<SelectOption[]>([]);
  const [rooms, setRooms] = React.useState<SelectOption[]>([]);

  const [yearFilter, setYearFilter] = React.useState('all');
  const [classFilter, setClassFilter] = React.useState('all');
  const [teacherFilter, setTeacherFilter] = React.useState('all');
  const [roomFilter, setRoomFilter] = React.useState('all');
  const [weekdayFilter, setWeekdayFilter] = React.useState('all');

  const [formOpen, setFormOpen] = React.useState(false);

  React.useEffect(() => {
    Promise.all([
      apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=100'),
      apiClient<ListResponse<SelectOption>>('/api/v1/classes?pageSize=100'),
      apiClient<ListResponse<SelectOption>>('/api/v1/staff-profiles?pageSize=100'),
      apiClient<ListResponse<SelectOption>>('/api/v1/rooms?pageSize=100'),
    ])
      .then(([yearsRes, classesRes, teachersRes, roomsRes]) => {
        setAcademicYears(yearsRes.data);
        setClasses(classesRes.data);
        setTeachers(teachersRes.data);
        setRooms(roomsRes.data);
      })
      .catch(() => undefined);
  }, []);

  const fetchSchedules = React.useCallback(
    async (p: number, year: string, cls: string, teacher: string, room: string, day: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (year !== 'all') params.set('academic_year_id', year);
        if (cls !== 'all') params.set('class_id', cls);
        if (teacher !== 'all') params.set('teacher_id', teacher);
        if (room !== 'all') params.set('room_id', room);
        if (day !== 'all') params.set('weekday', day);
        const res = await apiClient<SchedulesResponse>(`/api/v1/schedules?${params.toString()}`);
        setData(res.data);
        setTotal(res.meta.total);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchSchedules(page, yearFilter, classFilter, teacherFilter, roomFilter, weekdayFilter);
  }, [page, yearFilter, classFilter, teacherFilter, roomFilter, weekdayFilter, fetchSchedules]);

  const columns = [
    {
      key: 'class',
      header: 'Class',
      render: (row: ScheduleRow) => (
        <span className="font-medium text-text-primary">{row.class.name}</span>
      ),
    },
    {
      key: 'teacher',
      header: t('teacher'),
      render: (row: ScheduleRow) => (
        <span className="text-text-secondary">{row.teacher?.name ?? '—'}</span>
      ),
    },
    {
      key: 'room',
      header: t('room'),
      render: (row: ScheduleRow) => (
        <span className="text-text-secondary">{row.room?.name ?? '—'}</span>
      ),
    },
    {
      key: 'weekday',
      header: t('weekday'),
      render: (row: ScheduleRow) => (
        <span className="text-text-secondary">{t(WEEKDAY_KEYS[row.weekday])}</span>
      ),
    },
    {
      key: 'time',
      header: t('startTime'),
      render: (row: ScheduleRow) => (
        <span className="text-text-secondary font-mono text-xs">
          {formatTime(row.start_time)} – {formatTime(row.end_time)}
        </span>
      ),
    },
    {
      key: 'dates',
      header: t('effectiveFrom'),
      render: (row: ScheduleRow) => (
        <span className="text-text-secondary text-xs">
          {row.effective_from}{row.effective_to ? ` → ${row.effective_to}` : ''}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (row: ScheduleRow) => (
        <Badge variant="secondary" className="text-xs capitalize">{row.source}</Badge>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setPage(1); }}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Academic Year" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Years</SelectItem>
          {academicYears.map((y) => (
            <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1); }}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Class" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Classes</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={teacherFilter} onValueChange={(v) => { setTeacherFilter(v); setPage(1); }}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Teacher" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Teachers</SelectItem>
          {teachers.map((tr) => (
            <SelectItem key={tr.id} value={tr.id}>{tr.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={roomFilter} onValueChange={(v) => { setRoomFilter(v); setPage(1); }}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Room" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Rooms</SelectItem>
          {rooms.map((r) => (
            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={weekdayFilter} onValueChange={(v) => { setWeekdayFilter(v); setPage(1); }}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Day" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Days</SelectItem>
          <SelectItem value="1">{t('monday')}</SelectItem>
          <SelectItem value="2">{t('tuesday')}</SelectItem>
          <SelectItem value="3">{t('wednesday')}</SelectItem>
          <SelectItem value="4">{t('thursday')}</SelectItem>
          <SelectItem value="5">{t('friday')}</SelectItem>
          <SelectItem value="6">{t('saturday')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('schedules')}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('createSchedule')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <ScheduleForm
        open={formOpen}
        onOpenChange={setFormOpen}
        onSuccess={() => void fetchSchedules(page, yearFilter, classFilter, teacherFilter, roomFilter, weekdayFilter)}
      />
    </div>
  );
}
