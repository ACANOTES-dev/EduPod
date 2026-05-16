'use client';

import { BarChart3, RefreshCw } from 'lucide-react';
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

import { MODULE_REGISTRY, type ModuleCategory, type ModuleKey } from '@school/shared/modules';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface AnalyticsTabProps {
  tenantId: string;
}

interface TenantMetricsSnapshot {
  students_count: number;
  staff_count: number;
  parents_count: number;
  active_users_24h: number;
  active_users_7d: number;
  invoices_total: number;
  invoices_overdue: number;
  attendance_rate_avg: number;
  api_requests_24h: number;
  errors_24h: number;
  storage_mb: number;
  enabled_modules: ModuleKey[];
  disabled_modules: ModuleKey[];
  last_login_at: string | null;
}

interface TenantMetricsResponse {
  latest: TenantMetricsSnapshot | null;
  history: Array<{ snapshot_date: string; metrics: TenantMetricsSnapshot }>;
}

type MetricKey =
  | 'students_count'
  | 'staff_count'
  | 'parents_count'
  | 'active_users_24h'
  | 'active_users_7d'
  | 'invoices_overdue'
  | 'errors_24h'
  | 'attendance_rate_avg';

const metricOptions: Array<{ key: MetricKey; label: string }> = [
  { key: 'students_count', label: 'Students' },
  { key: 'staff_count', label: 'Staff' },
  { key: 'parents_count', label: 'Parents' },
  { key: 'active_users_24h', label: 'Active Users 24h' },
  { key: 'active_users_7d', label: 'Active Users 7d' },
  { key: 'invoices_overdue', label: 'Overdue Invoices' },
  { key: 'errors_24h', label: 'Errors 24h' },
  { key: 'attendance_rate_avg', label: 'Attendance Rate' },
];

const categoryLabels: Record<ModuleCategory, string> = {
  academic: 'Academic',
  finance_ops: 'Finance/Ops',
  people_care: 'People Care',
  communications: 'Communications',
  operations: 'Operations',
  compliance: 'Compliance',
};

export function AnalyticsTab({ tenantId }: AnalyticsTabProps) {
  const [data, setData] = React.useState<TenantMetricsResponse | null>(null);
  const [days, setDays] = React.useState('30');
  const [metric, setMetric] = React.useState<MetricKey>('students_count');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient<TenantMetricsResponse>(
        `/api/v1/admin/tenants/${tenantId}/metrics?days=${days}`,
      );
      setData(response);
    } catch (err: unknown) {
      console.error('[AnalyticsTab.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load tenant analytics.'));
    } finally {
      setLoading(false);
    }
  }, [days, tenantId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const history = React.useMemo(() => {
    return [...(data?.history ?? [])]
      .reverse()
      .map((point) => ({ date: point.snapshot_date, ...point.metrics }));
  }, [data?.history]);
  const latest = data?.latest ?? null;

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
        Loading tenant analytics...
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="rounded-lg border border-border bg-surface p-8 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-text-tertiary" />
        <p className="mt-3 text-sm font-medium text-text-primary">No analytics snapshot yet</p>
        <p className="mt-1 text-sm text-text-secondary">
          Metrics will appear after the daily collection run.
        </p>
        <Button className="mt-4" variant="outline" onClick={() => void load()}>
          <RefreshCw className="me-2 h-4 w-4" />
          Check again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Tenant Analytics</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Daily platform snapshots for usage, billing, modules, and diagnostics.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-full sm:w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
              <SelectItem value="60">60 days</SelectItem>
              <SelectItem value="90">90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Students" value={latest.students_count} />
        <MetricCard label="Staff" value={latest.staff_count} />
        <MetricCard label="Parents" value={latest.parents_count} />
        <MetricCard label="Active Users 24h" value={latest.active_users_24h} />
        <MetricCard label="Active Users 7d" value={latest.active_users_7d} />
        <MetricCard
          label="Overdue Invoices"
          value={latest.invoices_overdue}
          tone={latest.invoices_overdue > 0 ? 'danger' : 'default'}
        />
        <MetricCard
          label="Errors 24h"
          value={latest.errors_24h}
          tone={latest.errors_24h > 0 ? 'danger' : 'default'}
        />
        <MetricCard label="Attendance" value={`${latest.attendance_rate_avg}%`} />
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Trend</h4>
            <p className="mt-1 text-xs text-text-secondary">Daily history from stored snapshots.</p>
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
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
              <YAxis tick={{ fontSize: 12 }} stroke="var(--text-tertiary)" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey={metric}
                stroke="var(--primary-600)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ModuleCoverage latest={latest} />
    </div>
  );
}

function MetricCard({
  label,
  tone = 'default',
  value,
}: {
  label: string;
  tone?: 'default' | 'danger';
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase text-text-tertiary">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold ${
          tone === 'danger' ? 'text-danger-text' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ModuleCoverage({ latest }: { latest: TenantMetricsSnapshot }) {
  const enabled = new Set(latest.enabled_modules);
  const coverage = Math.round((latest.enabled_modules.length / MODULE_REGISTRY.length) * 100);
  const grouped = MODULE_REGISTRY.reduce((acc, moduleDefinition) => {
    const modules = acc.get(moduleDefinition.category) ?? [];
    modules.push(moduleDefinition);
    acc.set(moduleDefinition.category, modules);
    return acc;
  }, new Map<ModuleCategory, Array<(typeof MODULE_REGISTRY)[number]>>());

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-text-primary">Module Coverage</h4>
          <p className="mt-1 text-xs text-text-secondary">
            {latest.enabled_modules.length} of {MODULE_REGISTRY.length} gateable modules enabled.
          </p>
        </div>
        <span className="text-sm font-semibold text-text-primary">{coverage}%</span>
      </div>
      <progress
        className="mt-4 h-2 w-full overflow-hidden rounded-full"
        value={coverage}
        max={100}
      />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {[...grouped.entries()].map(([category, modules]) => (
          <div key={category}>
            <p className="text-xs font-semibold uppercase text-text-tertiary">
              {categoryLabels[category]}
            </p>
            <div className="mt-2 space-y-2">
              {modules.map((moduleDefinition) => {
                const isEnabled = enabled.has(moduleDefinition.key);
                return (
                  <div
                    key={moduleDefinition.key}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-sm text-text-primary">
                      {moduleDefinition.display_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                        isEnabled
                          ? 'bg-success-bg text-success-text'
                          : 'bg-surface-secondary text-text-secondary'
                      }`}
                    >
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
