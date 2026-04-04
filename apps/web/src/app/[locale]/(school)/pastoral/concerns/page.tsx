'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { PastoralSeverityBadge, PastoralTierBadge } from '@/components/pastoral/pastoral-badges';
import { SearchPicker } from '@/components/pastoral/search-picker';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';
import {
  formatPastoralValue,
  formatShortId,
  getLocaleFromPathname,
  PASTORAL_SEVERITIES,
  searchStudents,
  type PastoralApiListResponse,
  type PastoralConcernListItem,
  type SearchOption,
} from '@/lib/pastoral';

const PAGE_SIZE = 20;

export default function PastoralConcernListPage() {
  const t = useTranslations('pastoral.concerns');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const [data, setData] = React.useState<PastoralConcernListItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [severity, setSeverity] = React.useState('all');
  const [tier, setTier] = React.useState('all');
  const [category, setCategory] = React.useState('');
  const [studentFilter, setStudentFilter] = React.useState<SearchOption[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchConcerns = React.useCallback(async () => {
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });

      if (severity !== 'all') {
        params.set('severity', severity);
      }
      if (tier !== 'all') {
        params.set('tier', tier);
      }
      if (category.trim()) {
        params.set('category', category.trim());
      }
      if (studentFilter[0]) {
        params.set('student_id', studentFilter[0].id);
      }

      const response = await apiClient<PastoralApiListResponse<PastoralConcernListItem>>(
        `/api/v1/pastoral/concerns?${params.toString()}`,
        { silent: true },
      );

      setData(response.data ?? []);
      setTotal(response.meta?.total ?? 0);
    } catch (err) {
      console.error('[PastoralConcernsPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [category, page, severity, studentFilter, tier]);

  React.useEffect(() => {
    void fetchConcerns();
  }, [fetchConcerns]);

  const toolbar = (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_180px]">
        <Input
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
          placeholder={t('filters.categoryPlaceholder')}
        />
        <Select
          value={severity}
          onValueChange={(value) => {
            setSeverity(value);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('filters.severity')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            {PASTORAL_SEVERITIES.map((level) => (
              <SelectItem key={level} value={level}>
                {t(`severity.${level}` as never)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={tier}
          onValueChange={(value) => {
            setTier(value);
            setPage(1);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={t('filters.tier')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('filters.all')}</SelectItem>
            <SelectItem value="1">{t('tier.tier1')}</SelectItem>
            <SelectItem value="2">{t('tier.tier2')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
        emptyText={t('filters.noStudents')}
        minSearchLengthText={t('shared.minSearchLength')}
      />
    </div>
  );

  const columns = [
    {
      key: 'student_name',
      header: t('columns.student'),
      render: (row: PastoralConcernListItem) => (
        <div>
          <p className="font-medium text-text-primary">{row.student_name}</p>
          <p className="mt-1 font-mono text-xs text-text-tertiary">
            {t('concernRef', { id: formatShortId(row.id) })}
          </p>
        </div>
      ),
    },
    {
      key: 'category',
      header: t('columns.category'),
      render: (row: PastoralConcernListItem) => (
        <div>
          <p className="text-sm text-text-primary">{formatPastoralValue(row.category)}</p>
          <p className="mt-1 text-xs text-text-tertiary">
            {row.follow_up_needed ? t('followUpNeeded') : t('recordOnly')}
          </p>
        </div>
      ),
    },
    {
      key: 'severity',
      header: t('columns.severity'),
      render: (row: PastoralConcernListItem) => <PastoralSeverityBadge severity={row.severity} />,
    },
    {
      key: 'tier',
      header: t('columns.tier'),
      render: (row: PastoralConcernListItem) => <PastoralTierBadge tier={row.tier} />,
    },
    {
      key: 'students_involved',
      header: t('columns.studentsInvolved'),
      render: (row: PastoralConcernListItem) =>
        row.students_involved.length > 0 ? (
          <span className="text-sm text-text-secondary">
            {row.students_involved
              .slice(0, 2)
              .map((student) => student.student_name)
              .join(', ')}
            {row.students_involved.length > 2 ? ` +${row.students_involved.length - 2}` : ''}
          </span>
        ) : (
          <span className="text-sm text-text-tertiary">{t('none')}</span>
        ),
    },
    {
      key: 'occurred_at',
      header: t('columns.occurredAt'),
      render: (row: PastoralConcernListItem) => (
        <span className="font-mono text-xs text-text-tertiary">
          {formatDateTime(row.occurred_at)}
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
          <Link href={`/${locale}/pastoral/concerns/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('logConcern')}
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
        ) : data.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-text-tertiary">
            {t('empty')}
          </p>
        ) : (
          data.map((concern) => (
            <button
              key={concern.id}
              type="button"
              onClick={() => router.push(`/${locale}/pastoral/concerns/${concern.id}`)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-start"
            >
              <div className="flex flex-wrap items-center gap-2">
                <PastoralSeverityBadge severity={concern.severity} />
                <PastoralTierBadge tier={concern.tier} />
              </div>
              <p className="mt-3 text-sm font-medium text-text-primary">{concern.student_name}</p>
              <p className="mt-1 text-sm text-text-secondary">
                {formatPastoralValue(concern.category)}
              </p>
              <p className="mt-3 text-xs text-text-tertiary">
                {formatDateTime(concern.occurred_at)}
              </p>
            </button>
          ))
        )}
      </div>

      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={data}
          toolbar={toolbar}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/${locale}/pastoral/concerns/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
