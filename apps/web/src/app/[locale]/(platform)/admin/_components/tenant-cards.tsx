'use client';

import { ArrowRight, Building2, Plus, UsersRound } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { cn } from '@school/ui';

import { apiClient } from '@/lib/api-client';

type TenantStatus = 'active' | 'suspended' | 'archived';
type BillingStatus = 'active' | 'past_due' | 'cancelled';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  billing_status?: BillingStatus;
  default_locale: string;
  created_at: string;
  onboarding: {
    total: number;
    completed: number;
    percent_complete: number;
  } | null;
}

interface TenantListResponse {
  data: Tenant[];
  meta: { page: number; pageSize: number; total: number };
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
  enabled_modules: string[];
  disabled_modules: string[];
  last_login_at: string | null;
}

interface TenantMetricsResponse {
  latest: TenantMetricsSnapshot | null;
  history: Array<{ snapshot_date: string; metrics: TenantMetricsSnapshot }>;
}

interface TenantCardRecord {
  tenant: Tenant;
  metrics: TenantMetricsSnapshot | null;
  metricsUnavailable: boolean;
}

interface TenantCardsProps {
  className?: string;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

function statusBadgeClass(status: TenantStatus): string {
  if (status === 'active') return 'bg-success-fill text-success-text';
  if (status === 'suspended') return 'bg-danger-fill text-danger-text';
  return 'bg-surface-secondary text-text-secondary';
}

function billingBadgeClass(status: BillingStatus): string {
  if (status === 'active') return 'bg-success-fill text-success-text';
  if (status === 'past_due') return 'bg-warning-fill text-warning-text';
  return 'bg-danger-fill text-danger-text';
}

function healthClass(metrics: TenantMetricsSnapshot | null): string {
  if (!metrics) return 'bg-text-tertiary';
  if (metrics.errors_24h > 5) return 'bg-danger-dot';
  if (metrics.errors_24h > 0 || metrics.invoices_overdue > 0) return 'bg-warning-dot';
  return 'bg-success-text';
}

function metricValue(value: number | null | undefined): string {
  return typeof value === 'number' ? value.toLocaleString() : 'N/A';
}

export function TenantCards({ className }: TenantCardsProps) {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [records, setRecords] = React.useState<TenantCardRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadTenants = React.useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tenantsResult = await apiClient<TenantListResponse>(
        '/api/v1/admin/tenants?pageSize=100',
        { silent: true },
      );
      const nextRecords = await Promise.all(
        tenantsResult.data.map(async (tenant): Promise<TenantCardRecord> => {
          try {
            const metrics = await apiClient<TenantMetricsResponse>(
              `/api/v1/admin/tenants/${tenant.id}/metrics?days=30`,
              { silent: true },
            );
            return {
              tenant,
              metrics: metrics.latest,
              metricsUnavailable: false,
            };
          } catch (err: unknown) {
            console.error('[TenantCards.loadMetrics]', err);
            return {
              tenant,
              metrics: null,
              metricsUnavailable: true,
            };
          }
        }),
      );

      setRecords(nextRecords);
    } catch (err: unknown) {
      console.error('[TenantCards.loadTenants]', err);
      setError(getErrorMessage(err, 'Tenant cards unavailable.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadTenants();
  }, [loadTenants]);

  return (
    <section className={cn('rounded-lg border border-border bg-surface p-5 shadow-sm', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <UsersRound className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Tenant Cards</h2>
          </div>
          <p className="mt-1 text-xs text-text-secondary">
            {error ?? `${records.length} tenant${records.length === 1 ? '' : 's'} loaded`}
          </p>
        </div>
        <button
          type="button"
          className="self-start rounded-pill border border-border bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-surface-secondary sm:self-auto"
          onClick={() => void loadTenants()}
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {loading && records.length === 0
          ? Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-56 animate-pulse rounded-lg border border-border bg-surface-secondary"
              />
            ))
          : null}

        {!loading && records.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface-secondary px-4 py-8 text-center text-sm text-text-secondary sm:col-span-2 2xl:col-span-3">
            No tenants found.
          </div>
        ) : null}

        {records.map(({ metrics, metricsUnavailable, tenant }) => (
          <Link
            key={tenant.id}
            href={`/${locale}/admin/tenants/${tenant.id}`}
            className="group relative flex min-h-56 min-w-0 flex-col rounded-lg border border-border bg-surface p-4 text-start transition-colors hover:border-border-strong hover:bg-surface-secondary"
          >
            <span
              className={cn('absolute end-4 top-4 h-2.5 w-2.5 rounded-full', healthClass(metrics))}
              aria-label={`${tenant.name} health indicator`}
              role="status"
            />
            <div className="flex min-w-0 items-start gap-3 pe-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold text-text-primary">{tenant.name}</h3>
                <p className="mt-1 truncate font-mono text-xs text-text-secondary" dir="ltr">
                  {tenant.slug}.edupod.app
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
                  statusBadgeClass(tenant.status),
                )}
              >
                {tenant.status}
              </span>
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
                  billingBadgeClass(tenant.billing_status ?? 'active'),
                )}
              >
                Billing {(tenant.billing_status ?? 'active').replace('_', ' ')}
              </span>
            </div>

            {tenant.onboarding ? (
              <div className="mt-4">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-text-primary">Onboarding</span>
                  <span className="text-text-secondary">
                    {tenant.onboarding.completed}/{tenant.onboarding.total}
                  </span>
                </div>
                <progress
                  aria-label={`${tenant.name} onboarding progress`}
                  className="mt-2 block h-2 w-full overflow-hidden rounded-pill bg-surface-secondary accent-primary-700 [&::-moz-progress-bar]:bg-primary-700 [&::-webkit-progress-bar]:bg-surface-secondary [&::-webkit-progress-value]:bg-primary-700"
                  max={100}
                  value={tenant.onboarding.percent_complete}
                />
              </div>
            ) : (
              <p className="mt-4 text-xs text-text-tertiary">Onboarding tracker unavailable</p>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <MetricPill label="Students" value={metricValue(metrics?.students_count)} />
              <MetricPill label="Staff" value={metricValue(metrics?.staff_count)} />
              <MetricPill label="Active" value={metricValue(metrics?.active_users_24h)} />
            </div>

            {metricsUnavailable ? (
              <p className="mt-3 text-xs text-text-tertiary">Metrics snapshot unavailable</p>
            ) : null}

            <div className="mt-auto flex items-center justify-between pt-4 text-xs font-semibold text-primary-700">
              <span>Open tenant</span>
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </div>
          </Link>
        ))}

        <Link
          href={`/${locale}/admin/tenants/new`}
          className="flex min-h-56 min-w-0 flex-col items-center justify-center rounded-lg border border-dashed border-border-strong bg-surface p-4 text-center transition-colors hover:bg-surface-secondary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            <Plus className="h-5 w-5" />
          </span>
          <p className="mt-3 text-sm font-semibold text-text-primary">New Tenant</p>
          <p className="mt-1 text-xs text-text-secondary">Create the next school workspace</p>
        </Link>
      </div>
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface-secondary px-3 py-2">
      <p className="truncate text-[11px] font-medium text-text-tertiary">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-semibold text-text-primary">{value}</p>
    </div>
  );
}
