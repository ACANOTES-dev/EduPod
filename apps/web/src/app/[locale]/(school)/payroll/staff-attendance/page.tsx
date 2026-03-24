'use client';

import { Button } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'unpaid_leave' | 'paid_leave' | 'sick_leave';

interface StaffAttendanceRecord {
  staff_profile_id: string;
  staff_name: string;
  staff_number: string;
  department?: string;
  status: AttendanceStatus | null;
  notes?: string;
}

interface DaySummary {
  total: number;
  present: number;
  absent: number;
  onLeave: number;
}

const STATUS_OPTIONS: AttendanceStatus[] = [
  'present',
  'absent',
  'half_day',
  'paid_leave',
  'sick_leave',
  'unpaid_leave',
];

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-success-100 text-success-text border-success-200',
  absent: 'bg-danger-100 text-danger-text border-danger-200',
  half_day: 'bg-warning-100 text-warning-text border-warning-200',
  paid_leave: 'bg-info-100 text-info-text border-info-200',
  sick_leave: 'bg-purple-100 text-purple-700 border-purple-200',
  unpaid_leave: 'bg-neutral-100 text-text-secondary border-border',
};

const HEATMAP_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-success-500',
  absent: 'bg-danger-500',
  half_day: 'bg-warning-400',
  paid_leave: 'bg-info-400',
  sick_leave: 'bg-purple-400',
  unpaid_leave: 'bg-neutral-300',
};

