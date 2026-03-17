'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

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

import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear { id: string; name: string }
interface YearGroup { id: string; name: string }
interface Subject { id: string; name: string }
interface StaffProfile { id: string; user: { first_name: string; last_name: string } }

interface ListResponse<T> { data: T[] }

export interface ClassFormValues {
  name: string;
  academic_year_id: string;
  year_group_id: string;
  subject_id: string;
  homeroom_teacher_staff_id: string;
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
  subject_id: '',
  homeroom_teacher_staff_id: '',
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
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [staffProfiles, setStaffProfiles] = React.useState<StaffProfile[]>([]);

  React.useEffect(() => {
    Promise.all([
      apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=100'),
      apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
      apiClient<ListResponse<Subject>>('/api/v1/subjects?pageSize=200'),
      apiClient<ListResponse<StaffProfile>>('/api/v1/staff-profiles?pageSize=200'),
    ])
      .then(([years, groups, subs, staff]) => {
        setAcademicYears(years.data);
        setYearGroups(groups.data);
        setSubjects(subs.data);
        setStaffProfiles(staff.data);
      })
      .catch(() => undefined);
  }, []);

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="name">{t('fieldName')}</Label>
            <Input
              id="name"
              value={values.name}
              onChange={(e) => setValues((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="academic_year_id">{t('colAcademicYear')}</Label>
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

          <div className="space-y-1.5">
            <Label htmlFor="year_group_id">{t('colYearGroup')}</Label>
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

          <div className="space-y-1.5">
            <Label htmlFor="subject_id">{t('colSubject')}</Label>
            <Select
              value={values.subject_id}
              onValueChange={(v) => setValues((p) => ({ ...p, subject_id: v }))}
            >
              <SelectTrigger id="subject_id">
                <SelectValue placeholder={t('selectSubject')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('noSubject')}</SelectItem>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="homeroom_teacher_staff_id">{t('fieldHomeroomTeacher')}</Label>
            <Select
              value={values.homeroom_teacher_staff_id}
              onValueChange={(v) => setValues((p) => ({ ...p, homeroom_teacher_staff_id: v }))}
            >
              <SelectTrigger id="homeroom_teacher_staff_id">
                <SelectValue placeholder={t('selectHomeroomTeacher')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('noTeacher')}</SelectItem>
                {staffProfiles.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.user.first_name} {s.user.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="status">{t('colStatus')}</Label>
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
                <SelectItem value="archived">{t('statusArchived')}</SelectItem>
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
