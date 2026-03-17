'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssessmentCategory {
  id: string;
  name: string;
  default_weight: number;
  in_use: boolean;
}

interface CategoriesResponse {
  data: AssessmentCategory[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentCategoriesPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');
  const ts = useTranslations('settings');

  const [data, setData] = React.useState<AssessmentCategory[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<AssessmentCategory | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Form state
  const [name, setName] = React.useState('');
  const [defaultWeight, setDefaultWeight] = React.useState('');

  const fetchCategories = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const res = await apiClient<CategoriesResponse>(`/api/v1/gradebook/assessment-categories?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchCategories(page);
  }, [page, fetchCategories]);

  const resetForm = React.useCallback(() => {
    setName('');
    setDefaultWeight('');
  }, []);

  const openCreate = React.useCallback(() => {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }, [resetForm]);

  const openEdit = React.useCallback((cat: AssessmentCategory) => {
    setEditTarget(cat);
    setName(cat.name);
    setDefaultWeight(String(cat.default_weight));
    setDialogOpen(true);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    const weight = Number(defaultWeight);
    if (Number.isNaN(weight) || weight < 0 || weight > 100) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), default_weight: weight };
      if (editTarget) {
        await apiClient(`/api/v1/gradebook/assessment-categories/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/gradebook/assessment-categories', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      void fetchCategories(page);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: AssessmentCategory) => {
    if (cat.in_use) return;
    try {
      await apiClient(`/api/v1/gradebook/assessment-categories/${cat.id}`, { method: 'DELETE' });
      void fetchCategories(page);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const columns = [
    {
      key: 'name',
      header: ts('assessmentCategories'),
      render: (row: AssessmentCategory) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    {
      key: 'weight',
      header: 'Default Weight',
      render: (row: AssessmentCategory) => (
        <span className="text-text-secondary">{row.default_weight}%</span>
      ),
    },
    {
      key: 'in_use',
      header: 'Status',
      render: (row: AssessmentCategory) =>
        row.in_use ? (
          <span className="text-sm text-warning-text">{t('inUse')}</span>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: AssessmentCategory) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={row.in_use}
            onClick={(e) => {
              e.stopPropagation();
              void handleDelete(row);
            }}
          >
            <Trash2 className="h-4 w-4 text-danger-text" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ts('assessmentCategories')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {tc('create')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? tc('edit') : tc('create')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Homework"
              />
            </div>

            <div>
              <Label htmlFor="cat-weight">Default Weight (%)</Label>
              <Input
                id="cat-weight"
                type="number"
                min={0}
                max={100}
                value={defaultWeight}
                onChange={(e) => setDefaultWeight(e.target.value)}
                placeholder="e.g. 25"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? tc('loading') : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
