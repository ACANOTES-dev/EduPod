/* eslint-disable school/no-hand-rolled-forms -- legacy form, tracked for migration in HR-025 */
'use client';

import {
  BookOpen,
  Calendar,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  UserCheck,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
import { exportToExcel, exportToPdf } from '@/lib/export-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExamSessionStatus = 'planning' | 'published' | 'completed';

interface AcademicPeriod {
  id: string;
  name: string;
}

interface ExamSession {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: ExamSessionStatus;
  slot_count: number;
  unassigned_count: number;
}

interface ExamSlotRoom {
  id: string;
  room_id: string;
  room_name: string | null;
  capacity: number;
}

interface ExamSlotInvigilator {
  staff_profile_id: string;
  name: string;
  role: 'lead' | 'assistant';
}

interface ExamSlot {
  id: string;
  subject_name: string | null;
  year_group_name: string | null;
  paper_number: 1 | 2 | null;
  date: string;
  start_time: string;
  end_time: string;
  rooms: ExamSlotRoom[];
  duration_minutes: number;
  student_count: number;
  invigilators: ExamSlotInvigilator[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sessionStatusVariant(status: ExamSessionStatus): 'default' | 'secondary' | 'danger' {
  if (status === 'published') return 'default';
  if (status === 'planning') return 'secondary';
  return 'secondary';
}

// Group slots by year group so the published timetable renders one card per
// year group (mirrors the review tab in exam-schedules/[sessionId]). Rows sort
// by date then start time; groups sort alphabetically, with unknown-year-group
// rows pinned to the end.
function groupSlotsByYearGroup(
  slots: ExamSlot[],
): Array<{ yearGroupName: string; rows: ExamSlot[] }> {
  const groups = new Map<string, { yearGroupName: string; rows: ExamSlot[] }>();
  for (const s of slots) {
    const key = s.year_group_name ?? '__unknown__';
    const bucket = groups.get(key);
    if (bucket) {
      bucket.rows.push(s);
    } else {
      groups.set(key, { yearGroupName: s.year_group_name ?? '—', rows: [s] });
    }
  }

  const ordered = Array.from(groups.entries()).map(([id, g]) => {
    const rows = [...g.rows].sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.start_time.localeCompare(b.start_time);
    });
    return { key: id, yearGroupName: g.yearGroupName, rows };
  });

  ordered.sort((a, b) => {
    if (a.key === '__unknown__') return 1;
    if (b.key === '__unknown__') return -1;
    return a.yearGroupName.localeCompare(b.yearGroupName);
  });

  return ordered.map(({ yearGroupName, rows }) => ({ yearGroupName, rows }));
}

// Flatten a year-group's slots into plain rows for export + print. Mirrors the
// on-screen table columns so the exported/printed artefact matches what the
// user sees.
function buildExportRows(
  rows: ExamSlot[],
  headers: {
    date: string;
    time: string;
    subject: string;
    paper: string;
    duration: string;
    rooms: string;
    students: string;
    invigilators: string;
  },
  singlePaperLabel: string,
): {
  columns: Array<{ header: string; key: string }>;
  dataRows: Array<Record<string, string | number>>;
} {
  const columns = [
    { header: headers.date, key: 'date' },
    { header: headers.time, key: 'time' },
    { header: headers.subject, key: 'subject' },
    { header: headers.paper, key: 'paper' },
    { header: headers.duration, key: 'duration' },
    { header: headers.rooms, key: 'rooms' },
    { header: headers.students, key: 'students' },
    { header: headers.invigilators, key: 'invigilators' },
  ];
  const dataRows = rows.map((s) => ({
    date: new Date(s.date).toLocaleDateString(),
    time: `${s.start_time} – ${s.end_time}`,
    subject: s.subject_name ?? '—',
    paper: s.paper_number ? `P${s.paper_number}` : singlePaperLabel,
    duration: `${s.duration_minutes}m`,
    rooms: s.rooms.length === 0 ? '—' : s.rooms.map((r) => r.room_name ?? '—').join(', '),
    students: s.student_count,
    invigilators: s.invigilators.length === 0 ? '—' : s.invigilators.map((i) => i.name).join(', '),
  }));
  return { columns, dataRows };
}

// Opens a new window with a self-contained HTML table styled for landscape
// printing, then auto-triggers the print dialog. Using a separate window
// sidesteps the complexity of @media-print rules competing with the app shell.
function printYearGroupTable(
  title: string,
  columns: Array<{ header: string; key: string }>,
  dataRows: Array<Record<string, string | number>>,
): void {
  const escape = (v: unknown): string =>
    String(v ?? '').replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        default:
          return '&#39;';
      }
    });

  const headHtml = columns.map((c) => `<th>${escape(c.header)}</th>`).join('');
  const bodyHtml = dataRows
    .map((r) => `<tr>${columns.map((c) => `<td>${escape(r[c.key])}</td>`).join('')}</tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escape(title)}</title>
<style>
  @page { size: landscape; margin: 1cm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #111; margin: 0; padding: 16px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .sub { font-size: 11px; color: #666; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: start; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.03em; }
  tr:nth-child(even) td { background: #fafafa; }
</style>
</head>
<body>
  <h1>${escape(title)}</h1>
  <div class="sub">${escape(new Date().toLocaleDateString())}</div>
  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=1100,height=800');
  if (!w) {
    toast.error('Pop-up blocked — allow pop-ups to print.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  // Give the new window a beat to lay out before invoking print.
  setTimeout(() => {
    w.print();
  }, 250);
}

// ─── Create Session Modal ─────────────────────────────────────────────────────

function CreateSessionModal({
  open,
  onOpenChange,
  periods,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  periods: AcademicPeriod[];
  onSubmit: (values: {
    name: string;
    academic_period_id: string;
    start_date: string;
    end_date: string;
  }) => Promise<void>;
}) {
  const t = useTranslations('scheduling.exams');
  const tc = useTranslations('common');
  const [name, setName] = React.useState('');
  const [periodId, setPeriodId] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setName('');
      setPeriodId('');
      setStartDate('');
      setEndDate('');
      setError('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !periodId || !startDate || !endDate) {
      setError(t('validationRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit({
        name,
        academic_period_id: periodId,
        start_date: startDate,
        end_date: endDate,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('createSession')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('sessionName')}</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('sessionNamePlaceholder')}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('academicPeriod')}</Label>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectPeriod')} />
              </SelectTrigger>
              <SelectContent>
                {periods.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('startDate')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('endDate')}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                dir="ltr"
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('createSession')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Exam Slot Modal ──────────────────────────────────────────────────────

function AddExamSlotModal({
  open,
  onOpenChange,
  sessionId,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  onSubmit: (values: {
    subject_id: string;
    year_group_id: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    student_count: number;
  }) => Promise<void>;
}) {
  const t = useTranslations('scheduling.exams');
  const tc = useTranslations('common');
  const [subjects, setSubjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [yearGroups, setYearGroups] = React.useState<Array<{ id: string; name: string }>>([]);
  const [subjectId, setSubjectId] = React.useState('');
  const [yearGroupId, setYearGroupId] = React.useState('');
  const [date, setDate] = React.useState('');
  const [startTime, setStartTime] = React.useState('');
  const [duration, setDuration] = React.useState(90);
  const [studentCount, setStudentCount] = React.useState(30);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setSubjectId('');
      setYearGroupId('');
      setDate('');
      setStartTime('');
      setDuration(90);
      setStudentCount(30);
      setError('');
      Promise.all([
        apiClient<{ data: Array<{ id: string; name: string }> }>('/api/v1/subjects?pageSize=100'),
        apiClient<{ data: Array<{ id: string; name: string }> }>(
          '/api/v1/year-groups?pageSize=100',
        ),
      ])
        .then(([sRes, ygRes]) => {
          setSubjects(sRes.data ?? []);
          setYearGroups(ygRes.data ?? []);
        })
        .catch((err) => {
          console.error('[SchedulingExamsPage]', err);
        });
    }
  }, [open, sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectId || !yearGroupId || !date || !startTime) {
      setError(t('validationRequired'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSubmit({
        subject_id: subjectId,
        year_group_id: yearGroupId,
        date,
        start_time: startTime,
        duration_minutes: duration,
        student_count: studentCount,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('addExam')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('subject')}</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
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
            </div>
            <div className="space-y-1.5">
              <Label>{t('yearGroup')}</Label>
              <Select value={yearGroupId} onValueChange={setYearGroupId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectYearGroup')} />
                </SelectTrigger>
                <SelectContent>
                  {yearGroups.map((yg) => (
                    <SelectItem key={yg.id} value={yg.id}>
                      {yg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('examDate')}</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                dir="ltr"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('startTime')}</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                dir="ltr"
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('durationMinutes')}</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value, 10) || 90)}
                min={10}
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('studentCount')}</Label>
              <Input
                type="number"
                value={studentCount}
                onChange={(e) => setStudentCount(parseInt(e.target.value, 10) || 1)}
                min={1}
                dir="ltr"
              />
            </div>
          </div>
          {error && <p className="text-sm text-danger-text">{error}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              {t('addExam')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Session Detail ───────────────────────────────────────────────────────────

function SessionDetail({ session, onBack }: { session: ExamSession; onBack: () => void }) {
  const t = useTranslations('scheduling.exams');
  const [slots, setSlots] = React.useState<ExamSlot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [addSlotOpen, setAddSlotOpen] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [solving, setSolving] = React.useState(false);
  const [assigningInvig, setAssigningInvig] = React.useState(false);

  const fetchSlots = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: ExamSlot[] }>(
        `/api/v1/scheduling/exam-sessions/${session.id}/slots-detailed`,
      );
      setSlots(res.data ?? []);
    } catch (err) {
      console.error('[SchedulingExamsPage]', err);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  React.useEffect(() => {
    void fetchSlots();
  }, [fetchSlots]);

  const handleAddSlot = async (values: {
    subject_id: string;
    year_group_id: string;
    date: string;
    start_time: string;
    duration_minutes: number;
    student_count: number;
  }) => {
    await apiClient(`/api/v1/scheduling/exam-sessions/${session.id}/slots`, {
      method: 'POST',
      body: JSON.stringify(values),
    });
    toast.success(t('examAdded'));
    void fetchSlots();
  };

  const handleGenerateSchedule = async () => {
    setSolving(true);
    try {
      await apiClient(`/api/v1/scheduling/exam-sessions/${session.id}/generate`, {
        method: 'POST',
      });
      toast.success(t('solverStarted'));
    } catch (err) {
      console.error('[SchedulingExamsPage]', err);
      toast.error(t('solverFailed'));
    } finally {
      setSolving(false);
    }
  };

  const handleAssignInvigilators = async () => {
    setAssigningInvig(true);
    try {
      await apiClient(`/api/v1/scheduling/exam-sessions/${session.id}/assign-invigilators`, {
        method: 'POST',
      });
      toast.success(t('invigilatorsAssigned'));
      void fetchSlots();
    } catch (err) {
      console.error('[SchedulingExamsPage]', err);
      toast.error(t('invigilatorsFailed'));
    } finally {
      setAssigningInvig(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await apiClient(`/api/v1/scheduling/exam-sessions/${session.id}/publish`, { method: 'POST' });
      toast.success(t('published'));
      onBack();
    } catch (err) {
      console.error('[SchedulingExamsPage]', err);
      toast.error(t('publishFailed'));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={session.name}
        description={`${new Date(session.start_date).toLocaleDateString()} – ${new Date(session.end_date).toLocaleDateString()}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronRight className="h-4 w-4 rotate-180 rtl:rotate-0 me-1" />
              {t('backToSessions')}
            </Button>
            {session.status === 'planning' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleGenerateSchedule()}
                  disabled={solving}
                >
                  {solving ? (
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 me-2" />
                  )}
                  {t('generateSchedule')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleAssignInvigilators()}
                  disabled={assigningInvig}
                >
                  {assigningInvig ? (
                    <Loader2 className="h-4 w-4 animate-spin me-2" />
                  ) : (
                    <UserCheck className="h-4 w-4 me-2" />
                  )}
                  {t('assignInvigilators')}
                </Button>
                <Button onClick={() => void handlePublish()} disabled={publishing}>
                  {publishing && <Loader2 className="h-4 w-4 animate-spin me-2" />}
                  {t('publish')}
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="flex justify-end">
        <Button variant="outline" onClick={() => setAddSlotOpen(true)}>
          <Plus className="h-4 w-4 me-2" />
          {t('addExam')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('loading')}
        </div>
      ) : slots.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">{t('noSlots')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupSlotsByYearGroup(slots).map(({ yearGroupName, rows }) => {
            const exportHeaders = {
              date: t('date'),
              time: t('time'),
              subject: t('subject'),
              paper: t('paper'),
              duration: t('duration'),
              rooms: t('room'),
              students: t('students'),
              invigilators: t('invigilators'),
            };
            const { columns: exportColumns, dataRows: exportData } = buildExportRows(
              rows,
              exportHeaders,
              t('singlePaper'),
            );
            const exportTitle = `${session.name} — ${yearGroupName}`;
            const fileName = `${session.name}-${yearGroupName}`
              .replace(/\s+/g, '-')
              .replace(/[^a-zA-Z0-9_-]+/g, '');

            return (
              <div key={yearGroupName} className="rounded-2xl border border-border bg-surface">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-semibold text-text-primary">{yearGroupName}</h4>
                    <span className="text-xs text-text-tertiary">
                      {t('groupExamCount', { count: rows.length })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => printYearGroupTable(exportTitle, exportColumns, exportData)}
                    >
                      <Printer className="h-4 w-4 me-1.5" />
                      {t('print')}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4 me-1.5" />
                          {t('export')}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            exportToExcel({
                              fileName,
                              title: exportTitle,
                              columns: exportColumns,
                              rows: exportData,
                            })
                          }
                        >
                          <FileSpreadsheet className="h-4 w-4 me-2" />
                          {t('exportXlsx')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            exportToPdf({
                              fileName,
                              title: exportTitle,
                              columns: exportColumns,
                              rows: exportData,
                            })
                          }
                        >
                          <FileText className="h-4 w-4 me-2" />
                          {t('exportPdf')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-secondary">
                        {[
                          t('date'),
                          t('time'),
                          t('subject'),
                          t('paper'),
                          t('duration'),
                          t('room'),
                          t('students'),
                          t('invigilators'),
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-3 py-2 text-start text-xs font-semibold uppercase text-text-tertiary"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((slot) => (
                        <tr
                          key={slot.id}
                          className="border-b border-border last:border-b-0 hover:bg-surface-secondary/50"
                        >
                          <td className="px-3 py-2 text-text-secondary">
                            {new Date(slot.date).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-text-secondary font-mono text-xs" dir="ltr">
                            {slot.start_time} – {slot.end_time}
                          </td>
                          <td className="px-3 py-2 font-medium text-text-primary">
                            {slot.subject_name ?? '—'}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {slot.paper_number ? `P${slot.paper_number}` : t('singlePaper')}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {slot.duration_minutes}m
                          </td>
                          <td className="px-3 py-2 text-text-secondary">
                            {slot.rooms.length === 0
                              ? '—'
                              : slot.rooms.map((r) => r.room_name ?? '—').join(', ')}
                          </td>
                          <td className="px-3 py-2 text-text-secondary">{slot.student_count}</td>
                          <td className="px-3 py-2 text-text-secondary">
                            {slot.invigilators.length === 0
                              ? '—'
                              : slot.invigilators.map((i) => i.name).join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddExamSlotModal
        open={addSlotOpen}
        onOpenChange={setAddSlotOpen}
        sessionId={session.id}
        onSubmit={handleAddSlot}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExamsPage() {
  const t = useTranslations('scheduling.exams');
  const [sessions, setSessions] = React.useState<ExamSession[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [selectedSession, setSelectedSession] = React.useState<ExamSession | null>(null);

  const fetchSessions = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: ExamSession[] }>(
        '/api/v1/scheduling/exam-sessions?pageSize=50',
      );
      setSessions(res.data ?? []);
    } catch (err) {
      console.error('[SchedulingExamsPage]', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchSessions();
    apiClient<{ data: AcademicPeriod[] }>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data ?? []))
      .catch((err) => {
        console.error('[SchedulingExamsPage]', err);
        return setPeriods([]);
      });
  }, [fetchSessions]);

  const handleCreateSession = async (values: {
    name: string;
    academic_period_id: string;
    start_date: string;
    end_date: string;
  }) => {
    await apiClient('/api/v1/scheduling/exam-sessions', {
      method: 'POST',
      body: JSON.stringify(values),
    });
    toast.success(t('sessionCreated'));
    void fetchSessions();
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!window.confirm(t('confirmDeleteSession'))) return;
    try {
      await apiClient(`/api/v1/scheduling/exam-sessions/${sessionId}`, { method: 'DELETE' });
      toast.success(t('sessionDeleted'));
      void fetchSessions();
    } catch (err) {
      console.error('[SchedulingExamsPage]', err);
      toast.error(t('sessionDeleteFailed'));
    }
  };

  if (selectedSession) {
    return (
      <SessionDetail
        session={selectedSession}
        onBack={() => {
          setSelectedSession(null);
          void fetchSessions();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 me-2" />
            {t('createSession')}
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center">
          <Calendar className="mx-auto h-10 w-10 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">{t('noSessions')}</p>
          <Button className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 me-2" />
            {t('createSession')}
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="cursor-pointer rounded-2xl border border-border bg-surface p-5 transition-shadow hover:shadow-sm"
              onClick={() => setSelectedSession(session)}
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-text-primary">{session.name}</p>
                    <Badge variant={sessionStatusVariant(session.status)}>{session.status}</Badge>
                  </div>
                  <p className="text-sm text-text-secondary">
                    {new Date(session.start_date).toLocaleDateString()} –{' '}
                    {new Date(session.end_date).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {session.slot_count} {t('examsTotal')}
                    {session.unassigned_count > 0 && (
                      <span className="text-warning-600">
                        {' '}
                        · {session.unassigned_count} {t('unassigned')}
                      </span>
                    )}
                  </p>
                </div>
                {session.status === 'planning' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={t('deleteSession')}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteSession(session.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
                <ChevronRight className="h-5 w-5 text-text-tertiary rtl:rotate-180" />
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateSessionModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        periods={periods}
        onSubmit={handleCreateSession}
      />
    </div>
  );
}
