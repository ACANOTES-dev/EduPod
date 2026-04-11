'use client';

import { Lock, Flag, Flame, History } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Badge, Button, StatusBadge, toast } from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { FlagReviewModal } from './_components/flag-review-modal';
import { FreezeDialog } from './_components/freeze-dialog';
import { OversightBanner } from './_components/oversight-banner';
import type {
  MessageFlagReviewState,
  OversightAuditEntry,
  OversightFlagSummary,
  OversightThreadSummary,
  Paginated,
} from './_components/oversight-types';

type TabKey = 'conversations' | 'flags' | 'audit';

const TABS: Array<{ key: TabKey; icon: typeof Lock }> = [
  { key: 'conversations', icon: History },
  { key: 'flags', icon: Flag },
  { key: 'audit', icon: History },
];

const SEVERITY_VARIANT: Record<string, 'neutral' | 'info' | 'warning' | 'success'> = {
  low: 'neutral',
  medium: 'warning',
  high: 'warning',
};

const REVIEW_STATE_VARIANT: Record<
  MessageFlagReviewState,
  'neutral' | 'info' | 'warning' | 'success'
> = {
  pending: 'warning',
  dismissed: 'neutral',
  escalated: 'info',
  frozen: 'neutral',
};

const PAGE_SIZE = 20;

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

