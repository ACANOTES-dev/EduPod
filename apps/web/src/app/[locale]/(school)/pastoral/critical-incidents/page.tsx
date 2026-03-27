'use client';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PastoralCriticalIncidentStatusBadge } from '@/components/pastoral/pastoral-badges';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import {
  formatPastoralValue,
  getLocaleFromPathname,
  normalizeCriticalIncidentScope,
  normalizeCriticalIncidentStatus,
  normalizeCriticalIncidentType,
  PASTORAL_CRITICAL_INCIDENT_STATUSES,
  PASTORAL_CRITICAL_INCIDENT_TYPES,
  type PastoralApiListResponse,
  type PastoralCriticalIncidentListItem,
} from '@/lib/pastoral';
import { formatDate } from '@/lib/format-date';

const PAGE_SIZE = 20;

export default function PastoralCriticalIncidentsPage() {
  const t = useTranslations('pastoral.criticalIncidents');
  const pathname = usePathname();
  const locale = getLocaleFromPathname(pathname);
  const router = useRouter();
  const [records, setRecords] = React.useState<PastoralCriticalIncidentListItem[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [status, setStatus] = React.useState('all');
  const [type, setType] = React.useState('all');
  const [isLoading, setIsLoading] = React.useState(true);

  const fetchIncidents = React.useCallback(async () => {
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
        params.set('incident_type', type);
      }

      const response = await apiClient<PastoralApiListResponse<PastoralCriticalIncidentListItem>>(
        `/api/v1/pastoral/critical-incidents?${params.toString()}`,
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
  }, [page, status, type]);

  React.useEffect(() => {
    void fetchIncidents();
  }, [fetchIncidents]);

  const toolbar = (
    <div className="grid gap-3 md:grid-cols-[220px_220px]">
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
          {PASTORAL_CRITICAL_INCIDENT_STATUSES.map((option) => (
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
          {PASTORAL_CRITICAL_INCIDENT_TYPES.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`types.${option}` as never)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  const columns = [
    {
      key: 'description',
      header: t('columns.incident'),
      render: (row: PastoralCriticalIncidentListItem) => (
        <div>
          <p className="font-medium text-text-primary">
            {t(`types.${normalizeCriticalIncidentType(row.incident_type)}` as never)}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{row.description}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (row: PastoralCriticalIncidentListItem) => (
        <PastoralCriticalIncidentStatusBadge status={normalizeCriticalIncidentStatus(row.status)} />
      ),
    },
    {
      key: 'scope',
      header: t('columns.scope'),
      render: (row: PastoralCriticalIncidentListItem) => (
        <span className="text-sm text-text-secondary">
          {t(`scope.${normalizeCriticalIncidentScope(row.scope)}` as never)}
        </span>
      ),
    },
    {
      key: 'occurred_at',
      header: t('columns.date'),
      render: (row: PastoralCriticalIncidentListItem) => (
        <span className="text-sm text-text-secondary">{formatDate(row.occurred_at)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href={`/${locale}/pastoral/critical-incidents/new`}>
            <Button>
              <Plus className="me-2 h-4 w-4" />
              {t('declare')}
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
              onClick={() => router.push(`/${locale}/pastoral/critical-incidents/${record.id}`)}
              className="w-full rounded-2xl border border-border bg-surface px-4 py-4 text-start"
            >
              <div className="flex flex-wrap items-center gap-2">
                <PastoralCriticalIncidentStatusBadge
                  status={normalizeCriticalIncidentStatus(record.status)}
                />
              </div>
              <p className="mt-3 text-sm font-medium text-text-primary">
                {t(`types.${normalizeCriticalIncidentType(record.incident_type)}` as never)}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {formatPastoralValue(normalizeCriticalIncidentScope(record.scope))}
              </p>
              <p className="mt-3 text-xs text-text-tertiary">{formatDate(record.occurred_at)}</p>
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
          onRowClick={(row) => router.push(`/${locale}/pastoral/critical-incidents/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
