'use client';

import { Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Input } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { DiaryDateNavigator } from './_components/diary-date-navigator';
import { DiaryDayView } from './_components/diary-day-view';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  student_code: string | null;
  class_entity?: { id: string; name: string } | null;
}

interface StudentListResponse {
  data: StudentRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiaryPage() {
  const t = useTranslations('diary');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [students, setStudents] = React.useState<StudentRow[]>([]);
  const [search, setSearch] = React.useState('');
  const [selectedStudent, setSelectedStudent] = React.useState<StudentRow | null>(null);
  const [selectedDate, setSelectedDate] = React.useState(todayISO);
  const [isLoading, setIsLoading] = React.useState(false);
  const [showDropdown, setShowDropdown] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // ─── Fetch students ─────────────────────────────────────────────────────────

  const fetchStudents = React.useCallback(async (term: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '30' });
      if (term.trim()) params.set('search', term.trim());
      const res = await apiClient<StudentListResponse>(`/api/v1/students?${params.toString()}`);
      setStudents(res.data);
    } catch (err) {
      console.error('[DiaryPage.fetchStudents]', err);
      setStudents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      void fetchStudents(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, fetchStudents]);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleSelectStudent(student: StudentRow) {
    setSelectedStudent(student);
    setSearch(`${student.first_name} ${student.last_name}`);
    setShowDropdown(false);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Student selector */}
      <div ref={wrapperRef} className="relative max-w-md">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          <Input
            className="ps-10 text-base"
            placeholder={t('searchStudents')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setShowDropdown(true);
              if (!e.target.value.trim()) setSelectedStudent(null);
            }}
            onFocus={() => setShowDropdown(true)}
          />
        </div>

        {showDropdown && (
          <div className="bg-card absolute z-50 mt-1 w-full overflow-hidden rounded-lg border shadow-md">
            <div className="max-h-64 overflow-y-auto">
              {isLoading ? (
                <p className="text-muted-foreground p-3 text-sm">{t('searchStudents')}</p>
              ) : students.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">{t('noStudentSelected')}</p>
              ) : (
                students.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="hover:bg-muted flex w-full items-center gap-3 px-3 py-2 text-start text-sm transition-colors"
                    onClick={() => handleSelectStudent(s)}
                  >
                    <span className="font-medium">
                      {s.first_name} {s.last_name}
                    </span>
                    {s.class_entity && (
                      <span className="text-muted-foreground text-xs">{s.class_entity.name}</span>
                    )}
                    {s.student_code && (
                      <span className="text-muted-foreground ms-auto text-xs">
                        {s.student_code}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Date navigator + day view */}
      {selectedStudent ? (
        <>
          <DiaryDateNavigator
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            locale={locale}
          />
          <DiaryDayView
            studentId={selectedStudent.id}
            classId={selectedStudent.class_entity?.id ?? null}
            selectedDate={selectedDate}
          />
        </>
      ) : (
        <p className="text-muted-foreground py-12 text-center text-sm">{t('noStudentSelected')}</p>
      )}
    </div>
  );
}
