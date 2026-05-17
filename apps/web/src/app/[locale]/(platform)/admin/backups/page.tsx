'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { DatabaseBackup, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { createRestoreDrillSchema, type CreateRestoreDrillDto } from '@school/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
  cn,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { OwnerActionConfirmDialog } from '@/components/platform/owner-action-confirm-dialog';
import { apiClient } from '@/lib/api-client';

type BackupStatus = 'green' | 'amber' | 'red';
type BackupRunStatus = 'succeeded' | 'failed' | 'partial' | 'verifying';
type RestoreDrillOutcome = 'passed' | 'failed_recoverable' | 'failed_blocking' | 'inconclusive';

interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

interface ReadinessSummary {
  computed_at: string;
  last_offsite_replication: {
    age_seconds: number;
    id: string;
    lag_seconds: number;
    replicated_at: string;
    replication_target: string;
  } | null;
  last_restore_drill: {
    age_seconds: number;
    drill_at: string;
    id: string;
    outcome: RestoreDrillOutcome;
  } | null;
  last_successful_backup: {
    age_seconds: number;
    finished_at: string;
    id: string;
    integrity_check_passed: boolean | null;
    kind: string;
    size_bytes: string | null;
  } | null;
  overall_status: BackupStatus;
  reasons: string[];
  restore_point_age_seconds: number | null;
}

interface BackupRun {
  backup_key: string;
  duration_seconds: number | null;
  finished_at: string | null;
  id: string;
  integrity_check_passed: boolean | null;
  kind: string;
  location: string;
  size_bytes: string | null;
  status: BackupRunStatus;
}

interface Replication {
  id: string;
  integrity_verified: boolean;
  lag_seconds: number | null;
  replicated_at: string;
  replication_target: string;
  size_bytes: string | null;
  snapshot_id: string;
}

interface RestoreDrill {
  drill_at: string;
  duration_seconds: number | null;
  evidence_url: string | null;
  follow_ups: string[] | null;
  id: string;
  notes: string | null;
  outcome: RestoreDrillOutcome;
  performed_by?: { email: string; first_name: string; last_name: string };
  restore_point: string;
  rpo_observed_seconds: number | null;
  rto_observed_seconds: number | null;
}

const PAGE_SIZE = 20;

