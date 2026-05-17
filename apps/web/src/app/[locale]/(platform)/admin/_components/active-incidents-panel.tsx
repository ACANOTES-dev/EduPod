'use client';

import { AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { cn } from '@school/ui';

import { apiClient } from '@/lib/api-client';

interface IncidentSummary {
  id: string;
  title: string;
  severity: 'warning' | 'critical';
  status: 'active' | 'monitoring' | 'resolved' | 'cancelled';
  started_at: string;
}

interface IncidentResponse {
  data: IncidentSummary[];
  meta: { total: number };
}

export function ActiveIncidentsPanel() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [incidents, setIncidents] = React.useState<IncidentSummary[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    async function loadIncidents() {
      try {
        const [active, monitoring] = await Promise.all([
          apiClient<IncidentResponse>('/api/v1/admin/incidents?pageSize=3&status=active'),
          apiClient<IncidentResponse>('/api/v1/admin/incidents?pageSize=3&status=monitoring'),
        ]);
        if (!cancelled) {
          setIncidents([...active.data, ...monitoring.data].slice(0, 4));
        }
      } catch (err: unknown) {
        console.error('[ActiveIncidentsPanel.loadIncidents]', err);
      }
    }

    void loadIncidents();
    const interval = setInterval(() => void loadIncidents(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Active Incidents</h2>
          <p className="text-xs text-text-secondary">Critical-alert incident tracking.</p>
        </div>
        <Link
          href={`/${locale}/admin/incidents`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700"
        >
          View all
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
      {incidents.length === 0 ? (
        <p className="text-sm text-text-secondary">No active or monitoring incidents.</p>
      ) : (
        <div className="space-y-2">
          {incidents.map((incident) => (
            <Link
              key={incident.id}
              href={`/${locale}/admin/incidents/${incident.id}`}
              className="block rounded-lg border border-border p-3 transition-colors hover:bg-surface-hover"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    incident.severity === 'critical' ? 'text-danger-text' : 'text-warning-text',
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-primary">
                    {incident.title}
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {incident.status} / {new Date(incident.started_at).toLocaleString('en')}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
