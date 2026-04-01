'use client';

import { Plus, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';


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

interface StaffAllowance {
  id: string;
  staff_profile_id: string;
  staff_name: string;
  allowance_type_id: string;
  allowance_name: string;
  amount: number;
  effective_from: string;
  effective_to: string | null;
}

interface StaffDeduction {
  id: string;
  staff_profile_id: string;
  staff_name: string;
  description: string;
  total_amount: number;
  monthly_amount: number;
  remaining_amount: number;
  start_date: string;
  months_remaining: number;
  active: boolean;
}

interface AllowanceType {
  id: string;
  name: string;
}

interface StaffOption {
  id: string;
  name: string;
}

type CompTab = 'compensation' | 'allowances' | 'deductions';

export default function CompensationListPage() {
  const t = useTranslations('payroll');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [activeTab, setActiveTab] = React.useState<CompTab>('compensation');

  // Compensation state
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

  // Allowances state
  const [allowances, setAllowances] = React.useState<StaffAllowance[]>([]);
  const [allowanceTypes, setAllowanceTypes] = React.useState<AllowanceType[]>([]);
  const [allowanceForm, setAllowanceForm] = React.useState(false);
  const [newAllowance, setNewAllowance] = React.useState({
    staff_profile_id: '',
    allowance_type_id: '',
    amount: '',
    effective_from: new Date().toISOString().split('T')[0] ?? '',
  });

  // Deductions state
  const [deductions, setDeductions] = React.useState<StaffDeduction[]>([]);
  const [deductionForm, setDeductionForm] = React.useState(false);
  const [newDeduction, setNewDeduction] = React.useState({
    staff_profile_id: '',
    description: '',
    total_amount: '',
    monthly_amount: '',
    start_date: new Date().toISOString().split('T')[0] ?? '',
  });

  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);

  const pageSize = 20;

  const fetchCompensation = React.useCallback(async () => {
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
    } catch (err) {
      // silent
      console.error('[setTotal]', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, typeFilter]);

  const fetchAllowances = React.useCallback(async () => {
    try {
      const [aRes, atRes, staffRes] = await Promise.all([
        apiClient<{ data: StaffAllowance[] }>('/api/v1/payroll/staff-allowances'),
        apiClient<{ data: AllowanceType[] }>('/api/v1/payroll/allowance-types'),
        apiClient<{ data: StaffOption[] }>('/api/v1/payroll/staff?pageSize=200'),
      ]);
      setAllowances(aRes.data);
      setAllowanceTypes(atRes.data);
      setStaffOptions(staffRes.data);
    } catch (err) {
      // silent
      console.error('[setStaffOptions]', err);
    }
  }, []);

  const fetchDeductions = React.useCallback(async () => {
    try {
      const res = await apiClient<{ data: StaffDeduction[] }>('/api/v1/payroll/staff-deductions');
      setDeductions(res.data);
    } catch (err) {
      // silent
      console.error('[setDeductions]', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchCompensation();
  }, [fetchCompensation]);

  React.useEffect(() => {
    if (activeTab === 'allowances') void fetchAllowances();
    if (activeTab === 'deductions') void fetchDeductions();
  }, [activeTab, fetchAllowances, fetchDeductions]);

  const handleSuccess = () => {
    setFormOpen(false);
    setEditRecord(null);
    void fetchCompensation();
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
    } catch (err) {
      // silent
      console.error('[setHistoryRecords]', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleAddAllowance = async () => {
    const amount = parseFloat(newAllowance.amount);
    if (!newAllowance.staff_profile_id || !newAllowance.allowance_type_id || isNaN(amount)) return;
    try {
      await apiClient('/api/v1/payroll/staff-allowances', {
        method: 'POST',
        body: JSON.stringify({ ...newAllowance, amount }),
      });
      setAllowanceForm(false);
      setNewAllowance({
        staff_profile_id: '',
        allowance_type_id: '',
        amount: '',
        effective_from: new Date().toISOString().split('T')[0] ?? '',
      });
      void fetchAllowances();
    } catch (err) {
      // silent
      console.error('[fetchAllowances]', err);
    }
  };

  const handleDeleteAllowance = async (id: string) => {
    try {
      await apiClient(`/api/v1/payroll/staff-allowances/${id}`, { method: 'DELETE' });
      setAllowances((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      // silent
      console.error('[setAllowances]', err);
    }
  };

  const handleAddDeduction = async () => {
    const total = parseFloat(newDeduction.total_amount);
    const monthly = parseFloat(newDeduction.monthly_amount);
    if (
      !newDeduction.staff_profile_id ||
      !newDeduction.description ||
      isNaN(total) ||
      isNaN(monthly)
    )
      return;
    try {
      await apiClient('/api/v1/payroll/staff-deductions', {
        method: 'POST',
        body: JSON.stringify({
          ...newDeduction,
          total_amount: total,
          monthly_amount: monthly,
        }),
      });
      setDeductionForm(false);
      setNewDeduction({
        staff_profile_id: '',
        description: '',
        total_amount: '',
        monthly_amount: '',
        start_date: new Date().toISOString().split('T')[0] ?? '',
      });
      void fetchDeductions();
    } catch (err) {
      // silent
      console.error('[fetchDeductions]', err);
    }
  };

  const handleDeactivateDeduction = async (id: string) => {
    try {
      await apiClient(`/api/v1/payroll/staff-deductions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: false }),
      });
      setDeductions((prev) => prev.map((d) => (d.id === id ? { ...d, active: false } : d)));
    } catch (err) {
      // silent
      console.error('[setDeductions]', err);
    }
  };

  const getStaffName = (row: CompensationRecord): string =>
    row.staff_name ??
    (row.staff_profile?.user
      ? `${row.staff_profile.user.first_name} ${row.staff_profile.user.last_name}`
      : '—');

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
          <Button variant="ghost" size="sm" onClick={() => handleViewHistory(row.staff_profile_id)}>
            {t('history')}
          </Button>
        </div>
      ),
    },
  ];

  const compTabs: { key: CompTab; label: string }[] = [
    { key: 'compensation', label: t('compensation') },
    { key: 'allowances', label: t('allowancesTab') },
    { key: 'deductions', label: t('deductionsTab') },
  ];

  return (
    <div className="space-y-6">
      <div>
        <button
          onClick={() => router.push(`/${locale}/payroll`)}
          className="mb-2 inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          &larr; {t('backToPayroll')}
        </button>
        <PageHeader
          title={t('compensation')}
          actions={
            activeTab === 'compensation' ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setBulkOpen(true)}>
                  {t('bulkImport')}
                </Button>
                <Button
                  onClick={() => {
                    setEditRecord(null);
                    setFormOpen(true);
                  }}
                >
                  {t('addCompensation')}
                </Button>
              </div>
            ) : activeTab === 'allowances' ? (
              <Button onClick={() => setAllowanceForm(true)}>
                <Plus className="me-1.5 h-4 w-4" />
                {t('addAllowance')}
              </Button>
            ) : (
              <Button onClick={() => setDeductionForm(true)}>
                <Plus className="me-1.5 h-4 w-4" />
                {t('addDeduction')}
              </Button>
            )
          }
        />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl border border-border bg-surface-secondary p-1">
        {compTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Compensation tab ─── */}
      {activeTab === 'compensation' && (
        <>
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
                <Select
                  value={typeFilter}
                  onValueChange={(v) => {
                    setTypeFilter(v);
                    setPage(1);
                  }}
                >
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
              <h3 className="mb-4 text-sm font-semibold text-text-primary">
                {t('compensationHistory')}
              </h3>
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
                      <div key={rec.id} className="relative flex items-start gap-4 pb-4">
                        <div className="flex flex-col items-center">
                          <div
                            className={`h-3 w-3 rounded-full ${isActive ? 'bg-success-500' : 'bg-border'}`}
                          />
                          {i < historyRecords.length - 1 && (
                            <div className="w-px flex-1 bg-border" />
                          )}
                        </div>
                        <div className="flex-1 -mt-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">
                              {rec.compensation_type === 'salaried'
                                ? `${t('baseSalary')}: ${formatCurrency(rec.base_salary ?? 0)}`
                                : `${t('perClassRate')}: ${formatCurrency(rec.per_class_rate ?? 0)}`}
                            </span>
                            {isActive && <Badge variant="default">{t('active')}</Badge>}
                          </div>
                          <p className="mt-0.5 text-xs text-text-secondary">
                            {staffName} &middot;{' '}
                            {new Date(rec.effective_from).toLocaleDateString(locale)}
                            {rec.effective_to
                              ? ` — ${new Date(rec.effective_to).toLocaleDateString(locale)}`
                              : ` — ${t('present')}`}
                          </p>
                          {rec.bonus_day_multiplier && rec.compensation_type === 'salaried' && (
                            <p className="mt-0.5 text-xs text-text-tertiary">
                              {t('bonusDayMultiplier')}: {rec.bonus_day_multiplier}x
                            </p>
                          )}
                          {rec.bonus_class_rate != null &&
                            rec.compensation_type === 'per_class' && (
                              <p className="mt-0.5 text-xs text-text-tertiary">
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
            onOpenChange={(open) => {
              setFormOpen(open);
              if (!open) setEditRecord(null);
            }}
            record={editRecord}
            onSuccess={handleSuccess}
          />

          <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} onSuccess={handleSuccess} />
        </>
      )}

      {/* ─── Allowances tab ─── */}
      {activeTab === 'allowances' && (
        <>
          {allowanceForm && (
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">{t('addAllowance')}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('staffName')}</Label>
                  <Select
                    value={newAllowance.staff_profile_id}
                    onValueChange={(v) =>
                      setNewAllowance((prev) => ({ ...prev, staff_profile_id: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectStaff')} />
                    </SelectTrigger>
                    <SelectContent>
                      {staffOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('allowanceType')}</Label>
                  <Select
                    value={newAllowance.allowance_type_id}
                    onValueChange={(v) =>
                      setNewAllowance((prev) => ({ ...prev, allowance_type_id: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectAllowanceType')} />
                    </SelectTrigger>
                    <SelectContent>
                      {allowanceTypes.map((at) => (
                        <SelectItem key={at.id} value={at.id}>
                          {at.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('amount')}</Label>
                  <Input
                    type="number"
                    value={newAllowance.amount}
                    onChange={(e) =>
                      setNewAllowance((prev) => ({ ...prev, amount: e.target.value }))
                    }
                    min={0}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('effectiveFrom')}</Label>
                  <Input
                    type="date"
                    value={newAllowance.effective_from}
                    onChange={(e) =>
                      setNewAllowance((prev) => ({ ...prev, effective_from: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAllowanceForm(false)}>
                  {t('cancel')}
                </Button>
                <Button onClick={handleAddAllowance}>{t('save')}</Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto">
              {allowances.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-tertiary">{t('noData')}</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                        {t('staffName')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                        {t('allowanceType')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                        {t('amount')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                        {t('effectiveFrom')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                        {t('effectiveTo')}
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allowances.map((a) => (
                      <tr key={a.id} className="hover:bg-surface-secondary">
                        <td className="px-4 py-3 font-medium text-text-primary">{a.staff_name}</td>
                        <td className="px-4 py-3 text-text-secondary">{a.allowance_name}</td>
                        <td className="px-4 py-3 text-end text-text-primary">
                          {formatCurrency(a.amount)}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {new Date(a.effective_from).toLocaleDateString(locale)}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {a.effective_to
                            ? new Date(a.effective_to).toLocaleDateString(locale)
                            : t('present')}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAllowance(a.id)}
                            className="text-danger-600 hover:text-danger-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* ─── Deductions tab ─── */}
      {activeTab === 'deductions' && (
        <>
          {deductionForm && (
            <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
              <h3 className="text-sm font-semibold text-text-primary">{t('addDeduction')}</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('staffName')}</Label>
                  <Select
                    value={newDeduction.staff_profile_id}
                    onValueChange={(v) =>
                      setNewDeduction((prev) => ({ ...prev, staff_profile_id: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('selectStaff')} />
                    </SelectTrigger>
                    <SelectContent>
                      {staffOptions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('description')}</Label>
                  <Input
                    value={newDeduction.description}
                    onChange={(e) =>
                      setNewDeduction((prev) => ({ ...prev, description: e.target.value }))
                    }
                    placeholder={t('deductionDescPlaceholder')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('totalAmount')}</Label>
                  <Input
                    type="number"
                    value={newDeduction.total_amount}
                    onChange={(e) =>
                      setNewDeduction((prev) => ({ ...prev, total_amount: e.target.value }))
                    }
                    min={0}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('monthlyAmount')}</Label>
                  <Input
                    type="number"
                    value={newDeduction.monthly_amount}
                    onChange={(e) =>
                      setNewDeduction((prev) => ({ ...prev, monthly_amount: e.target.value }))
                    }
                    min={0}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">{t('startDate')}</Label>
                  <Input
                    type="date"
                    value={newDeduction.start_date}
                    onChange={(e) =>
                      setNewDeduction((prev) => ({ ...prev, start_date: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDeductionForm(false)}>
                  {t('cancel')}
                </Button>
                <Button onClick={handleAddDeduction}>{t('save')}</Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto">
              {deductions.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-tertiary">{t('noData')}</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                        {t('staffName')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                        {t('description')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                        {t('totalAmount')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                        {t('monthlyAmount')}
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-medium text-text-secondary">
                        {t('remaining')}
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                        {t('status')}
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {deductions.map((d) => (
                      <tr key={d.id} className="hover:bg-surface-secondary">
                        <td className="px-4 py-3 font-medium text-text-primary">{d.staff_name}</td>
                        <td className="px-4 py-3 text-text-secondary">{d.description}</td>
                        <td className="px-4 py-3 text-end text-text-primary">
                          {formatCurrency(d.total_amount)}
                        </td>
                        <td className="px-4 py-3 text-end text-text-secondary">
                          {formatCurrency(d.monthly_amount)}/mo
                        </td>
                        <td className="px-4 py-3 text-end text-text-primary">
                          {formatCurrency(d.remaining_amount)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              d.active
                                ? 'bg-success-100 text-success-text'
                                : 'bg-neutral-100 text-text-tertiary'
                            }`}
                          >
                            {d.active ? t('active') : t('inactive')}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {d.active && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeactivateDeduction(d.id)}
                              className="text-text-secondary"
                            >
                              {t('deactivate')}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
