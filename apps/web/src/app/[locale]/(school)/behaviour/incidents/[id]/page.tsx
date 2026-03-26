'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@school/ui';
import { ArrowLeft, Clock, MapPin, User } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import * as React from 'react';

import { IncidentStatusBadge } from '@/components/behaviour/incident-status-badge';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  participant_type: string;
  participant_role: string;
  point_delta: number;
  student?: {
    id: string;
    first_name: string;
    last_name: string;
    year_group?: { name: string } | null;
  } | null;
}

interface HistoryEntry {
  id: string;
  action: string;
  changes: Record<string, unknown>;
  performed_by_user?: { first_name: string; last_name: string } | null;
  created_at: string;
}

interface IncidentDetail {
  id: string;
  incident_number: string;
  description: string;
  parent_description: string | null;
  status: string;
  occurred_at: string;
  created_at: string;
  context_type: string;
  context_notes: string | null;
  location: string | null;
  follow_up_required: boolean;
  category: {
    id: string;
    name: string;
    polarity: string;
    severity: number;
    color: string | null;
    point_value: number;
  } | null;
  reported_by_user: { first_name: string; last_name: string } | null;
  participants: Participant[];
}

const TRANSITION_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const ROLE_COLORS: Record<string, string> = {
  subject: 'bg-blue-100 text-blue-700',
  witness: 'bg-gray-100 text-gray-700',
  bystander: 'bg-gray-100 text-gray-600',
  reporter: 'bg-purple-100 text-purple-700',
  victim: 'bg-red-100 text-red-700',
  instigator: 'bg-orange-100 text-orange-700',
  mediator: 'bg-green-100 text-green-700',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IncidentDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const incidentId = params?.id as string;

  const [incident, setIncident] = React.useState<IncidentDetail | null>(null);
  const [history, setHistory] = React.useState<HistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [historyLoading, setHistoryLoading] = React.useState(true);

  // Status transition dialog
  const [transitionOpen, setTransitionOpen] = React.useState(false);
  const [newStatus, setNewStatus] = React.useState('');
  const [transitionReason, setTransitionReason] = React.useState('');
  const [transitioning, setTransitioning] = React.useState(false);
  const [transitionError, setTransitionError] = React.useState('');

  // Fetch incident
  React.useEffect(() => {
    if (!incidentId) return;
    setLoading(true);
    apiClient<{ data: IncidentDetail }>(`/api/v1/behaviour/incidents/${incidentId}`)
      .then((res) => setIncident(res.data))
      .catch(() => setIncident(null))
      .finally(() => setLoading(false));

    setHistoryLoading(true);
    apiClient<{ data: HistoryEntry[] }>(`/api/v1/behaviour/incidents/${incidentId}/history`)
      .then((res) => setHistory(res.data ?? []))
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
  }, [incidentId]);

  const handleStatusTransition = async () => {
    if (!newStatus || !incident) return;
    setTransitioning(true);
    setTransitionError('');
    try {
      await apiClient(`/api/v1/behaviour/incidents/${incident.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({
          status: newStatus,
          reason: transitionReason.trim() || undefined,
        }),
      });
      // Refresh
      const res = await apiClient<{ data: IncidentDetail }>(`/api/v1/behaviour/incidents/${incident.id}`);
      setIncident(res.data);
      const histRes = await apiClient<{ data: HistoryEntry[] }>(`/api/v1/behaviour/incidents/${incident.id}/history`);
      setHistory(histRes.data ?? []);
      setTransitionOpen(false);
      setNewStatus('');
      setTransitionReason('');
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setTransitionError(ex?.error?.message ?? 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700" />
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="space-y-6">
        <PageHeader title="Incident Not Found" />
        <p className="text-sm text-text-tertiary">The requested incident could not be loaded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Incident ${incident.incident_number}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setTransitionOpen(true)}>
              Change Status
            </Button>
            <Link href={`/${locale}/behaviour/incidents`}>
              <Button variant="ghost">
                <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
                Back
              </Button>
            </Link>
          </div>
        }
      />

      {/* Header banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <IncidentStatusBadge status={incident.status} />
        {incident.category && (
          <Badge
            variant="secondary"
            style={incident.category.color ? { borderColor: incident.category.color, color: incident.category.color } : undefined}
          >
            {incident.category.name}
          </Badge>
        )}
        {incident.category && (
          <span className="text-xs text-text-tertiary">
            Severity: {incident.category.severity}/10
          </span>
        )}
        {incident.category && incident.category.point_value !== 0 && (
          <span className={`text-xs font-semibold ${incident.category.point_value > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {incident.category.point_value > 0 ? '+' : ''}{incident.category.point_value} pts
          </span>
        )}
        {incident.follow_up_required && (
          <Badge variant="danger">Follow-up Required</Badge>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main content — 2 cols */}
        <div className="space-y-6 md:col-span-2">
          {/* Description */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-2 text-sm font-semibold text-text-primary">Description</h3>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{incident.description}</p>
            {incident.parent_description && (
              <div className="mt-4 border-t border-border pt-3">
                <h4 className="mb-1 text-xs font-medium text-text-tertiary">Parent-Facing Description</h4>
                <p className="text-sm text-text-secondary">{incident.parent_description}</p>
              </div>
            )}
            {incident.context_notes && (
              <div className="mt-4 border-t border-border pt-3">
                <h4 className="mb-1 text-xs font-medium text-text-tertiary">Context Notes</h4>
                <p className="text-sm text-text-secondary">{incident.context_notes}</p>
              </div>
            )}
          </div>

          {/* Participants */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Participants</h3>
            {incident.participants.length === 0 ? (
              <p className="text-sm text-text-tertiary">No participants recorded</p>
            ) : (
              <ul className="space-y-2">
                {incident.participants.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-secondary px-3 py-2">
                    <User className="h-4 w-4 text-text-tertiary" />
                    <span className="text-sm font-medium text-text-primary">
                      {p.student ? `${p.student.first_name} ${p.student.last_name}` : 'Unknown'}
                    </span>
                    {p.student?.year_group && (
                      <span className="text-xs text-text-tertiary">{p.student.year_group.name}</span>
                    )}
                    <Badge variant="secondary" className={ROLE_COLORS[p.participant_role] ?? ''}>
                      {p.participant_role}
                    </Badge>
                    {p.point_delta !== 0 && (
                      <span className={`text-xs font-semibold ${p.point_delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {p.point_delta > 0 ? '+' : ''}{p.point_delta}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* History Timeline */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">History</h3>
            {historyLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-surface-secondary" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-text-tertiary">No history yet</p>
            ) : (
              <div className="relative space-y-4 ps-6">
                {/* Timeline line */}
                <div className="absolute start-2 top-1 h-full w-px bg-border" />
                {history.map((entry) => (
                  <div key={entry.id} className="relative">
                    <div className="absolute -start-[17px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-primary-500 bg-surface" />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-text-primary capitalize">
                          {entry.action.replace(/_/g, ' ')}
                        </span>
                        {entry.performed_by_user && (
                          <span className="text-xs text-text-tertiary">
                            by {entry.performed_by_user.first_name} {entry.performed_by_user.last_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-tertiary">{formatDateTime(entry.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — 1 col */}
        <div className="space-y-4">
          {/* Meta */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">Details</h3>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                <div>
                  <dt className="text-xs text-text-tertiary">Occurred</dt>
                  <dd className="text-text-primary">{formatDateTime(incident.occurred_at)}</dd>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                <div>
                  <dt className="text-xs text-text-tertiary">Logged</dt>
                  <dd className="text-text-primary">{formatDateTime(incident.created_at)}</dd>
                </div>
              </div>
              {incident.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                  <div>
                    <dt className="text-xs text-text-tertiary">Location</dt>
                    <dd className="text-text-primary">{incident.location}</dd>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <User className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" />
                <div>
                  <dt className="text-xs text-text-tertiary">Reporter</dt>
                  <dd className="text-text-primary">
                    {incident.reported_by_user
                      ? `${incident.reported_by_user.first_name} ${incident.reported_by_user.last_name}`
                      : '—'}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">Context</dt>
                <dd className="capitalize text-text-primary">
                  {incident.context_type.replace(/_/g, ' ')}
                </dd>
              </div>
            </dl>
          </div>

          {/* Placeholder: Sanctions */}
          <div className="rounded-xl border border-dashed border-border bg-surface p-5">
            <h3 className="text-sm font-semibold text-text-tertiary">Sanctions</h3>
            <p className="mt-1 text-xs text-text-tertiary">Coming in Phase C</p>
          </div>

          {/* Placeholder: Attachments */}
          <div className="rounded-xl border border-dashed border-border bg-surface p-5">
            <h3 className="text-sm font-semibold text-text-tertiary">Attachments</h3>
            <p className="mt-1 text-xs text-text-tertiary">Coming in Phase D</p>
          </div>

          {/* Placeholder: Policy */}
          <div className="rounded-xl border border-dashed border-border bg-surface p-5">
            <h3 className="text-sm font-semibold text-text-tertiary">Policy Evaluation</h3>
            <p className="mt-1 text-xs text-text-tertiary">Coming in Phase F</p>
          </div>
        </div>
      </div>

      {/* Status Transition Dialog */}
      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Incident Status</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="mb-1 text-xs text-text-tertiary">
                Current: <IncidentStatusBadge status={incident.status} />
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">New Status</label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {TRANSITION_OPTIONS
                    .filter((opt) => opt.value !== incident.status)
                    .map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-text-primary">Reason (optional)</label>
              <Textarea
                value={transitionReason}
                onChange={(e) => setTransitionReason(e.target.value)}
                placeholder="Why is this changing?"
                rows={2}
              />
            </div>
            {transitionError && <p className="text-sm text-danger-text">{transitionError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionOpen(false)} disabled={transitioning}>
              Cancel
            </Button>
            <Button onClick={handleStatusTransition} disabled={transitioning || !newStatus}>
              {transitioning ? 'Updating...' : 'Update Status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
