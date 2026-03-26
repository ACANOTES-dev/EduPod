'use client';

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
import { Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AwardType {
  id: string;
  name: string;
  name_ar: string | null;
  points_threshold: number | null;
  repeat_mode: string;
  repeat_max_per_year: number | null;
  tier_group: string | null;
  tier_level: number | null;
  supersedes_lower_tiers: boolean;
  icon: string | null;
  color: string | null;
  display_order: number;
  is_active: boolean;
}

interface FormValues {
  name: string;
  name_ar: string;
  points_threshold: string;
  repeat_mode: string;
  repeat_max_per_year: string;
  tier_group: string;
  tier_level: string;
  supersedes_lower_tiers: boolean;
  icon: string;
  color: string;
  display_order: number;
  is_active: boolean;
}

const REPEAT_MODE_OPTIONS = [
  { value: 'once', label: 'Once' },
  { value: 'per_year', label: 'Per Year' },
  { value: 'unlimited', label: 'Unlimited' },
];

const REPEAT_LABEL: Record<string, string> = {
  once: 'Once',
  per_year: 'Per Year',
  unlimited: 'Unlimited',
};

const DEFAULT_FORM: FormValues = {
  name: '',
  name_ar: '',
  points_threshold: '',
  repeat_mode: 'once',
  repeat_max_per_year: '',
  tier_group: '',
  tier_level: '',
  supersedes_lower_tiers: false,
  icon: '',
  color: '#6366F1',
  display_order: 0,
  is_active: true,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourAwardsPage() {
  const [awards, setAwards] = React.useState<AwardType[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<AwardType | null>(null);
  const [form, setForm] = React.useState<FormValues>(DEFAULT_FORM);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');

  const [deleteTarget, setDeleteTarget] = React.useState<AwardType | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');

  // Mobile detection
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const fetchAwards = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: AwardType[] }>(
        '/api/v1/behaviour/award-types?pageSize=100&sort=display_order&order=asc',
      );
      setAwards(res.data ?? []);
    } catch {
      setAwards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchAwards();
  }, [fetchAwards]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(DEFAULT_FORM);
    setSaveError('');
    setDialogOpen(true);
  };

  const openEdit = (award: AwardType) => {
    setEditTarget(award);
    setForm({
      name: award.name,
      name_ar: award.name_ar ?? '',
      points_threshold: award.points_threshold != null ? String(award.points_threshold) : '',
      repeat_mode: award.repeat_mode,
      repeat_max_per_year: award.repeat_max_per_year != null ? String(award.repeat_max_per_year) : '',
      tier_group: award.tier_group ?? '',
      tier_level: award.tier_level != null ? String(award.tier_level) : '',
      supersedes_lower_tiers: award.supersedes_lower_tiers,
      icon: award.icon ?? '',
      color: award.color ?? '#6366F1',
      display_order: award.display_order,
      is_active: award.is_active,
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
        points_threshold: form.points_threshold ? parseInt(form.points_threshold, 10) : null,
        repeat_mode: form.repeat_mode,
        repeat_max_per_year: form.repeat_max_per_year ? parseInt(form.repeat_max_per_year, 10) : null,
        tier_group: form.tier_group.trim() || null,
        tier_level: form.tier_level ? parseInt(form.tier_level, 10) : null,
        supersedes_lower_tiers: form.supersedes_lower_tiers,
        icon: form.icon.trim() || null,
        color: form.color || null,
        display_order: form.display_order,
        is_active: form.is_active,
      };
      if (editTarget) {
        await apiClient(`/api/v1/behaviour/award-types/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/behaviour/award-types', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      void fetchAwards();
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
      await apiClient(`/api/v1/behaviour/award-types/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      void fetchAwards();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setDeleteError(ex?.error?.message ?? 'Failed to delete');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleActive = async (award: AwardType) => {
    try {
      await apiClient(`/api/v1/behaviour/award-types/${award.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !award.is_active }),
      });
      void fetchAwards();
    } catch {
      // handled by global error handler
    }
  };

  const updateForm = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Behaviour Awards"
        description="Configure award types and recognition tiers"
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            Add Award
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : awards.length === 0 ? (
        <p className="text-sm text-text-tertiary">No award types configured yet.</p>
      ) : isMobile ? (
        /* Mobile card view */
        <div className="space-y-3">
          {awards.map((award) => (
            <div
              key={award.id}
              className="rounded-xl border border-border bg-surface p-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {award.color && (
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: award.color }}
                    />
                  )}
                  <span className="text-sm font-medium text-text-primary">
                    {award.icon && <span className="me-1">{award.icon}</span>}
                    {award.name}
                  </span>
                </div>
                <Badge variant={award.is_active ? 'default' : 'secondary'} className="text-xs">
                  {award.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
                {award.points_threshold != null && (
                  <span>{award.points_threshold} pts threshold</span>
                )}
                <span>{REPEAT_LABEL[award.repeat_mode] ?? award.repeat_mode}</span>
                {award.tier_group && (
                  <span>
                    {award.tier_group}
                    {award.tier_level != null && ` / Lvl ${award.tier_level}`}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                <Button variant="ghost" size="sm" onClick={() => openEdit(award)}>
                  <Pencil className="me-1 h-3.5 w-3.5" />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleActive(award)}
                >
                  {award.is_active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger-text hover:text-danger-text"
                  onClick={() => { setDeleteError(''); setDeleteTarget(award); }}
                >
                  <Trash2 className="me-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Desktop table view */
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">Name</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">Points Threshold</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">Repeat Mode</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">Tier</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">Active</th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">Actions</th>
              </tr>
            </thead>
            <tbody>
              {awards.map((award) => (
                <tr key={award.id} className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {award.color && (
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: award.color }}
                        />
                      )}
                      <span className="text-sm font-medium text-text-primary">
                        {award.icon && <span className="me-1">{award.icon}</span>}
                        {award.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {award.points_threshold != null ? award.points_threshold : '---'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-xs">
                      {REPEAT_LABEL[award.repeat_mode] ?? award.repeat_mode}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {award.tier_group ? (
                      <span>
                        {award.tier_group}
                        {award.tier_level != null && (
                          <span className="ms-1 text-xs text-text-tertiary">
                            Lvl {award.tier_level}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-text-tertiary">---</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={award.is_active}
                      onCheckedChange={() => handleToggleActive(award)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(award)}>
                        <Pencil className="h-4 w-4" />
                        <span className="sr-only">Edit</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger-text hover:text-danger-text"
                        onClick={() => { setDeleteError(''); setDeleteTarget(award); }}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
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
            <DialogTitle>{editTarget ? 'Edit Award' : 'Add Award'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="e.g. Gold Star Award"
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Name (Arabic)</Label>
              <Input
                value={form.name_ar}
                onChange={(e) => updateForm('name_ar', e.target.value)}
                placeholder="Arabic name"
                dir="rtl"
                className="text-base"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Points Threshold</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.points_threshold}
                  onChange={(e) => updateForm('points_threshold', e.target.value)}
                  placeholder="Optional"
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Repeat Mode</Label>
                <Select value={form.repeat_mode} onValueChange={(v) => updateForm('repeat_mode', v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REPEAT_MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.repeat_mode === 'per_year' && (
              <div className="space-y-1.5">
                <Label>Max Per Year</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.repeat_max_per_year}
                  onChange={(e) => updateForm('repeat_max_per_year', e.target.value)}
                  placeholder="Leave blank for unlimited"
                  className="text-base"
                />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tier Group</Label>
                <Input
                  value={form.tier_group}
                  onChange={(e) => updateForm('tier_group', e.target.value)}
                  placeholder="e.g. Academic, Character"
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tier Level</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.tier_level}
                  onChange={(e) => updateForm('tier_level', e.target.value)}
                  placeholder="e.g. 1, 2, 3"
                  className="text-base"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <Input
                  value={form.icon}
                  onChange={(e) => updateForm('icon', e.target.value)}
                  placeholder="e.g. star, trophy"
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
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
                    placeholder="#6366F1"
                    className="flex-1 text-sm"
                  />
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Display Order</Label>
              <Input
                type="number"
                min={0}
                value={form.display_order}
                onChange={(e) => updateForm('display_order', parseInt(e.target.value, 10) || 0)}
                className="w-full text-base sm:w-28"
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Supersedes Lower Tiers</Label>
                <Switch
                  checked={form.supersedes_lower_tiers}
                  onCheckedChange={(v) => updateForm('supersedes_lower_tiers', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => updateForm('is_active', v)}
                />
              </div>
            </div>
            {saveError && <p className="text-sm text-danger-text">{saveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editTarget ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Award</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? Existing recognitions using this award type will not be affected.
          </p>
          {deleteError && <p className="text-sm text-danger-text">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
