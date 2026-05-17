'use client';

import {
  AlertTriangle,
  FileText,
  Lightbulb,
  MessageSquarePlus,
  RefreshCw,
  Save,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type IncidentSeverity = 'warning' | 'critical';
type IncidentStatus = 'active' | 'monitoring' | 'resolved' | 'cancelled';

interface AlertRule {
  name: string;
}

interface IncidentAlert {
  id: string;
  message: string;
  severity: IncidentSeverity | 'info';
  status: 'fired' | 'acknowledged' | 'resolved';
  fired_at: string;
  resolved_at: string | null;
  rule: AlertRule;
}

interface TimelineEvent {
  id: string;
  occurred_at: string;
  event_type: string;
  description: string;
}

interface Recommendation {
  id: string;
  title: string;
  summary: string;
  risk_level: 'safe' | 'caution' | 'destructive';
  status: string;
}

interface PlatformIncidentDetail {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  started_at: string;
  resolved_at: string | null;
  auto_resolved: boolean;
  affected_tenants: string[];
  affected_components: string[];
  root_cause_summary: string | null;
  postmortem_draft: string | null;
  postmortem_final: string | null;
  postmortem_generated_at: string | null;
  postmortem_generations: number;
  prevention_recommendations: Recommendation[];
  alerts: IncidentAlert[];
  timeline: TimelineEvent[];
}

type IncidentTab = 'timeline' | 'postmortem' | 'prevention' | 'alerts';

export default function PlatformIncidentDetailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const [incident, setIncident] = React.useState<PlatformIncidentDetail | null>(null);
  const [activeTab, setActiveTab] = React.useState<IncidentTab>('timeline');
  const [loading, setLoading] = React.useState(true);
  const [working, setWorking] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [status, setStatus] = React.useState<IncidentStatus>('active');
  const [postmortem, setPostmortem] = React.useState('');
  const [note, setNote] = React.useState('');

  const loadIncident = React.useCallback(async () => {
    try {
      setLoading(true);
      const row = await apiClient<PlatformIncidentDetail>(`/api/v1/admin/incidents/${params.id}`);
      setIncident(row);
      setTitle(row.title);
      setStatus(row.status);
      setPostmortem(row.postmortem_final ?? row.postmortem_draft ?? '');
    } catch (err: unknown) {
      console.error('[PlatformIncidentDetailPage.loadIncident]', err);
      toast.error(getErrorMessage(err, 'Failed to load incident.'));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  React.useEffect(() => {
    void loadIncident();
  }, [loadIncident]);

  async function saveIncident() {
    try {
      setWorking(true);
      const updated = await apiClient<PlatformIncidentDetail>(
        `/api/v1/admin/incidents/${params.id}`,
        {
          body: JSON.stringify({ status, title }),
          method: 'PATCH',
        },
      );
      setIncident((current) => (current ? { ...current, ...updated } : current));
      toast.success('Incident updated.');
      await loadIncident();
    } catch (err: unknown) {
      console.error('[PlatformIncidentDetailPage.saveIncident]', err);
      toast.error(getErrorMessage(err, 'Failed to update incident.'));
    } finally {
      setWorking(false);
    }
  }

  async function generatePostmortem() {
    try {
      setWorking(true);
      const result = await apiClient<{ draft: string }>(
        `/api/v1/admin/incidents/${params.id}/regenerate-postmortem`,
        { method: 'POST' },
      );
      setPostmortem(result.draft);
      toast.success('Postmortem draft generated.');
      await loadIncident();
      setActiveTab('postmortem');
    } catch (err: unknown) {
      console.error('[PlatformIncidentDetailPage.generatePostmortem]', err);
      toast.error(getErrorMessage(err, 'Failed to generate postmortem.'));
    } finally {
      setWorking(false);
    }
  }

  async function savePostmortem() {
    try {
      setWorking(true);
      await apiClient(`/api/v1/admin/incidents/${params.id}/postmortem`, {
        body: JSON.stringify({ postmortem_final: postmortem }),
        method: 'PATCH',
      });
      toast.success('Final postmortem saved.');
      await loadIncident();
    } catch (err: unknown) {
      console.error('[PlatformIncidentDetailPage.savePostmortem]', err);
      toast.error(getErrorMessage(err, 'Failed to save postmortem.'));
    } finally {
      setWorking(false);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    try {
      setWorking(true);
      await apiClient(`/api/v1/admin/incidents/${params.id}/timeline-events`, {
        body: JSON.stringify({ description: note }),
        method: 'POST',
      });
      setNote('');
      toast.success('Timeline note added.');
      await loadIncident();
    } catch (err: unknown) {
      console.error('[PlatformIncidentDetailPage.addNote]', err);
      toast.error(getErrorMessage(err, 'Failed to add timeline note.'));
    } finally {
      setWorking(false);
    }
  }

  async function generatePrevention() {
    try {
      setWorking(true);
      const result = await apiClient<{ recommendations_created: number }>(
        `/api/v1/admin/incidents/${params.id}/generate-prevention`,
        { method: 'POST' },
      );
      toast.success(`Generated ${result.recommendations_created} prevention recommendations.`);
      await loadIncident();
      setActiveTab('prevention');
    } catch (err: unknown) {
      console.error('[PlatformIncidentDetailPage.generatePrevention]', err);
      toast.error(getErrorMessage(err, 'Failed to generate prevention recommendations.'));
    } finally {
      setWorking(false);
    }
  }

  if (loading && !incident) {
    return <div className="p-6 text-sm text-text-secondary">Loading incident...</div>;
  }

  if (!incident) {
    return <div className="p-6 text-sm text-text-secondary">Incident not found.</div>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title="Incident Detail"
        description="Review alert timeline, generate an operator-edited postmortem, and create prevention recommendations."
      />

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Title
            </label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              Status
            </label>
            <Select value={status} onValueChange={(value) => setStatus(value as IncidentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="monitoring">Monitoring</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
          <SeverityBadge severity={incident.severity} />
          <span>Started {formatDate(incident.started_at)}</span>
          {incident.resolved_at ? <span>Resolved {formatDate(incident.resolved_at)}</span> : null}
          <span>{incident.affected_components.length} components</span>
          <span>{incident.affected_tenants.length} tenants</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" disabled={working} onClick={() => void saveIncident()}>
            <Save className="me-2 h-4 w-4" />
            Save Incident
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={working}
            onClick={() => void loadIncident()}
          >
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {(['timeline', 'postmortem', 'prevention', 'alerts'] as IncidentTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={cn(
              'min-h-11 border-b-2 px-3 text-sm font-semibold capitalize transition-colors',
              activeTab === tab
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'timeline' ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-4 text-sm font-semibold text-text-primary">Timeline</h2>
            <div className="space-y-3">
              {incident.timeline.map((event) => (
                <div key={event.id} className="border-s-2 border-border ps-4">
                  <p className="text-sm font-semibold text-text-primary">{event.description}</p>
                  <p className="mt-1 text-xs text-text-secondary">
                    {formatDate(event.occurred_at)} / {event.event_type}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Operator Note</h2>
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Add context, decision notes, or external follow-up..."
              rows={6}
            />
            <Button
              className="mt-3 w-full"
              type="button"
              disabled={working}
              onClick={() => void addNote()}
            >
              <MessageSquarePlus className="me-2 h-4 w-4" />
              Add Note
            </Button>
          </div>
        </section>
      ) : null}

      {activeTab === 'postmortem' ? (
        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-text-primary">Markdown Draft</h2>
                <p className="text-xs text-text-secondary">
                  Manual generation is rate-limited to once per incident per hour and checked
                  against the AI budget before the call.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={working}
                  onClick={() => void generatePostmortem()}
                >
                  <FileText className="me-2 h-4 w-4" />
                  Generate
                </Button>
                <Button
                  type="button"
                  disabled={working || !postmortem.trim()}
                  onClick={() => void savePostmortem()}
                >
                  <Save className="me-2 h-4 w-4" />
                  Publish Final
                </Button>
              </div>
            </div>
            <Textarea
              className="min-h-[520px] font-mono text-sm"
              value={postmortem}
              onChange={(event) => setPostmortem(event.target.value)}
              placeholder="Generate a postmortem draft, then edit and publish the final markdown."
            />
          </div>
          <div className="rounded-lg border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-primary">Preview</h2>
            <pre className="min-h-[520px] whitespace-pre-wrap rounded-lg bg-surface-secondary p-4 text-sm text-text-primary">
              {postmortem || 'No postmortem content yet.'}
            </pre>
          </div>
        </section>
      ) : null}

      {activeTab === 'prevention' ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">
                Prevention Recommendations
              </h2>
              <p className="text-xs text-text-secondary">
                Creates 4C recommendation rows from the operator-reviewed postmortem. Nothing is
                executed or applied.
              </p>
            </div>
            <Button type="button" disabled={working} onClick={() => void generatePrevention()}>
              <Lightbulb className="me-2 h-4 w-4" />
              Generate Prevention
            </Button>
          </div>
          {incident.prevention_recommendations.length === 0 ? (
            <p className="text-sm text-text-secondary">No prevention recommendations yet.</p>
          ) : (
            <div className="space-y-3">
              {incident.prevention_recommendations.map((recommendation) => (
                <Link
                  key={recommendation.id}
                  href={`/${params.locale}/admin/copilot/recommendations`}
                  className="block rounded-lg border border-border p-3 transition-colors hover:bg-surface-hover"
                >
                  <p className="text-sm font-semibold text-text-primary">{recommendation.title}</p>
                  <p className="mt-1 text-sm text-text-secondary">{recommendation.summary}</p>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {activeTab === 'alerts' ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Attached Alerts</h2>
          <div className="space-y-3">
            {incident.alerts.map((alert) => (
              <div key={alert.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{alert.rule.name}</p>
                    <p className="mt-1 text-sm text-text-secondary">{alert.message}</p>
                    <p className="mt-2 text-xs text-text-tertiary">
                      {formatDate(alert.fired_at)} / {alert.status}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
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
