'use client';

import {
  Button,
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
}

interface SessionResponse {
  data: SessionDetail;
  records: StudentRecord[];
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
    apiClient<{ data: SessionResponse }>(`/api/v1/attendance-sessions/${sessionId}`)
      .then((res) => {
        setSession(res.data.data);
        setRecords(res.data.records ?? []);
      })
      .catch(() => setError('Failed to load session'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const updateRecordStatus = (studentId: string, status: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, status } : r)),
    );
  };

  const updateRecordReason = (studentId: string, reason: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, reason } : r)),
    );
  };

  const markAllPresent = () => {
    setRecords((prev) =>
      prev.map((r) => ({ ...r, status: 'present', reason: '' })),
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
