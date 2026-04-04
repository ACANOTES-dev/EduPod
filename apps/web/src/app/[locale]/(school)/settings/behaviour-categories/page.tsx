'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
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
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  name_ar: string | null;
  polarity: string;
  severity: number;
  point_value: number;
  color: string | null;
  icon: string | null;
  benchmark_category: string;
  requires_follow_up: boolean;
  requires_parent_notification: boolean;
  parent_visible: boolean;
  display_order: number;
  is_active: boolean;
}

interface FormValues {
  name: string;
  name_ar: string;
  polarity: string;
  severity: number;
  point_value: number;
  color: string;
  icon: string;
  benchmark_category: string;
  requires_follow_up: boolean;
  requires_parent_notification: boolean;
  parent_visible: boolean;
  display_order: number;
}

const POLARITY_OPTIONS = [
  { value: 'positive', label: 'Positive' },
  { value: 'negative', label: 'Negative' },
  { value: 'neutral', label: 'Neutral' },
];

const BENCHMARK_OPTIONS = [
  { value: 'praise', label: 'Praise' },
  { value: 'merit', label: 'Merit' },
  { value: 'minor_positive', label: 'Minor Positive' },
  { value: 'major_positive', label: 'Major Positive' },
  { value: 'verbal_warning', label: 'Verbal Warning' },
  { value: 'written_warning', label: 'Written Warning' },
  { value: 'detention', label: 'Detention' },
  { value: 'internal_suspension', label: 'Internal Suspension' },
  { value: 'external_suspension', label: 'External Suspension' },
  { value: 'expulsion', label: 'Expulsion' },
  { value: 'note', label: 'Note' },
  { value: 'observation', label: 'Observation' },
  { value: 'other', label: 'Other' },
];

const POLARITY_BADGE_CLASS: Record<string, string> = {
  positive: 'bg-green-100 text-green-700',
  negative: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-600',
};

