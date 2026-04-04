'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { QuickLogFab } from '@/components/behaviour/quick-log-fab';
import { QuickLogSheet } from '@/components/behaviour/quick-log-sheet';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentBehaviourRow {
  student_id: string;
  first_name: string;
  last_name: string;
  year_group_name: string | null;
  total_points: number;
  positive_count: number;
  negative_count: number;
  last_incident_date: string | null;
}

interface StudentsResponse {
  data: StudentBehaviourRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourStudentsPage() {
  const t = useTranslations('behaviour.students');
  const pathname = usePathname();
  const router = useRouter();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<StudentBehaviourRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [quickLogOpen, setQuickLogOpen] = React.useState(false);

  const searchTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStudents = React.useCallback(
    async (p: number, q: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (q.trim()) params.set('search', q.trim());
        const res = await apiClient<StudentsResponse>(`/api/v1/behaviour/students?${params.toString()}`);
        setData(res.data ?? []);
        setTotal(res.meta?.total ?? 0);
      } catch (err) {
        console.error('[BehaviourStudentsPage]', err);
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      void fetchStudents(page, search);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [page, search, fetchStudents]);

  const columns = [
    {
      key: 'name',
      header: t('columns.studentName'),
      render: (row: StudentBehaviourRow) => (
        <span className="font-medium text-text-primary">
          {row.first_name} {row.last_name}
        </span>
      ),
    },
    {
      key: 'year_group',
      header: t('columns.yearGroup'),
      render: (row: StudentBehaviourRow) => (
        <span className="text-text-secondary">{row.year_group_name ?? '—'}</span>
      ),
    },
    {
      key: 'total_points',
      header: t('columns.points'),
      render: (row: StudentBehaviourRow) => (
        <span className={`font-semibold ${
          row.total_points > 0 ? 'text-green-600' : row.total_points < 0 ? 'text-red-600' : 'text-text-primary'
        }`}>
          {row.total_points > 0 ? '+' : ''}{row.total_points}
        </span>
      ),
    },
    {
      key: 'positive',
      header: t('columns.positive'),
      render: (row: StudentBehaviourRow) => (
        <span className="text-green-600">{row.positive_count}</span>
      ),
    },
    {
      key: 'negative',
      header: t('columns.negative'),
      render: (row: StudentBehaviourRow) => (
        <span className="text-red-600">{row.negative_count}</span>
      ),
    },
    {
      key: 'last_incident',
      header: t('columns.lastIncident'),
      render: (row: StudentBehaviourRow) => (
        <span className="text-xs text-text-tertiary">
          {row.last_incident_date ? formatDate(row.last_incident_date) : '—'}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder={t('search')}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-base text-text-primary sm:w-56"
        aria-label={t('search')}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
      />

      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        onRowClick={(row) => router.push(`/${locale}/behaviour/students/${row.student_id}`)}
        keyExtractor={(row) => row.student_id}
        isLoading={isLoading}
      />

      <QuickLogFab onClick={() => setQuickLogOpen(true)} />
      <QuickLogSheet open={quickLogOpen} onOpenChange={setQuickLogOpen} />
    </div>
  );
}
