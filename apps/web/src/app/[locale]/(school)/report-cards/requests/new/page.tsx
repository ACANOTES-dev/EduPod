'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  submitTeacherRequestSchema,
  type SubmitTeacherRequestDto,
  type TeacherRequestType,
} from '@school/shared';
import {
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ListResponse<T> {
  data: T[];
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface YearGroup {
  id: string;
  name: string;
  display_order: number;
}

interface ClassRecord {
  id: string;
  name: string;
  year_group?: { id: string; name: string } | null;
  subject?: { id: string; name: string } | null;
}

interface StudentRecord {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  student_number?: string | null;
}

type ScopeMode = 'year_group' | 'class' | 'student';

// ─── Form schema ──────────────────────────────────────────────────────────────
// We build a local form schema that mirrors the shared schema but keeps the
// scope fields flat (mode + ids[]) so we can drive a friendly UI. On submit
// we translate into the discriminated target_scope_json shape.

const formSchema = z
  .object({
    request_type: z.enum(['open_comment_window', 'regenerate_reports']),
    academic_period_id: z.string().uuid({ message: 'periodRequired' }),
    scope_mode: z.enum(['year_group', 'class', 'student']).optional(),
    scope_ids: z.array(z.string().uuid()).default([]),
    reason: z.string().min(10, { message: 'reasonMinLength' }).max(2000),
  })
  .superRefine((data, ctx) => {
    if (data.request_type === 'regenerate_reports') {
      if (!data.scope_mode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'scopeRequired',
          path: ['scope_mode'],
        });
      }
      if (!data.scope_ids || data.scope_ids.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'scopeRequired',
          path: ['scope_ids'],
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewReportCardRequestPage() {
  const t = useTranslations('reportCards.requests.submit');
  const tTypes = useTranslations('reportCards.requests');
  const tc = useTranslations('common');
  const router = useRouter();
  const locale = useLocale();
  const searchParams = useSearchParams();

  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [classes, setClasses] = React.useState<ClassRecord[]>([]);
  const [students, setStudents] = React.useState<StudentRecord[]>([]);
  const [studentSearch, setStudentSearch] = React.useState('');

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      request_type: 'open_comment_window',
      academic_period_id: '',
      scope_mode: undefined,
      scope_ids: [],
      reason: '',
    },
  });

  const requestType = form.watch('request_type');
  const scopeMode = form.watch('scope_mode');
  const scopeIds = form.watch('scope_ids');

  // ─── Load reference data ────────────────────────────────────────────────
  React.useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [periodsRes, yearGroupsRes, classesRes] = await Promise.all([
          apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=50'),
          apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
          apiClient<ListResponse<ClassRecord>>('/api/v1/classes?pageSize=200'),
        ]);
        if (cancelled) return;
        setPeriods(periodsRes.data ?? []);
        setYearGroups(
          (yearGroupsRes.data ?? [])
            .slice()
            .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
        );
        setClasses(classesRes.data ?? []);
      } catch (err) {
        console.error('[NewReportCardRequestPage.load]', err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Debounced student search ────────────────────────────────────────────
  React.useEffect(() => {
    if (scopeMode !== 'student') return;
    const trimmed = studentSearch.trim();
    if (!trimmed) {
      setStudents([]);
      return;
    }
    const timer = setTimeout(() => {
      apiClient<ListResponse<StudentRecord>>(
        `/api/v1/students?search=${encodeURIComponent(trimmed)}&pageSize=20`,
        { silent: true },
      )
        .then((res) => setStudents(res.data ?? []))
        .catch((err) => {
          console.error('[NewReportCardRequestPage.studentSearch]', err);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, scopeMode]);

  // ─── Query-param pre-fill ───────────────────────────────────────────────
  const prefilledRef = React.useRef(false);
  React.useEffect(() => {
    if (prefilledRef.current) return;
    if (!searchParams) return;
    const typeParam = searchParams.get('type') as TeacherRequestType | null;
    const periodId = searchParams.get('period_id');
    const classId = searchParams.get('class_id');
    const yearGroupId = searchParams.get('year_group_id');
    const studentId = searchParams.get('student_id');

    if (!typeParam && !periodId && !classId && !yearGroupId && !studentId) return;

    if (typeParam === 'regenerate_reports' || typeParam === 'open_comment_window') {
      form.setValue('request_type', typeParam);
    }
    if (periodId) {
      form.setValue('academic_period_id', periodId, { shouldValidate: false });
    }
    if (classId) {
      form.setValue('request_type', 'regenerate_reports');
      form.setValue('scope_mode', 'class');
      form.setValue('scope_ids', [classId]);
    } else if (yearGroupId) {
      form.setValue('request_type', 'regenerate_reports');
      form.setValue('scope_mode', 'year_group');
      form.setValue('scope_ids', [yearGroupId]);
    } else if (studentId) {
      form.setValue('request_type', 'regenerate_reports');
      form.setValue('scope_mode', 'student');
      form.setValue('scope_ids', [studentId]);
    }

    prefilledRef.current = true;

    // Clear the query params so they don't stick on refresh.
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams, form]);

  // ─── Scope ID toggle helper ──────────────────────────────────────────────
  const toggleScopeId = (id: string): void => {
    const current = form.getValues('scope_ids') ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    form.setValue('scope_ids', next, { shouldValidate: true });
  };

  // ─── Submit ─────────────────────────────────────────────────────────────
  const onSubmit = async (values: FormValues): Promise<void> => {
    let targetScope: SubmitTeacherRequestDto['target_scope_json'] = null;
    if (values.request_type === 'regenerate_reports' && values.scope_mode) {
      targetScope = { scope: values.scope_mode, ids: values.scope_ids };
    }

    const payload: SubmitTeacherRequestDto = {
      request_type: values.request_type,
      academic_period_id: values.academic_period_id,
      target_scope_json: targetScope,
      reason: values.reason.trim(),
    };

    // Validate against the shared backend schema before posting.
    const parsed = submitTeacherRequestSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(t('failure'));
      return;
    }

    try {
      await apiClient('/api/v1/report-card-teacher-requests', {
        method: 'POST',
        body: JSON.stringify(parsed.data),
      });
      toast.success(t('success'));
      router.push(`/${locale}/report-cards/requests`);
    } catch (err) {
      console.error('[NewReportCardRequestPage.submit]', err);
      toast.error(t('failure'));
    }
  };

  // ─── Derived data ───────────────────────────────────────────────────────
  const errors = form.formState.errors;
  const isSubmitting = form.formState.isSubmitting;
  const selectedPeriod = form.watch('academic_period_id');

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-h-11"
          onClick={() => router.push(`/${locale}/report-cards/requests`)}
        >
          <ArrowLeft className="me-2 h-4 w-4" aria-hidden="true" />
          {tTypes('backToList')}
        </Button>
      </div>

      <PageHeader title={t('title')} description={t('subtitle')} />

      <form
        onSubmit={(e) => {
          void form.handleSubmit(onSubmit)(e);
        }}
        className="max-w-2xl space-y-6 rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-6"
        noValidate
      >
        {/* Request type */}
        <div className="space-y-2">
          <Label>{t('requestType')}</Label>
          <Controller
            control={form.control}
            name="request_type"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  if (v === 'open_comment_window') {
                    form.setValue('scope_mode', undefined);
                    form.setValue('scope_ids', []);
                  }
                }}
                className="space-y-3"
              >
                <div className="flex items-start gap-3 rounded-md border border-border p-3">
                  <RadioGroupItem id="type_window" value="open_comment_window" className="mt-0.5" />
                  <Label htmlFor="type_window" className="flex-1 cursor-pointer">
                    <span className="block font-medium text-text-primary">
                      {tTypes('typeWindow')}
                    </span>
                    <span className="block text-xs text-text-secondary">
                      {t('typeWindowDescription')}
                    </span>
                  </Label>
                </div>
                <div className="flex items-start gap-3 rounded-md border border-border p-3">
                  <RadioGroupItem
                    id="type_regenerate"
                    value="regenerate_reports"
                    className="mt-0.5"
                  />
                  <Label htmlFor="type_regenerate" className="flex-1 cursor-pointer">
                    <span className="block font-medium text-text-primary">
                      {tTypes('typeRegenerate')}
                    </span>
                    <span className="block text-xs text-text-secondary">
                      {t('typeRegenerateDescription')}
                    </span>
                  </Label>
                </div>
              </RadioGroup>
            )}
          />
        </div>

        {/* Period */}
        <div className="space-y-1.5">
          <Label htmlFor="period">{t('period')}</Label>
          <Select
            value={selectedPeriod}
            onValueChange={(v) => form.setValue('academic_period_id', v, { shouldValidate: true })}
          >
            <SelectTrigger id="period" className="w-full">
              <SelectValue placeholder={t('periodPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.academic_period_id && (
            <p className="text-xs text-red-600">{t('periodPlaceholder')}</p>
          )}
        </div>

        {/* Scope (regenerate only) */}
        {requestType === 'regenerate_reports' && (
          <div className="space-y-3">
            <Label>{t('scopeMode')}</Label>
            <Controller
              control={form.control}
              name="scope_mode"
              render={({ field }) => (
                <RadioGroup
                  value={field.value ?? ''}
                  onValueChange={(v) => {
                    field.onChange(v as ScopeMode);
                    form.setValue('scope_ids', []);
                  }}
                  className="flex flex-wrap gap-2"
                >
                  {(['year_group', 'class', 'student'] as const).map((mode) => (
                    <div key={mode} className="flex items-center gap-2">
                      <RadioGroupItem id={`scope_${mode}`} value={mode} />
                      <Label htmlFor={`scope_${mode}`} className="cursor-pointer text-sm">
                        {mode === 'year_group' && t('scopeModeYearGroup')}
                        {mode === 'class' && t('scopeModeClass')}
                        {mode === 'student' && t('scopeModeStudent')}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />

            {/* Year group picker */}
            {scopeMode === 'year_group' && (
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {yearGroups.length === 0 && (
                  <p className="text-xs text-text-secondary">{t('scopeYearGroupPlaceholder')}</p>
                )}
                {yearGroups.map((yg) => {
                  const checked = scopeIds.includes(yg.id);
                  return (
                    <label
                      key={yg.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-secondary"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleScopeId(yg.id)} />
                      <span className="text-sm text-text-primary">{yg.name}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Class picker */}
            {scopeMode === 'class' && (
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {classes.length === 0 && (
                  <p className="text-xs text-text-secondary">{t('scopeClassPlaceholder')}</p>
                )}
                {classes.map((cls) => {
                  const checked = scopeIds.includes(cls.id);
                  return (
                    <label
                      key={cls.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-secondary"
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleScopeId(cls.id)} />
                      <span className="text-sm text-text-primary">
                        {cls.name}
                        {cls.subject ? ` — ${cls.subject.name}` : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* Student search + picker */}
            {scopeMode === 'student' && (
              <div className="space-y-2">
                <Input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder={t('scopeStudentSearch')}
                  className="w-full text-base"
                />
                {students.length > 0 && (
                  <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                    {students.map((s) => {
                      const name =
                        s.full_name ?? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() ?? s.id;
                      const checked = scopeIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-surface-secondary"
                        >
                          <Checkbox checked={checked} onCheckedChange={() => toggleScopeId(s.id)} />
                          <span className="text-sm text-text-primary">
                            {name}
                            {s.student_number ? ` (${s.student_number})` : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {scopeIds.length > 0 && (
                  <p className="text-xs text-text-tertiary">
                    {t('scopeSelected', { count: scopeIds.length })}
                  </p>
                )}
              </div>
            )}

            {errors.scope_ids && <p className="text-xs text-red-600">{t('scopeRequired')}</p>}
            {errors.scope_mode && <p className="text-xs text-red-600">{t('scopeRequired')}</p>}
          </div>
        )}

        {/* Reason */}
        <div className="space-y-1.5">
          <Label htmlFor="reason">{t('reason')}</Label>
          <Textarea
            id="reason"
            rows={4}
            placeholder={t('reasonPlaceholder')}
            className="text-base"
            {...form.register('reason')}
          />
          {errors.reason?.message === 'reasonMinLength' && (
            <p className="text-xs text-red-600">{t('reasonMinLength')}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => router.push(`/${locale}/report-cards/requests`)}
            disabled={isSubmitting}
          >
            {tc('cancel')}
          </Button>
          <Button type="submit" className="min-h-11" disabled={isSubmitting}>
            {isSubmitting ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
