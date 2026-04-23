'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  type CreateTransferDto,
  createTransferSchema,
  PPOD_EARLY_LEAVING_REASONS,
} from '@school/shared/regulatory';
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
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface TransferFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

interface StudentOption {
  id: string;
  full_name: string;
}

interface StudentsApiResponse {
  data: StudentOption[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TransferForm({ onSuccess, onCancel }: TransferFormProps) {
  const t = useTranslations('regulatory');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');

  // ─── Student Search State ───────────────────────────────────────────
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentOptions, setStudentOptions] = React.useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentOption | null>(null);
  const [showStudentDropdown, setShowStudentDropdown] = React.useState(false);
  const [isSearching, setIsSearching] = React.useState(false);
  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // ─── Form Setup ─────────────────────────────────────────────────────

  const form = useForm<CreateTransferDto>({
    resolver: zodResolver(createTransferSchema),
    defaultValues: {
      direction: 'outbound',
      student_id: '',
      other_school_roll_no: '',
      other_school_name: null,
      transfer_date: '',
      leaving_reason: null,
      notes: null,
    },
  });

  const errors = form.formState.errors;
  const direction = form.watch('direction');

  // ─── Student Search ─────────────────────────────────────────────────

  const searchStudents = React.useCallback(async (term: string) => {
    if (term.length < 2) {
      setStudentOptions([]);
      return;
    }

    setIsSearching(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        pageSize: '20',
        search: term,
      });
      const response = await apiClient<StudentsApiResponse>(
        `/api/v1/students?${params.toString()}`,
        { silent: true },
      );
      setStudentOptions(response.data ?? []);
    } catch (err) {
      console.error('[TransferForm.searchStudents]', err);
      setStudentOptions([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleStudentSearchChange = React.useCallback(
    (value: string) => {
      setStudentSearch(value);
      setShowStudentDropdown(true);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      searchTimeoutRef.current = setTimeout(() => {
        void searchStudents(value);
      }, 300);
    },
    [searchStudents],
  );

  const handleStudentSelect = React.useCallback(
    (student: StudentOption) => {
      setSelectedStudent(student);
      setStudentSearch(student.full_name);
      setShowStudentDropdown(false);
      form.setValue('student_id', student.id, { shouldValidate: true });
    },
    [form],
  );

  const handleClearStudent = React.useCallback(() => {
    setSelectedStudent(null);
    setStudentSearch('');
    setStudentOptions([]);
    form.setValue('student_id', '', { shouldValidate: true });
  }, [form]);

  // Close dropdown on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowStudentDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  // ─── Submit ─────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const valid = await form.trigger();
    if (!valid) return;

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const values = form.getValues();
      await apiClient('/api/v1/regulatory/transfers', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      toast.success(t('transfers.createSuccess'));
      onSuccess();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string }; message?: string };
      const msg = ex?.error?.message ?? ex?.message ?? t('transfers.createError');
      setSubmitError(msg);
      toast.error(msg);
      console.error('[TransferForm.handleSubmit]', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* ─── Direction ──────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label>{t('transfers.direction')}</Label>
        <Select
          value={direction}
          onValueChange={(val) =>
            form.setValue('direction', val as CreateTransferDto['direction'], {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder={t('transfers.selectDirection')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inbound">{t('transfers.inbound')}</SelectItem>
            <SelectItem value="outbound">{t('transfers.outbound')}</SelectItem>
          </SelectContent>
        </Select>
        {errors.direction && <p className="text-xs text-danger-text">{errors.direction.message}</p>}
      </div>

      {/* ─── Student Search ─────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="student_search">{t('transfers.student')}</Label>
        <div ref={dropdownRef} className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              id="student_search"
              type="text"
              className="w-full ps-9 pe-9 text-base"
              placeholder={t('transfers.searchStudentPlaceholder')}
              value={studentSearch}
              onChange={(e) => handleStudentSearchChange(e.target.value)}
              onFocus={() => {
                if (studentSearch.length >= 2) {
                  setShowStudentDropdown(true);
                }
              }}
              autoComplete="off"
            />
            {selectedStudent && (
              <button
                type="button"
                onClick={handleClearStudent}
                className="absolute end-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                aria-label={t('transfers.clearStudent')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {showStudentDropdown && (studentOptions.length > 0 || isSearching) && (
            <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
              {isSearching ? (
                <div className="flex items-center justify-center px-4 py-3">
                  <Loader2 className="me-2 h-4 w-4 animate-spin text-text-tertiary" />
                  <span className="text-sm text-text-secondary">{t('transfers.searching')}</span>
                </div>
              ) : (
                studentOptions.map((student) => (
                  <button
                    key={student.id}
                    type="button"
                    className="w-full px-4 py-2.5 text-start text-sm text-text-primary transition-colors hover:bg-surface-secondary focus-visible:bg-surface-secondary focus-visible:outline-none"
                    onClick={() => handleStudentSelect(student)}
                  >
                    {student.full_name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        {errors.student_id && (
          <p className="text-xs text-danger-text">{errors.student_id.message}</p>
        )}
      </div>

      {/* ─── Other School Details (two-column at md) ────────────────────── */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="other_school_roll_no">{t('transfers.otherSchoolRollNo')}</Label>
          <Input
            id="other_school_roll_no"
            className="w-full text-base"
            placeholder={t('transfers.otherSchoolRollNoPlaceholder')}
            {...form.register('other_school_roll_no')}
          />
          {errors.other_school_roll_no && (
            <p className="text-xs text-danger-text">{errors.other_school_roll_no.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="other_school_name">{t('transfers.otherSchoolName')}</Label>
          <Input
            id="other_school_name"
            className="w-full text-base"
            placeholder={t('transfers.otherSchoolNamePlaceholder')}
            {...form.register('other_school_name')}
          />
        </div>
      </div>

      {/* ─── Transfer Date & Leaving Reason (two-column at md) ──────────── */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="transfer_date">{t('transfers.transferDate')}</Label>
          <Input
            id="transfer_date"
            type="date"
            className="w-full sm:w-64 text-base"
            {...form.register('transfer_date')}
          />
          {errors.transfer_date && (
            <p className="text-xs text-danger-text">{errors.transfer_date.message}</p>
          )}
        </div>

        {direction === 'outbound' && (
          <div className="space-y-1.5">
            <Label>{t('transfers.leavingReason')}</Label>
            <Select
              value={form.watch('leaving_reason') ?? ''}
              onValueChange={(val) =>
                form.setValue('leaving_reason', val || null, { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('transfers.selectLeavingReason')} />
              </SelectTrigger>
              <SelectContent>
                {PPOD_EARLY_LEAVING_REASONS.map((reason) => (
                  <SelectItem key={reason.code} value={reason.code}>
                    {reason.code} — {reason.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* ─── Notes ──────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">{t('transfers.notes')}</Label>
        <Textarea
          id="notes"
          rows={3}
          className="w-full text-base"
          placeholder={t('transfers.notesPlaceholder')}
          {...form.register('notes')}
        />
      </div>

      {/* ─── Error ──────────────────────────────────────────────────────── */}
      {submitError && <p className="text-sm text-danger-text">{submitError}</p>}

      {/* ─── Actions ────────────────────────────────────────────────────── */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
          className="min-h-[44px]"
        >
          {t('transfers.cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting} className="min-h-[44px]">
          {isSubmitting ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              {t('transfers.saving')}
            </>
          ) : (
            t('transfers.create')
          )}
        </Button>
      </div>
    </div>
  );
}
