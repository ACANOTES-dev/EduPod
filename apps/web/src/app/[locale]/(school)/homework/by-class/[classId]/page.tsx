'use client';

import { BookOpen, Calendar, Copy, Eye, List } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { HomeworkTypeBadge } from '../../_components/homework-type-badge';
import { HomeworkWeekView } from '../../_components/homework-week-view';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeworkItem {
  id: string;
  title: string;
  homework_type: string;
  due_date: string;
  status: string;
  subject?: { id: string; name: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().slice(0, 10);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassHomeworkPage() {
  const t = useTranslations('homework');
  const params = useParams<{ classId: string }>();
  const classId = params?.classId ?? '';
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [viewMode, setViewMode] = React.useState<'list' | 'week'>('list');
  const [data, setData] = React.useState<HomeworkItem[]>([]);
  const [weekData, setWeekData] = React.useState<HomeworkItem[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [className, setClassName] = React.useState('');
  const [weekStart, setWeekStart] = React.useState(getMonday);

  React.useEffect(() => {
    apiClient<{ data: { id: string; name: string } }>(`/api/v1/classes/${classId}`, {
      silent: true,
    })
      .then((res) => setClassName(res.data?.name ?? ''))
      .catch(() => undefined);
  }, [classId]);

  const fetchList = React.useCallback(
    async (p: number, status: string, type: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (status !== 'all') params.set('status', status);
        if (type !== 'all') params.set('homework_type', type);
        const res = await apiClient<{ data: HomeworkItem[]; meta: { total: number } }>(
          `/api/v1/homework/by-class/${classId}?${params}`,
        );
        setData(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch {
        setData([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [classId],
  );

  const fetchWeek = React.useCallback(
    async (ws: string) => {
      try {
        const res = await apiClient<{ data: HomeworkItem[] }>(
          `/api/v1/homework/by-class/${classId}/week?week_start=${ws}`,
          { silent: true },
        );
        setWeekData(res.data ?? []);
      } catch {
        setWeekData([]);
      }
    },
    [classId],
  );

  React.useEffect(() => {
    if (viewMode === 'list') void fetchList(page, statusFilter, typeFilter);
    else void fetchWeek(weekStart);
  }, [viewMode, page, statusFilter, typeFilter, weekStart, fetchList, fetchWeek]);

  const columns = [
    {
      key: 'title',
      header: t('title'),
      render: (row: HomeworkItem) => (
        <span className="font-medium text-text-primary">{row.title}</span>
      ),
    },
    {
      key: 'type',
      header: t('type'),
      render: (row: HomeworkItem) => <HomeworkTypeBadge type={row.homework_type} />,
      className: 'hidden sm:table-cell',
    },
    {
      key: 'due_date',
      header: t('dueDate'),
      render: (row: HomeworkItem) => (
        <span className="text-xs font-mono text-text-secondary">{formatDate(row.due_date)}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: HomeworkItem) => (
        <StatusBadge
          status={
            row.status === 'published' ? 'success' : row.status === 'draft' ? 'warning' : 'neutral'
          }
        >
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: HomeworkItem) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              router.push(`/${locale}/homework/${row.id}`);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              router.push(`/${locale}/homework/${row.id}`);
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
        <Button
          variant={viewMode === 'list' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('list')}
        >
          <List className="me-1 h-4 w-4" />
          {t('listView')}
        </Button>
        <Button
          variant={viewMode === 'week' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setViewMode('week')}
        >
          <Calendar className="me-1 h-4 w-4" />
          {t('weekView')}
        </Button>
      </div>
      {viewMode === 'list' && (
        <>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder={t('status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filterAll')}</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={typeFilter}
            onValueChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder={t('type')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filterAll')}</SelectItem>
              <SelectItem value="written">Written</SelectItem>
              <SelectItem value="reading">Reading</SelectItem>
              <SelectItem value="research">Research</SelectItem>
              <SelectItem value="revision">Revision</SelectItem>
              <SelectItem value="project_work">Project</SelectItem>
              <SelectItem value="online_activity">Online</SelectItem>
            </SelectContent>
          </Select>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={`${t('classHomework')}: ${className}`} />
      {viewMode === 'list' ? (
        <DataTable
          columns={columns}
          data={data}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/homework/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={loading}
        />
      ) : (
        <div>
          {toolbar}
          <div className="mt-4">
            <HomeworkWeekView
              weekStart={weekStart}
              homework={weekData}
              onHomeworkClick={(hid) => router.push(`/${locale}/homework/${hid}`)}
              onWeekChange={setWeekStart}
            />
          </div>
          {!loading && weekData.length === 0 && (
            <EmptyState
              icon={BookOpen}
              title={t('noHomeworkForClass')}
              description={t('noHomeworkForClassDesc')}
            />
          )}
        </div>
      )}
    </div>
  );
}