// Success toast with a clickable action that opens the presigned PDF
// URL in a new tab. The URL expires after an hour (impl 05), so if the
// admin misses the toast they can re-trigger the escalate action.
function toastWithLink(message: string, url: string, linkLabel: string): void {
  toast.success(message, {
    action: {
      label: linkLabel,
      onClick: () => {
        window.open(url, '_blank', 'noopener,noreferrer');
      },
    },
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OversightDashboardPage() {
  const t = useTranslations('inbox.oversight');
  const router = useRouter();

  const [activeTab, setActiveTab] = React.useState<TabKey>('conversations');

  // Reset pagination when the tab changes. Each tab tracks its own page.
  const [convPage, setConvPage] = React.useState(1);
  const [flagPage, setFlagPage] = React.useState(1);
  const [auditPage, setAuditPage] = React.useState(1);

  // ─── Conversations state ──────────────────────────────────────────────────
  const [conversations, setConversations] = React.useState<OversightThreadSummary[]>([]);
  const [convTotal, setConvTotal] = React.useState(0);
  const [convLoading, setConvLoading] = React.useState(false);

  // ─── Flags state ──────────────────────────────────────────────────────────
  const [flags, setFlags] = React.useState<OversightFlagSummary[]>([]);
  const [flagTotal, setFlagTotal] = React.useState(0);
  const [flagLoading, setFlagLoading] = React.useState(false);
  const [flagState, setFlagState] = React.useState<MessageFlagReviewState>('pending');
  const [flagModal, setFlagModal] = React.useState<{
    open: boolean;
    flagId: string | null;
    action: 'dismiss' | 'escalate';
  }>({ open: false, flagId: null, action: 'dismiss' });
  const [freezeTarget, setFreezeTarget] = React.useState<string | null>(null);

  // ─── Audit state ──────────────────────────────────────────────────────────
  const [auditEntries, setAuditEntries] = React.useState<OversightAuditEntry[]>([]);
  const [auditTotal, setAuditTotal] = React.useState(0);
  const [auditLoading, setAuditLoading] = React.useState(false);

  // ─── Fetchers ─────────────────────────────────────────────────────────────
  const fetchConversations = React.useCallback(async () => {
    setConvLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(convPage),
        pageSize: String(PAGE_SIZE),
      });
      const res = await apiClient<Paginated<OversightThreadSummary>>(
        `/api/v1/inbox/oversight/conversations?${params.toString()}`,
      );
      setConversations(res.data);
      setConvTotal(res.meta.total);
    } catch (err) {
      console.error('[OversightDashboard.fetchConversations]', err);
      setConversations([]);
      setConvTotal(0);
    } finally {
      setConvLoading(false);
    }
  }, [convPage]);

  const fetchFlags = React.useCallback(async () => {
    setFlagLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(flagPage),
        pageSize: String(PAGE_SIZE),
        review_state: flagState,
      });
      const res = await apiClient<Paginated<OversightFlagSummary>>(
        `/api/v1/inbox/oversight/flags?${params.toString()}`,
      );
      setFlags(res.data);
      setFlagTotal(res.meta.total);
    } catch (err) {
      console.error('[OversightDashboard.fetchFlags]', err);
      setFlags([]);
      setFlagTotal(0);
    } finally {
      setFlagLoading(false);
    }
  }, [flagPage, flagState]);

  const fetchAudit = React.useCallback(async () => {
    setAuditLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(auditPage),
        pageSize: String(PAGE_SIZE),
      });
      const res = await apiClient<Paginated<OversightAuditEntry>>(
        `/api/v1/inbox/oversight/audit-log?${params.toString()}`,
      );
      setAuditEntries(res.data);
      setAuditTotal(res.meta.total);
    } catch (err) {
      console.error('[OversightDashboard.fetchAudit]', err);
      setAuditEntries([]);
      setAuditTotal(0);
    } finally {
      setAuditLoading(false);
    }
  }, [auditPage]);

  React.useEffect(() => {
    if (activeTab === 'conversations') void fetchConversations();
  }, [activeTab, fetchConversations]);

  React.useEffect(() => {
    if (activeTab === 'flags') void fetchFlags();
  }, [activeTab, fetchFlags]);

  React.useEffect(() => {
    if (activeTab === 'audit') void fetchAudit();
  }, [activeTab, fetchAudit]);

  // ─── Columns ──────────────────────────────────────────────────────────────
  const conversationColumns = React.useMemo(
    () => [
      {
        key: 'subject',
        header: t('columns.subject'),
        render: (row: OversightThreadSummary) => (
          <span className="font-medium text-text-primary">
            {row.subject ?? t('columns.untitledSubject')}
          </span>
        ),
      },
      {
        key: 'kind',
        header: t('columns.kind'),
        render: (row: OversightThreadSummary) => (
          <Badge variant="secondary">{t(`kinds.${row.kind}`)}</Badge>
        ),
      },
      {
        key: 'participants',
        header: t('columns.participants'),
        render: (row: OversightThreadSummary) => (
          <span className="text-sm text-text-secondary">{row.participant_count}</span>
        ),
      },
      {
        key: 'last_message',
        header: t('columns.lastMessage'),
        render: (row: OversightThreadSummary) => (
          <span className="text-sm text-text-secondary">{formatDate(row.last_message_at)}</span>
        ),
      },
      {
        key: 'state',
        header: t('columns.state'),
        render: (row: OversightThreadSummary) => (
          <div className="flex flex-wrap items-center gap-1">
            {row.frozen_at ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" /> {t('badges.frozen')}
              </Badge>
            ) : null}
            {row.has_pending_flag ? (
              <Badge variant="secondary" className="gap-1 text-amber-700">
                <Flag className="h-3 w-3" /> {t('badges.flagged')}
              </Badge>
            ) : null}
            {row.flag_count > 0 && !row.has_pending_flag ? (
              <span className="text-xs text-text-secondary">
                {t('badges.flagCount', { count: row.flag_count })}
              </span>
            ) : null}
          </div>
        ),
      },
    ],
    [t],
  );

  const flagColumns = React.useMemo(
    () => [
      {
        key: 'keywords',
        header: t('columns.keywords'),
        render: (row: OversightFlagSummary) => (
          <div className="flex flex-wrap gap-1">
            {row.matched_keywords.slice(0, 6).map((kw) => (
              <Badge key={kw} variant="secondary" className="text-xs">
                {kw}
              </Badge>
            ))}
            {row.matched_keywords.length > 6 ? (
              <span className="text-xs text-text-secondary">
                +{row.matched_keywords.length - 6}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: 'severity',
        header: t('columns.severity'),
        render: (row: OversightFlagSummary) => (
          <StatusBadge status={SEVERITY_VARIANT[row.highest_severity] ?? 'neutral'} dot>
            {t(`severity.${row.highest_severity}`)}
          </StatusBadge>
        ),
      },
      {
        key: 'participants',
        header: t('columns.participants'),
        render: (row: OversightFlagSummary) => (
          <span className="truncate text-sm text-text-secondary">
            {row.participants.map((p) => p.display_name).join(', ')}
          </span>
        ),
      },
      {
        key: 'state',
        header: t('columns.reviewState'),
        render: (row: OversightFlagSummary) => (
          <StatusBadge status={REVIEW_STATE_VARIANT[row.review_state] ?? 'neutral'} dot>
            {t(`reviewStates.${row.review_state}`)}
          </StatusBadge>
        ),
      },
      {
        key: 'created',
        header: t('columns.createdAt'),
        render: (row: OversightFlagSummary) => (
          <span className="text-xs text-text-secondary">{formatDate(row.created_at)}</span>
        ),
      },
      {
        key: 'actions',
        header: '',
        render: (row: OversightFlagSummary) => (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/inbox/oversight/threads/${row.conversation_id}?flag=${row.id}`);
              }}
            >
              {t('actions.open')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setFlagModal({ open: true, flagId: row.id, action: 'dismiss' });
              }}
            >
              {t('actions.dismissFlag')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setFlagModal({ open: true, flagId: row.id, action: 'escalate' });
              }}
            >
              <Flame className="me-1 h-3 w-3" />
              {t('actions.escalateFlag')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setFreezeTarget(row.conversation_id);
              }}
            >
              <Lock className="me-1 h-3 w-3" />
              {t('actions.freeze')}
            </Button>
          </div>
        ),
      },
    ],
    [router, t],
  );

  const auditColumns = React.useMemo(
    () => [
      {
        key: 'created',
        header: t('columns.timestamp'),
        render: (row: OversightAuditEntry) => (
          <span className="text-xs text-text-secondary">{formatDate(row.created_at)}</span>
        ),
      },
      {
        key: 'actor',
        header: t('columns.actor'),
        render: (row: OversightAuditEntry) => (
          <span className="font-mono text-xs text-text-secondary">
            {row.actor_user_id.slice(0, 8)}
          </span>
        ),
      },
      {
        key: 'action',
        header: t('columns.action'),
        render: (row: OversightAuditEntry) => (
          <Badge variant="secondary" className="text-xs">
            {t(`audit.actions.${row.action}`)}
          </Badge>
        ),
      },
      {
        key: 'conversation',
        header: t('columns.conversation'),
        render: (row: OversightAuditEntry) => (
          <span className="font-mono text-xs text-text-secondary">
            {row.conversation_id ? row.conversation_id.slice(0, 8) : '—'}
          </span>
        ),
      },
    ],
    [t],
  );

  // ─── Tab bar ──────────────────────────────────────────────────────────────
  const tabBar = (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-border">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 border-b-2 -mb-px px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Icon className="h-4 w-4" />
            {t(`tabs.${tab.key}`)}
          </button>
        );
      })}
    </div>
  );

  // ─── Flag state filter ────────────────────────────────────────────────────
  const flagStateToolbar = (
    <div className="flex items-center gap-2">
      {(['pending', 'dismissed', 'escalated', 'frozen'] as const).map((state) => (
        <button
          key={state}
          onClick={() => {
            setFlagState(state);
            setFlagPage(1);
          }}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            flagState === state
              ? 'bg-primary-600 text-white'
              : 'bg-surface-muted text-text-secondary hover:text-text-primary'
          }`}
        >
          {t(`reviewStates.${state}`)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <OversightBanner />

      {tabBar}

      {activeTab === 'conversations' ? (
        <DataTable
          columns={conversationColumns}
          data={conversations}
          page={convPage}
          pageSize={PAGE_SIZE}
          total={convTotal}
          onPageChange={setConvPage}
          onRowClick={(row) => router.push(`/inbox/oversight/threads/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={convLoading}
        />
      ) : null}

      {activeTab === 'flags' ? (
        <>
          {flagStateToolbar}
          <DataTable
            columns={flagColumns}
            data={flags}
            page={flagPage}
            pageSize={PAGE_SIZE}
            total={flagTotal}
            onPageChange={setFlagPage}
            onRowClick={(row) =>
              router.push(`/inbox/oversight/threads/${row.conversation_id}?flag=${row.id}`)
            }
            keyExtractor={(row) => row.id}
            isLoading={flagLoading}
          />
        </>
      ) : null}

      {activeTab === 'audit' ? (
        <DataTable
          columns={auditColumns}
          data={auditEntries}
          page={auditPage}
          pageSize={PAGE_SIZE}
          total={auditTotal}
          onPageChange={setAuditPage}
          keyExtractor={(row) => row.id}
          isLoading={auditLoading}
        />
      ) : null}

      <FlagReviewModal
        open={flagModal.open}
        action={flagModal.action}
        flagId={flagModal.flagId}
        onOpenChange={(open) => setFlagModal((s) => ({ ...s, open }))}
        onDone={(result) => {
          if (result?.export_url) {
            toastWithLink(t('flag.escalatedWithLink'), result.export_url, t('flag.downloadPdf'));
          }
          void fetchFlags();
        }}
      />

      <FreezeDialog
        open={freezeTarget !== null}
        conversationId={freezeTarget}
        onOpenChange={(open) => {
          if (!open) setFreezeTarget(null);
        }}
        onFrozen={() => {
          setFreezeTarget(null);
          void fetchFlags();
          void fetchConversations();
        }}
      />
    </div>
  );
}
