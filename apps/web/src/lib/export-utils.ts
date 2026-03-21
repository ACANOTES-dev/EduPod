import { saveAs } from 'file-saver';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface ExportColumn {
  header: string;
  key: string;
}

interface ExportOptions {
  fileName: string;
  title: string;
  columns: ExportColumn[];
  rows: Record<string, string | number | null | undefined>[];
}

export function exportToExcel({ fileName, columns, rows }: ExportOptions): void {
  const headers = columns.map((c) => c.header);
  const data = rows.map((row) => columns.map((c) => row[c.key] ?? ''));
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);

  // Auto-size columns
  ws['!cols'] = columns.map((_, i) => ({
    wch: Math.max(
      headers[i]?.length ?? 10,
      ...data.map((r) => String(r[i] ?? '').length),
    ),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buf], { type: 'application/octet-stream' }), `${fileName}.xlsx`);
}

export function exportToPdf({ fileName, title, columns, rows }: ExportOptions): void {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.text(title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Exported: ${new Date().toLocaleDateString()}`, 14, 28);

  autoTable(doc, {
    startY: 34,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? '—'))),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  doc.save(`${fileName}.pdf`);
}
