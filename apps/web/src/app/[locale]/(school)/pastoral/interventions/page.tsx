'use client';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import {
  PastoralActionStatusBadge,
  PastoralInterventionStatusBadge,
  PastoralTierBadge,
} from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import {
  getLocaleFromPathname,
  normalizeActionStatus,
  normalizeInterventionStatus,
  PASTORAL_INTERVENTION_STATUSES,
  searchStudents,
  type PastoralApiListResponse,
  type PastoralInterventionListItem,
  type SearchOption,
} from '@/lib/pastoral';

const PAGE_SIZE = 20;

export default function PastoralInterventionListPage() {
  const t = useTranslations('pastoral.interventions');
  const sharedT = useTranslations('pastoral.shared');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const [records, setRecords] = React.useState<PastoralInterventionListItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [status, setStatus] = React.useState('all');
  const [studentFilter, setStudentFilter] = React.useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchInterventions = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (status !== 'all') {
        params.set('status', status);
      }

      if (studentFilter[0]) {
        params.set('student_id', studentFilter[0].id);
      }

      const response = await apiClient<PastoralApiListResponse<PastoralInterventionListItem>>(
        `/api/v1/pastoral/interventions?${params.toString()}`,
        { silent: true },
      );

      setRecords(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch {
      setRecords([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, status, studentFilter]);

  React.useEffect(() => {
    void fetchInterventions();
  }, [fetchInterventions]);

  const toolbar = (
    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
      <Select
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('filters.status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.all')}</SelectItem>
          {PASTORAL_INTERVENTION_STATUSES.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`status.${option}` as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <SearchPicker
        label={t('filters.student')}
        placeholder={t('filters.studentPlaceholder')}
        search={searchStudents}
        selected={studentFilter}
        onChange={(next) => {
          setStudentFilter(next.slice(0, 1));
          setPage(1);
        }}
        multiple={false}
        emptyText={sharedT('noStudents')}
        minSearchLengthText={sharedT('minSearchLength')}
      />
    </div>
  );

  const columns = [
    {
      key: 'student_name',
      header: t('columns.student'),
      render: (row: PastoralInterventionListItem) => (
        <div>
          <p className="font-medium text-text-primary">
            {row.student_name ?? sharedT('notAvailable')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">{row.case_number ?? row.case_id}</p>
        </div>
      ),
    },
    {
      key: 'intervention_type',
      header: t('columns.interventionType'),
      render: (row: PastoralInterventionListItem) => (
        <div className="space-y-2">
          <p className="text-sm font-medium text-text-primary">
            {t(`types.${row.intervention_type}` as never)}
          </p>
          <PastoralTierBadge tier={row.continuum_level} />
        </div>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: PastoralInterventionListItem) => (
        <PastoralInterventionStatusBadge status={normalizeInterventionStatus(row.status)} />
      ),
    },
    {
      key: 'review',
      header: t('columns.review'),
      render: (row: PastoralInterventionListItem) => (
        <span className="text-sm text-text-secondary">{formatDate(row.next_review_date)}</span>
      ),
    },
    {
      key: 'outcome_notes',
      header: t('columns.actions'),
      render: (row: PastoralInterventionListItem) => (
        <span className="text-sm text-text-secondary">
          {row.outcome_notes ? (
            t('notesRecorded')
          ) : (
            <PastoralActionStatusBadge status={normalizeActionStatus('pending')} />
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href={`/${locale}/pastoral/interventions/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('create')}
            </Button>
          </Link>
        }
      />

      <div className="space-y-4 md:hidden">
        {toolbar}
        {isLoading ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-surface-secondary" />
          ))
        ) : records.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text-tertiary">
            {t('empty')}
          </p>
        ) : (
          records.map((record) => (
            <button
              key={record.id}
              type="button"
              onClick={() => router.push(`/${locale}/pastoral/interventions/${record.id}`)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-start"
            >
              <div className="flex flex-wrap items-center gap-2">
                <PastoralInterventionStatusBadge
                  status={normalizeInterventionStatus(record.status)}
                />
                <PastoralTierBadge tier={record.continuum_level} />
              </div>
              <p className="mt-3 text-sm font-medium text-text-primary">
                {record.student_name ?? sharedT('notAvailable')}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {t(`types.${record.intervention_type}` as never)}
              </p>
              <p className="mt-3 text-xs text-text-tertiary">
                {t('reviewDate', { date: formatDate(record.next_review_date) })}
              </p>
            </button>
          ))
        )}
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={records}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/pastoral/interventions/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
