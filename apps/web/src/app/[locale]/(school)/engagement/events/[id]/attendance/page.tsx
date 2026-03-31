'use client';

import { Button, toast } from '@school/ui';
import { CheckCircle2, Users } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { AttendanceToggle } from '../../../_components/attendance-toggle';
import {
  type EventAttendanceResponse,
  type EventRecord,
  pickLocalizedValue,
} from '../../../_components/engagement-types';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

export default function EngagementEventAttendancePage() {
  const params = useParams<{ id: string }>();
  const eventId = params?.id ?? '';
  const locale = useLocale();
  const t = useTranslations('engagement');
  const [event, setEvent] = React.useState<EventRecord | null>(null);
  const [attendance, setAttendance] = React.useState<EventAttendanceResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [busyStudentId, setBusyStudentId] = React.useState<string | null>(null);
  const [isConfirming, setIsConfirming] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const [eventResponse, attendanceResponse] = await Promise.all([
        apiClient<EventRecord>(`/api/v1/engagement/events/${eventId}`),
        apiClient<EventAttendanceResponse>(`/api/v1/engagement/events/${eventId}/attendance`),
      ]);

      setEvent(eventResponse);
      setAttendance(attendanceResponse);
    } catch (error) {
      console.error('[EngagementEventAttendancePage.loadData]', error);
      toast.error(t('tripAttendance.loadError'));
    } finally {
      setIsLoading(false);
    }
  }, [eventId, t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  async function markAttendance(studentId: string, present: boolean) {
    setBusyStudentId(studentId);

    try {
      await apiClient(`/api/v1/engagement/events/${eventId}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          present,
        }),
      });

      setAttendance((current) => {
        if (!current) {
          return current;
        }

        const updatedRows = current.data.map((row) =>
          row.student_id === studentId
            ? {
                ...row,
                attendance_marked: present,
                attendance_marked_at: new Date().toISOString(),
              }
            : row,
        );

        const markedPresent = updatedRows.filter((row) => row.attendance_marked === true).length;
        const markedAbsent = updatedRows.filter(
          (row) => row.attendance_marked === false && row.attendance_marked_at !== null,
        ).length;

        return {
          data: updatedRows,
          summary: {
            total: updatedRows.length,
            marked_present: markedPresent,
            marked_absent: markedAbsent,
            unmarked: updatedRows.length - markedPresent - markedAbsent,
          },
        };
      });
    } catch (error) {
      console.error('[EngagementEventAttendancePage.markAttendance]', error);
      toast.error(t('tripAttendance.markError'));
    } finally {
      setBusyStudentId(null);
    }
  }

  async function confirmHeadcount() {
    if (!attendance) {
      return;
    }

    setIsConfirming(true);

    try {
      await apiClient(`/api/v1/engagement/events/${eventId}/headcount`, {
        method: 'POST',
        body: JSON.stringify({
          count_present: attendance.summary.marked_present,
        }),
      });
      toast.success(t('tripAttendance.confirmSuccess'));
      await loadData();
    } catch (error) {
      console.error('[EngagementEventAttendancePage.confirmHeadcount]', error);
      toast.error(t('tripAttendance.confirmError'));
    } finally {
      setIsConfirming(false);
    }
  }

  if (isLoading || !event || !attendance) {
    return <div className="h-72 animate-pulse rounded-3xl bg-surface-secondary" />;
  }

  const headcountValue = `${attendance.summary.marked_present}/${attendance.summary.total}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={pickLocalizedValue(locale, event.title, event.title_ar)}
        description={t('tripAttendance.description')}
        actions={
          <Button onClick={() => void confirmHeadcount()} disabled={isConfirming}>
            <CheckCircle2 className="me-2 h-4 w-4" />
            {isConfirming ? t('tripAttendance.confirming') : t('tripAttendance.confirmHeadcount')}
          </Button>
        }
      />

      <section className="sticky top-16 z-20 rounded-3xl border-2 border-slate-900 bg-slate-950 px-5 py-4 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-white/10 p-3">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">
                {t('tripAttendance.headcount')}
              </p>
              <p className="text-3xl font-semibold">{headcountValue}</p>
            </div>
          </div>
          <div className="grid gap-1 text-sm text-slate-200">
            <p>{t('tripAttendance.presentCount', { count: attendance.summary.marked_present })}</p>
            <p>{t('tripAttendance.absentCount', { count: attendance.summary.marked_absent })}</p>
            <p>{t('tripAttendance.unmarkedCount', { count: attendance.summary.unmarked })}</p>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        {attendance.data.map((participant) => {
          const studentName =
            participant.student.full_name ??
            `${participant.student.first_name} ${participant.student.last_name}`;
          const currentValue =
            participant.attendance_marked_at === null ? null : participant.attendance_marked;

          return (
            <article
              key={participant.id}
              className="rounded-3xl border border-border bg-surface p-5 shadow-sm"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-text-primary">{studentName}</p>
                  <p className="text-sm text-text-secondary">
                    {currentValue === null
                      ? t('tripAttendance.notMarked')
                      : currentValue
                        ? t('tripAttendance.markedPresent')
                        : t('tripAttendance.markedAbsent')}
                  </p>
                </div>
              </div>
              <AttendanceToggle
                disabled={busyStudentId === participant.student_id}
                studentName={studentName}
                value={currentValue}
                onChange={(present) => void markAttendance(participant.student_id, present)}
              />
            </article>
          );
        })}
      </section>
    </div>
  );
}
