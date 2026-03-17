'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

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

type ViewTab = 'teacher' | 'room' | 'student';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimetablesPage() {
  const t = useTranslations('scheduling');

  const [activeTab, setActiveTab] = React.useState<ViewTab>('teacher');
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearFilter, setYearFilter] = React.useState('all');

  const [teachers, setTeachers] = React.useState<SelectOption[]>([]);
  const [rooms, setRooms] = React.useState<SelectOption[]>([]);
  const [students, setStudents] = React.useState<SelectOption[]>([]);

  const [selectedEntity, setSelectedEntity] = React.useState('');
  const [entries, setEntries] = React.useState<TimetableEntry[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    Promise.all([
      apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=100'),
      apiClient<ListResponse<SelectOption>>('/api/v1/staff-profiles?pageSize=200'),
      apiClient<ListResponse<SelectOption>>('/api/v1/rooms?pageSize=200'),
      apiClient<ListResponse<SelectOption>>('/api/v1/students?pageSize=200'),
    ])
      .then(([yearsRes, teachersRes, roomsRes, studentsRes]) => {
        setAcademicYears(yearsRes.data);
        setTeachers(teachersRes.data);
        setRooms(roomsRes.data);
        setStudents(studentsRes.data);
      })
      .catch(() => undefined);
  }, []);

  React.useEffect(() => {
    if (!selectedEntity) {
      setEntries([]);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (yearFilter !== 'all') params.set('academic_year_id', yearFilter);

    const endpoint =
      activeTab === 'teacher'
        ? `/api/v1/timetables/teacher/${selectedEntity}`
        : activeTab === 'room'
          ? `/api/v1/timetables/room/${selectedEntity}`
          : `/api/v1/timetables/student/${selectedEntity}`;

    apiClient<ListResponse<TimetableEntry>>(`${endpoint}?${params.toString()}`)
      .then((res) => setEntries(res.data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [activeTab, selectedEntity, yearFilter]);

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

  return (
    <div className="space-y-6">
      <PageHeader title={t('timetables')} />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Academic Year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {academicYears.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
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

        {/* Entity selector */}
        <div className="flex items-center gap-3">
          <Select value={selectedEntity} onValueChange={setSelectedEntity}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={`Select ${activeTab}`} />
            </SelectTrigger>
            <SelectContent>
              {entityOptions.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>{opt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="h-60 animate-pulse rounded-xl bg-surface-secondary" />
        ) : (
          <TimetableGrid entries={entries} />
        )}
      </div>
    </div>
  );
}
