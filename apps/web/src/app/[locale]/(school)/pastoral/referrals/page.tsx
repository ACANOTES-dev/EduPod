'use client';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PastoralReferralStatusBadge } from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import {
  formatPastoralValue,
  formatStudentName,
  getLocaleFromPathname,
  PASTORAL_REFERRAL_STATUSES,
  PASTORAL_REFERRAL_TYPES,
  searchStudents,
  type PastoralApiListResponse,
  type PastoralReferralListItem,
  type SearchOption,
} from '@/lib/pastoral';
import { formatDate } from '@/lib/format-date';

const PAGE_SIZE = 20;

export default function PastoralReferralsPage() {
  const t = useTranslations('pastoral.referrals');
  const sharedT = useTranslations('pastoral.shared');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const [records, setRecords] = React.useState<PastoralReferralListItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [status, setStatus] = React.useState('all');
  const [type, setType] = React.useState('all');
  const [studentFilter, setStudentFilter] = React.useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchReferrals = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (status !== 'all') {
        params.set('status', status);
      }
      if (type !== 'all') {
        params.set('referral_type', type);
      }
      if (studentFilter[0]) {
        params.set('student_id', studentFilter[0].id);
      }

      const response = await apiClient<PastoralApiListResponse<PastoralReferralListItem>>(
        `/api/v1/pastoral/referrals?${params.toString()}`,
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
  }, [page, status, studentFilter, type]);

  React.useEffect(() => {
    void fetchReferrals();
  }, [fetchReferrals]);

  const toolbar = (
    <div className="grid gap-3 md:grid-cols-[220px_220px_minmax(0,1fr)]">
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
          {PASTORAL_REFERRAL_STATUSES.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`status.${option}` as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={type}
        onValueChange={(value) => {
          setType(value);
          setPage(1);
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('filters.type')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('filters.allTypes')}</SelectItem>
          {PASTORAL_REFERRAL_TYPES.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`types.${option}` as never)}
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
      key: 'student',
      header: t('columns.student'),
      render: (row: PastoralReferralListItem) => (
        <div>
          <p className="font-medium text-text-primary">
            {formatStudentName(row.student) || sharedT('notAvailable')}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">{row.case_id ?? t('noCase')}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: t('columns.type'),
      render: (row: PastoralReferralListItem) => (
        <div>
          <p className="text-sm font-medium text-text-primary">
            {t(`types.${row.referral_type}` as never)}
          </p>
          <p className="mt-1 text-xs text-text-tertiary">
            {row.referral_body_name ?? formatPastoralValue(row.referral_type)}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: PastoralReferralListItem) => (
        <PastoralReferralStatusBadge status={row.status} />
      ),
    },
    {
      key: 'submitted',
      header: t('columns.submitted'),
      render: (row: PastoralReferralListItem) => (
        <span className="text-sm text-text-secondary">
          {row.submitted_at ? formatDate(row.submitted_at) : t('draftOnly')}
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
          <Link href={`/${locale}/pastoral/referrals/new`}>
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
              onClick={() => router.push(`/${locale}/pastoral/referrals/${record.id}`)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-start"
            >
              <div className="flex flex-wrap items-center gap-2">
                <PastoralReferralStatusBadge status={record.status} />
              </div>
              <p className="mt-3 text-sm font-medium text-text-primary">
                {formatStudentName(record.student) || sharedT('notAvailable')}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {t(`types.${record.referral_type}` as never)}
              </p>
              <p className="mt-3 text-xs text-text-tertiary">
                {record.submitted_at ? formatDate(record.submitted_at) : t('draftOnly')}
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
          onRowClick={(row) => router.push(`/${locale}/pastoral/referrals/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
