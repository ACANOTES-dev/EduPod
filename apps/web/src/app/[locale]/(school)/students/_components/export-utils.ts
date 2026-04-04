import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  status: string;
  entry_date: string | null;
  medical_notes: string | null;
  has_allergy: boolean;
  allergy_details: string | null;
  year_group: { id: string; name: string } | null;
  household: { id: string; household_name: string } | null;
  homeroom_class: { id: string; name: string } | null;
  student_parents: {
    relationship_label: string | null;
    parent: ExportParent;
  }[];
}

export interface ExportColumn {
  key: string;
  label: string;
  group: 'student' | 'enrolment' | 'parent' | 'medical';
  getValue: (s: ExportStudent, i: number) => string;
  width: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function formatDateForExport(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatGender(gender: string | null): string {
  if (!gender) return '—';
  return gender.charAt(0).toUpperCase() + gender.slice(1).replace(/_/g, ' ');
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

// ─── Column definitions ────────────────────────────────────────────────────────

export const ALL_EXPORT_COLUMNS: ExportColumn[] = [
  // Student fields
  { key: 'row_number', label: '#', group: 'student', getValue: (_s, i) => String(i + 1), width: 5 },
  {
    key: 'student_number',
    label: 'Student Number',
    group: 'student',
    getValue: (s) => s.student_number ?? '—',
    width: 18,
  },
  {
    key: 'first_name',
    label: 'First Name',
    group: 'student',
    getValue: (s) => s.first_name,
    width: 16,
  },
  {
    key: 'middle_name',
    label: 'Middle Name',
    group: 'student',
    getValue: (s) => s.middle_name ?? '—',
    width: 14,
  },
  {
    key: 'last_name',
    label: 'Last Name',
    group: 'student',
    getValue: (s) => s.last_name,
    width: 16,
  },
  {
    key: 'gender',
    label: 'Gender',
    group: 'student',
    getValue: (s) => formatGender(s.gender),
    width: 10,
  },
  {
    key: 'date_of_birth',
    label: 'Date of Birth',
    group: 'student',
    getValue: (s) => formatDateForExport(s.date_of_birth),
    width: 14,
  },
  {
    key: 'nationality',
    label: 'Nationality',
    group: 'student',
    getValue: (s) => s.nationality ?? '—',
    width: 14,
  },
  {
    key: 'city_of_birth',
    label: 'City of Birth',
    group: 'student',
    getValue: (s) => s.city_of_birth ?? '—',
    width: 14,
  },
  {
    key: 'national_id',
    label: 'National ID',
    group: 'student',
    getValue: (s) => s.national_id ?? '—',
    width: 16,
  },
  // Enrolment fields
  {
    key: 'status',
    label: 'Status',
    group: 'enrolment',
    getValue: (s) => formatStatus(s.status),
    width: 12,
  },
  {
    key: 'entry_date',
    label: 'Entry Date',
    group: 'enrolment',
    getValue: (s) => formatDateForExport(s.entry_date),
    width: 14,
  },
  {
    key: 'year_group',
    label: 'Year Group',
    group: 'enrolment',
    getValue: (s) => s.year_group?.name ?? '—',
    width: 14,
  },
  {
    key: 'homeroom_class',
    label: 'Homeroom Class',
    group: 'enrolment',
    getValue: (s) => s.homeroom_class?.name ?? '—',
    width: 16,
  },
  {
    key: 'household',
    label: 'Household',
    group: 'enrolment',
    getValue: (s) => s.household?.household_name ?? '—',
    width: 18,
  },
  // Parent fields
  {
    key: 'parent1_name',
    label: 'Parent 1 Name',
    group: 'parent',
    getValue: (s) => {
      const p = s.student_parents[0];
      return p ? `${p.parent.first_name} ${p.parent.last_name}` : '—';
    },
    width: 18,
  },
  {
    key: 'parent1_relation',
    label: 'Parent 1 Relation',
    group: 'parent',
    getValue: (s) => s.student_parents[0]?.relationship_label ?? '—',
    width: 14,
  },
  {
    key: 'parent1_email',
    label: 'Parent 1 Email',
    group: 'parent',
    getValue: (s) => s.student_parents[0]?.parent.email ?? '—',
    width: 22,
  },
  {
    key: 'parent1_phone',
    label: 'Parent 1 Phone',
    group: 'parent',
    getValue: (s) => s.student_parents[0]?.parent.phone ?? '—',
    width: 16,
  },
  {
    key: 'parent2_name',
    label: 'Parent 2 Name',
    group: 'parent',
    getValue: (s) => {
      const p = s.student_parents[1];
      return p ? `${p.parent.first_name} ${p.parent.last_name}` : '—';
    },
    width: 18,
  },
  {
    key: 'parent2_relation',
    label: 'Parent 2 Relation',
    group: 'parent',
    getValue: (s) => s.student_parents[1]?.relationship_label ?? '—',
    width: 14,
  },
  {
    key: 'parent2_email',
    label: 'Parent 2 Email',
    group: 'parent',
    getValue: (s) => s.student_parents[1]?.parent.email ?? '—',
    width: 22,
  },
  {
    key: 'parent2_phone',
    label: 'Parent 2 Phone',
    group: 'parent',
    getValue: (s) => s.student_parents[1]?.parent.phone ?? '—',
    width: 16,
  },
  // Medical fields
  {
    key: 'medical_notes',
    label: 'Medical Notes',
    group: 'medical',
    getValue: (s) => s.medical_notes ?? '—',
    width: 20,
  },
  {
    key: 'allergy_details',
    label: 'Allergy Details',
    group: 'medical',
    getValue: (s) => (s.has_allergy ? (s.allergy_details ?? '—') : 'None'),
    width: 20,
  },
];

export const DEFAULT_SELECTED_COLUMNS = new Set([
  'row_number',
  'student_number',
  'first_name',
  'last_name',
  'gender',
  'date_of_birth',
  'year_group',
  'status',
]);

// ─── Presets ──────────────────────────────────────────────────────────────────

export type ExportPreset = { name: string; columns: string[] };

const PRESET_STORAGE_KEY = 'student-export-presets';

export function getPresets(): ExportPreset[] {
  try {
    return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? '[]') as ExportPreset[];
  } catch (err) {
    console.error('[ExportUtils]', err);
    return [];
  }
}

export function savePresetToStorage(preset: ExportPreset): void {
  const presets = getPresets();
  const filtered = presets.filter((p) => p.name !== preset.name);
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify([...filtered, preset]));
}

export function deletePresetFromStorage(name: string): void {
  const presets = getPresets().filter((p) => p.name !== name);
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

// ─── Excel export ─────────────────────────────────────────────────────────────

export function generateExcel(
  students: ExportStudent[],
  columns: ExportColumn[],
  title: string,
): void {
  const wb = XLSX.utils.book_new();

  const headers = columns.map((c) => c.label);
  const rows = students.map((s, i) => columns.map((c) => c.getValue(s, i)));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = columns.map((c) => ({ wch: c.width }));

  XLSX.utils.book_append_sheet(wb, ws, 'Students');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buf], { type: 'application/octet-stream' }),
    `${title.replace(/\s+/g, '_')}.xlsx`,
  );
}

// ─── PDF export ───────────────────────────────────────────────────────────────

export function generatePdf(
  students: ExportStudent[],
  columns: ExportColumn[],
  title: string,
): void {
  const doc = new jsPDF({
    orientation: columns.length > 8 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });
  const margin = 15;
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, margin + 5);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${today}  •  ${students.length} student${students.length !== 1 ? 's' : ''}`,
    margin,
    margin + 11,
  );

  autoTable(doc, {
    startY: margin + 18,
    margin: { left: margin, right: margin },
    head: [columns.map((c) => c.label)],
    body: students.map((s, i) => columns.map((c) => c.getValue(s, i))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}
