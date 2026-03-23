import {
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { ImportType } from '@school/shared';
import * as XLSX from 'xlsx';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { SequenceService } from '../tenants/sequence.service';

/** Example data values from the XLSX template, used to detect and skip example rows. */
const EXAMPLE_FIRST_NAMES = new Set(['aisha', 'omar', 'ahmed', 'sarah', 'stf-001']);

/** Tracks family deduplication results across grouped student processing. */
interface StudentImportStats {
  students_created: number;
  households_created: number;
  households_reused: number;
  parents_created: number;
  family_groups: Array<{ email: string; rows: number[] }>;
  skipped_rows: Array<{ row: number; reason: string }>;
}

@Injectable()
export class ImportProcessingService {
  private readonly logger = new Logger(ImportProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly sequenceService: SequenceService,
  ) {}

  /** Track a record created by an import job for potential rollback. */
  private async trackRecord(
    db: PrismaService,
    tenantId: string,
    jobId: string,
    recordType: string,
    recordId: string,
  ): Promise<void> {
    await db.importJobRecord.create({
      data: { tenant_id: tenantId, import_job_id: jobId, record_type: recordType, record_id: recordId },
    });
  }

  /**
   * Process a confirmed import job. Downloads file (CSV or XLSX), parses rows,
   * creates records in the DB for each valid row within an RLS-scoped transaction.
   * Updates the import_job with final counts and deletes S3 file on completion.
   */
  async process(tenantId: string, jobId: string): Promise<void> {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenant_id: tenantId },
    });

    if (!job || !job.file_key) {
      this.logger.error(`Import job ${jobId} not found or missing file_key`);
      return;
    }

    const importType = job.import_type as ImportType;
    const summary = job.summary_json as Record<string, unknown>;
    const validationErrors = Array.isArray(summary['errors']) ? summary['errors'] as Array<{ row: number }> : [];
    const errorRows = new Set(validationErrors.map((e) => e.row));
    const createdByUserId = job.created_by_user_id;

    try {
      // Download file from S3
      const fileBuffer = await this.s3Service.download(job.file_key);

      // Determine file type from S3 key
      const isXlsx = job.file_key.toLowerCase().endsWith('.xlsx');

      // Parse file into rows
      let headers: string[];
      let dataRows: Record<string, string>[];

      if (isXlsx) {
        const parsed = this.parseXlsx(fileBuffer);
        headers = parsed.headers;
        dataRows = parsed.rows;
      } else {
        const parsed = this.parseCsv(fileBuffer);
        headers = parsed.headers;
        dataRows = parsed.rows;
      }

      // headers is used for reference only -- we already have parsed rows
      if (headers.length === 0 || dataRows.length === 0) {
        await this.updateJobFinal(jobId, 'failed', 0, 0);
        return;
      }

      // Filter out example rows
      const filteredRows = dataRows.filter((row) => !this.isExampleRow(row, importType));

      let successCount = 0;
      let failCount = 0;
      let extraSummary: Partial<StudentImportStats> | undefined;

      const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

      if (importType === 'students') {
        // Students use family-grouped processing for deduplication
        const result = await this.processStudentRows(
          rlsClient,
          tenantId,
          filteredRows,
          errorRows,
          jobId,
        );
        successCount = result.students_created;
        failCount = result.skipped_rows.filter(
          (r) => r.reason.startsWith('Error:') ||
                 r.reason.startsWith('Family group error:') ||
                 r.reason.startsWith('Validation error'),
        ).length;
        extraSummary = {
          students_created: result.students_created,
          households_created: result.households_created,
          households_reused: result.households_reused,
          parents_created: result.parents_created,
          family_groups: result.family_groups,
        };
      } else {
        // All other import types process row-by-row
        await rlsClient.$transaction(async (tx) => {
          const db = tx as unknown as PrismaService;

          for (let i = 0; i < filteredRows.length; i++) {
            const rowNumber = i + 2; // 1-indexed, row 1 = headers

            // Skip rows that had validation errors
            if (errorRows.has(rowNumber)) {
              failCount++;
              continue;
            }

            const row = filteredRows[i];
            if (!row) {
              failCount++;
              continue;
            }

            try {
              await this.processRow(db, tenantId, importType, row, createdByUserId);
              successCount++;
            } catch (err) {
              this.logger.warn(
                `Import job ${jobId} row ${rowNumber} processing error: ${String(err)}`,
              );
              failCount++;
            }
          }
        });
      }

      const finalStatus = failCount > 0 && successCount === 0 ? 'failed' : 'completed';
      await this.updateJobFinal(jobId, finalStatus, successCount, failCount, extraSummary);

      // Delete S3 file on completion
      try {
        await this.s3Service.delete(job.file_key);
        this.logger.log(`Import job ${jobId}: deleted S3 file ${job.file_key}`);
      } catch (err) {
        this.logger.warn(`Import job ${jobId}: failed to delete S3 file: ${String(err)}`);
      }

      this.logger.log(
        `Import job ${jobId} processing complete: ${successCount} success, ${failCount} failed, status=${finalStatus}`,
      );
    } catch (err) {
      this.logger.error(`Import job ${jobId} processing error: ${String(err)}`);
      await this.prisma.importJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          summary_json: {
            ...(job.summary_json as Prisma.JsonObject),
            processing_error: String(err),
          },
        },
      });
    }
  }

  // ─── File Parsers ──────────────────────────────────────────────────────

  /**
   * Normalize a header: lowercase, trim, strip trailing asterisks.
   */
  private normalizeHeader(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s*\*\s*$/, '').trim();
  }

  /**
   * Parse a CSV buffer into headers and data rows.
   */
  private parseCsv(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
    const csvContent = buffer.toString('utf-8');
    const lines = csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return { headers: [], rows: [] };
    }

    const headerLine = lines[0];
    if (!headerLine) {
      return { headers: [], rows: [] };
    }

    const headers = this.parseCsvLine(headerLine).map((h) => this.normalizeHeader(h));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const dataLine = lines[i];
      if (!dataLine) continue;

      const values = this.parseCsvLine(dataLine);
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (header) {
          row[header] = (values[j] ?? '').trim();
        }
      }

      const hasData = Object.values(row).some((v) => v.length > 0);
      if (hasData) {
        rows.push(row);
      }
    }

    return { headers, rows };
  }

  /**
   * Parse an XLSX buffer into headers and data rows.
   */
  private parseXlsx(buffer: Buffer): { headers: string[]; rows: Record<string, string>[] } {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { headers: [], rows: [] };
    }

    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      return { headers: [], rows: [] };
    }

    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: true,
    });

    if (rawRows.length < 2) {
      return { headers: [], rows: [] };
    }

    const headerRow = rawRows[0];
    if (!headerRow) {
      return { headers: [], rows: [] };
    }

    const headers = headerRow.map((h) => this.normalizeHeader(String(h)));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < rawRows.length; i++) {
      const rawRow = rawRows[i];
      if (!rawRow) continue;

      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        if (!header) continue;

        const cellValue = rawRow[j];
        if (cellValue instanceof Date) {
          row[header] = this.formatDateToISO(cellValue);
        } else {
          row[header] = String(cellValue ?? '').trim();
        }
      }

      const hasData = Object.values(row).some((v) => v.length > 0);
      if (hasData) {
        rows.push(row);
      }
    }

    return { headers, rows };
  }

  // ─── Row Processing ────────────────────────────────────────────────────

  /**
   * Process a single row based on import type.
   */
  private async processRow(
    db: PrismaService,
    tenantId: string,
    importType: ImportType,
    row: Record<string, string>,
    createdByUserId: string,
  ): Promise<void> {
    switch (importType) {
      case 'students':
        // Students are handled by processStudentRows with family grouping
        // This branch should never be reached
        throw new Error('Student rows should be processed via processStudentRows');
      case 'parents':
        await this.processParentRow(db, tenantId, row);
        break;
      case 'staff':
        await this.processStaffRow(db, tenantId, row);
        break;
      case 'fees':
        await this.processFeeRow(db, tenantId, row);
        break;
      case 'exam_results':
        await this.processExamResultRow(db, tenantId, row, createdByUserId);
        break;
      case 'staff_compensation':
        await this.processStaffCompensationRow(db, tenantId, row, createdByUserId);
        break;
      default:
        throw new Error(`Unknown import type: ${String(importType)}`);
    }
  }

  /**
   * Process all student rows with family deduplication.
   * Groups rows by parent1_email, creates one household + parents per family,
   * and links all students in that family to the same household.
   * Also checks if a parent with the same email already exists in the DB.
   */
  private async processStudentRows(
    rlsClient: ReturnType<typeof createRlsClient>,
    tenantId: string,
    filteredRows: Record<string, string>[],
    errorRows: Set<number>,
    jobId: string,
  ): Promise<StudentImportStats> {
    const stats: StudentImportStats = {
      students_created: 0,
      households_created: 0,
      households_reused: 0,
      parents_created: 0,
      family_groups: [],
      skipped_rows: [],
    };

    // Build row-index-to-original-row-number mapping.
    // filteredRows already has example rows removed, but row numbers should reflect
    // position in the original spreadsheet (1-indexed, row 1 = headers).
    // We track the original index for error reporting.
    interface IndexedRow {
      row: Record<string, string>;
      originalRowNumber: number;
    }

    const indexedRows: IndexedRow[] = filteredRows.map((row, i) => ({
      row,
      originalRowNumber: i + 2, // row 1 = headers, rows start at 2
    }));

    // Group rows by parent1_email (case-insensitive, trimmed)
    const familyGroups = new Map<string, IndexedRow[]>();
    const noEmailRows: IndexedRow[] = [];

    for (const entry of indexedRows) {
      // Skip rows that had validation errors
      if (errorRows.has(entry.originalRowNumber)) {
        stats.skipped_rows.push({
          row: entry.originalRowNumber,
          reason: 'Validation error from preview',
        });
        continue;
      }

      const email = (entry.row['parent1_email'] ?? '').trim().toLowerCase();
      if (!email) {
        noEmailRows.push(entry);
        continue;
      }

      const existing = familyGroups.get(email);
      if (existing) {
        existing.push(entry);
      } else {
        familyGroups.set(email, [entry]);
      }
    }

    // Process all rows within a single RLS transaction
    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Process rows with no parent email — create a standalone household from last name
      for (const entry of noEmailRows) {
        try {
          const lastName = entry.row['last_name'] ?? '';
          const householdName = entry.row['household_name'] || `${lastName} Family`;
          const householdNumber = await this.sequenceService.generateHouseholdReference(tenantId, db);
          const household = await db.household.create({
            data: {
              tenant_id: tenantId,
              household_name: householdName,
              household_number: householdNumber,
              address_line_1: entry.row['address_line1'] || null,
              address_line_2: entry.row['address_line2'] || null,
              city: entry.row['city'] || null,
              country: entry.row['country'] || null,
              postal_code: entry.row['postal_code'] || null,
              needs_completion: true,
            },
          });
          stats.households_created++;
          await this.trackRecord(db, tenantId, jobId, 'household', household.id);

          const studentId = await this.createStudentFromRow(db, tenantId, entry.row, household.id);
          stats.students_created++;
          await this.trackRecord(db, tenantId, jobId, 'student', studentId);
          stats.skipped_rows.push({
            row: entry.originalRowNumber,
            reason: 'No parent email — student created with standalone household',
          });
        } catch (err) {
          this.logger.warn(
            `Import job ${jobId} row ${entry.originalRowNumber} processing error: ${String(err)}`,
          );
          stats.skipped_rows.push({
            row: entry.originalRowNumber,
            reason: `Error: ${String(err)}`,
          });
        }
      }

      // Process each family group
      for (const [email, familyRows] of familyGroups) {
        const rowNumbers = familyRows.map((r) => r.originalRowNumber);
        stats.family_groups.push({ email, rows: rowNumbers });

        const firstRow = familyRows[0];
        if (!firstRow) continue;

        try {
          // Check if a parent with this email already exists in the DB
          const existingParent = await db.parent.findFirst({
            where: {
              tenant_id: tenantId,
              email: email, // CITEXT handles case-insensitivity
            },
            include: {
              household_parents: {
                select: { household_id: true },
                take: 1,
              },
            },
          });

          let householdId: string;

          if (existingParent && existingParent.household_parents.length > 0) {
            // Reuse existing household from previously imported/created parent
            const firstHouseholdParent = existingParent.household_parents[0];
            if (!firstHouseholdParent) {
              throw new Error(`Parent ${email} has no household link`);
            }
            householdId = firstHouseholdParent.household_id;
            stats.households_reused++;

            this.logger.log(
              `Import job ${jobId}: reusing existing household for parent ${email}`,
            );
          } else {
            // Create new household from first row's data
            const parent1LastName = firstRow.row['parent1_last_name'] ?? '';
            const householdName = firstRow.row['household_name'] ?? '';
            const resolvedHouseholdName =
              householdName || `${parent1LastName} Family`;

            const familyHouseholdNumber = await this.sequenceService.generateHouseholdReference(tenantId, db);
            const household = await db.household.create({
              data: {
                tenant_id: tenantId,
                household_name: resolvedHouseholdName,
                household_number: familyHouseholdNumber,
                address_line_1:
                  firstRow.row['address_line1'] || null,
                address_line_2:
                  firstRow.row['address_line2'] || null,
                city: firstRow.row['city'] || null,
                country: firstRow.row['country'] || null,
                postal_code: firstRow.row['postal_code'] || null,
                needs_completion: true,
              },
            });
            householdId = household.id;
            stats.households_created++;
            await this.trackRecord(db, tenantId, jobId, 'household', household.id);

            // Create parent 1 from first row
            const parent1FirstName =
              firstRow.row['parent1_first_name'] ?? '';
            const parent1Phone = firstRow.row['parent1_phone'] ?? '';
            const parent1Relationship =
              firstRow.row['parent1_relationship'] ?? '';

            if (parent1FirstName && parent1LastName) {
              const parent1 = await db.parent.create({
                data: {
                  tenant_id: tenantId,
                  first_name: parent1FirstName,
                  last_name: parent1LastName,
                  email: email || null,
                  phone: parent1Phone || null,
                  relationship_label: parent1Relationship || null,
                  preferred_contact_channels: ['email'],
                },
              });
              await this.trackRecord(db, tenantId, jobId, 'parent', parent1.id);
              await db.householdParent.create({
                data: {
                  tenant_id: tenantId,
                  household_id: householdId,
                  parent_id: parent1.id,
                },
              });
              stats.parents_created++;
            }

            // Create parent 2 from first row if provided
            const parent2FirstName =
              firstRow.row['parent2_first_name'] ?? '';
            const parent2LastName =
              firstRow.row['parent2_last_name'] ?? '';
            const parent2Email = firstRow.row['parent2_email'] ?? '';
            const parent2Phone = firstRow.row['parent2_phone'] ?? '';
            const parent2Relationship =
              firstRow.row['parent2_relationship'] ?? '';

            if (parent2FirstName && parent2LastName) {
              const parent2 = await db.parent.create({
                data: {
                  tenant_id: tenantId,
                  first_name: parent2FirstName,
                  last_name: parent2LastName,
                  email: parent2Email || null,
                  phone: parent2Phone || null,
                  relationship_label: parent2Relationship || null,
                  preferred_contact_channels: ['email'],
                },
              });
              await this.trackRecord(db, tenantId, jobId, 'parent', parent2.id);
              await db.householdParent.create({
                data: {
                  tenant_id: tenantId,
                  household_id: householdId,
                  parent_id: parent2.id,
                },
              });
              stats.parents_created++;
            }
          }

          // Create all students in this family group
          for (const entry of familyRows) {
            try {
              const studentId = await this.createStudentFromRow(
                db,
                tenantId,
                entry.row,
                householdId,
              );
              stats.students_created++;
              await this.trackRecord(db, tenantId, jobId, 'student', studentId);
            } catch (err) {
              this.logger.warn(
                `Import job ${jobId} row ${entry.originalRowNumber} student creation error: ${String(err)}`,
              );
              stats.skipped_rows.push({
                row: entry.originalRowNumber,
                reason: `Error: ${String(err)}`,
              });
            }
          }
        } catch (err) {
          // If the whole family group fails (e.g. household creation fails),
          // mark all rows in the group as failed
          this.logger.warn(
            `Import job ${jobId} family group ${email} error: ${String(err)}`,
          );
          for (const entry of familyRows) {
            stats.skipped_rows.push({
              row: entry.originalRowNumber,
              reason: `Family group error: ${String(err)}`,
            });
          }
        }
      }
    });

    return stats;
  }

  /**
   * Create a single student record from a parsed row, linked to the given household.
   */
  private async createStudentFromRow(
    db: PrismaService,
    tenantId: string,
    row: Record<string, string>,
    householdId: string,
  ): Promise<string> {
    const firstName = row['first_name'] ?? '';
    const lastName = row['last_name'] ?? '';
    const middleName = row['middle_name'] ?? '';
    const dateOfBirth = row['date_of_birth'] ?? '';
    const yearGroupName = row['year_group'] ?? row['year_group_name'] ?? '';
    const genderRaw = row['gender'] ?? '';
    const medicalNotes = row['medical_notes'] ?? '';
    const allergies = row['allergies'] ?? '';

    // Resolve year_group_id
    let yearGroupId: string | null = null;
    if (yearGroupName) {
      yearGroupId = await this.resolveYearGroup(db, tenantId, yearGroupName);
    }

    // Normalise gender
    let gender: 'male' | 'female' | undefined;
    if (genderRaw) {
      const g = genderRaw.toLowerCase();
      if (g === 'm' || g === 'male') gender = 'male';
      else if (g === 'f' || g === 'female') gender = 'female';
    }

    // Determine if allergy info was provided
    const hasAllergy = !!allergies;

    // Parse date_of_birth (support multiple formats)
    const parsedDob = this.parseFlexibleDate(dateOfBirth);

    // Auto-generate student number
    const studentNumber = await this.sequenceService.nextNumber(tenantId, 'student', db, 'STU');

    const student = await db.student.create({
      data: {
        tenant_id: tenantId,
        household_id: householdId,
        student_number: studentNumber,
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        date_of_birth: parsedDob ?? new Date(dateOfBirth),
        entry_date: new Date(),
        gender,
        medical_notes: medicalNotes || null,
        has_allergy: hasAllergy,
        allergy_details: allergies || null,
        status: 'active',
        year_group_id: yearGroupId,
      },
    });
    return student.id;
  }

  /**
   * Fuzzy-match year group name against existing year groups.
   * Handles: "Year 1", "year 1", "Y1", "Grade 1", "grade 1", etc.
   */
  private async resolveYearGroup(
    db: PrismaService,
    tenantId: string,
    input: string,
  ): Promise<string | null> {
    const normalized = input.trim().toLowerCase();

    // Load all year groups for this tenant
    const yearGroups = await db.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
    });

    // Try exact case-insensitive match first
    for (const yg of yearGroups) {
      if (yg.name.toLowerCase() === normalized) {
        return yg.id;
      }
    }

    // Try common aliases: "Y1" -> "Year 1", "Grade 1" -> "Year 1"
    const numberMatch = /\d+/.exec(normalized);
    if (numberMatch) {
      const num = numberMatch[0];
      for (const yg of yearGroups) {
        const ygNum = /\d+/.exec(yg.name.toLowerCase());
        if (ygNum && ygNum[0] === num) {
          return yg.id;
        }
      }
    }

    return null;
  }

  private async processParentRow(
    db: PrismaService,
    tenantId: string,
    row: Record<string, string>,
  ): Promise<void> {
    const firstName = row['first_name'] ?? '';
    const lastName = row['last_name'] ?? '';
    const email = row['email'] ?? '';
    const phone = row['phone'] ?? '';
    const relationship = row['relationship'] ?? '';
    const householdName = row['household_name'] ?? '';

    // Create or find household
    let household: { id: string } | null = null;
    if (householdName) {
      household = await db.household.findFirst({
        where: {
          tenant_id: tenantId,
          household_name: householdName,
        },
      });

      if (!household) {
        household = await db.household.create({
          data: {
            tenant_id: tenantId,
            household_name: householdName,
            needs_completion: true,
          },
        });
      }
    }

    const parent = await db.parent.create({
      data: {
        tenant_id: tenantId,
        first_name: firstName,
        last_name: lastName,
        email: email || null,
        phone: phone || null,
        relationship_label: relationship || null,
        preferred_contact_channels: ['email'],
      },
    });

    // Link parent to household via HouseholdParent
    if (household) {
      await db.householdParent.create({
        data: {
          tenant_id: tenantId,
          household_id: household.id,
          parent_id: parent.id,
        },
      });
    }
  }

  private async processStaffRow(
    db: PrismaService,
    tenantId: string,
    row: Record<string, string>,
  ): Promise<void> {
    const firstName = row['first_name'] ?? '';
    const lastName = row['last_name'] ?? '';
    const email = row['email'] ?? '';
    const phone = row['phone'] ?? '';
    const jobTitle = row['job_title'] ?? '';
    const staffNumber = row['staff_number'] ?? '';
    const department = row['department'] ?? '';
    const employmentTypeRaw = row['employment_type'] ?? '';

    // Create user first (will need to be activated via invitation flow)
    const user = await db.user.create({
      data: {
        first_name: firstName,
        last_name: lastName,
        email,
        phone: phone || null,
        password_hash: '', // Placeholder -- set via invitation flow
        global_status: 'active',
      },
    });

    // Resolve employment_type to valid enum values
    let employmentType: 'full_time' | 'part_time' | 'contract' | 'substitute' = 'full_time';
    if (employmentTypeRaw) {
      const et = employmentTypeRaw.toLowerCase().replace(/[\s-]/g, '_');
      if (et === 'part_time') employmentType = 'part_time';
      else if (et === 'contract' || et === 'contractor') employmentType = 'contract';
      else if (et === 'substitute') employmentType = 'substitute';
    }

    await db.staffProfile.create({
      data: {
        tenant_id: tenantId,
        user_id: user.id,
        staff_number: staffNumber || null,
        job_title: jobTitle || null,
        department: department || null,
        employment_type: employmentType,
        employment_status: 'active',
      },
    });
  }

  private async processFeeRow(
    db: PrismaService,
    tenantId: string,
    row: Record<string, string>,
  ): Promise<void> {
    const feeStructureName = row['fee_structure_name'] ?? '';
    const householdName = row['household_name'] ?? '';

    // Find fee structure by name
    const feeStructure = await db.feeStructure.findFirst({
      where: { tenant_id: tenantId, name: feeStructureName },
    });

    if (!feeStructure) {
      throw new Error(`Fee structure "${feeStructureName}" not found`);
    }

    // Find household by name
    const household = await db.household.findFirst({
      where: { tenant_id: tenantId, household_name: householdName },
    });

    if (!household) {
      throw new Error(`Household "${householdName}" not found`);
    }

    // Find first active student in this household for assignment
    const student = await db.student.findFirst({
      where: {
        tenant_id: tenantId,
        household_id: household.id,
        status: 'active',
      },
    });

    await db.householdFeeAssignment.create({
      data: {
        tenant_id: tenantId,
        fee_structure_id: feeStructure.id,
        student_id: student?.id ?? null,
        household_id: household.id,
        effective_from: new Date(),
      },
    });
  }

  private async processExamResultRow(
    db: PrismaService,
    tenantId: string,
    row: Record<string, string>,
    createdByUserId: string,
  ): Promise<void> {
    const studentNumber = row['student_number'] ?? '';
    // Accept both 'subject' (new template) and 'subject_name' (legacy)
    const subjectName = row['subject'] ?? row['subject_name'] ?? '';
    const assessmentName = row['assessment_name'] ?? '';
    const scoreStr = row['score'] ?? '';
    const grade = row['grade'] ?? '';

    // Find student by student_number
    const student = await db.student.findFirst({
      where: {
        tenant_id: tenantId,
        student_number: studentNumber,
      },
    });

    if (!student) {
      throw new Error(`Student with number "${studentNumber}" not found`);
    }

    // Find subject by name
    const subject = await db.subject.findFirst({
      where: {
        tenant_id: tenantId,
        name: subjectName,
      },
    });

    if (!subject) {
      throw new Error(`Subject "${subjectName}" not found`);
    }

    // Find assessment: by title if provided, otherwise the latest open/closed
    let assessment;
    if (assessmentName) {
      assessment = await db.assessment.findFirst({
        where: {
          tenant_id: tenantId,
          subject_id: subject.id,
          title: assessmentName,
        },
      });
    }
    if (!assessment) {
      assessment = await db.assessment.findFirst({
        where: {
          tenant_id: tenantId,
          subject_id: subject.id,
          status: { in: ['open', 'closed'] },
        },
        orderBy: { created_at: 'desc' },
      });
    }

    if (!assessment) {
      throw new Error(`No assessment found for subject "${subjectName}"`);
    }

    await db.grade.create({
      data: {
        tenant_id: tenantId,
        assessment_id: assessment.id,
        student_id: student.id,
        raw_score: Number(scoreStr),
        comment: grade ? `Grade: ${grade}` : null,
        entered_by_user_id: createdByUserId,
        entered_at: new Date(),
      },
    });
  }

  private async processStaffCompensationRow(
    db: PrismaService,
    tenantId: string,
    row: Record<string, string>,
    createdByUserId: string,
  ): Promise<void> {
    const staffNumber = row['staff_number'] ?? '';
    const compensationTypeRaw = row['compensation_type'] ?? '';
    // Accept 'amount' (new template) or legacy 'base_salary'/'per_class_rate'
    const amountStr = row['amount'] ?? '';
    const baseSalaryStr = row['base_salary'] ?? '';
    const perClassRateStr = row['per_class_rate'] ?? '';
    const effectiveFromStr = row['effective_from'] ?? '';
    const effectiveToStr = row['effective_to'] ?? '';

    // Find staff profile by staff_number
    const staffProfile = await db.staffProfile.findFirst({
      where: {
        tenant_id: tenantId,
        staff_number: staffNumber,
      },
    });

    if (!staffProfile) {
      throw new Error(`Staff member with number "${staffNumber}" not found`);
    }

    const compensationType: 'salaried' | 'per_class' =
      compensationTypeRaw.toLowerCase() === 'per_class' ? 'per_class' : 'salaried';

    // Use 'amount' column as fallback when legacy columns are absent
    const resolvedBaseSalary = baseSalaryStr
      ? Number(baseSalaryStr)
      : compensationType === 'salaried' && amountStr
        ? Number(amountStr)
        : null;
    const resolvedPerClassRate = perClassRateStr
      ? Number(perClassRateStr)
      : compensationType === 'per_class' && amountStr
        ? Number(amountStr)
        : null;

    await db.staffCompensation.create({
      data: {
        tenant_id: tenantId,
        staff_profile_id: staffProfile.id,
        compensation_type: compensationType,
        base_salary: resolvedBaseSalary,
        per_class_rate: resolvedPerClassRate,
        effective_from: effectiveFromStr ? new Date(effectiveFromStr) : new Date(),
        effective_to: effectiveToStr ? new Date(effectiveToStr) : null,
        created_by_user_id: createdByUserId,
      },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  /**
   * Detect if a row is the example/hint row from the template.
   * For students: checks if parent1_email contains "example.com" AND the row
   * appears in the first few data rows (row number <= 4, accounting for header + up to 2 example rows).
   * Also checks for known example first_name + last_name pairs.
   */
  private isExampleRow(row: Record<string, string>, importType: ImportType): boolean {
    const keyFields: Record<ImportType, string> = {
      students: 'first_name',
      parents: 'first_name',
      staff: 'first_name',
      fees: 'household_name',
      exam_results: 'student_number',
      staff_compensation: 'staff_number',
    };

    const field = keyFields[importType];
    const value = (row[field] ?? '').toLowerCase().trim();
    if (!value) return false;

    if (EXAMPLE_FIRST_NAMES.has(value)) {
      if (importType === 'students' && (value === 'aisha' || value === 'omar')) {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'al-mansour') return true;
      }
      if (importType === 'parents' && value === 'ahmed') {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'al-mansour') return true;
      }
      if (importType === 'staff' && value === 'sarah') {
        const lastName = (row['last_name'] ?? '').toLowerCase();
        if (lastName === 'johnson') return true;
      }
    }

    // For students: detect example rows by checking if parent1_email uses example.com
    // and the known example names match. This catches both template example rows.
    if (importType === 'students') {
      const parent1Email = (row['parent1_email'] ?? '').toLowerCase().trim();
      const lastName = (row['last_name'] ?? '').toLowerCase().trim();
      if (
        parent1Email.endsWith('@example.com') &&
        lastName === 'al-mansour' &&
        (value === 'aisha' || value === 'omar')
      ) {
        return true;
      }
    }

    // Check for template hint patterns (parentheses in values)
    const allValues = Object.values(row).join(' ');
    if (allValues.includes('(') && allValues.includes(')') && EXAMPLE_FIRST_NAMES.has(value)) {
      return true;
    }

    return false;
  }

  /**
   * Parse a date string in multiple formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY.
   */
  private parseFlexibleDate(dateStr: string): Date | null {
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    if (isoMatch) {
      const date = new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateStr);
    if (slashMatch) {
      const date = new Date(`${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    const dashMatch = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr);
    if (dashMatch) {
      const date = new Date(`${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]}T00:00:00Z`);
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  /**
   * Format a Date object to ISO date string (YYYY-MM-DD).
   */
  private formatDateToISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Simple CSV line parser that handles quoted fields.
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
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
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current);
    return result;
  }

  private async updateJobFinal(
    jobId: string,
    status: 'completed' | 'failed',
    successful: number,
    failed: number,
    extraSummary?: Partial<StudentImportStats>,
  ): Promise<void> {
    const existing = await this.prisma.importJob.findUnique({
      where: { id: jobId },
    });

    const existingSummary = (existing?.summary_json as Prisma.JsonObject) ?? {};

    const summaryData: Prisma.JsonObject = {
      ...existingSummary,
      successful,
      failed,
    };

    if (extraSummary) {
      summaryData['students_created'] = extraSummary.students_created ?? 0;
      summaryData['households_created'] = extraSummary.households_created ?? 0;
      summaryData['households_reused'] = extraSummary.households_reused ?? 0;
      summaryData['parents_created'] = extraSummary.parents_created ?? 0;
      if (extraSummary.family_groups) {
        summaryData['family_groups'] = extraSummary.family_groups as unknown as Prisma.JsonArray;
      }
    }

    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status,
        summary_json: summaryData,
      },
    });
  }
}
