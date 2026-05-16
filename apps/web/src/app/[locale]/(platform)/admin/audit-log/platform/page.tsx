'use client';

import { RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Button, Badge, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

interface PlatformAuditActor {
  email: string;
  first_name: string;
  last_name: string;
}

interface PlatformAuditLog {
  id: string;
  actor_user_id: string;
  action: string;
  target_resource_type: string;
  target_resource_id: string | null;
  target_tenant_id: string | null;
  payload: unknown;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  prev_hash: string | null;
  row_hash: string;
  created_at: string;
  actor: PlatformAuditActor;
}

interface PlatformAuditResponse {
  data: PlatformAuditLog[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 20;

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}

export default function PlatformAuditLedgerPage() {
  const [rows, setRows] = React.useState<PlatformAuditLog[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const load = React.useCallback(async (nextPage: number) => {
    try {
      setLoading(true);
      const result = await apiClient<PlatformAuditResponse>(
        `/api/v1/admin/platform-audit-logs?page=${nextPage}&pageSize=${PAGE_SIZE}`,
      );
      setRows(result.data);
      setPage(result.meta.page);
      setTotal(result.meta.total);
    } catch (err: unknown) {
      console.error('[PlatformAuditLedgerPage.load]', err);
      toast.error(getErrorMessage(err, 'Failed to load platform audit logs.'));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(1);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform Audit Ledger"
        description="Append-only record of cross-tenant operator actions."
        actions={
          <Button variant="outline" onClick={() => void load(page)}>
            <RefreshCw className="me-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[960px] text-sm">
          <thead className="bg-surface-secondary text-text-secondary">
            <tr>
              <th className="px-4 py-3 text-start font-medium">Timestamp</th>
              <th className="px-4 py-3 text-start font-medium">Actor</th>
              <th className="px-4 py-3 text-start font-medium">Action</th>
              <th className="px-4 py-3 text-start font-medium">Target</th>
              <th className="px-4 py-3 text-start font-medium">Hash</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                  Loading audit ledger...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-text-secondary">
                  No platform audit entries found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr
                    className="cursor-pointer border-t border-border hover:bg-surface-secondary"
                    onClick={() => setExpandedId((current) => (current === row.id ? null : row.id))}
                  >
                    <td className="px-4 py-3 text-text-secondary" dir="ltr">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-text-primary">
                        {row.actor.first_name} {row.actor.last_name}
                      </div>
                      <div className="font-mono text-xs text-text-secondary">{row.actor.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className="bg-primary-50 text-primary-700">
                        {row.action.replaceAll('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      <div>{row.target_resource_type}</div>
                      <div className="font-mono text-xs">{row.target_resource_id ?? 'n/a'}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-text-tertiary">
                      {row.row_hash.slice(0, 12)}...
                    </td>
                  </tr>
                  {expandedId === row.id ? (
                    <tr className="border-t border-border bg-surface-secondary">
                      <td colSpan={5} className="px-4 py-4">
                        <pre className="max-h-80 overflow-auto rounded-md bg-background p-3 text-xs text-text-secondary">
                          {JSON.stringify(row.payload, null, 2)}
                        </pre>
                        <div className="mt-3 grid gap-2 text-xs text-text-tertiary md:grid-cols-3">
                          <span>Previous: {row.prev_hash ?? 'genesis'}</span>
                          <span>Current: {row.row_hash}</span>
                          <span>IP: {row.ip_address ?? 'n/a'}</span>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>
          Page {page} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => void load(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page >= pageCount}
            onClick={() => void load(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
