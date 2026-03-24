'use client';

import {
  Button,
  Input,
  RadioGroup,
  RadioGroupItem,
  Label,
  Textarea,
  toast,
} from '@school/ui';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { AttendanceStatusBadge } from '@/components/attendance-status-badge';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionDetail {
  id: string;
  date: string;
  status: string;
  class: { id: string; name: string };
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
  records: Array<{
    id: string;
    student: { id: string; first_name: string; last_name: string };
    status: string;
    reason: string | null;
    arrival_time: string | null;
  }>;
  enrolled_students: Array<{ id: string; first_name: string; last_name: string }>;
}

const ATTENDANCE_STATUSES = [
  { value: 'present', labelKey: 'present' },
  { value: 'absent_unexcused', labelKey: 'absentUnexcused' },
  { value: 'absent_excused', labelKey: 'absentExcused' },
  { value: 'late', labelKey: 'late' },
  { value: 'left_early', labelKey: 'leftEarly' },
] as const;

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
      .catch(() => setError('Failed to load session'))
      .finally(() => setLoading(false));
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
    setRecords((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, reason } : r)),
    );
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
            arrival_time: r.status === 'late' ? (r.arrival_time || null) : null,
          })),
        }),
      });
      toast.success('Attendance saved');
    } catch {
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
            arrival_time: r.status === 'late' ? (r.arrival_time || null) : null,
          })),
        }),
      });
      await apiClient(`/api/v1/attendance-sessions/${sessionId}/submit`, {
        method: 'POST',
      });
      toast.success(t('submitted'));
      router.back();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  };

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

  const isEditable = session.status === 'open';

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
              {t('markAttendance')}
            </h1>
            <p className="text-sm text-text-secondary">
              {session.class.name} — {session.date}
            </p>
          </div>
          <AttendanceStatusBadge status={session.status} type="session" />
        </div>
        {isEditable && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={markAllPresent}>
              <CheckCircle className="me-2 h-4 w-4" />
              {t('markAllPresent')}
            </Button>
          </div>
        )}
      </div>

      {/* Student list */}
      <div className="space-y-3">
        {records.map((record) => (
          <div
            key={record.student_id}
            className="rounded-xl border border-border bg-surface p-4 shadow-sm"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-secondary text-sm font-medium text-text-primary">
                  {record.student_name.charAt(0)}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">{record.student_name}</p>
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
                          className="text-xs cursor-pointer"
                        >
                          {t(s.labelKey)}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                  {record.status === 'late' && (
                    <Input
                      type="time"
                      value={record.arrival_time ?? ''}
                      onChange={(e) => updateRecordArrivalTime(record.student_id, e.target.value || null)}
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
        <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-surface py-4">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving ? tc('loading') : t('save')}
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? tc('loading') : t('submit')}
          </Button>
        </div>
      )}
    </div>
  );
}
