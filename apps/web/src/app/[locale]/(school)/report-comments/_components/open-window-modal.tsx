'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicPeriod {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

interface ClassRow {
  id: string;
  name: string;
  academic_year_id?: string;
  year_group?: { id: string; name: string } | null;
}

interface StaffRow {
  id: string; // staff_profile_id
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
  // The findAll endpoint augments each row with a `roles: string[]` array of
  // role display_names. We filter on this client-side to get teachers only.
  roles?: string[];
}

interface OpenWindowModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  /** Pre-fill the academic period when launched from an approved teacher request. */
  defaultPeriodId?: string | null;
}

// ─── Form schema ─────────────────────────────────────────────────────────────
// The datetime-local input yields strings like "2026-04-09T17:30" that we
// convert to ISO before POSTing. Homeroom assignments are tracked as a
// `Record<class_id, staff_profile_id>` so the picker is one row per class
// — empty values mean "no overall comments for that class on this window".

const openWindowFormSchema = z
  .object({
    academic_period_id: z.string().uuid({ message: 'periodRequired' }),
    opens_at_local: z.string().min(1),
    closes_at_local: z.string().min(1, { message: 'closesAtRequired' }),
    instructions: z.string().max(2000).optional(),
    // Record<class_id, staff_profile_id | ''>
    homeroom_picks: z.record(z.string(), z.string()),
  })
  .refine(
    (data) => {
      if (!data.opens_at_local || !data.closes_at_local) return true;
      return new Date(data.closes_at_local) > new Date(data.opens_at_local);
    },
    { message: 'validationClosesAfterOpens', path: ['closes_at_local'] },
  );

