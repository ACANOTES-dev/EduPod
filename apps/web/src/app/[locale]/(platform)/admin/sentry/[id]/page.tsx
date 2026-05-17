'use client';

import { Clipboard, ExternalLink, GitBranch, Sparkles, TerminalSquare } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

import { getErrorMessage, SentryStateBadge } from '../_components/status-badge';
import type { AgentHandoff, SentryIssueDetail } from '../_components/types';

interface CopilotConversation {
  id: string;
}

export default function PlatformSentryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const locale = (params?.locale as string) ?? 'en';
  const id = params?.id as string;
  const { user } = useAuth();
  const permissions = React.useMemo(
    () => new Set(user?.platform_permissions ?? []),
    [user?.platform_permissions],
  );
  const [issue, setIssue] = React.useState<SentryIssueDetail | null>(null);
  const [prompt, setPrompt] = React.useState('');
  const [working, setWorking] = React.useState<string | null>(null);

  const loadIssue = React.useCallback(async () => {
    try {
      const result = await apiClient<SentryIssueDetail>(`/api/v1/admin/sentry/issues/${id}`);
      setIssue(result);
    } catch (err: unknown) {
      console.error('[PlatformSentryDetailPage.loadIssue]', err);
      toast.error(getErrorMessage(err, 'Failed to load Sentry issue.'));
    }
  }, [id]);

  React.useEffect(() => {
    void loadIssue();
  }, [loadIssue]);

  async function preparePrompt() {
    try {
      setWorking('prompt');
      const result = await apiClient<{ prompt_markdown: string }>(
        `/api/v1/admin/sentry/issues/${id}/prepare-triage-prompt`,
        { method: 'POST' },
      );
      setPrompt(result.prompt_markdown);
      toast.success('Triage prompt prepared.');
    } catch (err: unknown) {
      console.error('[PlatformSentryDetailPage.preparePrompt]', err);
      toast.error(getErrorMessage(err, 'Failed to prepare triage prompt.'));
    } finally {
      setWorking(null);
    }
  }

  async function explain() {
    try {
      setWorking('explain');
      const conversation = await apiClient<CopilotConversation>(
        `/api/v1/admin/sentry/issues/${id}/explain`,
        { method: 'POST' },
      );
      router.push(`/${locale}/admin/copilot?conversation_id=${conversation.id}`);
    } catch (err: unknown) {
      console.error('[PlatformSentryDetailPage.explain]', err);
      toast.error(getErrorMessage(err, 'Failed to open Copilot context.'));
    } finally {
      setWorking(null);
    }
  }

  async function generateHandoff() {
    try {
      setWorking('handoff');
      const handoff = await apiClient<AgentHandoff>(
        `/api/v1/admin/sentry/issues/${id}/generate-handoff`,
        { method: 'POST' },
      );
      router.push(`/${locale}/admin/copilot/agent-handoffs/${handoff.id}`);
    } catch (err: unknown) {
      console.error('[PlatformSentryDetailPage.generateHandoff]', err);
      toast.error(getErrorMessage(err, 'Failed to generate repo-agent handoff.'));
    } finally {
      setWorking(null);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success('Prompt copied.');
    } catch (err: unknown) {
      console.error('[PlatformSentryDetailPage.copyPrompt]', err);
      toast.error('Failed to copy prompt.');
    }
  }

  if (!issue) {
    return <div className="py-10 text-sm text-text-secondary">Loading Sentry issue...</div>;
  }

  const maxEvents = Math.max(...issue.events_summary.map((entry) => entry.event_count), 1);
  const canUseLayer4 = permissions.has('platform.ai.read');

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title={issue.title}
        description={`${issue.sentry_project} · ${issue.sentry_issue_id}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {issue.permalink ? (
              <Button asChild size="sm" variant="outline">
                <a href={issue.permalink} rel="noreferrer" target="_blank">
                  <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                  Open Sentry
                </a>
              </Button>
            ) : null}
            {permissions.has('platform.sentry.triage') ? (
              <Button
                disabled={working === 'prompt'}
                size="sm"
                variant="outline"
                onClick={() => void preparePrompt()}
              >
                <Clipboard className="me-1.5 h-3.5 w-3.5" />
                Prepare triage prompt
              </Button>
            ) : null}
            {canUseLayer4 ? (
              <>
                <Button
                  disabled={working === 'explain'}
                  size="sm"
                  variant="outline"
                  onClick={() => void explain()}
                >
                  <Sparkles className="me-1.5 h-3.5 w-3.5" />
                  Explain
                </Button>
                <Button
                  disabled={working === 'handoff'}
                  size="sm"
                  variant="outline"
                  onClick={() => void generateHandoff()}
                >
                  <TerminalSquare className="me-1.5 h-3.5 w-3.5" />
                  Generate handoff
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="State" value={<SentryStateBadge state={issue.state} />} />
        <Metric label="Level" value={issue.level ?? 'unknown'} />
        <Metric label="Events" value={String(issue.total_event_count)} />
        <Metric label="Users" value={String(issue.affected_user_count)} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-primary">Correlations</h2>
          <div className="mt-4 space-y-3 text-sm text-text-secondary">
            <Row label="Release" value={issue.release ?? 'unknown'} />
            <Row
              label="Deploy"
              value={
                issue.correlated_deploy ? (
                  <Link className="text-primary hover:underline" href={`/${locale}/admin/deploys`}>
                    <GitBranch className="me-1 inline h-3.5 w-3.5" />
                    {issue.correlated_deploy.short_sha} ({issue.correlated_deploy.status})
                  </Link>
                ) : (
                  'none'
                )
              }
            />
            <Row label="Correlation ids" value={issue.correlation_ids.join(', ') || 'none'} />
            <Row label="Runbooks" value={issue.related_runbook_keys.join(', ') || 'none'} />
            <Row label="Topology" value={issue.related_topology_keys.join(', ') || 'none'} />
            <Row label="Severity policy" value={issue.severity_policy_match ?? 'none'} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text-primary">Event Histogram</h2>
          <div className="mt-4 flex h-40 items-end gap-1">
            {issue.events_summary.length === 0 ? (
              <p className="self-center text-sm text-text-secondary">No hourly events yet.</p>
            ) : (
              issue.events_summary.map((entry) => (
                <div
                  key={entry.id}
                  className="min-w-2 flex-1 rounded-t bg-primary"
                  style={{ height: `${Math.max(6, (entry.event_count / maxEvents) * 100)}%` }}
                  title={`${new Date(entry.hour_bucket).toLocaleString()}: ${entry.event_count}`}
                />
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary">Stack Summary</h2>
        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-surface-subtle p-3 text-xs text-text-secondary">
          {issue.stack_summary ?? 'No stack summary mirrored.'}
        </pre>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-text-primary">Linked Platform Error Logs</h2>
        <div className="mt-3 divide-y divide-border">
          {issue.error_logs.length === 0 ? (
            <p className="py-4 text-sm text-text-secondary">
              No platform error logs are linked yet.
            </p>
          ) : (
            issue.error_logs.map((entry) => (
              <Link
                key={entry.id}
                className="block py-3 text-sm hover:bg-surface-hover"
                href={`/${locale}/admin/errors?fingerprint=${encodeURIComponent(entry.fingerprint)}`}
              >
                <span className="font-semibold text-text-primary">{entry.fingerprint}</span>
                <span className="ms-2 text-text-secondary">{entry.message_redacted}</span>
              </Link>
            ))
          )}
        </div>
      </section>

      {prompt ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-text-primary">Prepared Triage Prompt</h2>
            <Button size="sm" variant="outline" onClick={() => void copyPrompt()}>
              <Clipboard className="me-1.5 h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
          <textarea
            readOnly
            className="mt-3 h-80 w-full rounded-md border border-border bg-surface-subtle p-3 font-mono text-xs text-text-primary"
            value={prompt}
          />
        </section>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold text-text-primary">{value}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 md:grid-cols-[140px_1fr]">
      <span className="text-text-tertiary">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}
