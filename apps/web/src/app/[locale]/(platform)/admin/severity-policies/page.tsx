'use client';

import { Gauge, RefreshCw } from 'lucide-react';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';

interface SeverityPolicy {
  id: string;
  key: string;
  title: string;
  component: string | null;
  product_area: string | null;
  tenant_scope: string;
  severity: 'info' | 'warning' | 'critical';
  operator_guidance: string | null;
}

export default function PlatformSeverityPoliciesPage() {
  const [policies, setPolicies] = React.useState<SeverityPolicy[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadPolicies = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<SeverityPolicy[]>('/api/v1/admin/severity-policies');
      setPolicies(result);
    } catch (err) {
      console.error('[PlatformSeverityPoliciesPage.loadPolicies]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-tertiary">
            Observability
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">Severity policies</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            Operator-owned impact rules for distinguishing noisy degradation from user impact.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPolicies()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-text-primary hover:bg-surface-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        {loading ? (
          <div className="p-6 text-sm text-text-secondary">Loading policies...</div>
        ) : (
          <div className="divide-y divide-border">
            {policies.map((policy) => (
              <article key={policy.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Gauge className="h-4 w-4 text-text-tertiary" />
                    <h2 className="text-base font-semibold text-text-primary">{policy.title}</h2>
                    <SeverityPill severity={policy.severity} />
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    {policy.operator_guidance ?? 'No operator guidance provided.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {[policy.component, policy.product_area, policy.tenant_scope]
                    .filter(Boolean)
                    .map((value) => (
                      <span
                        key={value}
                        className="rounded-full bg-surface-secondary px-2 py-1 text-xs text-text-secondary"
                      >
                        {value}
                      </span>
                    ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SeverityPill({ severity }: { severity: SeverityPolicy['severity'] }) {
  const className =
    severity === 'critical'
      ? 'bg-danger-bg text-danger-text'
      : severity === 'warning'
        ? 'bg-warning-bg text-warning-text'
        : 'bg-info-bg text-info-text';
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${className}`}>{severity}</span>
  );
}
