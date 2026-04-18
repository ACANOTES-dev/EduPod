'use client';

import { ClipboardCheck, Plus, Upload, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@school/ui';

import { AttendanceStatusBadge } from '@/components/attendance-status-badge';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import { useAuth } from '@/providers/auth-provider';

const OFFICER_ROLE_KEYS = new Set([
  'school_owner',
  'school_principal',
  'school_vice_principal',
  'admin',
  'attendance_officer',
]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface SessionRow {
  id: string;
  session_date: string;
  status: string;
  class_entity: { id: string; name: string } | null;
  schedule: { id: string; start_time: string; end_time: string } | null;
  subject: { id: string; name: string } | null;
  submitted_by_user_id: string | null;
  _count?: { records: number };
}

interface SessionsResponse {
  data: SessionRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const t = useTranslations('attendance');
  const tCommon = useTranslations('common');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<SessionRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [classes, setClasses] = React.useState<SelectOption[]>([]);
  const [classFilter, setClassFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [defaultPresentEnabled, setDefaultPresentEnabled] = React.useState(false);

  const { user } = useAuth();
  const hasOfficerRole = React.useMemo(() => {
    if (!user?.memberships) return false;
    const roleKeys = user.memberships.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []);
    return roleKeys.some((k) => OFFICER_ROLE_KEYS.has(k));
  }, [user]);

  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data))
      .catch((err) => {
        console.error('[AttendancePage]', err);
      });
    apiClient<{
      data?: { attendance?: { defaultPresentEnabled?: boolean } };
      attendance?: { defaultPresentEnabled?: boolean };
    }>('/api/v1/settings')
      .then((res) => {
        const settings = 'data' in res && res.data ? res.data : res;
        if (settings?.attendance?.defaultPresentEnabled) {
          setDefaultPresentEnabled(true);
        }
      })
      .catch((err) => {
        console.error('[AttendancePage]', err);
      });
  }, []);

  const fetchSessions = React.useCallback(
    async (p: number, cls: string, status: string, from: string, to: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (cls !== 'all') params.set('class_id', cls);
        if (status !== 'all') params.set('status', status);
        if (from) params.set('start_date', from);
        if (to) params.set('end_date', to);
        const res = await apiClient<SessionsResponse>(
          `/api/v1/attendance-sessions?${params.toString()}`,
        );
        setData(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch (err) {
        console.error('[AttendancePage]', err);
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchSessions(page, classFilter, statusFilter, dateFrom, dateTo);
  }, [page, classFilter, statusFilter, dateFrom, dateTo, fetchSessions]);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createClassId, setCreateClassId] = React.useState('');
  const [createDate, setCreateDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [createLoading, setCreateLoading] = React.useState(false);
  const [createError, setCreateError] = React.useState('');
  const [defaultPresent, setDefaultPresent] = React.useState(true);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createClassId) {
      setCreateError(t('selectClassRequired'));
      return;
    }
    if (!createDate) {
      setCreateError(t('selectDateRequired'));
      return;
    }
    setCreateLoading(true);
    setCreateError('');
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/attendance-sessions', {
        method: 'POST',
        body: JSON.stringify({
          class_id: createClassId,
          session_date: createDate,
          default_present: defaultPresentEnabled ? defaultPresent : undefined,
        }),
      });
      setCreateOpen(false);
      router.push(`/${locale}/attendance/mark/${res.data.id}`);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setCreateError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setCreateLoading(false);
    }
  };

  const columns = [
    {
      key: 'session_date',
      header: t('sessionDate'),
      render: (row: SessionRow) => (
        <span className="font-medium font-mono text-text-primary text-xs">
          {formatDate(row.session_date)}
        </span>
      ),
    },
    {
      key: 'class_entity',
      header: 'Class',
      render: (row: SessionRow) => (
        <div className="flex flex-col">
          <span className="font-medium text-text-primary">{row.class_entity?.name ?? '—'}</span>
          {row.schedule && (
            <span className="text-xs text-text-secondary">
              {row.subject?.name ?? '—'}
              {' · '}
              <span className="font-mono">
                {row.schedule.start_time}–{row.schedule.end_time}
              </span>
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: SessionRow) => <AttendanceStatusBadge status={row.status} type="session" />,
    },
    {
      key: 'count',
      header: t('markedCount'),
      render: (row: SessionRow) => (
        <span className="text-text-secondary">{row._count?.records ?? 0}</span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: SessionRow) =>
        row.status === 'open' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/${locale}/attendance/mark/${row.id}`);
            }}
          >
            <ClipboardCheck className="me-1 h-4 w-4" />
            {t('markAttendance')}
          </Button>
        ) : null,
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => {
          setDateFrom(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary sm:w-auto"
        aria-label={t('dateFrom')}
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => {
          setDateTo(e.target.value);
          setPage(1);
        }}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary sm:w-auto"
        aria-label={t('dateTo')}
      />
      <Select
        value={classFilter}
        onValueChange={(v) => {
          setClassFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
          <SelectValue placeholder={t('sessionClass')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allClasses')}</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue placeholder={t('statusLabel')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tCommon('all')}</SelectItem>
          <SelectItem value="open">{t('open')}</SelectItem>
          <SelectItem value="submitted">{t('submitted')}</SelectItem>
          <SelectItem value="locked">{t('locked')}</SelectItem>
          <SelectItem value="cancelled">{t('cancelled')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {hasOfficerRole && (
              <Link href={`/${locale}/attendance/officer`}>
                <Button variant="outline">
                  <UserCheck className="me-2 h-4 w-4" />
                  {t('officerDashboardLink')}
                </Button>
              </Link>
            )}
            <Link href={`/${locale}/attendance/upload`}>
              <Button variant="outline">
                <Upload className="me-2 h-4 w-4" />
                {t('uploadAttendance')}
              </Button>
            </Link>
            <Button
              onClick={() => {
                setCreateOpen(true);
                setCreateError('');
                setCreateClassId('');
              }}
            >
              <Plus className="me-2 h-4 w-4" />
              {t('createSession')}
            </Button>
          </div>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createSession')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSession} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('sessionClass')}</Label>
              <Select value={createClassId} onValueChange={setCreateClassId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectClass')} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('sessionDate')}</Label>
              <Input
                type="date"
                value={createDate}
                onChange={(e) => setCreateDate(e.target.value)}
                required
              />
            </div>
            {defaultPresentEnabled && (
              <div className="flex items-center gap-2 pt-2">
                <Switch
                  id="default-present"
                  checked={defaultPresent}
                  onCheckedChange={setDefaultPresent}
                />
                <Label htmlFor="default-present">{t('defaultPresent')}</Label>
              </div>
            )}
            {createError && <p className="text-sm text-danger-text">{createError}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={createLoading}
              >
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={createLoading}>
                {createLoading ? tc('loading') : t('createSession')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
