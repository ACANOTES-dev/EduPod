'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  EmptyState,
} from '@school/ui';
import { AlertTriangle } from 'lucide-react';
import * as React from 'react';


import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface AllergyRecord {
  student_id: string;
  student_name: string;
  year_group_name?: string | null;
  homeroom_class_name?: string | null;
  allergy_details: string;
}

interface YearGroup {
  id: string;
  name: string;
}

interface SchoolClass {
  id: string;
  name: string;
}

export default function AllergyReportPage() {
  const [records, setRecords] = React.useState<AllergyRecord[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const [yearGroupFilter, setYearGroupFilter] = React.useState('all');
  const [classFilter, setClassFilter] = React.useState('all');

  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (yearGroupFilter !== 'all') params.set('year_group_id', yearGroupFilter);
      if (classFilter !== 'all') params.set('class_id', classFilter);

      const res = await apiClient<{ data: AllergyRecord[]; meta: { total: number } }>(
        `/api/v1/students/allergy-report?${params.toString()}`,
      );
      setRecords(res.data);
      setTotal(res.meta.total);
    } catch {
      setRecords([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, yearGroupFilter, classFilter]);

  React.useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [ygRes, clRes] = await Promise.all([
          apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
          apiClient<{ data: SchoolClass[] }>('/api/v1/classes?pageSize=100&status=active'),
        ]);
        setYearGroups(ygRes.data);
        setClasses(clRes.data);
      } catch {
        // ignore
      }
    };
    void fetchOptions();
  }, []);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  React.useEffect(() => {
    setPage(1);
  }, [yearGroupFilter, classFilter]);

  const columns = [
    {
      key: 'student_name',
      header: 'Student',
      render: (row: AllergyRecord) => (
        <EntityLink
          entityType="student"
          entityId={row.student_id}
          label={row.student_name}
          href={`/students/${row.student_id}`}
        />
      ),
    },
    {
      key: 'year_group',
      header: 'Year Group',
      render: (row: AllergyRecord) => (
        <span className="text-text-secondary">{row.year_group_name ?? '—'}</span>
      ),
    },
    {
      key: 'homeroom_class',
      header: 'Homeroom Class',
      render: (row: AllergyRecord) => (
        <span className="text-text-secondary">{row.homeroom_class_name ?? '—'}</span>
      ),
    },
    {
      key: 'allergy_details',
      header: 'Allergy Details',
      render: (row: AllergyRecord) => (
        <span className="text-sm text-danger-text">{row.allergy_details}</span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={yearGroupFilter} onValueChange={setYearGroupFilter}>
        <SelectTrigger className="w-full sm:w-[140px]">
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

      <Select value={classFilter} onValueChange={setClassFilter}>
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder="Class" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Classes</SelectItem>
          {classes.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Allergy Report"
        description="Students with known allergies across all year groups"
      />

      {!isLoading && records.length === 0 ? (
        <EmptyState
          icon={AlertTriangle}
          title="No allergy records found"
          description="No students with recorded allergies match the current filters."
        />
      ) : (
        <DataTable
          columns={columns}
          data={records}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.student_id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
