'use client';

import { Building2, Plus, Search } from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import * as React from 'react';

import { Button, Input, StatusBadge } from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'archived';
  default_locale: string;
  created_at: string;
}

interface TenantListResponse {
  data: Tenant[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

const statusVariantMap: Record<Tenant['status'], 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  suspended: 'warning',
  archived: 'neutral',
};

const statusLabelMap: Record<Tenant['status'], string> = {
  active: 'Active',
  suspended: 'Suspended',
  archived: 'Archived',
};

export default function TenantListPage() {
  const router = useRouter();
  const params = useParams();
  const locale = (params.locale as string) ?? 'en';
  const [tenants, setTenants] = React.useState<Tenant[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState('');
  const [debouncedSearch, setDebouncedSearch] = React.useState('');
  const pageSize = 20;

  // Debounce search
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchTenants() {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (debouncedSearch) {
          params.set('search', debouncedSearch);
        }
        const result = await apiClient<TenantListResponse>(
          `/api/v1/admin/tenants?${params.toString()}`,
        );
        if (!cancelled) {
          setTenants(result.data);
          setTotal(result.meta.total);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err && typeof err === 'object' && 'error' in err
              ? String((err as { error: { message?: string } }).error?.message ?? 'Failed to load tenants')
              : 'Failed to load tenants';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTenants();
    return () => {
      cancelled = true;
    };
  }, [page, debouncedSearch]);

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (tenant: Tenant) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="font-medium">{tenant.name}</span>
        </div>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (tenant: Tenant) => (
        <span className="font-mono text-xs text-text-secondary">{tenant.slug}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (tenant: Tenant) => (
        <StatusBadge status={statusVariantMap[tenant.status]} dot>
          {statusLabelMap[tenant.status]}
        </StatusBadge>
      ),
    },
    {
      key: 'default_locale',
      header: 'Locale',
      render: (tenant: Tenant) => (
        <span className="text-text-secondary">{tenant.default_locale.toUpperCase()}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (tenant: Tenant) => (
        <span className="text-text-secondary">
          {formatDate(tenant.created_at)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Manage school tenants across the platform"
        actions={
          <Button onClick={() => router.push(`/${locale}/admin/tenants/new`)}>
            <Plus className="me-2 h-4 w-4" />
            Create Tenant
          </Button>
        }
      />

      {error && (
        <div className="mt-6 rounded-xl border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={tenants}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(tenant) => router.push(`/${locale}/admin/tenants/${tenant.id}`)}
          keyExtractor={(tenant) => tenant.id}
          isLoading={loading}
          toolbar={
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                <Input
                  placeholder="Search tenants..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ps-9"
                />
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}
