'use client';

import { ClipboardCheck, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { AttendanceStatusBadge } from '@/components/attendance-status-badge';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface SessionRow {
  id: string;
  date: string;
  status: string;
  class: { id: string; name: string };
  teacher: { id: string; name: string } | null;
  marked_count: number;
  enrolled_count: number;
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
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

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

  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/classes?pageSize=100')
      .then((res) => setClasses(res.data))
      .catch(() => undefined);
  }, []);

  const fetchSessions = React.useCallback(
    async (p: number, cls: string, status: string, from: string, to: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (cls !== 'all') params.set('class_id', cls);
        if (status !== 'all') params.set('status', status);
        if (from) params.set('date_from', from);
        if (to) params.set('date_to', to);
        const res = await apiClient<SessionsResponse>(`/api/v1/attendance-sessions?${params.toString()}`);
        setData(res.data);
        setTotal(res.meta.total);
      } catch {
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

  const handleCreateSession = async () => {
    try {
      const res = await apiClient<{ data: { id: string } }>('/api/v1/attendance-sessions', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      router.push(`/${locale}/attendance/mark/${res.data.id}`);
    } catch {
      router.push(`/${locale}/attendance`);
    }
  };

  const columns = [
    {
      key: 'date',
      header: t('sessionDate'),
      render: (row: SessionRow) => (
        <span className="font-medium font-mono text-text-primary text-xs">{row.date}</span>
      ),
    },
    {
      key: 'class',
      header: 'Class',
      render: (row: SessionRow) => (
        <span className="font-medium text-text-primary">{row.class.name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: SessionRow) => <AttendanceStatusBadge status={row.status} type="session" />,
    },
    {
      key: 'teacher',
      header: 'Teacher',
      render: (row: SessionRow) => (
        <span className="text-text-secondary">{row.teacher?.name ?? '—'}</span>
      ),
    },
    {
      key: 'count',
      header: `${t('markedCount')} / ${t('enrolledCount')}`,
      render: (row: SessionRow) => (
        <span className="text-text-secondary">
          {row.marked_count} / {row.enrolled_count}
        </span>
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
        onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        aria-label="Date from"
      />
      <input
        type="date"
        value={dateTo}
        onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-primary"
        aria-label="Date to"
      />
      <Select value={classFilter} onValueChange={(v) => { setClassFilter(v); setPage(1); }}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Class" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Classes</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
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
          <Button onClick={handleCreateSession}>
            <Plus className="me-2 h-4 w-4" />
            {t('createSession')}
          </Button>
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
    </div>
  );
}
