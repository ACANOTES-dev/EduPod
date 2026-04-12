'use client';

import { ArrowLeft, DollarSign, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeeType {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  active: boolean;
}

interface FeeTypeFormState {
  name: string;
  description: string;
}

const EMPTY_FORM: FeeTypeFormState = { name: '', description: '' };

// ─── Page Component ───────────────────────────────────────────────────────────

export default function FeeTypesPage() {
  const t = useTranslations('finance');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';
  const { hasAnyRole } = useRoleCheck();
  const canManage = hasAnyRole('school_principal', 'accounting');

  // ─── List state ───────────────────────────────────────────────────────────
  const [feeTypes, setFeeTypes] = React.useState<FeeType[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const pageSize = 20;

  const [search, setSearch] = React.useState('');
  const [activeFilter, setActiveFilter] = React.useState('all');

  // ─── Dialog state ─────────────────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingFeeType, setEditingFeeType] = React.useState<FeeType | null>(null);
  const [form, setForm] = React.useState<FeeTypeFormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = React.useState(false);

  // ─── Delete confirmation state ────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = React.useState<FeeType | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  // ─── Fetch fee types ──────────────────────────────────────────────────────

  const fetchFeeTypes = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (activeFilter !== 'all') params.set('active', activeFilter);

      const res = await apiClient<{ data: FeeType[]; meta: { total: number } }>(
        `/api/v1/finance/fee-types?${params.toString()}`,
      );
      setFeeTypes(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[FeeTypesPage]', err);
      setFeeTypes([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [page, search, activeFilter]);

  React.useEffect(() => {
    void fetchFeeTypes();
  }, [fetchFeeTypes]);

  React.useEffect(() => {
    setPage(1);
  }, [search, activeFilter]);

  // ─── Dialog handlers ──────────────────────────────────────────────────────

  const openCreateDialog = React.useCallback(() => {
    setEditingFeeType(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }, []);

  const openEditDialog = React.useCallback((feeType: FeeType) => {
    setEditingFeeType(feeType);
    setForm({
      name: feeType.name,
      description: feeType.description ?? '',
    });
    setDialogOpen(true);
  }, []);

  const closeDialog = React.useCallback(() => {
    setDialogOpen(false);
    setEditingFeeType(null);
    setForm(EMPTY_FORM);
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!form.name.trim()) return;
    setIsSaving(true);
    try {
      if (editingFeeType) {
        await apiClient(`/api/v1/finance/fee-types/${editingFeeType.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || null,
          }),
        });
        toast.success(tCommon('saved'));
      } else {
        await apiClient('/api/v1/finance/fee-types', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name.trim(),
            description: form.description.trim() || null,
          }),
        });
        toast.success(tCommon('created'));
      }
      closeDialog();
      void fetchFeeTypes();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('feeTypes.title');
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [form, editingFeeType, closeDialog, fetchFeeTypes, t, tCommon]);

  // ─── Delete handler ───────────────────────────────────────────────────────

  const handleDelete = React.useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiClient(`/api/v1/finance/fee-types/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      toast.success(tCommon('deleted'));
      setDeleteTarget(null);
      void fetchFeeTypes();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('feeTypes.title');
      toast.error(message);
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, fetchFeeTypes, t, tCommon]);

  // ─── Table columns ───────────────────────────────────────────────────────

  const columns = [
    {
      key: 'name',
      header: t('feeTypes.name'),
      render: (row: FeeType) => <span className="font-medium text-text-primary">{row.name}</span>,
    },
    {
      key: 'description',
      header: t('feeTypes.descriptionField'),
      render: (row: FeeType) => (
        <span className="text-text-secondary">{row.description ?? '—'}</span>
      ),
    },
    {
      key: 'is_system',
      header: t('feeTypes.system'),
      render: (row: FeeType) =>
        row.is_system ? (
          <Badge variant="info">{t('feeTypes.system')}</Badge>
        ) : (
          <span className="text-text-tertiary">{t('feeTypes.custom')}</span>
        ),
    },
    {
      key: 'active',
      header: tCommon('status'),
      render: (row: FeeType) => (
        <StatusBadge status={row.active ? 'success' : 'neutral'} dot>
          {row.active ? t('active') : t('inactive')}
        </StatusBadge>
      ),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            render: (row: FeeType) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    openEditDialog(row);
                  }}
                  aria-label={t('feeTypes.editTitle')}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {!row.is_system && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setDeleteTarget(row);
                    }}
                    aria-label={tCommon('delete')}
                  >
                    <Trash2 className="h-4 w-4 text-danger-text" />
                  </Button>
                )}
              </div>
            ),
            className: 'w-24',
          },
        ]
      : []),
  ];

  // ─── Toolbar ──────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder={tCommon('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9"
        />
      </div>

      <Select value={activeFilter} onValueChange={setActiveFilter}>
        <SelectTrigger className="w-full sm:w-[140px]">
          <SelectValue placeholder={tCommon('status')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{tCommon('all')}</SelectItem>
          <SelectItem value="true">{t('active')}</SelectItem>
          <SelectItem value="false">{t('inactive')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('feeTypes.title')}
        description={t('feeTypes.description')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => router.push(`/${locale}/finance`)}>
              <ArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
              {tCommon('back')}
            </Button>
            {canManage && (
              <Button onClick={openCreateDialog}>
                <Plus className="me-2 h-4 w-4" />
                {t('feeTypes.createNew')}
              </Button>
            )}
          </div>
        }
      />

      {!isLoading && feeTypes.length === 0 && !search && activeFilter === 'all' ? (
        <EmptyState
          icon={DollarSign}
          title={t('feeTypes.noFeeTypes')}
          description={t('feeTypes.noFeeTypesDesc')}
          action={
            canManage
              ? {
                  label: t('feeTypes.createNew'),
                  onClick: openCreateDialog,
                }
              : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={feeTypes}
          toolbar={toolbar}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onRowClick={canManage ? openEditDialog : undefined}
          keyExtractor={(row) => row.id}
          isLoading={isLoading}
        />
      )}

      {/* ─── Create / Edit Dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingFeeType ? t('feeTypes.editTitle') : t('feeTypes.createNew')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fee-type-name">{t('feeTypes.name')}</Label>
              <Input
                id="fee-type-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t('feeTypes.name')}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fee-type-description">{t('feeTypes.descriptionField')}</Label>
              <Textarea
                id="fee-type-description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={t('feeTypes.descriptionField')}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSaving}>
              {tCommon('cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !form.name.trim()}>
              {isSaving ? tCommon('saving') : tCommon('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ────────────────────────────────────── */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{tCommon('confirmDelete')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('feeTypes.deleteConfirm')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              {tCommon('cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()} disabled={isDeleting}>
              {isDeleting ? tCommon('deleting') : tCommon('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
