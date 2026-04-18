'use client';

import { ArrowLeft, Clock, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { AttendanceStatusBadge } from '@/components/attendance-status-badge';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

// ─── Types ────────────────────────────────────────────────────────────────────

interface YearGroupOption {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
}

interface OfficerRow {
  id: string;
  session_date: string;
  status: string;
  default_present: boolean;
  class: { id: string; name: string; year_group: { id: string; name: string } | null } | null;
  teacher: { id: string; first_name: string; last_name: string } | null;
  schedule: { id: string; start_time: string; end_time: string } | null;
  subject: { id: string; name: string } | null;
  record_count: number;
  enrolled_count: number;
}

interface OfficerResponse {
  data: OfficerRow[];
  meta: { page: number; pageSize: number; total: number; date: string };
}

const OFFICER_ROLES = new Set([
  'school_owner',
  'school_principal',
  'school_vice_principal',
  'admin',
  'attendance_officer',
]);

function todayIsoDate(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfficerDashboardPage() {
  const t = useTranslations('attendance');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { user, isLoading: authLoading } = useAuth();

  const [rows, setRows] = React.useState<OfficerRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sessionDate, setSessionDate] = React.useState(todayIsoDate());
  const [statusFilter, setStatusFilter] = React.useState<string>('open');
  const [yearGroupFilter, setYearGroupFilter] = React.useState<string>('all');
  const [classFilter, setClassFilter] = React.useState<string>('all');
  const [yearGroups, setYearGroups] = React.useState<YearGroupOption[]>([]);
  const [classes, setClasses] = React.useState<ClassOption[]>([]);

  // Role gate — backend enforces `attendance.take_any_class`; this is
  // just a UI affordance so unauthorised users don't see the filters.
  const hasOfficerRole = React.useMemo(() => {
    if (!user?.memberships) return false;
    const roleKeys = user.memberships.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []);
    return roleKeys.some((k) => OFFICER_ROLES.has(k));
  }, [user]);

  // Fetch filter option data once
  React.useEffect(() => {
    apiClient<{ data: YearGroupOption[] }>('/api/v1/year-groups')
      .then((res) => setYearGroups(res.data ?? []))
      .catch((err) => {
        console.error('[OfficerDashboardPage] year-groups', err);
      });
    apiClient<{ data: ClassOption[] }>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data ?? []))
      .catch((err) => {
        console.error('[OfficerDashboardPage] classes', err);
      });
  }, []);

  // Fetch officer dashboard data whenever filters change
  React.useEffect(() => {
    if (authLoading || !hasOfficerRole) return;
    setLoading(true);

    const params = new URLSearchParams({
      session_date: sessionDate,
      pageSize: '100',
    });
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (yearGroupFilter !== 'all') params.set('year_group_id', yearGroupFilter);
    if (classFilter !== 'all') params.set('class_id', classFilter);

    apiClient<OfficerResponse>(`/api/v1/attendance/officer-dashboard?${params.toString()}`)
      .then((res) => setRows(res.data ?? []))
      .catch((err) => {
        console.error('[OfficerDashboardPage] dashboard', err);
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [sessionDate, statusFilter, yearGroupFilter, classFilter, authLoading, hasOfficerRole]);

  if (authLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  if (!hasOfficerRole) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => router.push(`/${locale}/attendance`)}>
          <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
        </Button>
        <p className="text-sm text-danger-text">{t('officerAccessDenied')}</p>
      </div>
    );
  }

  const openCount = rows.filter((r) => r.status === 'open').length;
  const unmarkedCount = rows.filter((r) => r.record_count === 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => router.push(`/${locale}/attendance`)}>
            <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" /> {tc('back')}
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              {t('officerDashboard')}
            </h1>
            <p className="text-sm text-text-secondary">{t('officerDashboardDescription')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3.5 w-3.5" />
            {openCount} {t('openSessions')}
          </Badge>
          {unmarkedCount > 0 && (
            <Badge variant="warning" className="gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              {unmarkedCount} {t('unmarked')}
            </Badge>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="officer-date">{t('date')}</Label>
          <Input
            id="officer-date"
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label>{t('status')}</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc('all')}</SelectItem>
              <SelectItem value="open">{t('open')}</SelectItem>
              <SelectItem value="submitted">{t('submitted')}</SelectItem>
              <SelectItem value="locked">{t('locked')}</SelectItem>
              <SelectItem value="cancelled">{t('cancelled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('yearGroup')}</Label>
          <Select value={yearGroupFilter} onValueChange={setYearGroupFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc('all')}</SelectItem>
              {yearGroups.map((yg) => (
                <SelectItem key={yg.id} value={yg.id}>
                  {yg.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>{t('class')}</Label>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tc('all')}</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-12 text-center">
          <p className="text-sm text-text-secondary">{t('noSessionsForFilters')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-secondary text-xs uppercase text-text-tertiary">
              <tr>
                <th className="px-4 py-3 text-start font-medium">{t('class')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('yearGroup')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('teacher')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('period')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('marked')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('status')}</th>
                <th className="px-4 py-3 text-end font-medium">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border transition-colors hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">
                    <div className="flex flex-col">
                      <span>{r.class?.name ?? '—'}</span>
                      {r.schedule && r.subject && (
                        <span className="text-xs font-normal text-text-secondary">
                          {r.subject.name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {r.class?.year_group?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {r.teacher ? `${r.teacher.first_name} ${r.teacher.last_name}` : t('unassigned')}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {r.schedule
                      ? `${r.schedule.start_time}–${r.schedule.end_time}`
                      : t('dailyRegister')}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {r.record_count} / {r.enrolled_count}
                  </td>
                  <td className="px-4 py-3">
                    <AttendanceStatusBadge status={r.status} type="session" />
                  </td>
                  <td className="px-4 py-3 text-end">
                    <Link href={`/${locale}/attendance/mark/${r.id}`}>
                      <Button size="sm" variant={r.status === 'open' ? 'default' : 'outline'}>
                        {r.status === 'open' ? t('take') : tc('view')}
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
