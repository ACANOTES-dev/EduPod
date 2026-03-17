'use client';

import { AlertTriangle, Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import * as React from 'react';

import { AttendanceStatusBadge } from '@/components/attendance-status-badge';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingSession {
  id: string;
  date: string;
  class_name: string;
  teacher_name: string;
}

interface ExcessiveAbsence {
  student_id: string;
  student_name: string;
  class_name: string;
  absence_count: number;
  threshold: number;
}

interface ExceptionsResponse {
  pending_sessions: PendingSession[];
  excessive_absences: ExcessiveAbsence[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExceptionsPage() {
  const t = useTranslations('attendance');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  const [pendingSessions, setPendingSessions] = React.useState<PendingSession[]>([]);
  const [excessiveAbsences, setExcessiveAbsences] = React.useState<ExcessiveAbsence[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<ExceptionsResponse>('/api/v1/attendance/exceptions')
      .then((res) => {
        setPendingSessions(res.pending_sessions ?? []);
        setExcessiveAbsences(res.excessive_absences ?? []);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('exceptions')} />

      {/* Pending Sessions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-text-primary">{t('pendingSessions')}</h2>
          {pendingSessions.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
              {pendingSessions.length}
            </span>
          )}
        </div>

        {pendingSessions.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <p className="text-sm text-text-tertiary">No pending sessions</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendingSessions.map((session) => (
              <div
                key={session.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm hover:bg-surface-secondary transition-colors cursor-pointer"
                onClick={() => router.push(`/${locale}/attendance/mark/${session.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{session.class_name}</p>
                    <p className="text-xs text-text-secondary">{session.teacher_name}</p>
                  </div>
                  <AttendanceStatusBadge status="open" type="session" />
                </div>
                <p className="mt-2 text-xs font-mono text-text-tertiary">{session.date}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Excessive Absences */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-semibold text-text-primary">{t('excessiveAbsences')}</h2>
          {excessiveAbsences.length > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300">
              {excessiveAbsences.length}
            </span>
          )}
        </div>

        {excessiveAbsences.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-8 text-center">
            <p className="text-sm text-text-tertiary">No excessive absences detected</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-surface">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Student
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Class
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Absences
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Threshold
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {excessiveAbsences.map((row) => (
                  <tr
                    key={`${row.student_id}-${row.class_name}`}
                    className="border-b border-border last:border-b-0 hover:bg-surface-secondary transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {row.student_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.class_name}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-red-600">{row.absence_count}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.threshold}</td>
                    <td className="px-4 py-3">
                      <AttendanceStatusBadge status="absent" type="daily" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
