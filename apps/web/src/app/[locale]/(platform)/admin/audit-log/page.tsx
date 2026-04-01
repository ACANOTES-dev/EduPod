'use client';

import { Search, Filter } from 'lucide-react';
import { useParams } from 'next/navigation';
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
  tenant_id: string | null;
  tenant_name: string | null;
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  meta: { page: number; pageSize: number; total: number };
}

interface TenantOption {
  id: string;
  name: string;
}

interface TenantListResponse {
  data: TenantOption[];
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

export default function PlatformAuditLogPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  void locale; // platform admin is English-only; locale extracted for consistency

  const [data, setData] = React.useState<AuditLogEntry[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [entityType, setEntityType] = React.useState('');
  const [tenantId, setTenantId] = React.useState('');
  const [actor, setActor] = React.useState('');
  const [action, setAction] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  // Tenant options for dropdown
  const [tenants, setTenants] = React.useState<TenantOption[]>([]);

  React.useEffect(() => {
    apiClient<TenantListResponse>('/api/v1/admin/tenants?pageSize=100')
      .then((res) => setTenants(res.data))
      .catch(() => setTenants([]));
  }, []);

  const fetchLogs = React.useCallback(
    async (p: number) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          pageSize: String(PAGE_SIZE),
        });
        if (entityType) params.set('entity_type', entityType);
        if (tenantId) params.set('tenant_id', tenantId);
        if (actor.trim()) params.set('actor', actor.trim());
        if (action.trim()) params.set('action', action.trim());
        if (startDate) params.set('start_date', startDate);
        if (endDate) params.set('end_date', endDate);

        const res = await apiClient<AuditLogResponse>(
          `/api/v1/admin/audit-logs?${params.toString()}`,
        );
        setData(res.data);
        setTotal(res.meta.total);
      } catch (err) {
        // silently swallowed; table shows empty state
        console.error('[setTotal]', err);
      } finally {
        setIsLoading(false);
      }
    },
    [entityType, tenantId, actor, action, startDate, endDate],
  );

  React.useEffect(() => {
    void fetchLogs(page);
  }, [page, fetchLogs]);

  // Reset to page 1 when filters change
  React.useEffect(() => {
    setPage(1);
  }, [entityType, tenantId, actor, action, startDate, endDate]);

  const handleClearFilters = () => {
    setEntityType('');
    setTenantId('');
    setActor('');
    setAction('');
    setStartDate('');
    setEndDate('');
  };

  const hasFilters = entityType || tenantId || actor || action || startDate || endDate;

  const columns = [
    {
      key: 'created_at',
      header: 'Timestamp',
      render: (row: AuditLogEntry) => (
        <span dir="ltr" className="text-text-secondary whitespace-nowrap">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: 'tenant_name',
      header: 'Tenant',
      render: (row: AuditLogEntry) => (
        <span className="text-text-secondary">{row.tenant_name ?? '—'}</span>
      ),
    },
    {
      key: 'actor_name',
      header: 'Actor',
      render: (row: AuditLogEntry) => (
        <span className="font-medium text-text-primary">{row.actor_name}</span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row: AuditLogEntry) => <span className="text-text-secondary">{row.action}</span>,
    },
    {
      key: 'entity_type',
      header: 'Entity Type',
      render: (row: AuditLogEntry) => (
        <code className="text-xs text-text-secondary">{row.entity_type}</code>
      ),
    },
    {
      key: 'entity_id',
      header: 'Entity ID',
      render: (row: AuditLogEntry) => (
        <span dir="ltr" className="font-mono text-xs text-text-tertiary">
          {row.entity_id}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44">
        <Select value={tenantId} onValueChange={setTenantId}>
          <SelectTrigger>
            <SelectValue placeholder="All tenants" />
          </SelectTrigger>
          <SelectContent>
            {tenants.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-44">
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger>
            <SelectValue placeholder="All entity types" />
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

      <div className="relative w-44">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder="Search actor..."
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="ps-9"
        />
      </div>

      <div className="relative w-44">
        <Filter className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder="Filter action..."
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="ps-9"
        />
      </div>

      <div className="w-40">
        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
      </div>

      <div className="w-40">
        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        description="View all activity across all tenants on the platform"
      />

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
