'use client';

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
import { Download, Plus, Search } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';


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

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    try {
      // Fetch ALL matching staff (paginated, respecting backend max of 100)
      let allData: StaffProfile[] = [];
      let currentPage = 1;
      let hasMore = true;
      while (hasMore) {
        const params = new URLSearchParams({ page: String(currentPage), pageSize: '100' });
        if (statusFilter !== 'all') params.set('employment_status', statusFilter);
        if (search.trim()) params.set('search', search.trim());

        const res = await apiClient<StaffResponse>(`/api/v1/staff-profiles?${params.toString()}`);
        allData = [...allData, ...res.data];
        hasMore = allData.length < res.meta.total;
        currentPage++;
      }

      const exportColumns = [
        { header: 'Name', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'Job Title', key: 'job_title' },
        { header: 'Department', key: 'department' },
        { header: 'Status', key: 'employment_status' },
        { header: 'Type', key: 'employment_type' },
      ];

      const exportRows = allData.map((s) => ({
        name: `${s.user.first_name} ${s.user.last_name}`,
        email: s.user.email,
        job_title: s.job_title ?? '',
        department: s.department ?? '',
        employment_status: s.employment_status.charAt(0).toUpperCase() + s.employment_status.slice(1),
        employment_type: s.employment_type.replace('_', ' '),
      }));

      const options = {
        fileName: 'staff',
        title: 'Staff List',
        columns: exportColumns,
        rows: exportRows,
      };

      if (format === 'xlsx') {
        const { exportToExcel } = await import('@/lib/export-utils');
        exportToExcel(options);
      } else {
        const { exportToPdf } = await import('@/lib/export-utils');
        exportToPdf(options);
      }
    } catch {
      // silently fail
    }
  };

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
          <div className="flex items-center gap-2">
            <Select onValueChange={(v) => void handleExport(v as 'xlsx' | 'pdf')}>
              <SelectTrigger className="w-[130px]">
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  <span>{tc('export') ?? 'Export'}</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xlsx">{tc('excelFormat') ?? 'Excel (.xlsx)'}</SelectItem>
                <SelectItem value="pdf">{tc('pdfFormat') ?? 'PDF'}</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => router.push(`/${locale}/staff/new`)}>
              <Plus className="me-2 h-4 w-4" />
              {t('newStaff')}
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
        onRowClick={(row) => router.push(`/${locale}/staff/${row.id}`)}
      />
    </div>
  );
}
