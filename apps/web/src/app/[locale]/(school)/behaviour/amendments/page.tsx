'use client';

import { ArrowLeft, CheckCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useIsMobile } from '@/hooks/use-is-mobile';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WhatChangedEntry {
  field: string;
  old_value: string | null;
  new_value: string | null;
}

interface AmendmentRow {
  id: string;
  entity_type: string;
  entity_id: string;
  amendment_type: string;
  what_changed: WhatChangedEntry[];
  change_reason: string;
  changed_by_id: string;
  correction_notification_sent: boolean;
  correction_notification_sent_at: string | null;
  requires_parent_reacknowledgement: boolean;
  created_at: string;
  changed_by: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
}

interface AmendmentsResponse {
  data: AmendmentRow[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Badge Colors ─────────────────────────────────────────────────────────────

const AMENDMENT_TYPE_COLORS: Record<string, string> = {
  correction: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  supersession: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  retraction: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatFieldName(field: string): string {
  return field
    .replace(/_id$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderChangeSummary(changes: WhatChangedEntry[]): string {
  if (!changes || changes.length === 0) return '--';
  const first = changes[0];
  if (!first) return '--';
  const fieldName = formatFieldName(first.field);
  const oldVal = first.old_value ?? 'none';
  const newVal = first.new_value ?? 'none';
  const summary = `${fieldName} changed from "${oldVal}" to "${newVal}"`;
  if (changes.length > 1) {
    return `${summary} (+${changes.length - 1} more)`;
  }
  return summary;
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

const TAB_KEYS = ['pending', 'all'] as const;

type TabKey = (typeof TAB_KEYS)[number];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AmendmentListPage() {
  const t = useTranslations('behaviour.amendments');
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  const [data, setData] = React.useState<AmendmentRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<TabKey>('pending');

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [selectedAmendment, setSelectedAmendment] = React.useState<AmendmentRow | null>(null);
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState('');

  const isMobile = useIsMobile();

  // Fetch amendments
  const fetchAmendments = React.useCallback(async (p: number, tab: TabKey) => {
    setIsLoading(true);
    try {
      const endpoint =
        tab === 'pending'
          ? `/api/v1/behaviour/amendments/pending?page=${p}&pageSize=${PAGE_SIZE}`
          : `/api/v1/behaviour/amendments?page=${p}&pageSize=${PAGE_SIZE}`;
      const res = await apiClient<AmendmentsResponse>(endpoint);
      setData(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch (err) {
      console.error('[BehaviourAmendmentsPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAmendments(page, activeTab);
  }, [page, activeTab, fetchAmendments]);

  const handleTabChange = (tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  };

  // ─── Send Correction ────────────────────────────────────────────────────

  const handleOpenConfirm = (amendment: AmendmentRow) => {
    setSelectedAmendment(amendment);
    setSendError('');
    setConfirmOpen(true);
  };

  const handleSendCorrection = async () => {
    if (!selectedAmendment) return;
    setSending(true);
    setSendError('');
    try {
      await apiClient(`/api/v1/behaviour/amendments/${selectedAmendment.id}/send-correction`, {
        method: 'POST',
      });
      setConfirmOpen(false);
      setSelectedAmendment(null);
      // Refresh list
      void fetchAmendments(page, activeTab);
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSendError(ex?.error?.message ?? 'Failed to send correction');
    } finally {
      setSending(false);
    }
  };

  // ─── Entity Reference ───────────────────────────────────────────────────

  const getEntityRef = (row: AmendmentRow): string => {
    // The entity_type is 'incident' or 'sanction' — show entity_id shortened
    return `${formatLabel(row.entity_type)} #${row.entity_id.slice(0, 8)}`;
  };

  // ─── DataTable columns ──────────────────────────────────────────────────

  const columns = [
    {
      key: 'entity',
      header: t('columns.entity'),
      render: (row: AmendmentRow) => (
        <span className="text-sm font-medium text-text-primary">{getEntityRef(row)}</span>
      ),
    },
    {
      key: 'amendment_type',
      header: t('columns.type'),
      render: (row: AmendmentRow) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${AMENDMENT_TYPE_COLORS[row.amendment_type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
        >
          {formatLabel(row.amendment_type)}
        </span>
      ),
    },
    {
      key: 'what_changed',
      header: t('columns.changeSummary'),
      render: (row: AmendmentRow) => (
        <span className="text-sm text-text-secondary">{renderChangeSummary(row.what_changed)}</span>
      ),
    },
    {
      key: 'changed_by',
      header: t('columns.changedBy'),
      render: (row: AmendmentRow) =>
        row.changed_by ? (
          <span className="text-sm text-text-secondary">
            {row.changed_by.first_name} {row.changed_by.last_name}
          </span>
        ) : (
          <span className="text-text-tertiary">--</span>
        ),
    },
    {
      key: 'created_at',
      header: t('columns.date'),
      render: (row: AmendmentRow) => (
        <span className="font-mono text-xs text-text-secondary">
          {formatDateTime(row.created_at)}
        </span>
      ),
    },
    {
      key: 'reack',
      header: t('columns.reAck'),
      render: (row: AmendmentRow) =>
        row.requires_parent_reacknowledgement ? (
          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {t('reAckRequired')}
          </span>
        ) : null,
    },
    {
      key: 'action',
      header: '',
      render: (row: AmendmentRow) =>
        !row.correction_notification_sent ? (
          <Button
            variant="outline"
            size="sm"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleOpenConfirm(row);
            }}
          >
            <Send className="me-1 h-3.5 w-3.5" />{t('send')}</Button>
        ) : (
          <span className="text-xs text-green-600 dark:text-green-400">{t('sent')}</span>
        ),
    },
  ];

  // ─── Mobile Card ────────────────────────────────────────────────────────

  const renderMobileCard = (row: AmendmentRow) => (
    <div key={row.id} className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-text-primary">{getEntityRef(row)}</span>
          <div className="mt-1 flex flex-wrap gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${AMENDMENT_TYPE_COLORS[row.amendment_type] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}
            >
              {formatLabel(row.amendment_type)}
            </span>
            {row.requires_parent_reacknowledgement && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                {t('reAckRequired')}
              </span>
            )}
          </div>
        </div>
        {!row.correction_notification_sent ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => handleOpenConfirm(row)}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <span className="text-xs text-green-600 dark:text-green-400">{t('sent')}</span>
        )}
      </div>
      <p className="mt-2 text-xs text-text-secondary">{renderChangeSummary(row.what_changed)}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
        <span>
          {row.changed_by ? `${row.changed_by.first_name} ${row.changed_by.last_name}` : '--'}
        </span>
        <span>{formatDateTime(row.created_at)}</span>
      </div>
    </div>
  );

  // ─── Empty State ────────────────────────────────────────────────────────

  const emptyState =
    activeTab === 'pending' ? (
      <div className="rounded-xl border border-border bg-surface py-12 text-center">
        <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
        <p className="mt-2 text-sm font-medium text-text-primary">{t('noCorrectionsPending')}</p>
        <p className="mt-1 text-xs text-text-tertiary">{t('allNoticesSent')}</p>
      </div>
    ) : (
      <div className="rounded-xl border border-border bg-surface py-12 text-center">
        <p className="text-sm text-text-tertiary">{t('noResults')}</p>
      </div>
    );

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href={`/${locale}/behaviour`}>
            <Button variant="ghost">
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {t('back')}
            </Button>
          </Link>
        }
      />

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {TAB_KEYS.map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => handleTabChange(tabKey)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tabKey
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {t(`tabs.${tabKey}` as Parameters<typeof t>[0])}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: Cards / Desktop: Table */}
      {isMobile ? (
        <div>
          <div className="space-y-2">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
                ))
              : data.length === 0
                ? emptyState
                : data.map(renderMobileCard)}
          </div>
          {/* Mobile pagination */}
          {total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-text-secondary">
              <span>{t('pageOf', { page, total: Math.ceil(total / PAGE_SIZE) })}</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  {t('previous')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= Math.ceil(total / PAGE_SIZE)}
                  onClick={() => setPage(page + 1)}
                >
                  {t('next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : data.length === 0 && !isLoading ? (
        emptyState
      ) : (
        <DataTable
          columns={columns}
          data={data}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* Send Correction Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('sendCorrectionTitle')}</DialogTitle>
          </DialogHeader>
          {selectedAmendment && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-text-secondary">{t('sendCorrectionDescription')}</p>
              <div className="rounded-lg bg-surface-secondary p-3">
                <p className="text-sm font-medium text-text-primary">
                  {getEntityRef(selectedAmendment)}
                </p>
                <div className="mt-2 space-y-1">
                  {selectedAmendment.what_changed.map((change, idx) => (
                    <p key={idx} className="text-xs text-text-secondary">
                      <span className="font-medium">{formatFieldName(change.field)}</span>: &ldquo;
                      {change.old_value ?? 'none'}&rdquo; &rarr; &ldquo;{change.new_value ?? 'none'}
                      &rdquo;
                    </p>
                  ))}
                </div>
                {selectedAmendment.requires_parent_reacknowledgement && (
                  <div className="mt-2">
                    <Badge
                      variant="danger"
                      className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    >
                      {t('parentReAckRequired')}
                    </Badge>
                  </div>
                )}
              </div>
              {sendError && <p className="text-sm text-red-600 dark:text-red-400">{sendError}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={sending}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSendCorrection} disabled={sending}>
              {sending ? t('sending') : t('confirmSend')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