type OpenWindowFormValues = z.infer<typeof openWindowFormSchema>;

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// Display name + email subtitle helper for the teacher dropdown.
function staffLabel(s: StaffRow): string {
  const name = `${s.user.first_name} ${s.user.last_name}`.trim();
  return name || s.user.email || s.id.slice(0, 8);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function OpenWindowModal({
  open,
  onOpenChange,
  onSuccess,
  defaultPeriodId,
}: OpenWindowModalProps) {
  const t = useTranslations('reportComments.openWindowModal');
  const tc = useTranslations('common');
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [classes, setClasses] = React.useState<ClassRow[]>([]);
  const [teachers, setTeachers] = React.useState<StaffRow[]>([]);
  const [loadingClasses, setLoadingClasses] = React.useState(false);

  const form = useForm<OpenWindowFormValues>({
    resolver: zodResolver(openWindowFormSchema),
    defaultValues: {
      academic_period_id: defaultPeriodId ?? '',
      opens_at_local: nowLocalInput(),
      closes_at_local: '',
      instructions: '',
      homeroom_picks: {},
    },
  });

  // Reload periods + classes + teachers each time the dialog opens. The
  // staff list is admin-only so this fetch only succeeds for admins.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function load(): Promise<void> {
      setLoadingClasses(true);
      try {
        const [periodsRes, classesRes, staffRes] = await Promise.all([
          apiClient<ListResponse<AcademicPeriod>>('/api/v1/academic-periods?pageSize=100'),
          // homeroom_only=false ensures we get every class, including
          // subject-bearing ones, so the admin can pick a homeroom for each.
          apiClient<ListResponse<ClassRow>>(
            '/api/v1/classes?pageSize=200&status=active&homeroom_only=false',
          ),
          // pageSize is capped at 100 by the staff-profiles query schema —
          // any tenant with more than 100 active teachers would need a
          // paginated picker, but every onboarded school sits well under
          // that ceiling, so a single page is enough today.
          apiClient<ListResponse<StaffRow>>(
            '/api/v1/staff-profiles?pageSize=100&employment_status=active',
          ),
        ]);
        if (cancelled) return;
        setPeriods(periodsRes.data ?? []);
        // Dedupe — `homeroom_only=false` can return the same class twice
        // when it shows up under multiple subject buckets in the join.
        const seen = new Set<string>();
        const uniqueClasses: ClassRow[] = [];
        for (const c of classesRes.data ?? []) {
          if (seen.has(c.id)) continue;
          seen.add(c.id);
          uniqueClasses.push(c);
        }
        // Sort by year-group then class name so the picker reads naturally.
        uniqueClasses.sort((a, b) => {
          const yga = a.year_group?.name ?? 'zzz';
          const ygb = b.year_group?.name ?? 'zzz';
          if (yga !== ygb) return yga.localeCompare(ygb);
          return a.name.localeCompare(b.name);
        });
        setClasses(uniqueClasses);

        // Filter staff to those carrying the Teacher role. The display_name
        // matches the seed which uses "Teacher" — fall back to a
        // case-insensitive includes for safety.
        const onlyTeachers = (staffRes.data ?? []).filter((s) =>
          (s.roles ?? []).some((r) => r.toLowerCase() === 'teacher'),
        );
        // Alphabetical by last name, then first name.
        onlyTeachers.sort((a, b) => {
          const aLast = a.user.last_name.toLowerCase();
          const bLast = b.user.last_name.toLowerCase();
          if (aLast !== bLast) return aLast.localeCompare(bLast);
          return a.user.first_name.localeCompare(b.user.first_name);
        });
        setTeachers(onlyTeachers);
      } catch (err) {
        console.error('[OpenWindowModal]', err);
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset defaults whenever the dialog opens so stale state doesn't stick.
  React.useEffect(() => {
    if (open) {
      form.reset({
        academic_period_id: defaultPeriodId ?? '',
        opens_at_local: nowLocalInput(),
        closes_at_local: '',
        instructions: '',
        homeroom_picks: {},
      });
    }
  }, [open, form, defaultPeriodId]);

  const onSubmit = async (values: OpenWindowFormValues): Promise<void> => {
    // Convert the picks record into the array shape the backend expects,
    // dropping empty (unselected) entries.
    const homeroom_assignments = Object.entries(values.homeroom_picks)
      .filter(([, staffId]) => Boolean(staffId))
      .map(([class_id, homeroom_teacher_staff_id]) => ({
        class_id,
        homeroom_teacher_staff_id,
      }));

    try {
      await apiClient('/api/v1/report-comment-windows', {
        method: 'POST',
        body: JSON.stringify({
          academic_period_id: values.academic_period_id,
          opens_at: new Date(values.opens_at_local).toISOString(),
          closes_at: new Date(values.closes_at_local).toISOString(),
          instructions: values.instructions?.trim() ? values.instructions.trim() : null,
          homeroom_assignments,
        }),
      });
      toast.success(t('success'));
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      console.error('[OpenWindowModal]', err);
      toast.error(t('failure'));
    }
  };

  const errors = form.formState.errors;
  const isSubmitting = form.formState.isSubmitting;
  const selectedPeriod = form.watch('academic_period_id');
  const homeroomPicks = form.watch('homeroom_picks');

  // Count of classes that already have a homeroom teacher selected — shown
  // in the section header so the admin can sanity-check at a glance.
  const assignedCount = Object.values(homeroomPicks).filter(Boolean).length;

  const setHomeroomPick = (classId: string, value: string): void => {
    form.setValue(
      'homeroom_picks',
      { ...form.getValues('homeroom_picks'), [classId]: value },
      { shouldDirty: true },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            void form.handleSubmit(onSubmit)(e);
          }}
          className="max-h-[70vh] space-y-4 overflow-y-auto pe-1"
          noValidate
        >
          {/* Academic period */}
          <div className="space-y-1.5">
            <Label htmlFor="period">{t('periodLabel')}</Label>
            <Select
              value={selectedPeriod}
              onValueChange={(v) => {
                form.setValue('academic_period_id', v, { shouldValidate: true });
              }}
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
              <p className="text-xs text-red-600">{t('periodRequired')}</p>
            )}
          </div>

          {/* Opens at + Closes at on one row at md+ */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="opens_at">{t('opensAtLabel')}</Label>
              <input
                id="opens_at"
                type="datetime-local"
                className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                {...form.register('opens_at_local')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="closes_at">{t('closesAtLabel')}</Label>
              <input
                id="closes_at"
                type="datetime-local"
                className="min-h-11 w-full rounded-md border border-border bg-surface px-3 text-base text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                {...form.register('closes_at_local')}
              />
              {errors.closes_at_local?.message === 'validationClosesAfterOpens' && (
                <p className="text-xs text-red-600">{t('validationClosesAfterOpens')}</p>
              )}
              {errors.closes_at_local?.message === 'closesAtRequired' && (
                <p className="text-xs text-red-600">{t('closesAtRequired')}</p>
              )}
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <Label htmlFor="instructions">{t('instructionsLabel')}</Label>
            <Textarea
              id="instructions"
              rows={3}
              placeholder={t('instructionsPlaceholder')}
              className="text-base"
              {...form.register('instructions')}
            />
          </div>

          {/* ─── Homeroom teacher per class ───────────────────────────── */}
          <div className="space-y-2 rounded-md border border-border bg-surface-secondary/40 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <Label className="text-sm font-semibold">{t('homeroomTitle')}</Label>
                <p className="text-xs text-text-tertiary">{t('homeroomDescription')}</p>
              </div>
              <span className="shrink-0 text-xs text-text-tertiary tabular-nums">
                {t('homeroomAssignedCount', {
                  done: assignedCount,
                  total: classes.length,
                })}
              </span>
            </div>

            {loadingClasses && (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded-md bg-surface-secondary" />
                ))}
              </div>
            )}

            {!loadingClasses && classes.length === 0 && (
              <p className="py-4 text-center text-xs text-text-tertiary">
                {t('homeroomNoClasses')}
              </p>
            )}

            {!loadingClasses && classes.length > 0 && (
              <div className="space-y-2">
                {classes.map((cls) => {
                  const value = homeroomPicks[cls.id] ?? '';
                  return (
                    <div
                      key={cls.id}
                      className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_minmax(0,1.4fr)]"
                    >
                      <div className="text-sm">
                        <div className="font-medium text-text-primary">{cls.name}</div>
                        {cls.year_group?.name && (
                          <div className="text-xs text-text-tertiary">{cls.year_group.name}</div>
                        )}
                      </div>
                      <Select
                        value={value}
                        onValueChange={(v) => setHomeroomPick(cls.id, v === '__none__' ? '' : v)}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t('homeroomPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">{t('homeroomNone')}</SelectItem>
                          {teachers.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <div className="flex flex-col">
                                <span>{staffLabel(s)}</span>
                                {s.user.email && (
                                  <span className="text-xs text-text-tertiary">{s.user.email}</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
              className="min-h-11"
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-h-11">
              {isSubmitting ? t('submitting') : t('submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