export default function BackupReadinessPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [summary, setSummary] = React.useState<ReadinessSummary | null>(null);
  const [runs, setRuns] = React.useState<BackupRun[]>([]);
  const [replications, setReplications] = React.useState<Replication[]>([]);
  const [drills, setDrills] = React.useState<RestoreDrill[]>([]);
  const [tab, setTab] = React.useState<'runs' | 'replications' | 'drills'>('runs');
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [readiness, runRows, replicationRows, drillRows] = await Promise.all([
        apiClient<ReadinessSummary>('/api/v1/admin/backups/readiness'),
        apiClient<PaginatedResponse<BackupRun>>(
          `/api/v1/admin/backups/runs?page=1&pageSize=${PAGE_SIZE}`,
        ),
        apiClient<PaginatedResponse<Replication>>(
          `/api/v1/admin/backups/replications?page=1&pageSize=${PAGE_SIZE}`,
        ),
        apiClient<PaginatedResponse<RestoreDrill>>(
          `/api/v1/admin/backups/restore-drills?page=1&pageSize=${PAGE_SIZE}`,
        ),
      ]);
      setSummary(readiness);
      setRuns(runRows.data);
      setReplications(replicationRows.data);
      setDrills(drillRows.data);
    } catch (err: unknown) {
      console.error('[BackupReadinessPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load backup readiness.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Backup / Restore Readiness"
        description="Read-only backup evidence, off-site replication metadata, and manually recorded restore-drill results."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/${locale}/admin/runbooks?key=recovery-drills`}>
                <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                How to restore
              </Link>
            </Button>
            <RecordRestoreDrillDialog onCreated={load} />
            <Button size="sm" variant="outline" onClick={() => void load()}>
              <RefreshCw className="me-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />

      <section className={cn('rounded-lg border p-4', summaryClasses(summary?.overall_status))}>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {summary ? `Readiness is ${summary.overall_status}` : 'Loading readiness'}
            </p>
            <p className="mt-1 text-xs opacity-80">
              This page never executes restores. Run the procedure first, then record the evidence.
            </p>
          </div>
          <p className="font-mono text-xs opacity-80">
            Computed {summary ? humanizeDate(summary.computed_at) : 'unknown'}
          </p>
        </div>
        {summary?.reasons.length ? (
          <ul className="mt-3 space-y-1 text-xs">
            {summary.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <SummaryCard
          label="Last backup"
          status={cardStatus(summary?.last_successful_backup?.age_seconds, 25 * 3600, 36 * 3600)}
          primary={
            summary?.last_successful_backup
              ? humanizeSeconds(summary.last_successful_backup.age_seconds)
              : 'none'
          }
          secondary={
            summary?.last_successful_backup
              ? `${summary.last_successful_backup.kind} · ${formatBytes(summary.last_successful_backup.size_bytes)}`
              : 'No successful backup captured'
          }
        />
        <SummaryCard
          label="Off-site replication"
          status={cardStatus(summary?.last_offsite_replication?.lag_seconds, 6 * 3600, 24 * 3600)}
          primary={
            summary?.last_offsite_replication
              ? `${humanizeSeconds(summary.last_offsite_replication.lag_seconds)} lag`
              : 'none'
          }
          secondary={summary?.last_offsite_replication?.replication_target ?? 'No replica metadata'}
        />
        <SummaryCard
          label="Restore drill"
          status={cardStatus(summary?.last_restore_drill?.age_seconds, 90 * 86400, 180 * 86400)}
          primary={
            summary?.last_restore_drill
              ? humanizeSeconds(summary.last_restore_drill.age_seconds)
              : 'none'
          }
          secondary={summary?.last_restore_drill?.outcome ?? 'No drill recorded'}
        />
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap gap-2 border-b border-border p-3">
          {(['runs', 'replications', 'drills'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={cn(
                'min-h-10 rounded-lg px-3 text-sm font-semibold',
                tab === item
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-text-secondary hover:bg-surface-secondary',
              )}
            >
              {labelize(item)}
            </button>
          ))}
        </div>

        {tab === 'runs' ? <RunsTable loading={loading} rows={runs} /> : null}
        {tab === 'replications' ? (
          <ReplicationsTable loading={loading} rows={replications} />
        ) : null}
        {tab === 'drills' ? <RestoreDrills rows={drills} locale={locale} onDeleted={load} /> : null}
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  primary,
  secondary,
  status,
}: {
  label: string;
  primary: string;
  secondary: string;
  status: BackupStatus;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">{label}</p>
        <span
          className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', badgeClasses(status))}
        >
          {status}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-text-primary">{primary}</p>
      <p className="mt-1 break-all text-sm text-text-secondary">{secondary}</p>
    </article>
  );
}

function RunsTable({ loading, rows }: { loading: boolean; rows: BackupRun[] }) {
  if (loading) return <EmptyState text="Loading backup runs..." />;
  if (rows.length === 0) return <EmptyState text="No backup runs captured yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-surface-secondary text-xs uppercase tracking-wide text-text-tertiary">
          <tr>
            <th className="px-4 py-3 text-start">Run</th>
            <th className="px-4 py-3 text-start">Status</th>
            <th className="px-4 py-3 text-start">Finished</th>
            <th className="px-4 py-3 text-start">Size</th>
            <th className="px-4 py-3 text-start">Integrity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="px-4 py-3">
                <p className="font-semibold text-text-primary">{row.kind}</p>
                <p className="max-w-md truncate font-mono text-xs text-text-tertiary">
                  {row.location}
                </p>
              </td>
              <td className="px-4 py-3">{row.status}</td>
              <td className="px-4 py-3">{humanizeDate(row.finished_at)}</td>
              <td className="px-4 py-3">{formatBytes(row.size_bytes)}</td>
              <td className="px-4 py-3">{integrityText(row.integrity_check_passed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReplicationsTable({ loading, rows }: { loading: boolean; rows: Replication[] }) {
  if (loading) return <EmptyState text="Loading replications..." />;
  if (rows.length === 0)
    return <EmptyState text="No off-site replication metadata captured yet." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-surface-secondary text-xs uppercase tracking-wide text-text-tertiary">
          <tr>
            <th className="px-4 py-3 text-start">Target</th>
            <th className="px-4 py-3 text-start">Snapshot</th>
            <th className="px-4 py-3 text-start">Replicated</th>
            <th className="px-4 py-3 text-start">Lag</th>
            <th className="px-4 py-3 text-start">Size</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-border">
              <td className="px-4 py-3">{row.replication_target}</td>
              <td className="max-w-sm truncate px-4 py-3 font-mono text-xs">{row.snapshot_id}</td>
              <td className="px-4 py-3">{humanizeDate(row.replicated_at)}</td>
              <td className="px-4 py-3">{humanizeSeconds(row.lag_seconds)}</td>
              <td className="px-4 py-3">{formatBytes(row.size_bytes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RestoreDrills({
  locale,
  onDeleted,
  rows,
}: {
  locale: string;
  onDeleted: () => void | Promise<void>;
  rows: RestoreDrill[];
}) {
  if (rows.length === 0) return <EmptyState text="No restore drills recorded yet." />;
  return (
    <div className="grid gap-3 p-4 lg:grid-cols-2">
      {rows.map((row) => (
        <article key={row.id} className="rounded-lg border border-border bg-surface-secondary p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-semibold',
                  outcomeClasses(row.outcome),
                )}
              >
                {row.outcome}
              </span>
              <h2 className="mt-3 break-all font-mono text-sm font-semibold text-text-primary">
                {row.restore_point}
              </h2>
            </div>
            <OwnerActionConfirmDialog
              action="backup_restore_drill_deleted"
              confirmationPhrase={`DELETE RESTORE DRILL ${row.id.slice(0, 8)}`}
              payload={{ restore_drill_id: row.id }}
              summary="This removes an operator-recorded restore-drill evidence row. Use this only for duplicate or incorrect records."
              targetLabel={row.restore_point}
              targetResourceId={row.id}
              targetResourceType="restore_drill"
              title="Delete restore drill"
              onExecuted={onDeleted}
            >
              <Button type="button" size="sm" variant="destructive">
                <Trash2 className="me-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </OwnerActionConfirmDialog>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Metric label="Drill date" value={humanizeDate(row.drill_at)} />
            <Metric label="Duration" value={humanizeSeconds(row.duration_seconds)} />
            <Metric label="RPO" value={humanizeSeconds(row.rpo_observed_seconds)} />
            <Metric label="RTO" value={humanizeSeconds(row.rto_observed_seconds)} />
          </dl>
          {row.notes ? <p className="mt-3 text-sm text-text-secondary">{row.notes}</p> : null}
          {row.evidence_url ? (
            <Link
              href={row.evidence_url}
              className="mt-3 inline-flex text-sm font-semibold text-primary-700"
              target="_blank"
            >
              Evidence
            </Link>
          ) : null}
          <Link
            href={`/${locale}/admin/runbooks?key=recovery-drills`}
            className="mt-3 block text-xs font-medium text-text-tertiary hover:text-text-primary"
          >
            Recovery drill runbook
          </Link>
        </article>
      ))}
    </div>
  );
}

function RecordRestoreDrillDialog({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [followUps, setFollowUps] = React.useState('');
  const form = useForm<CreateRestoreDrillDto>({
    resolver: zodResolver(createRestoreDrillSchema),
    defaultValues: {
      drill_at: new Date(),
      outcome: 'passed',
      restore_point: '',
    },
  });

  async function submit(values: CreateRestoreDrillDto) {
    try {
      setSubmitting(true);
      await apiClient('/api/v1/admin/backups/restore-drills', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          drill_at: values.drill_at.toISOString(),
          follow_ups: followUps
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });
      toast.success('Restore drill recorded.');
      setOpen(false);
      form.reset({ drill_at: new Date(), outcome: 'passed', restore_point: '' });
      setFollowUps('');
      await onCreated();
    } catch (err: unknown) {
      console.error('[RecordRestoreDrillDialog.submit]', err);
      toast.error(getErrorMessage(err, 'Failed to record restore drill.'));
    } finally {
      setSubmitting(false);
    }
  }

  const drillAt = form.watch('drill_at');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <DatabaseBackup className="me-1.5 h-3.5 w-3.5" />
          Record drill
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record completed restore drill</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
          <p className="rounded-lg border border-border bg-surface-secondary p-3 text-sm text-text-secondary">
            Run the recovery procedure first, then record the observed result here. This dialog does
            not trigger a restore.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="drill_at">Drill date/time</Label>
              <Input
                id="drill_at"
                type="datetime-local"
                value={toLocalInputValue(drillAt)}
                onChange={(event) => form.setValue('drill_at', new Date(event.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="outcome">Outcome</Label>
              <select
                id="outcome"
                className="mt-1 h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text-primary"
                {...form.register('outcome')}
              >
                <option value="passed">Passed</option>
                <option value="failed_recoverable">Failed recoverable</option>
                <option value="failed_blocking">Failed blocking</option>
                <option value="inconclusive">Inconclusive</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="restore_point">Restore point</Label>
            <Input id="restore_point" {...form.register('restore_point')} />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <NumberField formKey="duration_seconds" label="Duration seconds" form={form} />
            <NumberField formKey="rpo_observed_seconds" label="RPO seconds" form={form} />
            <NumberField formKey="rto_observed_seconds" label="RTO seconds" form={form} />
          </div>
          <div>
            <Label htmlFor="evidence_url">Evidence URL</Label>
            <Input id="evidence_url" {...form.register('evidence_url')} />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" className="min-h-24" {...form.register('notes')} />
          </div>
          <div>
            <Label htmlFor="follow_ups">Follow-ups</Label>
            <Textarea
              id="follow_ups"
              className="min-h-20"
              value={followUps}
              onChange={(event) => setFollowUps(event.target.value)}
              placeholder="One follow-up per line"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              Record drill
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NumberField({
  form,
  formKey,
  label,
}: {
  form: ReturnType<typeof useForm<CreateRestoreDrillDto>>;
  formKey: 'duration_seconds' | 'rpo_observed_seconds' | 'rto_observed_seconds';
  label: string;
}) {
  return (
    <div>
      <Label htmlFor={formKey}>{label}</Label>
      <Input
        id={formKey}
        type="number"
        min={0}
        {...form.register(formKey, { valueAsNumber: true })}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-tertiary">{label}</dt>
      <dd className="mt-1 font-mono text-xs text-text-primary">{value}</dd>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-8 text-sm text-text-secondary">{text}</div>;
}

function summaryClasses(status: BackupStatus | undefined): string {
  if (status === 'green') return 'border-success-text bg-success-bg text-success-text';
  if (status === 'amber') return 'border-warning-200 bg-warning-bg text-warning-text';
  if (status === 'red') return 'border-danger-text bg-danger-bg text-danger-text';
  return 'border-border bg-surface text-text-primary';
}

function badgeClasses(status: BackupStatus): string {
  if (status === 'green') return 'bg-success-bg text-success-text';
  if (status === 'amber') return 'bg-warning-bg text-warning-text';
  return 'bg-danger-bg text-danger-text';
}

function outcomeClasses(outcome: RestoreDrillOutcome): string {
  if (outcome === 'passed') return 'bg-success-bg text-success-text';
  if (outcome === 'failed_blocking') return 'bg-danger-bg text-danger-text';
  return 'bg-warning-bg text-warning-text';
}

function cardStatus(value: number | undefined, amber: number, red: number): BackupStatus {
  if (value === undefined) return 'red';
  if (value > red) return 'red';
  if (value > amber) return 'amber';
  return 'green';
}

function formatBytes(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return value;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function humanizeDate(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : 'unknown';
}

function humanizeSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'unknown';
  if (value < 60) return `${value}s`;
  if (value < 3600) return `${Math.round(value / 60)}m`;
  if (value < 86_400) return `${Math.round(value / 3600)}h`;
  return `${Math.round(value / 86_400)}d`;
}

function integrityText(value: boolean | null): string {
  if (value === true) return 'passed';
  if (value === false) return 'failed';
  return 'not recorded';
}

function labelize(value: string): string {
  return value.replace(/_/g, ' ').replace(/^\w/, (char) => char.toUpperCase());
}

function toLocalInputValue(value: Date): string {
  const offsetMs = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offsetMs).toISOString().slice(0, 16);
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
