'use client';

import { CheckCircle2, ChevronDown, ChevronUp, Phone, Users } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

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
  const [expandedContactsId, setExpandedContactsId] = React.useState<string | null>(null);

  const toggleContacts = React.useCallback((studentId: string) => {
    setExpandedContactsId((current) => (current === studentId ? null : studentId));
  }, []);

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

          const emergencyContacts = participant.student.household?.emergency_contacts ?? [];
          const isExpanded = expandedContactsId === participant.student_id;

          return (
            <article
              key={participant.id}
              className="rounded-3xl border border-border bg-surface shadow-sm"
            >
              <div className="p-5">
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
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={
                      isExpanded
                        ? t('tripAttendance.hideEmergencyContacts', { student: studentName })
                        : t('tripAttendance.showEmergencyContacts', { student: studentName })
                    }
                    onClick={() => toggleContacts(participant.student_id)}
                    className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-xl border border-border bg-surface-secondary px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-slate-400 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">
                      {t('tripAttendance.emergencyContacts')}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <AttendanceToggle
                  disabled={busyStudentId === participant.student_id}
                  studentName={studentName}
                  value={currentValue}
                  onChange={(present) => void markAttendance(participant.student_id, present)}
                />
              </div>

              {isExpanded && (
                <div className="border-t border-border bg-slate-950 px-5 py-4 text-white">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-slate-300">
                    {t('tripAttendance.emergencyContacts')}
                  </p>
                  {emergencyContacts.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      {t('tripAttendance.noEmergencyContacts')}
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {emergencyContacts.map((contact) => (
                        <li key={contact.id} className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">
                              {contact.contact_name}
                            </p>
                            <p className="text-xs text-slate-400">{contact.relationship_label}</p>
                          </div>
                          <a
                            href={`tel:${contact.phone}`}
                            aria-label={t('tripAttendance.callContact', {
                              name: contact.contact_name,
                            })}
                            className="flex min-h-[44px] min-w-[44px] shrink-0 items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
                          >
                            <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span className="ltr:block rtl:block">{contact.phone}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
