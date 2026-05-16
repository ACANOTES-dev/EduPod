'use client';

import { DatabaseZap, RefreshCw, Trash2 } from 'lucide-react';
import * as React from 'react';

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

type CacheType = 'permissions' | 'domains' | 'modules' | 'all';

interface CacheStat {
  cache_type: 'permissions' | 'domains' | 'modules' | 'platform_owner' | 'sessions';
  key_count: number;
}

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

interface TenantListResponse {
  data: TenantOption[];
}

const CACHE_CARDS: Array<{
  description: string;
  key: Exclude<CacheType, 'all'>;
  title: string;
}> = [
  {
    key: 'permissions',
    title: 'Permissions Cache',
    description: 'Membership permissions and owner-role fast paths.',
  },
  {
    key: 'domains',
    title: 'Domain Cache',
    description: 'Hostname to tenant resolution records.',
  },
  {
    key: 'modules',
    title: 'Module Cache',
    description: 'Per-tenant module gate state and worker invalidation.',
  },
];

export function CacheControlTab() {
  const [stats, setStats] = React.useState<CacheStat[]>([]);
  const [tenants, setTenants] = React.useState<TenantOption[]>([]);
  const [selectedTenantId, setSelectedTenantId] = React.useState<string>('');
  const [loading, setLoading] = React.useState(true);
  const [flushing, setFlushing] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [statsResult, tenantsResult] = await Promise.all([
        apiClient<CacheStat[]>('/api/v1/admin/cache/stats'),
        apiClient<TenantListResponse>('/api/v1/admin/tenants?page=1&pageSize=100'),
      ]);
      setStats(statsResult);
      setTenants(tenantsResult.data);
      setSelectedTenantId((current) => current || tenantsResult.data[0]?.id || '');
    } catch (err: unknown) {
      console.error('[CacheControlTab.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load cache statistics.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function flush(cacheType: CacheType, tenantId?: string) {
    const actionKey = `${cacheType}:${tenantId ?? 'global'}`;
    try {
      setFlushing(actionKey);
      const result = await apiClient<{ keys_deleted: number }>('/api/v1/admin/cache/flush', {
        method: 'POST',
        body: JSON.stringify({
          cache_type: cacheType,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        }),
      });
      toast.success(
        `Deleted ${result.keys_deleted} cache key${result.keys_deleted === 1 ? '' : 's'}.`,
      );
      await load();
    } catch (err: unknown) {
      console.error('[CacheControlTab.flush]', err);
      toast.error(getErrorMessage(err, 'Failed to flush cache.'));
    } finally {
      setFlushing(null);
    }
  }

  const statMap = new Map(stats.map((stat) => [stat.cache_type, stat.key_count]));

  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Cache control</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Counts are collected with Redis scan operations.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" variant="outline" onClick={() => void load()}>
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={flushing !== null}
            onClick={() => void flush('all')}
          >
            <Trash2 className="me-2 h-4 w-4" />
            Flush all caches
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {CACHE_CARDS.map((card) => (
          <div key={card.key} className="rounded-lg border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-text-primary">{card.title}</h3>
                <p className="mt-1 text-sm text-text-secondary">{card.description}</p>
              </div>
              <DatabaseZap className="h-5 w-5 shrink-0 text-text-tertiary" />
            </div>
            <div className="mt-4 text-3xl font-semibold text-text-primary">
              {loading ? '-' : (statMap.get(card.key) ?? 0)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-text-tertiary">keys</div>

            <div className="mt-4 grid gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={flushing !== null}
                onClick={() => void flush(card.key)}
              >
                Flush global
              </Button>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto]">
                <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!selectedTenantId || flushing !== null}
                  onClick={() => void flush(card.key, selectedTenantId)}
                >
                  Flush tenant
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SmallStat label="Platform owner keys" value={statMap.get('platform_owner') ?? 0} />
        <SmallStat label="Session keys" value={statMap.get('sessions') ?? 0} />
      </div>
    </section>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="text-xs uppercase tracking-wide text-text-tertiary">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-text-primary">{value}</div>
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
