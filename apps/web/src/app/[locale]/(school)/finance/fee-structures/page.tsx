'use client';

import { DollarSign, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { BillingFrequency } from '@school/shared';
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
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../_components/currency-display';


interface YearGroup {
  id: string;
  name: string;
}

interface FeeStructure {
  id: string;
  name: string;
  amount: number;
  billing_frequency: BillingFrequency;
  active: boolean;
  year_group?: { id: string; name: string } | null;
  currency_code?: string;
}

const frequencyLabels: Record<BillingFrequency, string> = {
  one_off: 'One-off',
  term: 'Per Term',
  monthly: 'Monthly',
  custom: 'Custom',
};

export default function FeeStructuresPage() {
  const t = useTranslations('finance');
  const router = useRouter();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  const [feeStructures, setFeeStructures] = React.useState<FeeStructure[]>([]);
  const [, setYearGroups] = React.useState<YearGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('all');

  const fetchFeeStructures = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (activeFilter !== 'all') params.set('active', activeFilter);

      const res = await apiClient<{ data: FeeStructure[]; meta: { total: number } }>(
        `/api/v1/finance/fee-structures?${params.toString()}`,
      );
      setFeeStructures(res.data);
      setTotal(res.meta.total);
    } catch {
      setFeeStructures([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, activeFilter]);

  const fetchYearGroups = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100');
      setYearGroups(res.data);
    } catch (err) {
      // ignore
      console.error('[setYearGroups]', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchYearGroups();
  }, [fetchYearGroups]);

  React.useEffect(() => {
    void fetchFeeStructures();
  }, [fetchFeeStructures]);

  React.useEffect(() => {
    setPage(1);
  }, [search, activeFilter]);

  const columns = [
    {
      key: 'name',
      header: t('feeStructures.colName'),
      render: (row: FeeStructure) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    {
      key: 'amount',
      header: t('feeStructures.colAmount'),
      render: (row: FeeStructure) => (
        <CurrencyDisplay
          amount={row.amount}
          currency_code={row.currency_code ?? 'AED'}
          className="font-mono text-sm text-text-primary"
        />
      ),
    },
    {
      key: 'billing_frequency',
      header: t('feeStructures.colFrequency'),
      render: (row: FeeStructure) => (
        <span className="text-text-secondary capitalize">
          {frequencyLabels[row.billing_frequency]}
        </span>
      ),
    },
    {
      key: 'year_group',
      header: t('feeStructures.colYearGroup'),
      render: (row: FeeStructure) => (
        <span className="text-text-secondary">{row.year_group?.name ?? '—'}</span>
      ),
    },
    {
      key: 'active',
      header: t('feeStructures.colStatus'),
      render: (row: FeeStructure) => (
        <StatusBadge status={row.active ? 'success' : 'neutral'} dot>
          {row.active ? 'Active' : 'Inactive'}
        </StatusBadge>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={t('feeStructures.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select value={activeFilter} onValueChange={setActiveFilter}>
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="true">Active</SelectItem>
          <SelectItem value="false">Inactive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('feeStructures.title')}
        description={t('feeStructures.description')}
        actions={
          canManage ? (
            <Button onClick={() => router.push('fee-structures/new')}>
              <Plus className="me-2 h-4 w-4" />
              {t('feeStructures.newButton')}
            </Button>
          ) : undefined
        }
      />

      {!isLoading && feeStructures.length === 0 && !search && activeFilter === 'all' ? (
        <EmptyState
          icon={DollarSign}
          title={t('feeStructures.emptyTitle')}
          description={t('feeStructures.emptyDescription')}
          action={{
            label: t('feeStructures.newButton'),
            onClick: () => router.push('fee-structures/new'),
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={feeStructures}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`fee-structures/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
