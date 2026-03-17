'use client';

import { ScrollText, Search } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState, Input } from '@school/ui';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Household {
  id: string;
  household_name: string;
  billing_parent_name: string | null;
  outstanding_balance: number;
  currency_code: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatementsIndexPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = pathname.split('/').filter(Boolean)[0] ?? 'en';

  const [households, setHouseholds] = React.useState<Household[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');

  const fetchHouseholds = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);

      const res = await apiClient<{ data: Household[]; meta: { total: number } }>(
        `/api/v1/households?${params.toString()}`,
      );
      setHouseholds(res.data);
      setTotal(res.meta.total);
    } catch {
      setHouseholds([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search]);

  React.useEffect(() => {
    void fetchHouseholds();
  }, [fetchHouseholds]);

  React.useEffect(() => {
    setPage(1);
  }, [search]);

  const columns = [
    {
      key: 'household_name',
      header: t('household'),
      render: (row: Household) => (
        <span className="font-medium text-text-primary">{row.household_name}</span>
      ),
    },
    {
      key: 'billing_parent_name',
      header: t('billingParent'),
      render: (row: Household) => (
        <span className="text-sm text-text-secondary">
          {row.billing_parent_name ?? '--'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: Household) => (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/${locale}/finance/statements/${row.id}`);
          }}
        >
          {t('viewStatement')}
        </Button>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={`${tCommon('search')}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('statements')}
        description={t('statementsDescription')}
      />

      {!isLoading && households.length === 0 && !search ? (
        <EmptyState
          icon={ScrollText}
          title={t('noHouseholds')}
          description={t('noHouseholdsDesc')}
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
          onRowClick={(row) => router.push(`/${locale}/finance/statements/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
