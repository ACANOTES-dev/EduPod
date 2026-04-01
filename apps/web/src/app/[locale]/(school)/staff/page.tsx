'use client';

import { Download, Plus, Search } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ExportDialog } from './_components/export-dialog';
import {
  ALL_EXPORT_COLUMNS,
  DEFAULT_SELECTED_COLUMNS,
  ExportStaffProfile,
  generateExcel,
  generatePdf,
} from './_components/export-utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StaffProfile {
  id: string;
  staff_number: string | null;
  job_title: string | null;
  department: string | null;
  employment_status: string;
  employment_type: string;
  roles: string[];
  user: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
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

  // ─── Export state ───────────────────────────────────────────────────────────
  const [exportModalOpen, setExportModalOpen] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<'xlsx' | 'pdf'>('xlsx');
  const [selectedColumns, setSelectedColumns] = React.useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED_COLUMNS),
  );
  const [exporting, setExporting] = React.useState(false);
  const [presetName, setPresetName] = React.useState('');

  const openExportModal = (format: 'xlsx' | 'pdf') => {
    setExportFormat(format);
    setExportModalOpen(true);
  };

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const activeColumns = ALL_EXPORT_COLUMNS.filter((c) => selectedColumns.has(c.key));

  const handleExport = async () => {
    if (activeColumns.length === 0) return;
    setExporting(true);
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

      const exportRows: ExportStaffProfile[] = allData.map((s) => ({
        staff_number: s.staff_number,
        first_name: s.user.first_name,
        last_name: s.user.last_name,
        email: s.user.email,
        phone: s.user.phone,
        job_title: s.job_title,
        department: s.department,
        employment_status: s.employment_status,
        employment_type: s.employment_type,
        roles: s.roles,
      }));

      const schoolName = 'School';
      if (exportFormat === 'xlsx') {
        generateExcel(exportRows, activeColumns, schoolName);
      } else {
        generatePdf(exportRows, activeColumns, schoolName);
      }
      toast.success(t('exportSuccess'));
      setExportModalOpen(false);
    } catch {
      toast.error(t('exportError'));
    } finally {
      setExporting(false);
    }
  };

  // ─── Data fetching ──────────────────────────────────────────────────────────

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
    if (status === 'active')
      return (
        <StatusBadge status="success" dot>
          {t('statusActive')}
        </StatusBadge>
      );
    return (
      <StatusBadge status="neutral" dot>
        {t('statusInactive')}
      </StatusBadge>
    );
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
      key: 'roles',
      header: t('colRole'),
      render: (row: StaffProfile) => (
        <span className="text-text-secondary">
          {row.roles.length > 0 ? row.roles.join(', ') : '—'}
        </span>
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
        <span className="text-text-secondary capitalize">
          {row.employment_type.replace('_', ' ')}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative flex-1 sm:flex-none">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder={t('searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="ps-9 w-full sm:w-64"
          />
        </div>
        <Button type="submit" variant="outline" size="sm">
          {tc('search')}
        </Button>
      </form>
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-40">
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
          <div className="flex flex-wrap items-center gap-2">
            <Select onValueChange={(v) => openExportModal(v as 'xlsx' | 'pdf')}>
              <SelectTrigger className="w-full sm:w-[130px]">
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
      <ExportDialog
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        exportFormat={exportFormat}
        selectedColumns={selectedColumns}
        onToggleColumn={toggleColumn}
        activeColumns={activeColumns}
        exporting={exporting}
        onExport={() => void handleExport()}
        presetName={presetName}
        onPresetNameChange={setPresetName}
      />
    </div>
  );
}