function todayISO(): string {
  return new Date().toISOString().split('T')[0]!;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export default function StaffAttendancePage() {
  const t = useTranslations('payroll');

  const [selectedDate, setSelectedDate] = React.useState<string>(todayISO());
  const [view, setView] = React.useState<'daily' | 'monthly'>('daily');
  const [staff, setStaff] = React.useState<StaffAttendanceRecord[]>([]);
  const [monthlyData, setMonthlyData] = React.useState<
    Record<string, Record<string, AttendanceStatus>>
  >({});
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [pendingChanges, setPendingChanges] = React.useState<
    Record<string, AttendanceStatus>
  >({});

  const dateObj = React.useMemo(() => new Date(selectedDate + 'T00:00:00'), [selectedDate]);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth();
  const daysInMonth = getDaysInMonth(year, month);

  const fetchDaily = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: StaffAttendanceRecord[] }>(
        `/api/v1/payroll/staff-attendance?date=${selectedDate}`,
      );
      setStaff(res.data);
      setPendingChanges({});
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate]);

  const fetchMonthly = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{
        data: Record<string, Record<string, AttendanceStatus>>;
      }>(`/api/v1/payroll/staff-attendance/monthly?year=${year}&month=${month + 1}`);
      setMonthlyData(res.data);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  React.useEffect(() => {
    if (view === 'daily') {
      void fetchDaily();
    } else {
      void fetchMonthly();
    }
  }, [view, fetchDaily, fetchMonthly]);

  const handleStatusChange = (staffProfileId: string, status: AttendanceStatus) => {
    setPendingChanges((prev) => ({ ...prev, [staffProfileId]: status }));
    setStaff((prev) =>
      prev.map((s) =>
        s.staff_profile_id === staffProfileId ? { ...s, status } : s,
      ),
    );
  };

  const handleMarkAllPresent = () => {
    const changes: Record<string, AttendanceStatus> = {};
    staff.forEach((s) => {
      changes[s.staff_profile_id] = 'present';
    });
    setPendingChanges(changes);
    setStaff((prev) => prev.map((s) => ({ ...s, status: 'present' })));
  };

  const handleSave = async () => {
    if (Object.keys(pendingChanges).length === 0) return;
    setIsSaving(true);
    try {
      await apiClient('/api/v1/payroll/staff-attendance/bulk', {
        method: 'POST',
        body: JSON.stringify({
          date: selectedDate,
          records: Object.entries(pendingChanges).map(([staff_profile_id, status]) => ({
            staff_profile_id,
            status,
          })),
        }),
      });
      setPendingChanges({});
    } catch {
      // silent
    } finally {
      setIsSaving(false);
    }
  };

  const summary: DaySummary = React.useMemo(() => {
    const present = staff.filter((s) => s.status === 'present' || s.status === 'half_day').length;
    const absent = staff.filter((s) => s.status === 'absent').length;
    const onLeave = staff.filter((s) =>
      ['paid_leave', 'sick_leave', 'unpaid_leave'].includes(s.status ?? ''),
    ).length;
    return { total: staff.length, present, absent, onLeave };
  }, [staff]);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('staffAttendance')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {view === 'daily' && (
              <>
                <Button variant="outline" onClick={handleMarkAllPresent}>
                  {t('markAllPresent')}
                </Button>
                <Button onClick={handleSave} disabled={!hasPendingChanges || isSaving}>
                  {isSaving ? t('saving') : t('saveAttendance')}
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-lg border border-border bg-surface-secondary p-0.5">
          {(['daily', 'monthly'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === v
                  ? 'bg-surface text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t(v === 'daily' ? 'dailyView' : 'monthlyView')}
            </button>
          ))}
        </div>

        {/* Date picker */}
        <input
          type={view === 'daily' ? 'date' : 'month'}
          value={view === 'daily' ? selectedDate : `${year}-${String(month + 1).padStart(2, '0')}`}
          onChange={(e) => {
            if (view === 'daily') {
              setSelectedDate(e.target.value);
            } else {
              const [y, m] = e.target.value.split('-');
              if (y && m) {
                setSelectedDate(`${y}-${m}-01`);
              }
            }
          }}
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Summary cards */}
      {view === 'daily' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: t('totalStaff'), value: summary.total, color: 'text-text-primary' },
            { label: t('attendancePresent'), value: summary.present, color: 'text-success-600' },
            { label: t('attendanceAbsent'), value: summary.absent, color: 'text-danger-600' },
            { label: t('onLeave'), value: summary.onLeave, color: 'text-info-600' },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-xs text-text-secondary">{card.label}</p>
              <p className={`mt-1 text-2xl font-semibold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : view === 'daily' ? (
        /* Daily list */
        <div className="space-y-2">
          {staff.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface py-12 text-center text-sm text-text-tertiary">
              {t('noData')}
            </div>
          ) : (
            staff.map((member) => (
              <div
                key={member.staff_profile_id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">{member.staff_name}</p>
                  <p className="text-xs text-text-secondary">
                    {member.staff_number}
                    {member.department ? ` · ${member.department}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      onClick={() => handleStatusChange(member.staff_profile_id, status)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                        member.status === status
                          ? STATUS_COLORS[status]
                          : 'border-border bg-surface-secondary text-text-secondary hover:bg-surface hover:text-text-primary'
                      }`}
                    >
                      {t(`status_${status}` as Parameters<typeof t>[0])}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Monthly heatmap */
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="w-36 py-2 text-start text-xs font-medium text-text-secondary">
                  {t('staffName')}
                </th>
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                  <th key={d} className="w-7 py-2 text-center font-medium text-text-secondary">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {Object.entries(monthlyData).map(([staffId, days]) => {
                const staffMember = staff.find((s) => s.staff_profile_id === staffId);
                const name = staffMember?.staff_name ?? staffId;
                return (
                  <tr key={staffId}>
                    <td className="py-1.5 pe-3 text-xs font-medium text-text-primary">{name}</td>
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const dayStr = String(i + 1).padStart(2, '0');
                      const status = days[dayStr] as AttendanceStatus | undefined;
                      return (
                        <td key={dayStr} className="px-0.5 py-1.5">
                          <div
                            className={`mx-auto h-5 w-5 rounded-sm ${
                              status ? HEATMAP_COLORS[status] : 'bg-surface-secondary'
                            }`}
                            title={status ? t(`status_${status}` as Parameters<typeof t>[0]) : t('noRecord')}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {Object.keys(monthlyData).length === 0 && (
                <tr>
                  <td
                    colSpan={daysInMonth + 1}
                    className="py-12 text-center text-sm text-text-tertiary"
                  >
                    {t('noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {view === 'monthly' && (
        <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
          {STATUS_OPTIONS.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`inline-block h-3 w-3 rounded-sm ${HEATMAP_COLORS[s]}`} />
              {t(`status_${s}` as Parameters<typeof t>[0])}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-sm bg-surface-secondary border border-border" />
            {t('noRecord')}
          </span>
        </div>
      )}
    </div>
  );
}
