'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Search, X } from 'lucide-react';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  type CreateGuardianRestrictionDto,
  createGuardianRestrictionSchema,
} from '@school/shared/behaviour';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Textarea,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { RESTRICTION_TYPE_LABELS, RESTRICTION_TYPES } from './restriction-types';
import type { ParentOption, StudentDetailResponse, StudentOption } from './restriction-types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface CreateRestrictionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULT_VALUES: CreateGuardianRestrictionDto = {
  student_id: '',
  parent_id: '',
  restriction_type: 'no_behaviour_visibility',
  reason: '',
  legal_basis: null,
  effective_from: '',
  effective_until: null,
  review_date: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert an empty string from a date input to null for nullable schema fields. */
function emptyToNull(value: string): string | null {
  return value === '' ? null : value;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CreateRestrictionSheet({
  open,
  onOpenChange,
  onCreated,
}: CreateRestrictionSheetProps) {
  const [creating, setCreating] = React.useState(false);

  // Student search
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentOption | null>(null);
  const studentSearchTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Parent selection (based on selected student)
  const [parentOptions, setParentOptions] = React.useState<ParentOption[]>([]);
  const [loadingParents, setLoadingParents] = React.useState(false);

  const form = useForm<CreateGuardianRestrictionDto>({
    resolver: zodResolver(createGuardianRestrictionSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onChange',
  });

  // ── Reset ────────────────────────────────────────────────────────────────────

  function resetForm() {
    setStudentSearch('');
    setStudentResults([]);
    setSelectedStudent(null);
    setParentOptions([]);
    form.reset(DEFAULT_VALUES);
  }

  // ── Student Search ───────────────────────────────────────────────────────────

  React.useEffect(() => {
    if (studentSearch.length < 2) {
      setStudentResults([]);
      return;
    }
    if (studentSearchTimeout.current) clearTimeout(studentSearchTimeout.current);
    studentSearchTimeout.current = setTimeout(() => {
      apiClient<{ data: StudentOption[] }>(
        `/api/v1/students?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
      )
        .then((res) => setStudentResults(res.data ?? []))
        .catch((err) => console.error('[searchStudents]', err));
    }, 300);
    return () => {
      if (studentSearchTimeout.current) clearTimeout(studentSearchTimeout.current);
    };
  }, [studentSearch]);

  // ── Load Parents When Student Selected ──────────────────────────────────────

  React.useEffect(() => {
    if (!selectedStudent) {
      setParentOptions([]);
      form.setValue('parent_id', '', { shouldValidate: true });
      return;
    }
    setLoadingParents(true);
    apiClient<StudentDetailResponse>(`/api/v1/students/${selectedStudent.id}`)
      .then((res) => {
        const parents = (res.data?.student_parents ?? []).map((sp) => ({
          id: sp.parent.id,
          first_name: sp.parent.first_name,
          last_name: sp.parent.last_name,
          relationship_label: sp.relationship_label,
        }));
        setParentOptions(parents);
        if (parents.length === 1 && parents[0]) {
          form.setValue('parent_id', parents[0].id, { shouldValidate: true });
        }
      })
      .catch(() => setParentOptions([]))
      .finally(() => setLoadingParents(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  // ── Create ───────────────────────────────────────────────────────────────────

  async function handleCreate(data: CreateGuardianRestrictionDto) {
    setCreating(true);
    try {
      await apiClient('/api/v1/behaviour/guardian-restrictions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      onOpenChange(false);
      resetForm();
      onCreated();
    } catch (err) {
      console.error('[handleCreate]', err);
    } finally {
      setCreating(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        onOpenChange(isOpen);
        if (!isOpen) resetForm();
      }}
    >
      <SheetContent side="end" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add Guardian Restriction</SheetTitle>
          <SheetDescription>
            Restrict a guardian&apos;s access to behaviour data for a specific student.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={(e) => void form.handleSubmit(handleCreate)(e)} className="mt-6 space-y-5">
          {/* Hidden fields for student_id and parent_id — set via setValue */}
          <input type="hidden" {...form.register('student_id')} />
          <input type="hidden" {...form.register('parent_id')} />

          {/* Student Search */}
          <div className="space-y-2">
            <Label>Student *</Label>
            {selectedStudent ? (
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary p-3">
                <span className="flex-1 text-sm font-medium">
                  {selectedStudent.first_name} {selectedStudent.last_name}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedStudent(null);
                    setStudentSearch('');
                    setStudentResults([]);
                    setParentOptions([]);
                    form.setValue('student_id', '', { shouldValidate: true });
                    form.setValue('parent_id', '', { shouldValidate: true });
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Search student by name..."
                  className="ps-9 text-base sm:text-sm"
                />
                {studentResults.length > 0 && (
                  <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
                    {studentResults.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="w-full px-4 py-2.5 text-start text-sm hover:bg-surface-secondary"
                        onClick={() => {
                          setSelectedStudent(s);
                          form.setValue('student_id', s.id, { shouldValidate: true });
                          setStudentSearch('');
                          setStudentResults([]);
                        }}
                      >
                        {s.first_name} {s.last_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Parent Picker */}
          <div className="space-y-2">
            <Label>Guardian *</Label>
            {!selectedStudent ? (
              <p className="text-sm text-text-tertiary">
                Select a student first to see their guardians.
              </p>
            ) : loadingParents ? (
              <div className="h-10 animate-pulse rounded-md bg-surface-secondary" />
            ) : parentOptions.length === 0 ? (
              <p className="text-sm text-text-tertiary">No guardians linked to this student.</p>
            ) : (
              <Controller
                control={form.control}
                name="parent_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select guardian..." />
                    </SelectTrigger>
                    <SelectContent>
                      {parentOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name}
                          {p.relationship_label ? ` (${p.relationship_label})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            )}
          </div>

          {/* Restriction Type */}
          <div className="space-y-2">
            <Label>Restriction Type *</Label>
            <Controller
              control={form.control}
              name="restriction_type"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select restriction type..." />
                  </SelectTrigger>
                  <SelectContent>
                    {RESTRICTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {RESTRICTION_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Reason *</Label>
            <Textarea
              {...form.register('reason')}
              placeholder="Explain the reason for this restriction..."
              rows={3}
              className="text-base sm:text-sm"
            />
          </div>

          {/* Legal Basis */}
          <div className="space-y-2">
            <Label>Legal Basis</Label>
            <Input
              {...form.register('legal_basis', { setValueAs: (v: string) => emptyToNull(v) })}
              placeholder="e.g., Court order, GDPR request..."
              className="text-base sm:text-sm"
              maxLength={200}
            />
          </div>

          {/* Effective From */}
          <div className="space-y-2">
            <Label>Effective From *</Label>
            <input
              type="date"
              {...form.register('effective_from')}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text-primary dark:bg-surface dark:text-text-primary sm:text-sm"
            />
          </div>

          {/* Effective Until */}
          <div className="space-y-2">
            <Label>Effective Until</Label>
            <input
              type="date"
              {...form.register('effective_until', { setValueAs: (v: string) => emptyToNull(v) })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text-primary dark:bg-surface dark:text-text-primary sm:text-sm"
            />
            <p className="text-xs text-text-tertiary">Leave empty for indefinite restriction.</p>
          </div>

          {/* Review Date */}
          <div className="space-y-2">
            <Label>Review Date</Label>
            <input
              type="date"
              {...form.register('review_date', { setValueAs: (v: string) => emptyToNull(v) })}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-text-primary dark:bg-surface dark:text-text-primary sm:text-sm"
            />
            <p className="text-xs text-text-tertiary">
              A review task will be created automatically when the date approaches.
            </p>
          </div>

          <SheetFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!form.formState.isValid || creating}>
              {creating ? 'Creating...' : 'Create Restriction'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
