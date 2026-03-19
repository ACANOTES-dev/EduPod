'use client';

import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  Input,
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

interface StaffProfile {
  id: string;
  staff_number: string | null;
  job_title: string | null;
  department: string | null;
  employment_status: string;
  employment_type: string;
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface StaffResponse {
  data: StaffProfile[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const t = useTranslations('staff');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<StaffProfile[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [statusFilter, setStatusFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');
  const [searchInput, setSearchInput] = React.useState('');

  const fetchStaff = React.useCallback(async (p: number, status: string, q: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (status !== 'all') params.set('employment_status', status);
      if (q.trim()) params.set('search', q.trim());
      const res = await apiClient<StaffResponse>(`/api/v1/staff-profiles?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchStaff(page, statusFilter, search);
  }, [page, statusFilter, search, fetchStaff]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const employmentStatusBadge = (status: string) => {
    if (status === 'active') return <StatusBadge status="success" dot>{t('statusActive')}</StatusBadge>;
    return <StatusBadge status="neutral" dot>{t('statusInactive')}</StatusBadge>;
  };

  const columns = [
    {
      key: 'name',
      header: t('colName'),
      render: (row: StaffProfile) => (
        <span className="font-medium text-text-primary">
          {row.user.first_name} {row.user.last_name}
        </span>
      ),
    },
    {
      key: 'job_title',
      header: t('colJobTitle'),
      render: (row: StaffProfile) => (
        <span className="text-text-secondary">{row.job_title ?? '—'}</span>
      ),
    },
    {
      key: 'department',
      header: t('colDepartment'),
      render: (row: StaffProfile) => (
        <span className="text-text-secondary">{row.department ?? '—'}</span>
      ),
    },
    {
      key: 'employment_status',
      header: t('colStatus'),
      render: (row: StaffProfile) => employmentStatusBadge(row.employment_status),
    },
    {
      key: 'employment_type',
      header: t('colType'),
      render: (row: StaffProfile) => (
        <span className="text-text-secondary capitalize">{row.employment_type.replace('_', ' ')}</span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="ps-9 w-64"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">{tc('search')}</Button>
      </form>
      <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filterAll')}</SelectItem>
          <SelectItem value="active">{t('filterActive')}</SelectItem>
          <SelectItem value="inactive">{t('filterInactive')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => router.push(`/${locale}/staff/new`)}>
            <Plus className="me-2 h-4 w-4" />
            {t('newStaff')}
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
        onRowClick={(row) => router.push(`/${locale}/staff/${row.id}`)}
      />
    </div>
  );
}
