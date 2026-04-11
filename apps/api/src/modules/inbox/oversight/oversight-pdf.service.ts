import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';

/**
 * OversightPdfService — minimal text-oriented PDF export for
 * oversight thread dumps and flag escalations.
 *
 * Uses `pdf-lib` (already a first-class dep in apps/api) with the
 * Helvetica standard font so there are no font asset bundles or Latin-1
 * encoding pitfalls to worry about. The output is intentionally plain:
 * a header, participant list, and chronological message list. Non-ASCII
 * characters (Arabic, emoji) are mapped to `?` because Helvetica cannot
 * encode them — see `sanitise()`. For non-Latin transcripts a richer
 * export (custom TTF or Playwright) is a follow-up; the safeguarding use
 * case works with plain ASCII because reviewers search for matched
 * keywords which are already ASCII.
 */

export interface OversightPdfMessage {
  createdAt: Date;
  senderDisplayName: string;
  body: string;
  deletedAt: Date | null;
  edits: Array<{ editedAt: Date; previousBody: string }>;
}

export interface OversightPdfInput {
  schoolName: string;
  conversationId: string;
  subject: string | null;
  kind: string;
  createdAt: Date;
  frozen: boolean;
  frozenReason: string | null;
  participants: Array<{ displayName: string; role: string }>;
  messages: OversightPdfMessage[];
}

const PAGE_WIDTH = 595; // A4 width in points
const PAGE_HEIGHT = 842; // A4 height
const MARGIN_X = 48;
const MARGIN_TOP = 48;
const MARGIN_BOTTOM = 56;
const LINE_GAP = 4;
const BODY_SIZE = 10;
const HEADER_SIZE = 16;
const SUBHEADER_SIZE = 12;

@Injectable()
export class OversightPdfService {
  async generateThreadExport(input: OversightPdfInput): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    const ctx: RenderContext = {
      pdfDoc,
      font,
      bold,
      italic,
      page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
      cursorY: PAGE_HEIGHT - MARGIN_TOP,
    };

    this.drawHeader(ctx, input);
    this.drawMetadata(ctx, input);
    this.drawParticipants(ctx, input);
    this.drawMessages(ctx, input);

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }

  private drawHeader(ctx: RenderContext, input: OversightPdfInput): void {
    this.drawLine(ctx, sanitise(input.schoolName), ctx.bold, HEADER_SIZE);
    this.drawLine(
      ctx,
      sanitise(`Conversation ${input.subject ?? '(no subject)'}`),
      ctx.bold,
      SUBHEADER_SIZE,
    );
    ctx.cursorY -= LINE_GAP;
  }

  private drawMetadata(ctx: RenderContext, input: OversightPdfInput): void {
    const lines = [
      `Conversation ID : ${input.conversationId}`,
      `Kind            : ${input.kind}`,
      `Created         : ${input.createdAt.toISOString()}`,
      `Frozen          : ${input.frozen ? 'yes' : 'no'}`,
    ];
    if (input.frozen && input.frozenReason) {
      lines.push(`Freeze reason   : ${input.frozenReason}`);
    }
    for (const line of lines) {
      this.drawLine(ctx, sanitise(line), ctx.font, BODY_SIZE);
    }
    ctx.cursorY -= LINE_GAP;
  }

  private drawParticipants(ctx: RenderContext, input: OversightPdfInput): void {
    this.drawLine(ctx, 'Participants', ctx.bold, SUBHEADER_SIZE);
    if (input.participants.length === 0) {
      this.drawLine(ctx, '  (none)', ctx.italic, BODY_SIZE);
    }
    for (const p of input.participants) {
      this.drawLine(ctx, sanitise(`  - ${p.displayName} [${p.role}]`), ctx.font, BODY_SIZE);
    }
    ctx.cursorY -= LINE_GAP;
  }

  private drawMessages(ctx: RenderContext, input: OversightPdfInput): void {
    this.drawLine(ctx, 'Messages', ctx.bold, SUBHEADER_SIZE);
    if (input.messages.length === 0) {
      this.drawLine(ctx, '  (no messages)', ctx.italic, BODY_SIZE);
      return;
    }
    for (const msg of input.messages) {
      const stamp = msg.createdAt.toISOString();
      const header = `[${stamp}] ${msg.senderDisplayName}${msg.deletedAt ? ' (deleted)' : ''}`;
      this.drawLine(ctx, sanitise(header), ctx.bold, BODY_SIZE);
      const bodyFont = msg.deletedAt ? ctx.italic : ctx.font;
      const bodyLines = wrapText(
        sanitise(msg.body),
        bodyFont,
        BODY_SIZE,
        PAGE_WIDTH - MARGIN_X * 2,
      );
      for (const line of bodyLines) {
        this.drawLine(ctx, line, bodyFont, BODY_SIZE);
      }
      if (msg.edits.length > 0) {
        this.drawLine(ctx, '  Edit history:', ctx.italic, BODY_SIZE);
        for (const edit of msg.edits) {
          const editLine = `    [${edit.editedAt.toISOString()}] ${edit.previousBody}`;
          const wrapped = wrapText(
            sanitise(editLine),
            ctx.italic,
            BODY_SIZE,
            PAGE_WIDTH - MARGIN_X * 2,
          );
          for (const line of wrapped) {
            this.drawLine(ctx, line, ctx.italic, BODY_SIZE);
          }
        }
      }
      ctx.cursorY -= LINE_GAP;
    }
  }

  private drawLine(ctx: RenderContext, text: string, font: PDFFont, size: number): void {
    if (ctx.cursorY - size < MARGIN_BOTTOM) {
      ctx.page = ctx.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      ctx.cursorY = PAGE_HEIGHT - MARGIN_TOP;
    }
    ctx.page.drawText(text, {
      x: MARGIN_X,
      y: ctx.cursorY - size,
      size,
      font,
      color: rgb(0, 0, 0),
    });
    ctx.cursorY -= size + LINE_GAP;
  }
}

interface RenderContext {
  pdfDoc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  page: PDFPage;
  cursorY: number;
}

// Helvetica can only encode the WinAnsi (Latin-1) subset. Anything outside
// that range — Arabic, CJK, emoji — is replaced with '?' so the PDF saves
// instead of throwing. Latin text (English names, matched ASCII keywords,
// role labels) is preserved as-is.
function sanitise(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= 0x20 && code <= 0xff ? ch : '?';
  }
  return out;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      const width = font.widthOfTextAtSize(candidate, size);
      if (width <= maxWidth) {
        current = candidate;
      } else {
        if (current.length > 0) lines.push(current);
        // Word longer than maxWidth: hard-break.
        if (font.widthOfTextAtSize(word, size) > maxWidth) {
          let chunk = '';
          for (const ch of word) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      }
    }
    if (current.length > 0) lines.push(current);
  }
  return lines;
}
