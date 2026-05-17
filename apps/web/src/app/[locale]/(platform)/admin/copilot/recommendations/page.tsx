'use client';

import {
  Bot,
  CheckCircle2,
  ClipboardList,
  FileText,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import * as React from 'react';

import type { PlatformAuditActionDto } from '@school/shared';
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
import { OwnerActionConfirmDialog } from '@/components/platform/owner-action-confirm-dialog';
import { apiClient } from '@/lib/api-client';

type ContextKind = 'alert' | 'correlation' | 'deploy' | 'error' | 'health' | 'queue' | 'tenant';
type RecommendationCategory =
  | 'noise_reduction'
  | 'known_fix'
  | 'config_drift'
  | 'deploy_regression'
  | 'capacity'
  | 'cost'
  | 'security'
  | 'hygiene';
type RecommendationStatus = 'active' | 'resolved' | 'dismissed' | 'expired' | 'superseded';

interface EvidenceItem {
  id: string;
  kind: string;
  link: string;
  occurred_at: string;
  raw: unknown;
  snippet: string;
}

interface Recommendation {
  id: string;
  category: RecommendationCategory;
  title: string;
  summary: string;
  detailed_reasoning: string;
  confidence: 'low' | 'medium' | 'high';
  risk_level: 'safe' | 'caution' | 'destructive';
  requires_owner_confirmation: boolean;
  requires_repo_agent_handoff: boolean;
  proposed_action: unknown | null;
  target_resource_type: string | null;
  target_resource_id: string | null;
  evidence: EvidenceItem[];
  status: RecommendationStatus;
  generated_at: string;
  last_refreshed_at: string;
}

type ActionProposalStatus =
  | 'approved'
  | 'awaiting_approval'
  | 'executed'
  | 'executing'
  | 'expired'
  | 'failed'
  | 'rejected';

interface ActionProposal {
  id: string;
  recommendation_id: string | null;
  action_kind: string;
  action_payload: unknown;
  target_resource_type: string | null;
  target_resource_id: string | null;
  target_tenant_id: string | null;
  reasoning: string;
  required_permission: string;
  requires_owner_confirmation: boolean;
  evidence: EvidenceItem[];
  status: ActionProposalStatus;
  execution_result: unknown | null;
  proposed_at: string;
}

interface AgentHandoff {
  id: string;
  recommendation_id: string | null;
  title: string;
  prompt_markdown: string;
  suspected_repo_areas: string[];
  created_at: string;
}

interface GenerationResult {
  generated: number;
  refreshed: number;
  skipped: number;
  recommendations: Recommendation[];
}

interface BriefMessage {
  id: string;
  content: string;
  evidence: EvidenceItem[];
  citations: string[];
  stripped_claims_count: number;
}

const contextKinds: ContextKind[] = [
  'alert',
  'correlation',
  'deploy',
  'error',
  'health',
  'queue',
  'tenant',
];

const categories: RecommendationCategory[] = [
  'noise_reduction',
  'known_fix',
  'config_drift',
  'deploy_regression',
  'capacity',
  'cost',
  'security',
  'hygiene',
];

export default function PlatformRecommendationsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) ?? 'en';
  const [recommendations, setRecommendations] = React.useState<Recommendation[]>([]);
  const [proposals, setProposals] = React.useState<ActionProposal[]>([]);
  const [handoffs, setHandoffs] = React.useState<Record<string, AgentHandoff>>({});
  const [brief, setBrief] = React.useState<BriefMessage | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [briefing, setBriefing] = React.useState(false);
  const [workingIds, setWorkingIds] = React.useState<Record<string, boolean>>({});
  const queryContextKind = searchParams?.get('context_kind') ?? null;
  const [contextKind, setContextKind] = React.useState<ContextKind>(
    isContextKind(queryContextKind) ? queryContextKind : 'health',
  );
  const [contextId, setContextId] = React.useState(searchParams?.get('context_id') ?? 'overall');
  const [category, setCategory] = React.useState<RecommendationCategory | 'all'>('all');
  const [reasons, setReasons] = React.useState<Record<string, string>>({});

  const loadRecommendations = React.useCallback(async () => {
    try {
      setLoading(true);
      const [rows, proposalRows] = await Promise.all([
        apiClient<Recommendation[]>('/api/v1/admin/copilot/recommendations'),
        apiClient<ActionProposal[]>('/api/v1/admin/copilot/action-proposals'),
      ]);
      setRecommendations(rows);
      setProposals(proposalRows);
    } catch (err: unknown) {
      console.error('[PlatformRecommendationsPage.loadRecommendations]', err);
      toast.error(getErrorMessage(err, 'Failed to load recommendations.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRecommendations();
  }, [loadRecommendations]);

  async function generateRecommendation() {
    try {
      setGenerating(true);
      const body = {
        ...(category === 'all' ? {} : { category }),
        context: { id: contextId.trim(), kind: contextKind },
        trigger_source: 'recommendation_button',
      };
      const result = await apiClient<GenerationResult>(
        '/api/v1/admin/copilot/recommendations/generate',
        {
          body: JSON.stringify(body),
          method: 'POST',
        },
      );
      toast.success(
        `Generated ${result.generated}, refreshed ${result.refreshed}, skipped ${result.skipped}.`,
      );
      await loadRecommendations();
    } catch (err: unknown) {
      console.error('[PlatformRecommendationsPage.generateRecommendation]', err);
      toast.error(getErrorMessage(err, 'Failed to generate recommendations.'));
    } finally {
      setGenerating(false);
    }
  }

  async function createProposal(recommendation: Recommendation) {
    try {
      setWorking(recommendation.id, true);
      const proposal = await apiClient<ActionProposal>('/api/v1/admin/copilot/action-proposals', {
        body: JSON.stringify({ recommendation_id: recommendation.id }),
        method: 'POST',
      });
      setProposals((current) => [proposal, ...current]);
      toast.success('Supervised action proposal created.');
    } catch (err: unknown) {
      console.error('[PlatformRecommendationsPage.createProposal]', err);
      toast.error(getErrorMessage(err, 'Failed to create action proposal.'));
    } finally {
      setWorking(recommendation.id, false);
    }
  }

  async function approveProposal(proposal: ActionProposal, reason: string) {
    try {
      setWorking(proposal.id, true);
      await apiClient(`/api/v1/admin/copilot/action-proposals/${proposal.id}/approve`, {
        body: JSON.stringify({ reason }),
        method: 'POST',
      });
      toast.success('Supervised action approved and executed.');
      await loadRecommendations();
    } catch (err: unknown) {
      console.error('[PlatformRecommendationsPage.approveProposal]', err);
      toast.error(getErrorMessage(err, 'Failed to approve action proposal.'));
    } finally {
      setWorking(proposal.id, false);
    }
  }

  async function rejectProposal(proposal: ActionProposal, reason: string) {
    try {
      setWorking(proposal.id, true);
      await apiClient(`/api/v1/admin/copilot/action-proposals/${proposal.id}/reject`, {
        body: JSON.stringify({ reason }),
        method: 'POST',
      });
      toast.success('Supervised action rejected.');
      await loadRecommendations();
    } catch (err: unknown) {
      console.error('[PlatformRecommendationsPage.rejectProposal]', err);
      toast.error(getErrorMessage(err, 'Failed to reject action proposal.'));
    } finally {
      setWorking(proposal.id, false);
    }
  }

  async function createHandoff(recommendation: Recommendation) {
    try {
      setWorking(`handoff-${recommendation.id}`, true);
      const handoff = await apiClient<AgentHandoff>('/api/v1/admin/copilot/agent-handoffs', {
        body: JSON.stringify({ recommendation_id: recommendation.id }),
        method: 'POST',
      });
      setHandoffs((current) => ({ ...current, [recommendation.id]: handoff }));
      toast.success('Repo-agent handoff prompt generated.');
    } catch (err: unknown) {
      console.error('[PlatformRecommendationsPage.createHandoff]', err);
      toast.error(getErrorMessage(err, 'Failed to generate repo-agent handoff.'));
    } finally {
      setWorking(`handoff-${recommendation.id}`, false);
    }
  }

  function setWorking(id: string, value: boolean) {
    setWorkingIds((current) => ({ ...current, [id]: value }));
  }

  async function generateBrief() {
    try {
      setBriefing(true);
      const result = await apiClient<{ message: BriefMessage }>(
        '/api/v1/admin/copilot/briefs/daily',
        {
          body: JSON.stringify({ since_hours: 24 }),
          method: 'POST',
        },
      );
      setBrief(result.message);
      toast.success('Daily ops brief generated.');
    } catch (err: unknown) {
      console.error('[PlatformRecommendationsPage.generateBrief]', err);
      toast.error(getErrorMessage(err, 'Failed to generate daily ops brief.'));
    } finally {
      setBriefing(false);
    }
  }

  async function resolveRecommendation(recommendation: Recommendation, mode: 'accept' | 'dismiss') {
    const reason = reasons[recommendation.id]?.trim();
    if (!reason) {
      toast.error('Add a short reason first.');
      return;
    }
    try {
      await apiClient(`/api/v1/admin/copilot/recommendations/${recommendation.id}/${mode}`, {
        body: JSON.stringify({ reason }),
        method: 'POST',
      });
      toast.success(mode === 'accept' ? 'Recommendation accepted.' : 'Recommendation dismissed.');
      await loadRecommendations();
    } catch (err: unknown) {
      console.error('[PlatformRecommendationsPage.resolveRecommendation]', err);
      toast.error(getErrorMessage(err, 'Failed to update recommendation.'));
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title="Fix Recommendations"
        description="Manually generate citation-backed recommendations from selected platform evidence."
        actions={
          <Button type="button" variant="outline" onClick={() => void loadRecommendations()}>
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <section className="rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)_220px]">
            <label className="text-sm font-medium text-text-primary">
              Evidence source
              <Select
                value={contextKind}
                onValueChange={(value) => setContextKind(value as ContextKind)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contextKinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {labelize(kind)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="text-sm font-medium text-text-primary">
              Evidence id
              <Input
                className="mt-1 font-mono text-sm"
                value={contextId}
                onChange={(event) => setContextId(event.target.value)}
              />
            </label>
            <label className="text-sm font-medium text-text-primary">
              Category
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as RecommendationCategory | 'all')}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((item) => (
                    <SelectItem key={item} value={item}>
                      {labelize(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={generating || !contextId.trim()}
              onClick={() => void generateRecommendation()}
            >
              <Lightbulb className="me-2 h-4 w-4" />
              {generating ? 'Generating...' : 'Generate Recommendation'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={briefing}
              onClick={() => void generateBrief()}
            >
              <Bot className="me-2 h-4 w-4" />
              {briefing ? 'Briefing...' : 'Generate Daily Brief'}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-text-tertiary">
          Manual only. Generation uses existing evidence, topology, severity policy, citation
          stripping, prompt-injection scanning, and Copilot spend caps.
        </p>
      </section>

      {brief ? <DailyBriefCard brief={brief} locale={locale} /> : null}

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {loading ? (
          <div className="rounded-lg border border-border bg-surface p-5 text-sm text-text-secondary">
            Loading recommendations...
          </div>
        ) : null}
        {!loading && recommendations.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface p-8 text-center">
            <Lightbulb className="mx-auto h-10 w-10 text-text-tertiary" />
            <h2 className="mt-3 text-lg font-semibold text-text-primary">
              No active recommendations
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              Pick a specific evidence source above and generate a recommendation when you need one.
            </p>
          </div>
        ) : null}
        {recommendations.map((recommendation) => (
          <RecommendationCard
            key={recommendation.id}
            handoff={handoffs[recommendation.id]}
            locale={locale}
            proposal={proposals.find(
              (proposal) => proposal.recommendation_id === recommendation.id,
            )}
            recommendation={recommendation}
            reason={reasons[recommendation.id] ?? ''}
            working={Boolean(workingIds[recommendation.id])}
            workingHandoff={Boolean(workingIds[`handoff-${recommendation.id}`])}
            workingProposal={(id) => Boolean(workingIds[id])}
            onApproveProposal={(proposal, reason) => void approveProposal(proposal, reason)}
            onCreateHandoff={() => void createHandoff(recommendation)}
            onCreateProposal={() => void createProposal(recommendation)}
            onReasonChange={(value) =>
              setReasons((current) => ({ ...current, [recommendation.id]: value }))
            }
            onAccept={() => void resolveRecommendation(recommendation, 'accept')}
            onDismiss={() => void resolveRecommendation(recommendation, 'dismiss')}
            onProposalConfirmed={() => void loadRecommendations()}
            onRejectProposal={(proposal, reason) => void rejectProposal(proposal, reason)}
          />
        ))}
      </section>
    </div>
  );
}

function DailyBriefCard({ brief, locale }: { brief: BriefMessage; locale: string }) {
  const evidenceById = new Map(brief.evidence.map((item) => [item.id, item] as const));
  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary-700" />
        <h2 className="text-sm font-semibold text-text-primary">Daily Ops Brief</h2>
      </div>
      <div className="whitespace-pre-wrap text-sm leading-6 text-text-primary">
        {renderWithCitations(brief.content, evidenceById, locale)}
      </div>
      {brief.stripped_claims_count > 0 ? (
        <p className="mt-3 text-xs text-text-tertiary">
          {brief.stripped_claims_count} uncited claim
          {brief.stripped_claims_count === 1 ? '' : 's'} removed.
        </p>
      ) : null}
    </section>
  );
}

function RecommendationCard({
  handoff,
  locale,
  onAccept,
  onApproveProposal,
  onCreateHandoff,
  onCreateProposal,
  onDismiss,
  onReasonChange,
  onProposalConfirmed,
  onRejectProposal,
  reason,
  proposal,
  recommendation,
  working,
  workingHandoff,
  workingProposal,
}: {
  handoff?: AgentHandoff;
  locale: string;
  onAccept: () => void;
  onApproveProposal: (proposal: ActionProposal, reason: string) => void;
  onCreateHandoff: () => void;
  onCreateProposal: () => void;
  onDismiss: () => void;
  onReasonChange: (value: string) => void;
  onProposalConfirmed: () => void;
  onRejectProposal: (proposal: ActionProposal, reason: string) => void;
  reason: string;
  proposal?: ActionProposal;
  recommendation: Recommendation;
  working: boolean;
  workingHandoff: boolean;
  workingProposal: (id: string) => boolean;
}) {
  const evidenceById = new Map(recommendation.evidence.map((item) => [item.id, item] as const));
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="info">{labelize(recommendation.category)}</Badge>
            <Badge tone={riskTone(recommendation.risk_level)}>{recommendation.risk_level}</Badge>
            <Badge tone="neutral">{recommendation.confidence} confidence</Badge>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-text-primary">{recommendation.title}</h2>
          <p className="mt-1 text-xs text-text-tertiary">
            Refreshed {new Date(recommendation.last_refreshed_at).toLocaleString()}
          </p>
        </div>
        {recommendation.requires_owner_confirmation ? (
          <span className="inline-flex items-center rounded-full bg-warning-bg px-2 py-1 text-xs font-semibold text-warning-text">
            <ShieldCheck className="me-1 h-3.5 w-3.5" />
            Owner confirmation later
          </span>
        ) : null}
      </div>

      <div className="space-y-3 text-sm leading-6 text-text-primary">
        <div>{renderWithCitations(recommendation.summary, evidenceById, locale)}</div>
        <div className="rounded-lg bg-surface-secondary p-3">
          {renderWithCitations(recommendation.detailed_reasoning, evidenceById, locale)}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {recommendation.evidence.map((item) => (
          <Link
            key={item.id}
            href={`/${locale}${item.link}`}
            className="rounded-full border border-border bg-surface-secondary px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover"
            title={item.snippet}
          >
            {item.kind}:{item.id}
          </Link>
        ))}
      </div>

      {recommendation.requires_repo_agent_handoff ? (
        <div className="rounded-lg border border-info-text/20 bg-info-bg p-3 text-sm text-info-text">
          Repo-agent handoff candidate. The dashboard generates a prompt only; repository changes
          stay in the normal repo-agent workflow.
        </div>
      ) : null}

      {recommendation.proposed_action ? (
        <pre className="max-h-44 overflow-auto rounded-lg bg-background p-3 text-xs text-text-secondary">
          {JSON.stringify(recommendation.proposed_action, null, 2)}
        </pre>
      ) : null}

      <div className="border-t border-border pt-4">
        <Textarea
          className="min-h-20 text-base"
          placeholder="Reason for accepting, rejecting, or executing this recommendation"
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
        />
        {proposal ? (
          <ActionProposalCard
            locale={locale}
            onApprove={onApproveProposal}
            onConfirmed={onProposalConfirmed}
            onReject={onRejectProposal}
            proposal={proposal}
            reason={reason}
            working={workingProposal(proposal.id)}
          />
        ) : null}
        {handoff ? <RepoAgentHandoffPanel handoff={handoff} /> : null}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDismiss}>
            <XCircle className="me-2 h-4 w-4" />
            Dismiss
          </Button>
          {recommendation.requires_repo_agent_handoff ? (
            <Button
              type="button"
              variant="outline"
              disabled={workingHandoff}
              onClick={onCreateHandoff}
            >
              <FileText className="me-2 h-4 w-4" />
              {workingHandoff ? 'Generating...' : 'Repo-Agent Prompt'}
            </Button>
          ) : null}
          {!proposal ? (
            <Button type="button" variant="outline" disabled={working} onClick={onCreateProposal}>
              <ClipboardList className="me-2 h-4 w-4" />
              {working ? 'Creating...' : 'Create Proposal'}
            </Button>
          ) : null}
          <Button type="button" onClick={onAccept}>
            <CheckCircle2 className="me-2 h-4 w-4" />
            Accept Manually
          </Button>
        </div>
      </div>
    </article>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: 'danger' | 'info' | 'neutral' | 'warning';
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
        tone === 'danger' && 'bg-danger-bg text-danger-text',
        tone === 'info' && 'bg-info-bg text-info-text',
        tone === 'neutral' && 'bg-surface-secondary text-text-secondary',
        tone === 'warning' && 'bg-warning-bg text-warning-text',
      )}
    >
      {children}
    </span>
  );
}

function ActionProposalCard({
  locale,
  onApprove,
  onConfirmed,
  onReject,
  proposal,
  reason,
  working,
}: {
  locale: string;
  onApprove: (proposal: ActionProposal, reason: string) => void;
  onConfirmed: () => void;
  onReject: (proposal: ActionProposal, reason: string) => void;
  proposal: ActionProposal;
  reason: string;
  working: boolean;
}) {
  const canSubmit = reason.trim().length >= 12;
  const confirmationPhrase = `APPROVE ${proposal.action_kind.toUpperCase()}`;
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-secondary p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
            Supervised action proposal
          </p>
          <h3 className="mt-1 text-sm font-semibold text-text-primary">
            {labelize(proposal.action_kind)}
          </h3>
          <p className="mt-1 text-xs text-text-secondary">
            Requires {proposal.required_permission}
          </p>
        </div>
        <Badge tone={proposal.requires_owner_confirmation ? 'danger' : 'info'}>
          {proposal.requires_owner_confirmation ? 'Owner confirmation' : proposal.status}
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-text-primary">{proposal.reasoning}</p>
      <pre className="mt-3 max-h-36 overflow-auto rounded-lg bg-background p-3 text-xs text-text-secondary">
        {JSON.stringify(proposal.action_payload, null, 2)}
      </pre>
      <div className="mt-3 flex flex-wrap gap-2">
        {proposal.evidence.slice(0, 6).map((item) => (
          <Link
            key={`${proposal.id}-${item.id}`}
            href={`/${locale}${item.link}`}
            className="rounded-full border border-border bg-surface px-2 py-1 text-xs font-medium text-text-secondary hover:bg-surface-hover"
            title={item.snippet}
          >
            {item.kind}:{item.id}
          </Link>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={working || !canSubmit}
          onClick={() => onReject(proposal, reason.trim())}
        >
          Reject Proposal
        </Button>
        {proposal.requires_owner_confirmation ? (
          <OwnerActionConfirmDialog
            action={ownerAuditActionForProposal(proposal)}
            confirmationPhrase={confirmationPhrase}
            endpoint={`/api/v1/admin/copilot/action-proposals/${proposal.id}/approve`}
            payload={proposal.action_payload}
            summary={proposal.reasoning}
            targetLabel={proposal.target_resource_id ?? proposal.action_kind}
            targetResourceId={proposal.target_resource_id ?? undefined}
            targetResourceType={proposal.target_resource_type ?? proposal.action_kind}
            targetTenantId={proposal.target_tenant_id ?? undefined}
            title={`Approve ${labelize(proposal.action_kind)}`}
            onExecuted={onConfirmed}
          >
            <Button type="button" variant="destructive" disabled={working}>
              <ShieldCheck className="me-2 h-4 w-4" />
              Owner Confirm
            </Button>
          </OwnerActionConfirmDialog>
        ) : (
          <Button
            type="button"
            disabled={working || !canSubmit}
            onClick={() => onApprove(proposal, reason.trim())}
          >
            <CheckCircle2 className="me-2 h-4 w-4" />
            Approve and Execute
          </Button>
        )}
      </div>
    </div>
  );
}

function RepoAgentHandoffPanel({ handoff }: { handoff: AgentHandoff }) {
  return (
    <div className="mt-4 rounded-lg border border-info-text/20 bg-info-bg p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-info-text">
        <FileText className="h-4 w-4" />
        {handoff.title}
      </div>
      <p className="mt-1 text-xs text-info-text">
        Generated {new Date(handoff.created_at).toLocaleString()}.
      </p>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-3 text-xs leading-5 text-text-primary">
        {handoff.prompt_markdown}
      </pre>
    </div>
  );
}

function renderWithCitations(
  content: string,
  evidenceById: Map<string, EvidenceItem>,
  locale: string,
) {
  return content.split(/(\[E:[^\]]+\])/g).map((part, index) => {
    const match = part.match(/^\[E:([^\]]+)\]$/);
    if (!match) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    const evidenceId = match[1];
    if (!evidenceId) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    return (
      <Link
        key={`${part}-${index}`}
        href={`/${locale}${evidence.link}`}
        className="mx-1 inline-flex rounded-full bg-info-bg px-2 py-0.5 align-baseline text-xs font-semibold text-info-text hover:bg-surface-hover"
        title={evidence.snippet}
      >
        {evidenceId}
      </Link>
    );
  });
}

function isContextKind(value: string | null): value is ContextKind {
  return value !== null && contextKinds.includes(value as ContextKind);
}

function labelize(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function riskTone(risk: Recommendation['risk_level']): 'danger' | 'info' | 'warning' {
  if (risk === 'destructive') return 'danger';
  if (risk === 'caution') return 'warning';
  return 'info';
}

function ownerAuditActionForProposal(proposal: ActionProposal): PlatformAuditActionDto {
  if (proposal.action_kind === 'clean_queue') return 'queue_cleaned';
  if (proposal.action_kind === 'flush_global_cache') return 'cache_flushed_global';
  return 'cache_flushed_global';
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
