'use client';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { PastoralCaseStatusBadge, PastoralTierBadge } from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import {
  getLocaleFromPathname,
  PASTORAL_CASE_STATUSES,
  searchStudents,
  type PastoralApiListResponse,
  type PastoralCaseListItem,
  type SearchOption,
} from '@/lib/pastoral';

const PAGE_SIZE = 20;

export default function PastoralCaseListPage() {
  const t = useTranslations('pastoral.cases');
  const sharedT = useTranslations('pastoral.shared');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const [cases, setCases] = React.useState<PastoralCaseListItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [status, setStatus] = React.useState('all');
  const [studentFilter, setStudentFilter] = React.useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchCases = React.useCallback(async () => {
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

      const response = await apiClient<PastoralApiListResponse<PastoralCaseListItem>>(
        `/api/v1/pastoral/cases?${params.toString()}`,
        { silent: true },
      );

      setCases(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch {
      setCases([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, status, studentFilter]);

  React.useEffect(() => {
    void fetchCases();
  }, [fetchCases]);

  const toolbar = (
    <div className="space-y-4">
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
            {PASTORAL_CASE_STATUSES.map((option) => (
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
    </div>
  );

  const columns = [
    {
      key: 'case_number',
      header: t('columns.caseNumber'),
      render: (row: PastoralCaseListItem) => (
        <div>
          <p className="font-medium text-text-primary">{row.case_number}</p>
          <p className="mt-1 text-xs text-text-tertiary">{row.student_name}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: PastoralCaseListItem) => <PastoralCaseStatusBadge status={row.status} />,
    },
    {
      key: 'tier',
      header: t('columns.tier'),
      render: (row: PastoralCaseListItem) => <PastoralTierBadge tier={row.tier} />,
    },
    {
      key: 'owner_name',
      header: t('columns.owner'),
      render: (row: PastoralCaseListItem) => (
        <span className="text-sm text-text-secondary">
          {row.owner_name ?? sharedT('notAvailable')}
        </span>
      ),
    },
    {
      key: 'summary',
      header: t('columns.scope'),
      render: (row: PastoralCaseListItem) => (
        <span className="text-sm text-text-secondary">
          {t('scope', {
            concerns: row.concern_count,
            students: row.student_count,
          })}
        </span>
      ),
    },
    {
      key: 'next_review_date',
      header: t('columns.reviewDate'),
      render: (row: PastoralCaseListItem) => (
        <span className="text-sm text-text-secondary">
          {row.next_review_date ? formatDate(row.next_review_date) : t('reviewNotSet')}
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
          <Link href={`/${locale}/pastoral/cases/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('openCase')}
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
        ) : cases.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text-tertiary">
            {t('empty')}
          </p>
        ) : (
          cases.map((caseItem) => (
            <button
              key={caseItem.id}
              type="button"
              onClick={() => router.push(`/${locale}/pastoral/cases/${caseItem.id}`)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-start"
            >
              <div className="flex flex-wrap items-center gap-2">
                <PastoralCaseStatusBadge status={caseItem.status} />
                <PastoralTierBadge tier={caseItem.tier} />
              </div>
              <p className="mt-3 text-sm font-medium text-text-primary">{caseItem.case_number}</p>
              <p className="mt-1 text-sm text-text-secondary">{caseItem.student_name}</p>
              <p className="mt-3 text-xs text-text-tertiary">
                {caseItem.next_review_date
                  ? formatDate(caseItem.next_review_date)
                  : t('reviewNotSet')}
              </p>
            </button>
          ))
        )}
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={cases}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/pastoral/cases/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
