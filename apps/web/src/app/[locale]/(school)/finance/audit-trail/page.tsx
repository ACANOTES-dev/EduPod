'use client';

import { ChevronDown, ChevronRight, Download, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  created_at: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string;
  reference: string | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
}

type EntityTypeFilter =
  | 'all'
  | 'invoice'
  | 'payment'
  | 'refund'
  | 'fee_structure'
  | 'discount'
  | 'fee_assignment'
  | 'credit_note'
  | 'scholarship';

// ─── Component ────────────────────────────────────────────────────────────────

export default function FinanceAuditTrailPage() {
  const t = useTranslations('finance');

  const [entries, setEntries] = React.useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 25;

  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState('');
  const [entityTypeFilter, setEntityTypeFilter] = React.useState<EntityTypeFilter>('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');
  const [userFilter, setUserFilter] = React.useState('');

  const fetchEntries = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        domain: 'finance',
      });
      if (search) params.set('search', search);
      if (entityTypeFilter !== 'all') params.set('entity_type', entityTypeFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (userFilter) params.set('user_search', userFilter);

      const res = await apiClient<{ data: AuditLogEntry[]; meta: { total: number } }>(
        `/api/v1/audit-logs?${params.toString()}`,
      );
      setEntries(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FinanceAuditTrailPage]', err);
      setEntries([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, entityTypeFilter, dateFrom, dateTo, userFilter]);

  React.useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  React.useEffect(() => {
    setPage(1);
  }, [search, entityTypeFilter, dateFrom, dateTo, userFilter]);

  function handleExportCsv() {
    const params = new URLSearchParams({ domain: 'finance' });
    if (search) params.set('search', search);
    if (entityTypeFilter !== 'all') params.set('entity_type', entityTypeFilter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
    window.open(`${baseUrl}/api/v1/audit-logs/export?${params.toString()}`, '_blank');
  }

  function formatTimestamp(ts: string) {
    return new Date(ts).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  const actionBadgeClass: Record<string, string> = {
    create: 'bg-success-100 text-success-700',
    update: 'bg-info-100 text-info-700',
    delete: 'bg-danger-100 text-danger-700',
  };

  const columns = [
    {
      key: 'created_at',
      header: t('auditTrail.timestamp'),
      render: (row: AuditLogEntry) => (
        <span className="font-mono text-xs text-text-secondary" dir="ltr">
          {formatTimestamp(row.created_at)}
        </span>
      ),
    },
    {
      key: 'user_name',
      header: t('auditTrail.user'),
      render: (row: AuditLogEntry) => (
        <span className="text-sm text-text-primary">{row.user_name}</span>
      ),
    },
    {
      key: 'action',
      header: t('auditTrail.action'),
      render: (row: AuditLogEntry) => (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
            actionBadgeClass[row.action] ?? 'bg-surface-secondary text-text-secondary'
          }`}
        >
          {row.action}
        </span>
      ),
    },
    {
      key: 'entity_type',
      header: t('auditTrail.entityType'),
      render: (row: AuditLogEntry) => (
        <span className="text-sm text-text-secondary capitalize">
          {row.entity_type.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'reference',
      header: t('auditTrail.reference'),
      render: (row: AuditLogEntry) => (
        <span className="font-mono text-xs text-text-secondary">
          {row.reference ?? (row.entity_id ? row.entity_id.slice(0, 8) + '…' : '—')}
        </span>
      ),
    },
    {
      key: 'changes',
      header: '',
      render: (row: AuditLogEntry) =>
        row.changes ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedRow(expandedRow === row.id ? null : row.id);
            }}
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t('auditTrail.viewChanges')}
            {expandedRow === row.id ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="text-xs text-text-tertiary">—</span>
        ),
    },
  ];

  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder={t('auditTrail.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>

        <Select
          value={entityTypeFilter}
          onValueChange={(v) => setEntityTypeFilter(v as EntityTypeFilter)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder={t('auditTrail.entityType')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('auditTrail.allTypes')}</SelectItem>
            <SelectItem value="invoice">{t('invoices')}</SelectItem>
            <SelectItem value="payment">{t('payments')}</SelectItem>
            <SelectItem value="refund">{t('refunds')}</SelectItem>
            <SelectItem value="fee_structure">{t('feeStructures.title')}</SelectItem>
            <SelectItem value="discount">{t('discounts.title')}</SelectItem>
            <SelectItem value="fee_assignment">{t('feeAssignments.title')}</SelectItem>
            <SelectItem value="credit_note">{t('creditNotes.title')}</SelectItem>
            <SelectItem value="scholarship">{t('scholarships.title')}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder={t('auditTrail.filterByUser')}
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="w-full sm:w-[160px]"
        />

        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full sm:w-[150px]"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full sm:w-[150px]"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auditTrail.title')}
        description={t('auditTrail.description')}
        actions={
          <Button variant="outline" onClick={handleExportCsv}>
            <Download className="me-2 h-4 w-4" />
            {t('reports.exportCsv')}
          </Button>
        }
      />

      <div className="space-y-2">
        <DataTable
          columns={columns}
          data={entries}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />

        {/* Inline diff expansion */}
        {entries
          .filter((e) => e.id === expandedRow && e.changes)
          .map((entry) => (
            <div
              key={`diff-${entry.id}`}
              className="rounded-xl border border-border bg-surface-secondary p-4"
            >
              <h4 className="mb-3 text-xs font-semibold uppercase text-text-tertiary">
                {t('auditTrail.changes')}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="pb-2 pe-4 text-start font-semibold uppercase text-text-tertiary">
                        {t('auditTrail.field')}
                      </th>
                      <th className="pb-2 pe-4 text-start font-semibold uppercase text-text-tertiary">
                        {t('auditTrail.oldValue')}
                      </th>
                      <th className="pb-2 text-start font-semibold uppercase text-text-tertiary">
                        {t('auditTrail.newValue')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(entry.changes ?? {}).map(([field, diff]) => (
                      <tr key={field} className="border-b border-border last:border-b-0">
                        <td className="py-1.5 pe-4 font-mono text-text-secondary">{field}</td>
                        <td className="py-1.5 pe-4 font-mono text-danger-700">
                          {diff.old != null ? String(diff.old) : '—'}
                        </td>
                        <td className="py-1.5 font-mono text-success-700">
                          {diff.new != null ? String(diff.new) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
