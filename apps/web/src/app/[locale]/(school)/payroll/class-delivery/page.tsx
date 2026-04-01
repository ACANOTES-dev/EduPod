'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type DeliveryStatus = 'delivered' | 'absent_covered' | 'absent_uncovered' | 'cancelled';

interface DeliveryRecord {
  id: string;
  delivery_date: string;
  period_name: string;
  subject_name: string;
  class_name: string;
  staff_profile_id: string;
  staff_name: string;
  status: DeliveryStatus;
  substitute_name?: string;
  notes?: string;
}

interface TeacherSummary {
  staff_profile_id: string;
  staff_name: string;
  prescribed: number;
  delivered: number;
  absent_covered: number;
  absent_uncovered: number;
  cancelled: number;
}

interface MonthlyComparisonPoint {
  period_label: string;
  prescribed: number;
  delivered: number;
}

interface StaffOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS: DeliveryStatus[] = [
  'delivered',
  'absent_covered',
  'absent_uncovered',
  'cancelled',
];

const STATUS_COLORS: Record<DeliveryStatus, string> = {
  delivered: 'bg-success-100 text-success-text',
  absent_covered: 'bg-warning-100 text-warning-text',
  absent_uncovered: 'bg-danger-100 text-danger-text',
  cancelled: 'bg-neutral-100 text-text-secondary',
};

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
}

export default function ClassDeliveryPage() {
  const t = useTranslations('payroll');

  const { from: defaultFrom, to: defaultTo } = currentMonthRange();
  const [dateFrom, setDateFrom] = React.useState(defaultFrom);
  const [dateTo, setDateTo] = React.useState(defaultTo);
  const [teacherFilter, setTeacherFilter] = React.useState<string>('all');
  const [staffOptions, setStaffOptions] = React.useState<StaffOption[]>([]);
  const [records, setRecords] = React.useState<DeliveryRecord[]>([]);
  const [summaries, setSummaries] = React.useState<TeacherSummary[]>([]);
  const [comparison, setComparison] = React.useState<MonthlyComparisonPoint[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isAutoPopulating, setIsAutoPopulating] = React.useState(false);

  const fetchData = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (teacherFilter !== 'all') params.set('staff_profile_id', teacherFilter);

      const [recordsRes, summariesRes, comparisonRes, staffRes] = await Promise.all([
        apiClient<{ data: DeliveryRecord[] }>(
          `/api/v1/payroll/class-delivery?${params.toString()}`,
        ),
        apiClient<{ data: TeacherSummary[] }>(
          `/api/v1/payroll/class-delivery/summary?${params.toString()}`,
        ),
        apiClient<{ data: MonthlyComparisonPoint[] }>('/api/v1/payroll/class-delivery/comparison'),
        apiClient<{ data: StaffOption[] }>('/api/v1/payroll/staff?pageSize=200'),
      ]);
      setRecords(recordsRes.data);
      setSummaries(summariesRes.data);
      setComparison(comparisonRes.data);
      setStaffOptions(staffRes.data);
    } catch (err) {
      console.error('[fetchData]', err);
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, teacherFilter]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleStatusChange = async (recordId: string, status: DeliveryStatus) => {
    try {
      await apiClient(`/api/v1/payroll/class-delivery/${recordId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setRecords((prev) => prev.map((r) => (r.id === recordId ? { ...r, status } : r)));
    } catch (err) {
      console.error('[handleStatusChange]', err);
    }
  };

  const handleAutoPopulate = async () => {
    setIsAutoPopulating(true);
    try {
      await apiClient('/api/v1/payroll/class-delivery/auto-populate', {
        method: 'POST',
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      void fetchData();
    } catch (err) {
      console.error('[handleAutoPopulate]', err);
    } finally {
      setIsAutoPopulating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('classDelivery')}
        actions={
          <Button onClick={handleAutoPopulate} disabled={isAutoPopulating} variant="outline">
            {isAutoPopulating ? t('populating') : t('autoPopulateFromSchedule')}
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">{t('from')}</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-text-secondary">{t('to')}</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <Select value={teacherFilter} onValueChange={setTeacherFilter}>
          <SelectTrigger className="w-full sm:w-52">
            <SelectValue placeholder={t('allTeachers')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allTeachers')}</SelectItem>
            {staffOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary cards per teacher */}
      {!isLoading && summaries.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => (
            <div
              key={s.staff_profile_id}
              className="rounded-2xl border border-border bg-surface p-4"
            >
              <p className="text-sm font-semibold text-text-primary">{s.staff_name}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-text-secondary">{t('prescribed')}</span>
                  <p className="text-base font-semibold text-text-primary">{s.prescribed}</p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('delivered')}</span>
                  <p className="text-base font-semibold text-success-600">{s.delivered}</p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('missed')}</span>
                  <p className="text-base font-semibold text-danger-600">
                    {s.absent_covered + s.absent_uncovered}
                  </p>
                </div>
                <div>
                  <span className="text-text-secondary">{t('cancelledLabel')}</span>
                  <p className="text-base font-semibold text-text-secondary">{s.cancelled}</p>
                </div>
              </div>
              {/* Mini progress bar */}
              {s.prescribed > 0 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                  <div
                    className="h-full rounded-full bg-success-500 transition-all"
                    style={{ width: `${Math.min(100, (s.delivered / s.prescribed) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Prescribed vs Actual bar chart */}
      {!isLoading && comparison.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-4 text-sm font-semibold text-text-primary">
            {t('prescribedVsDelivered')}
          </h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={comparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="period_label"
                tick={{ fontSize: 11 }}
                stroke="var(--color-text-tertiary)"
              />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-tertiary)" />
              <Tooltip />
              <Legend />
              <Bar
                dataKey="prescribed"
                name={t('prescribed')}
                fill="hsl(var(--color-primary) / 0.4)"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="delivered"
                name={t('delivered')}
                fill="hsl(var(--color-success))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Records table */}
      <div className="rounded-2xl border border-border bg-surface">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-sm text-text-tertiary">{t('noData')}</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {t('date')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {t('period')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {t('subject')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {t('class')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {t('teacher')}
                  </th>
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-secondary">
                    {t('deliveryStatus')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-surface-secondary">
                    <td className="px-4 py-3 text-text-primary">
                      {new Date(record.delivery_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{record.period_name}</td>
                    <td className="px-4 py-3 text-text-secondary">{record.subject_name}</td>
                    <td className="px-4 py-3 text-text-secondary">{record.class_name}</td>
                    <td className="px-4 py-3 text-text-secondary">{record.staff_name}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={record.status}
                        onValueChange={(v) => handleStatusChange(record.id, v as DeliveryStatus)}
                      >
                        <SelectTrigger
                          className={`h-7 w-40 text-xs ${STATUS_COLORS[record.status]}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s} className="text-xs">
                              {t(`delivery_${s}` as Parameters<typeof t>[0])}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
