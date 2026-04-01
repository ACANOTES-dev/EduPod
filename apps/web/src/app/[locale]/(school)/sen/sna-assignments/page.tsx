'use client';

import {
  AlertTriangle,
  Calendar,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Search,
  UserMinus,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Skeleton,
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimeSlot {
  start: string;
  end: string;
}

interface WeeklySchedule {
  monday: TimeSlot[];
  tuesday: TimeSlot[];
  wednesday: TimeSlot[];
  thursday: TimeSlot[];
  friday: TimeSlot[];
}

interface Assignment {
  id: string;
  sna_staff_profile_id: string;
  sna_staff_name: string;
  student_id: string;
  student_name: string;
  sen_profile_id: string;
  schedule: WeeklySchedule;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'ended';
  notes: string | null;
}

interface AssignmentResponse {
  data: Assignment[];
  meta: { page: number; pageSize: number; total: number };
}

interface StaffMember {
  id: string;
  full_name: string;
}

interface StudentResult {
  id: string;
  full_name: string;
  sen_profile_id?: string;
}

// ─── Day keys ─────────────────────────────────────────────────────────────────

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const;
type Weekday = (typeof WEEKDAYS)[number];

const SCHEDULE_HOURS = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
] as const;

// ─── Schedule Grid Component ──────────────────────────────────────────────────

