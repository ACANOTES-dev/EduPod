'use client';

import { Download, LayoutGrid, List, Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Switch, Label, toast } from '@school/ui';


import { AssignmentBoard } from './_components/assignment-board';
import { AssignmentList } from './_components/assignment-list';
import { ExportDialog } from './_components/export-dialog';
import {
  ALL_EXPORT_COLUMNS,
  BulkAssignResponse,
  ClassAssignmentsResponse,
  DEFAULT_SELECTED_COLUMNS,
  ExportDataResponse,
  Student,
  YearGroup,
  formatDateForExport,
  formatGender,
  generateExcel,
  generatePdf,
  mergeByYearLevel,
} from './_components/export-utils';
import { BulkAssignBar, SaveBar } from './_components/floating-action-bars';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassAssignmentsPage() {
  const t = useTranslations('classAssignments');

  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [showUnassignedOnly, setShowUnassignedOnly] = React.useState(false);
  const [exportModalOpen, setExportModalOpen] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<'xlsx' | 'pdf'>('xlsx');
  const [selectedColumns, setSelectedColumns] = React.useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED_COLUMNS),
  );
  const [exportGrouping, setExportGrouping] = React.useState<'subclass' | 'year_level'>('subclass');
  const [viewMode, setViewMode] = React.useState<'list' | 'board'>('list');
  const [presetName, setPresetName] = React.useState('');
  const [draggedStudent, setDraggedStudent] = React.useState<{
    id: string;
    yearGroupId: string;
  } | null>(null);
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());
  const [pendingChanges, setPendingChanges] = React.useState<Map<string, string>>(new Map());
  const [selectedStudents, setSelectedStudents] = React.useState<Set<string>>(new Set());
  const [bulkAssignClassId, setBulkAssignClassId] = React.useState<string>('');
  const [bulkAssignYearGroupId, setBulkAssignYearGroupId] = React.useState<string>('');

  const fetchData = React.useCallback(() => {
    setLoading(true);
    apiClient<ClassAssignmentsResponse>('/api/v1/class-assignments')
      .then((res) => {
        setYearGroups(res.data.year_groups);
        // Do NOT auto-expand — start collapsed
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const getClassCurrentCount = (classId: string, group: YearGroup): number => {
    let count = 0;
    for (const s of group.students) {
      const pending = pendingChanges.get(s.id);
      if (pending === classId) {
        count++;
        continue;
      }
      if (!pending && s.current_homeroom_class_id === classId) {
        count++;
      }
    }
    return count;
  };

  const handleClassChange = (
    studentId: string,
    classId: string,
    currentClassId: string | null,
    group?: YearGroup,
  ) => {
    // "unassign" is represented by the special value '__unassign__'
    if (classId === '__unassign__') {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(studentId, '__unassign__');
        return next;
      });
      return;
    }

    // Capacity check
    if (classId && group) {
      const cls = group.homeroom_classes.find((c) => c.id === classId);
      if (cls?.max_capacity) {
        const currentCount = getClassCurrentCount(classId, group);
        if (currentCount >= cls.max_capacity) {
          toast.error(t('classFull', { className: cls.name }), { position: 'top-center' });
          return;
        }
      }
    }

    setPendingChanges((prev) => {
      const next = new Map(prev);
      if (classId === currentClassId) {
        next.delete(studentId);
      } else {
        next.set(studentId, classId);
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (pendingChanges.size === 0) {
      toast.info(t('noChanges'));
      return;
    }

    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Separate assigns from unassigns
      const assigns: { student_id: string; class_id: string }[] = [];
      const unassigns: string[] = [];

      for (const [studentId, classId] of pendingChanges) {
        if (classId === '__unassign__') {
          unassigns.push(studentId);
        } else {
          assigns.push({ student_id: studentId, class_id: classId });
        }
      }

      let assignedCount = 0;

      // Process unassigns via individual student updates
      for (const studentId of unassigns) {
        await apiClient(`/api/v1/students/${studentId}`, {
          method: 'PATCH',
          body: JSON.stringify({ class_homeroom_id: null }),
        });
        assignedCount++;
      }

      // Process assigns via bulk endpoint
      if (assigns.length > 0) {
        const result = await apiClient<BulkAssignResponse>('/api/v1/class-assignments/bulk', {
          method: 'POST',
          body: JSON.stringify({ assignments: assigns, start_date: today }),
        });
        assignedCount += result.data.assigned;
      }

      toast.success(`${t('savedSuccessfully')} (${assignedCount} ${t('changes').toLowerCase()})`);
      setPendingChanges(new Map());
      setSelectedStudents(new Set());
      fetchData();
    } catch (err) {
      console.error('[handleSave]', err);
    } finally {
      setSaving(false);
    }
  };

  // ─── Selection handlers ───────────────────────────────────────────────────

  const toggleStudentSelection = (studentId: string, yearGroupId: string) => {
    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
    setBulkAssignYearGroupId(yearGroupId);
  };

  const toggleSelectAll = (group: YearGroup) => {
    const visible = getVisibleStudents(group);
    const allSelected = visible.every((s) => selectedStudents.has(s.id));

    setSelectedStudents((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const s of visible) next.delete(s.id);
      } else {
        for (const s of visible) next.add(s.id);
      }
      return next;
    });
    setBulkAssignYearGroupId(group.id);
  };

  const handleBulkAssign = () => {
    if (!bulkAssignClassId || selectedStudents.size === 0) return;

    const group = yearGroups.find((g) => g.id === bulkAssignYearGroupId);
    if (!group) return;

    setPendingChanges((prev) => {
      const next = new Map(prev);
      for (const studentId of selectedStudents) {
        const student = group.students.find((s) => s.id === studentId);
        if (student && student.current_homeroom_class_id !== bulkAssignClassId) {
          next.set(studentId, bulkAssignClassId);
        }
      }
      return next;
    });

    toast.success(t('bulkAssignQueued', { count: selectedStudents.size }));
    setSelectedStudents(new Set());
    setBulkAssignClassId('');
  };

  // ─── Auto-balance handler ─────────────────────────────────────────────────

  const handleAutoBalance = (group: YearGroup) => {
    if (group.homeroom_classes.length === 0) return;

    const unassigned = group.students.filter(
      (s) => !s.current_homeroom_class_id && !pendingChanges.has(s.id),
    );
    if (unassigned.length === 0) {
      toast.info(t('noUnassignedToBalance'));
      return;
    }

    const shuffled = [...unassigned].sort(() => Math.random() - 0.5);

    setPendingChanges((prev) => {
      const next = new Map(prev);
      shuffled.forEach((student, i) => {
        const classIndex = i % group.homeroom_classes.length;
        const targetClass = group.homeroom_classes[classIndex];
        if (targetClass) {
          next.set(student.id, targetClass.id);
        }
      });
      return next;
    });

    toast.success(
      t('autoBalanced', { count: unassigned.length, classes: group.homeroom_classes.length }),
    );
  };

  // ─── Print handler ────────────────────────────────────────────────────────

  const handlePrint = async () => {
    try {
      const res = await apiClient<ExportDataResponse>('/api/v1/class-assignments/export-data');
      const data = res.data;
      if (data.class_lists.length === 0) {
        toast.info(t('noDataToExport'));
        return;
      }

      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const html = `<!DOCTYPE html>
<html><head><title>Class Lists</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
  .page { page-break-after: always; padding: 20px; }
  .page:last-child { page-break-after: auto; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 14px; margin: 10px 0 5px; color: #333; }
  .date { font-size: 11px; color: #666; margin: 4px 0 16px; }
  .count { font-size: 11px; color: #666; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #222; color: #fff; padding: 6px 8px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) td { background: #f8f8f8; }
  @media print { .page { page-break-after: always; } }
</style></head><body>
${data.class_lists
  .filter((cl) => cl.students.length > 0)
  .map(
    (cl) => `
  <div class="page">
    <h1>${data.school_name}</h1>
    <div class="date">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    <h2>${cl.year_group_name} — ${cl.class_name}</h2>
    <div class="count">${cl.students.length} student${cl.students.length !== 1 ? 's' : ''}</div>
    <table>
      <thead><tr><th>#</th><th>Student No.</th><th>First Name</th><th>Last Name</th><th>Gender</th><th>DOB</th></tr></thead>
      <tbody>${cl.students
        .map(
          (s, i) => `
        <tr><td>${i + 1}</td><td>${s.student_number ?? '—'}</td><td>${s.first_name}</td><td>${s.last_name}</td><td>${formatGender(s.gender)}</td><td>${formatDateForExport(s.date_of_birth)}</td></tr>`,
        )
        .join('')}
      </tbody>
    </table>
  </div>`,
  )
  .join('')}
</body></html>`;

      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch (err) {
      console.error('[handlePrint]', err);
      toast.error(t('exportError'));
    }
  };

  // ─── Drag-and-drop handlers ───────────────────────────────────────────────

  const handleDragStart = (studentId: string, yearGroupId: string) => {
    setDraggedStudent({ id: studentId, yearGroupId });
  };

  const handleDrop = (targetClassId: string | '__unassign__') => {
    if (!draggedStudent) return;
    const group = yearGroups.find((g) => g.id === draggedStudent.yearGroupId);
    if (!group) return;

    if (targetClassId === '__unassign__') {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(draggedStudent.id, '__unassign__');
        return next;
      });
      setDraggedStudent(null);
      return;
    }

    // Capacity check
    const cls = group.homeroom_classes.find((c) => c.id === targetClassId);
    if (cls?.max_capacity) {
      const currentCount = getClassCurrentCount(targetClassId, group);
      if (currentCount >= cls.max_capacity) {
        toast.error(t('classFull', { className: cls.name }), { position: 'top-center' });
        setDraggedStudent(null);
        return;
      }
    }

    const student = group.students.find((s) => s.id === draggedStudent.id);
    if (student && student.current_homeroom_class_id !== targetClassId) {
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(draggedStudent.id, targetClassId);
        return next;
      });
    }
    setDraggedStudent(null);
  };

  // ─── Export handlers ──────────────────────────────────────────────────────

  const openExportModal = (format: 'xlsx' | 'pdf') => {
    setExportFormat(format);
    setExportModalOpen(true);
  };

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const activeColumns = ALL_EXPORT_COLUMNS.filter((c) => selectedColumns.has(c.key));

  const handleExport = async () => {
    if (activeColumns.length === 0) return;
    setExporting(true);
    try {
      const res = await apiClient<ExportDataResponse>('/api/v1/class-assignments/export-data');
      if (res.data.class_lists.length === 0) {
        toast.info(t('noDataToExport'));
        return;
      }
      const exportData = {
        ...res.data,
        class_lists:
          exportGrouping === 'year_level'
            ? mergeByYearLevel(res.data.class_lists)
            : res.data.class_lists,
      };
      if (exportFormat === 'xlsx') {
        generateExcel(exportData, activeColumns);
      } else {
        await generatePdf(exportData, activeColumns);
      }
      toast.success(t('exportSuccess'));
      setExportModalOpen(false);
    } catch (err) {
      console.error('[handleExport]', err);
      toast.error(t('exportError'));
    } finally {
      setExporting(false);
    }
  };

  // ─── Loading skeleton ─────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-56 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-4 w-80 animate-pulse rounded-lg bg-surface-secondary" />
        <div className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
        <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const getAssignedCount = (group: YearGroup): number => {
    return group.students.filter((s) => {
      const pendingClass = pendingChanges.get(s.id);
      if (pendingClass !== undefined) return true;
      return s.current_homeroom_class_id !== null;
    }).length;
  };

  const getVisibleStudents = (group: YearGroup): Student[] => {
    if (!showUnassignedOnly) return group.students;
    return group.students.filter((s) => {
      if (pendingChanges.has(s.id)) return false;
      return s.current_homeroom_class_id === null;
    });
  };

  // Get homeroom classes for the currently selected year group (for bulk assign bar)
  const bulkAssignGroup = yearGroups.find((g) => g.id === bulkAssignYearGroupId);
  const bulkAssignClasses = bulkAssignGroup?.homeroom_classes ?? [];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-primary-500 text-white' : 'bg-surface text-text-secondary hover:bg-surface-secondary'}`}
                title={t('listView')}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`p-2 transition-colors ${viewMode === 'board' ? 'bg-primary-500 text-white' : 'bg-surface text-text-secondary hover:bg-surface-secondary'}`}
                title={t('boardView')}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => void handlePrint()}>
              <Printer className="me-2 h-4 w-4" />
              {t('print')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => openExportModal('xlsx')}>
              <Download className="me-2 h-4 w-4" />
              {t('exportExcel')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => openExportModal('pdf')}>
              <Download className="me-2 h-4 w-4" />
              {t('exportPdf')}
            </Button>
          </div>
        }
      />

      {/* Filter toggle */}
      <div className="flex items-center gap-3">
        <Switch
          id="unassigned-filter"
          checked={showUnassignedOnly}
          onCheckedChange={setShowUnassignedOnly}
        />
        <Label htmlFor="unassigned-filter" className="cursor-pointer text-sm text-text-secondary">
          {t('showUnassignedOnly')}
        </Label>
      </div>

      {/* Board view */}
      {viewMode === 'board' && (
        <AssignmentBoard
          yearGroups={yearGroups}
          pendingChanges={pendingChanges}
          draggedStudent={draggedStudent}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onAutoBalance={handleAutoBalance}
        />
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <AssignmentList
          yearGroups={yearGroups}
          pendingChanges={pendingChanges}
          expandedGroups={expandedGroups}
          selectedStudents={selectedStudents}
          showUnassignedOnly={showUnassignedOnly}
          onToggleGroup={toggleGroup}
          onClassChange={handleClassChange}
          onToggleStudentSelection={toggleStudentSelection}
          onToggleSelectAll={toggleSelectAll}
          onAutoBalance={handleAutoBalance}
          getAssignedCount={getAssignedCount}
          getVisibleStudents={getVisibleStudents}
        />
      )}

      {/* Bulk assign floating bar */}
      {selectedStudents.size > 0 && pendingChanges.size === 0 && (
        <BulkAssignBar
          selectedCount={selectedStudents.size}
          bulkAssignClassId={bulkAssignClassId}
          bulkAssignClasses={bulkAssignClasses}
          onClassChange={setBulkAssignClassId}
          onAssign={handleBulkAssign}
          onClear={() => {
            setSelectedStudents(new Set());
            setBulkAssignClassId('');
          }}
        />
      )}

      {/* Sticky save bar */}
      {pendingChanges.size > 0 && (
        <SaveBar
          pendingCount={pendingChanges.size}
          saving={saving}
          onSave={() => void handleSave()}
        />
      )}

      {/* Bottom padding when a bar is visible */}
      {(pendingChanges.size > 0 || selectedStudents.size > 0) && <div className="h-20" />}

      {/* Export column picker modal */}
      <ExportDialog
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        exportFormat={exportFormat}
        selectedColumns={selectedColumns}
        onToggleColumn={toggleColumn}
        exportGrouping={exportGrouping}
        onGroupingChange={setExportGrouping}
        activeColumns={activeColumns}
        exporting={exporting}
        onExport={() => void handleExport()}
        presetName={presetName}
        onPresetNameChange={setPresetName}
      />
    </div>
  );
}
