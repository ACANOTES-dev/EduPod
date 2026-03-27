import { createHash, randomUUID } from 'crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralEventService } from './pastoral-event.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ImportValidationResult {
  validation_token: string;
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  skipped_rows: number;
  errors: Array<{ row: number; field: string; message: string }>;
  warnings: Array<{ row: number; message: string }>;
  preview: Array<{
    row: number;
    student_name: string;
    date: string;
    category: string;
    severity: string;
    narrative_preview: string;
  }>;
}

export interface ImportConfirmResult {
  total_imported: number;
  skipped_duplicates: number;
  audit_events_created: number;
}

interface ParsedRow {
  row_number: number;
  date: string;
  student_identifier: string;
  category: string;
  severity: string;
  narrative: string;
  actions_taken: string;
  follow_up_notes: string;
}

export interface ValidatedRow extends ParsedRow {
  student_id: string;
  student_name: string;
  tier: number;
  import_hash: string;
  is_duplicate: boolean;
}

interface CachedValidation {
  rows: ValidatedRow[];
  expiresAt: number;
}

interface ConcernCategory {
  key: string;
  label: string;
  auto_tier?: number;
  active: boolean;
}

/**
 * Helper to build a typed concern create payload that includes `import_hash`.
 * The `import_hash` column is added by a pending migration; once the migration
 * runs and `prisma generate` is re-run, this helper can be replaced with a
 * direct Prisma create call. Until then the extra field is passed via spread.
 */
