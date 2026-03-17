'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
  student_count?: number;
}

interface SubjectOption {
  id: string;
  name: string;
}

interface StaffOption {
  id: string;
  name: string;
}

interface RoomOption {
  id: string;
  name: string;
  room_type: string;
}

interface Requirement {
  id: string;
  academic_year_id: string;
  class_id: string;
  subject_id: string;
  teacher_id: string | null;
  periods_per_week: number;
  room_type: string | null;
  preferred_room_id: string | null;
  max_consecutive: number | null;
  min_consecutive: number | null;
  spread_across_week: boolean;
  student_count: number | null;
  class?: { id: string; name: string };
  subject?: { id: string; name: string };
  teacher?: { id: string; name: string } | null;
  preferred_room?: { id: string; name: string } | null;
}

interface RequirementsResponse {
  data: Requirement[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Inline edit cell ─────────────────────────────────────────────────────────

function EditableNumber({
  value,
  onSave,
  min = 1,
  max = 20,
}: {
  value: number | null;
  onSave: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(String(value ?? ''));

  const commit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= min && n <= max) onSave(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type="number"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="h-7 w-16 text-center text-xs"
      />
    );
  }

  return (
    <button
      className="rounded px-2 py-0.5 text-sm hover:bg-surface-secondary"
      onClick={() => {
        setDraft(String(value ?? ''));
        setEditing(true);
      }}
    >
      {value ?? '—'}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function RequirementsPage() {
  const t = useTranslations('scheduling');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  const [staff, setStaff] = React.useState<StaffOption[]>([]);
  const [rooms, setRooms] = React.useState<RoomOption[]>([]);

  const [data, setData] = React.useState<Requirement[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(false);

  const [classFilter, setClassFilter] = React.useState('all');

  // Load reference data
  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: ClassOption[] }>('/api/v1/classes?pageSize=200'),
      apiClient<{ data: SubjectOption[] }>('/api/v1/subjects?pageSize=200'),
      apiClient<{ data: StaffOption[] }>('/api/v1/staff-profiles?pageSize=200'),
      apiClient<{ data: RoomOption[] }>('/api/v1/rooms?pageSize=200'),
    ])
      .then(([yearsRes, classesRes, subjectsRes, staffRes, roomsRes]) => {
        setAcademicYears(yearsRes.data);
        setClasses(classesRes.data);
        setSubjects(subjectsRes.data);
        setStaff(staffRes.data);
        setRooms(roomsRes.data);
        if (yearsRes.data.length > 0 && yearsRes.data[0]) {
          setSelectedYear(yearsRes.data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load reference data'));
  }, []);

  const fetchRequirements = React.useCallback(
    async (p: number, year: string, cls: string) => {
      if (!year) return;
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
          academic_year_id: year,
        });
        if (cls !== 'all') params.set('class_id', cls);
        const res = await apiClient<RequirementsResponse>(
          `/api/v1/class-scheduling-requirements?${params.toString()}`,
        );
        setData(res.data);
        setTotal(res.meta.total);
      } catch {
        setData([]);
        setTotal(0);
        toast.error('Failed to load requirements');
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchRequirements(page, selectedYear, classFilter);
  }, [page, selectedYear, classFilter, fetchRequirements]);

  const updateRequirement = async (id: string, patch: Partial<Requirement>) => {
    try {
      const updated = await apiClient<Requirement>(
        `/api/v1/class-scheduling-requirements/${id}`,
        { method: 'PATCH', body: JSON.stringify(patch) },
      );
      setData((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    } catch {
      toast.error('Failed to update requirement');
    }
  };

  // Completeness: how many classes have at least one requirement configured
  const configuredClassIds = new Set(data.map((r) => r.class_id));
  const configuredCount = configuredClassIds.size;
  const totalClasses = classes.length;

  const columns = [
    {
      key: 'class',
      header: 'Class',
      render: (row: Requirement) => (
        <span className="font-medium">{row.class?.name ?? '—'}</span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row: Requirement) => (
        <span className="text-text-secondary">{row.subject?.name ?? '—'}</span>
      ),
    },
    {
      key: 'teacher',
      header: t('teacher'),
      render: (row: Requirement) => (
        <Select
          value={row.teacher_id ?? 'none'}
          onValueChange={(v) => void updateRequirement(row.id, { teacher_id: v === 'none' ? null : v })}
        >
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Unassigned</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'periods',
      header: 'Periods/Week',
      render: (row: Requirement) => (
        <EditableNumber
          value={row.periods_per_week}
          onSave={(v) => void updateRequirement(row.id, { periods_per_week: v })}
          min={1}
          max={30}
        />
      ),
    },
    {
      key: 'room_type',
      header: 'Room Type',
      render: (row: Requirement) => (
        row.room_type ? (
          <Badge variant="outline" className="text-xs capitalize">
            {row.room_type}
          </Badge>
        ) : (
          <span className="text-xs text-text-tertiary">Any</span>
        )
      ),
    },
    {
      key: 'preferred_room',
      header: 'Preferred Room',
      render: (row: Requirement) => (
        <Select
          value={row.preferred_room_id ?? 'none'}
          onValueChange={(v) =>
            void updateRequirement(row.id, { preferred_room_id: v === 'none' ? null : v })
          }
        >
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Any" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Any</SelectItem>
            {rooms.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'consecutive',
      header: 'Consec.',
      render: (row: Requirement) => (
        <span className="text-xs text-text-secondary">
          {row.min_consecutive ?? 1}–{row.max_consecutive ?? 2}
        </span>
      ),
    },
    {
      key: 'spread',
      header: 'Spread',
      render: (row: Requirement) => (
        row.spread_across_week ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Circle className="h-4 w-4 text-text-tertiary" />
        )
      ),
    },
    {
      key: 'students',
      header: 'Students',
      render: (row: Requirement) => (
        <span className="text-xs text-text-secondary">{row.student_count ?? '—'}</span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={selectedYear} onValueChange={(v) => { setSelectedYear(v); setPage(1); }}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Academic Year" />
        </SelectTrigger>
        <SelectContent>
          {academicYears.map((y) => (
            <SelectItem key={y.id} value={y.id}>
              {y.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1); }}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="All Classes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Classes</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auto.requirements')}
        description={t('auto.requirementsDesc')}
      />

      {/* Completeness banner */}
      {totalClasses > 0 && (
        <div
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
            configuredCount === totalClasses
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {configuredCount === totalClasses ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <Circle className="h-4 w-4 shrink-0" />
          )}
          <span>
            {configuredCount} of {totalClasses} classes configured
          </span>
          {configuredCount < totalClasses && (
            <Button
              size="sm"
              variant="outline"
              className="ms-auto h-7 text-xs"
              onClick={() => {
                // Bulk configure remaining classes with defaults
                apiClient('/api/v1/class-scheduling-requirements/bulk', {
                  method: 'POST',
                  body: JSON.stringify({
                    academic_year_id: selectedYear,
                    apply_defaults_to_unconfigured: true,
                  }),
                })
                  .then(() => {
                    toast.success('Defaults applied to remaining classes');
                    void fetchRequirements(page, selectedYear, classFilter);
                  })
                  .catch(() => toast.error('Failed to apply defaults'));
              }}
            >
              Configure remaining with defaults
            </Button>
          )}
        </div>
      )}

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
    </div>
  );
}
