'use client';

import { Bot, Lock, MessageSquare, Plus, Send, Sparkles } from 'lucide-react';
import { useParams, useSearchParams } from 'next/navigation';
import * as React from 'react';

import { Button, Textarea, cn, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

type ContextKind =
  | 'alert'
  | 'correlation'
  | 'deploy'
  | 'error'
  | 'health'
  | 'incident'
  | 'queue'
  | 'sentry_issue'
  | 'tenant';

interface EvidenceItem {
  kind: string;
  id: string;
  link: string;
  occurred_at: string;
  snippet: string;
  raw: unknown;
}

interface CopilotMessage {
  id: string;
  role: 'operator' | 'assistant' | 'system';
  content: string;
  evidence: EvidenceItem[];
  citations: string[];
  stripped_claims_count: number;
  prompt_injection_attempts: number;
  created_at: string;
}

interface CopilotConversation {
  id: string;
  title: string | null;
  is_locked: boolean;
  locked_reason: string | null;
  total_cost_usd: string | number;
  created_at: string;
  last_message_at: string;
  messages?: CopilotMessage[];
}

interface CopilotContext {
  kind: ContextKind;
  id: string;
}

export default function PlatformCopilotPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) ?? 'en';
  const [conversations, setConversations] = React.useState<CopilotConversation[]>([]);
  const [activeConversation, setActiveConversation] = React.useState<CopilotConversation | null>(
    null,
  );
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const autoSentRef = React.useRef(false);

  const queryContext = React.useMemo(() => parseContext(searchParams), [searchParams]);
  const queryQuestion = searchParams?.get('question') ?? '';
  const queryConversationId = searchParams?.get('conversation_id') ?? '';

  const loadConversations = React.useCallback(async () => {
    try {
      setLoading(true);
      const rows = await apiClient<CopilotConversation[]>('/api/v1/admin/copilot/conversations');
      setConversations(rows);
      if (!queryContext && !queryConversationId && rows.length > 0) {
        setActiveConversation((current) => current ?? rows[0] ?? null);
      }
    } catch (err: unknown) {
      console.error('[PlatformCopilotPage.loadConversations]', err);
      toast.error(getErrorMessage(err, 'Failed to load Copilot conversations.'));
    } finally {
      setLoading(false);
    }
  }, [queryContext, queryConversationId]);

  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  React.useEffect(() => {
    if (!queryContext || autoSentRef.current) return;
    autoSentRef.current = true;
    void startConversation(queryContext, queryQuestion || defaultQuestion(queryContext.kind));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the query-triggered Explain action.
  }, []);

  React.useEffect(() => {
    if (!queryConversationId) return;
    void loadConversation(queryConversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load only when explicitly linked.
  }, [queryConversationId]);

  async function startConversation(context?: CopilotContext, firstQuestion?: string) {
    try {
      setSending(Boolean(firstQuestion));
      const conversation = await apiClient<CopilotConversation>(
        '/api/v1/admin/copilot/conversations',
        {
          body: JSON.stringify({ context, type: 'diagnostic' }),
          method: 'POST',
        },
      );
      setActiveConversation({ ...conversation, messages: [] });
      setConversations((current) => [conversation, ...current]);
      if (firstQuestion) {
        await sendMessage(conversation.id, firstQuestion, context);
      }
    } catch (err: unknown) {
      console.error('[PlatformCopilotPage.startConversation]', err);
      toast.error(getErrorMessage(err, 'Failed to start Copilot conversation.'));
    } finally {
      setSending(false);
    }
  }

  async function loadConversation(id: string) {
    try {
      const detail = await apiClient<CopilotConversation>(
        `/api/v1/admin/copilot/conversations/${id}`,
      );
      setActiveConversation(detail);
    } catch (err: unknown) {
      console.error('[PlatformCopilotPage.loadConversation]', err);
      toast.error(getErrorMessage(err, 'Failed to load Copilot conversation.'));
    }
  }

  async function sendCurrentMessage() {
    const trimmed = input.trim();
    if (!trimmed || !activeConversation || sending) return;
    setInput('');
    await sendMessage(activeConversation.id, trimmed, queryContext ?? undefined);
  }

  async function sendMessage(id: string, content: string, context?: CopilotContext) {
    try {
      setSending(true);
      const operatorMessage: CopilotMessage = {
        id: `local-${Date.now()}`,
        role: 'operator',
        content,
        evidence: [],
        citations: [],
        stripped_claims_count: 0,
        prompt_injection_attempts: 0,
        created_at: new Date().toISOString(),
      };
      setActiveConversation((current) =>
        current
          ? { ...current, messages: [...(current.messages ?? []), operatorMessage] }
          : current,
      );
      const assistantMessage = await apiClient<CopilotMessage>(
        `/api/v1/admin/copilot/conversations/${id}/messages`,
        {
          body: JSON.stringify({ content, context }),
          method: 'POST',
        },
      );
      setActiveConversation((current) =>
        current
          ? { ...current, messages: [...(current.messages ?? []), assistantMessage] }
          : current,
      );
      await loadConversations();
    } catch (err: unknown) {
      console.error('[PlatformCopilotPage.sendMessage]', err);
      toast.error(getErrorMessage(err, 'Failed to send Copilot message.'));
    } finally {
      setSending(false);
    }
  }

  const visibleMessages = (activeConversation?.messages ?? []).filter(
    (message) => message.role !== 'system',
  );
  const latestAssistant = [...visibleMessages]
    .reverse()
    .find((message) => message.role === 'assistant');
  const evidenceById = new Map(
    (latestAssistant?.evidence ?? []).map((item) => [item.id, item] as const),
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Incident Copilot"
        description="Ask read-only diagnostic questions grounded in platform evidence and citations."
        actions={
          <Button type="button" onClick={() => void startConversation()}>
            <Plus className="me-2 h-4 w-4" />
            New conversation
          </Button>
        }
      />

      <div className="grid min-h-[680px] gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        <aside className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-text-primary">
            Conversations
          </div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {loading ? <p className="p-3 text-sm text-text-secondary">Loading...</p> : null}
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={cn(
                  'flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-start text-sm transition-colors',
                  activeConversation?.id === conversation.id
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary',
                )}
                onClick={() => void loadConversation(conversation.id)}
              >
                <span className="line-clamp-2 font-medium">
                  {conversation.title ?? 'Diagnostic conversation'}
                </span>
                <span className="text-xs text-text-tertiary">
                  {new Date(conversation.last_message_at).toLocaleString()}
                </span>
              </button>
            ))}
            {!loading && conversations.length === 0 ? (
              <p className="p-3 text-sm text-text-secondary">No conversations yet.</p>
            ) : null}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {activeConversation?.is_locked ? (
            <div className="flex items-center gap-2 border-b border-warning-200 bg-warning-bg px-4 py-3 text-sm text-warning-text">
              <Lock className="h-4 w-4" />
              {activeConversation.locked_reason ?? 'Conversation budget reached.'}
            </div>
          ) : null}

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {visibleMessages.length === 0 ? (
              <EmptyState onStart={() => void startConversation()} />
            ) : null}
            {visibleMessages.map((message) => (
              <MessageBubble key={message.id} locale={locale} message={message} />
            ))}
            {sending ? (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <Sparkles className="h-4 w-4 animate-pulse" />
                Reading evidence...
              </div>
            ) : null}
          </div>

          <div className="border-t border-border p-3">
            <div className="flex flex-col gap-2">
              <Textarea
                className="min-h-24 resize-none text-base"
                disabled={!activeConversation || activeConversation.is_locked || sending}
                placeholder={
                  activeConversation
                    ? 'Ask what changed, what is affected, or which cited runbook applies...'
                    : 'Start a conversation to ask the Copilot...'
                }
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void sendCurrentMessage();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-text-tertiary">
                  Manual only. Every answer is citation-checked before it is stored.
                </p>
                <Button
                  type="button"
                  disabled={!input.trim() || !activeConversation || sending}
                  onClick={() => void sendCurrentMessage()}
                >
                  <Send className="me-2 h-4 w-4" />
                  Send
                </Button>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-text-primary">
            Cited Evidence
          </div>
          <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
            {latestAssistant?.citations?.length ? (
              latestAssistant.citations.map((id) => {
                const evidence = evidenceById.get(id);
                return evidence ? (
                  <EvidenceCard key={id} evidence={evidence} locale={locale} />
                ) : null;
              })
            ) : (
              <p className="text-sm text-text-secondary">Citations appear after an answer.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
      <Bot className="h-10 w-10 text-text-tertiary" />
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Ask from evidence</h2>
        <p className="mt-1 max-w-md text-sm text-text-secondary">
          Start a conversation, then ask what is broken, what changed, or which runbook applies.
        </p>
      </div>
      <Button type="button" variant="outline" onClick={onStart}>
        <MessageSquare className="me-2 h-4 w-4" />
        Start conversation
      </Button>
    </div>
  );
}

