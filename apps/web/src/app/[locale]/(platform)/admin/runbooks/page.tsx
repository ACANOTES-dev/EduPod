'use client';

import { BookOpenText, ExternalLink, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

interface Runbook {
  id: string;
  path: string;
  title: string;
  description: string | null;
  severity: string | null;
  components: string[];
  tags: string[];
  indexed_at: string;
}

export default function PlatformRunbooksPage() {
  const [runbooks, setRunbooks] = React.useState<Runbook[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadRunbooks = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<Runbook[]>('/api/v1/admin/runbooks');
      setRunbooks(result);
    } catch (err) {
      console.error('[PlatformRunbooksPage.loadRunbooks]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRunbooks();
  }, [loadRunbooks]);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Observability
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Runbooks</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Machine-readable runbooks indexed for incident evidence and operator lookup.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRunbooks()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {loading ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          Loading runbooks...
        </div>
      ) : (
        <section className="grid gap-3 lg:grid-cols-2">
          {runbooks.map((runbook) => (
            <article key={runbook.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start gap-3">
                <BookOpenText className="mt-1 h-5 w-5 shrink-0 text-primary-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-text-primary">{runbook.title}</h2>
                    {runbook.severity ? (
                      <span className="rounded-full bg-warning-bg px-2 py-1 text-xs font-semibold text-warning-text">
                        {runbook.severity}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-text-secondary">
                    {runbook.description ?? 'No description provided.'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...runbook.components, ...runbook.tags].slice(0, 8).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <a
                    href={`https://github.com/ACANOTES-dev/EduPod/blob/main/${runbook.path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-600 hover:text-primary-700"
                  >
                    Open source
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
