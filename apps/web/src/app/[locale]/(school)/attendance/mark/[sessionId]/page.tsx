'use client';

import { ArrowLeft, CheckCircle, Keyboard, Search } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  RadioGroup,
  RadioGroupItem,
  Label,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from '@school/ui';

import { AttendanceStatusBadge } from '@/components/attendance-status-badge';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionDetail {
  id: string;
  date: string;
  status: string;
  class: { id: string; name: string };
  schedule: { start_time: string; end_time: string } | null;
  subject: { id: string; name: string } | null;
}

interface StudentRecord {
  id: string;
  student_id: string;
  student_name: string;
  status: string;
  reason: string;
  arrival_time: string | null;
}

/** Shape returned by GET /api/v1/attendance-sessions/:id (wrapped in { data: ... } by interceptor) */
interface ApiSession {
  id: string;
  session_date: string;
  status: string;
  class_entity: { id: string; name: string } | null;
  schedule: { id: string; weekday: number; start_time: string; end_time: string } | null;
  subject: { id: string; name: string } | null;
  records: Array<{
    id: string;
    student: { id: string; first_name: string; last_name: string };
    status: string;
    reason: string | null;
    arrival_time: string | null;
  }>;
  enrolled_students: Array<{ id: string; first_name: string; last_name: string }>;
}

// ─── SEN Profile Types ───────────────────────────────────────────────────────

interface SenProfileSummary {
  student_id: string;
  primary_category: string;
  support_level: string;
}

interface SenProfileApiItem {
  student: { id: string };
  primary_category: string;
  support_level: string;
  is_active: boolean;
}

const SEN_CATEGORY_LABELS: Record<string, string> = {
  learning: 'Learning',
  emotional_behavioural: 'Emotional / Behavioural',
  physical: 'Physical',
  sensory: 'Sensory',
  asd: 'ASD',
  speech_language: 'Speech & Language',
  multiple: 'Multiple',
  other: 'Other',
};

const SEN_SUPPORT_LEVEL_LABELS: Record<string, string> = {
  school_support: 'School Support',
  school_support_plus: 'School Support Plus',
};

const ATTENDANCE_STATUSES = [
  { value: 'present', labelKey: 'present', shortcut: 'P' },
  { value: 'absent_unexcused', labelKey: 'absentUnexcused', shortcut: 'A' },
  { value: 'absent_excused', labelKey: 'absentExcused', shortcut: 'E' },
  { value: 'late', labelKey: 'late', shortcut: 'L' },
  { value: 'left_early', labelKey: 'leftEarly', shortcut: 'X' },
] as const;

