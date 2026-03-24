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
import { ChevronDown, ChevronUp, Download, GripVertical, LayoutGrid, List, Printer, Save, Shuffle, Users } from 'lucide-react';
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
  max_capacity: number | null;
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

interface ExportParent {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

interface ExportStudent {
  student_number: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  national_id: string | null;
  nationality: string | null;
  city_of_birth: string | null;
  gender: string | null;
  date_of_birth: string | null;
  medical_notes: string | null;
  has_allergy: boolean;
  allergy_details: string | null;
  parents: ExportParent[];
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

interface ExportColumn {
  key: string;
  label: string;
  group: 'student' | 'parent';
  getValue: (s: ExportStudent, i: number) => string;
  width: number;
}

const ALL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'row_number', label: '#', group: 'student', getValue: (_s, i) => String(i + 1), width: 5 },
  { key: 'student_number', label: 'Student Number', group: 'student', getValue: (s) => s.student_number ?? '—', width: 18 },
  { key: 'first_name', label: 'First Name', group: 'student', getValue: (s) => s.first_name, width: 16 },
  { key: 'middle_name', label: 'Middle Name', group: 'student', getValue: (s) => s.middle_name ?? '—', width: 14 },
  { key: 'last_name', label: 'Last Name', group: 'student', getValue: (s) => s.last_name, width: 16 },
  { key: 'gender', label: 'Gender', group: 'student', getValue: (s) => formatGender(s.gender), width: 10 },
  { key: 'date_of_birth', label: 'Date of Birth', group: 'student', getValue: (s) => formatDate(s.date_of_birth), width: 14 },
  { key: 'nationality', label: 'Nationality', group: 'student', getValue: (s) => s.nationality ?? '—', width: 14 },
  { key: 'city_of_birth', label: 'City of Birth', group: 'student', getValue: (s) => s.city_of_birth ?? '—', width: 14 },
  { key: 'national_id', label: 'National ID', group: 'student', getValue: (s) => s.national_id ?? '—', width: 16 },
  { key: 'medical_notes', label: 'Medical Notes', group: 'student', getValue: (s) => s.medical_notes ?? '—', width: 20 },
  { key: 'allergy_details', label: 'Allergy Details', group: 'student', getValue: (s) => s.has_allergy ? (s.allergy_details ?? '—') : 'None', width: 20 },
  { key: 'parent1_name', label: 'Parent 1 Name', group: 'parent', getValue: (s) => s.parents[0] ? `${s.parents[0].first_name} ${s.parents[0].last_name}` : '—', width: 18 },
  { key: 'parent1_email', label: 'Parent 1 Email', group: 'parent', getValue: (s) => s.parents[0]?.email ?? '—', width: 22 },
  { key: 'parent1_phone', label: 'Parent 1 Phone', group: 'parent', getValue: (s) => s.parents[0]?.phone ?? '—', width: 16 },
  { key: 'parent2_name', label: 'Parent 2 Name', group: 'parent', getValue: (s) => s.parents[1] ? `${s.parents[1].first_name} ${s.parents[1].last_name}` : '—', width: 18 },
  { key: 'parent2_email', label: 'Parent 2 Email', group: 'parent', getValue: (s) => s.parents[1]?.email ?? '—', width: 22 },
  { key: 'parent2_phone', label: 'Parent 2 Phone', group: 'parent', getValue: (s) => s.parents[1]?.phone ?? '—', width: 16 },
];

const DEFAULT_SELECTED_COLUMNS = new Set([
  'row_number', 'student_number', 'first_name', 'last_name', 'gender', 'date_of_birth',
]);

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

function generateExcel(data: ExportDataResponse['data'], columns: ExportColumn[]): void {
  const wb = XLSX.utils.book_new();

  for (const classList of data.class_lists) {
    if (classList.students.length === 0) continue;

    const headers = columns.map((c) => c.label);
    const rows = classList.students.map((s, i) =>
      columns.map((c) => c.getValue(s, i)),
    );

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = columns.map((c) => ({ wch: c.width }));

    const sheetName = classList.class_name.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buf], { type: 'application/octet-stream' }),
    `Class_Lists_${data.academic_year}.xlsx`,
  );
}

