import { Injectable, Logger } from '@nestjs/common';

import type { ReportCardRenderPayload } from '@school/shared';

import type { ReportCardRenderer } from './report-card-render.contract';

// ─── Placeholder PDF renderer ────────────────────────────────────────────────
// Emits a minimal yet valid single-page PDF containing the student name, the
// placeholder disclaimer, and a crude dump of subjects + comments. Impl 11
// replaces this with the production React-PDF templates; the processor stays
// unchanged thanks to the `ReportCardRenderer` contract.
//
// The PDF is constructed by hand to avoid adding a heavyweight dependency for
// a temporary renderer. The byte layout follows the classic cross-reference
// table format (PDF 1.4) — sufficient for any compliant PDF reader.

@Injectable()
export class PlaceholderReportCardRenderer implements ReportCardRenderer {
  private readonly logger = new Logger(PlaceholderReportCardRenderer.name);

  async render(payload: ReportCardRenderPayload): Promise<Buffer> {
    const lines = this.buildTextLines(payload);
    const pdfBuffer = buildMinimalPdf(lines);
    this.logger.debug(
      `Rendered placeholder PDF for student ${payload.student.id} (${pdfBuffer.length} bytes, language=${payload.language})`,
    );
    return pdfBuffer;
  }

  private buildTextLines(payload: ReportCardRenderPayload): string[] {
    const fullName = payload.student.personal_info.full_name ?? payload.student.id;
    const period = payload.academic_period.name;
    const year = payload.academic_period.academic_year_name;

    const lines: string[] = [
      'PLACEHOLDER REPORT CARD',
      'VISUAL DESIGN PENDING (impl 11)',
      '',
      `Tenant: ${payload.tenant.name}`,
      `Student: ${fullName}`,
      `Period: ${period} (${year})`,
      `Language: ${payload.language.toUpperCase()}`,
      '',
      'Subjects:',
    ];

    for (const subject of payload.grades.subjects) {
      const score = subject.score === null ? '-' : subject.score.toString();
      const grade = subject.grade ?? '-';
      lines.push(`  ${subject.subject_name}: ${score} (${grade})`);
      if (subject.subject_comment) {
        lines.push(`    "${truncate(subject.subject_comment, 80)}"`);
      }
    }

    const overallAvg =
      payload.grades.overall.weighted_average === null
        ? '-'
        : payload.grades.overall.weighted_average.toFixed(1);
    lines.push('');
    lines.push(`Overall: ${overallAvg} (${payload.grades.overall.overall_grade ?? '-'})`);
    if (payload.grades.overall.overall_comment) {
      lines.push(`  "${truncate(payload.grades.overall.overall_comment, 80)}"`);
    }

    if (payload.student.rank_badge !== null) {
      lines.push('');
      lines.push(`Rank badge: Top ${payload.student.rank_badge}`);
    }

    return lines;
  }
}

// ─── Minimal PDF construction ────────────────────────────────────────────────
// Assembles a 1.4 PDF with one page, Helvetica 12pt, and the provided lines
// stacked vertically from the top. Keeps the full byte offsets explicit so
// the xref table is exact.

function buildMinimalPdf(lines: string[]): Buffer {
  const stream = buildContentStream(lines);
  const streamLength = Buffer.byteLength(stream, 'latin1');

  const header = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
  ];

  // Compute byte offsets from the start of the file for each object.
  const offsets: number[] = [];
  let cursor = Buffer.byteLength(header, 'latin1');
  for (const obj of objects) {
    offsets.push(cursor);
    cursor += Buffer.byteLength(obj, 'latin1');
  }

  const xrefStart = cursor;
  const xrefLines = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.map((o) => `${o.toString().padStart(10, '0')} 00000 n \n`),
  ];

  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const fullBody = header + objects.join('') + xrefLines.join('') + trailer;
  return Buffer.from(fullBody, 'latin1');
}

function buildContentStream(lines: string[]): string {
  // 12pt Helvetica, first baseline at y=800, 16pt leading.
  const parts: string[] = ['BT', '/F1 12 Tf', '16 TL', '50 800 Td'];
  for (let i = 0; i < lines.length; i += 1) {
    const escaped = escapePdfString(lines[i] ?? '');
    if (i === 0) {
      parts.push(`(${escaped}) Tj`);
    } else {
      parts.push(`T*`);
      parts.push(`(${escaped}) Tj`);
    }
  }
  parts.push('ET');
  return parts.join('\n');
}

function escapePdfString(text: string): string {
  // PDF literal strings need backslash-escaping for ( ) and \. We also strip
  // anything outside the printable ASCII range — the placeholder doesn't need
  // multi-byte glyphs and raw control bytes would corrupt the content stream.
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    const code = text.charCodeAt(i);
    if (ch === '\\' || ch === '(' || ch === ')') {
      out += `\\${ch}`;
    } else if (code >= 0x20 && code <= 0x7e) {
      out += ch;
    } else {
      out += '?';
    }
  }
  return out;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
