'use client';

import { Download, FileSpreadsheet, GraduationCap, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  EmptyState,
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
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { StudentExportDialog } from './_components/export-dialog';
import {
  ALL_EXPORT_COLUMNS,
  DEFAULT_SELECTED_COLUMNS,
  type ExportStudent,
  generateExcel,
  generatePdf,
} from './_components/export-utils';


interface YearGroup {
  id: string;
  name: string;
}

interface Student {
  id: string;
  student_number: string;
  full_name: string;
  status: 'applicant' | 'active' | 'withdrawn' | 'graduated' | 'archived';
  has_allergy: boolean;
  year_group?: { id: string; name: string } | null;
  household?: { id: string; household_name: string } | null;
}

const statusVariantMap: Record<
  Student['status'],
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  active: 'success',
  applicant: 'info',
  withdrawn: 'warning',
  graduated: 'neutral',
  archived: 'neutral',
};

export default function StudentsPage() {
  const t = useTranslations('students');
  const tCommon = useTranslations('common');
  const router = useRouter();

  const [students, setStudents] = React.useState<Student[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [yearGroupFilter, setYearGroupFilter] = React.useState('all');
  const [allergyFilter, setAllergyFilter] = React.useState('all');

  // ── Export state ──────────────────────────────────────────────────────────
  const [exportModalOpen, setExportModalOpen] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<'xlsx' | 'pdf'>('xlsx');
  const [selectedColumns, setSelectedColumns] = React.useState(new Set(DEFAULT_SELECTED_COLUMNS));
  const [exporting, setExporting] = React.useState(false);

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeColumns = ALL_EXPORT_COLUMNS.filter((c) => selectedColumns.has(c.key));

  const openExportModal = (format: 'xlsx' | 'pdf') => {
    setExportFormat(format);
    setExportModalOpen(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (yearGroupFilter !== 'all') params.set('year_group_id', yearGroupFilter);
      if (allergyFilter !== 'all')
        params.set('has_allergy', allergyFilter === 'yes' ? 'true' : 'false');

      const res = await apiClient<{ data: ExportStudent[] }>(
        `/api/v1/students/export-data?${params.toString()}`,
      );

      if (res.data.length === 0) {
        toast.error('No students to export');
        return;
      }

      const title = 'Students_List';

      if (exportFormat === 'xlsx') {
        generateExcel(res.data, activeColumns, title);
      } else {
        generatePdf(res.data, activeColumns, title);
      }

      toast.success('Export downloaded');
      setExportModalOpen(false);
    } catch (err) {
      console.error('[StudentsPage]', err);
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  // ── Data fetching ─────────────────────────────────────────────────────────
  const fetchStudents = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (yearGroupFilter !== 'all') params.set('year_group_id', yearGroupFilter);
      if (allergyFilter !== 'all')
        params.set('has_allergy', allergyFilter === 'yes' ? 'true' : 'false');

      const res = await apiClient<{ data: Student[]; meta: { total: number } }>(
        `/api/v1/students?${params.toString()}`,
      );
      setStudents(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[StudentsPage]', err);
      setStudents([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, yearGroupFilter, allergyFilter]);

  const fetchYearGroups = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100');
      setYearGroups(res.data);
    } catch (err) {
      // ignore
      console.error('[setYearGroups]', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchYearGroups();
  }, [fetchYearGroups]);

  React.useEffect(() => {
    void fetchStudents();
  }, [fetchStudents]);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter, yearGroupFilter, allergyFilter]);

  // ── Table columns ─────────────────────────────────────────────────────────
  const columns = [
    {
      key: 'full_name',
      header: 'Name',
      render: (row: Student) => (
        <EntityLink
          entityType="student"
          entityId={row.id}
          label={row.full_name}
          href={`/students/${row.id}`}
        />
      ),
    },
    {
      key: 'student_number',
      header: 'Student #',
      render: (row: Student) => (
        <span className="font-mono text-xs text-text-secondary">{row.student_number}</span>
      ),
    },
    {
      key: 'year_group',
      header: 'Year Group',
      render: (row: Student) => (
        <span className="text-text-secondary">{row.year_group?.name ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Student) => (
        <StatusBadge status={statusVariantMap[row.status]} dot>
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </StatusBadge>
      ),
    },
    {
      key: 'household',
      header: 'Household',
      render: (row: Student) =>
        row.household ? (
          <EntityLink
            entityType="household"
            entityId={row.household.id}
            label={row.household.household_name}
            href={`/households/${row.household.id}`}
          />
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('searchStudents')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder={t('status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStatuses')}</SelectItem>
          <SelectItem value="applicant">{t('applicant')}</SelectItem>
          <SelectItem value="active">{t('active')}</SelectItem>
          <SelectItem value="withdrawn">{t('withdrawn')}</SelectItem>
          <SelectItem value="graduated">{t('graduated')}</SelectItem>
          <SelectItem value="archived">{t('archived')}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={yearGroupFilter} onValueChange={setYearGroupFilter}>
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder={t('yearGroup')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allYearGroups')}</SelectItem>
          {yearGroups.map((yg) => (
            <SelectItem key={yg.id} value={yg.id}>
              {yg.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={allergyFilter} onValueChange={setAllergyFilter}>
        <SelectTrigger className="w-full sm:w-[130px]">
          <SelectValue placeholder={t('allergy')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tCommon('all')}</SelectItem>
          <SelectItem value="yes">{t('hasAllergy')}</SelectItem>
          <SelectItem value="no">{t('noAllergy')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description="Manage student records and enrolments"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openExportModal('xlsx')}>
              <FileSpreadsheet className="me-2 h-4 w-4" />{t('excel')}</Button>
            <Button variant="outline" size="sm" onClick={() => openExportModal('pdf')}>
              <Download className="me-2 h-4 w-4" />{tCommon('pdfFormat')}</Button>
          </div>
        }
      />

      {!isLoading && students.length === 0 && !search && statusFilter === 'all' ? (
        <EmptyState
          icon={GraduationCap}
          title={t('noStudentsYet')}
          description="Register a new family using the wizard, or add a student from an existing household."
        />
      ) : (
        <DataTable
          columns={columns}
          data={students}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/students/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      <StudentExportDialog
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        exportFormat={exportFormat}
        selectedColumns={selectedColumns}
        onToggleColumn={toggleColumn}
        activeColumns={activeColumns}
        exporting={exporting}
        onExport={() => void handleExport()}
      />
    </div>
  );
}
