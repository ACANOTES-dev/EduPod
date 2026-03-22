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

/** Example data values from the XLSX template, used to detect and skip example rows. */
const EXAMPLE_FIRST_NAMES = new Set(['aisha', 'ahmed', 'sarah', 'stf-001']);

@Injectable()
export class ImportProcessingService {
  private readonly logger = new Logger(ImportProcessingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

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

      const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

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

      const finalStatus = failCount > 0 && successCount === 0 ? 'failed' : 'completed';
      await this.updateJobFinal(jobId, finalStatus, successCount, failCount);

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
        await this.processStudentRow(db, tenantId, row);
        break;
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

  private async processStudentRow(
    db: PrismaService,
    tenantId: string,
    row: Record<string, string>,
  ): Promise<void> {
    const firstName = row['first_name'] ?? '';
    const lastName = row['last_name'] ?? '';
    const middleName = row['middle_name'] ?? '';
    const dateOfBirth = row['date_of_birth'] ?? '';
    // Accept both 'year_group' (new template) and 'year_group_name' (legacy)
    const yearGroupName = row['year_group'] ?? row['year_group_name'] ?? '';
    const genderRaw = row['gender'] ?? '';
    const medicalNotes = row['medical_notes'] ?? '';
    const allergies = row['allergies'] ?? '';

    // Parent 1 fields
    const parent1FirstName = row['parent1_first_name'] ?? '';
    const parent1LastName = row['parent1_last_name'] ?? '';
    const parent1Email = row['parent1_email'] ?? '';
    const parent1Phone = row['parent1_phone'] ?? '';
    const parent1Relationship = row['parent1_relationship'] ?? '';

    // Parent 2 fields
    const parent2FirstName = row['parent2_first_name'] ?? '';
    const parent2LastName = row['parent2_last_name'] ?? '';
    const parent2Email = row['parent2_email'] ?? '';
    const parent2Phone = row['parent2_phone'] ?? '';
    const parent2Relationship = row['parent2_relationship'] ?? '';

    // Household fields
    const householdName = row['household_name'] ?? '';
    const addressLine1 = row['address_line1'] ?? '';
    const addressLine2 = row['address_line2'] ?? '';
    const city = row['city'] ?? '';
    const country = row['country'] ?? '';
    const postalCode = row['postal_code'] ?? '';

    // Resolve year_group_id from year_group name (fuzzy: case-insensitive, accept "Y1", "Grade 1", etc.)
    let yearGroupId: string | null = null;
    if (yearGroupName) {
      yearGroupId = await this.resolveYearGroup(db, tenantId, yearGroupName);
    }

    // Create or find household
    const resolvedHouseholdName = householdName || `${lastName} Family`;
    let household = await db.household.findFirst({
      where: {
        tenant_id: tenantId,
        household_name: resolvedHouseholdName,
      },
    });

    if (!household) {
      household = await db.household.create({
        data: {
          tenant_id: tenantId,
          household_name: resolvedHouseholdName,
          address_line_1: addressLine1 || null,
          address_line_2: addressLine2 || null,
          city: city || null,
          country: country || null,
          postal_code: postalCode || null,
          needs_completion: true,
        },
      });
    }

    // Normalise gender
    let gender: 'male' | 'female' | undefined;
    if (genderRaw) {
      const g = genderRaw.toLowerCase();
      if (g === 'm' || g === 'male') gender = 'male';
      else if (g === 'f' || g === 'female') gender = 'female';
    }

    // Build full name
    const fullNameParts = [firstName, middleName, lastName].filter(Boolean);

    // Determine if allergy info was provided
    const hasAllergy = !!allergies;

    // Parse date_of_birth (support multiple formats)
    const parsedDob = this.parseFlexibleDate(dateOfBirth);

    await db.student.create({
      data: {
        tenant_id: tenantId,
        household_id: household.id,
        student_number: null, // Auto-generated by system
        first_name: firstName,
        middle_name: middleName || null,
        last_name: lastName,
        full_name: fullNameParts.join(' '),
        date_of_birth: parsedDob ?? new Date(dateOfBirth),
        entry_date: new Date(), // Default to today
        gender,
        medical_notes: medicalNotes || null,
        has_allergy: hasAllergy,
        allergy_details: allergies || null,
        status: 'active',
        year_group_id: yearGroupId,
      },
    });

    // Create parent 1 if provided
    if (parent1FirstName && parent1LastName) {
      const parent1 = await db.parent.create({
        data: {
          tenant_id: tenantId,
          first_name: parent1FirstName,
          last_name: parent1LastName,
          email: parent1Email || null,
          phone: parent1Phone || null,
          relationship_label: parent1Relationship || null,
          preferred_contact_channels: ['email'],
        },
      });
      await db.householdParent.create({
        data: {
          tenant_id: tenantId,
          household_id: household.id,
          parent_id: parent1.id,
        },
      });
    }

    // Create parent 2 if provided
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
      await db.householdParent.create({
        data: {
          tenant_id: tenantId,
          household_id: household.id,
          parent_id: parent2.id,
        },
      });
    }
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
      if (importType === 'students' && value === 'aisha') {
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
  ): Promise<void> {
    const existing = await this.prisma.importJob.findUnique({
      where: { id: jobId },
    });

    const existingSummary = (existing?.summary_json as Prisma.JsonObject) ?? {};

    await this.prisma.importJob.update({
      where: { id: jobId },
      data: {
        status,
        summary_json: {
          ...existingSummary,
          successful,
          failed,
        },
      },
    });
  }
}
