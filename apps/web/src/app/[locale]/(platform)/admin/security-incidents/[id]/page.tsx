'use client';

import { AlertTriangle, ArrowLeft, Bell, CheckCircle, Clock, FileText, User } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import {
  SECURITY_INCIDENT_EVENT_TYPES,
  SECURITY_INCIDENT_STATUS_TRANSITIONS,
} from '@school/shared';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Textarea,
  toast,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncidentEvent {
  id: string;
  event_type: string;
  description: string;
  created_by_user_id: string;
  created_at: string;
  created_by?: { id: string; first_name: string; last_name: string };
}

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
  created_by?: { id: string; first_name: string; last_name: string };
  assigned_to?: { id: string; first_name: string; last_name: string } | null;
  events?: IncidentEvent[];
  _count?: { events: number };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_TRANSITIONS = SECURITY_INCIDENT_STATUS_TRANSITIONS;
const EVENT_TYPE_OPTIONS = SECURITY_INCIDENT_EVENT_TYPES;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  return str
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function getHoursRemaining(detectedAt: string): number {
  const hoursElapsed = (Date.now() - new Date(detectedAt).getTime()) / (1000 * 60 * 60);
  return Math.max(0, 72 - hoursElapsed);
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

// ─── Badge helpers ────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: SecurityIncident['severity'] }) {
  const map: Record<SecurityIncident['severity'], string> = {
    critical: 'bg-red-100 text-red-800 border-red-200',
    high: 'bg-orange-100 text-orange-800 border-orange-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };
  return (
    <Badge className={`border text-sm font-semibold ${map[severity]}`}>
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
  return <Badge className={`border text-sm font-medium ${cls}`}>{toTitleCase(status)}</Badge>;
}

// ─── 72-hour countdown ────────────────────────────────────────────────────────

function CountdownBanner({ incident }: { incident: SecurityIncident }) {
  const isOpen = incident.status !== 'resolved' && incident.status !== 'closed';
  const isHighRisk = incident.severity === 'critical' || incident.severity === 'high';

  if (!isOpen || !isHighRisk) return null;

  const hoursLeft = getHoursRemaining(incident.detected_at);
  const isOverdue = hoursLeft === 0;
  const isUrgent = hoursLeft < 24 && !isOverdue;

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${
        isOverdue
          ? 'border-red-200 bg-red-50 text-red-800'
          : isUrgent
            ? 'border-orange-200 bg-orange-50 text-orange-800'
            : 'border-yellow-200 bg-yellow-50 text-yellow-800'
      }`}
    >
      {isOverdue ? (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      ) : (
        <Clock className="h-4 w-4 shrink-0" />
      )}
      {isOverdue
        ? 'GDPR 72-hour notification window has passed — DPC must be notified immediately if not already done'
        : `${Math.floor(hoursLeft)} hours remaining in the 72-hour GDPR notification window`}
    </div>
  );
}

// ─── Info row helper ──────────────────────────────────────────────────────────

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[180px_1fr]">
      <span className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <span className="text-sm text-text-primary">{children}</span>
    </div>
  );
}

// ─── Notify Controllers Dialog ────────────────────────────────────────────────

function NotifyControllersDialog({
  incidentId,
  affectedTenants,
  onNotified,
}: {
  incidentId: string;
  affectedTenants: string[];
  onNotified: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim()) {
        toast.error('Please enter a notification message');
        return;
      }
      setIsSubmitting(true);
      try {
        await apiClient(`/api/v1/admin/security-incidents/${incidentId}/notify-controllers`, {
          method: 'POST',
          body: JSON.stringify({ tenant_ids: affectedTenants, message: message.trim() }),
        });
        toast.success('Controllers notified');
        setOpen(false);
        setMessage('');
        onNotified();
      } catch (err: unknown) {
        const msg =
          err &&
          typeof err === 'object' &&
          'error' in err &&
          typeof (err as { error: { message?: string } }).error?.message === 'string'
            ? (err as { error: { message: string } }).error.message
            : 'Failed to notify controllers';
        toast.error(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [affectedTenants, incidentId, message, onNotified],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Bell className="me-2 h-4 w-4" />
        Notify Controllers
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notify Data Controllers</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="notify-message">Notification Message *</Label>
            <Textarea
              id="notify-message"
              placeholder="Describe the breach and its impact to all affected tenant controllers..."
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
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
              {isSubmitting ? 'Sending…' : 'Send Notification'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Record DPC Notification Dialog ──────────────────────────────────────────

function RecordDpcDialog({
  incidentId,
  onRecorded,
}: {
  incidentId: string;
  onRecorded: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [referenceNumber, setReferenceNumber] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsSubmitting(true);
      try {
        await apiClient(`/api/v1/admin/security-incidents/${incidentId}/notify-dpc`, {
          method: 'POST',
          body: JSON.stringify({
            dpc_reference_number: referenceNumber.trim() || null,
          }),
        });
        toast.success('DPC notification recorded');
        setOpen(false);
        setReferenceNumber('');
        onRecorded();
      } catch (err: unknown) {
        const msg =
          err &&
          typeof err === 'object' &&
          'error' in err &&
          typeof (err as { error: { message?: string } }).error?.message === 'string'
            ? (err as { error: { message: string } }).error.message
            : 'Failed to record DPC notification';
        toast.error(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [incidentId, referenceNumber, onRecorded],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileText className="me-2 h-4 w-4" />
        Record DPC Notification
      </Button>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record DPC Notification</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            void handleSubmit(e);
          }}
          className="space-y-4"
        >
          <p className="text-sm text-text-secondary">
            Record that this breach has been reported to the Data Protection Commission.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="dpc-ref">DPC Reference Number (optional)</Label>
            <Input
              id="dpc-ref"
              placeholder="e.g. DPC-2026-XXXXX"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
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
              {isSubmitting ? 'Recording…' : 'Record Notification'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Event Form ───────────────────────────────────────────────────────────

function AddEventForm({ incidentId, onAdded }: { incidentId: string; onAdded: () => void }) {
  const [eventType, setEventType] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = React.useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!eventType || !description.trim()) {
        toast.error('Please fill in event type and description');
        return;
      }
      setIsSubmitting(true);
      try {
        await apiClient(`/api/v1/admin/security-incidents/${incidentId}/events`, {
          method: 'POST',
          body: JSON.stringify({
            event_type: eventType,
            description: description.trim(),
          }),
        });
        toast.success('Event added');
        setEventType('');
        setDescription('');
        onAdded();
      } catch (err: unknown) {
        const msg =
          err &&
          typeof err === 'object' &&
          'error' in err &&
          typeof (err as { error: { message?: string } }).error?.message === 'string'
            ? (err as { error: { message: string } }).error.message
            : 'Failed to add event';
        toast.error(msg);
      } finally {
        setIsSubmitting(false);
      }
    },
    [incidentId, eventType, description, onAdded],
  );

  return (
    <form
      onSubmit={(e) => {
        void handleSubmit(e);
      }}
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
    >
      <p className="text-sm font-medium text-text-primary">Add Timeline Event</p>
      <div className="space-y-1.5">
        <Label htmlFor="event-type">Event Type *</Label>
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger id="event-type">
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {toTitleCase(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="event-desc">Description *</Label>
        <Textarea
          id="event-desc"
          placeholder="Describe what happened..."
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Adding…' : 'Add Event'}
        </Button>
      </div>
    </form>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SecurityIncidentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) ?? 'en';
  const incidentId = params?.id as string;

  const [incident, setIncident] = React.useState<SecurityIncident | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Status update
  const [newStatus, setNewStatus] = React.useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = React.useState(false);

  const fetchIncident = React.useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient<SecurityIncident>(
        `/api/v1/admin/security-incidents/${incidentId}`,
      );
      setIncident(res);
      setNewStatus('');
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'error' in err &&
        typeof (err as { error: { message?: string } }).error?.message === 'string'
          ? (err as { error: { message: string } }).error.message
          : 'Failed to load incident';
      setLoadError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [incidentId]);

  React.useEffect(() => {
    void fetchIncident();
  }, [fetchIncident]);

  const handleStatusUpdate = React.useCallback(async () => {
    if (!newStatus || !incident) return;
    setIsUpdatingStatus(true);
    try {
      await apiClient(`/api/v1/admin/security-incidents/${incidentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      toast.success(`Status updated to ${toTitleCase(newStatus)}`);
      void fetchIncident();
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'error' in err &&
        typeof (err as { error: { message?: string } }).error?.message === 'string'
          ? (err as { error: { message: string } }).error.message
          : 'Failed to update status';
      toast.error(msg);
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [incidentId, newStatus, incident, fetchIncident]);

  const validTransitions = incident
    ? [...(STATUS_TRANSITIONS[incident.status as keyof typeof STATUS_TRANSITIONS] ?? [])]
    : ([] as string[]);

  // ─── Loading skeleton ──────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-20" />
        </div>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ─── Error state ───────────────────────────────────────────────────────────

  if (loadError || !incident) {
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/${locale}/admin/security-incidents`)}
        >
          <ArrowLeft className="me-2 h-4 w-4" />
          Back to Incidents
        </Button>
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-800">
          {loadError ?? 'Incident not found'}
        </div>
      </div>
    );
  }

  const fullName = (u?: { first_name: string; last_name: string } | null) =>
    u ? `${u.first_name} ${u.last_name}` : '—';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/${locale}/admin/security-incidents`)}
      >
        <ArrowLeft className="me-2 h-4 w-4" />
        Back to Incidents
      </Button>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <StatusBadgeLocal status={incident.status} />
            <span className="text-lg font-semibold text-text-primary">
              {toTitleCase(incident.incident_type)}
            </span>
          </div>
          <p className="text-xs text-text-tertiary">
            Detected {formatDateTime(incident.detected_at)} · Incident ID:{' '}
            <span dir="ltr" className="font-mono">
              {incident.id}
            </span>
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {!incident.reported_to_controllers_at && (
            <NotifyControllersDialog
              incidentId={incident.id}
              affectedTenants={incident.affected_tenants}
              onNotified={() => void fetchIncident()}
            />
          )}
          {incident.reported_to_controllers_at && !incident.reported_to_dpc_at && (
            <RecordDpcDialog incidentId={incident.id} onRecorded={() => void fetchIncident()} />
          )}
          {incident.reported_to_controllers_at && incident.reported_to_dpc_at && (
            <div className="flex items-center gap-1.5 text-xs text-green-700">
              <CheckCircle className="h-4 w-4" />
              DPC notified
            </div>
          )}
        </div>
      </div>

      {/* 72-hour countdown banner */}
      <CountdownBanner incident={incident} />

      {/* Info grid */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <p className="text-sm font-semibold text-text-primary">Incident Details</p>
        <Separator />
        <div className="space-y-3">
          <InfoRow label="Description">{incident.description}</InfoRow>
          <InfoRow label="Affected Tenants">
            {incident.affected_tenants.length > 0
              ? incident.affected_tenants.length === 1
                ? '1 tenant'
                : `${incident.affected_tenants.length} tenants`
              : 'Unknown'}
          </InfoRow>
          <InfoRow label="Affected Subjects">
            {incident.affected_data_subjects_count !== null
              ? String(incident.affected_data_subjects_count)
              : 'Unknown'}
          </InfoRow>
          <InfoRow label="Data Categories">
            {incident.data_categories_affected.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {incident.data_categories_affected.map((cat) => (
                  <Badge key={cat} variant="secondary" className="text-xs">
                    {toTitleCase(cat)}
                  </Badge>
                ))}
              </div>
            ) : (
              '—'
            )}
          </InfoRow>
          <InfoRow label="Containment Actions">{incident.containment_actions ?? '—'}</InfoRow>
          <InfoRow label="Root Cause">{incident.root_cause ?? '—'}</InfoRow>
          <InfoRow label="Remediation">{incident.remediation ?? '—'}</InfoRow>
          <InfoRow label="Controllers Notified">
            {incident.reported_to_controllers_at
              ? formatDateTime(incident.reported_to_controllers_at)
              : 'Not yet notified'}
          </InfoRow>
          <InfoRow label="DPC Notified">
            {incident.reported_to_dpc_at
              ? formatDateTime(incident.reported_to_dpc_at)
              : 'Not yet notified'}
          </InfoRow>
          {incident.dpc_reference_number && (
            <InfoRow label="DPC Reference">{incident.dpc_reference_number}</InfoRow>
          )}
          <InfoRow label="Assigned To">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-text-tertiary" />
              {fullName(incident.assigned_to)}
            </span>
          </InfoRow>
          <InfoRow label="Reported By">
            <span className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-text-tertiary" />
              {fullName(incident.created_by)}
            </span>
          </InfoRow>
          <InfoRow label="Created">{formatDateTime(incident.created_at)}</InfoRow>
          <InfoRow label="Last Updated">{formatRelativeTime(incident.updated_at)}</InfoRow>
        </div>
      </div>

      {/* Status update */}
      {validTransitions.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <p className="text-sm font-semibold text-text-primary">Update Status</p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-52">
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select new status" />
                </SelectTrigger>
                <SelectContent>
                  {validTransitions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {toTitleCase(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                void handleStatusUpdate();
              }}
              disabled={!newStatus || isUpdatingStatus}
              size="sm"
            >
              {isUpdatingStatus ? 'Updating…' : 'Update Status'}
            </Button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-text-primary">Timeline</p>

        {!incident.events || incident.events.length === 0 ? (
          <p className="text-sm text-text-tertiary">No events recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {[...incident.events]
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
              .map((event) => (
                <div
                  key={event.id}
                  className="rounded-lg border border-border bg-surface p-4 space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-xs font-medium">
                      {toTitleCase(event.event_type)}
                    </Badge>
                    <span className="text-xs text-text-tertiary">
                      {formatDateTime(event.created_at)}
                    </span>
                  </div>
                  <p className="text-sm text-text-primary">{event.description}</p>
                  {event.created_by && (
                    <p className="flex items-center gap-1 text-xs text-text-tertiary">
                      <User className="h-3 w-3" />
                      {event.created_by.first_name} {event.created_by.last_name}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* Add event form */}
        <AddEventForm incidentId={incident.id} onAdded={() => void fetchIncident()} />
      </div>
    </div>
  );
}