type ConcernImportCreateData = {
  tenant_id: string;
  student_id: string;
  logged_by_user_id: string;
  category: string;
  severity: 'routine' | 'elevated' | 'urgent' | 'critical';
  tier: number;
  occurred_at: Date;
  actions_taken: string | null;
  follow_up_suggestion: string | null;
  imported: boolean;
  import_hash: string;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPECTED_HEADERS = [
  'date',
  'student_identifier',
  'category',
  'severity',
  'narrative',
  'actions_taken',
  'follow_up_notes',
] as const;

const VALID_SEVERITIES = new Set(['routine', 'elevated', 'urgent', 'critical']);
const TTL_MS = 30 * 60 * 1000; // 30 minutes

/** Matches "FirstName LastName (YYYY-MM-DD)" format */
const NAME_DOB_RE = /^(.+?)\s+(\S+)\s+\((\d{4}-\d{2}-\d{2})\)$/;

const TEMPLATE_CSV =
  'date,student_identifier,category,severity,narrative,actions_taken,follow_up_notes\n' +
  '2025-09-15,MDAD-S-00001,academic,routine,"Student appears withdrawn in class, not engaging with group work",Spoke with student after class,Referred to year head for monitoring\n';

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class PastoralImportService {
  private readonly logger = new Logger(PastoralImportService.name);
  private readonly validationCache = new Map<string, CachedValidation>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  // ─── VALIDATE ──────────────────────────────────────────────────────────────

  async validate(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
  ): Promise<ImportValidationResult> {
    const parsedRows = this.parseCsv(fileBuffer);

    const errors: Array<{ row: number; field: string; message: string }> = [];
    const warnings: Array<{ row: number; message: string }> = [];
    const validRows: ValidatedRow[] = [];

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Load tenant categories once
      const categories = await this.loadCategories(tenantId, db);

      for (const row of parsedRows) {
        const rowErrors: Array<{ field: string; message: string }> = [];

        // ── Required fields ────────────────────────────────────────
        if (!row.date.trim()) {
          rowErrors.push({ field: 'date', message: 'Date is required' });
        }
        if (!row.student_identifier.trim()) {
          rowErrors.push({ field: 'student_identifier', message: 'Student identifier is required' });
        }
        if (!row.category.trim()) {
          rowErrors.push({ field: 'category', message: 'Category is required' });
        }
        if (!row.severity.trim()) {
          rowErrors.push({ field: 'severity', message: 'Severity is required' });
        }
        if (!row.narrative.trim()) {
          rowErrors.push({ field: 'narrative', message: 'Narrative is required' });
        }

        // If required fields are missing, record errors and skip further validation
        if (rowErrors.length > 0) {
          for (const e of rowErrors) {
            errors.push({ row: row.row_number, field: e.field, message: e.message });
          }
          continue;
        }

        // ── Date validation ────────────────────────────────────────
        const parsedDate = new Date(row.date.trim());
        if (isNaN(parsedDate.getTime())) {
          errors.push({ row: row.row_number, field: 'date', message: 'Invalid date format' });
          continue;
        }
        if (parsedDate > new Date()) {
          errors.push({ row: row.row_number, field: 'date', message: 'Date cannot be in the future' });
          continue;
        }

        // ── Category validation ────────────────────────────────────
        const categoryKey = row.category.trim().toLowerCase();
        if (categoryKey === 'child_protection') {
          errors.push({
            row: row.row_number,
            field: 'category',
            message: 'Child protection records cannot be imported in bulk. Enter these manually via the DLP interface.',
          });
          continue;
        }

        const matchedCategory = categories.find((c) => c.key === categoryKey && c.active);
        if (!matchedCategory) {
          errors.push({
            row: row.row_number,
            field: 'category',
            message: `Unrecognised or inactive category: ${categoryKey}`,
          });
          continue;
        }

        // ── Severity validation ────────────────────────────────────
        const severityVal = row.severity.trim().toLowerCase();
        if (!VALID_SEVERITIES.has(severityVal)) {
          errors.push({
            row: row.row_number,
            field: 'severity',
            message: `Invalid severity: ${severityVal}. Must be one of: routine, elevated, urgent, critical`,
          });
          continue;
        }

        // ── Narrative length ───────────────────────────────────────
        if (row.narrative.trim().length < 10) {
          errors.push({
            row: row.row_number,
            field: 'narrative',
            message: 'Narrative must be at least 10 characters',
          });
          continue;
        }

        // ── Student resolution ─────────────────────────────────────
        const student = await this.resolveStudent(tenantId, row.student_identifier.trim(), db);
        if (!student) {
          errors.push({
            row: row.row_number,
            field: 'student_identifier',
            message: `Student not found: ${row.student_identifier.trim()}`,
          });
          continue;
        }

        // ── Severity warnings ──────────────────────────────────────
        if (severityVal === 'urgent' || severityVal === 'critical') {
          warnings.push({
            row: row.row_number,
            message: `Row has ${severityVal} severity — please verify this is correct for a historical import`,
          });
        }

        // ── Duplicate hash check ───────────────────────────────────
        const importHash = this.computeHash(student.id, row.date.trim(), row.narrative.trim());
        const isDuplicate = await this.checkDuplicateHash(tenantId, importHash, db);

        if (isDuplicate) {
          warnings.push({
            row: row.row_number,
            message: 'Duplicate record — this row has already been imported and will be skipped',
          });
        }

        // ── Build validated row ────────────────────────────────────
        const tier = this.determineTier(categoryKey, severityVal);

        validRows.push({
          ...row,
          category: categoryKey,
          severity: severityVal,
          student_id: student.id,
          student_name: `${student.first_name} ${student.last_name}`,
          tier,
          import_hash: importHash,
          is_duplicate: isDuplicate,
        });
      }
    });

    // Store validated rows in cache with TTL
    const validationToken = randomUUID();
    const expiresAt = Date.now() + TTL_MS;
    this.validationCache.set(validationToken, { rows: validRows, expiresAt });

    // Schedule cleanup
    setTimeout(() => {
      this.validationCache.delete(validationToken);
    }, TTL_MS);

    const nonDuplicateValidRows = validRows.filter((r) => !r.is_duplicate);
    const skippedRows = validRows.filter((r) => r.is_duplicate).length;

    // Build preview from non-duplicate valid rows
    const preview = nonDuplicateValidRows.map((r) => ({
      row: r.row_number,
      student_name: r.student_name,
      date: r.date,
      category: r.category,
      severity: r.severity,
      narrative_preview: r.narrative.length > 80
        ? r.narrative.substring(0, 80) + '...'
        : r.narrative,
    }));

    // Count error rows (unique row numbers with errors)
    const errorRowNumbers = new Set(errors.map((e) => e.row));

    return {
      validation_token: validationToken,
      total_rows: parsedRows.length,
      valid_rows: nonDuplicateValidRows.length,
      error_rows: errorRowNumbers.size,
      skipped_rows: skippedRows,
      errors,
      warnings,
      preview,
    };
  }

  // ─── CONFIRM ───────────────────────────────────────────────────────────────

  async confirm(
    tenantId: string,
    userId: string,
    validationToken: string,
  ): Promise<ImportConfirmResult> {
    const cached = this.validationCache.get(validationToken);

    if (!cached || Date.now() > cached.expiresAt) {
      this.validationCache.delete(validationToken);
      throw new BadRequestException({
        code: 'VALIDATION_EXPIRED',
        message: 'Validation token has expired or is invalid. Please re-upload and validate the CSV.',
      });
    }

    const rows = cached.rows;
    let totalImported = 0;
    let skippedDuplicates = 0;
    let auditEventsCreated = 0;

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      for (const row of rows) {
        // Skip rows that were already duplicates at validation time
        if (row.is_duplicate) {
          skippedDuplicates++;
          continue;
        }

        // Double-check hash again for idempotency (in case of concurrent imports)
        const stillDuplicate = await this.checkDuplicateHash(tenantId, row.import_hash, db);
        if (stillDuplicate) {
          skippedDuplicates++;
          continue;
        }

        const concern = await this.createImportedConcern(db, {
          tenant_id: tenantId,
          student_id: row.student_id,
          logged_by_user_id: userId,
          category: row.category,
          severity: row.severity as 'routine' | 'elevated' | 'urgent' | 'critical',
          tier: row.tier,
          occurred_at: new Date(row.date),
          actions_taken: row.actions_taken || null,
          follow_up_suggestion: row.follow_up_notes || null,
          imported: true,
          import_hash: row.import_hash,
        });

        // Fire audit event
        await this.eventService.write({
          tenant_id: tenantId,
          event_type: 'concern_created',
          entity_type: 'concern',
          entity_id: concern.id,
          student_id: row.student_id,
          actor_user_id: userId,
          tier: row.tier,
          payload: {
            concern_id: concern.id,
            student_id: row.student_id,
            category: row.category,
            severity: row.severity,
            tier: row.tier,
            narrative_version: 1,
            narrative_snapshot: row.narrative.substring(0, 200),
            source: 'historical_import',
          },
          ip_address: null,
        });

        totalImported++;
        auditEventsCreated++;
      }
    });

    // Clean up the validation cache
    this.validationCache.delete(validationToken);

    return {
      total_imported: totalImported,
      skipped_duplicates: skippedDuplicates,
      audit_events_created: auditEventsCreated,
    };
  }

  // ─── GENERATE TEMPLATE ─────────────────────────────────────────────────────

  generateTemplate(): Buffer {
    return Buffer.from(TEMPLATE_CSV, 'utf-8');
  }

  // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────

  /**
   * Parse CSV buffer into an array of ParsedRow objects.
   * Handles UTF-8 BOM and \r\n / \n line endings.
   */
  private parseCsv(buffer: Buffer): ParsedRow[] {
    let content = buffer.toString('utf-8');

    // Strip UTF-8 BOM if present
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.substring(1);
    }

    const lines = content.split(/\r?\n/);
    const rows: ParsedRow[] = [];
    let headerFound = false;
    let headerMap = new Map<string, number>();

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;

      if (!headerFound) {
        const headers = this.parseCsvLine(trimmed).map((h) => h.trim().toLowerCase());
        const requiredHeaders = ['date', 'student_identifier', 'category', 'severity', 'narrative'];
        const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

        if (missingHeaders.length > 0) {
          throw new BadRequestException({
            code: 'INVALID_HEADERS',
            message: `Missing required columns: ${missingHeaders.join(', ')}`,
          });
        }

        headerMap = new Map<string, number>();
        for (const h of EXPECTED_HEADERS) {
          const idx = headers.indexOf(h);
          if (idx >= 0) {
            headerMap.set(h, idx);
          }
        }
        headerFound = true;
        continue;
      }

      const values = this.parseCsvLine(trimmed);
      rows.push({
        row_number: rows.length + 2, // +2 because row 1 is the header
        date: values[headerMap.get('date') ?? -1] ?? '',
        student_identifier: values[headerMap.get('student_identifier') ?? -1] ?? '',
        category: values[headerMap.get('category') ?? -1] ?? '',
        severity: values[headerMap.get('severity') ?? -1] ?? '',
        narrative: values[headerMap.get('narrative') ?? -1] ?? '',
        actions_taken: values[headerMap.get('actions_taken') ?? -1] ?? '',
        follow_up_notes: values[headerMap.get('follow_up_notes') ?? -1] ?? '',
      });
    }

    if (!headerFound) {
      throw new BadRequestException({
        code: 'INVALID_HEADERS',
        message: 'No header row found in CSV',
      });
    }

    return rows;
  }

  /**
   * Parse a single CSV line, handling quoted fields.
   */
  private parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char ?? '';
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          fields.push(current);
          current = '';
        } else {
          current += char ?? '';
        }
      }
    }

    fields.push(current);
    return fields;
  }

  /**
   * Resolve student by enrolment/student number or by "FirstName LastName (YYYY-MM-DD)" format.
   */
  private async resolveStudent(
    tenantId: string,
    identifier: string,
    db: PrismaService,
  ): Promise<{ id: string; first_name: string; last_name: string } | null> {
    // Try to match by student_number first
    const byNumber = await db.student.findFirst({
      where: { tenant_id: tenantId, student_number: identifier },
      select: { id: true, first_name: true, last_name: true },
    });

    if (byNumber) {
      return byNumber;
    }

    // Try "FirstName LastName (YYYY-MM-DD)" format
    const nameMatch = NAME_DOB_RE.exec(identifier);
    if (nameMatch) {
      const firstName = nameMatch[1]?.trim();
      const lastName = nameMatch[2]?.trim();
      const dob = nameMatch[3];

      if (firstName && lastName && dob) {
        const byNameDob = await db.student.findFirst({
          where: {
            tenant_id: tenantId,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: new Date(dob),
          },
          select: { id: true, first_name: true, last_name: true },
        });

        return byNameDob;
      }
    }

    return null;
  }

  /**
   * Validate category against tenant config. Returns the matching active categories.
   */
  private async loadCategories(
    tenantId: string,
    db: PrismaService,
  ): Promise<ConcernCategory[]> {
    const record = await db.tenantSetting.findUnique({
      where: { tenant_id: tenantId },
    });

    const settingsJson = (record?.settings as Record<string, unknown>) ?? {};
    const pastoralRaw = (settingsJson.pastoral as Record<string, unknown>) ?? {};
    const categories = pastoralRaw.concern_categories;

    if (Array.isArray(categories)) {
      return categories as ConcernCategory[];
    }

    // Return default categories if no config
    return [
      { key: 'academic', label: 'Academic', active: true },
      { key: 'social', label: 'Social', active: true },
      { key: 'emotional', label: 'Emotional', active: true },
      { key: 'behavioural', label: 'Behavioural', active: true },
      { key: 'attendance', label: 'Attendance', active: true },
      { key: 'family_home', label: 'Family / Home', active: true },
      { key: 'health', label: 'Health', active: true },
      { key: 'child_protection', label: 'Child Protection', auto_tier: 3, active: true },
      { key: 'bullying', label: 'Bullying', active: true },
      { key: 'self_harm', label: 'Self-harm / Suicidal ideation', auto_tier: 3, active: true },
      { key: 'other', label: 'Other', active: true },
    ];
  }

  /**
   * Compute SHA-256 hash for deduplication: SHA-256(student_id + date + narrative).
   */
  private computeHash(studentId: string, date: string, narrative: string): string {
    return createHash('sha256')
      .update(`${studentId}${date}${narrative}`)
      .digest('hex');
  }

  /**
   * Check if an import_hash already exists in the pastoral_concerns table.
   * Uses findFirst with the pending import_hash column.
   *
   * NOTE: `import_hash` is a pending migration column. Once the migration runs
   * and `prisma generate` is re-run, the type cast here can be removed.
   */
  private async checkDuplicateHash(
    tenantId: string,
    hash: string,
    db: PrismaService,
  ): Promise<boolean> {
    const existing = await db.pastoralConcern.findFirst({
      where: { tenant_id: tenantId, import_hash: hash } as Parameters<typeof db.pastoralConcern.findFirst>[0] extends { where?: infer W } ? W : never,
      select: { id: true },
    });

    return !!existing;
  }

  /**
   * Create a pastoral concern record with the import_hash field.
   *
   * NOTE: `import_hash` is a pending migration column. Once the migration runs
   * and `prisma generate` is re-run, this helper can be inlined into the
   * confirm() method and the type cast removed.
   */
  private async createImportedConcern(
    db: PrismaService,
    data: ConcernImportCreateData,
  ): Promise<{ id: string }> {
    return db.pastoralConcern.create({
      data: data as Parameters<typeof db.pastoralConcern.create>[0]['data'],
    });
  }

  /**
   * Determine the tier based on category and severity.
   * For imports: routine/elevated = Tier 1, urgent/critical = Tier 2 (never Tier 3).
   */
  private determineTier(category: string, severity: string): number {
    // Never assign Tier 3 via import
    if (severity === 'urgent' || severity === 'critical') {
      return 2;
    }
    // Ignore auto_tier for import — cap at Tier 2
    void category;
    return 1;
  }
}