/** Map uppercase shortcut letters to their status value. */
const SHORTCUT_MAP: Record<string, string> = Object.fromEntries(
  ATTENDANCE_STATUSES.map((s) => [s.shortcut, s.value]),
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MarkAttendancePage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? '';
  const t = useTranslations('attendance');
  const tc = useTranslations('common');
  const router = useRouter();

  const [session, setSession] = React.useState<SessionDetail | null>(null);
  const [records, setRecords] = React.useState<StudentRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [senMap, setSenMap] = React.useState<Map<string, SenProfileSummary>>(new Map());
  const [search, setSearch] = React.useState('');
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const rowRefs = React.useRef<Array<HTMLDivElement | null>>([]);

  React.useEffect(() => {
    if (!sessionId) return;
    apiClient<{ data: ApiSession }>(`/api/v1/attendance-sessions/${sessionId}`)
      .then((res) => {
        const s = res.data;
        // Map API shape to frontend SessionDetail
        setSession({
          id: s.id,
          date: s.session_date,
          status: s.status,
          class: s.class_entity ?? { id: '', name: '—' },
          schedule: s.schedule
            ? { start_time: s.schedule.start_time, end_time: s.schedule.end_time }
            : null,
          subject: s.subject ?? null,
        });

        // Build student records: merge existing records + enrolled students without records
        const existingMap = new Map(
          (s.records ?? []).map((r) => [
            r.student.id,
            {
              id: r.id,
              student_id: r.student.id,
              student_name: `${r.student.first_name} ${r.student.last_name}`,
              status: r.status,
              reason: r.reason ?? '',
              arrival_time: r.arrival_time ?? null,
            },
          ]),
        );

        // Add enrolled students who don't have a record yet (default to present)
        for (const student of s.enrolled_students ?? []) {
          if (!existingMap.has(student.id)) {
            existingMap.set(student.id, {
              id: '',
              student_id: student.id,
              student_name: `${student.first_name} ${student.last_name}`,
              status: 'present',
              reason: '',
              arrival_time: null,
            });
          }
        }

        setRecords(Array.from(existingMap.values()));
      })
      .catch((err) => {
        console.error('[AttendanceMarkPage]', err);
        return setError('Failed to load session');
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  // ─── Fetch active SEN profiles (silent — no error if user lacks SEN permission) ──
  React.useEffect(() => {
    if (!sessionId) return;
    apiClient<{ data: SenProfileApiItem[] }>('/api/v1/sen/profiles?is_active=true&pageSize=100', {
      silent: true,
    })
      .then((res) => {
        const map = new Map<string, SenProfileSummary>();
        for (const profile of res.data ?? []) {
          map.set(profile.student.id, {
            student_id: profile.student.id,
            primary_category: profile.primary_category,
            support_level: profile.support_level,
          });
        }
        setSenMap(map);
      })
      .catch((err) => {
        console.error('[MarkAttendancePage] Failed to fetch SEN profiles', err);
      });
  }, [sessionId]);

  const updateRecordStatus = (studentId: string, status: string) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.student_id !== studentId) return r;
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return {
          ...r,
          status,
          arrival_time: status === 'late' ? `${hh}:${mm}` : null,
        };
      }),
    );
  };

  const updateRecordReason = (studentId: string, reason: string) => {
    setRecords((prev) => prev.map((r) => (r.student_id === studentId ? { ...r, reason } : r)));
  };

  const updateRecordArrivalTime = (studentId: string, arrivalTime: string | null) => {
    setRecords((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, arrival_time: arrivalTime } : r)),
    );
  };

  const markAllPresent = () => {
    setRecords((prev) =>
      prev.map((r) => ({ ...r, status: 'present', reason: '', arrival_time: null })),
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient(`/api/v1/attendance-sessions/${sessionId}/records`, {
        method: 'PUT',
        body: JSON.stringify({
          records: records.map((r) => ({
            student_id: r.student_id,
            status: r.status,
            reason: r.reason || null,
            arrival_time: r.status === 'late' ? r.arrival_time || null : null,
          })),
        }),
      });
      toast.success('Attendance saved');
    } catch (err) {
      console.error('[AttendanceMarkPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await apiClient(`/api/v1/attendance-sessions/${sessionId}/records`, {
        method: 'PUT',
        body: JSON.stringify({
          records: records.map((r) => ({
            student_id: r.student_id,
            status: r.status,
            reason: r.reason || null,
            arrival_time: r.status === 'late' ? r.arrival_time || null : null,
          })),
        }),
      });
      await apiClient(`/api/v1/attendance-sessions/${sessionId}/submit`, {
        method: 'PATCH',
      });
      toast.success(t('submitted'));
      router.back();
    } catch (err) {
      console.error('[AttendanceMarkPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Filter + keyboard shortcuts ────────────────────────────────────────
  const filteredRecords = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => r.student_name.toLowerCase().includes(q));
  }, [records, search]);

  const isEditable = session?.status === 'open';

  // Keep focus index within bounds when filter or row count changes.
  React.useEffect(() => {
    if (focusedIndex >= filteredRecords.length) {
      setFocusedIndex(Math.max(0, filteredRecords.length - 1));
    }
  }, [filteredRecords.length, focusedIndex]);

  React.useEffect(() => {
    if (!isEditable) return;

    const handler = (e: KeyboardEvent) => {
      // Ignore if typing in an input / textarea / contenteditable — we don't
      // want P/A/L to hijack a teacher typing a reason.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      // '?' opens help. Shift+/ on most layouts produces '?'.
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      if (filteredRecords.length === 0) return;

      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        setFocusedIndex((i) => Math.min(filteredRecords.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        setFocusedIndex((i) => Math.max(0, i - 1));
        return;
      }

      const key = e.key.toUpperCase();
      const status = SHORTCUT_MAP[key];
      if (status) {
        const record = filteredRecords[focusedIndex];
        if (!record) return;
        e.preventDefault();
        updateRecordStatus(record.student_id, status);
        // Advance to next row so marking a whole class is a flow.
        setFocusedIndex((i) => Math.min(filteredRecords.length - 1, i + 1));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [filteredRecords, focusedIndex, isEditable]);

  // Scroll the focused row into view when it changes (smooth, nearest).
  React.useEffect(() => {
    const el = rowRefs.current[focusedIndex];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [focusedIndex]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
        ))}
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{error || 'Session not found'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              {session.schedule ? t('markAttendance') : t('dailyRegister')}
            </h1>
            <p className="text-sm text-text-secondary">
              {session.class.name}
              {session.subject ? ` · ${session.subject.name}` : ''} — {formatDate(session.date)}
              {session.schedule
                ? ` · ${session.schedule.start_time}–${session.schedule.end_time}`
                : ''}
            </p>
          </div>
          <AttendanceStatusBadge status={session.status} type="session" />
        </div>
        {isEditable && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHelpOpen(true)}
              aria-label={t('shortcuts')}
              title={t('shortcuts')}
            >
              <Keyboard className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={markAllPresent}>
              <CheckCircle className="me-2 h-4 w-4" />
              {t('markAllPresent')}
            </Button>
          </div>
        )}
      </div>

      {/* Search */}
      {isEditable && (
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFocusedIndex(0);
            }}
            placeholder={t('searchStudents')}
            className="ps-9"
            aria-label={t('searchStudents')}
          />
          {search && (
            <p className="mt-1 text-xs text-text-tertiary">
              {filteredRecords.length} / {records.length}
            </p>
          )}
        </div>
      )}

      {/* Student list */}
      <div className="space-y-3">
        {filteredRecords.length === 0 && records.length > 0 && (
          <p className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-text-secondary">
            {t('noStudentsMatch')}
          </p>
        )}
        {filteredRecords.map((record, idx) => (
          <div
            key={record.student_id}
            ref={(el) => {
              rowRefs.current[idx] = el;
            }}
            onClick={() => setFocusedIndex(idx)}
            className={`rounded-xl border bg-surface p-4 shadow-sm transition-colors ${
              isEditable && idx === focusedIndex
                ? 'border-primary-500 ring-2 ring-primary-500/20'
                : 'border-border'
            }`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-secondary text-sm font-medium text-text-primary">
                  {record.student_name.charAt(0)}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary">{record.student_name}</p>
                  {senMap.has(record.student_id) && (
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="info"
                            className="cursor-default px-1.5 py-0.5 text-[10px]"
                          >
                            {t('sen')}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {SEN_CATEGORY_LABELS[senMap.get(record.student_id)!.primary_category] ??
                              senMap.get(record.student_id)!.primary_category}
                            {' — '}
                            {SEN_SUPPORT_LEVEL_LABELS[
                              senMap.get(record.student_id)!.support_level
                            ] ?? senMap.get(record.student_id)!.support_level}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>

              {isEditable ? (
                <div className="flex flex-wrap items-center gap-3">
                  <RadioGroup
                    value={record.status}
                    onValueChange={(v) => updateRecordStatus(record.student_id, v)}
                    className="flex flex-wrap gap-3"
                  >
                    {ATTENDANCE_STATUSES.map((s) => (
                      <div key={s.value} className="flex items-center gap-1.5">
                        <RadioGroupItem value={s.value} id={`${record.student_id}-${s.value}`} />
                        <Label
                          htmlFor={`${record.student_id}-${s.value}`}
                          className="flex cursor-pointer items-center gap-1 text-xs"
                        >
                          <span>{t(s.labelKey)}</span>
                          <kbd className="rounded border border-border bg-surface-secondary px-1 font-mono text-[10px] text-text-tertiary">
                            {s.shortcut}
                          </kbd>
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {record.status === 'late' && (
                    <Input
                      type="time"
                      value={record.arrival_time ?? ''}
                      onChange={(e) =>
                        updateRecordArrivalTime(record.student_id, e.target.value || null)
                      }
                      className="w-28"
                      aria-label={t('arrivalTime')}
                    />
                  )}
                </div>
              ) : (
                <AttendanceStatusBadge status={record.status} type="record" />
              )}
            </div>

            {record.status !== 'present' && isEditable && (
              <div className="mt-3 ps-12">
                <Textarea
                  value={record.reason}
                  onChange={(e) => updateRecordReason(record.student_id, e.target.value)}
                  placeholder={t('reason')}
                  rows={1}
                  className="text-sm"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Actions */}
      {isEditable && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface py-4">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? tc('loading') : t('save')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? tc('loading') : t('submit')}
          </Button>
        </div>
      )}

      {/* Keyboard shortcuts help */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('shortcutsTitle')}</DialogTitle>
            <DialogDescription>{t('shortcutsDescription')}</DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            {ATTENDANCE_STATUSES.map((s) => (
              <div key={s.value} className="flex items-center justify-between gap-4">
                <dt className="text-text-secondary">{t(s.labelKey)}</dt>
                <dd>
                  <kbd className="rounded border border-border bg-surface-secondary px-2 py-0.5 font-mono text-xs">
                    {s.shortcut}
                  </kbd>
                </dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 pt-2">
              <dt className="text-text-secondary">{t('shortcutNextRow')}</dt>
              <dd className="flex gap-1">
                <kbd className="rounded border border-border bg-surface-secondary px-2 py-0.5 font-mono text-xs">
                  ↓
                </kbd>
                <kbd className="rounded border border-border bg-surface-secondary px-2 py-0.5 font-mono text-xs">
                  J
                </kbd>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-text-secondary">{t('shortcutPrevRow')}</dt>
              <dd className="flex gap-1">
                <kbd className="rounded border border-border bg-surface-secondary px-2 py-0.5 font-mono text-xs">
                  ↑
                </kbd>
                <kbd className="rounded border border-border bg-surface-secondary px-2 py-0.5 font-mono text-xs">
                  K
                </kbd>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-text-secondary">{t('shortcutsToggleHelp')}</dt>
              <dd>
                <kbd className="rounded border border-border bg-surface-secondary px-2 py-0.5 font-mono text-xs">
                  ?
                </kbd>
              </dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </div>
  );
}
