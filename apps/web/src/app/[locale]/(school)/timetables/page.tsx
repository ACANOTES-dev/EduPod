'use client';

import { Building, Calendar, ExternalLink, GraduationCap, Printer, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
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

import {
  EVENT_TYPE_OPTIONS,
  type EngagementCalendarEventRecord,
} from '@/app/[locale]/(school)/engagement/_components/engagement-types';
import { EngagementSchoolCalendar } from '@/components/engagement-school-calendar';
import { PageHeader } from '@/components/page-header';
import { TimetableGrid, type CellLabel, type TimetableEntry } from '@/components/timetable-grid';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
  year_group_id?: string | null;
  year_group?: { id: string; name: string } | null;
}

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

interface EngagementCalendarResponse {
  data: EngagementCalendarEventRecord[];
}

type ViewTab = 'class' | 'teacher' | 'student' | 'room';

// ─── Cell labels per audience ─────────────────────────────────────────────────

const CELL_LABELS: Record<ViewTab, (e: TimetableEntry) => CellLabel> = {
  // For class view: subject (if set) → teacher → room. When no subject, show teacher larger and skip class duplicate.
  class: (e) =>
    e.subject_name
      ? { primary: e.subject_name, secondary: e.teacher_name, tertiary: e.room_name }
      : { primary: e.teacher_name ?? e.class_name, secondary: e.room_name ?? undefined },
  // Teacher view: subject + class (or class only when no subject) + room.
  teacher: (e) =>
    e.subject_name
      ? { primary: e.subject_name, secondary: e.class_name, tertiary: e.room_name }
      : { primary: e.class_name, secondary: e.room_name ?? undefined },
  // Student view: subject + teacher + room (or class instead of subject when no subject).
  student: (e) =>
    e.subject_name
      ? { primary: e.subject_name, secondary: e.teacher_name, tertiary: e.room_name }
      : { primary: e.class_name, secondary: e.teacher_name ?? undefined },
  // Room view: class + teacher + subject (or class + teacher when no subject).
  room: (e) =>
    e.subject_name
      ? { primary: e.class_name, secondary: e.teacher_name, tertiary: e.subject_name }
      : { primary: e.class_name, secondary: e.teacher_name ?? undefined },
};

