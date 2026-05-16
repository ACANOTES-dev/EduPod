'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';

import { Badge, Button, cn } from '@school/ui';

import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

type AuditActionType =
  | 'password_reset'
  | 'mfa_reset'
  | 'resend_invite'
  | 'unlock_account'
  | 'transfer_ownership'
  | 'disable_user'
  | 'enable_user';

interface AuditUser {
  email: string;
  first_name: string;
  id: string;
  last_name: string;
}

interface AuditTenant {
  id: string;
  name: string;
  slug: string;
}

interface AuditActionRow {
  action_type: AuditActionType;
  actor: AuditUser;
  created_at: string;
  id: string;
  target_tenant: AuditTenant | null;
  target_user: AuditUser | null;
}

interface AuditActionResponse {
  data: AuditActionRow[];
  meta: { page: number; pageSize: number; total: number };
}

interface AuditActionsTableProps {
  pageSize?: number;
  targetTenantId?: string;
  targetUserId?: string;
}

const ACTION_LABELS: Record<AuditActionType, string> = {
  disable_user: 'Disable user',
  enable_user: 'Enable user',
  mfa_reset: 'MFA reset',
  password_reset: 'Password reset',
  resend_invite: 'Invite re-sent',
  transfer_ownership: 'Ownership transfer',
  unlock_account: 'Unlock account',
};

const ACTION_VARIANTS: Record<
  AuditActionType,
  'danger' | 'info' | 'secondary' | 'success' | 'warning'
> = {
  disable_user: 'danger',
  enable_user: 'success',
  mfa_reset: 'info',
  password_reset: 'info',
  resend_invite: 'secondary',
  transfer_ownership: 'warning',
  unlock_account: 'success',
};

export function AuditActionsTable({
  pageSize = 10,
  targetTenantId,
  targetUserId,
}: AuditActionsTableProps) {
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<AuditActionRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setPage(1);
  }, [targetTenantId, targetUserId]);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (targetUserId) params.set('target_user_id', targetUserId);
        if (targetTenantId) params.set('target_tenant_id', targetTenantId);

        const response = await apiClient<AuditActionResponse>(
          `/api/v1/admin/audit-actions?${params.toString()}`,
        );
        if (cancelled) return;
        setRows(response.data);
        setTotal(response.meta.total);
      } catch (err: unknown) {
        console.error('[AuditActionsTable.load]', err);
        if (!cancelled) {
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, targetTenantId, targetUserId]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-text-primary">Support action history</h2>
        <p className="text-sm text-text-secondary">
          Audit trail for account recovery, owner transfer, and user status changes.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead>
            <tr className="text-start text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              <th className="py-2 pe-4 text-start">Action</th>
              <th className="px-4 py-2 text-start">Actor</th>
              <th className="px-4 py-2 text-start">Target user</th>
              <th className="px-4 py-2 text-start">Tenant</th>
              <th className="py-2 ps-4 text-start">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr>
                <td className="py-6 text-sm text-text-secondary" colSpan={5}>
                  Loading support actions...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="py-6 text-sm text-text-secondary" colSpan={5}>
                  No support actions found.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="py-3 pe-4">
                    <Badge variant={ACTION_VARIANTS[row.action_type]}>
                      {ACTION_LABELS[row.action_type]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">{formatUser(row.actor)}</td>
                  <td className="px-4 py-3">
                    {row.target_user ? formatUser(row.target_user) : '—'}
                  </td>
                  <td className="px-4 py-3">{row.target_tenant?.name ?? '—'}</td>
                  <td className="py-3 ps-4 whitespace-nowrap">{formatDateTime(row.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-xs text-text-secondary">
          Page {page} of {totalPages} · {total} records
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className={cn('h-4 w-4', 'rtl:rotate-180')} />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className={cn('h-4 w-4', 'rtl:rotate-180')} />
          </Button>
        </div>
      </div>
    </section>
  );
}

function formatUser(user: AuditUser): string {
  return `${user.first_name} ${user.last_name} (${user.email})`;
}