async function generatePdf(data: ExportDataResponse['data'], columns: ExportColumn[]): Promise<void> {
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
      head: [columns.map((c) => c.label)],
      body: classList.students.map((s, i) =>
        columns.map((c) => c.getValue(s, i)),
      ),
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
  const [exportModalOpen, setExportModalOpen] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<'xlsx' | 'pdf'>('xlsx');
  const [selectedColumns, setSelectedColumns] = React.useState<Set<string>>(
    () => new Set(DEFAULT_SELECTED_COLUMNS),
  );
  const [exportGrouping, setExportGrouping] = React.useState<'subclass' | 'year_level'>('subclass');
  const [viewMode, setViewMode] = React.useState<'list' | 'board'>('list');
  const [presetName, setPresetName] = React.useState('');
  const [draggedStudent, setDraggedStudent] = React.useState<{ id: string; yearGroupId: string } | null>(null);
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
      if (pending === classId) { count++; continue; }
      if (!pending && s.current_homeroom_class_id === classId) { count++; }
    }
    return count;
  };

  const handleClassChange = (studentId: string, classId: string, currentClassId: string | null, group?: YearGroup) => {
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

      toast.success(
        `${t('savedSuccessfully')} (${assignedCount} ${t('changes').toLowerCase()})`,
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

    toast.success(t('autoBalanced', { count: unassigned.length, classes: group.homeroom_classes.length }));
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
${data.class_lists.filter((cl) => cl.students.length > 0).map((cl) => `
  <div class="page">
    <h1>${data.school_name}</h1>
    <div class="date">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    <h2>${cl.year_group_name} — ${cl.class_name}</h2>
    <div class="count">${cl.students.length} student${cl.students.length !== 1 ? 's' : ''}</div>
    <table>
      <thead><tr><th>#</th><th>Student No.</th><th>First Name</th><th>Last Name</th><th>Gender</th><th>DOB</th></tr></thead>
      <tbody>${cl.students.map((s, i) => `
        <tr><td>${i + 1}</td><td>${s.student_number ?? '—'}</td><td>${s.first_name}</td><td>${s.last_name}</td><td>${formatGender(s.gender)}</td><td>${formatDate(s.date_of_birth)}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>`).join('')}
</body></html>`;

      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = () => {
        printWindow.print();
      };
    } catch {
      toast.error(t('exportError'));
    }
  };

  // ─── Preset handlers ──────────────────────────────────────────────────────

  type ExportPreset = { name: string; columns: string[]; grouping: 'subclass' | 'year_level' };

  const getPresets = (): ExportPreset[] => {
    try {
      return JSON.parse(localStorage.getItem('class-export-presets') ?? '[]') as ExportPreset[];
    } catch {
      return [];
    }
  };

  const savePreset = () => {
    if (!presetName.trim()) return;
    const presets = getPresets();
    const newPreset: ExportPreset = {
      name: presetName.trim(),
      columns: Array.from(selectedColumns),
      grouping: exportGrouping,
    };
    const filtered = presets.filter((p) => p.name !== newPreset.name);
    localStorage.setItem('class-export-presets', JSON.stringify([...filtered, newPreset]));
    setPresetName('');
    toast.success(t('presetSaved'));
  };

  const loadPreset = (preset: ExportPreset) => {
    setSelectedColumns(new Set(preset.columns));
    setExportGrouping(preset.grouping);
  };

  const deletePreset = (name: string) => {
    const presets = getPresets().filter((p) => p.name !== name);
    localStorage.setItem('class-export-presets', JSON.stringify(presets));
    toast.success(t('presetDeleted'));
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

  const mergeByYearLevel = (classLists: ExportClassList[]): ExportClassList[] => {
    const grouped = new Map<string, ExportClassList>();
    for (const cl of classLists) {
      const key = cl.year_group_name;
      const existing = grouped.get(key);
      if (existing) {
        existing.students = [...existing.students, ...cl.students];
      } else {
        grouped.set(key, {
          class_id: cl.class_id,
          class_name: cl.year_group_name,
          year_group_name: cl.year_group_name,
          students: [...cl.students],
        });
      }
    }
    return Array.from(grouped.values());
  };

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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
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

      {/* ─── BOARD VIEW ────────────────────────────────────────────────── */}
      {viewMode === 'board' && (
        <div className="space-y-6">
          {yearGroups.map((group) => {
            if (group.homeroom_classes.length === 0) return null;
            const unassigned = group.students.filter((s) => {
              const pending = pendingChanges.get(s.id);
              if (pending === '__unassign__') return true;
              if (pending) return false;
              return !s.current_homeroom_class_id;
            });
            return (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-text-primary">{group.name}</h2>
                  {unassigned.length > 0 && group.homeroom_classes.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => handleAutoBalance(group)} className="text-xs">
                      <Shuffle className="me-1.5 h-3.5 w-3.5" />
                      {t('distributeEvenly')}
                    </Button>
                  )}
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {/* Unassigned column */}
                  <div
                    className="min-w-[200px] flex-1 rounded-xl border border-warning-border bg-warning-surface/30 p-3"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleDrop('__unassign__')}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-warning-text">{t('unassigned')}</span>
                      <Badge variant="warning">{unassigned.length}</Badge>
                    </div>
                    <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                      {unassigned.map((student) => (
                        <div
                          key={student.id}
                          draggable
                          onDragStart={() => handleDragStart(student.id, group.id)}
                          className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2 cursor-grab active:cursor-grabbing hover:bg-surface-secondary transition-colors"
                        >
                          <GripVertical className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-text-primary truncate">{student.first_name} {student.last_name}</p>
                            <p className="text-[10px] text-text-tertiary font-mono">{student.student_number}</p>
                          </div>
                        </div>
                      ))}
                      {unassigned.length === 0 && (
                        <p className="text-xs text-text-tertiary text-center py-4">{t('allAssigned')}</p>
                      )}
                    </div>
                  </div>

                  {/* Subclass columns */}
                  {group.homeroom_classes.map((cls) => {
                    const classStudents = group.students.filter((s) => {
                      const pending = pendingChanges.get(s.id);
                      if (pending === '__unassign__') return false;
                      if (pending) return pending === cls.id;
                      return s.current_homeroom_class_id === cls.id;
                    });
                    const count = classStudents.length;
                    const cap = cls.max_capacity;
                    const pct = cap ? Math.min(100, Math.round((count / cap) * 100)) : null;

                    return (
                      <div
                        key={cls.id}
                        className={`min-w-[200px] flex-1 rounded-xl border p-3 transition-colors ${
                          draggedStudent ? 'border-primary-300 bg-primary-50/20 dark:border-primary-700 dark:bg-primary-950/10' : 'border-border bg-surface'
                        }`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(cls.id)}
                      >
                        <div className="mb-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-text-primary">{cls.name}</span>
                            <Badge variant={pct !== null && pct >= 90 ? 'danger' : 'success'}>
                              {count}{cap ? `/${cap}` : ''}
                            </Badge>
                          </div>
                          {pct !== null && (
                            <div className="mt-1 h-1.5 w-full rounded-full bg-border overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-danger-500' : pct >= 70 ? 'bg-warning-500' : 'bg-success-500'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                          {classStudents.map((student) => (
                            <div
                              key={student.id}
                              draggable
                              onDragStart={() => handleDragStart(student.id, group.id)}
                              className={`flex items-center gap-2 rounded-lg border p-2 cursor-grab active:cursor-grabbing hover:bg-surface-secondary transition-colors ${
                                pendingChanges.has(student.id) ? 'border-primary-300 bg-primary-50/30 dark:bg-primary-950/10' : 'border-border bg-surface'
                              }`}
                            >
                              <GripVertical className="h-3.5 w-3.5 text-text-tertiary shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-text-primary truncate">{student.first_name} {student.last_name}</p>
                                <p className="text-[10px] text-text-tertiary font-mono">{student.student_number}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── LIST VIEW ─────────────────────────────────────────────────── */}
      {viewMode === 'list' && <div className="space-y-3">
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
                  {/* Capacity indicators */}
                  {group.homeroom_classes.length > 0 && (
                    <div className="flex flex-wrap gap-3 border-b border-primary-200/50 dark:border-primary-800/50 bg-primary-50/10 dark:bg-primary-950/5 px-4 py-2">
                      {group.homeroom_classes.map((cls) => {
                        const count = cls.enrolled_count + Array.from(pendingChanges.values()).filter((v) => v === cls.id).length;
                        const cap = cls.max_capacity;
                        const pct = cap ? Math.min(100, Math.round((count / cap) * 100)) : null;
                        return (
                          <div key={cls.id} className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-text-primary">{cls.name}</span>
                            <span className="text-text-tertiary">{count}{cap ? `/${cap}` : ''}</span>
                            {pct !== null && (
                              <div className="h-1.5 w-16 rounded-full bg-border overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-danger-500' : pct >= 70 ? 'bg-warning-500' : 'bg-success-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Select-all + auto-balance row */}
                  {visibleStudents.length > 0 && (
                    <div className="flex items-center justify-between border-b border-primary-200/50 dark:border-primary-800/50 bg-primary-50/20 dark:bg-primary-950/10 px-4 py-2">
                      <div className="flex items-center gap-3">
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
                      {group.homeroom_classes.length > 0 && group.students.some((s) => !s.current_homeroom_class_id && !pendingChanges.has(s.id)) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleAutoBalance(group); }}
                          className="text-xs"
                        >
                          <Shuffle className="me-1.5 h-3.5 w-3.5" />
                          {t('distributeEvenly')}
                        </Button>
                      )}
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
                                      group,
                                    )
                                  }
                                >
                                  <SelectTrigger className="h-9 text-sm">
                                    <SelectValue placeholder={t('selectClass')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {student.current_homeroom_class_id && (
                                      <SelectItem value="__unassign__">
                                        {t('unassignStudent')}
                                      </SelectItem>
                                    )}
                                    {group.homeroom_classes.map((cls) => (
                                      <SelectItem key={cls.id} value={cls.id}>
                                        {cls.name} ({cls.enrolled_count}{cls.max_capacity ? `/${cls.max_capacity}` : ''})
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
      </div>}

      {/* Bulk assign floating bar */}
      {selectedStudents.size > 0 && pendingChanges.size === 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm">
          <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary-500" />
              <p className="text-sm font-medium text-text-secondary">
                {t('selectedStudents', { count: selectedStudents.size })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Select value={bulkAssignClassId} onValueChange={setBulkAssignClassId}>
                <SelectTrigger className="h-9 w-full sm:w-48 text-sm">
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

      {/* Export column picker modal */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {exportFormat === 'xlsx' ? t('exportExcel') : t('exportPdf')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Grouping toggle */}
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-secondary p-3">
              <Label className="text-sm font-medium text-text-primary">{t('groupBy')}</Label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExportGrouping('subclass')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    exportGrouping === 'subclass'
                      ? 'bg-primary-500 text-white'
                      : 'bg-surface text-text-secondary hover:bg-surface-secondary'
                  }`}
                >
                  {t('groupBySubclass')}
                </button>
                <button
                  type="button"
                  onClick={() => setExportGrouping('year_level')}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    exportGrouping === 'year_level'
                      ? 'bg-primary-500 text-white'
                      : 'bg-surface text-text-secondary hover:bg-surface-secondary'
                  }`}
                >
                  {t('groupByYearLevel')}
                </button>
              </div>
            </div>

            {/* Column checkboxes */}
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('studentFields')}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ALL_EXPORT_COLUMNS.filter((c) => c.group === 'student').map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-surface-secondary transition-colors"
                    >
                      <Checkbox
                        checked={selectedColumns.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      />
                      <span className="text-sm text-text-primary">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('parentFields')}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ALL_EXPORT_COLUMNS.filter((c) => c.group === 'parent').map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 cursor-pointer hover:bg-surface-secondary transition-colors"
                    >
                      <Checkbox
                        checked={selectedColumns.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      />
                      <span className="text-sm text-text-primary">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview table */}
            {activeColumns.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-text-primary mb-2">{t('preview')}</h3>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-surface-secondary">
                        {activeColumns.map((col) => (
                          <th
                            key={col.key}
                            className="px-3 py-2 text-start font-semibold text-text-primary whitespace-nowrap"
                          >
                            {col.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        { student_number: 'STU-202603-001', first_name: 'Aisha', middle_name: 'May', last_name: 'Al-Farsi', national_id: '7841234', nationality: 'Emirati', city_of_birth: 'Dubai', gender: 'female', date_of_birth: '2018-03-15', medical_notes: null, has_allergy: false, allergy_details: null, parents: [{ first_name: 'Omar', last_name: 'Al-Farsi', email: 'omar@example.com', phone: '+971501234567' }, { first_name: 'Sara', last_name: 'Al-Farsi', email: 'sara@example.com', phone: '+971507654321' }] },
                        { student_number: 'STU-202603-002', first_name: 'Liam', middle_name: null, last_name: 'Murphy', national_id: '9087654', nationality: 'Irish', city_of_birth: 'Cork', gender: 'male', date_of_birth: '2017-09-22', medical_notes: 'Asthmatic', has_allergy: true, allergy_details: 'Peanuts', parents: [{ first_name: 'Sean', last_name: 'Murphy', email: 'sean@example.com', phone: '+353871234567' }] },
                      ].map((sample, rowIdx) => (
                        <tr key={rowIdx}>
                          {activeColumns.map((col) => (
                            <td
                              key={col.key}
                              className="px-3 py-2 text-text-secondary whitespace-nowrap"
                            >
                              {col.getValue(sample, rowIdx)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Presets */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-secondary p-3">
            <span className="text-xs font-medium text-text-primary">{t('presets')}:</span>
            {getPresets().map((p) => (
              <div key={p.name} className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => loadPreset(p)}>
                  {p.name}
                </Button>
                <button
                  type="button"
                  onClick={() => deletePreset(p.name)}
                  className="text-text-tertiary hover:text-danger-text text-xs px-1"
                >
                  x
                </button>
              </div>
            ))}
            <div className="flex items-center gap-1 ms-auto">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={t('presetNamePlaceholder')}
                className="h-7 w-32 rounded-md border border-border bg-surface px-2 text-xs text-text-primary placeholder:text-text-tertiary"
              />
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={savePreset} disabled={!presetName.trim()}>
                {t('savePreset')}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setExportModalOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={activeColumns.length === 0 || exporting}
              onClick={() => void handleExport()}
            >
              <Download className="me-2 h-4 w-4" />
              {exporting ? t('exporting') : t('exportNow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
