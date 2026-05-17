'use client';

import { RefreshCw } from 'lucide-react';
import * as React from 'react';

import { Button, toast } from '@school/ui';

import { apiClient } from '@/lib/api-client';

import {
  ErrorDetailRow,
  type PlatformErrorLog,
} from '../../../errors/_components/error-detail-row';

interface ErrorsTabProps {
  locale: string;
  tenantId: string;
  tenantName: string;
}

interface ErrorResponse {
  data: PlatformErrorLog[];
  meta: { page: number; pageSize: number; total: number };
}

const PAGE_SIZE = 10;

export function ErrorsTab({ locale, tenantId, tenantName }: ErrorsTabProps) {
  const [rows, setRows] = React.useState<PlatformErrorLog[]>([]);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(
    async (nextPage: number) => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: String(PAGE_SIZE),
        });
        const response = await apiClient<ErrorResponse>(
          `/api/v1/admin/tenants/${tenantId}/errors?${params.toString()}`,
        );
        setRows(response.data);
        setPage(response.meta.page);
        setTotal(response.meta.total);
      } catch (err: unknown) {
        console.error('[ErrorsTab.load]', err);
        toast.error(getErrorMessage(err, 'Failed to load tenant errors.'));
      } finally {
        setLoading(false);
      }
    },
    [tenantId],
  );

  React.useEffect(() => {
    void load(1);
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Tenant Errors</h3>
          <p className="mt-1 text-xs text-text-secondary">
            Redacted diagnostics attributed to this tenant.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(page)}>
          <RefreshCw className="me-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[920px] text-start">
          <thead className="bg-surface-secondary text-xs font-semibold uppercase text-text-tertiary">
            <tr>
              <th className="px-3 py-3" />
              <th className="px-3 py-3 text-start">Last seen</th>
              <th className="px-3 py-3 text-start">Tenant</th>
              <th className="px-3 py-3 text-start">Endpoint</th>
              <th className="px-3 py-3 text-start">Message</th>
              <th className="px-3 py-3 text-start">Count</th>
              <th className="px-3 py-3 text-start">Request ID</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-secondary">
                  Loading tenant errors...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-text-secondary">
                  No redacted errors captured for this tenant.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <ErrorDetailRow key={row.id} error={row} locale={locale} tenantName={tenantName} />
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
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => void load(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
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

function getErrorMessage(err: unknown, fallback: string): string {
  if (err !== null && typeof err === 'object' && 'error' in err) {
    const maybeError = (err as { error?: { message?: unknown } }).error;
    if (typeof maybeError?.message === 'string') return maybeError.message;
  }
  return fallback;
}
