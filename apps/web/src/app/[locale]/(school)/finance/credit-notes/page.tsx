'use client';

import { ChevronDown, ChevronRight, Plus, Receipt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Textarea,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../_components/currency-display';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CreditNote {
  id: string;
  credit_note_number: string;
  household_id: string;
  household_name: string;
  amount: number;
  remaining_balance: number;
  reason: string;
  issued_by_name: string;
  issued_at: string;
  currency_code: string;
  applications: CreditApplication[];
}

interface CreditApplication {
  id: string;
  invoice_id: string;
  invoice_number: string;
  applied_amount: number;
  applied_at: string;
  applied_by_name: string;
}

interface HouseholdOption {
  id: string;
  household_name: string;
}

interface OpenInvoice {
  id: string;
  invoice_number: string;
  balance_amount: number;
  currency_code: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreditNotesPage() {
  const t = useTranslations('finance');
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  const [creditNotes, setCreditNotes] = React.useState<CreditNote[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [expandedRow, setExpandedRow] = React.useState<string | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = React.useState(false);
  const [households, setHouseholds] = React.useState<HouseholdOption[]>([]);
  const [createForm, setCreateForm] = React.useState({
    household_id: '',
    amount: '',
    reason: '',
  });
  const [creating, setCreating] = React.useState(false);

  // Apply modal
  const [showApply, setShowApply] = React.useState(false);
  const [applyTargetId, setApplyTargetId] = React.useState('');
  const [applyTargetBalance, setApplyTargetBalance] = React.useState(0);
  const [openInvoices, setOpenInvoices] = React.useState<OpenInvoice[]>([]);
  const [applyInvoiceId, setApplyInvoiceId] = React.useState('');
  const [applyAmount, setApplyAmount] = React.useState('');
  const [applying, setApplying] = React.useState(false);

  const fetchCreditNotes = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await apiClient<{ data: CreditNote[]; meta: { total: number } }>(
        `/api/v1/finance/credit-notes?page=${page}&pageSize=${pageSize}`,
      );
      setCreditNotes(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FinanceCreditNotesPage]', err);
      setCreditNotes([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  React.useEffect(() => {
    void fetchCreditNotes();
  }, [fetchCreditNotes]);

  React.useEffect(() => {
    if (showCreate) {
      apiClient<{ data: HouseholdOption[]; meta?: unknown }>('/api/v1/households?pageSize=200')
        .then((res) => {
          const items = Array.isArray(res.data) ? res.data : [];
          setHouseholds(items);
        })
        .catch((err) => {
          console.error('[FinanceCreditNotesPage]', err);
          return setHouseholds([]);
        });
    }
  }, [showCreate]);

  async function handleCreate() {
    const parsedAmount = parseFloat(createForm.amount);
    if (
      !createForm.household_id ||
      !createForm.amount ||
      isNaN(parsedAmount) ||
      parsedAmount <= 0 ||
      !createForm.reason.trim()
    ) {
      toast.error(t('creditNotes.validationError'));
      return;
    }
    setCreating(true);
    try {
      await apiClient('/api/v1/finance/credit-notes', {
        method: 'POST',
        body: JSON.stringify({
          household_id: createForm.household_id,
          amount: parsedAmount,
          reason: createForm.reason.trim(),
        }),
      });
      toast.success(t('creditNotes.created'));
      setShowCreate(false);
      setCreateForm({ household_id: '', amount: '', reason: '' });
      void fetchCreditNotes();
    } catch (err) {
      console.error('[FinanceCreditNotesPage]', err);
      toast.error(t('creditNotes.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  async function openApplyModal(cn: CreditNote) {
    setApplyTargetId(cn.id);
    setApplyTargetBalance(cn.remaining_balance);
    setApplyInvoiceId('');
    setApplyAmount('');
    try {
      const res = await apiClient<{ data: OpenInvoice[]; meta?: unknown }>(
        `/api/v1/finance/invoices?household_id=${cn.household_id}&status=issued,partially_paid,overdue&pageSize=100`,
      );
      setOpenInvoices(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('[FinanceCreditNotesPage]', err);
      setOpenInvoices([]);
    }
    setShowApply(true);
  }

  async function handleApply() {
    const parsedApplyAmount = parseFloat(applyAmount);
    if (!applyInvoiceId || !applyAmount || isNaN(parsedApplyAmount) || parsedApplyAmount <= 0) {
      toast.error(t('creditNotes.validationError'));
      return;
    }
    setApplying(true);
    try {
      await apiClient('/api/v1/finance/credit-notes/apply', {
        method: 'POST',
        body: JSON.stringify({
          credit_note_id: applyTargetId,
          invoice_id: applyInvoiceId,
          applied_amount: parsedApplyAmount,
        }),
      });
      toast.success(t('creditNotes.applied'));
      setShowApply(false);
      void fetchCreditNotes();
    } catch (err) {
      console.error('[FinanceCreditNotesPage]', err);
      toast.error(t('creditNotes.applyFailed'));
    } finally {
      setApplying(false);
    }
  }

  const columns = [
    {
      key: 'credit_note_number',
      header: t('creditNotes.number'),
      render: (row: CreditNote) => (
        <span className="font-mono text-xs text-text-secondary">{row.credit_note_number}</span>
      ),
    },
    {
      key: 'household_name',
      header: t('household'),
      render: (row: CreditNote) => (
        <span className="text-sm font-medium text-text-primary">{row.household_name}</span>
      ),
    },
    {
      key: 'amount',
      header: t('totalAmount'),
      className: 'text-end',
      render: (row: CreditNote) => (
        <CurrencyDisplay
          amount={row.amount}
          currency_code={row.currency_code}
          className="font-medium"
        />
      ),
    },
    {
      key: 'remaining_balance',
      header: t('creditNotes.remainingBalance'),
      className: 'text-end',
      render: (row: CreditNote) => (
        <CurrencyDisplay
          amount={row.remaining_balance}
          currency_code={row.currency_code}
          className={
            row.remaining_balance > 0 ? 'font-semibold text-success-700' : 'text-text-tertiary'
          }
        />
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: CreditNote) => (
        <StatusBadge status={row.remaining_balance > 0 ? 'success' : 'neutral'} dot>
          {row.remaining_balance > 0
            ? t('creditNotes.statusOpen')
            : t('creditNotes.statusFullyUsed')}
        </StatusBadge>
      ),
    },
    {
      key: 'issued_by_name',
      header: t('creditNotes.issuedBy'),
      render: (row: CreditNote) => (
        <span className="text-sm text-text-secondary">{row.issued_by_name}</span>
      ),
    },
    {
      key: 'issued_at',
      header: t('date'),
      render: (row: CreditNote) => (
        <span className="text-sm text-text-secondary">{formatDate(row.issued_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: CreditNote) => (
        <div className="flex items-center gap-2">
          {canManage && row.remaining_balance > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                void openApplyModal(row);
              }}
            >
              {t('creditNotes.apply')}
            </Button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpandedRow(expandedRow === row.id ? null : row.id);
            }}
            className="text-text-tertiary hover:text-text-secondary"
          >
            {expandedRow === row.id ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('creditNotes.title')}
        description={t('creditNotes.description')}
        actions={
          canManage ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="me-2 h-4 w-4" />
              {t('creditNotes.create')}
            </Button>
          ) : undefined
        }
      />

      {!isLoading && creditNotes.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={t('creditNotes.emptyTitle')}
          description={t('creditNotes.emptyDescription')}
          action={
            canManage
              ? { label: t('creditNotes.create'), onClick: () => setShowCreate(true) }
              : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          <DataTable
            columns={columns}
            data={creditNotes}
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
          />

          {/* Expanded application history */}
          {creditNotes
            .filter((cn) => cn.id === expandedRow)
            .map((cn) => (
              <div
                key={`exp-${cn.id}`}
                className="rounded-xl border border-border bg-surface-secondary p-4"
              >
                <h4 className="mb-3 text-xs font-semibold uppercase text-text-tertiary">
                  {t('creditNotes.applicationHistory')}
                </h4>
                {cn.applications.length === 0 ? (
                  <p className="text-sm text-text-tertiary">{t('creditNotes.noApplications')}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                          {t('reference')}
                        </th>
                        <th className="pb-2 text-end text-xs font-semibold uppercase text-text-tertiary">
                          {t('totalAmount')}
                        </th>
                        <th className="pb-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                          {t('creditNotes.appliedBy')}
                        </th>
                        <th className="pb-2 text-start text-xs font-semibold uppercase text-text-tertiary">
                          {t('date')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cn.applications.map((app) => (
                        <tr key={app.id} className="border-b border-border last:border-b-0">
                          <td className="py-2 font-mono text-xs text-text-secondary">
                            {app.invoice_number}
                          </td>
                          <td className="py-2 text-end font-mono text-text-secondary" dir="ltr">
                            {app.applied_amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-2 text-text-secondary">{app.applied_by_name}</td>
                          <td className="py-2 text-text-secondary">{formatDate(app.applied_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('creditNotes.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('household')}</Label>
              <Select
                value={createForm.household_id}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, household_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectHousehold')} />
                </SelectTrigger>
                <SelectContent>
                  {households.map((hh) => (
                    <SelectItem key={hh.id} value={hh.id}>
                      {hh.household_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('totalAmount')}</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={createForm.amount}
                onChange={(e) => setCreateForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('creditNotes.reasonLabel')}</Label>
              <Textarea
                value={createForm.reason}
                onChange={(e) => setCreateForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder={t('creditNotes.reasonPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? t('saving') : t('creditNotes.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply modal */}
      <Dialog open={showApply} onOpenChange={setShowApply}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('creditNotes.applyTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              {t('creditNotes.availableBalance')}:{' '}
              <span className="font-semibold text-success-700" dir="ltr">
                {applyTargetBalance.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </p>

            <div className="space-y-1.5">
              <Label>{t('creditNotes.selectInvoice')}</Label>
              <Select value={applyInvoiceId} onValueChange={setApplyInvoiceId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('creditNotes.selectInvoicePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {openInvoices.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.invoice_number} —{' '}
                      {inv.balance_amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      {inv.currency_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{t('totalAmount')}</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                max={applyTargetBalance}
                value={applyAmount}
                onChange={(e) => setApplyAmount(e.target.value)}
                placeholder="0.00"
                dir="ltr"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApply(false)} disabled={applying}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleApply()} disabled={applying}>
              {applying ? t('saving') : t('creditNotes.applyAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
