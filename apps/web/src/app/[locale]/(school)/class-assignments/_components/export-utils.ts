import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HomeroomClass {
  id: string;
  name: string;
  enrolled_count: number;
  max_capacity: number | null;
}

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string;
  current_homeroom_class_id: string | null;
  current_homeroom_class_name: string | null;
}

export interface YearGroup {
  id: string;
  name: string;
  display_order: number;
  homeroom_classes: HomeroomClass[];
  students: Student[];
}

export interface ClassAssignmentsResponse {
  data: {
    year_groups: YearGroup[];
    unassigned_count: number;
  };
}

export interface BulkAssignResponse {
  data: {
    assigned: number;
    skipped: number;
    errors: string[];
  };
}

export interface ExportParent {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
}

export interface ExportStudent {
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

export interface ExportClassList {
  class_id: string;
  class_name: string;
  year_group_name: string;
  students: ExportStudent[];
}

export interface ExportDataResponse {
  data: {
    academic_year: string;
    school_name: string;
    logo_url: string | null;
    class_lists: ExportClassList[];
  };
}

export interface ExportColumn {
  key: string;
  label: string;
  group: 'student' | 'parent';
  getValue: (s: ExportStudent, i: number) => string;
  width: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatGender(gender: string | null): string {
  if (!gender) return '—';
  return gender.charAt(0).toUpperCase() + gender.slice(1).replace(/_/g, ' ');
}

export async function loadImageAsDataUrl(url: string): Promise<string | null> {
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

export function generateExcel(data: ExportDataResponse['data'], columns: ExportColumn[]): void {
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

export async function generatePdf(data: ExportDataResponse['data'], columns: ExportColumn[]): Promise<void> {
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

// ─── Column definitions ────────────────────────────────────────────────────────

export const ALL_EXPORT_COLUMNS: ExportColumn[] = [
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

export const DEFAULT_SELECTED_COLUMNS = new Set([
  'row_number', 'student_number', 'first_name', 'last_name', 'gender', 'date_of_birth',
]);

export type ExportPreset = { name: string; columns: string[]; grouping: 'subclass' | 'year_level' };

export function getPresets(): ExportPreset[] {
  try {
    return JSON.parse(localStorage.getItem('class-export-presets') ?? '[]') as ExportPreset[];
  } catch {
    return [];
  }
}

export function savePresetToStorage(preset: ExportPreset): void {
  const presets = getPresets();
  const filtered = presets.filter((p) => p.name !== preset.name);
  localStorage.setItem('class-export-presets', JSON.stringify([...filtered, preset]));
}

export function deletePresetFromStorage(name: string): void {
  const presets = getPresets().filter((p) => p.name !== name);
  localStorage.setItem('class-export-presets', JSON.stringify(presets));
}

export function mergeByYearLevel(classLists: ExportClassList[]): ExportClassList[] {
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
}
