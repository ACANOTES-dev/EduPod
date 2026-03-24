'use client';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { Search, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  created_at: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  meta: { page: number; pageSize: number; total: number };
}

const ENTITY_TYPES = [
  'user',
  'student',
  'staff',
  'parent',
  'tenant',
  'role',
  'payroll_run',
  'fee',
  'payment',
  'academic_year',
  'subject',
  'exam',
  'compliance_request',
  'import_job',
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditLogPage() {
  const t = useTranslations('auditLog');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<AuditLogEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [entityType, setEntityType] = React.useState('');
  const [actor, setActor] = React.useState('');
  const [action, setAction] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  const fetchLogs = React.useCallback(
    async (p: number) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
        });
        if (entityType) params.set('entity_type', entityType);
        if (actor.trim()) params.set('actor', actor.trim());
        if (action.trim()) params.set('action', action.trim());
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);

        const res = await apiClient<AuditLogResponse>(
          `/api/v1/audit-logs?${params.toString()}`,
        );
        setData(res.data);
        setTotal(res.meta.total);
      } catch {
        // silently swallowed; table shows empty state
      } finally {
        setIsLoading(false);
      }
    },
    [entityType, actor, action, startDate, endDate],
  );

  React.useEffect(() => {
    void fetchLogs(page);
  }, [page, fetchLogs]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1);
  }, [entityType, actor, action, startDate, endDate]);

  const handleClearFilters = () => {
    setEntityType('');
    setActor('');
    setAction('');
    setStartDate('');
    setEndDate('');
  };

  const hasFilters = entityType || actor || action || startDate || endDate;

  const columns = [
    {
      key: 'created_at',
      header: t('timestamp'),
      render: (row: AuditLogEntry) => (
        <span dir="ltr" className="text-text-secondary whitespace-nowrap">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: 'actor_name',
      header: t('actor'),
      render: (row: AuditLogEntry) => (
        <span className="font-medium text-text-primary">{row.actor_name ?? 'System'}</span>
      ),
    },
    {
      key: 'action',
      header: t('action'),
      render: (row: AuditLogEntry) => (
        <span className="text-text-secondary">{row.action}</span>
      ),
    },
    {
      key: 'entity_type',
      header: t('entityType'),
      render: (row: AuditLogEntry) => (
        <code className="text-xs text-text-secondary">{row.entity_type}</code>
      ),
    },
    {
      key: 'entity_id',
      header: t('entityId'),
      render: (row: AuditLogEntry) => (
        <span dir="ltr" className="font-mono text-xs text-text-tertiary">
          {row.entity_id}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full sm:w-44">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger>
            <SelectValue placeholder={t('allEntityTypes')} />
          </SelectTrigger>
          <SelectContent>
            {ENTITY_TYPES.map((et) => (
              <SelectItem key={et} value={et}>
                {et}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="relative w-full sm:w-44">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('searchActor')}
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="ps-9"
        />
      </div>

      <div className="relative w-full sm:w-44">
        <Filter className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('filterAction')}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="ps-9"
        />
      </div>

      <div className="w-full sm:w-40">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          placeholder={t('startDate')}
        />
      </div>

      <div className="w-full sm:w-40">
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          placeholder={t('endDate')}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters}>
          {tc('clearFilters')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />

      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        toolbar={toolbar}
      />
    </div>
  );
}
