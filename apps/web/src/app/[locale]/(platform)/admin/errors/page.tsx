'use client';

import { RefreshCw, Search } from 'lucide-react';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { ErrorDetailRow, type PlatformErrorLog } from './_components/error-detail-row';

interface TenantOption {
  id: string;
  name: string;
}

interface TenantListResponse {
  data: TenantOption[];
}

interface ErrorResponse {
  data: PlatformErrorLog[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

export default function ErrorDiagnosticsPage() {
  const [rows, setRows] = React.useState<PlatformErrorLog[]>([]);
  const [tenants, setTenants] = React.useState<TenantOption[]>([]);
  const [tenantFilter, setTenantFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [endpointFilter, setEndpointFilter] = React.useState('');
  const [messageFilter, setMessageFilter] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    apiClient<TenantListResponse>('/api/v1/admin/tenants?pageSize=100', { silent: true })
      .then((response) => setTenants(response.data))
      .catch((err: unknown) => {
        console.error('[ErrorDiagnosticsPage.loadTenants]', err);
        setTenants([]);
      });
  }, []);

  const load = React.useCallback(
    async (nextPage: number) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(PAGE_SIZE),
        });
        if (tenantFilter !== 'all' && tenantFilter !== 'platform') {
          params.set('tenant_id', tenantFilter);
        }
        if (tenantFilter === 'platform') {
          params.set('platform_level', 'true');
        }
        if (statusFilter !== 'all') {
          params.set('http_status', statusFilter);
        }
        if (endpointFilter.trim()) {
          params.set('endpoint', endpointFilter.trim());
        }
        if (messageFilter.trim()) {
          params.set('message', messageFilter.trim());
        }
        const response = await apiClient<ErrorResponse>(
          `/api/v1/admin/errors?${params.toString()}`,
        );
        setRows(response.data);
        setPage(response.meta.page);
        setTotal(response.meta.total);
      } catch (err: unknown) {
        console.error('[ErrorDiagnosticsPage.load]', err);
        toast.error(getErrorMessage(err, 'Failed to load error diagnostics.'));
      } finally {
        setLoading(false);
      }
    },
    [endpointFilter, messageFilter, statusFilter, tenantFilter],
  );

  React.useEffect(() => {
    const timer = setTimeout(() => {
      void load(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const tenantById = React.useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant.name])),
    [tenants],
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summary = buildSummary(rows, tenantById);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Error Diagnostics"
        description="Grouped, redacted platform errors with tenant and request correlation."
        actions={
          <Button variant="outline" onClick={() => void load(page)}>
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Visible Errors" value={total} />
        <SummaryCard label="Errors Today" value={summary.today} />
        <SummaryCard label="Top Endpoint" value={summary.topEndpoint} />
        <SummaryCard label="Top Tenant" value={summary.topTenant} />
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[180px_150px_1fr_1fr]">
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              <SelectItem value="platform">Platform-level</SelectItem>
              {tenants.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="500">500</SelectItem>
              <SelectItem value="502">502</SelectItem>
              <SelectItem value="503">503</SelectItem>
              <SelectItem value="504">504</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
            <Input
              className="ps-9"
              placeholder="Filter endpoint..."
              value={endpointFilter}
              onChange={(event) => setEndpointFilter(event.target.value)}
            />
          </div>
          <Input
            placeholder="Search message..."
            value={messageFilter}
            onChange={(event) => setMessageFilter(event.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[960px] text-start">
          <thead className="bg-surface-secondary text-xs font-semibold uppercase text-text-tertiary">
            <tr>
              <th className="px-3 py-3" />
              <th className="px-3 py-3 text-start">Last seen</th>
              <th className="px-3 py-3 text-start">Tenant</th>
              <th className="px-3 py-3 text-start">Endpoint</th>
              <th className="px-3 py-3 text-start">Message</th>
              <th className="px-3 py-3 text-start">Count</th>
              <th className="px-3 py-3 text-start">Request ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-secondary">
                  Loading diagnostics...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-secondary">
                  No redacted errors match these filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <ErrorDetailRow
                  key={row.id}
                  error={row}
                  tenantName={
                    row.tenant_id_redacted
                      ? (tenantById.get(row.tenant_id_redacted) ?? row.tenant_id_redacted)
                      : 'Platform'
                  }
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>
          Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => void load(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => void load(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase text-text-tertiary">{label}</p>
      <p className="mt-2 truncate text-xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

function buildSummary(rows: PlatformErrorLog[], tenantById: Map<string, string>) {
  const todayKey = new Date().toISOString().slice(0, 10);
  const today = rows.filter((row) => row.last_seen_at.startsWith(todayKey)).length;
  const endpointCounts = new Map<string, number>();
  const tenantCounts = new Map<string, number>();

  for (const row of rows) {
    const endpoint = row.endpoint ?? 'Unknown';
    endpointCounts.set(endpoint, (endpointCounts.get(endpoint) ?? 0) + row.count);
    const tenantName = row.tenant_id_redacted
      ? (tenantById.get(row.tenant_id_redacted) ?? row.tenant_id_redacted)
      : 'Platform';
    tenantCounts.set(tenantName, (tenantCounts.get(tenantName) ?? 0) + row.count);
  }

  return {
    today,
    topEndpoint: topEntry(endpointCounts),
    topTenant: topEntry(tenantCounts),
  };
}

function topEntry(values: Map<string, number>): string {
  let best = 'None';
  let bestCount = 0;
  for (const [label, count] of values.entries()) {
    if (count > bestCount) {
      best = label;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : 'None';
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
