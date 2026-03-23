'use client';

import {
  Badge,
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  toast,
} from '@school/ui';
import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ChevronDown, ChevronUp, Download, Save, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import * as XLSX from 'xlsx';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HomeroomClass {
  id: string;
  name: string;
  enrolled_count: number;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string;
  current_homeroom_class_id: string | null;
  current_homeroom_class_name: string | null;
}

interface YearGroup {
  id: string;
  name: string;
  display_order: number;
  homeroom_classes: HomeroomClass[];
  students: Student[];
}

interface ClassAssignmentsResponse {
  data: {
    year_groups: YearGroup[];
    unassigned_count: number;
  };
}

interface BulkAssignResponse {
  data: {
    assigned: number;
    skipped: number;
    errors: string[];
  };
}

interface ExportStudent {
  student_number: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
}

interface ExportClassList {
  class_id: string;
  class_name: string;
  year_group_name: string;
  students: ExportStudent[];
}

interface ExportDataResponse {
  data: {
    academic_year: string;
    school_name: string;
    logo_url: string | null;
    class_lists: ExportClassList[];
  };
}

// ─── Export helpers ──────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatGender(gender: string | null): string {
  if (!gender) return '—';
  return gender.charAt(0).toUpperCase() + gender.slice(1).replace(/_/g, ' ');
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function generateExcel(data: ExportDataResponse['data']): void {
  const wb = XLSX.utils.book_new();

  for (const classList of data.class_lists) {
    if (classList.students.length === 0) continue;

    const headers = ['#', 'Student Number', 'First Name', 'Last Name', 'Gender', 'Date of Birth'];
    const rows = classList.students.map((s, i) => [
      i + 1,
      s.student_number ?? '—',
      s.first_name,
      s.last_name,
      formatGender(s.gender),
      formatDate(s.date_of_birth),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = [
      { wch: 5 },
      { wch: 16 },
      { wch: 18 },
      { wch: 18 },
      { wch: 12 },
      { wch: 14 },
    ];

    const sheetName = classList.class_name.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buf], { type: 'application/octet-stream' }),
    `Class_Lists_${data.academic_year}.xlsx`,
  );
}

