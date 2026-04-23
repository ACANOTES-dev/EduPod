'use client';

import { Archive, Check, Pencil, Plus, ShieldCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import type { LeaveTypeAdminResponse } from '@school/shared';
import { Button, toast } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { LeaveTypeForm, type LeaveTypeFormValues } from './_components/leave-type-form';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LeaveTypesSettingsPage() {
  const t = useTranslations('leaveTypes');

  const [types, setTypes] = React.useState<LeaveTypeAdminResponse[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<LeaveTypeAdminResponse | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: LeaveTypeAdminResponse[] }>('/api/v1/leave/types/admin');
      setTypes(res.data ?? []);
    } catch (err) {
      console.error('[LeaveTypesSettingsPage.refresh]', err);
      toast.error(t('loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async (values: LeaveTypeFormValues) => {
    await apiClient('/api/v1/leave/types', {
      method: 'POST',
      body: JSON.stringify(values),
    });
    toast.success(t('createdToast'));
    void refresh();
  };

  const handleUpdate = async (values: LeaveTypeFormValues) => {
    if (!editTarget) return;
    const { code: _code, ...body } = values;
    await apiClient(`/api/v1/leave/types/${editTarget.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    toast.success(t('updatedToast'));
    void refresh();
  };

  const handleArchive = async (row: LeaveTypeAdminResponse) => {
    if (!confirm(t('archiveConfirm', { label: row.label }))) return;
    try {
      await apiClient(`/api/v1/leave/types/${row.id}`, { method: 'DELETE' });
      toast.success(t('archivedToast'));
      void refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('archiveError');
      toast.error(msg);
    }
  };

  const handleCloneOverride = async (row: LeaveTypeAdminResponse) => {
    // Creates a tenant row with the same code; the backend already ensures
    // tenant rows shadow system rows with the same code via the list logic.
    try {
      await apiClient('/api/v1/leave/types', {
        method: 'POST',
        body: JSON.stringify({
          code: row.code,
          label: row.label,
          requires_approval: row.requires_approval,
          is_paid_default: row.is_paid_default,
          max_days_per_request: row.max_days_per_request,
          requires_evidence: row.requires_evidence,
          display_order: row.display_order,
        }),
      });
      toast.success(t('overrideCreatedToast'));
      void refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('createError');
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('newType')}
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : types.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-text-secondary">
          {t('noTypes')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-secondary/60">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {t('colCode')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-start text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {t('colLabel')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {t('colScope')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {t('colPaid')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {t('colApproval')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {t('colEvidence')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {t('colMaxDays')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  {t('colActive')}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-end text-xs font-semibold uppercase tracking-wider text-text-secondary"
                >
                  <span className="sr-only">{t('colActions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {types.map((row) => (
                <tr
                  key={row.id}
                  className={row.is_active ? '' : 'bg-surface-secondary/40 opacity-75'}
                >
                  <td className="whitespace-nowrap px-4 py-2.5 align-middle font-mono text-xs text-text-primary">
                    {row.code}
                  </td>
                  <td className="px-4 py-2.5 align-middle text-sm text-text-primary">
                    {row.label}
                  </td>
                  <td className="px-4 py-2.5 text-center align-middle">
                    {row.is_system ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                        <ShieldCheck className="h-3 w-3" />
                        {row.is_overridden ? t('scopeSystemOverridden') : t('scopeSystem')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">
                        {t('scopeTenant')}
                      </span>
                    )}
                  </td>
                  <BoolCell value={row.is_paid_default} />
                  <BoolCell value={row.requires_approval} />
                  <BoolCell value={row.requires_evidence} />
                  <td className="whitespace-nowrap px-4 py-2.5 text-center align-middle text-xs text-text-secondary">
                    {row.max_days_per_request ?? '—'}
                  </td>
                  <BoolCell value={row.is_active} />
                  <td className="whitespace-nowrap px-4 py-2.5 text-end align-middle">
                    {row.is_system ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCloneOverride(row)}
                        disabled={row.is_overridden}
                      >
                        {row.is_overridden ? t('alreadyOverridden') : t('override')}
                      </Button>
                    ) : (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditTarget(row)}
                          aria-label={t('edit')}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {row.is_active && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleArchive(row)}
                            aria-label={t('archive')}
                            className="text-danger-text hover:bg-danger-50"
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <LeaveTypeForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        onSubmit={handleCreate}
      />

      {editTarget && (
        <LeaveTypeForm
          open={!!editTarget}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null);
          }}
          mode="edit"
          initialValues={{
            code: editTarget.code,
            label: editTarget.label,
            requires_approval: editTarget.requires_approval,
            is_paid_default: editTarget.is_paid_default,
            max_days_per_request: editTarget.max_days_per_request,
            requires_evidence: editTarget.requires_evidence,
            display_order: editTarget.display_order,
            is_active: editTarget.is_active,
          }}
          onSubmit={handleUpdate}
        />
      )}
    </div>
  );
}

function BoolCell({ value }: { value: boolean }) {
  const tc = useTranslations('common');
  return (
    <td className="whitespace-nowrap px-4 py-2.5 text-center align-middle">
      {value ? (
        <Check className="mx-auto h-4 w-4 text-success-600" aria-label={tc('yes')} />
      ) : (
        <X className="mx-auto h-4 w-4 text-text-tertiary" aria-label={tc('no')} />
      )}
    </td>
  );
}
