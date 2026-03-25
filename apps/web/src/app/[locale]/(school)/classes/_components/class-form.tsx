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
} from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear { id: string; name: string }
interface YearGroup { id: string; name: string }
interface Room { id: string; name: string; capacity: number | null }
interface StaffProfile {
  id: string;
  user: { first_name: string; last_name: string };
}

interface ListResponse<T> { data: T[] }

export interface ClassFormValues {
  name: string;
  academic_year_id: string;
  year_group_id: string;
  homeroom_teacher_staff_id: string;
  max_capacity: string;
  class_type: string;
  homeroom_id: string;
  status: string;
}

interface ClassFormProps {
  initialValues?: Partial<ClassFormValues>;
  onSubmit: (values: ClassFormValues) => Promise<void>;
  submitLabel?: string;
  onCancel?: () => void;
}

const DEFAULT_VALUES: ClassFormValues = {
  name: '',
  academic_year_id: '',
  year_group_id: '',
  homeroom_teacher_staff_id: '',
  max_capacity: '',
  class_type: '',
  homeroom_id: '',
  status: 'active',
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ClassForm({ initialValues, onSubmit, submitLabel, onCancel }: ClassFormProps) {
  const t = useTranslations('classes');
  const tc = useTranslations('common');

  const [values, setValues] = React.useState<ClassFormValues>({
    ...DEFAULT_VALUES,
    ...initialValues,
  });
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [rooms, setRooms] = React.useState<Room[]>([]);
  const [staffProfiles, setStaffProfiles] = React.useState<StaffProfile[]>([]);

  React.useEffect(() => {
    Promise.all([
      apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=100'),
      apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
      apiClient<ListResponse<Room>>('/api/v1/rooms?pageSize=200&active=true'),
      apiClient<ListResponse<StaffProfile>>('/api/v1/staff-profiles?pageSize=200'),
    ])
      .then(([years, groups, roomsRes, staff]) => {
        setAcademicYears(years.data);
        setYearGroups(groups.data);
        setRooms(roomsRes.data);
        setStaffProfiles(staff.data);
      })
      .catch(() => undefined);
  }, []);

  // Filter rooms: exclude already-assigned rooms, and filter by capacity
  const availableRooms = React.useMemo(() => {
    const classSize = parseInt(values.max_capacity, 10) || 0;
    return rooms.filter((r) => {
      // Capacity check: if class size is set, room capacity must be >= class size
      if (classSize > 0 && r.capacity && r.capacity < classSize) return false;
      return true;
    });
  }, [rooms, values.max_capacity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSubmit(values);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  const isFixed = values.class_type === 'fixed';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Class Name */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">{t('fieldName')} *</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>

          {/* Academic Year */}
          <div className="space-y-1.5">
            <Label htmlFor="academic_year_id">{t('colAcademicYear')} *</Label>
            <Select
              value={values.academic_year_id}
              onValueChange={(v) => setValues((p) => ({ ...p, academic_year_id: v }))}
            >
              <SelectTrigger id="academic_year_id">
                <SelectValue placeholder={t('selectAcademicYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Year Group */}
          <div className="space-y-1.5">
            <Label htmlFor="year_group_id">{t('colYearGroup')} *</Label>
            <Select
              value={values.year_group_id}
              onValueChange={(v) => setValues((p) => ({ ...p, year_group_id: v }))}
            >
              <SelectTrigger id="year_group_id">
                <SelectValue placeholder={t('selectYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {yearGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label htmlFor="status">{t('colStatus')} *</Label>
            <Select
              value={values.status}
              onValueChange={(v) => setValues((p) => ({ ...p, status: v }))}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('statusActive')}</SelectItem>
                <SelectItem value="inactive">{t('statusInactive')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Class Size */}
          <div className="space-y-1.5">
            <Label htmlFor="max_capacity">{t('classSize')} *</Label>
            <Input
              id="max_capacity"
              type="number"
              min={1}
              max={200}
              dir="ltr"
              value={values.max_capacity}
              onChange={(e) => setValues((p) => ({ ...p, max_capacity: e.target.value }))}
              placeholder={t('classSizePlaceholder')}
              required
            />
          </div>

          {/* Class Type */}
          <div className="space-y-1.5">
            <Label>Class Type *</Label>
            <Select
              value={values.class_type}
              onValueChange={(v) => setValues((p) => ({
                ...p,
                class_type: v,
                // Clear room when switching to floating
                homeroom_id: v === 'floating' ? '' : p.homeroom_id,
              }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select class type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="floating">Floating</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assigned Classroom (only for Fixed) */}
          {isFixed && (
            <div className="space-y-1.5">
              <Label>Assigned Classroom *</Label>
              <Select
                value={values.homeroom_id}
                onValueChange={(v) => setValues((p) => ({ ...p, homeroom_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select classroom" />
                </SelectTrigger>
                <SelectContent>
                  {availableRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}{r.capacity ? ` (cap: ${r.capacity})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Homeroom Teacher (optional) */}
          <div className="space-y-1.5">
            <Label htmlFor="homeroom_teacher_staff_id">{t('fieldHomeroomTeacher')}</Label>
            <Select
              value={values.homeroom_teacher_staff_id || '__none__'}
              onValueChange={(v) => setValues((p) => ({ ...p, homeroom_teacher_staff_id: v === '__none__' ? '' : v }))}
            >
              <SelectTrigger id="homeroom_teacher_staff_id">
                <SelectValue placeholder={t('selectHomeroomTeacher')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('noTeacher')}</SelectItem>
                {staffProfiles.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user.first_name} {s.user.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-danger-text">{error}</p>}

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            {tc('cancel')}
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading ? tc('loading') : (submitLabel ?? tc('save'))}
        </Button>
      </div>
    </form>
  );
}
