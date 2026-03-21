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
  EmptyState,
} from '@school/ui';
import { GraduationCap, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

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
      if (allergyFilter !== 'all') params.set('has_allergy', allergyFilter === 'yes' ? 'true' : 'false');

      const res = await apiClient<{ data: Student[]; meta: { total: number } }>(
        `/api/v1/students?${params.toString()}`,
      );
      setStudents(res.data);
      setTotal(res.meta.total);
    } catch {
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
    } catch {
      // ignore
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
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="applicant">Applicant</SelectItem>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="withdrawn">Withdrawn</SelectItem>
          <SelectItem value="graduated">Graduated</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>

      <Select value={yearGroupFilter} onValueChange={setYearGroupFilter}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Year Group" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Year Groups</SelectItem>
          {yearGroups.map((yg) => (
            <SelectItem key={yg.id} value={yg.id}>
              {yg.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={allergyFilter} onValueChange={setAllergyFilter}>
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Allergy" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="yes">Has Allergy</SelectItem>
          <SelectItem value="no">No Allergy</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Manage student records and enrolments"
        actions={
          <Button onClick={() => router.push('/students/new')}>
            <Plus className="me-2 h-4 w-4" />
            New Student
          </Button>
        }
      />

      {!isLoading && students.length === 0 && !search && statusFilter === 'all' ? (
        <EmptyState
          icon={GraduationCap}
          title="No students yet"
          description="Add your first student to get started."
          action={{ label: 'New Student', onClick: () => router.push('/students/new') }}
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
    </div>
  );
}
