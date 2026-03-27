'use client';

import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Switch,
} from '@school/ui';
import { Pencil, Plus, Shield, Trash2, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HouseTeam {
  id: string;
  name: string;
  name_ar: string | null;
  color: string;
  icon: string | null;
  display_order: number;
  is_active: boolean;
  _count?: { members: number };
}

interface HouseMember {
  id: string;
  student_id: string;
  student: {
    first_name: string;
    last_name: string;
    year_group?: string | null;
  };
}

interface StudentOption {
  id: string;
  first_name: string;
  last_name: string;
  year_group?: string | null;
}

interface FormValues {
  name: string;
  name_ar: string;
  color: string;
  icon: string;
  display_order: number;
  is_active: boolean;
}

const DEFAULT_FORM: FormValues = {
  name: '',
  name_ar: '',
  color: '#3B82F6',
  icon: '',
  display_order: 0,
  is_active: true,
};

// ─── Sub-Tabs ─────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'houses', label: 'Houses' },
  { key: 'membership', label: 'Membership' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BehaviourHousesPage() {
  const t = useTranslations('behaviourSettings.houses');
  const [activeTab, setActiveTab] = React.useState<TabKey>('houses');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
      />

      {/* Tabs */}
      <div className="overflow-x-auto">
        <div className="flex gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-text-tertiary hover:text-text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'houses' && <HousesTab />}
      {activeTab === 'membership' && <MembershipTab />}
    </div>
  );
}

// ─── Houses Tab ───────────────────────────────────────────────────────────────

function HousesTab() {
  const [houses, setHouses] = React.useState<HouseTeam[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<HouseTeam | null>(null);
  const [form, setForm] = React.useState<FormValues>(DEFAULT_FORM);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');

  const [deleteTarget, setDeleteTarget] = React.useState<HouseTeam | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState('');

  const fetchHouses = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient<{ data: HouseTeam[] }>(
        '/api/v1/behaviour/houses?pageSize=100&sort=display_order&order=asc&include_count=true',
      );
      setHouses(res.data ?? []);
    } catch {
      setHouses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchHouses();
  }, [fetchHouses]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(DEFAULT_FORM);
    setSaveError('');
    setDialogOpen(true);
  };

  const openEdit = (house: HouseTeam) => {
    setEditTarget(house);
    setForm({
      name: house.name,
      name_ar: house.name_ar ?? '',
      color: house.color,
      icon: house.icon ?? '',
      display_order: house.display_order,
      is_active: house.is_active,
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
        color: form.color,
        icon: form.icon.trim() || null,
        display_order: form.display_order,
        is_active: form.is_active,
      };
      if (editTarget) {
        await apiClient(`/api/v1/behaviour/houses/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/behaviour/houses', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      void fetchHouses();
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
      await apiClient(`/api/v1/behaviour/houses/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      void fetchHouses();
    } catch (err: unknown) {
      const ex = err as { error?: { message?: string } };
      setDeleteError(ex?.error?.message ?? 'Failed to delete');
    } finally {
      setDeleteLoading(false);
    }
  };

  const updateForm = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            Add House
          </Button>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-xl bg-surface-secondary" />
            ))}
          </div>
        ) : houses.length === 0 ? (
          <div className="py-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-text-tertiary/30" />
            <p className="mt-3 text-sm text-text-tertiary">
              No house teams configured yet. Add your first house team to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {houses.map((house) => (
              <div
                key={house.id}
                className="relative overflow-hidden rounded-xl border border-border bg-surface p-5 transition-colors hover:bg-surface-secondary"
              >
                {/* Color accent strip */}
                <div
                  className="absolute inset-x-0 top-0 h-1.5"
                  style={{ backgroundColor: house.color }}
                />

                <div className="flex items-start gap-3 pt-1">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: house.color }}
                  >
                    {house.icon ? (
                      <span className="text-lg">{house.icon}</span>
                    ) : (
                      <Shield className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text-primary">
                        {house.name}
                      </p>
                      <Badge
                        variant={house.is_active ? 'default' : 'secondary'}
                        className="shrink-0 text-xs"
                      >
                        {house.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    {house.name_ar && (
                      <p className="mt-0.5 truncate text-xs text-text-tertiary" dir="rtl">
                        {house.name_ar}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs text-text-secondary">
                  <div className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    <span>{house._count?.members ?? 0} members</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: house.color }}
                    />
                    <span className="font-mono text-[11px]">{house.color}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(house)}>
                    <Pencil className="me-1 h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger-text hover:text-danger-text"
                    onClick={() => { setDeleteError(''); setDeleteTarget(house); }}
                  >
                    <Trash2 className="me-1 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit House' : 'Add House'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="e.g. Phoenix"
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
            <div className="space-y-1.5">
              <Label>Color *</Label>
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
                  placeholder="#3B82F6"
                  className="flex-1 text-sm"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <Input
                  value={form.icon}
                  onChange={(e) => updateForm('icon', e.target.value)}
                  placeholder="e.g. shield, flame"
                  className="text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Display Order</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.display_order}
                  onChange={(e) => updateForm('display_order', parseInt(e.target.value, 10) || 0)}
                  className="text-base"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => updateForm('is_active', v)}
              />
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
            <DialogTitle>Delete House</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
            All member assignments will be removed.
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
    </>
  );
}

// ─── Membership Tab ───────────────────────────────────────────────────────────

function MembershipTab() {
  const [houses, setHouses] = React.useState<HouseTeam[]>([]);
  const [selectedHouse, setSelectedHouse] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<HouseMember[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [membersLoading, setMembersLoading] = React.useState(false);

  // Bulk assign sheet state
  const [assignOpen, setAssignOpen] = React.useState(false);
  const [availableStudents, setAvailableStudents] = React.useState<StudentOption[]>([]);
  const [selectedStudents, setSelectedStudents] = React.useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = React.useState('');
  const [studentsLoading, setStudentsLoading] = React.useState(false);
  const [assignSaving, setAssignSaving] = React.useState(false);

  // Remove member state
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  // Fetch houses
  React.useEffect(() => {
    setLoading(true);
    apiClient<{ data: HouseTeam[] }>(
      '/api/v1/behaviour/houses?pageSize=100&is_active=true&sort=display_order&order=asc',
    )
      .then((res) => {
        const data = res.data ?? [];
        setHouses(data);
        if (data.length > 0 && !selectedHouse && data[0]) {
          setSelectedHouse(data[0].id);
        }
      })
      .catch(() => setHouses([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch members when house changes
  const fetchMembers = React.useCallback(async (houseId: string) => {
    setMembersLoading(true);
    try {
      const res = await apiClient<{ data: HouseMember[] }>(
        `/api/v1/behaviour/houses/${houseId}/members?pageSize=100`,
      );
      setMembers(res.data ?? []);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (selectedHouse) {
      void fetchMembers(selectedHouse);
    }
  }, [selectedHouse, fetchMembers]);

  // Open bulk assign sheet
  const openBulkAssign = async () => {
    if (!selectedHouse) return;
    setAssignOpen(true);
    setSelectedStudents(new Set());
    setStudentSearch('');
    setStudentsLoading(true);
    try {
      const res = await apiClient<{ data: StudentOption[] }>(
        `/api/v1/behaviour/houses/${selectedHouse}/available-students?pageSize=100`,
      );
      setAvailableStudents(res.data ?? []);
    } catch {
      setAvailableStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkAssign = async () => {
    if (!selectedHouse || selectedStudents.size === 0) return;
    setAssignSaving(true);
    try {
      await apiClient(`/api/v1/behaviour/houses/${selectedHouse}/members/bulk`, {
        method: 'POST',
        body: JSON.stringify({ student_ids: Array.from(selectedStudents) }),
      });
      setAssignOpen(false);
      void fetchMembers(selectedHouse);
    } catch {
      // handled by global error handler
    } finally {
      setAssignSaving(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedHouse) return;
    setRemovingId(memberId);
    try {
      await apiClient(`/api/v1/behaviour/houses/${selectedHouse}/members/${memberId}`, {
        method: 'DELETE',
      });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch {
      // handled by global error handler
    } finally {
      setRemovingId(null);
    }
  };

  const filteredStudents = availableStudents.filter((s) => {
    if (!studentSearch) return true;
    const q = studentSearch.toLowerCase();
    return (
      s.first_name.toLowerCase().includes(q) ||
      s.last_name.toLowerCase().includes(q)
    );
  });

  const activeHouse = houses.find((h) => h.id === selectedHouse);

  return (
    <>
      <div className="space-y-4">
        {loading ? (
          <div className="h-10 w-48 animate-pulse rounded-lg bg-surface-secondary" />
        ) : houses.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            No active house teams. Create house teams in the Houses tab first.
          </p>
        ) : (
          <>
            {/* House selector + bulk assign */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {houses.map((house) => (
                  <button
                    key={house.id}
                    type="button"
                    onClick={() => setSelectedHouse(house.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedHouse === house.id
                        ? 'text-white'
                        : 'bg-surface-secondary text-text-secondary hover:text-text-primary'
                    }`}
                    style={selectedHouse === house.id ? { backgroundColor: house.color } : undefined}
                  >
                    {house.icon && <span>{house.icon}</span>}
                    {house.name}
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={() => void openBulkAssign()} disabled={!selectedHouse}>
                <Users className="me-1.5 h-4 w-4" />
                Assign Students
              </Button>
            </div>

            {/* Member roster */}
            {membersLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-secondary" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="mx-auto h-10 w-10 text-text-tertiary/30" />
                <p className="mt-2 text-sm text-text-tertiary">
                  No students assigned to {activeHouse?.name ?? 'this house'} yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        Student
                      </th>
                      <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        Year Group
                      </th>
                      <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr
                        key={member.id}
                        className="border-b border-border last:border-b-0 transition-colors hover:bg-surface-secondary"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-text-primary">
                          {member.student.first_name} {member.student.last_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-text-secondary">
                          {member.student.year_group ?? '---'}
                        </td>
                        <td className="px-4 py-3 text-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger-text hover:text-danger-text"
                            disabled={removingId === member.id}
                            onClick={() => void handleRemoveMember(member.id)}
                          >
                            <Trash2 className="me-1 h-3.5 w-3.5" />
                            {removingId === member.id ? 'Removing...' : 'Remove'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bulk Assign Sheet */}
      <Sheet open={assignOpen} onOpenChange={setAssignOpen}>
        <SheetContent className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              Assign Students to {activeHouse?.name ?? 'House'}
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 space-y-3 overflow-y-auto py-3">
            {/* Search */}
            <Input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Search students..."
              className="text-base"
            />

            {/* Select all / count */}
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span>{selectedStudents.size} selected</span>
              {filteredStudents.length > 0 && (
                <button
                  type="button"
                  className="text-primary-600 hover:underline"
                  onClick={() => {
                    if (selectedStudents.size === filteredStudents.length) {
                      setSelectedStudents(new Set());
                    } else {
                      setSelectedStudents(new Set(filteredStudents.map((s) => s.id)));
                    }
                  }}
                >
                  {selectedStudents.size === filteredStudents.length
                    ? 'Deselect all'
                    : 'Select all'}
                </button>
              )}
            </div>

            {/* Student list */}
            {studentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 animate-pulse rounded-lg bg-surface-secondary" />
                ))}
              </div>
            ) : filteredStudents.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-tertiary">
                {studentSearch ? 'No students match your search.' : 'All students are already assigned to a house.'}
              </p>
            ) : (
              <div className="space-y-1">
                {filteredStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-secondary"
                  >
                    <Checkbox
                      checked={selectedStudents.has(student.id)}
                      onCheckedChange={() => toggleStudent(student.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">
                        {student.first_name} {student.last_name}
                      </p>
                      {student.year_group && (
                        <p className="text-xs text-text-tertiary">{student.year_group}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <SheetFooter className="border-t border-border pt-3">
            <Button variant="outline" onClick={() => setAssignOpen(false)} disabled={assignSaving}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleBulkAssign()}
              disabled={assignSaving || selectedStudents.size === 0}
            >
              {assignSaving
                ? 'Assigning...'
                : `Assign ${selectedStudents.size} Student${selectedStudents.size !== 1 ? 's' : ''}`}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
