'use client';

import {
  Activity,
  AlertTriangle,
  Database,
  Eye,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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
  Textarea,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HealthData {
  queue_depths: Record<string, number>;
  dead_letter_depth: number;
  cache_hit_rate: number;
  view_freshness: Array<{ view_name: string; last_refreshed_at: string | null }>;
  scan_backlog: number;
  legal_holds_active: number;
}

interface DeadLetterItem {
  queue: string;
  job_id: string;
  job_name: string;
  failed_at: string;
  failure_reason: string;
  retry_count: number;
}

interface PreviewResponse {
  affected_records: number;
  affected_students: number;
  sample_records: string[];
  estimated_duration: string;
  warnings: string[];
  reversible: boolean;
  rollback_method: string | null;
}

interface LegalHold {
  id: string;
  entity_type: string;
  entity_id: string;
  hold_reason: string;
  legal_basis: string | null;
  status: string;
  set_by: { id: string; first_name: string; last_name: string };
  set_at: string;
  released_by: { id: string; first_name: string; last_name: string } | null;
  released_at: string | null;
  release_reason: string | null;
}

interface RetentionPreview {
  to_archive: number;
  to_anonymise: number;
  held_by_legal_hold: number;
  sample_to_archive: string[];
  sample_to_anonymise: string[];
}

interface ScopeAuditResult {
  scope_level: string;
  student_count: number;
  student_ids: string[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function BehaviourAdminPage() {
  const t = useTranslations('behaviourSettings.admin');
  const [activeTab, setActiveTab] = React.useState('health');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />

      {/* Tab Navigation */}
      <div className="flex overflow-x-auto border-b">
        {[
          { key: 'health', icon: Activity, label: 'System Health', shortLabel: 'Health' },
          { key: 'dead-letter', icon: AlertTriangle, label: 'Dead-Letter', shortLabel: 'DLQ' },
          { key: 'operations', icon: Play, label: 'Operations', shortLabel: 'Ops' },
          { key: 'scope-audit', icon: Users, label: 'Scope Audit', shortLabel: 'Scope' },
          { key: 'retention', icon: Database, label: 'Retention', shortLabel: 'Data' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'border-b-2 border-emerald-600 text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'health' && <SystemHealthTab />}
      {activeTab === 'dead-letter' && <DeadLetterTab />}
      {activeTab === 'operations' && <OperationsTab />}
      {activeTab === 'scope-audit' && <ScopeAuditTab />}
      {activeTab === 'retention' && <RetentionTab />}
    </div>
  );
}

// ─── Tab 1: System Health ───────────────────────────────────────────────────

function SystemHealthTab() {
  const [health, setHealth] = React.useState<HealthData | null>(null);
  const [loading, setLoading] = React.useState(true);

  const loadHealth = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<HealthData>('/api/v1/behaviour/admin/health');
      setHealth(res);
    } catch (err) {
      console.error('[loadHealth]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  if (loading || !health) {
    return <div className="py-8 text-center text-muted-foreground">Loading health data...</div>;
  }

  const getQueueColor = (depth: number) => {
    if (depth === 0) return 'bg-green-500';
    if (depth < 10) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Queue Depths */}
      {Object.entries(health.queue_depths).map(([name, depth]) => (
        <div key={name} className="rounded-lg border bg-card p-4">
          <div className="pb-2">
            <p className="text-sm font-medium capitalize">{name.replace(/_/g, ' ')}</p>
          </div>
          <div className="p-4 pt-0">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${getQueueColor(depth)}`} />
              <span className="text-2xl font-bold">{depth}</span>
              <span className="text-sm text-muted-foreground">jobs</span>
            </div>
          </div>
        </div>
      ))}

      {/* Dead Letter */}
      <div className="rounded-lg border bg-card">
        <div className="pb-2">
          <p className="text-sm font-medium">Dead-Letter Queue</p>
        </div>
        <div className="p-4 pt-0">
          <div className="flex items-center gap-2">
            <div
              className={`h-3 w-3 rounded-full ${health.dead_letter_depth > 0 ? 'bg-red-500' : 'bg-green-500'}`}
            />
            <span className="text-2xl font-bold">{health.dead_letter_depth}</span>
            <span className="text-sm text-muted-foreground">failed</span>
          </div>
        </div>
      </div>

      {/* Cache Hit Rate */}
      <div className="rounded-lg border bg-card">
        <div className="pb-2">
          <p className="text-sm font-medium">Redis Cache Hit Rate</p>
        </div>
        <div className="p-4 pt-0">
          <span className="text-2xl font-bold">{(health.cache_hit_rate * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* View Freshness */}
      <div className="rounded-lg border bg-card md:col-span-2 lg:col-span-3">
        <div className="pb-2">
          <p className="text-sm font-medium">Materialised View Freshness</p>
        </div>
        <div className="p-4 pt-0">
          <div className="space-y-2">
            {health.view_freshness.map((v) => (
              <div key={v.view_name} className="flex items-center justify-between">
                <span className="text-sm font-mono">{v.view_name}</span>
                <span className="text-sm text-muted-foreground">
                  {v.last_refreshed_at ? new Date(v.last_refreshed_at).toLocaleString() : 'Unknown'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Scan Backlog */}
      <div className="rounded-lg border bg-card">
        <div className="pb-2">
          <p className="text-sm font-medium">Attachment Scan Backlog</p>
        </div>
        <div className="p-4 pt-0">
          <span className="text-2xl font-bold">{health.scan_backlog}</span>
          <span className="ms-2 text-sm text-muted-foreground">pending</span>
        </div>
      </div>

      {/* Active Legal Holds */}
      <div className="rounded-lg border bg-card">
        <div className="pb-2">
          <p className="text-sm font-medium">Active Legal Holds</p>
        </div>
        <div className="p-4 pt-0">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-amber-500" />
            <span className="text-2xl font-bold">{health.legal_holds_active}</span>
          </div>
        </div>
      </div>

      <div className="md:col-span-2 lg:col-span-3">
        <Button variant="secondary" onClick={loadHealth}>
          <RefreshCw className="me-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    </div>
  );
}

// ─── Tab 2: Dead-Letter Queue ───────────────────────────────────────────────

function DeadLetterTab() {
  const [jobs, setJobs] = React.useState<DeadLetterItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadJobs = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<DeadLetterItem[]>('/api/v1/behaviour/admin/dead-letter');
      setJobs(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('[loadJobs]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const retryJob = async (jobId: string) => {
    try {
      await apiClient(`/api/v1/behaviour/admin/dead-letter/${jobId}/retry`, { method: 'POST' });
      await loadJobs();
    } catch (err) {
      console.error('[retryJob]', err);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  if (jobs.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="p-4 py-12 text-center">
          <Activity className="mx-auto mb-4 h-8 w-8 text-green-500" />
          <p className="font-medium">No failed jobs</p>
          <p className="text-sm text-muted-foreground">All queues healthy</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="pb-2 text-start font-medium">Job</th>
              <th className="pb-2 text-start font-medium">Queue</th>
              <th className="pb-2 text-start font-medium">Failed At</th>
              <th className="pb-2 text-start font-medium">Reason</th>
              <th className="pb-2 text-start font-medium">Retries</th>
              <th className="pb-2 text-end font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.job_id} className="border-b">
                <td className="py-2 font-mono text-xs">{job.job_name}</td>
                <td className="py-2">
                  <Badge variant="secondary">{job.queue}</Badge>
                </td>
                <td className="py-2 text-muted-foreground">
                  {new Date(job.failed_at).toLocaleString()}
                </td>
                <td
                  className="max-w-[200px] truncate py-2 text-muted-foreground"
                  title={job.failure_reason}
                >
                  {job.failure_reason}
                </td>
                <td className="py-2">{job.retry_count}</td>
                <td className="py-2 text-end">
                  <Button size="sm" variant="secondary" onClick={() => retryJob(job.job_id)}>
                    <RotateCcw className="me-1 h-3 w-3" />
                    Retry
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab 3: Operations ──────────────────────────────────────────────────────

function OperationsTab() {
  const [previewData, setPreviewData] = React.useState<PreviewResponse | null>(null);
  const [previewOp, setPreviewOp] = React.useState<string | null>(null);
  const [scope, setScope] = React.useState('tenant');

  const preview = async (operation: string) => {
    try {
      const body = ['recompute-points', 'rebuild-awards'].includes(operation)
        ? { scope }
        : operation === 'backfill-tasks'
          ? { scope: 'tenant' }
          : {};
      const res = await apiClient<PreviewResponse>(`/api/v1/behaviour/admin/${operation}/preview`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPreviewData(res);
      setPreviewOp(operation);
    } catch (err) {
      console.error('[preview]', err);
    }
  };

  const execute = async (operation: string) => {
    try {
      const body = ['recompute-points', 'rebuild-awards'].includes(operation)
        ? { scope }
        : operation === 'backfill-tasks'
          ? { scope: 'tenant' }
          : {};
      await apiClient(`/api/v1/behaviour/admin/${operation}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setPreviewData(null);
      setPreviewOp(null);
    } catch (err) {
      console.error('[execute]', err);
    }
  };

  const operations = [
    {
      key: 'recompute-points',
      title: 'Recompute Points',
      desc: 'Invalidate Redis cache and recompute all point totals from source records.',
      hasScope: true,
      icon: RefreshCw,
    },
    {
      key: 'rebuild-awards',
      title: 'Rebuild Awards',
      desc: 'Scan all students for missing threshold awards and create them.',
      hasScope: true,
      icon: Shield,
    },
    {
      key: 'recompute-pulse',
      title: 'Recompute Pulse',
      desc: 'Invalidate Behaviour Pulse cache. Next request will recompute.',
      hasScope: false,
      icon: Activity,
      noPreview: true,
    },
    {
      key: 'backfill-tasks',
      title: 'Backfill Tasks',
      desc: 'Scan entities for missing tasks and create them.',
      hasScope: false,
      icon: Search,
    },
    {
      key: 'refresh-views',
      title: 'Refresh Materialised Views',
      desc: 'Force refresh all 3 behaviour materialised views (CONCURRENTLY).',
      hasScope: false,
      icon: Database,
      noPreview: true,
    },
    {
      key: 'reindex-search',
      title: 'Reindex Search',
      desc: 'Rebuild the Meilisearch behaviour search index from DB.',
      hasScope: false,
      icon: Search,
    },
  ];

  return (
    <div className="space-y-4">
      {operations.map((op) => (
        <div key={op.key} className="rounded-lg border bg-card">
          <div className="p-4 pb-2">
            <div className="flex items-center gap-2">
              <op.icon className="h-5 w-5 text-muted-foreground" />
              <p className="text-base font-semibold">{op.title}</p>
            </div>
            <p className="text-sm text-muted-foreground">{op.desc}</p>
          </div>
          <div className="p-4 pt-0">
            <div className="flex flex-wrap items-center gap-2">
              {op.hasScope && (
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="year_group">Year Group</SelectItem>
                    <SelectItem value="tenant">Entire School</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {!op.noPreview && (
                <Button variant="secondary" onClick={() => preview(op.key)}>
                  <Eye className="me-2 h-4 w-4" />
                  Preview Impact
                </Button>
              )}
              <Button
                variant={op.noPreview ? 'default' : 'outline'}
                onClick={() => execute(op.key)}
                disabled={!op.noPreview && previewOp !== op.key}
              >
                <Play className="me-2 h-4 w-4" />
                Execute
              </Button>
            </div>
          </div>
        </div>
      ))}

      {/* Preview Modal */}
      <Dialog open={!!previewData} onOpenChange={() => setPreviewData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impact Preview</DialogTitle>
          </DialogHeader>
          {previewData && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Affected records:</span>
                <span className="font-bold">{previewData.affected_records}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Affected students:</span>
                <span className="font-bold">{previewData.affected_students}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Estimated duration:</span>
                <span className="font-bold">{previewData.estimated_duration}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Reversible:</span>
                <span className="font-bold">{previewData.reversible ? 'Yes' : 'No'}</span>
              </div>
              {previewData.warnings.length > 0 && (
                <div className="rounded-md bg-amber-50 p-3 dark:bg-amber-900/20">
                  {previewData.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-amber-800 dark:text-amber-200">
                      {w}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPreviewData(null)}>
              Cancel
            </Button>
            <Button onClick={() => previewOp && execute(previewOp)}>Confirm Execute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab 4: Scope Audit ─────────────────────────────────────────────────────

function ScopeAuditTab() {
  const [userId, setUserId] = React.useState('');
  const [result, setResult] = React.useState<ScopeAuditResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  const runAudit = async () => {
    if (!userId.trim()) return;
    setLoading(true);
    try {
      const res = await apiClient<ScopeAuditResult>(
        `/api/v1/behaviour/admin/scope-audit?user_id=${userId}`,
      );
      setResult(res);
    } catch (err) {
      console.error('[runAudit]', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        <div className="p-4 pb-2">
          <p className="text-base font-semibold">Staff Scope Audit</p>
          <p className="text-sm text-muted-foreground">
            Check which students a specific staff member can see in the behaviour module.
          </p>
        </div>
        <div className="p-4 pt-0 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Enter staff user ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="flex-1"
            />
            <Button onClick={runAudit} disabled={loading || !userId.trim()}>
              <Search className="me-2 h-4 w-4" />
              Run Audit
            </Button>
          </div>

          {result && (
            <div className="rounded-md border p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="secondary" className="capitalize">
                  {result.scope_level}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Can see {result.student_count} student{result.student_count !== 1 ? 's' : ''}
                </span>
              </div>
              {result.student_ids.length > 0 && (
                <div className="max-h-48 overflow-y-auto">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Student IDs:</p>
                  <div className="space-y-1">
                    {result.student_ids.slice(0, 50).map((id) => (
                      <code key={id} className="block text-xs">
                        {id}
                      </code>
                    ))}
                    {result.student_ids.length > 50 && (
                      <p className="text-xs text-muted-foreground">
                        ...and {result.student_ids.length - 50} more
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 5: Retention ───────────────────────────────────────────────────────

function RetentionTab() {
  const [holds, setHolds] = React.useState<LegalHold[]>([]);
  const [retentionPreview, setRetentionPreview] = React.useState<RetentionPreview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [releaseDialog, setReleaseDialog] = React.useState<string | null>(null);
  const [releaseReason, setReleaseReason] = React.useState('');
  const [createDialog, setCreateDialog] = React.useState(false);
  const [newHold, setNewHold] = React.useState({
    entity_type: 'incident',
    entity_id: '',
    hold_reason: '',
    legal_basis: '',
  });

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const holdsRes = await apiClient<{ data: LegalHold[]; meta: { total: number } }>(
        '/api/v1/behaviour/admin/legal-holds?status=active&pageSize=100',
      );
      setHolds(holdsRes?.data ?? []);
    } catch (err) {
      console.error('[loadData]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  const previewRetention = async () => {
    try {
      const res = await apiClient<RetentionPreview>('/api/v1/behaviour/admin/retention/preview', {
        method: 'POST',
      });
      setRetentionPreview(res);
    } catch (err) {
      console.error('[previewRetention]', err);
    }
  };

  const executeRetention = async () => {
    try {
      await apiClient('/api/v1/behaviour/admin/retention/execute', { method: 'POST' });
    } catch (err) {
      console.error('[executeRetention]', err);
    }
  };

  const releaseHold = async (holdId: string) => {
    if (!releaseReason.trim()) return;
    try {
      await apiClient(`/api/v1/behaviour/admin/legal-holds/${holdId}/release`, {
        method: 'POST',
        body: JSON.stringify({ release_reason: releaseReason, release_linked: false }),
      });
      setReleaseDialog(null);
      setReleaseReason('');
      await loadData();
    } catch (err) {
      console.error('[releaseHold]', err);
    }
  };

  const createHold = async () => {
    if (!newHold.entity_id.trim() || !newHold.hold_reason.trim()) return;
    try {
      await apiClient('/api/v1/behaviour/admin/legal-holds', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: newHold.entity_type,
          entity_id: newHold.entity_id,
          hold_reason: newHold.hold_reason,
          legal_basis: newHold.legal_basis || null,
          propagate: true,
        }),
      });
      setCreateDialog(false);
      setNewHold({ entity_type: 'incident', entity_id: '', hold_reason: '', legal_basis: '' });
      await loadData();
    } catch (err) {
      console.error('[createHold]', err);
    }
  };

  if (loading) {
    return <div className="py-8 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Retention Preview */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 pb-2">
          <p className="text-base font-semibold">Retention Preview</p>
          <p className="text-sm text-muted-foreground">
            Preview which records would be affected by the next retention run.
          </p>
        </div>
        <div className="p-4 pt-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={previewRetention}>
              <Eye className="me-2 h-4 w-4" />
              Preview Next Run
            </Button>
            <Button variant="destructive" onClick={executeRetention}>
              <Play className="me-2 h-4 w-4" />
              Execute Retention Now
            </Button>
          </div>

          {retentionPreview && (
            <div className="rounded-md border p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">To Archive</p>
                  <p className="text-2xl font-bold">{retentionPreview.to_archive}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">To Anonymise</p>
                  <p className="text-2xl font-bold">{retentionPreview.to_anonymise}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Held (Skipped)</p>
                  <p className="text-2xl font-bold text-amber-600">
                    {retentionPreview.held_by_legal_hold}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legal Holds */}
      <div className="rounded-lg border bg-card">
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold">Active Legal Holds</p>
              <p className="text-sm text-muted-foreground">
                Records under legal hold are protected from archival and anonymisation.
              </p>
            </div>
            <Button size="sm" onClick={() => setCreateDialog(true)}>
              <Lock className="me-2 h-4 w-4" />
              Create Hold
            </Button>
          </div>
        </div>
        <div className="p-4 pt-0">
          {holds.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No active legal holds</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="pb-2 text-start font-medium">Entity</th>
                    <th className="pb-2 text-start font-medium">Reason</th>
                    <th className="pb-2 text-start font-medium">Legal Basis</th>
                    <th className="pb-2 text-start font-medium">Set By</th>
                    <th className="pb-2 text-start font-medium">Set At</th>
                    <th className="pb-2 text-end font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {holds.map((hold) => (
                    <tr key={hold.id} className="border-b">
                      <td className="py-2">
                        <Badge variant="secondary" className="capitalize">
                          {hold.entity_type}
                        </Badge>
                        <code className="ms-1 text-xs">{hold.entity_id.substring(0, 8)}...</code>
                      </td>
                      <td className="max-w-[200px] truncate py-2" title={hold.hold_reason}>
                        {hold.hold_reason}
                      </td>
                      <td className="py-2 text-muted-foreground">{hold.legal_basis ?? '—'}</td>
                      <td className="py-2">
                        {hold.set_by.first_name} {hold.set_by.last_name}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {new Date(hold.set_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 text-end">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setReleaseDialog(hold.id)}
                        >
                          Release
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Release Hold Dialog */}
      <Dialog open={!!releaseDialog} onOpenChange={() => setReleaseDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release Legal Hold</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Release Reason</Label>
            <Textarea
              value={releaseReason}
              onChange={(e) => setReleaseReason(e.target.value)}
              placeholder="Enter the reason for releasing this hold..."
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReleaseDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => releaseDialog && releaseHold(releaseDialog)}
              disabled={!releaseReason.trim()}
            >
              Release Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Hold Dialog */}
      <Dialog open={createDialog} onOpenChange={setCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Legal Hold</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Entity Type</Label>
              <Select
                value={newHold.entity_type}
                onValueChange={(v) => setNewHold((p) => ({ ...p, entity_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incident">Incident</SelectItem>
                  <SelectItem value="sanction">Sanction</SelectItem>
                  <SelectItem value="intervention">Intervention</SelectItem>
                  <SelectItem value="appeal">Appeal</SelectItem>
                  <SelectItem value="exclusion_case">Exclusion Case</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Entity ID</Label>
              <Input
                value={newHold.entity_id}
                onChange={(e) => setNewHold((p) => ({ ...p, entity_id: e.target.value }))}
                placeholder="UUID of the entity"
              />
            </div>
            <div>
              <Label>Hold Reason</Label>
              <Textarea
                value={newHold.hold_reason}
                onChange={(e) => setNewHold((p) => ({ ...p, hold_reason: e.target.value }))}
                placeholder="Why is this hold being placed?"
              />
            </div>
            <div>
              <Label>Legal Basis (optional)</Label>
              <Input
                value={newHold.legal_basis}
                onChange={(e) => setNewHold((p) => ({ ...p, legal_basis: e.target.value }))}
                placeholder='e.g. "Appeal AP-000042"'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={createHold}
              disabled={!newHold.entity_id.trim() || !newHold.hold_reason.trim()}
            >
              Create Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
