'use client';

import { AlertTriangle, Check, Loader2, Lock, Plus, Save, Unlock } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';

const UNLOCK_ROLES = new Set(['school_owner', 'school_principal']);

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatrixClass {
  id: string;
  name: string;
  year_group: { id: string; name: string } | null;
  academic_year: { id: string; name: string } | null;
}

interface MatrixSubject {
  id: string;
  name: string;
  code: string | null;
}

interface MatrixAssignment {
  class_id: string;
  subject_id: string;
  config_id: string;
}

interface MatrixData {
  classes: MatrixClass[];
  subjects: MatrixSubject[];
  assignments: MatrixAssignment[];
}

interface AcademicYear {
  id: string;
  name: string;
}

interface AcademicPeriod {
  id: string;
  name: string;
}

interface AssessmentCategory {
  id: string;
  name: string;
}

type YearGroupState = 'all' | 'none' | 'mixed';

// ─── Component ────────────────────────────────────────────────────────────────

export default function CurriculumMatrixPage() {
  const { user } = useAuth();
  const [matrix, setMatrix] = React.useState<MatrixData | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [togglingCells, setTogglingCells] = React.useState<Set<string>>(new Set());
  const [isLocked, setIsLocked] = React.useState(true);

  // View mode toggle
  const [viewMode, setViewMode] = React.useState<'class' | 'year'>('class');

  // Year-level pending changes: Map<"yearGroupId:subjectId", boolean>
  const [yearLevelChanges, setYearLevelChanges] = React.useState<Map<string, boolean>>(new Map());
  const [isSavingYearChanges, setIsSavingYearChanges] = React.useState(false);

  const userRoleKeys = React.useMemo(() => {
    if (!user?.memberships) return [];
    return user.memberships.flatMap((m) => m.roles?.map((r) => r.role_key) ?? []);
  }, [user]);

  const canUnlock = React.useMemo(
    () => userRoleKeys.some((k) => UNLOCK_ROLES.has(k)),
    [userRoleKeys],
  );

  const handleToggleLock = () => {
    if (isLocked) {
      if (!canUnlock) {
        toast.error('Only the School Owner or School Principal can unlock the curriculum matrix.');
        return;
      }
      setIsLocked(false);
    } else {
      setIsLocked(true);
    }
  };

  // Filters
  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearFilter, setYearFilter] = React.useState('all');

  // Selection for bulk operations
  const [selectedCells, setSelectedCells] = React.useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = React.useState(false);

  // Bulk assessment dialog
  const [bulkDialogOpen, setBulkDialogOpen] = React.useState(false);
  const [periods, setPeriods] = React.useState<AcademicPeriod[]>([]);
  const [categories, setCategories] = React.useState<AssessmentCategory[]>([]);
  const [bulkForm, setBulkForm] = React.useState({
    title: '',
    academic_period_id: '',
    category_id: '',
    max_score: '100',
    due_date: '',
  });
  const [isBulkCreating, setIsBulkCreating] = React.useState(false);

  // ─── Data fetching ──────────────────────────────────────────────────────

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=50')
      .then((res) => setAcademicYears(res.data))
      .catch(() => undefined);
  }, []);

  const fetchMatrix = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (yearFilter !== 'all') params.set('academic_year_id', yearFilter);
      const res = await apiClient<{ data: MatrixData }>(
        `/api/v1/curriculum-matrix?${params.toString()}`,
      );
      setMatrix(res.data);
    } catch {
      setMatrix(null);
    } finally {
      setIsLoading(false);
    }
  }, [yearFilter]);

  React.useEffect(() => {
    void fetchMatrix();
  }, [fetchMatrix]);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const cellKey = (classId: string, subjectId: string) => `${classId}:${subjectId}`;

  const assignmentSet = React.useMemo(() => {
    if (!matrix) return new Set<string>();
    return new Set(matrix.assignments.map((a) => cellKey(a.class_id, a.subject_id)));
  }, [matrix]);

  const isAssigned = (classId: string, subjectId: string) =>
    assignmentSet.has(cellKey(classId, subjectId));

  // ─── Toggle handler (class level) ─────────────────────────────────────

  const handleToggle = async (classId: string, subjectId: string) => {
    if (isLocked) return;
    const key = cellKey(classId, subjectId);
    if (togglingCells.has(key)) return;

    const currentlyEnabled = isAssigned(classId, subjectId);
    setTogglingCells((prev) => new Set(prev).add(key));

    try {
      await apiClient('/api/v1/curriculum-matrix/toggle', {
        method: 'POST',
        body: JSON.stringify({
          class_id: classId,
          subject_id: subjectId,
          enabled: !currentlyEnabled,
        }),
      });
      await fetchMatrix();
    } catch (err) {
      // Error toast is handled by apiClient
      console.error('[fetchMatrix]', err);
    } finally {
      setTogglingCells((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  // ─── Selection handlers ─────────────────────────────────────────────────

  const toggleCellSelection = (classId: string, subjectId: string) => {
    const key = cellKey(classId, subjectId);
    if (!isAssigned(classId, subjectId)) return; // Can only select assigned cells
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllAssigned = () => {
    if (!matrix) return;
    const all = new Set<string>();
    for (const a of matrix.assignments) {
      all.add(cellKey(a.class_id, a.subject_id));
    }
    setSelectedCells(all);
  };

  const clearSelection = () => {
    setSelectedCells(new Set());
    setIsSelecting(false);
  };

  // ─── Bulk assessment creation ───────────────────────────────────────────

  const openBulkDialog = () => {
    // Load periods and categories
    apiClient<{ data: AcademicPeriod[] }>('/api/v1/academic-periods?pageSize=50')
      .then((res) => setPeriods(res.data))
      .catch(() => undefined);
    apiClient<{ data: AssessmentCategory[] }>('/api/v1/gradebook/assessment-categories')
      .then((res) => setCategories(Array.isArray(res.data) ? res.data : []))
      .catch(() => undefined);
    setBulkForm({
      title: '',
      academic_period_id: '',
      category_id: '',
      max_score: '100',
      due_date: '',
    });
    setBulkDialogOpen(true);
  };

  const handleBulkCreate = async () => {
    if (!bulkForm.title || !bulkForm.academic_period_id || !bulkForm.category_id) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Extract unique class_ids and subject_ids from selection
    const classIds = new Set<string>();
    const subjectIds = new Set<string>();
    for (const key of selectedCells) {
      const [cId, sId] = key.split(':');
      classIds.add(cId!);
      subjectIds.add(sId!);
    }

    setIsBulkCreating(true);
    try {
      const res = await apiClient<{ created: number; skipped: number }>(
        '/api/v1/curriculum-matrix/bulk-assessments',
        {
          method: 'POST',
          body: JSON.stringify({
            class_ids: Array.from(classIds),
            subject_ids: Array.from(subjectIds),
            academic_period_id: bulkForm.academic_period_id,
            category_id: bulkForm.category_id,
            title: bulkForm.title,
            max_score: parseFloat(bulkForm.max_score) || 100,
            due_date: bulkForm.due_date || null,
          }),
        },
      );
      toast.success(
        `Created ${res.created} assessment(s)${res.skipped > 0 ? `, ${res.skipped} skipped` : ''}`,
      );
      setBulkDialogOpen(false);
      clearSelection();
    } catch (err) {
      // Error toast handled by apiClient
      console.error('[clearSelection]', err);
    } finally {
      setIsBulkCreating(false);
    }
  };

  // ─── Group classes by year group ────────────────────────────────────────

  const groupedClasses = React.useMemo(() => {
    if (!matrix) return [];
    const groups: Array<{ yearGroup: string; yearGroupId: string | null; classes: MatrixClass[] }> =
      [];
    const groupMap = new Map<string, { yearGroupId: string | null; classes: MatrixClass[] }>();

    for (const c of matrix.classes) {
      const key = c.year_group?.name ?? 'Ungrouped';
      if (!groupMap.has(key))
        groupMap.set(key, { yearGroupId: c.year_group?.id ?? null, classes: [] });
      groupMap.get(key)!.classes.push(c);
    }

    for (const [yearGroup, data] of groupMap) {
      groups.push({ yearGroup, yearGroupId: data.yearGroupId, classes: data.classes });
    }

    return groups;
  }, [matrix]);

  // ─── Year-level computed state ──────────────────────────────────────────

  const getYearGroupSubjectState = React.useCallback(
    (yearGroupId: string, subjectId: string): YearGroupState => {
      if (!matrix) return 'none';

      const classesInGroup = matrix.classes.filter((c) => c.year_group?.id === yearGroupId);
      if (classesInGroup.length === 0) return 'none';

      let assignedCount = 0;
      for (const cls of classesInGroup) {
        if (assignmentSet.has(cellKey(cls.id, subjectId))) assignedCount++;
      }

      if (assignedCount === 0) return 'none';
      if (assignedCount === classesInGroup.length) return 'all';
      return 'mixed';
    },
    [matrix, assignmentSet],
  );

  const getEffectiveYearState = React.useCallback(
    (yearGroupId: string, subjectId: string): { state: YearGroupState; isPending: boolean } => {
      const changeKey = `${yearGroupId}:${subjectId}`;
      const pendingValue = yearLevelChanges.get(changeKey);

      if (pendingValue !== undefined) {
        return { state: pendingValue ? 'all' : 'none', isPending: true };
      }

      return { state: getYearGroupSubjectState(yearGroupId, subjectId), isPending: false };
    },
    [yearLevelChanges, getYearGroupSubjectState],
  );

  // ─── Year-level toggle handler ──────────────────────────────────────────

  const handleYearLevelToggle = (yearGroupId: string, subjectId: string) => {
    if (isLocked) return;

    const changeKey = `${yearGroupId}:${subjectId}`;
    const { state } = getEffectiveYearState(yearGroupId, subjectId);

    setYearLevelChanges((prev) => {
      const next = new Map(prev);

      if (state === 'none' || state === 'mixed') {
        // Toggle to all enabled
        const originalState = getYearGroupSubjectState(yearGroupId, subjectId);
        if (originalState === 'all') {
          // Pending change would return to original state, so remove it
          next.delete(changeKey);
        } else {
          next.set(changeKey, true);
        }
      } else {
        // state === 'all' -> toggle to none
        const originalState = getYearGroupSubjectState(yearGroupId, subjectId);
        if (originalState === 'none') {
          // Pending change would return to original state, so remove it
          next.delete(changeKey);
        } else {
          next.set(changeKey, false);
        }
      }

      return next;
    });
  };

  // ─── Year-level save handler ────────────────────────────────────────────

  const handleSaveYearChanges = async () => {
    if (yearLevelChanges.size === 0) return;

    // We need an academic year to pass to the endpoint
    // Get the academic year from the first class in the matrix
    const academicYearId =
      yearFilter !== 'all' ? yearFilter : matrix?.classes[0]?.academic_year?.id;

    if (!academicYearId) {
      toast.error('Please select an academic year first.');
      return;
    }

    // Group changes by year group
    const changesByYearGroup = new Map<string, Array<{ subject_id: string; enabled: boolean }>>();
    for (const [key, enabled] of yearLevelChanges) {
      const [yearGroupId, subjectId] = key.split(':');
      if (!yearGroupId || !subjectId) continue;
      if (!changesByYearGroup.has(yearGroupId)) changesByYearGroup.set(yearGroupId, []);
      changesByYearGroup.get(yearGroupId)!.push({ subject_id: subjectId, enabled });
    }

    setIsSavingYearChanges(true);
    let totalCreated = 0;
    let totalRemoved = 0;

    try {
      for (const [yearGroupId, assignments] of changesByYearGroup) {
        const res = await apiClient<{ created: number; removed: number }>(
          '/api/v1/curriculum-matrix/year-group-assign',
          {
            method: 'POST',
            body: JSON.stringify({
              academic_year_id: academicYearId,
              year_group_id: yearGroupId,
              assignments,
            }),
          },
        );
        totalCreated += res.created;
        totalRemoved += res.removed;
      }

      toast.success(
        `Year-level update complete: ${totalCreated} assigned, ${totalRemoved} removed`,
      );
      setYearLevelChanges(new Map());
      await fetchMatrix();
    } catch (err) {
      // Error toast handled by apiClient
      console.error('[fetchMatrix]', err);
    } finally {
      setIsSavingYearChanges(false);
    }
  };

  // ─── Mode switch handler ────────────────────────────────────────────────

  const handleViewModeChange = (mode: 'class' | 'year') => {
    if (mode === viewMode) return;
    if (mode === 'class' && yearLevelChanges.size > 0) {
      // Clear unsaved year-level changes when switching to class mode
      setYearLevelChanges(new Map());
    }
    setViewMode(mode);
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Curriculum Matrix" />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-text-tertiary" />
        </div>
      </div>
    );
  }

  if (!matrix || matrix.classes.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Curriculum Matrix" />
        <div className="text-center py-20 text-text-tertiary">
          No classes found. Create classes first, then assign subjects here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Curriculum Matrix"
        actions={
          <div className="flex items-center gap-2">
            {viewMode === 'class' && !isLocked && isSelecting ? (
              <>
                <span className="text-sm text-text-secondary">{selectedCells.size} selected</span>
                <Button size="sm" variant="outline" onClick={selectAllAssigned}>
                  Select All
                </Button>
                <Button size="sm" variant="outline" onClick={clearSelection}>
                  Cancel
                </Button>
                <Button size="sm" disabled={selectedCells.size === 0} onClick={openBulkDialog}>
                  <Plus className="me-2 h-4 w-4" />
                  Create Assessments ({selectedCells.size})
                </Button>
              </>
            ) : viewMode === 'class' && !isLocked ? (
              <Button size="sm" variant="outline" onClick={() => setIsSelecting(true)}>
                <Plus className="me-2 h-4 w-4" />
                Bulk Create Assessments
              </Button>
            ) : null}

            {viewMode === 'year' && yearLevelChanges.size > 0 && (
              <Button
                size="sm"
                onClick={() => void handleSaveYearChanges()}
                disabled={isSavingYearChanges}
              >
                {isSavingYearChanges ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="me-2 h-4 w-4" />
                )}
                {isSavingYearChanges ? 'Saving...' : `Save Changes (${yearLevelChanges.size})`}
              </Button>
            )}
          </div>
        }
      />

      {/* Year filter + view toggle + lock toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="Academic Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Academic Years</SelectItem>
              {academicYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* View mode segmented control */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => handleViewModeChange('class')}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                viewMode === 'class'
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80'
              }`}
            >
              Class Level
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('year')}
              className={`px-3 py-2 text-sm font-medium transition-colors border-s border-border ${
                viewMode === 'year'
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80'
              }`}
            >
              Year Level
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleLock}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            isLocked
              ? 'border-border bg-surface-secondary text-text-secondary hover:bg-surface-secondary/80'
              : 'border-success-border bg-success-fill/10 text-success-text'
          }`}
        >
          {isLocked ? (
            <>
              <Lock className="h-4 w-4" />
              <span>Locked</span>
            </>
          ) : (
            <>
              <Unlock className="h-4 w-4" />
              <span>Unlocked — click to lock</span>
            </>
          )}
        </button>
      </div>

      {/* Matrix grid */}
      <div
        className={`overflow-x-auto rounded-xl border border-border ${isLocked ? 'opacity-60 pointer-events-none select-none' : ''}`}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-surface-secondary">
              <th className="sticky start-0 z-10 bg-surface-secondary px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary border-e border-border min-w-[180px]">
                {viewMode === 'class' ? 'Class' : 'Year Group'}
              </th>
              {matrix.subjects.map((subject) => (
                <th
                  key={subject.id}
                  className="px-2 py-3 text-center text-xs font-semibold text-text-tertiary min-w-[80px] border-e border-border last:border-e-0"
                  title={subject.name}
                >
                  <div className="truncate max-w-[80px]">
                    {subject.code ?? subject.name.slice(0, 5)}
                  </div>
                  <div className="truncate max-w-[80px] text-[10px] font-normal text-text-tertiary">
                    {subject.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {viewMode === 'class'
              ? /* ─── Class Level View ─────────────────────────────────── */
                groupedClasses.map((group) => (
                  <React.Fragment key={group.yearGroup}>
                    {/* Year group header row */}
                    <tr>
                      <td
                        colSpan={matrix.subjects.length + 1}
                        className="bg-surface-secondary/50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-text-secondary border-y border-border"
                      >
                        {group.yearGroup}
                      </td>
                    </tr>
                    {/* Class rows */}
                    {group.classes.map((cls) => (
                      <tr
                        key={cls.id}
                        className="border-b border-border last:border-b-0 hover:bg-surface-secondary/30 transition-colors"
                      >
                        <td className="sticky start-0 z-10 bg-surface px-4 py-2 text-sm font-medium text-text-primary border-e border-border">
                          {cls.name}
                        </td>
                        {matrix.subjects.map((subject) => {
                          const key = cellKey(cls.id, subject.id);
                          const assigned = isAssigned(cls.id, subject.id);
                          const toggling = togglingCells.has(key);
                          const selected = selectedCells.has(key);

                          return (
                            <td
                              key={subject.id}
                              className="border-e border-border last:border-e-0 p-0"
                            >
                              <button
                                type="button"
                                className={`flex h-10 w-full items-center justify-center transition-all
                                ${
                                  isSelecting && assigned
                                    ? selected
                                      ? 'bg-primary-500/20 ring-2 ring-inset ring-primary-500'
                                      : 'hover:bg-surface-secondary cursor-pointer'
                                    : ''
                                }
                                ${!isSelecting ? 'cursor-pointer hover:bg-surface-secondary' : ''}
                                ${toggling ? 'opacity-50' : ''}
                              `}
                                onClick={() => {
                                  if (isSelecting) {
                                    toggleCellSelection(cls.id, subject.id);
                                  } else {
                                    void handleToggle(cls.id, subject.id);
                                  }
                                }}
                                disabled={toggling}
                                aria-label={`${subject.name} for ${cls.name}: ${assigned ? 'assigned' : 'not assigned'}`}
                              >
                                {toggling ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-text-tertiary" />
                                ) : assigned ? (
                                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-success-fill">
                                    <Check className="h-4 w-4 text-success-text" strokeWidth={3} />
                                  </div>
                                ) : (
                                  <div className="h-7 w-7 rounded-md border-2 border-border-primary bg-surface-secondary" />
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))
              : /* ─── Year Level View ──────────────────────────────────── */
                groupedClasses
                  .filter((g) => g.yearGroupId !== null)
                  .map((group) => (
                    <tr
                      key={group.yearGroupId}
                      className="border-b border-border last:border-b-0 hover:bg-surface-secondary/30 transition-colors"
                    >
                      <td className="sticky start-0 z-10 bg-surface px-4 py-2 text-sm font-medium text-text-primary border-e border-border">
                        <div>{group.yearGroup}</div>
                        <div className="text-[10px] text-text-tertiary">
                          {group.classes.length} class{group.classes.length !== 1 ? 'es' : ''}
                        </div>
                      </td>
                      {matrix.subjects.map((subject) => {
                        const { state, isPending } = getEffectiveYearState(
                          group.yearGroupId!,
                          subject.id,
                        );

                        return (
                          <td
                            key={subject.id}
                            className="border-e border-border last:border-e-0 p-0"
                          >
                            <button
                              type="button"
                              className={`flex h-10 w-full items-center justify-center transition-all cursor-pointer hover:bg-surface-secondary/50
                              ${isPending ? 'ring-2 ring-inset ring-dashed ring-primary-400' : ''}
                            `}
                              onClick={() => handleYearLevelToggle(group.yearGroupId!, subject.id)}
                              aria-label={`${subject.name} for ${group.yearGroup}: ${state}`}
                            >
                              {state === 'all' ? (
                                <div
                                  className={`flex h-7 w-7 items-center justify-center rounded-md bg-success-fill ${isPending ? 'border-2 border-dashed border-primary-500' : ''}`}
                                >
                                  <Check className="h-4 w-4 text-success-text" strokeWidth={3} />
                                </div>
                              ) : state === 'mixed' ? (
                                <div
                                  className={`flex h-7 w-7 items-center justify-center rounded-md bg-error-fill ${isPending ? 'border-2 border-dashed border-primary-500' : ''}`}
                                >
                                  <AlertTriangle
                                    className="h-4 w-4 text-error-text"
                                    strokeWidth={2.5}
                                  />
                                </div>
                              ) : (
                                <div
                                  className={`h-7 w-7 rounded-md border-2 bg-surface-secondary ${isPending ? 'border-dashed border-primary-500' : 'border-border-primary'}`}
                                />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>

      {/* Bulk Assessment Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Assessments in Bulk</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">
            This will create one assessment for each assigned class+subject combination in your
            selection ({selectedCells.size} cells selected).
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-title">Assessment Title *</Label>
              <Input
                id="bulk-title"
                placeholder="e.g. Midterm Exam"
                value={bulkForm.title}
                onChange={(e) => setBulkForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Academic Period *</Label>
                <Select
                  value={bulkForm.academic_period_id}
                  onValueChange={(v) => setBulkForm((p) => ({ ...p, academic_period_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select period" />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Category *</Label>
                <Select
                  value={bulkForm.category_id}
                  onValueChange={(v) => setBulkForm((p) => ({ ...p, category_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-max">Max Score *</Label>
                <Input
                  id="bulk-max"
                  type="number"
                  dir="ltr"
                  value={bulkForm.max_score}
                  onChange={(e) => setBulkForm((p) => ({ ...p, max_score: e.target.value }))}
                  min="1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-due">Due Date</Label>
                <Input
                  id="bulk-due"
                  type="date"
                  dir="ltr"
                  value={bulkForm.due_date}
                  onChange={(e) => setBulkForm((p) => ({ ...p, due_date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkDialogOpen(false)}
              disabled={isBulkCreating}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleBulkCreate()} disabled={isBulkCreating}>
              {isBulkCreating && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {isBulkCreating ? 'Creating...' : 'Create Assessments'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
