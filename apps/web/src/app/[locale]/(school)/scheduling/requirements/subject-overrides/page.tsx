'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import {
  createClassSubjectRequirementSchema,
  updateClassSubjectRequirementSchema,
} from '@school/shared';
import type {
  CreateClassSubjectRequirementDto,
  UpdateClassSubjectRequirementDto,
} from '@school/shared';
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}
interface ClassOption {
  id: string;
  name: string;
  year_group_id: string | null;
}
interface SubjectOption {
  id: string;
  name: string;
}
interface RoomOption {
  id: string;
  name: string;
  room_type: string;
}
interface Override {
  id: string;
  academic_year_id: string;
  class_id: string;
  subject_id: string;
  periods_per_week: number;
  max_periods_per_day: number | null;
  preferred_room_id: string | null;
  required_room_type: string | null;
  requires_double_period: boolean;
  double_period_count: number | null;
  notes: string | null;
}

const ROOM_TYPES = [
  'classroom',
  'lab',
  'gym',
  'auditorium',
  'library',
  'computer_lab',
  'art_room',
  'music_room',
  'outdoor',
  'science_lab',
] as const;

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SubjectOverridesPage() {
  const t = useTranslations('scheduling.subjectOverrides');

  const [years, setYears] = React.useState<AcademicYear[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);
  const [rooms, setRooms] = React.useState<RoomOption[]>([]);
  const [overrides, setOverrides] = React.useState<Override[]>([]);

  const [yearId, setYearId] = React.useState<string>('');
  const [classFilter, setClassFilter] = React.useState<string>('all');
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Override | null>(null);

  // ── Bootstrap: academic years, classes, subjects, rooms ─────────────────
  React.useEffect(() => {
    void (async () => {
      try {
        const [yearsRes, classesRes, subjectsRes, roomsRes] = await Promise.all([
          apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years'),
          apiClient<{ data: ClassOption[]; meta?: unknown }>(
            '/api/v1/classes?status=active&pageSize=500',
          ),
          apiClient<{ data: SubjectOption[]; meta?: unknown }>('/api/v1/subjects?pageSize=500'),
          apiClient<{ data: RoomOption[]; meta?: unknown }>('/api/v1/rooms?pageSize=500'),
        ]);
        setYears(yearsRes.data ?? []);
        setClasses(classesRes.data ?? []);
        setSubjects(subjectsRes.data ?? []);
        setRooms(roomsRes.data ?? []);
        const defaultYear = (yearsRes.data ?? []).find(
          (y) => (y as { status?: string }).status === 'active',
        );
        setYearId(defaultYear?.id ?? yearsRes.data?.[0]?.id ?? '');
      } catch (err) {
        console.error('[SubjectOverridesPage:bootstrap]', err);
        toast.error(t('loadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  // ── Load overrides for the selected year ─────────────────────────────────
  const fetchOverrides = React.useCallback(async () => {
    if (!yearId) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ academic_year_id: yearId, pageSize: '500' });
      if (classFilter !== 'all') qs.set('class_id', classFilter);
      const res = await apiClient<{ data: Override[] }>(
        `/api/v1/class-subject-requirements?${qs.toString()}`,
      );
      setOverrides(res.data ?? []);
    } catch (err) {
      console.error('[SubjectOverridesPage:list]', err);
      toast.error(t('loadError'));
      setOverrides([]);
    } finally {
      setLoading(false);
    }
  }, [yearId, classFilter, t]);

  React.useEffect(() => {
    void fetchOverrides();
  }, [fetchOverrides]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const classNameById = React.useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const subjectNameById = React.useMemo(
    () => new Map(subjects.map((s) => [s.id, s.name])),
    [subjects],
  );
  const roomNameById = React.useMemo(() => new Map(rooms.map((r) => [r.id, r.name])), [rooms]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (o: Override) => {
    setEditing(o);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    try {
      await apiClient(`/api/v1/class-subject-requirements/${id}`, { method: 'DELETE' });
      toast.success(t('deleted'));
      void fetchOverrides();
    } catch (err) {
      console.error('[SubjectOverridesPage:delete]', err);
      toast.error(t('deleteError'));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={openCreate} disabled={!yearId || classes.length === 0}>
            <Plus className="h-4 w-4 me-2" />
            {t('add')}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>{t('academicYear')}</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t('filterClass')}</Label>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allClasses')}</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              {[t('class'), t('subject'), t('periods'), t('room'), t('double'), ''].map((h, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-start text-xs font-semibold text-text-tertiary uppercase"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                  {t('loading')}
                </td>
              </tr>
            ) : overrides.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-text-secondary">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              overrides.map((o) => (
                <tr key={o.id} className="border-b border-border last:border-b-0">
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {classNameById.get(o.class_id) ?? o.class_id}
                  </td>
                  <td className="px-4 py-3">{subjectNameById.get(o.subject_id) ?? o.subject_id}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{o.periods_per_week}/wk</Badge>
                    {o.max_periods_per_day != null && (
                      <span className="ms-2 text-xs text-text-tertiary">
                        ≤ {o.max_periods_per_day}/day
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {o.preferred_room_id
                      ? (roomNameById.get(o.preferred_room_id) ?? '—')
                      : o.required_room_type
                        ? t(`roomType.${o.required_room_type}` as never)
                        : '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {o.requires_double_period ? (
                      <Badge variant="info">{o.double_period_count ?? 1}×</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(o)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger-500"
                        onClick={() => void handleDelete(o.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <OverrideDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        yearId={yearId}
        classes={classes}
        subjects={subjects}
        rooms={rooms}
        onSaved={() => {
          setDialogOpen(false);
          void fetchOverrides();
        }}
      />
    </div>
  );
}

// ─── Create/Edit dialog ─────────────────────────────────────────────────────

interface DialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Override | null;
  yearId: string;
  classes: ClassOption[];
  subjects: SubjectOption[];
  rooms: RoomOption[];
  onSaved: () => void;
}

function OverrideDialog({
  open,
  onOpenChange,
  editing,
  yearId,
  classes,
  subjects,
  rooms,
  onSaved,
}: DialogProps) {
  const t = useTranslations('scheduling.subjectOverrides');

  const form = useForm<CreateClassSubjectRequirementDto>({
    resolver: zodResolver(createClassSubjectRequirementSchema),
    defaultValues: {
      academic_year_id: yearId,
      class_id: '',
      subject_id: '',
      periods_per_week: 3,
      max_periods_per_day: undefined,
      preferred_room_id: undefined,
      required_room_type: undefined,
      requires_double_period: false,
      double_period_count: undefined,
      notes: undefined,
    },
  });

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      form.reset({
        academic_year_id: editing.academic_year_id,
        class_id: editing.class_id,
        subject_id: editing.subject_id,
        periods_per_week: editing.periods_per_week,
        max_periods_per_day: editing.max_periods_per_day ?? undefined,
        preferred_room_id: editing.preferred_room_id ?? undefined,
        required_room_type:
          (editing.required_room_type as (typeof ROOM_TYPES)[number] | null) ?? undefined,
        requires_double_period: editing.requires_double_period,
        double_period_count: editing.double_period_count ?? undefined,
        notes: editing.notes ?? undefined,
      });
    } else {
      form.reset({
        academic_year_id: yearId,
        class_id: '',
        subject_id: '',
        periods_per_week: 3,
        max_periods_per_day: undefined,
        preferred_room_id: undefined,
        required_room_type: undefined,
        requires_double_period: false,
        double_period_count: undefined,
        notes: undefined,
      });
    }
  }, [open, editing, yearId, form]);

  const onSubmit = form.handleSubmit(async (data) => {
    try {
      if (editing) {
        const payload: UpdateClassSubjectRequirementDto = {
          periods_per_week: data.periods_per_week,
          max_periods_per_day: data.max_periods_per_day ?? null,
          preferred_room_id: data.preferred_room_id ?? null,
          required_room_type: data.required_room_type ?? null,
          requires_double_period: data.requires_double_period ?? false,
          double_period_count: data.double_period_count ?? null,
          notes: data.notes ?? null,
        };
        updateClassSubjectRequirementSchema.parse(payload);
        await apiClient(`/api/v1/class-subject-requirements/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient('/api/v1/class-subject-requirements', {
          method: 'POST',
          body: JSON.stringify(data),
        });
      }
      toast.success(t(editing ? 'updated' : 'created'));
      onSaved();
    } catch (err) {
      console.error('[OverrideDialog:submit]', err);
      toast.error(t('saveError'));
    }
  });

  const requiresDouble = form.watch('requires_double_period');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t('editTitle') : t('createTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('class')}</Label>
              <Select
                value={form.watch('class_id') || ''}
                onValueChange={(v) => form.setValue('class_id', v, { shouldValidate: true })}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectClass')} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.class_id && (
                <p className="text-xs text-danger-500">{form.formState.errors.class_id.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t('subject')}</Label>
              <Select
                value={form.watch('subject_id') || ''}
                onValueChange={(v) => form.setValue('subject_id', v, { shouldValidate: true })}
                disabled={!!editing}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectSubject')} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.subject_id && (
                <p className="text-xs text-danger-500">
                  {form.formState.errors.subject_id.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t('periodsPerWeek')}</Label>
              <Input
                type="number"
                min={0}
                {...form.register('periods_per_week', { valueAsNumber: true })}
              />
              {form.formState.errors.periods_per_week && (
                <p className="text-xs text-danger-500">
                  {form.formState.errors.periods_per_week.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t('maxPerDay')}</Label>
              <Input
                type="number"
                min={1}
                placeholder={t('optional')}
                {...form.register('max_periods_per_day', {
                  setValueAs: (v) => (v === '' ? undefined : Number(v)),
                })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('preferredRoom')}</Label>
              <Select
                value={form.watch('preferred_room_id') ?? 'none'}
                onValueChange={(v) =>
                  form.setValue('preferred_room_id', v === 'none' ? null : v, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('none')}</SelectItem>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('requiredRoomType')}</Label>
              <Select
                value={form.watch('required_room_type') ?? 'none'}
                onValueChange={(v) =>
                  form.setValue(
                    'required_room_type',
                    v === 'none' ? null : (v as (typeof ROOM_TYPES)[number]),
                    { shouldValidate: true },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('none')}</SelectItem>
                  {ROOM_TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {t(`roomType.${rt}` as never)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="requires-double"
              checked={!!requiresDouble}
              onCheckedChange={(v) =>
                form.setValue('requires_double_period', v === true, { shouldValidate: true })
              }
            />
            <Label htmlFor="requires-double" className="cursor-pointer">
              {t('requiresDouble')}
            </Label>
          </div>

          {requiresDouble && (
            <div className="space-y-1.5">
              <Label>{t('doubleCount')}</Label>
              <Input
                type="number"
                min={1}
                {...form.register('double_period_count', {
                  setValueAs: (v) => (v === '' ? undefined : Number(v)),
                })}
              />
              {form.formState.errors.double_period_count && (
                <p className="text-xs text-danger-500">
                  {form.formState.errors.double_period_count.message}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{t('notes')}</Label>
            <Input placeholder={t('notesPlaceholder')} {...form.register('notes')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {t(editing ? 'save' : 'create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
