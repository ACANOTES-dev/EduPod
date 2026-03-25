'use client';

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
import { Award, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { useRoleCheck } from '@/hooks/use-role-check';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format-date';

import { CurrencyDisplay } from '../_components/currency-display';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Scholarship {
  id: string;
  name: string;
  student_id: string;
  student_name: string;
  discount_type: 'fixed' | 'percent';
  value: number;
  currency_code: string;
  status: 'active' | 'expired' | 'revoked';
  award_date: string;
  renewal_date: string | null;
  revocation_reason: string | null;
  fee_structure_name: string | null;
  awarded_by_name: string;
}

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
}

interface FeeStructureOption {
  id: string;
  name: string;
}

type StatusFilter = 'all' | 'active' | 'expired' | 'revoked';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScholarshipsPage() {
  const t = useTranslations('finance');
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  const [scholarships, setScholarships] = React.useState<Scholarship[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');

  // Create modal
  const [showCreate, setShowCreate] = React.useState(false);
  const [students, setStudents] = React.useState<StudentOption[]>([]);
  const [feeStructures, setFeeStructures] = React.useState<FeeStructureOption[]>([]);
  const [createForm, setCreateForm] = React.useState({
    name: '',
    student_id: '',
    discount_type: 'percent' as 'fixed' | 'percent',
    value: '',
    fee_structure_id: '',
    award_date: '',
    renewal_date: '',
  });
  const [creating, setCreating] = React.useState(false);

  // Revoke modal
  const [showRevoke, setShowRevoke] = React.useState(false);
  const [revokeTarget, setRevokeTarget] = React.useState<Scholarship | null>(null);
  const [revokeReason, setRevokeReason] = React.useState('');
  const [revoking, setRevoking] = React.useState(false);

  const fetchScholarships = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiClient<{ data: Scholarship[]; meta: { total: number } }>(
        `/api/v1/finance/scholarships?${params.toString()}`,
      );
      setScholarships(res.data);
      setTotal(res.meta.total);
    } catch {
      setScholarships([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  React.useEffect(() => {
    void fetchScholarships();
  }, [fetchScholarships]);

  React.useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  React.useEffect(() => {
    if (showCreate) {
      Promise.all([
        apiClient<{ data: StudentOption[] }>('/api/v1/students?pageSize=500&status=active'),
        apiClient<{ data: FeeStructureOption[] }>('/api/v1/finance/fee-structures?pageSize=200'),
      ])
        .then(([studRes, fsRes]) => {
          setStudents(studRes.data);
          setFeeStructures(fsRes.data);
        })
        .catch(() => {
          setStudents([]);
          setFeeStructures([]);
        });
    }
  }, [showCreate]);

  async function handleCreate() {
    if (!createForm.name || !createForm.student_id || !createForm.value || !createForm.award_date) {
      toast.error(t('scholarships.validationError'));
      return;
    }
    setCreating(true);
    try {
      await apiClient('/api/v1/finance/scholarships', {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name,
          student_id: createForm.student_id,
          discount_type: createForm.discount_type,
          value: parseFloat(createForm.value),
          fee_structure_id: createForm.fee_structure_id || null,
          award_date: createForm.award_date,
          renewal_date: createForm.renewal_date || null,
        }),
      });
      toast.success(t('scholarships.created'));
      setShowCreate(false);
      setCreateForm({
        name: '',
        student_id: '',
        discount_type: 'percent',
        value: '',
        fee_structure_id: '',
        award_date: '',
        renewal_date: '',
      });
      void fetchScholarships();
    } catch {
      toast.error(t('scholarships.createFailed'));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget || !revokeReason) {
      toast.error(t('scholarships.revocationReasonRequired'));
      return;
    }
    setRevoking(true);
    try {
      await apiClient(`/api/v1/finance/scholarships/${revokeTarget.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({ reason: revokeReason }),
      });
      toast.success(t('scholarships.revoked'));
      setShowRevoke(false);
      setRevokeTarget(null);
      setRevokeReason('');
      void fetchScholarships();
    } catch {
      toast.error(t('scholarships.revokeFailed'));
    } finally {
      setRevoking(false);
    }
  }

  const statusVariant: Record<
    Scholarship['status'],
    'success' | 'neutral' | 'danger'
  > = {
    active: 'success',
    expired: 'neutral',
    revoked: 'danger',
  };

  const columns = [
    {
      key: 'name',
      header: t('scholarships.name'),
      render: (row: Scholarship) => (
        <span className="text-sm font-medium text-text-primary">{row.name}</span>
      ),
    },
    {
      key: 'student_name',
      header: t('scholarships.student'),
      render: (row: Scholarship) => (
        <span className="text-sm text-text-secondary">{row.student_name}</span>
      ),
    },
    {
      key: 'type',
      header: t('scholarships.type'),
      render: (row: Scholarship) => (
        <span className="text-sm text-text-secondary">
          {row.discount_type === 'percent'
            ? t('scholarships.typePercent')
            : t('scholarships.typeFixed')}
        </span>
      ),
    },
    {
      key: 'value',
      header: t('scholarships.value'),
      className: 'text-end',
      render: (row: Scholarship) =>
        row.discount_type === 'percent' ? (
          <span className="font-mono text-sm font-semibold text-text-primary" dir="ltr">
            {row.value}%
          </span>
        ) : (
          <CurrencyDisplay
            amount={row.value}
            currency_code={row.currency_code}
            className="font-semibold"
          />
        ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: Scholarship) => (
        <StatusBadge status={statusVariant[row.status]} dot>
          {t(`scholarships.status_${row.status}`)}
        </StatusBadge>
      ),
    },
    {
      key: 'award_date',
      header: t('scholarships.awardDate'),
      render: (row: Scholarship) => (
        <span className="text-sm text-text-secondary">{formatDate(row.award_date)}</span>
      ),
    },
    {
      key: 'renewal_date',
      header: t('scholarships.renewalDate'),
      render: (row: Scholarship) => (
        <span className="text-sm text-text-secondary">
          {row.renewal_date ? formatDate(row.renewal_date) : '—'}
        </span>
      ),
    },
    {
      key: 'fee_structure',
      header: t('scholarships.scope'),
      render: (row: Scholarship) => (
        <span className="text-sm text-text-secondary">
          {row.fee_structure_name ?? t('scholarships.allFees')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: Scholarship) =>
        canManage && row.status === 'active' ? (
          <Button
            size="sm"
            variant="outline"
            className="text-danger-700 hover:bg-danger-50 hover:border-danger-300"
            onClick={(e) => {
              e.stopPropagation();
              setRevokeTarget(row);
              setRevokeReason('');
              setShowRevoke(true);
            }}
          >
            {t('scholarships.revoke')}
          </Button>
        ) : null,
    },
  ];

  const statusTabs: Array<{ key: StatusFilter; label: string }> = [
    { key: 'all', label: t('allStatuses') },
    { key: 'active', label: t('scholarships.status_active') },
    { key: 'expired', label: t('scholarships.status_expired') },
    { key: 'revoked', label: t('scholarships.status_revoked') },
  ];

  const toolbar = (
    <div className="flex flex-wrap gap-1 border-b border-border pb-2">
      {statusTabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => setStatusFilter(tab.key)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === tab.key
              ? 'bg-primary-100 text-primary-700'
              : 'text-text-secondary hover:bg-surface-secondary hover:text-text-primary'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('scholarships.title')}
        description={t('scholarships.description')}
        actions={
          canManage ? (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="me-2 h-4 w-4" />
              {t('scholarships.create')}
            </Button>
          ) : undefined
        }
      />

      {!isLoading && scholarships.length === 0 && statusFilter === 'all' ? (
        <EmptyState
          icon={Award}
          title={t('scholarships.emptyTitle')}
          description={t('scholarships.emptyDescription')}
          action={
            canManage
              ? { label: t('scholarships.create'), onClick: () => setShowCreate(true) }
              : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={scholarships}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* Create modal */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('scholarships.createTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('scholarships.name')}</Label>
              <Input
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('scholarships.namePlaceholder')}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t('scholarships.student')}</Label>
              <Select
                value={createForm.student_id}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, student_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('scholarships.selectStudent')} />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('scholarships.discountType')}</Label>
                <Select
                  value={createForm.discount_type}
                  onValueChange={(v) =>
                    setCreateForm((f) => ({ ...f, discount_type: v as 'fixed' | 'percent' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">{t('scholarships.typePercent')}</SelectItem>
                    <SelectItem value="fixed">{t('scholarships.typeFixed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{t('scholarships.value')}</Label>
                <Input
                  type="number"
                  min="0"
                  step={createForm.discount_type === 'percent' ? '1' : '0.01'}
                  max={createForm.discount_type === 'percent' ? '100' : undefined}
                  value={createForm.value}
                  onChange={(e) => setCreateForm((f) => ({ ...f, value: e.target.value }))}
                  dir="ltr"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('scholarships.feeStructureScope')}</Label>
              <Select
                value={createForm.fee_structure_id}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, fee_structure_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('scholarships.allFees')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('scholarships.allFees')}</SelectItem>
                  {feeStructures.map((fs) => (
                    <SelectItem key={fs.id} value={fs.id}>
                      {fs.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('scholarships.awardDate')}</Label>
                <Input
                  type="date"
                  value={createForm.award_date}
                  onChange={(e) => setCreateForm((f) => ({ ...f, award_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('scholarships.renewalDate')}</Label>
                <Input
                  type="date"
                  value={createForm.renewal_date}
                  onChange={(e) => setCreateForm((f) => ({ ...f, renewal_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating}>
              {creating ? t('saving') : t('scholarships.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke modal */}
      <Dialog open={showRevoke} onOpenChange={setShowRevoke}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('scholarships.revokeTitle')}</DialogTitle>
          </DialogHeader>
          {revokeTarget && (
            <div className="space-y-4">
              <p className="text-sm text-text-secondary">
                {t('scholarships.revokeConfirm', { name: revokeTarget.name })}
              </p>
              <div className="space-y-1.5">
                <Label>{t('scholarships.revocationReason')}</Label>
                <Textarea
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder={t('scholarships.revocationReasonPlaceholder')}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRevoke(false)}
              disabled={revoking}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleRevoke()}
              disabled={revoking || !revokeReason}
            >
              {revoking ? t('saving') : t('scholarships.revokeAction')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
