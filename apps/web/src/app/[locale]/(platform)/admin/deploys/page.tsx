'use client';

import { ExternalLink, GitCommit, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

interface DeployEvent {
  id: string;
  sha: string;
  short_sha: string;
  deployed_at: string;
  deploy_run_url: string;
  status: 'in_progress' | 'succeeded' | 'failed' | 'rolled_back';
  duration_seconds: number | null;
  commit_message: string | null;
  failure_reason: string | null;
}

interface PaginatedDeploys {
  data: DeployEvent[];
  meta: { total: number };
}

export default function PlatformDeploysPage() {
  const [deploys, setDeploys] = React.useState<DeployEvent[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadDeploys = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<PaginatedDeploys>('/api/v1/admin/deploys?pageSize=50');
      setDeploys(result.data);
    } catch (err) {
      console.error('[PlatformDeploysPage.loadDeploys]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDeploys();
  }, [loadDeploys]);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Observability
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Deploy log</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Recent CI deployments captured after production smoke.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDeploys()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        {loading ? (
          <div className="p-6 text-sm text-text-secondary">Loading deploys...</div>
        ) : deploys.length === 0 ? (
          <div className="p-6 text-sm text-text-secondary">
            No deploy events captured yet. The next CI deploy will populate this page.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {deploys.map((deploy) => (
              <article key={deploy.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <GitCommit className="h-4 w-4 text-text-tertiary" />
                    <span className="font-mono text-sm text-text-primary">{deploy.short_sha}</span>
                    <StatusPill status={deploy.status} />
                    {deploy.duration_seconds !== null ? (
                      <span className="text-xs text-text-tertiary">{deploy.duration_seconds}s</span>
                    ) : null}
                  </div>
                  <p className="mt-2 truncate text-sm font-medium text-text-primary">
                    {deploy.commit_message ?? 'No commit message captured'}
                  </p>
                  {deploy.failure_reason ? (
                    <p className="mt-1 text-sm text-danger-text">{deploy.failure_reason}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-text-tertiary">
                    {new Date(deploy.deployed_at).toLocaleString()}
                  </p>
                </div>
                <a
                  href={deploy.deploy_run_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  Workflow
                  <ExternalLink className="h-4 w-4" />
                </a>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function StatusPill({ status }: { status: DeployEvent['status'] }) {
  const className =
    status === 'succeeded'
      ? 'bg-success-bg text-success-text'
      : status === 'failed'
        ? 'bg-danger-bg text-danger-text'
        : status === 'rolled_back'
          ? 'bg-warning-bg text-warning-text'
          : 'bg-info-bg text-info-text';
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${className}`}>{status}</span>
  );
}
