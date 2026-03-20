'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { PageHeader } from '@/components/page-header';
import { DataTable } from '@/components/data-table';
import { apiClient } from '@/lib/api-client';

import { CompensationForm } from './_components/compensation-form';
import { BulkImportDialog } from './_components/bulk-import-dialog';

function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface CompensationRecord {
  id: string;
  staff_profile_id: string;
  staff_name?: string;
  staff_profile?: {
    id: string;
    staff_number: string;
    user: { first_name: string; last_name: string };
  };
  compensation_type: 'salaried' | 'per_class';
  base_salary: number | null;
  per_class_rate: number | null;
  assigned_classes: number | null;
  bonus_class_rate: number | null;
  bonus_day_multiplier: number | null;
  effective_from: string;
  effective_to: string | null;
  status: string;
}

export default function CompensationListPage() {
  const t = useTranslations('payroll');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<CompensationRecord[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [isLoading, setIsLoading] = React.useState(true);
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [formOpen, setFormOpen] = React.useState(false);
  const [editRecord, setEditRecord] = React.useState<CompensationRecord | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);

  const pageSize = 20;

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (typeFilter !== 'all') {
        params.set('type', typeFilter);
      }
      const res = await apiClient<{
        data: CompensationRecord[];
        meta: { total: number };
      }>(`/api/v1/payroll/compensation?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [page, typeFilter]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleSuccess = () => {
    setFormOpen(false);
    setEditRecord(null);
    void fetchData();
  };

  const handleEdit = (record: CompensationRecord) => {
    setEditRecord(record);
    setFormOpen(true);
  };

  const columns = [
    {
      key: 'staff_name',
      header: t('staffName'),
      render: (row: CompensationRecord) => (
        <span className="font-medium text-text-primary">{row.staff_name ?? (row.staff_profile?.user ? `${row.staff_profile.user.first_name} ${row.staff_profile.user.last_name}` : '—')}</span>
      ),
    },
    {
      key: 'type',
      header: t('type'),
      render: (row: CompensationRecord) => (
        <Badge variant={row.compensation_type === 'salaried' ? 'default' : 'secondary'}>
          {row.compensation_type === 'salaried' ? t('salaried') : t('perClass')}
        </Badge>
      ),
    },
    {
      key: 'rate',
      header: t('rate'),
      render: (row: CompensationRecord) =>
        row.compensation_type === 'salaried'
          ? formatCurrency(row.base_salary ?? 0)
          : `${formatCurrency(row.per_class_rate ?? 0)} / ${t('perClass').toLowerCase()}`,
    },
    {
      key: 'bonus_config',
      header: t('bonusConfig'),
      render: (row: CompensationRecord) => {
        if (row.bonus_class_rate) {
          return `${t('bonusClassRate')}: ${formatCurrency(row.bonus_class_rate)}`;
        }
        if (row.bonus_day_multiplier) {
          return `${t('bonusDayMultiplier')}: ${row.bonus_day_multiplier}x`;
        }
        return <span className="text-text-tertiary">-</span>;
      },
    },
    {
      key: 'effective_from',
      header: t('effectiveFrom'),
      render: (row: CompensationRecord) => new Date(row.effective_from).toLocaleDateString(locale),
    },
    {
      key: 'actions',
      header: t('actions'),
      render: (row: CompensationRecord) => (
        <Button variant="ghost" size="sm" onClick={() => handleEdit(row)}>
          {t('editCompensation')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('compensation')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              {t('bulkImport')}
            </Button>
            <Button onClick={() => { setEditRecord(null); setFormOpen(true); }}>
              {t('addCompensation')}
            </Button>
          </div>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
        toolbar={
          <div className="flex items-center gap-3">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder={t('compensationType')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allStaff')}</SelectItem>
                <SelectItem value="salaried">{t('salaried')}</SelectItem>
                <SelectItem value="per_class">{t('perClass')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      <CompensationForm
        open={formOpen}
        onOpenChange={(open) => { setFormOpen(open); if (!open) setEditRecord(null); }}
        record={editRecord}
        onSuccess={handleSuccess}
      />

      <BulkImportDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onSuccess={handleSuccess}
      />
    </div>
  );
}
