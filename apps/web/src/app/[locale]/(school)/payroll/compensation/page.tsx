'use client';

import {
  Button,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { BulkImportDialog } from './_components/bulk-import-dialog';
import { CompensationForm } from './_components/compensation-form';

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
  const router = useRouter();
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
  const [historyStaffId, setHistoryStaffId] = React.useState<string | null>(null);
  const [historyRecords, setHistoryRecords] = React.useState<CompensationRecord[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(false);

  const pageSize = 20;

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (typeFilter !== 'all') {
        params.set('compensation_type', typeFilter);
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

  const handleRevise = (record: CompensationRecord) => {
    setEditRecord(record);
    setFormOpen(true);
  };

  const handleViewHistory = async (staffProfileId: string) => {
    if (historyStaffId === staffProfileId) {
      setHistoryStaffId(null);
      return;
    }
    setHistoryStaffId(staffProfileId);
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        staff_profile_id: staffProfileId,
        active_only: 'false',
        pageSize: '50',
      });
      const res = await apiClient<{
        data: CompensationRecord[];
        meta: { total: number };
      }>(`/api/v1/payroll/compensation?${params.toString()}`);
      setHistoryRecords(res.data);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  };

  const getStaffName = (row: CompensationRecord): string =>
    row.staff_name ?? (row.staff_profile?.user ? `${row.staff_profile.user.first_name} ${row.staff_profile.user.last_name}` : '—');

  const columns = [
    {
      key: 'staff_name',
      header: t('staffName'),
      render: (row: CompensationRecord) => (
        <span className="font-medium text-text-primary">{getStaffName(row)}</span>
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
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleRevise(row)}>
            {t('revise')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleViewHistory(row.staff_profile_id)}
          >
            {t('history')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => router.push(`/${locale}/payroll`)}
          className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          &larr; {t('backToPayroll')}
        </button>
        <PageHeader
          title={t('compensation')}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setBulkOpen(true)}>
                {t('bulkImport')}
              </Button>
              <Button onClick={() => { setEditRecord(null); setFormOpen(true); }}>
                {t('addCompensation')}
              </Button>
            </div>
          }
        />
      </div>

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
          <div className="flex flex-wrap items-center gap-3">
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-48">
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

      {/* Compensation History Timeline */}
      {historyStaffId && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="text-sm font-semibold text-text-primary mb-4">{t('compensationHistory')}</h3>
          {historyLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ) : historyRecords.length === 0 ? (
            <p className="text-sm text-text-tertiary">{t('noData')}</p>
          ) : (
            <div className="relative space-y-0">
              {historyRecords.map((rec, i) => {
                const isActive = rec.effective_to === null;
                const staffName = getStaffName(rec);
                return (
                  <div
                    key={rec.id}
                    className="relative flex items-start gap-4 pb-4"
                  >
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div
                        className={`h-3 w-3 rounded-full ${isActive ? 'bg-success-500' : 'bg-border'}`}
                      />
                      {i < historyRecords.length - 1 && (
                        <div className="w-px flex-1 bg-border" />
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 -mt-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-text-primary">
                          {rec.compensation_type === 'salaried'
                            ? `${t('baseSalary')}: ${formatCurrency(rec.base_salary ?? 0)}`
                            : `${t('perClassRate')}: ${formatCurrency(rec.per_class_rate ?? 0)}`}
                        </span>
                        {isActive && (
                          <Badge variant="default">{t('active')}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {staffName} &middot; {new Date(rec.effective_from).toLocaleDateString(locale)}
                        {rec.effective_to
                          ? ` — ${new Date(rec.effective_to).toLocaleDateString(locale)}`
                          : ` — ${t('present')}`}
                      </p>
                      {rec.bonus_day_multiplier && rec.compensation_type === 'salaried' && (
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {t('bonusDayMultiplier')}: {rec.bonus_day_multiplier}x
                        </p>
                      )}
                      {rec.bonus_class_rate != null && rec.compensation_type === 'per_class' && (
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {t('bonusClassRate')}: {formatCurrency(rec.bonus_class_rate)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
