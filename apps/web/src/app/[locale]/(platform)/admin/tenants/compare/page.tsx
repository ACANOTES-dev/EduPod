'use client';

import { BarChart3, Check, RefreshCw } from 'lucide-react';
import * as React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface TenantOption {
  id: string;
  name: string;
}

interface TenantListResponse {
  data: TenantOption[];
}

interface TenantMetricsSnapshot {
  students_count: number;
  staff_count: number;
  parents_count: number;
  active_users_24h: number;
  active_users_7d: number;
  invoices_overdue: number;
  errors_24h: number;
  enabled_modules: string[];
}

interface TenantCompareResult {
  tenant_id: string;
  tenant_name: string;
  latest: TenantMetricsSnapshot | null;
  history: Array<{ snapshot_date: string; metrics: TenantMetricsSnapshot }>;
}

type MetricKey =
  | 'students_count'
  | 'staff_count'
  | 'active_users_24h'
  | 'active_users_7d'
  | 'errors_24h';

const metricOptions: Array<{ key: MetricKey; label: string }> = [
  { key: 'students_count', label: 'Students' },
  { key: 'staff_count', label: 'Staff' },
  { key: 'active_users_24h', label: 'Active Users 24h' },
  { key: 'active_users_7d', label: 'Active Users 7d' },
  { key: 'errors_24h', label: 'Errors 24h' },
];

const comparisonRows: Array<{ key: keyof TenantMetricsSnapshot; label: string }> = [
  { key: 'students_count', label: 'Students' },
  { key: 'staff_count', label: 'Staff' },
  { key: 'parents_count', label: 'Parents' },
  { key: 'active_users_24h', label: 'Active Users 24h' },
  { key: 'active_users_7d', label: 'Active Users 7d' },
  { key: 'invoices_overdue', label: 'Overdue Invoices' },
  { key: 'errors_24h', label: 'Errors 24h' },
  { key: 'enabled_modules', label: 'Modules Enabled' },
];

const chartColors = [
  'var(--primary-600)',
  'var(--info-text)',
  'var(--warning-text)',
  'var(--danger-text)',
  'var(--success-text)',
];

export default function TenantComparisonPage() {
  const [tenants, setTenants] = React.useState<TenantOption[]>([]);
  const [selectedTenantIds, setSelectedTenantIds] = React.useState<string[]>([]);
  const [days, setDays] = React.useState('30');
  const [metric, setMetric] = React.useState<MetricKey>('students_count');
  const [results, setResults] = React.useState<TenantCompareResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    apiClient<TenantListResponse>('/api/v1/admin/tenants?pageSize=100')
      .then((response) => {
        setTenants(response.data);
        setSelectedTenantIds(response.data.slice(0, 2).map((tenant) => tenant.id));
      })
      .catch((err: unknown) => {
        console.error('[TenantComparisonPage.loadTenants]', err);
        toast.error(getErrorMessage(err, 'Failed to load tenants.'));
      });
  }, []);

  const load = React.useCallback(async () => {
    if (selectedTenantIds.length < 2) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      const params = new URLSearchParams({
        tenant_ids: selectedTenantIds.join(','),
        days,
      });
      const response = await apiClient<TenantCompareResult[]>(
        `/api/v1/admin/tenants/metrics/compare?${params.toString()}`,
      );
      setResults(response);
    } catch (err: unknown) {
      console.error('[TenantComparisonPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load tenant comparison.'));
    } finally {
      setLoading(false);
    }
  }, [days, selectedTenantIds]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const chartData = React.useMemo(() => buildChartData(results, metric), [metric, results]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tenant Comparison"
        description="Side-by-side daily platform analytics across selected tenants."
        actions={
          <Button variant="outline" disabled={loading} onClick={() => void load()}>
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_160px]">
          <div>
            <p className="text-xs font-semibold uppercase text-text-tertiary">Tenants</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {tenants.map((tenant) => {
                const selected = selectedTenantIds.includes(tenant.id);
                const disabled = !selected && selectedTenantIds.length >= 10;
                return (
                  <button
                    key={tenant.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSelectedTenantIds((current) => toggle(current, tenant.id))}
                    className={`flex min-h-11 items-center justify-between gap-3 rounded-md border px-3 py-2 text-start text-sm transition-colors ${
                      selected
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-border bg-background text-text-secondary hover:text-text-primary'
                    } ${disabled ? 'opacity-50' : ''}`}
                  >
                    <span className="min-w-0 truncate">{tenant.name}</span>
                    {selected ? <Check className="h-4 w-4 shrink-0" /> : null}
                  </button>
                );
              })}
            </div>
            {selectedTenantIds.length < 2 ? (
              <p className="mt-3 text-sm text-warning-text">Select at least two tenants.</p>
            ) : null}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-text-tertiary">Range</p>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="mt-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="60">60 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-8 text-center">
          <BarChart3 className="mx-auto h-8 w-8 text-text-tertiary" />
          <p className="mt-3 text-sm text-text-secondary">
            Select tenants with collected analytics snapshots to compare.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[720px]">
              <thead className="bg-surface-secondary text-xs font-semibold uppercase text-text-tertiary">
                <tr>
                  <th className="px-4 py-3 text-start">Metric</th>
                  {results.map((result) => (
                    <th key={result.tenant_id} className="px-4 py-3 text-start">
                      {result.tenant_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisonRows.map((row) => (
                  <tr key={row.key}>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.label}</td>
                    {results.map((result) => (
                      <td key={result.tenant_id} className="px-4 py-3 text-sm text-text-secondary">
                        {formatMetric(result.latest, row.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">Trend Comparison</h3>
                <p className="mt-1 text-xs text-text-secondary">
                  Overlayed lines for the selected metric.
                </p>
              </div>
              <Select value={metric} onValueChange={(value) => setMetric(value as MetricKey)}>
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {metricOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
                  <YAxis tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
                  <Tooltip />
                  {results.map((result, index) => (
                    <Line
                      key={result.tenant_id}
                      type="monotone"
                      dataKey={result.tenant_name}
                      stroke={chartColors[index % chartColors.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function toggle(current: string[], tenantId: string): string[] {
  if (current.includes(tenantId)) {
    return current.filter((id) => id !== tenantId);
  }
  return [...current, tenantId];
}

function formatMetric(snapshot: TenantMetricsSnapshot | null, key: keyof TenantMetricsSnapshot) {
  if (!snapshot) return 'No snapshot';
  const value = snapshot[key];
  if (key === 'enabled_modules' && Array.isArray(value)) {
    return `${value.length}/20`;
  }
  return String(value);
}

function buildChartData(results: TenantCompareResult[], metric: MetricKey) {
  const byDate = new Map<string, Record<string, number | string>>();

  for (const result of results) {
    for (const point of result.history) {
      const row = byDate.get(point.snapshot_date) ?? { date: point.snapshot_date };
      row[result.tenant_name] = point.metrics[metric] ?? 0;
      byDate.set(point.snapshot_date, row);
    }
  }

  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
