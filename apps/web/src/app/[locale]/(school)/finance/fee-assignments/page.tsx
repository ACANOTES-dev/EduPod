'use client';

import { FileText, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, EmptyState } from '@school/ui';

import { HouseholdSelector } from '../_components/household-selector';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';


interface FeeAssignment {
  id: string;
  household: { id: string; household_name: string };
  student?: { id: string; full_name: string } | null;
  fee_structure: { id: string; name: string };
  discount?: { id: string; name: string } | null;
  effective_from: string;
  effective_to: string | null;
}

export default function FeeAssignmentsPage() {
  const t = useTranslations('finance');
  const router = useRouter();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  const [assignments, setAssignments] = React.useState<FeeAssignment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [householdFilter, setHouseholdFilter] = React.useState('');

  const fetchAssignments = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (householdFilter) params.set('household_id', householdFilter);

      const res = await apiClient<{ data: FeeAssignment[]; meta: { total: number } }>(
        `/api/v1/finance/fee-assignments?${params.toString()}`,
      );
      setAssignments(res.data);
      setTotal(res.meta.total);
    } catch {
      setAssignments([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, householdFilter]);

  React.useEffect(() => {
    void fetchAssignments();
  }, [fetchAssignments]);

  React.useEffect(() => {
    setPage(1);
  }, [householdFilter]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const columns = [
    {
      key: 'household',
      header: t('feeAssignments.colHousehold'),
      render: (row: FeeAssignment) => (
        <span className="font-medium text-text-primary">{row.household.household_name}</span>
      ),
    },
    {
      key: 'student',
      header: t('feeAssignments.colStudent'),
      render: (row: FeeAssignment) => (
        <span className="text-text-secondary">{row.student?.full_name ?? '—'}</span>
      ),
    },
    {
      key: 'fee_structure',
      header: t('feeAssignments.colFeeStructure'),
      render: (row: FeeAssignment) => (
        <span className="text-text-secondary">{row.fee_structure.name}</span>
      ),
    },
    {
      key: 'discount',
      header: t('feeAssignments.colDiscount'),
      render: (row: FeeAssignment) => (
        <span className="text-text-secondary">{row.discount?.name ?? '—'}</span>
      ),
    },
    {
      key: 'effective_dates',
      header: t('feeAssignments.colEffectiveDates'),
      render: (row: FeeAssignment) => (
        <span className="text-text-secondary text-sm" dir="ltr">
          {formatDate(row.effective_from)}
          {row.effective_to ? ` – ${formatDate(row.effective_to)}` : ' – Ongoing'}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-full sm:min-w-[250px] sm:w-auto">
        <HouseholdSelector
          value={householdFilter}
          onValueChange={setHouseholdFilter}
          placeholder={t('feeAssignments.filterByHousehold')}
        />
      </div>
      {householdFilter && (
        <Button variant="ghost" size="sm" onClick={() => setHouseholdFilter('')}>
          {t('feeAssignments.clearFilter')}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('feeAssignments.title')}
        description={t('feeAssignments.description')}
        actions={
          canManage ? (
            <Button onClick={() => router.push('fee-assignments/new')}>
              <Plus className="me-2 h-4 w-4" />
              {t('feeAssignments.newButton')}
            </Button>
          ) : undefined
        }
      />

      {!isLoading && assignments.length === 0 && !householdFilter ? (
        <EmptyState
          icon={FileText}
          title={t('feeAssignments.emptyTitle')}
          description={t('feeAssignments.emptyDescription')}
          action={
            canManage
              ? {
                  label: t('feeAssignments.newButton'),
                  onClick: () => router.push('fee-assignments/new'),
                }
              : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={assignments}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}
    </div>
  );
}