function MessageBubble({ locale, message }: { locale: string; message: CopilotMessage }) {
  const isAssistant = message.role === 'assistant';
  const evidenceById = new Map(message.evidence.map((item) => [item.id, item] as const));
  return (
    <article className={cn('flex', isAssistant ? 'justify-start' : 'justify-end')}>
      <div
        className={cn(
          'max-w-[760px] rounded-lg px-4 py-3 text-sm leading-6',
          isAssistant
            ? 'border border-border bg-surface-secondary text-text-primary'
            : 'bg-primary-700 text-white',
        )}
      >
        <div className="whitespace-pre-wrap">
          {renderWithCitations(message.content, evidenceById, locale)}
        </div>
        {isAssistant && message.stripped_claims_count > 0 ? (
          <p className="mt-3 text-xs text-text-tertiary">
            {message.stripped_claims_count} uncited claim
            {message.stripped_claims_count === 1 ? '' : 's'} removed.
          </p>
        ) : null}
        {message.prompt_injection_attempts > 0 ? (
          <p className="mt-2 rounded-md bg-warning-bg px-2 py-1 text-xs text-warning-text">
            Prompt-injection-shaped evidence was detected and treated as data.
          </p>
        ) : null}
      </div>
    </article>
  );
}

function EvidenceCard({ evidence, locale }: { evidence: EvidenceItem; locale: string }) {
  return (
    <a
      href={`/${locale}${evidence.link}`}
      className="block rounded-lg border border-border bg-surface-secondary p-3 text-sm transition-colors hover:border-border-strong hover:bg-surface-hover"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-info-bg px-2 py-0.5 text-xs font-semibold text-info-text">
          {evidence.kind}
        </span>
        <span className="text-xs text-text-tertiary">
          {new Date(evidence.occurred_at).toLocaleTimeString()}
        </span>
      </div>
      <p className="mt-2 line-clamp-3 text-text-primary">{evidence.snippet}</p>
      <p className="mt-1 break-all font-mono text-xs text-text-tertiary">{evidence.id}</p>
    </a>
  );
}