function ScheduleGrid({ schedule }: { schedule: WeeklySchedule }) {
  const t = useTranslations('sen');

  const isHourActive = React.useCallback(
    (day: Weekday, hour: string): boolean => {
      const slots = schedule[day];
      if (!slots || slots.length === 0) return false;

      const hourNum = parseInt(hour.split(':')[0] ?? '0', 10);
      return slots.some((slot) => {
        const startH = parseInt(slot.start.split(':')[0] ?? '0', 10);
        const endH = parseInt(slot.end.split(':')[0] ?? '0', 10);
        return hourNum >= startH && hourNum < endH;
      });
    },
    [schedule],
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-start font-medium text-text-tertiary" />
            {WEEKDAYS.map((day) => (
              <th key={day} className="px-2 py-1 text-center font-medium text-text-secondary">
                {t(`sna.day.${day}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SCHEDULE_HOURS.map((hour) => (
            <tr key={hour}>
              <td className="px-2 py-0.5 text-end font-mono text-text-tertiary" dir="ltr">
                {hour}
              </td>
              {WEEKDAYS.map((day) => (
                <td key={`${day}-${hour}`} className="px-1 py-0.5">
                  <div
                    className={`mx-auto h-4 w-full rounded-sm transition-colors ${
                      isHourActive(day, hour) ? 'bg-primary-500' : 'bg-surface-secondary'
                    }`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Schedule summary text ────────────────────────────────────────────────────

function formatScheduleSummary(
  schedule: WeeklySchedule,
  t: ReturnType<typeof useTranslations>,
): string {
  const parts: string[] = [];
  for (const day of WEEKDAYS) {
    const slots = schedule[day];
    if (slots && slots.length > 0) {
      const slotStrings = slots.map((s) => `${s.start}-${s.end}`);
      parts.push(`${t(`sna.dayShort.${day}`)} ${slotStrings.join(', ')}`);
    }
  }
  return parts.join('; ') || '—';
}

// ─── Schedule Builder ─────────────────────────────────────────────────────────

interface ScheduleBuilderProps {
  value: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
}

function ScheduleBuilder({ value, onChange }: ScheduleBuilderProps) {
  const t = useTranslations('sen');

  const handleDayChange = React.useCallback(
    (day: Weekday, start: string, end: string) => {
      const updated = { ...value };
      if (start && end) {
        updated[day] = [{ start, end }];
      } else {
        updated[day] = [];
      }
      onChange(updated);
    },
    [value, onChange],
  );

  return (
    <div className="space-y-3">
      {WEEKDAYS.map((day) => {
        const slot = value[day]?.[0];
        return (
          <div key={day} className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm font-medium text-text-primary">
              {t(`sna.day.${day}`)}
            </span>
            <Input
              type="time"
              value={slot?.start ?? ''}
              onChange={(e) => handleDayChange(day, e.target.value, slot?.end ?? '')}
              className="w-full sm:w-28"
            />
            <span className="text-xs text-text-tertiary">{t('sna.to')}</span>
            <Input
              type="time"
              value={slot?.end ?? ''}
              onChange={(e) => handleDayChange(day, slot?.start ?? '', e.target.value)}
              className="w-full sm:w-28"
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Create/Edit Assignment Dialog ────────────────────────────────────────────

interface AssignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  initial?: Assignment | null;
}

function AssignDialog({ open, onOpenChange, onSubmit, initial }: AssignDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);

  // SNA staff search
  const [snaSearch, setSnaSearch] = React.useState('');
  const [snaResults, setSnaResults] = React.useState<StaffMember[]>([]);
  const [selectedSna, setSelectedSna] = React.useState<StaffMember | null>(null);
  const [snaLoading, setSnaLoading] = React.useState(false);

  // Student search
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentResults, setStudentResults] = React.useState<StudentResult[]>([]);
  const [selectedStudent, setSelectedStudent] = React.useState<StudentResult | null>(null);
  const [studentLoading, setStudentLoading] = React.useState(false);

  const emptySchedule: WeeklySchedule = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
  };

  const [schedule, setSchedule] = React.useState<WeeklySchedule>(
    initial?.schedule ?? emptySchedule,
  );
  const [startDate, setStartDate] = React.useState(initial?.start_date ?? '');
  const [notes, setNotes] = React.useState(initial?.notes ?? '');

  // Reset form on open
  React.useEffect(() => {
    if (open) {
      if (initial) {
        setSelectedSna({ id: initial.sna_staff_profile_id, full_name: initial.sna_staff_name });
        setSnaSearch(initial.sna_staff_name);
        setSelectedStudent({
          id: initial.student_id,
          full_name: initial.student_name,
          sen_profile_id: initial.sen_profile_id,
        });
        setStudentSearch(initial.student_name);
        setSchedule(initial.schedule);
        setStartDate(initial.start_date?.slice(0, 10) ?? '');
        setNotes(initial.notes ?? '');
      } else {
        setSelectedSna(null);
        setSnaSearch('');
        setSelectedStudent(null);
        setStudentSearch('');
        setSchedule(emptySchedule);
        setStartDate('');
        setNotes('');
      }
      setSnaResults([]);
      setStudentResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  // Debounced SNA search
  React.useEffect(() => {
    if (!snaSearch || snaSearch.length < 2 || selectedSna) {
      setSnaResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSnaLoading(true);
      try {
        const res = await apiClient<{ data: StaffMember[] }>(
          `/api/v1/staff?search=${encodeURIComponent(snaSearch)}&pageSize=10`,
        );
        setSnaResults(res.data);
      } catch (err) {
        console.error('[AssignDialog] sna search', err);
        setSnaResults([]);
      } finally {
        setSnaLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [snaSearch, selectedSna]);

  // Debounced student search
  React.useEffect(() => {
    if (!studentSearch || studentSearch.length < 2 || selectedStudent) {
      setStudentResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setStudentLoading(true);
      try {
        const res = await apiClient<{ data: StudentResult[] }>(
          `/api/v1/students?search=${encodeURIComponent(studentSearch)}&pageSize=10`,
        );
        setStudentResults(res.data);
      } catch (err) {
        console.error('[AssignDialog] student search', err);
        setStudentResults([]);
      } finally {
        setStudentLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [studentSearch, selectedStudent]);

  const handleSave = React.useCallback(async () => {
    setSaving(true);
    try {
      if (initial) {
        await apiClient(`/api/v1/sen/sna-assignments/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ schedule, notes: notes || null }),
        });
        toast.success(t('sna.assignmentUpdated'));
      } else {
        if (!selectedSna || !selectedStudent || !startDate) return;
        await apiClient('/api/v1/sen/sna-assignments', {
          method: 'POST',
          body: JSON.stringify({
            sna_staff_profile_id: selectedSna.id,
            student_id: selectedStudent.id,
            sen_profile_id: selectedStudent.sen_profile_id ?? null,
            schedule,
            start_date: startDate,
            notes: notes || null,
          }),
        });
        toast.success(t('sna.assignmentCreated'));
      }
      onOpenChange(false);
      onSubmit();
    } catch (err) {
      console.error('[AssignDialog] save', err);
      toast.error(t('sna.assignmentSaveError'));
    } finally {
      setSaving(false);
    }
  }, [
    initial,
    selectedSna,
    selectedStudent,
    schedule,
    startDate,
    notes,
    onOpenChange,
    onSubmit,
    t,
  ]);

  const canSave = initial ? true : Boolean(selectedSna && selectedStudent && startDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? t('sna.editAssignment') : t('sna.assignSna')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* SNA selection */}
          {!initial && (
            <div className="space-y-2">
              <Label>{t('sna.snaStaff')}</Label>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  value={snaSearch}
                  onChange={(e) => {
                    setSnaSearch(e.target.value);
                    if (selectedSna && e.target.value !== selectedSna.full_name) {
                      setSelectedSna(null);
                    }
                  }}
                  placeholder={t('sna.searchSna')}
                  className="ps-9"
                />
                {snaLoading && (
                  <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-tertiary" />
                )}
              </div>
              {snaResults.length > 0 && !selectedSna && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface shadow-md">
                  {snaResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedSna(s);
                        setSnaSearch(s.full_name);
                        setSnaResults([]);
                      }}
                      className="flex w-full items-center px-3 py-2 text-start text-sm text-text-primary hover:bg-surface-secondary"
                    >
                      {s.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Student selection */}
          {!initial && (
            <div className="space-y-2">
              <Label>{t('sna.student')}</Label>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  value={studentSearch}
                  onChange={(e) => {
                    setStudentSearch(e.target.value);
                    if (selectedStudent && e.target.value !== selectedStudent.full_name) {
                      setSelectedStudent(null);
                    }
                  }}
                  placeholder={t('sna.searchStudent')}
                  className="ps-9"
                />
                {studentLoading && (
                  <Loader2 className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-tertiary" />
                )}
              </div>
              {studentResults.length > 0 && !selectedStudent && (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface shadow-md">
                  {studentResults.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudent(s);
                        setStudentSearch(s.full_name);
                        setStudentResults([]);
                      }}
                      className="flex w-full items-center px-3 py-2 text-start text-sm text-text-primary hover:bg-surface-secondary"
                    >
                      {s.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Start date */}
          {!initial && (
            <div className="space-y-2">
              <Label>{t('sna.startDate')}</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          )}

          {/* Schedule */}
          <div className="space-y-2">
            <Label>{t('sna.schedule')}</Label>
            <ScheduleBuilder value={schedule} onChange={setSchedule} />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>{t('sna.notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('sna.notesPlaceholder')}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('sna.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || !canSave}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {initial ? t('sna.save') : t('sna.assign')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── End Assignment Dialog ────────────────────────────────────────────────────

interface EndDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  assignmentId: string | null;
}

function EndAssignmentDialog({ open, onOpenChange, onSubmit, assignmentId }: EndDialogProps) {
  const t = useTranslations('sen');
  const [saving, setSaving] = React.useState(false);
  const [endDate, setEndDate] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setEndDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  const handleEnd = React.useCallback(async () => {
    if (!assignmentId || !endDate) return;
    setSaving(true);
    try {
      await apiClient(`/api/v1/sen/sna-assignments/${assignmentId}/end`, {
        method: 'PATCH',
        body: JSON.stringify({ end_date: endDate }),
      });
      toast.success(t('sna.assignmentEnded'));
      onOpenChange(false);
      onSubmit();
    } catch (err) {
      console.error('[EndAssignmentDialog] end', err);
      toast.error(t('sna.assignmentEndError'));
    } finally {
      setSaving(false);
    }
  }, [assignmentId, endDate, onOpenChange, onSubmit, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('sna.endAssignment')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">{t('sna.endAssignmentDescription')}</p>
          <div className="space-y-2">
            <Label>{t('sna.endDate')}</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('sna.cancel')}
          </Button>
          <Button variant="destructive" onClick={handleEnd} disabled={saving || !endDate}>
            {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('sna.confirmEnd')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assignment Card ──────────────────────────────────────────────────────────

interface AssignmentCardProps {
  assignment: Assignment;
  showField: 'student' | 'sna';
  onEdit: (assignment: Assignment) => void;
  onEnd: (id: string) => void;
}

function AssignmentCard({ assignment, showField, onEdit, onEnd }: AssignmentCardProps) {
  const t = useTranslations('sen');
  const [showSchedule, setShowSchedule] = React.useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-text-primary">
            {showField === 'student' ? assignment.student_name : assignment.sna_staff_name}
          </p>
          <p className="text-xs text-text-secondary">
            {formatScheduleSummary(assignment.schedule, t)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={assignment.status === 'active' ? 'success' : 'neutral'} dot>
              {assignment.status === 'active' ? t('sna.statusActive') : t('sna.statusEnded')}
            </StatusBadge>
            <span className="text-xs text-text-tertiary" dir="ltr">
              {assignment.start_date?.slice(0, 10)}
              {assignment.end_date ? ` — ${assignment.end_date.slice(0, 10)}` : ''}
            </span>
          </div>
          {assignment.notes && <p className="text-xs text-text-tertiary">{assignment.notes}</p>}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSchedule(!showSchedule)}
            title={t('sna.viewSchedule')}
          >
            <Calendar className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(assignment)}
            title={t('sna.edit')}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          {assignment.status === 'active' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEnd(assignment.id)}
              title={t('sna.endAssignment')}
            >
              <UserMinus className="h-4 w-4 text-danger-text" />
            </Button>
          )}
        </div>
      </div>

      {showSchedule && (
        <div className="mt-3 border-t border-border pt-3">
          <ScheduleGrid schedule={assignment.schedule} />
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SnaAssignmentsPage() {
  const t = useTranslations('sen');

  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [view, setView] = React.useState<'bySna' | 'byStudent'>('bySna');

  // Dialogs
  const [assignDialogOpen, setAssignDialogOpen] = React.useState(false);
  const [editAssignment, setEditAssignment] = React.useState<Assignment | null>(null);
  const [endDialogOpen, setEndDialogOpen] = React.useState(false);
  const [endAssignmentId, setEndAssignmentId] = React.useState<string | null>(null);

  // ─── Fetch ────────────────────────────────────────────────────────────────

  const fetchAssignments = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiClient<AssignmentResponse>('/api/v1/sen/sna-assignments?pageSize=200');
      setAssignments(res.data);
    } catch (err) {
      console.error('[SnaAssignmentsPage] fetch', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAssignments();
  }, [fetchAssignments]);

  // ─── Grouped data ─────────────────────────────────────────────────────────

  const groupedBySna = React.useMemo(() => {
    const groups: Record<string, { name: string; assignments: Assignment[] }> = {};
    for (const a of assignments) {
      const key = a.sna_staff_profile_id;
      if (!groups[key]) {
        groups[key] = { name: a.sna_staff_name, assignments: [] };
      }
      groups[key].assignments.push(a);
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments]);

  const groupedByStudent = React.useMemo(() => {
    const groups: Record<string, { name: string; assignments: Assignment[] }> = {};
    for (const a of assignments) {
      const key = a.student_id;
      if (!groups[key]) {
        groups[key] = { name: a.student_name, assignments: [] };
      }
      groups[key].assignments.push(a);
    }
    return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
  }, [assignments]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleEdit = React.useCallback((assignment: Assignment) => {
    setEditAssignment(assignment);
    setAssignDialogOpen(true);
  }, []);

  const handleEndClick = React.useCallback((id: string) => {
    setEndAssignmentId(id);
    setEndDialogOpen(true);
  }, []);

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('sna.title')} />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={`skel-${i}`} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('sna.title')} />
        <EmptyState
          icon={AlertTriangle}
          title={t('sna.errorTitle')}
          description={t('sna.errorDescription')}
        />
      </div>
    );
  }

  // ─── Active counts ────────────────────────────────────────────────────────

  const activeCount = assignments.filter((a) => a.status === 'active').length;
  const totalSnas = new Set(assignments.map((a) => a.sna_staff_profile_id)).size;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('sna.title')}
        description={t('sna.description')}
        actions={
          <Button
            onClick={() => {
              setEditAssignment(null);
              setAssignDialogOpen(true);
            }}
          >
            <Plus className="me-2 h-4 w-4" />
            {t('sna.assignSna')}
          </Button>
        }
      />

      {/* Stats */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-4 py-2">
          <Users className="h-4 w-4 text-text-tertiary" />
          <span className="text-sm text-text-secondary">
            {t('sna.totalSnas', { count: totalSnas })}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-surface-secondary px-4 py-2">
          <Clock className="h-4 w-4 text-text-tertiary" />
          <span className="text-sm text-text-secondary">
            {t('sna.activeAssignments', { count: activeCount })}
          </span>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 rounded-lg bg-surface-secondary p-1">
        <Button
          variant={view === 'bySna' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setView('bySna')}
        >
          {t('sna.bySna')}
        </Button>
        <Button
          variant={view === 'byStudent' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setView('byStudent')}
        >
          {t('sna.byStudent')}
        </Button>
      </div>

      {/* Content */}
      {assignments.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('sna.noAssignments')}
          description={t('sna.noAssignmentsDescription')}
        />
      ) : view === 'bySna' ? (
        <div className="space-y-6">
          {groupedBySna.map((group) => (
            <section key={group.name} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-text-primary">{group.name}</h3>
                <Badge variant="secondary">{group.assignments.length}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {group.assignments.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    showField="student"
                    onEdit={handleEdit}
                    onEnd={handleEndClick}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByStudent.map((group) => (
            <section key={group.name} className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-text-primary">{group.name}</h3>
                <Badge variant="secondary">{group.assignments.length}</Badge>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {group.assignments.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    showField="sna"
                    onEdit={handleEdit}
                    onEnd={handleEndClick}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────────────────── */}
      <AssignDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        onSubmit={fetchAssignments}
        initial={editAssignment}
      />

      <EndAssignmentDialog
        open={endDialogOpen}
        onOpenChange={setEndDialogOpen}
        onSubmit={fetchAssignments}
        assignmentId={endAssignmentId}
      />
    </div>
  );
}
