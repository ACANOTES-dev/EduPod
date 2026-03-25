import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExportStaffProfile {
  staff_number: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  department: string | null;
  employment_status: string;
  employment_type: string;
  roles: string[];
}

export interface ExportColumn {
  key: string;
  label: string;
  group: 'personal' | 'employment';
  getValue: (s: ExportStaffProfile, i: number) => string;
  width: number;
}

// ─── Column definitions ────────────────────────────────────────────────────────

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatEmploymentType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const ALL_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'row_number', label: '#', group: 'personal', getValue: (_s, i) => String(i + 1), width: 5 },
  { key: 'staff_number', label: 'Staff Number', group: 'personal', getValue: (s) => s.staff_number ?? '—', width: 16 },
  { key: 'first_name', label: 'First Name', group: 'personal', getValue: (s) => s.first_name, width: 16 },
  { key: 'last_name', label: 'Last Name', group: 'personal', getValue: (s) => s.last_name, width: 16 },
  { key: 'email', label: 'Email', group: 'personal', getValue: (s) => s.email, width: 24 },
  { key: 'phone', label: 'Phone', group: 'personal', getValue: (s) => s.phone ?? '—', width: 16 },
  { key: 'job_title', label: 'Job Title', group: 'employment', getValue: (s) => s.job_title ?? '—', width: 18 },
  { key: 'department', label: 'Department', group: 'employment', getValue: (s) => s.department ?? '—', width: 16 },
  { key: 'employment_status', label: 'Status', group: 'employment', getValue: (s) => formatStatus(s.employment_status), width: 12 },
  { key: 'employment_type', label: 'Type', group: 'employment', getValue: (s) => formatEmploymentType(s.employment_type), width: 14 },
  { key: 'roles', label: 'Role', group: 'employment', getValue: (s) => s.roles.length > 0 ? s.roles.join(', ') : '—', width: 18 },
];

export const DEFAULT_SELECTED_COLUMNS = new Set([
  'row_number', 'staff_number', 'first_name', 'last_name', 'email', 'job_title', 'roles',
]);

// ─── Presets ──────────────────────────────────────────────────────────────────

export type ExportPreset = { name: string; columns: string[] };

const STORAGE_KEY = 'staff-export-presets';

export function getPresets(): ExportPreset[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ExportPreset[];
  } catch {
    return [];
  }
}

export function savePresetToStorage(preset: ExportPreset): void {
  const presets = getPresets();
  const filtered = presets.filter((p) => p.name !== preset.name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...filtered, preset]));
}

export function deletePresetFromStorage(name: string): void {
  const presets = getPresets().filter((p) => p.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

// ─── Export generators ────────────────────────────────────────────────────────

export function generateExcel(
  staffList: ExportStaffProfile[],
  columns: ExportColumn[],
  schoolName: string,
): void {
  const wb = XLSX.utils.book_new();

  const headers = columns.map((c) => c.label);
  const rows = staffList.map((s, i) => columns.map((c) => c.getValue(s, i)));

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws['!cols'] = columns.map((c) => ({ wch: c.width }));

  XLSX.utils.book_append_sheet(wb, ws, 'Staff');

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(
    new Blob([buf], { type: 'application/octet-stream' }),
    `Staff_List_${schoolName.replace(/\s+/g, '_')}.xlsx`,
  );
}

export function generatePdf(
  staffList: ExportStaffProfile[],
  columns: ExportColumn[],
  schoolName: string,
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = 15;
  const today = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  // Header
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(schoolName, margin, margin + 5);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(today, margin, margin + 11);

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Staff List', margin, margin + 20);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${staffList.length} staff member${staffList.length !== 1 ? 's' : ''}`,
    margin,
    margin + 26,
  );

  autoTable(doc, {
    startY: margin + 30,
    margin: { left: margin, right: margin },
    head: [columns.map((c) => c.label)],
    body: staffList.map((s, i) => columns.map((c) => c.getValue(s, i))),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`Staff_List_${schoolName.replace(/\s+/g, '_')}.pdf`);
}