function renderWithCitations(
  content: string,
  evidenceById: Map<string, EvidenceItem>,
  locale: string,
) {
  const parts = content.split(/(\[E:[^\]]+\])/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[E:([^\]]+)\]$/);
    if (!match) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    const evidenceId = match[1];
    if (!evidenceId) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    const evidence = evidenceById.get(evidenceId);
    if (!evidence) return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    return (
      <a
        key={`${part}-${index}`}
        href={`/${locale}${evidence.link}`}
        className="mx-1 inline-flex rounded-full bg-info-bg px-2 py-0.5 align-baseline text-xs font-semibold text-info-text hover:bg-surface-hover"
        title={evidence.snippet}
      >
        {evidenceId}
      </a>
    );
  });
}

function parseContext(
  searchParams: { get: (key: string) => string | null } | null,
): CopilotContext | null {
  if (!searchParams) return null;
  const kind = searchParams.get('context_kind');
  const id = searchParams.get('context_id');
  if (!kind || !id || !isContextKind(kind)) return null;
  return { kind, id };
}

function isContextKind(value: string): value is ContextKind {
  return [
    'alert',
    'correlation',
    'deploy',
    'error',
    'health',
    'incident',
    'queue',
    'sentry_issue',
    'tenant',
  ].includes(value);
}

function defaultQuestion(kind: ContextKind): string {
  return `Explain this ${kind}. What does the cited evidence show, what changed nearby, and which evidence gaps or cited runbooks apply?`;
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
