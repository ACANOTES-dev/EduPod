'use client';

import { Bell, Download, FileText, Search, Send, XCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { InvoiceStatus } from '@school/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { EntityLink } from '@/components/entity-link';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../_components/currency-display';
import { InvoiceStatusBadge } from '../_components/invoice-status-badge';

interface InvoiceHousehold {
  id: string;
  household_name: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  total_amount: number;
  balance_amount: number;
  due_date: string;
  issue_date: string | null;
  currency_code: string;
  household?: InvoiceHousehold | null;
}

type BulkAction = 'issue' | 'void' | 'remind' | 'export';

const statusTabs: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'issued', label: 'Issued' },
  { value: 'partially_paid', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'void,cancelled,written_off', label: 'Closed' },
];

export default function InvoicesPage() {
  const t = useTranslations('finance');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  const [invoices, setInvoices] = React.useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState(searchParams?.get('status') ?? 'all');
  const [householdFilter] = React.useState('');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  // Bulk selection
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = React.useState<BulkAction | null>(null);
  const [bulkProcessing, setBulkProcessing] = React.useState(false);

  const fetchInvoices = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (householdFilter) params.set('household_id', householdFilter);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await apiClient<{ data: Invoice[]; meta: { total: number } }>(
        `/api/v1/finance/invoices?${params.toString()}`,
      );
      setInvoices(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FinanceInvoicesPage]', err);
      setInvoices([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, statusFilter, householdFilter, dateFrom, dateTo]);

  React.useEffect(() => {
    void fetchInvoices();
  }, [fetchInvoices]);

  React.useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, statusFilter, householdFilter, dateFrom, dateTo]);

  const allPageSelected = invoices.length > 0 && invoices.every((inv) => selectedIds.has(inv.id));

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        invoices.forEach((inv) => next.delete(inv.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        invoices.forEach((inv) => next.add(inv.id));
        return next;
      });
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkConfirm() {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const ids = Array.from(selectedIds);

      if (bulkAction === 'export') {
        const params = new URLSearchParams();
        ids.forEach((id) => params.append('ids', id));
        const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
        window.open(`${baseUrl}/api/v1/finance/invoices/export?${params.toString()}`, '_blank');
      } else {
        await apiClient('/api/v1/finance/invoices/bulk', {
          method: 'POST',
          body: JSON.stringify({ ids, action: bulkAction }),
        });
        toast.success(t('bulkOps.success', { count: ids.length }));
        setSelectedIds(new Set());
        void fetchInvoices();
      }
    } catch (err) {
      console.error('[FinanceInvoicesPage]', err);
      toast.error(t('bulkOps.failed'));
    } finally {
      setBulkProcessing(false);
      setBulkAction(null);
    }
  }

  const bulkActionConfig: Record<
    BulkAction,
    { label: string; icon: React.ElementType; variant: 'default' | 'destructive' | 'outline' }
  > = {
    issue: { label: t('bulkOps.issueSelected'), icon: Send, variant: 'default' },
    void: { label: t('bulkOps.voidSelected'), icon: XCircle, variant: 'destructive' },
    remind: { label: t('bulkOps.sendReminders'), icon: Bell, variant: 'outline' },
    export: { label: t('bulkOps.exportSelected'), icon: Download, variant: 'outline' },
  };

  const columns = [
    ...(canManage
      ? [
          {
            key: '_select',
            header: '',
            render: (row: Invoice) => (
              <Checkbox
                checked={selectedIds.has(row.id)}
                onCheckedChange={() => toggleRow(row.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select invoice ${row.invoice_number}`}
              />
            ),
            className: 'w-10',
          },
        ]
      : []),
    {
      key: 'invoice_number',
      header: 'Invoice #',
      render: (row: Invoice) => (
        <span className="font-mono text-xs text-text-secondary">{row.invoice_number}</span>
      ),
    },
    {
      key: 'household',
      header: 'Household',
      render: (row: Invoice) =>
        row.household ? (
          <EntityLink
            entityType="household"
            entityId={row.household.id}
            label={row.household.household_name}
            href={`/households/${row.household.id}`}
          />
        ) : (
          <span className="text-text-tertiary">--</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: Invoice) => <InvoiceStatusBadge status={row.status} />,
    },
    {
      key: 'total_amount',
      header: 'Total',
      className: 'text-end',
      render: (row: Invoice) => (
        <CurrencyDisplay
          amount={row.total_amount}
          currency_code={row.currency_code}
          className="font-medium"
        />
      ),
    },
    {
      key: 'balance_amount',
      header: 'Balance',
      className: 'text-end',
      render: (row: Invoice) => (
        <CurrencyDisplay
          amount={row.balance_amount}
          currency_code={row.currency_code}
          className={
            row.balance_amount > 0 ? 'font-medium text-danger-text' : 'text-text-secondary'
          }
        />
      ),
    },
    {
      key: 'due_date',
      header: 'Due Date',
      render: (row: Invoice) => (
        <span className="text-sm text-text-secondary">{formatDate(row.due_date)}</span>
      ),
    },
    {
      key: 'issue_date',
      header: 'Issue Date',
      render: (row: Invoice) => (
        <span className="text-sm text-text-secondary">
          {row.issue_date ? formatDate(row.issue_date) : '--'}
        </span>
      ),
    },
  ];

  const toolbar = (
    <div className="space-y-3">
      {/* Bulk action toolbar */}
      {canManage && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2">
          <span className="text-sm font-medium text-primary-700">
            {t('bulkOps.selected', { count: selectedIds.size })}
          </span>
          <div className="ms-auto flex flex-wrap gap-2">
            {(
              Object.entries(bulkActionConfig) as Array<
                [BulkAction, (typeof bulkActionConfig)[BulkAction]]
              >
            ).map(([key, cfg]) => {
              const Icon = cfg.icon;
              return (
                <Button
                  key={key}
                  size="sm"
                  variant={cfg.variant}
                  onClick={() => setBulkAction(key)}
                >
                  <Icon className="me-1.5 h-3.5 w-3.5" />
                  {cfg.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {/* Select all checkbox */}
        {canManage && (
          <div className="flex items-center pe-2 me-2 border-e border-border">
            <Checkbox
              checked={allPageSelected}
              onCheckedChange={toggleSelectAll}
              aria-label={t('selectAllOnPage')}
            />
          </div>
        )}
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-primary-100 text-primary-700'
                : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder={t('searchInvoices')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>

        <Input
          type="date"
          placeholder={t('from')}
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-full sm:w-[150px]"
        />

        <Input
          type="date"
          placeholder={t('to')}
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-full sm:w-[150px]"
        />
      </div>
    </div>
  );

  const hasActiveFilters =
    search || statusFilter !== 'all' || householdFilter || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('navInvoices')}
        description="View and manage invoices for all households"
      />

      {!isLoading && invoices.length === 0 && !hasActiveFilters ? (
        <EmptyState
          icon={FileText}
          title={t('noInvoicesYet')}
          description="No invoices this term -- create fee assignments first, then run the fee generation wizard."
        />
      ) : (
        <DataTable
          columns={columns}
          data={invoices}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/finance/invoices/${row.id}`)}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* Bulk action confirmation dialog */}
      <Dialog open={bulkAction !== null} onOpenChange={() => setBulkAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{bulkAction ? bulkActionConfig[bulkAction].label : ''}</DialogTitle>
          </DialogHeader>
          {bulkAction && (
            <p className="text-sm text-text-secondary">
              {t('bulkOps.confirmMessage', {
                count: selectedIds.size,
                action: bulkActionConfig[bulkAction].label.toLowerCase(),
              })}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)} disabled={bulkProcessing}>
              {t('cancel')}
            </Button>
            <Button
              variant={bulkAction === 'void' ? 'destructive' : 'default'}
              onClick={() => void handleBulkConfirm()}
              disabled={bulkProcessing}
            >
              {bulkProcessing ? t('saving') : t('execute')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
