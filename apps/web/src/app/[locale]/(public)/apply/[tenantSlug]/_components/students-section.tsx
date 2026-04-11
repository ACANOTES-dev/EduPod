'use client';

import { Plus, Trash2 } from 'lucide-react';
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
  Textarea,
} from '@school/ui';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StudentDraft {
  id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  date_of_birth: string;
  gender: '' | 'male' | 'female';
  national_id: string;
  target_academic_year_id: string;
  target_year_group_id: string;
  medical_notes: string;
  has_allergies: boolean | null;
}

export function createEmptyStudent(): StudentDraft {
  return {
    id: crypto.randomUUID(),
    first_name: '',
    middle_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    national_id: '',
    target_academic_year_id: '',
    target_year_group_id: '',
    medical_notes: '',
    has_allergies: null,
  };
}

// ─── Students Section ───────────────────────────────────────────────────────

export function StudentsSection({
  students,
  onAdd,
  onRemove,
  onUpdate,
  academicYearOptions,
  yearGroupOptions,
  isExistingFamily,
}: {
  students: StudentDraft[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<StudentDraft>) => void;
  academicYearOptions: Array<{ value: string; label: string }>;
  yearGroupOptions: Array<{ value: string; label: string }>;
  isExistingFamily: boolean;
}) {
  const t = useTranslations('publicApplyForm');

  return (
    <section className="rounded-xl border border-border bg-surface p-6 shadow-sm">
      <h2 className="mb-1 text-base font-semibold text-text-primary">{t('studentsSection')}</h2>
      <p className="mb-4 text-sm text-text-secondary">
        {isExistingFamily ? t('studentsExistingSubtitle') : t('studentsNewSubtitle')}
      </p>

      {students.map((student, idx) => (
        <div
          key={student.id}
          className="mt-4 rounded-lg border border-border bg-surface-secondary p-5 first:mt-0"
        >
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">
              {t('studentBlockHeading', { index: idx + 1 })}
            </h3>
            {students.length > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(student.id)}>
                <Trash2 className="me-1.5 h-3.5 w-3.5" />
                {t('removeStudent')}
              </Button>
            )}
          </div>

          <StudentFields
            student={student}
            onUpdate={(patch) => onUpdate(student.id, patch)}
            academicYearOptions={academicYearOptions}
            yearGroupOptions={yearGroupOptions}
          />
        </div>
      ))}

      <div className="mt-5 flex justify-center">
        <Button type="button" variant="outline" onClick={onAdd}>
          <Plus className="me-1.5 h-4 w-4" />
          {t('addStudent')}
        </Button>
      </div>
    </section>
  );
}

// ─── Student Fields ─────────────────────────────────────────────────────────

function StudentFields({
  student,
  onUpdate,
  academicYearOptions,
  yearGroupOptions,
}: {
  student: StudentDraft;
  onUpdate: (patch: Partial<StudentDraft>) => void;
  academicYearOptions: Array<{ value: string; label: string }>;
  yearGroupOptions: Array<{ value: string; label: string }>;
}) {
  const t = useTranslations('publicApplyForm');

  return (
    <div className="space-y-4">
      {/* Name row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>
            {t('firstName')} <span className="text-emerald-600">*</span>
          </Label>
          <Input
            value={student.first_name}
            onChange={(e) => onUpdate({ first_name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('middleName')}</Label>
          <Input
            value={student.middle_name}
            onChange={(e) => onUpdate({ middle_name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t('lastName')} <span className="text-emerald-600">*</span>
          </Label>
          <Input
            value={student.last_name}
            onChange={(e) => onUpdate({ last_name: e.target.value })}
            required
          />
        </div>
      </div>

      {/* DOB + gender row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            {t('dateOfBirth')} <span className="text-emerald-600">*</span>
          </Label>
          <Input
            type="date"
            dir="ltr"
            value={student.date_of_birth}
            onChange={(e) => onUpdate({ date_of_birth: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label>
            {t('gender')} <span className="text-emerald-600">*</span>
          </Label>
          <Select
            value={student.gender}
            onValueChange={(val) => onUpdate({ gender: val as 'male' | 'female' })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('selectGender')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">{t('male')}</SelectItem>
              <SelectItem value="female">{t('female')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* National ID */}
      <div className="space-y-1.5">
        <Label>
          {t('nationalId')} <span className="text-emerald-600">*</span>
        </Label>
        <Input
          value={student.national_id}
          onChange={(e) => onUpdate({ national_id: e.target.value })}
          dir="ltr"
          required
        />
      </div>

      {/* Academic year + Year group */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>
            {t('academicYear')} <span className="text-emerald-600">*</span>
          </Label>
          <Select
            value={student.target_academic_year_id}
            onValueChange={(val) => onUpdate({ target_academic_year_id: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {academicYearOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>
            {t('yearGroup')} <span className="text-emerald-600">*</span>
          </Label>
          <Select
            value={student.target_year_group_id}
            onValueChange={(val) => onUpdate({ target_year_group_id: val })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('selectPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {yearGroupOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Medical notes */}
      <div className="space-y-1.5">
        <Label>{t('medicalNotes')}</Label>
        <Textarea
          value={student.medical_notes}
          onChange={(e) => onUpdate({ medical_notes: e.target.value })}
          rows={2}
        />
      </div>
    </div>
  );
}
