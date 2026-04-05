'use client';

import { Activity, AlertTriangle, Building2, Users } from 'lucide-react';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Skeleton, StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

interface DashboardData {
  data: {
    tenants: {
      active: number;
      suspended: number;
      archived: number;
      total: number;
    };
    users: {
      total: number;
      active_memberships: number;
    };
  };
}

export default function PlatformDashboardPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [data, setData] = React.useState<DashboardData['data'] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchDashboard() {
      try {
        setLoading(true);
        setError(null);
        const result = await apiClient<DashboardData>('/api/v1/admin/dashboard');
        if (!cancelled) {
          setData(result.data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const message =
            err && typeof err === 'object' && 'error' in err
              ? String(
                  (err as { error: { message?: string } }).error?.message ??
                    'Failed to load dashboard',
                )
              : 'Failed to load dashboard';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchDashboard();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader
        title="Platform Dashboard"
        description="Overview of all tenants and system health"
      />

      {error && (
        <div className="mt-6 rounded-xl border border-danger-fill bg-danger-fill/10 px-4 py-3 text-sm text-danger-text">
          {error}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          <>
            <Skeleton className="h-[100px] rounded-2xl" />
            <Skeleton className="h-[100px] rounded-2xl" />
            <Skeleton className="h-[100px] rounded-2xl" />
            <Skeleton className="h-[100px] rounded-2xl" />
          </>
        ) : data ? (
          <>
            <StatCard
              label="Active Tenants"
              value={data.tenants?.active ?? 0}
              className="relative"
            />
            <StatCard label="Total Users" value={data.users?.total ?? 0} />
            <StatCard label="Suspended Tenants" value={data.tenants?.suspended ?? 0} />
            <StatCard label="Total Tenants" value={data.tenants?.total ?? 0} />
          </>
        ) : null}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-text-primary">Quick Actions</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <QuickActionCard
              icon={Building2}
              title="Manage Tenants"
              description="Create, suspend, or configure school tenants"
              href={`/${locale}/admin/tenants`}
            />
            <QuickActionCard
              icon={Users}
              title="View Users"
              description="Browse all platform users across tenants"
              href={`/${locale}/admin`}
            />
            <QuickActionCard
              icon={Activity}
              title="System Health"
              description="Check service status and diagnostics"
              href={`/${locale}/admin/health`}
            />
            <QuickActionCard
              icon={AlertTriangle}
              title="Audit Log"
              description="Review recent administrative actions"
              href={`/${locale}/admin/audit-log`}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text-primary">Recent Activity</h2>
          <div className="mt-4 flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-8 w-8 text-text-tertiary" />
            <p className="mt-2 text-sm text-text-tertiary">No recent activity</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  description,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded-xl border border-border p-4 transition-colors hover:bg-surface-secondary"
    >
      <div className="rounded-lg bg-primary-50 p-2">
        <Icon className="h-4 w-4 text-primary-700" />
      </div>
      <div>
        <p className="text-sm font-medium text-text-primary">{title}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{description}</p>
      </div>
    </a>
  );
}
