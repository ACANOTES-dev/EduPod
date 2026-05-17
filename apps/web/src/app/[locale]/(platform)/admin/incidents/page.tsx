'use client';

import { AlertTriangle, Clock, ExternalLink, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type IncidentSeverity = 'warning' | 'critical';
type IncidentStatus = 'active' | 'monitoring' | 'resolved' | 'cancelled';

interface PlatformIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  started_at: string;
  resolved_at: string | null;
  auto_resolved: boolean;
  affected_tenants: string[];
  affected_components: string[];
  postmortem_generated_at: string | null;
}

interface IncidentResponse {
  data: PlatformIncident[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

export default function PlatformIncidentsPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [incidents, setIncidents] = React.useState<PlatformIncident[]>([]);
  const [status, setStatus] = React.useState<IncidentStatus | 'all'>('all');
  const [severity, setSeverity] = React.useState<IncidentSeverity | 'all'>('all');
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const loadIncidents = React.useCallback(
    async (nextPage = page) => {
      try {
        setLoading(true);
        const query = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(PAGE_SIZE),
        });
        if (status !== 'all') query.set('status', status);
        if (severity !== 'all') query.set('severity', severity);
        const result = await apiClient<IncidentResponse>(`/api/v1/admin/incidents?${query}`);
        setIncidents(result.data);
        setPage(result.meta.page);
        setTotal(result.meta.total);
      } catch (err: unknown) {
        console.error('[PlatformIncidentsPage.loadIncidents]', err);
        toast.error(getErrorMessage(err, 'Failed to load incidents.'));
      } finally {
        setLoading(false);
      }
    },
    [page, severity, status],
  );

  React.useEffect(() => {
    void loadIncidents(1);
  }, [loadIncidents]);

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title="Platform Incidents"
        description="Structured incident records created from critical alert logic, with operator-triggered postmortems."
      />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-4">
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as IncidentStatus | 'all')}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="monitoring">Monitoring</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={severity}
          onValueChange={(value) => setSeverity(value as IncidentSeverity | 'all')}
        >
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={() => void loadIncidents(1)}>
          <RefreshCw className="me-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border bg-surface-secondary px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          <span>Incident</span>
          <span>Status</span>
        </div>
        {loading ? (
          <div className="p-6 text-sm text-text-secondary">Loading incidents...</div>
        ) : incidents.length === 0 ? (
          <div className="p-6 text-sm text-text-secondary">No incidents match this filter.</div>
        ) : (
          <div className="divide-y divide-border">
            {incidents.map((incident) => (
              <Link
                key={incident.id}
                href={`/${locale}/admin/incidents/${incident.id}`}
                className="grid grid-cols-[1fr_auto] gap-3 px-4 py-4 transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning-text" />
                    <h2 className="truncate text-sm font-semibold text-text-primary">
                      {incident.title}
                    </h2>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-tertiary" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span>{formatDate(incident.started_at)}</span>
                    <span className="text-text-tertiary">/</span>
                    <span>{incident.affected_components.length || 0} components</span>
                    <span className="text-text-tertiary">/</span>
                    <span>{incident.affected_tenants.length || 0} tenants</span>
                    {incident.postmortem_generated_at ? (
                      <>
                        <span className="text-text-tertiary">/</span>
                        <span>postmortem drafted</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <SeverityBadge severity={incident.severity} />
                  <StatusBadge status={incident.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>
          Page {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={page <= 1}
            onClick={() => void loadIncidents(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={page * PAGE_SIZE >= total}
            onClick={() => void loadIncidents(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-1 text-xs font-semibold',
        severity === 'critical'
          ? 'bg-danger-bg text-danger-text'
          : 'bg-warning-bg text-warning-text',
      )}
    >
      {severity}
    </span>
  );
}

function StatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-1 text-xs font-semibold text-text-secondary">
      <Clock className="h-3 w-3" />
      {status}
    </span>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