async function generatePdf(data: ExportDataResponse['data']): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 20;
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  let logoDataUrl: string | null = null;
  if (data.logo_url) {
    logoDataUrl = await loadImageAsDataUrl(data.logo_url);
  }

  let isFirstPage = true;

  for (const classList of data.class_lists) {
    if (classList.students.length === 0) continue;

    if (!isFirstPage) {
      doc.addPage();
    }
    isFirstPage = false;

    let yPos = margin;

    // Logo + school name header
    if (logoDataUrl) {
      try {
        doc.addImage(logoDataUrl, 'PNG', margin, yPos, 15, 15);
      } catch {
        // Logo failed to embed — continue without it
      }
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(data.school_name, margin + 20, yPos + 7);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(today, margin + 20, yPos + 13);
      yPos += 22;
    } else {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(data.school_name, margin, yPos + 5);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(today, margin, yPos + 11);
      yPos += 18;
    }

    // Class name subtitle
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`${classList.year_group_name} — ${classList.class_name}`, margin, yPos + 6);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${classList.students.length} student${classList.students.length !== 1 ? 's' : ''}`,
      margin,
      yPos + 12,
    );
    yPos += 18;

    // Student table
    autoTable(doc, {
      startY: yPos,
      margin: { left: margin, right: margin },
      head: [['#', 'Student No.', 'First Name', 'Last Name', 'Gender', 'Date of Birth']],
      body: classList.students.map((s, i) => [
        i + 1,
        s.student_number ?? '—',
        s.first_name,
        s.last_name,
        formatGender(s.gender),
        formatDate(s.date_of_birth),
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
  }

  doc.save(`Class_Lists_${data.academic_year}.pdf`);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassAssignmentsPage() {
  const t = useTranslations('classAssignments');

  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [showUnassignedOnly, setShowUnassignedOnly] = React.useState(false);
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

  const handleClassChange = (studentId: string, classId: string, currentClassId: string | null) => {
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
      const assignments = Array.from(pendingChanges.entries()).map(([student_id, class_id]) => ({
        student_id,
        class_id,
      }));

      const today = new Date().toISOString().split('T')[0];

      const result = await apiClient<BulkAssignResponse>('/api/v1/class-assignments/bulk', {
        method: 'POST',
        body: JSON.stringify({ assignments, start_date: today }),
      });

      toast.success(
        `${t('savedSuccessfully')} (${result.data.assigned} ${t('assigned').toLowerCase()})`,
      );
      setPendingChanges(new Map());
      setSelectedStudents(new Set());
      fetchData();
    } catch {
      // apiClient handles error toasts
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

  // ─── Export handlers ──────────────────────────────────────────────────────

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(true);
    try {
      const res = await apiClient<ExportDataResponse>('/api/v1/class-assignments/export-data');
      if (res.data.class_lists.length === 0) {
        toast.info(t('noDataToExport'));
        return;
      }
      if (format === 'xlsx') {
        generateExcel(res.data);
      } else {
        await generatePdf(res.data);
      }
      toast.success(t('exportSuccess'));
    } catch {
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={() => void handleExport('xlsx')}
            >
              <Download className="me-2 h-4 w-4" />
              {t('exportExcel')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={() => void handleExport('pdf')}
            >
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

      {/* Year group accordions */}
      <div className="space-y-3">
        {yearGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.id);
          const assignedCount = getAssignedCount(group);
          const totalCount = group.students.length;
          const visibleStudents = getVisibleStudents(group);
          const allVisibleSelected =
            visibleStudents.length > 0 && visibleStudents.every((s) => selectedStudents.has(s.id));

          return (
            <div
              key={group.id}
              className={`overflow-hidden rounded-xl border transition-colors ${
                isExpanded
                  ? 'border-primary-300 bg-primary-50/30 dark:border-primary-700 dark:bg-primary-950/20'
                  : 'border-border bg-surface'
              }`}
            >
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={`flex w-full items-center justify-between px-4 py-3 transition-colors ${
                  isExpanded
                    ? 'bg-primary-100/50 dark:bg-primary-900/30'
                    : 'hover:bg-surface-secondary'
                }`}
              >
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold text-text-primary">{group.name}</h2>
                  <Badge
                    variant={assignedCount === totalCount ? 'success' : 'warning'}
                  >
                    {t('assignedOf', { assigned: assignedCount, total: totalCount })}
                  </Badge>
                </div>
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-text-tertiary" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-tertiary" />
                )}
              </button>

              {/* Accordion content */}
              {isExpanded && (
                <div className="border-t border-primary-200 dark:border-primary-800">
                  {/* Select-all row */}
                  {visibleStudents.length > 0 && (
                    <div className="flex items-center gap-3 border-b border-primary-200/50 dark:border-primary-800/50 bg-primary-50/20 dark:bg-primary-950/10 px-4 py-2">
                      <Checkbox
                        id={`select-all-${group.id}`}
                        checked={allVisibleSelected}
                        onCheckedChange={() => toggleSelectAll(group)}
                      />
                      <Label
                        htmlFor={`select-all-${group.id}`}
                        className="cursor-pointer text-xs font-medium text-text-secondary"
                      >
                        {t('selectAll')} ({visibleStudents.length})
                      </Label>
                    </div>
                  )}

                  {visibleStudents.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <p className="text-sm text-text-tertiary">{t('noStudents')}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-primary-100 dark:divide-primary-900/50">
                      {visibleStudents.map((student) => {
                        const pendingClass = pendingChanges.get(student.id);
                        const effectiveClassId = pendingClass ?? student.current_homeroom_class_id ?? '';
                        const hasChange = pendingChanges.has(student.id);
                        const isSelected = selectedStudents.has(student.id);

                        return (
                          <div
                            key={student.id}
                            className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${
                              hasChange
                                ? 'bg-primary-50/50 dark:bg-primary-950/20'
                                : isSelected
                                  ? 'bg-primary-50/30 dark:bg-primary-950/10'
                                  : ''
                            }`}
                          >
                            {/* Checkbox + Student info */}
                            <div className="flex items-center gap-3 min-w-0">
                              <Checkbox
                                id={`select-${student.id}`}
                                checked={isSelected}
                                onCheckedChange={() =>
                                  toggleStudentSelection(student.id, group.id)
                                }
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {student.first_name} {student.last_name}
                                </p>
                                <p className="font-mono text-xs text-text-tertiary">
                                  {student.student_number}
                                </p>
                              </div>
                              {student.current_homeroom_class_id ? (
                                <Badge variant="success" className="shrink-0">
                                  {student.current_homeroom_class_name}
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="shrink-0">
                                  {t('unassigned')}
                                </Badge>
                              )}
                            </div>

                            {/* Class selector */}
                            <div className="w-full sm:w-48 shrink-0">
                              {group.homeroom_classes.length === 0 ? (
                                <p className="text-xs text-text-tertiary italic">
                                  {t('noClassesAvailable')}
                                </p>
                              ) : (
                                <Select
                                  value={effectiveClassId}
                                  onValueChange={(value) =>
                                    handleClassChange(
                                      student.id,
                                      value,
                                      student.current_homeroom_class_id,
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9 text-sm">
                                    <SelectValue placeholder={t('selectClass')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {group.homeroom_classes.map((cls) => (
                                      <SelectItem key={cls.id} value={cls.id}>
                                        {cls.name} ({cls.enrolled_count})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bulk assign floating bar */}
      {selectedStudents.size > 0 && pendingChanges.size === 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-500" />
              <p className="text-sm font-medium text-text-secondary">
                {t('selectedStudents', { count: selectedStudents.size })}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={bulkAssignClassId} onValueChange={setBulkAssignClassId}>
                <SelectTrigger className="h-9 w-48 text-sm">
                  <SelectValue placeholder={t('assignToClass')} />
                </SelectTrigger>
                <SelectContent>
                  {bulkAssignClasses.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!bulkAssignClassId} onClick={handleBulkAssign}>
                {t('assignSelected')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedStudents(new Set());
                  setBulkAssignClassId('');
                }}
              >
                {t('clearSelection')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky save bar */}
      {pendingChanges.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="mx-auto flex max-w-screen-xl items-center justify-between">
            <p className="text-sm font-medium text-text-secondary">
              {t('pendingChanges', { count: pendingChanges.size })}
            </p>
            <Button onClick={() => void handleSave()} disabled={saving}>
              <Save className="me-2 h-4 w-4" />
              {saving ? t('saving') : t('saveAssignments')}
            </Button>
          </div>
        </div>
      )}

      {/* Bottom padding when a bar is visible */}
      {(pendingChanges.size > 0 || selectedStudents.size > 0) && <div className="h-20" />}
    </div>
  );
}
