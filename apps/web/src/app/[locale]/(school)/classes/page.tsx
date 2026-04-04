'use client';

import { Plus } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface YearGroup {
  id: string;
  name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface ClassRow {
  id: string;
  name: string;
  status: string;
  academic_year: AcademicYear;
  year_group: YearGroup;
  subject: Subject | null;
  _count?: { class_enrolments: number };
}

interface ClassesResponse {
  data: ClassRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClassesPage() {
  const t = useTranslations('classes');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<ClassRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);

  const [yearFilter, setYearFilter] = React.useState('all');
  const [groupFilter, setGroupFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');

  React.useEffect(() => {
    Promise.all([
      apiClient<ListResponse<AcademicYear>>('/api/v1/academic-years?pageSize=100'),
      apiClient<ListResponse<YearGroup>>('/api/v1/year-groups?pageSize=100'),
    ])
      .then(([yearsRes, groupsRes]) => {
        setAcademicYears(yearsRes.data);
        setYearGroups(groupsRes.data);
      })
      .catch((err) => { console.error('[ClassesPage]', err); });
  }, []);

  const fetchClasses = React.useCallback(
    async (p: number, year: string, group: string, status: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (year !== 'all') params.set('academic_year_id', year);
        if (group !== 'all') params.set('year_group_id', group);
        if (status !== 'all') params.set('status', status);
        const res = await apiClient<ClassesResponse>(`/api/v1/classes?${params.toString()}`);
        setData(res.data);
        setTotal(res.meta.total);
      } catch (err) {
        console.error('[ClassesPage]', err);
        setData([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    void fetchClasses(page, yearFilter, groupFilter, statusFilter);
  }, [page, yearFilter, groupFilter, statusFilter, fetchClasses]);

  const statusBadge = (status: string) => {
    if (status === 'active')
      return (
        <StatusBadge status="success" dot>
          {t('statusActive')}
        </StatusBadge>
      );
    if (status === 'inactive')
      return (
        <StatusBadge status="warning" dot>
          {t('statusInactive')}
        </StatusBadge>
      );
    return (
      <StatusBadge status="neutral" dot>
        {t('statusArchived')}
      </StatusBadge>
    );
  };

  const columns = [
    {
      key: 'name',
      header: t('colName'),
      render: (row: ClassRow) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    {
      key: 'academic_year',
      header: t('colAcademicYear'),
      render: (row: ClassRow) => (
        <span className="text-text-secondary">{row.academic_year.name}</span>
      ),
    },
    {
      key: 'year_group',
      header: t('colYearGroup'),
      render: (row: ClassRow) => <span className="text-text-secondary">{row.year_group.name}</span>,
    },
    {
      key: 'status',
      header: t('colStatus'),
      render: (row: ClassRow) => statusBadge(row.status),
    },
    {
      key: 'students',
      header: t('colStudents'),
      render: (row: ClassRow) => (
        <span className="text-text-secondary">{row._count?.class_enrolments ?? 0}</span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={yearFilter}
        onValueChange={(v) => {
          setYearFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t('filterYear')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filterAllYears')}</SelectItem>
          {academicYears.map((y) => (
            <SelectItem key={y.id} value={y.id}>
              {y.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={groupFilter}
        onValueChange={(v) => {
          setGroupFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t('filterGroup')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filterAllGroups')}</SelectItem>
          {yearGroups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
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
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filterAllStatuses')}</SelectItem>
          <SelectItem value="active">{t('statusActive')}</SelectItem>
          <SelectItem value="inactive">{t('statusInactive')}</SelectItem>
          <SelectItem value="archived">{t('statusArchived')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => router.push(`/${locale}/classes/new`)}>
            <Plus className="me-2 h-4 w-4" />
            {t('newClass')}
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
        onRowClick={(row) => router.push(`/${locale}/classes/${row.id}`)}
      />
    </div>
  );
}
