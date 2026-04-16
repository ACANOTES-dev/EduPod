'use client';

import { Home, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
  StatusBadge,
  EmptyState,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface Household {
  id: string;
  household_name: string;
  household_number?: string | null;
  status: 'active' | 'inactive' | 'archived';
  needs_completion: boolean;
  completion_issues?: string[];
  student_count?: number;
  primary_billing_parent?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

const statusVariantMap: Record<
  Household['status'],
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  active: 'success',
  inactive: 'warning',
  archived: 'neutral',
};

export default function HouseholdsPage() {
  const t = useTranslations('households');
  const router = useRouter();

  const [households, setHouseholds] = React.useState<Household[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');

  const fetchHouseholds = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiClient<{ data: Household[]; meta: { total: number } }>(
        `/api/v1/households?${params.toString()}`,
      );
      setHouseholds(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[HouseholdsPage]', err);
      setHouseholds([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter]);

  React.useEffect(() => {
    void fetchHouseholds();
  }, [fetchHouseholds]);

  React.useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const columns = [
    {
      key: 'household_name',
      header: 'Household Name',
      render: (row: Household) => {
        const issueLabels: Record<string, string> = {
          missing_emergency_contact: 'No emergency contact',
          missing_billing_parent: 'No billing parent',
        };
        const issues = row.completion_issues ?? [];
        return (
          <div className="flex items-center gap-2">
            <EntityLink
              entityType="household"
              entityId={row.id}
              label={row.household_name}
              href={`/households/${row.id}`}
            />
            {row.household_number && (
              <span className="font-mono text-xs text-text-tertiary" dir="ltr">
                {row.household_number}
              </span>
            )}
            {row.needs_completion && (
              <StatusBadge
                status="warning"
                title={issues.map((i) => issueLabels[i] ?? i).join(', ')}
              >
                {issues.length > 0
                  ? issues.map((i) => issueLabels[i] ?? i).join(' · ')
                  : 'Incomplete'}
              </StatusBadge>
            )}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Household) => (
        <StatusBadge status={statusVariantMap[row.status]} dot>
          {row.status.charAt(0).toUpperCase() + row.status.slice(1)}
        </StatusBadge>
      ),
    },
    {
      key: 'student_count',
      header: 'Students',
      render: (row: Household) => (
        <span className="text-text-secondary">{row.student_count ?? 0}</span>
      ),
    },
    {
      key: 'billing_parent',
      header: 'Billing Parent',
      render: (row: Household) =>
        row.primary_billing_parent ? (
          <EntityLink
            entityType="parent"
            entityId={row.primary_billing_parent.id}
            label={`${row.primary_billing_parent.first_name} ${row.primary_billing_parent.last_name}`}
            href={`/parents/${row.primary_billing_parent.id}`}
          />
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('searchHouseholds')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t('status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStatuses')}</SelectItem>
          <SelectItem value="active">{t('active')}</SelectItem>
          <SelectItem value="inactive">{t('inactive')}</SelectItem>
          <SelectItem value="archived">{t('archived')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          <Button onClick={() => router.push('/households/new')}>
            <Plus className="me-2 h-4 w-4" />
            {t('newHousehold')}
          </Button>
        }
      />

      {!isLoading && households.length === 0 && !search && statusFilter === 'all' ? (
        <EmptyState
          icon={Home}
          title={t('noHouseholdsYet')}
          description="Register a new family using the wizard to create a household."
        />
      ) : (
        <DataTable
          columns={columns}
          data={households}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/households/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