const TAB_ICONS: Record<ViewTab, React.ComponentType<{ className?: string }>> = {
  class: GraduationCap,
  teacher: Users,
  student: Users,
  room: Building,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimetablesPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('scheduling');
  const te = useTranslations('engagement');

  const [activeTab, setActiveTab] = React.useState<ViewTab>('class');
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearFilter, setYearFilter] = React.useState('all');

  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [teachers, setTeachers] = React.useState<SelectOption[]>([]);
  const [rooms, setRooms] = React.useState<SelectOption[]>([]);
  const [students, setStudents] = React.useState<SelectOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);
  const [yearGroupFilter, setYearGroupFilter] = React.useState<string>('all');

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
    // Use Promise.allSettled so a single 4xx (e.g., a teacher hitting /students)
    // doesn't blank-out the whole picker UI for the other entity types.
    Promise.allSettled([
      apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=100', {
        silent: true,
      }),
      apiClient<{ data: Array<{ id: string; user?: { first_name: string; last_name: string } }> }>(
        '/api/v1/staff-profiles?pageSize=100',
        { silent: true },
      ),
      apiClient<ListResponse<SelectOption>>('/api/v1/rooms?pageSize=100', { silent: true }),
      apiClient<ListResponse<SelectOption>>('/api/v1/students?pageSize=100', { silent: true }),
      apiClient<ListResponse<ClassOption>>('/api/v1/classes?pageSize=100', { silent: true }),
      apiClient<ListResponse<SelectOption>>('/api/v1/year-groups?pageSize=50', { silent: true }),
    ])
      .then((results) => {
        const [yearsRes, teachersRes, roomsRes, studentsRes, classesRes, yearGroupsRes] =
          results.map((r) => (r.status === 'fulfilled' ? r.value : { data: [] as unknown[] })) as [
            ListResponse<AcademicYear>,
            { data: Array<{ id: string; user?: { first_name: string; last_name: string } }> },
            ListResponse<SelectOption>,
            ListResponse<SelectOption>,
            ListResponse<ClassOption>,
            ListResponse<SelectOption>,
          ];
        setAcademicYears(yearsRes.data);
        // Default yearFilter to the first academic year (active year is typically first)
        if (yearsRes.data.length > 0 && yearsRes.data[0]) {
          setYearFilter(yearsRes.data[0].id);
        }
        setTeachers(
          (teachersRes.data ?? []).map((staff) => ({
            id: staff.id,
            name: staff.user ? `${staff.user.first_name} ${staff.user.last_name}` : staff.id,
          })),
        );
        setRooms(roomsRes.data);
        setStudents(studentsRes.data);
        setClasses(classesRes.data);
        setYearGroups(yearGroupsRes.data);
      })
      .catch((error) => {
        console.error('[TimetablesPage.loadFilters]', error);
      });
  }, []);

  React.useEffect(() => {
    if (!selectedEntity || yearFilter === 'all') {
      setEntries([]);
      return;
    }

    setLoading(true);
    const params = new URLSearchParams({ academic_year_id: yearFilter });

    const endpoint =
      activeTab === 'class'
        ? `/api/v1/timetables/class/${selectedEntity}`
        : activeTab === 'teacher'
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
    setYearGroupFilter('all');
  };

  // Class tab gets year-group filtered options
  const filteredClasses = React.useMemo(() => {
    if (activeTab !== 'class' || yearGroupFilter === 'all') return classes;
    return classes.filter(
      (c) => c.year_group_id === yearGroupFilter || c.year_group?.id === yearGroupFilter,
    );
  }, [activeTab, classes, yearGroupFilter]);

  const entityOptions: SelectOption[] =
    activeTab === 'class'
      ? filteredClasses.map((c) => ({ id: c.id, name: c.name }))
      : activeTab === 'teacher'
        ? teachers
        : activeTab === 'room'
          ? rooms
          : students;

  const tabs: { key: ViewTab; label: string }[] = [
    { key: 'class', label: t('class') },
    { key: 'teacher', label: t('teacher') },
    { key: 'student', label: t('student') },
    { key: 'room', label: t('room') },
  ];

  const selectedEntityPlaceholder =
    activeTab === 'class'
      ? t('selectClass')
      : activeTab === 'teacher'
        ? t('selectTeacher')
        : activeTab === 'room'
          ? t('selectRoom')
          : t('selectStudent');

  const selectedName =
    activeTab === 'class'
      ? classes.find((c) => c.id === selectedEntity)?.name
      : activeTab === 'teacher'
        ? teachers.find((tt) => tt.id === selectedEntity)?.name
        : activeTab === 'room'
          ? rooms.find((r) => r.id === selectedEntity)?.name
          : students.find((s) => s.id === selectedEntity)?.name;

  const showPrintButton = activeTab === 'room' && selectedEntity;

  return (
    <div className="space-y-6">
      <PageHeader title={t('timetables')} description={t('timetablesDescription')} />

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

      <section className="rounded-3xl border border-border bg-surface p-5 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-text-primary">{t('weeklyTimetable')}</h2>
          </div>
          <div className="w-full sm:w-56">
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t('academicYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((year) => (
                  <SelectItem key={year.id} value={year.id}>
                    {year.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.key];
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-b-2 border-primary-700 text-primary-700'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          {activeTab === 'class' && (
            <Select value={yearGroupFilter} onValueChange={setYearGroupFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder={t('yearGroup')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allYearGroups')}</SelectItem>
                {yearGroups.map((yg) => (
                  <SelectItem key={yg.id} value={yg.id}>
                    {yg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

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

          {showPrintButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.open(
                  `/${locale}/timetables/rooms/${selectedEntity}/print?academic_year_id=${yearFilter}`,
                  '_blank',
                );
              }}
            >
              <Printer className="h-4 w-4 me-2" />
              {t('print')}
              <ExternalLink className="h-3 w-3 ms-1.5" />
            </Button>
          )}
        </div>

        {/* Grid */}
        {!selectedEntity ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-secondary/30 p-12 text-center">
            <Calendar className="h-10 w-10 mx-auto text-text-tertiary mb-2" />
            <p className="text-sm text-text-tertiary">{selectedEntityPlaceholder}</p>
          </div>
        ) : loading ? (
          <div className="h-80 animate-pulse rounded-xl bg-surface-secondary" />
        ) : (
          <>
            {selectedName && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-tertiary">{t('viewing')}:</span>
                <span className="font-medium text-text-primary">{selectedName}</span>
              </div>
            )}
            <TimetableGrid entries={entries} getCellLabel={CELL_LABELS[activeTab]} />
          </>
        )}
      </section>
    </div>
  );
}
