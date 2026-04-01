'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@school/ui';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

import { YearGroupForm, type YearGroupFormValues } from './_components/year-group-form';


// ─── Types ────────────────────────────────────────────────────────────────────

interface YearGroup {
  id: string;
  name: string;
  display_order: number;
  next_year_group_id: string | null;
  next_year_group?: { name: string } | null;
  classroom_model: 'fixed_homeroom' | 'free_movement';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function YearGroupsPage() {
  const t = useTranslations('yearGroups');
  const tc = useTranslations('common');

  const [groups, setGroups] = React.useState<YearGroup[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<YearGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<YearGroup | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');

  const fetchGroups = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: YearGroup[] }>(
        '/api/v1/year-groups?pageSize=100&sort=display_order&order=asc',
      );
      setGroups(res.data);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  const handleCreate = async (values: YearGroupFormValues) => {
    await apiClient('/api/v1/year-groups', {
      method: 'POST',
      body: JSON.stringify({
        name: values.name,
        display_order: values.display_order,
        next_year_group_id: values.next_year_group_id || undefined,
        classroom_model: values.classroom_model,
      }),
    });
    void fetchGroups();
  };

  const handleUpdate = async (values: YearGroupFormValues) => {
    if (!editTarget) return;
    await apiClient(`/api/v1/year-groups/${editTarget.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: values.name,
        display_order: values.display_order,
        next_year_group_id: values.next_year_group_id || undefined,
        classroom_model: values.classroom_model,
      }),
    });
    void fetchGroups();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await apiClient(`/api/v1/year-groups/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      void fetchGroups();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setDeleteError(ex?.error?.message ?? tc('errorGeneric'));
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="me-2 h-4 w-4" />
            {t('newYearGroup')}
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noGroups')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-sm">
          {groups.map((group) => (
            <li key={group.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-xs font-bold text-text-tertiary">
                {group.display_order}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">{group.name}</p>
                {group.next_year_group && (
                  <p className="text-xs text-text-tertiary">
                    {t('nextGroup')}: {group.next_year_group.name}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditTarget(group)}>
                  <Pencil className="h-4 w-4" />
                  <span className="sr-only">{tc('edit')}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger-text hover:text-danger-text"
                  onClick={() => {
                    setDeleteError('');
                    setDeleteTarget(group);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">{tc('delete')}</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <YearGroupForm
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        title={t('newYearGroup')}
        submitLabel={t('createYearGroup')}
        existingGroups={groups}
      />

      {editTarget && (
        <YearGroupForm
          open={!!editTarget}
          onOpenChange={(v) => {
            if (!v) setEditTarget(null);
          }}
          initialValues={{
            name: editTarget.name,
            display_order: editTarget.display_order,
            next_year_group_id: editTarget.next_year_group_id ?? '',
            classroom_model: editTarget.classroom_model ?? 'fixed_homeroom',
          }}
          onSubmit={handleUpdate}
          title={t('editYearGroup')}
          existingGroups={groups}
          excludeId={editTarget.id}
        />
      )}

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteConfirmTitle')}</DialogTitle>
            <DialogDescription>{t('deleteConfirmDescription')}</DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-danger-text">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteLoading}
            >
              {tc('cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? tc('loading') : tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
