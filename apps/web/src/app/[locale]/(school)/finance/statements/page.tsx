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

interface HouseholdApiItem {
  id: string;
  household_name: string;
  household_number: string | null;
  primary_billing_parent?: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
  } | null;
}

interface OverviewRow {
  household_id: string;
  balance: number;
}

interface HouseholdRow {
  id: string;
  household_name: string;
  household_number: string | null;
  billing_parent_name: string | null;
  phone: string | null;
  outstanding: number | null;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatementsIndexPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [households, setHouseholds] = React.useState<HouseholdRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [currencyCode, setCurrencyCode] = React.useState('USD');

  // Fetch currency code once
  React.useEffect(() => {
    apiClient<{ currency_code: string }>('/api/v1/finance/dashboard/currency')
      .then((res) => setCurrencyCode(res.currency_code))
      .catch((err) => console.error('[StatementsPage] currency fetch', err));
  }, []);

  const fetchHouseholds = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);

      // Fetch household list and financial overview in parallel
      const [householdRes, overviewRes] = await Promise.all([
        apiClient<{ data: HouseholdApiItem[]; meta: { total: number } }>(
          `/api/v1/households?${params.toString()}`,
        ),
        apiClient<{ data: OverviewRow[] }>(
          '/api/v1/finance/dashboard/household-overview?pageSize=100',
        ),
      ]);

      // Build balance lookup by household_id
      const balanceMap = new Map<string, number>();
      for (const row of overviewRes.data) {
        balanceMap.set(row.household_id, row.balance);
      }

      setHouseholds(
        householdRes.data.map((h) => ({
          id: h.id,
          household_name: h.household_name,
          household_number: h.household_number ?? null,
          billing_parent_name: h.primary_billing_parent
            ? `${h.primary_billing_parent.first_name} ${h.primary_billing_parent.last_name}`
            : null,
          phone: h.primary_billing_parent?.phone ?? null,
          outstanding: balanceMap.get(h.id) ?? null,
        })),
      );
      setTotal(householdRes.meta.total);
    } catch (err) {
      console.error('[FinanceStatementsPage]', err);
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
      render: (row: HouseholdRow) => (
        <span className="font-medium text-text-primary">{row.household_name}</span>
      ),
    },
    {
      key: 'household_number',
      header: t('householdNo'),
      render: (row: HouseholdRow) => (
        <span className="text-sm font-mono text-text-secondary">
          {row.household_number ?? '--'}
        </span>
      ),
    },
    {
      key: 'billing_parent_name',
      header: t('billingParent'),
      render: (row: HouseholdRow) => (
        <span className="text-sm text-text-secondary">{row.billing_parent_name ?? '--'}</span>
      ),
    },
    {
      key: 'phone',
      header: t('phone'),
      render: (row: HouseholdRow) => (
        <span className="text-sm text-text-secondary" dir="ltr">
          {row.phone ?? '--'}
        </span>
      ),
    },
    {
      key: 'outstanding',
      header: t('outstanding'),
      render: (row: HouseholdRow) => {
        if (row.outstanding === null || row.outstanding === 0) {
          return <span className="text-sm text-text-tertiary">--</span>;
        }
        return (
          <span className="text-sm font-mono font-medium text-danger-text">
            {currencyCode}{' '}
            {row.outstanding.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      render: (row: HouseholdRow) => (
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
      <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
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
      <PageHeader title={t('statements')} description={t('statementsDescription')} />

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
