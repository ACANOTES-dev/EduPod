'use client';

import { RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { getErrorMessage } from '../_components/status-badge';
import type { PaginatedResponse, SentryWebhookAuditRow } from '../_components/types';

const PAGE_SIZE = 50;

export default function PlatformSentryAuditPage() {
  const params = useParams();
  const locale = (params?.locale as string) ?? 'en';
  const [rows, setRows] = React.useState<SentryWebhookAuditRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const loadRows = React.useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiClient<PaginatedResponse<SentryWebhookAuditRow>>(
        `/api/v1/admin/sentry/webhook-audit?page=1&pageSize=${PAGE_SIZE}`,
      );
      setRows(result.data);
    } catch (err: unknown) {
      console.error('[PlatformSentryAuditPage.loadRows]', err);
      toast.error(getErrorMessage(err, 'Failed to load Sentry webhook audit rows.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRows();
  }, [loadRows]);

  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        title="Sentry Webhook Audit"
        description="Receipt audit for signed Sentry webhooks, duplicate detection, and processing outcomes."
        actions={
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={`/${locale}/admin/sentry`}>Issues</Link>
            </Button>
            <Button size="sm" variant="outline" onClick={() => void loadRows()}>
              <RefreshCw className="me-1.5 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        }
      />
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-[0.9fr_0.7fr_0.6fr_0.5fr_1.2fr] gap-4 border-b border-border bg-surface-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          <span>Received</span>
          <span>Kind</span>
          <span>Signature</span>
          <span>Replay</span>
          <span>Outcome</span>
        </div>
        {loading ? (
          <div className="px-4 py-10 text-sm text-text-secondary">Loading webhook audit...</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-10 text-sm text-text-secondary">No webhook receipts yet.</div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[0.9fr_0.7fr_0.6fr_0.5fr_1.2fr] gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0"
            >
              <span className="text-text-secondary">
                {new Date(row.received_at).toLocaleString()}
              </span>
              <span className="truncate text-text-primary">{row.payload_kind}</span>
              <span className={row.signature_valid ? 'text-success-text' : 'text-danger-text'}>
                {row.signature_valid ? 'valid' : 'invalid'}
              </span>
              <span className="text-text-secondary">{row.replay_detected ? 'yes' : 'no'}</span>
              <span className="min-w-0 truncate text-text-secondary">
                {row.error_message ?? (row.processed_at ? 'processed' : 'received')}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