const DEFAULT_FORM: FormValues = {
  name: '',
  name_ar: '',
  polarity: 'positive',
  severity: 1,
  point_value: 0,
  color: '#10B981',
  icon: '',
  benchmark_category: 'praise',
  requires_follow_up: false,
  requires_parent_notification: false,
  parent_visible: true,
  display_order: 0,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourCategoriesPage() {
  const t = useTranslations('behaviourSettings.categories');
  const tCommon = useTranslations('common');
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<Category | null>(null);
  const [form, setForm] = React.useState<FormValues>(DEFAULT_FORM);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');

  const [deleteTarget, setDeleteTarget] = React.useState<Category | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');

  const fetchCategories = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: Category[] }>(
        '/api/v1/behaviour/categories?pageSize=100&sort=display_order&order=asc',
      );
      setCategories(res.data ?? []);
    } catch (err) {
      console.error('[SettingsBehaviourCategoriesPage]', err);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchCategories();
  }, [fetchCategories]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(DEFAULT_FORM);
    setSaveError('');
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditTarget(cat);
    setForm({
      name: cat.name,
      name_ar: cat.name_ar ?? '',
      polarity: cat.polarity,
      severity: cat.severity,
      point_value: cat.point_value,
      color: cat.color ?? '#10B981',
      icon: cat.icon ?? '',
      benchmark_category: cat.benchmark_category,
      requires_follow_up: cat.requires_follow_up,
      requires_parent_notification: cat.requires_parent_notification,
      parent_visible: cat.parent_visible,
      display_order: cat.display_order,
    });
    setSaveError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      setSaveError('Name is required');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const body = {
        name: form.name.trim(),
        name_ar: form.name_ar.trim() || null,
        polarity: form.polarity,
        severity: form.severity,
        point_value: form.point_value,
        color: form.color || null,
        icon: form.icon.trim() || null,
        benchmark_category: form.benchmark_category,
        requires_follow_up: form.requires_follow_up,
        requires_parent_notification: form.requires_parent_notification,
        parent_visible: form.parent_visible,
        display_order: form.display_order,
      };
      if (editTarget) {
        await apiClient(`/api/v1/behaviour/categories/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/behaviour/categories', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      void fetchCategories();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setSaveError(ex?.error?.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError('');
    try {
      await apiClient(`/api/v1/behaviour/categories/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      void fetchCategories();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setDeleteError(ex?.error?.message ?? 'Failed to delete');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    try {
      await apiClient(`/api/v1/behaviour/categories/${cat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !cat.is_active }),
      });
      void fetchCategories();
    } catch (err) {
      // handled by global error handler
      console.error('[fetchCategories]', err);
    }
  };

  const updateForm = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {t('addCategory')}
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <p className="text-sm text-text-tertiary">{t('noCategoriesConfiguredYet')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{tCommon('name')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('polarity')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('severity')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('points')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('color')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('benchmark')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{t('active')}</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">{tCommon('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr
                  key={cat.id}
                  className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                >
                  <td className="px-4 py-3 text-sm font-medium text-text-primary">{cat.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className={POLARITY_BADGE_CLASS[cat.polarity] ?? ''}>
                      {cat.polarity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">{cat.severity}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-sm font-semibold ${
                        cat.point_value > 0
                          ? 'text-green-600'
                          : cat.point_value < 0
                            ? 'text-red-600'
                            : 'text-text-secondary'
                      }`}
                    >
                      {cat.point_value > 0 ? '+' : ''}
                      {cat.point_value}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {cat.color ? (
                      <span
                        className="inline-block h-5 w-5 rounded-full border border-border"
                        style={{ backgroundColor: cat.color }}
                      />
                    ) : (
                      <span className="text-xs text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs capitalize text-text-secondary">
                    {cat.benchmark_category.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={cat.is_active}
                      onCheckedChange={() => handleToggleActive(cat)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">{tCommon('edit')}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-text hover:text-danger-text"
                        onClick={() => {
                          setDeleteError('');
                          setDeleteTarget(cat);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">{tCommon('delete')}</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Category' : 'Add Category'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder={t('eGGoodEffort')}
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('nameArabic')}</Label>
              <Input
                value={form.name_ar}
                onChange={(e) => updateForm('name_ar', e.target.value)}
                placeholder={t('arabicName')}
                dir="rtl"
                className="text-base"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('polarity')}</Label>
                <Select value={form.polarity} onValueChange={(v) => updateForm('polarity', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {POLARITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('severity110')}</Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={form.severity}
                  onChange={(e) => updateForm('severity', parseInt(e.target.value, 10) || 1)}
                  className="text-base"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('points')}</Label>
                <Input
                  type="number"
                  value={form.point_value}
                  onChange={(e) => updateForm('point_value', parseInt(e.target.value, 10) || 0)}
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('color')}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => updateForm('color', e.target.value)}
                    className="h-10 w-10 cursor-pointer rounded border border-border"
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => updateForm('color', e.target.value)}
                    placeholder={t('10b981')}
                    className="flex-1 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('benchmarkCategory')}</Label>
                <Select
                  value={form.benchmark_category}
                  onValueChange={(v) => updateForm('benchmark_category', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BENCHMARK_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('displayOrder')}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.display_order}
                  onChange={(e) => updateForm('display_order', parseInt(e.target.value, 10) || 0)}
                  className="text-base"
                />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('requiresFollowUp')}</Label>
                <Switch
                  checked={form.requires_follow_up}
                  onCheckedChange={(v) => updateForm('requires_follow_up', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t('requiresParentNotification')}</Label>
                <Switch
                  checked={form.requires_parent_notification}
                  onCheckedChange={(v) => updateForm('requires_parent_notification', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>{t('visibleToParents')}</Label>
                <Switch
                  checked={form.parent_visible}
                  onCheckedChange={(v) => updateForm('parent_visible', v)}
                />
              </div>
            </div>
            {saveError && <p className="text-sm text-danger-text">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>{tCommon('cancel')}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editTarget ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteCategory')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('areYouSureYouWant')}<strong>{deleteTarget?.name}</strong>{t('thisCannotBeUndoneIf')}</p>
          {deleteError && <p className="text-sm text-danger-text">{deleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteLoading}
            >{tCommon('cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
