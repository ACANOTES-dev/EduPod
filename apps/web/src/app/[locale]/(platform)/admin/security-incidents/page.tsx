'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@school/ui';
import { AlertTriangle, ExternalLink, Plus, Shield } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SecurityIncident {
  id: string;
  detected_at: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  incident_type: string;
  description: string;
  affected_tenants: string[];
  affected_data_subjects_count: number | null;
  data_categories_affected: string[];
  containment_actions: string | null;
  reported_to_controllers_at: string | null;
  reported_to_dpc_at: string | null;
  dpc_reference_number: string | null;
  root_cause: string | null;
  remediation: string | null;
  status: string;
  created_by_user_id: string;
  assigned_to_user_id: string | null;
  created_at: string;
  updated_at: string;
  _count?: { events: number };
}

interface IncidentsResponse {
  data: SecurityIncident[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const;
const STATUS_OPTIONS = [
  'detected',
  'investigating',
  'contained',
  'reported',
  'resolved',
  'closed',
] as const;

const INCIDENT_TYPE_OPTIONS = [
  'unauthorised_access',
  'data_breach',
  'ransomware',
  'phishing',
  'data_loss',
  'system_compromise',
  'insider_threat',
  'misconfiguration',
  'other',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getHoursRemaining(detectedAt: string): number {
  const hoursElapsed =
    (Date.now() - new Date(detectedAt).getTime()) / (1000 * 60 * 60);
  return Math.max(0, 72 - hoursElapsed);
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: SecurityIncident['severity'] }) {
  const map: Record<SecurityIncident['severity'], string> = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };
  return (
    <Badge className={`border text-xs font-semibold ${map[severity]}`}>
      {toTitleCase(severity)}
    </Badge>
  );
}

function StatusBadgeLocal({ status }: { status: string }) {
  const map: Record<string, string> = {
    detected: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    investigating: 'bg-blue-100 text-blue-800 border-blue-200',
    contained: 'bg-purple-100 text-purple-800 border-purple-200',
    reported: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    resolved: 'bg-green-100 text-green-800 border-green-200',
    closed: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  const cls = map[status] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <Badge className={`border text-xs font-medium ${cls}`}>
      {toTitleCase(status)}
    </Badge>
  );
}

function CountdownCell({ incident }: { incident: SecurityIncident }) {
  const isOpen =
    incident.status !== 'resolved' && incident.status !== 'closed';
  const isHighRisk =
    incident.severity === 'critical' || incident.severity === 'high';

  if (!isOpen || !isHighRisk) return <span className="text-text-tertiary">—</span>;

  const hoursLeft = getHoursRemaining(incident.detected_at);

  if (hoursLeft === 0) {
    return (
      <span className="flex items-center gap-1 text-xs font-bold text-red-600">
        <AlertTriangle className="h-3 w-3" />
        OVERDUE
      </span>
    );
  }

  const isUrgent = hoursLeft < 24;
  return (
    <span
      className={`text-xs font-semibold ${isUrgent ? 'text-orange-600' : 'text-text-secondary'}`}
    >
      {Math.floor(hoursLeft)}h left
    </span>
  );
}

// ─── Create Incident Dialog ───────────────────────────────────────────────────

interface CreateIncidentFormState {
  severity: string;
  incident_type: string;
  description: string;
}

function CreateIncidentDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [form, setForm] = React.useState<CreateIncidentFormState>({
    severity: '',
    incident_type: '',
    description: '',
  });

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.severity || !form.incident_type || !form.description.trim()) {
        toast.error('Please fill in all required fields');
        return;
      }
      setIsSubmitting(true);
      try {
        await apiClient('/api/v1/admin/security-incidents', {
          method: 'POST',
          body: JSON.stringify({
            severity: form.severity,
            incident_type: form.incident_type,
            description: form.description.trim(),
          }),
        });
        toast.success('Incident created');
        setOpen(false);
        setForm({ severity: '', incident_type: '', description: '' });
        onCreated();
      } catch (err: unknown) {
        const msg =
          err &&
          typeof err === 'object' &&
          'error' in err &&
          typeof (err as { error: { message?: string } }).error?.message === 'string'
            ? (err as { error: { message: string } }).error.message
            : 'Failed to create incident';
        toast.error(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, onCreated],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="me-2 h-4 w-4" />
          New Incident
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Security Incident</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="severity">Severity *</Label>
            <Select
              value={form.severity}
              onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}
            >
              <SelectTrigger id="severity">
                <SelectValue placeholder="Select severity" />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {toTitleCase(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="incident_type">Incident Type *</Label>
            <Select
              value={form.incident_type}
              onValueChange={(v) => setForm((f) => ({ ...f, incident_type: v }))}
            >
              <SelectTrigger id="incident_type">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {INCIDENT_TYPE_OPTIONS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {toTitleCase(t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe the incident..."
              rows={4}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create Incident'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SecurityIncidentsPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';

  const [data, setData] = React.useState<SecurityIncident[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = React.useState('');
  const [severityFilter, setSeverityFilter] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');

  const fetchIncidents = React.useCallback(
    async (p: number) => {
      setIsLoading(true);
      try {
        const qp = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
        if (statusFilter) qp.set('status', statusFilter);
        if (severityFilter) qp.set('severity', severityFilter);
        if (startDate) qp.set('start_date', startDate);
        if (endDate) qp.set('end_date', endDate);

        const res = await apiClient<IncidentsResponse>(
          `/api/v1/admin/security-incidents?${qp.toString()}`,
        );
        setData(res.data);
        setTotal(res.meta.total);
      } catch (err: unknown) {
        console.error('[SecurityIncidentsPage] fetch', err);
      } finally {
        setIsLoading(false);
      }
    },
    [statusFilter, severityFilter, startDate, endDate],
  );

  React.useEffect(() => {
    void fetchIncidents(page);
  }, [page, fetchIncidents]);

  // Reset page on filter change
  React.useEffect(() => {
    setPage(1);
  }, [statusFilter, severityFilter, startDate, endDate]);

  const hasFilters = statusFilter || severityFilter || startDate || endDate;

  const handleClearFilters = () => {
    setStatusFilter('');
    setSeverityFilter('');
    setStartDate('');
    setEndDate('');
  };

  const columns = [
    {
      key: 'severity',
      header: 'Severity',
      render: (row: SecurityIncident) => <SeverityBadge severity={row.severity} />,
    },
    {
      key: 'incident_type',
      header: 'Type',
      render: (row: SecurityIncident) => (
        <span className="text-sm text-text-primary">{toTitleCase(row.incident_type)}</span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (row: SecurityIncident) => (
        <span className="text-sm text-text-secondary">
          {row.description.length > 80
            ? `${row.description.slice(0, 80)}…`
            : row.description}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: SecurityIncident) => <StatusBadgeLocal status={row.status} />,
    },
    {
      key: 'countdown',
      header: '72h Window',
      render: (row: SecurityIncident) => <CountdownCell incident={row} />,
    },
    {
      key: 'detected_at',
      header: 'Detected',
      render: (row: SecurityIncident) => (
        <span className="whitespace-nowrap text-xs text-text-tertiary">
          {formatRelativeTime(row.detected_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: SecurityIncident) => (
        <Link
          href={`/${locale}/admin/security-incidents/${row.id}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
          onClick={(e) => e.stopPropagation()}
        >
          View
          <ExternalLink className="h-3 w-3" />
        </Link>
      ),
    },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-44">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {toTitleCase(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger>
            <SelectValue placeholder="All severities" />
          </SelectTrigger>
          <SelectContent>
            {SEVERITY_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {toTitleCase(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-40">
        <Input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Start date"
        />
      </div>

      <div className="w-40">
        <Input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          aria-label="End date"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={handleClearFilters}>
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security Incidents"
        description="GDPR breach detection and management"
        actions={
          <CreateIncidentDialog onCreated={() => void fetchIncidents(page)} />
        }
      />

      {total === 0 && !isLoading && !hasFilters && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Shield className="mb-3 h-10 w-10 text-text-tertiary" />
          <p className="text-sm font-medium text-text-primary">No security incidents</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Incidents will appear here when detected or reported
          </p>
        </div>
      )}

      {(isLoading || data.length > 0 || hasFilters) && (
        <DataTable
          columns={columns}
          data={data}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
          toolbar={toolbar}
        />
      )}
    </div>
  );
}
