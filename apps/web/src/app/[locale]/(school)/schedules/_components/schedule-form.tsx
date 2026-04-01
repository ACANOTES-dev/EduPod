'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
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

import { ConflictAlert } from '@/components/conflict-alert';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface Conflict {
  type: 'hard' | 'soft';
  message: string;
}

interface ScheduleFormData {
  class_id: string;
  teacher_id: string;
  room_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  effective_from: string;
  effective_to: string;
}

interface ScheduleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  initialData?: Partial<ScheduleFormData>;
  editId?: string;
}

const WEEKDAYS = [
  { value: '1', label: 'monday' },
  { value: '2', label: 'tuesday' },
  { value: '3', label: 'wednesday' },
  { value: '4', label: 'thursday' },
  { value: '5', label: 'friday' },
  { value: '6', label: 'saturday' },
  { value: '0', label: 'sunday' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleForm({
  open,
  onOpenChange,
  onSuccess,
  initialData,
  editId,
}: ScheduleFormProps) {
  const t = useTranslations('scheduling');
  const tc = useTranslations('common');

  const [classId, setClassId] = React.useState(initialData?.class_id ?? '');
  const [teacherId, setTeacherId] = React.useState(initialData?.teacher_id ?? '');
  const [roomId, setRoomId] = React.useState(initialData?.room_id ?? '');
  const [weekday, setWeekday] = React.useState(String(initialData?.weekday ?? '1'));
  const [startTime, setStartTime] = React.useState(initialData?.start_time ?? '08:00');
  const [endTime, setEndTime] = React.useState(initialData?.end_time ?? '09:00');
  const [effectiveFrom, setEffectiveFrom] = React.useState(initialData?.effective_from ?? '');
  const [effectiveTo, setEffectiveTo] = React.useState(initialData?.effective_to ?? '');

  const [classes, setClasses] = React.useState<SelectOption[]>([]);
  const [teachers, setTeachers] = React.useState<SelectOption[]>([]);
  const [rooms, setRooms] = React.useState<SelectOption[]>([]);

  const [conflicts, setConflicts] = React.useState<Conflict[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [overridden, setOverridden] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    Promise.all([
      apiClient<{ data: SelectOption[] }>('/api/v1/classes?pageSize=100'),
      apiClient<{ data: Array<{ id: string; user?: { first_name: string; last_name: string } }> }>(
        '/api/v1/staff-profiles?pageSize=100',
      ),
      apiClient<{ data: SelectOption[] }>('/api/v1/rooms?pageSize=100'),
    ])
      .then(([classesRes, teachersRes, roomsRes]) => {
        setClasses(classesRes.data);
        setTeachers(
          (teachersRes.data ?? []).map((s) => ({
            id: s.id,
            name: s.user ? `${s.user.first_name} ${s.user.last_name}` : s.id,
          })),
        );
        setRooms(roomsRes.data);
      })
      .catch(() => undefined);
  }, [open]);

  React.useEffect(() => {
    if (open && initialData) {
      setClassId(initialData.class_id ?? '');
      setTeacherId(initialData.teacher_id ?? '');
      setRoomId(initialData.room_id ?? '');
      setWeekday(String(initialData.weekday ?? '1'));
      setStartTime(initialData.start_time ?? '08:00');
      setEndTime(initialData.end_time ?? '09:00');
      setEffectiveFrom(initialData.effective_from ?? '');
      setEffectiveTo(initialData.effective_to ?? '');
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !teacherId || !roomId || !effectiveFrom) return;

    setSaving(true);
    setConflicts([]);

    const payload = {
      class_id: classId,
      teacher_id: teacherId,
      room_id: roomId,
      weekday: parseInt(weekday, 10),
      start_time: startTime,
      end_time: endTime,
      effective_from: effectiveFrom,
      effective_to: effectiveTo || null,
      override: overridden,
    };

    try {
      if (editId) {
        await apiClient(`/api/v1/schedules/${editId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } else {
        await apiClient('/api/v1/schedules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }
      toast.success(editId ? 'Schedule updated' : 'Schedule created');
      onSuccess();
      onOpenChange(false);
    } catch (err: unknown) {
      const errorData = err as { conflicts?: Conflict[]; error?: { message?: string } };
      if (errorData.conflicts && errorData.conflicts.length > 0) {
        setConflicts(errorData.conflicts);
      } else {
        toast.error(errorData.error?.message ?? tc('errorGeneric'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editId ? t('editSchedule') : t('createSchedule')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('teacher')}</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((tr) => (
                    <SelectItem key={tr.id} value={tr.id}>
                      {tr.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('room')}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room" />
                </SelectTrigger>
                <SelectContent>
                  {rooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('weekday')}</Label>
              <Select value={weekday} onValueChange={setWeekday}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {t(d.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t('startTime')}</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('endTime')}</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('effectiveFrom')}</Label>
              <Input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>{t('effectiveTo')}</Label>
              <Input
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
              />
            </div>
          </div>

          {conflicts.length > 0 && (
            <ConflictAlert
              conflicts={conflicts}
              canOverride={!conflicts.some((c) => c.type === 'hard')}
              onOverride={() => setOverridden(true)}
            />
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={saving || !classId || !teacherId || !roomId}>
              {saving ? tc('loading') : tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
