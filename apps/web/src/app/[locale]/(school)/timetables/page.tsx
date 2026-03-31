'use client';

import { Badge, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  EVENT_TYPE_OPTIONS,
  type EngagementCalendarEventRecord,
} from '@/app/[locale]/(school)/engagement/_components/engagement-types';
import { EngagementSchoolCalendar } from '@/components/engagement-school-calendar';
import { PageHeader } from '@/components/page-header';
import { TimetableGrid } from '@/components/timetable-grid';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface SelectOption {
  id: string;
  name: string;
}

interface TimetableEntry {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  class_name: string;
  room_name?: string;
  teacher_name?: string;
  subject_name?: string;
}

interface ListResponse<T> {
  data: T[];
}

interface EngagementCalendarResponse {
  data: EngagementCalendarEventRecord[];
}

type ViewTab = 'teacher' | 'room' | 'student';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimetablesPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('scheduling');
  const te = useTranslations('engagement');

  const [activeTab, setActiveTab] = React.useState<ViewTab>('teacher');
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearFilter, setYearFilter] = React.useState('all');

  const [teachers, setTeachers] = React.useState<SelectOption[]>([]);
  const [rooms, setRooms] = React.useState<SelectOption[]>([]);
  const [students, setStudents] = React.useState<SelectOption[]>([]);

  const [selectedEntity, setSelectedEntity] = React.useState('');
  const [entries, setEntries] = React.useState<TimetableEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  const initialDate = React.useMemo(() => new Date(), []);
  const [calendarMonth, setCalendarMonth] = React.useState(initialDate.getMonth());
  const [calendarYear, setCalendarYear] = React.useState(initialDate.getFullYear());
  const [calendarTypeFilter, setCalendarTypeFilter] = React.useState('all');
  const [calendarEvents, setCalendarEvents] = React.useState<EngagementCalendarEventRecord[]>([]);
  const [calendarLoading, setCalendarLoading] = React.useState(true);
  const [calendarUnavailable, setCalendarUnavailable] = React.useState(false);

  React.useEffect(() => {
    Promise.all([
      apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=100'),
      apiClient<{ data: Array<{ id: string; user?: { first_name: string; last_name: string } }> }>(
        '/api/v1/staff-profiles?pageSize=100',
      ),
      apiClient<ListResponse<SelectOption>>('/api/v1/rooms?pageSize=100'),
      apiClient<ListResponse<SelectOption>>('/api/v1/students?pageSize=100'),
    ])
      .then(([yearsRes, teachersRes, roomsRes, studentsRes]) => {
        setAcademicYears(yearsRes.data);
        setTeachers(
          (teachersRes.data ?? []).map((staff) => ({
            id: staff.id,
            name: staff.user ? `${staff.user.first_name} ${staff.user.last_name}` : staff.id,
          })),
        );
        setRooms(roomsRes.data);
        setStudents(studentsRes.data);
      })
      .catch((error) => {
        console.error('[TimetablesPage.loadFilters]', error);
      });
  }, []);

  React.useEffect(() => {
    if (!selectedEntity) {
      setEntries([]);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams();

    if (yearFilter !== 'all') {
      params.set('academic_year_id', yearFilter);
    }

    const endpoint =
      activeTab === 'teacher'
        ? `/api/v1/timetables/teacher/${selectedEntity}`
        : activeTab === 'room'
          ? `/api/v1/timetables/room/${selectedEntity}`
          : `/api/v1/timetables/student/${selectedEntity}`;

    apiClient<ListResponse<TimetableEntry>>(`${endpoint}?${params.toString()}`)
      .then((response) => setEntries(response.data))
      .catch((error) => {
        console.error('[TimetablesPage.fetchTimetable]', error);
        setEntries([]);
      })
      .finally(() => setLoading(false));
  }, [activeTab, selectedEntity, yearFilter]);

  React.useEffect(() => {
    const fetchCalendarEvents = async () => {
      setCalendarLoading(true);
      setCalendarUnavailable(false);

      try {
        const startDate = new Date(Date.UTC(calendarYear, calendarMonth, 1));
        const endDate = new Date(Date.UTC(calendarYear, calendarMonth + 1, 0));
        const params = new URLSearchParams({
          date_from: startDate.toISOString().slice(0, 10),
          date_to: endDate.toISOString().slice(0, 10),
        });

        if (yearFilter !== 'all') {
          params.set('academic_year_id', yearFilter);
        }

        if (calendarTypeFilter !== 'all') {
          params.set('event_type', calendarTypeFilter);
        }

        const response = await apiClient<EngagementCalendarResponse>(
          `/api/v1/engagement/calendar-events?${params.toString()}`,
          { silent: true },
        );

        setCalendarEvents(response.data);
      } catch (error) {
        console.error('[TimetablesPage.fetchCalendarEvents]', error);
        setCalendarEvents([]);
        setCalendarUnavailable(true);
      } finally {
        setCalendarLoading(false);
      }
    };

    void fetchCalendarEvents();
  }, [calendarMonth, calendarTypeFilter, calendarYear, yearFilter]);

  const handleTabChange = (tab: ViewTab) => {
    setActiveTab(tab);
    setSelectedEntity('');
    setEntries([]);
  };

  const entityOptions: SelectOption[] =
    activeTab === 'teacher' ? teachers : activeTab === 'room' ? rooms : students;

  const tabs: { key: ViewTab; label: string }[] = [
    { key: 'teacher', label: t('teacher') },
    { key: 'room', label: t('room') },
    { key: 'student', label: t('student') },
  ];
  const selectedEntityPlaceholder =
    activeTab === 'teacher'
      ? t('selectTeacher')
      : activeTab === 'room'
        ? t('selectRoom')
        : t('selectStudent');

  return (
    <div className="space-y-6">
      <PageHeader title={t('timetables')} />

      <section className="rounded-3xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">
                {te('calendar.schoolCalendarTitle')}
              </h2>
              <Badge variant="secondary">{te('calendar.integratedBadge')}</Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-text-secondary">
              {te('calendar.schoolCalendarDescription')}
            </p>
          </div>

          <div className="w-full sm:w-56">
            <Select value={calendarTypeFilter} onValueChange={setCalendarTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder={te('calendar.filterByType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{te('calendar.allEventTypes')}</SelectItem>
                {EVENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {te(`eventTypes.${option.label}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5">
          {calendarUnavailable ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface-secondary/50 p-8 text-center text-sm text-text-tertiary">
              {te('calendar.unavailable')}
            </div>
          ) : (
            <EngagementSchoolCalendar
              events={calendarEvents}
              month={calendarMonth}
              year={calendarYear}
              isLoading={calendarLoading}
              onMonthChange={(month, year) => {
                setCalendarMonth(month);
                setCalendarYear(year);
              }}
              onEventClick={(event) => router.push(`/${locale}${event.href}`)}
            />
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t('academicYear')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allAcademicYears')}</SelectItem>
            {academicYears.map((year) => (
              <SelectItem key={year.id} value={year.id}>
                {year.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-4">
        <div className="flex gap-1 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-b-2 border-primary-700 text-primary-700'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue placeholder={selectedEntityPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {entityOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="h-60 animate-pulse rounded-xl bg-surface-secondary" />
        ) : (
          <TimetableGrid entries={entries} />
        )}
      </div>
    </div>
  );
}
