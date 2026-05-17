'use client';

import { Network, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

interface TopologyNode {
  id: string;
  key: string;
  kind: string;
  display_name: string;
  description: string | null;
  depends_on_keys: string[];
  affects_product_areas: string[];
  suspected_repo_areas: string[];
  related_queue_names: string[];
  related_module_keys: string[];
  related_components: string[];
}

export default function PlatformServiceTopologyPage() {
  const [nodes, setNodes] = React.useState<TopologyNode[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadNodes = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<TopologyNode[]>('/api/v1/admin/service-topology');
      setNodes(result);
    } catch (err) {
      console.error('[PlatformServiceTopologyPage.loadNodes]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadNodes();
  }, [loadNodes]);

  const grouped = React.useMemo(() => {
    const groups = new Map<string, TopologyNode[]>();
    for (const node of nodes) {
      groups.set(node.kind, [...(groups.get(node.kind) ?? []), node]);
    }
    return [...groups.entries()];
  }, [nodes]);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Observability
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Service topology</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Operator-owned dependency map for services, queues, modules, and product impact.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadNodes()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {loading ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-sm text-text-secondary">
          Loading topology...
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([kind, items]) => (
            <section key={kind} className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                {kind}
              </h2>
              <div className="grid gap-3 lg:grid-cols-2">
                {items.map((node) => (
                  <article key={node.id} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex gap-3">
                      <Network className="mt-1 h-5 w-5 shrink-0 text-primary-600" />
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-text-primary">
                          {node.display_name}
                        </h3>
                        <p className="mt-1 text-sm text-text-secondary">
                          {node.description ?? node.key}
                        </p>
                        <ChipRow label="Affects" values={node.affects_product_areas} />
                        <ChipRow label="Depends on" values={node.depends_on_keys} />
                        <ChipRow label="Repo hints" values={node.suspected_repo_areas} />
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-text-tertiary">{label}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {values.slice(0, 8).map((value) => (
          <span
            key={value}
            className="rounded-full bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
