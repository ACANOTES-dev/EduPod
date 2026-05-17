'use client';

import { RefreshCw, Route } from 'lucide-react';
import * as React from 'react';

import { cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { getErrorMessage } from '../synthetic-checks/_components/status-badge';

interface ExternalDependency {
  id: string;
  provider_key: string;
  display_name: string;
  source: string;
  status: string;
  status_detail: string | null;
  upstream_url: string | null;
  last_checked_at: string;
  last_status_changed_at: string | null;
}

export default function PlatformExternalDependenciesPage() {
  const [dependencies, setDependencies] = React.useState<ExternalDependency[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadDependencies = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<ExternalDependency[]>('/api/v1/admin/external-dependencies');
      setDependencies(result);
    } catch (err: unknown) {
      console.error('[PlatformExternalDependenciesPage.loadDependencies]', err);
      toast.error(getErrorMessage(err, 'Failed to load external dependencies.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDependencies();
  }, [loadDependencies]);

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="External Dependencies"
          description="Current upstream status from synthetic dependency checks."
        />
        <button
          type="button"
          onClick={() => void loadDependencies()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
            Loading dependencies...
          </div>
        ) : dependencies.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
            No dependency status rows recorded.
          </div>
        ) : (
          dependencies.map((dependency) => (
            <article key={dependency.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <Route className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-text-primary">
                      {dependency.display_name}
                    </h2>
                    <DependencyBadge status={dependency.status} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-text-tertiary">
                    {dependency.provider_key}
                  </p>
                  <p className="mt-3 text-sm text-text-secondary">
                    {dependency.status_detail ?? dependency.source}
                  </p>
                  <p className="mt-3 text-xs text-text-tertiary">
                    Checked {new Date(dependency.last_checked_at).toLocaleString()}
                  </p>
                  {dependency.upstream_url ? (
                    <a
                      href={dependency.upstream_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block truncate text-xs font-semibold text-primary-700 hover:text-primary-800"
                    >
                      {dependency.upstream_url}
                    </a>
                  ) : null}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function DependencyBadge({ status }: { status: string }) {
  const healthy = status === 'operational';
  const unknown = status === 'unknown';
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
        healthy && 'bg-success-bg text-success-text',
        unknown && 'bg-warning-bg text-warning-text',
        !healthy && !unknown && 'bg-danger-bg text-danger-text',
      )}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
