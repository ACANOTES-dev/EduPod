'use client';

import { Percent, Plus, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { DiscountType } from '@school/shared';
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

interface Discount {
  id: string;
  name: string;
  discount_type: DiscountType;
  value: number;
  active: boolean;
}

export default function DiscountsPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  const [discounts, setDiscounts] = React.useState<Discount[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('all');

  const fetchDiscounts = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (activeFilter !== 'all') params.set('active', activeFilter);

      const res = await apiClient<{ data: Discount[]; meta: { total: number } }>(
        `/api/v1/finance/discounts?${params.toString()}`,
      );
      setDiscounts(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FinanceDiscountsPage]', err);
      setDiscounts([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, activeFilter]);

  React.useEffect(() => {
    void fetchDiscounts();
  }, [fetchDiscounts]);

  React.useEffect(() => {
    setPage(1);
  }, [search, activeFilter]);

  const columns = [
    {
      key: 'name',
      header: t('discounts.colName'),
      render: (row: Discount) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    {
      key: 'discount_type',
      header: t('discounts.colType'),
      render: (row: Discount) => (
        <span className="text-text-secondary capitalize">{row.discount_type}</span>
      ),
    },
    {
      key: 'value',
      header: t('discounts.colValue'),
      render: (row: Discount) => (
        <span className="font-mono text-sm text-text-primary" dir="ltr">
          {row.discount_type === 'percent' ? `${row.value}%` : row.value.toFixed(2)}
        </span>
      ),
    },
    {
      key: 'active',
      header: t('discounts.colStatus'),
      render: (row: Discount) => (
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
          placeholder={t('discounts.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select value={activeFilter} onValueChange={setActiveFilter}>
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder={t('status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tCommon('all')}</SelectItem>
          <SelectItem value="true">{t('active')}</SelectItem>
          <SelectItem value="false">{t('inactive')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('discounts.title')}
        description={t('discounts.description')}
        actions={
          canManage ? (
            <Button onClick={() => router.push('discounts/new')}>
              <Plus className="me-2 h-4 w-4" />
              {t('discounts.newButton')}
            </Button>
          ) : undefined
        }
      />

      {!isLoading && discounts.length === 0 && !search && activeFilter === 'all' ? (
        <EmptyState
          icon={Percent}
          title={t('discounts.emptyTitle')}
          description={t('discounts.emptyDescription')}
          action={
            canManage
              ? {
                  label: t('discounts.newButton'),
                  onClick: () => router.push('discounts/new'),
                }
              : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={discounts}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`discounts/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
