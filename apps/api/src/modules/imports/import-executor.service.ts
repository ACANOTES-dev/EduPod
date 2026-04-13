import { Injectable, Logger } from '@nestjs/common';

import type { ImportType } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { ImportParserService } from './import-parser.service';

/** Tracks family deduplication results across grouped student processing. */
export interface StudentImportStats {
  students_created: number;
  households_created: number;
  households_reused: number;
  parents_created: number;
  family_groups: Array<{ email: string; rows: number[] }>;
  skipped_rows: Array<{ row: number; reason: string }>;
}

@Injectable()
export class ImportExecutorService {
  private readonly logger = new Logger(ImportExecutorService.name);

  constructor(
    private readonly sequenceService: SequenceService,
    private readonly encryptionService: EncryptionService,
    private readonly parser: ImportParserService,
  ) {}

  // ─── Record Tracking ──────────────────────────────────────────────────────

  /** Track a record created by an import job for potential rollback. */
  async trackRecord(
    db: PrismaService,
    tenantId: string,
    jobId: string,
    recordType: string,
    recordId: string,
  ): Promise<void> {
    await db.importJobRecord.create({
      data: {
        tenant_id: tenantId,
        import_job_id: jobId,
        record_type: recordType,
        record_id: recordId,
      },
    });
  }

  // ─── Row Dispatch ─────────────────────────────────────────────────────────

  /**
   * Process a single row based on import type.
   */
  async processRow(
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

  // ─── Student Processing ───────────────────────────────────────────────────

  /**
   * Process all student rows with family deduplication.
   * Groups rows by parent1_email, creates one household + parents per family,
   * and links all students in that family to the same household.
   * Also checks if a parent with the same email already exists in the DB.
   */
  async processStudentRows(
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
          const householdNumber = await this.sequenceService.generateHouseholdReference(
            tenantId,
            db,
          );
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

            this.logger.log(`Import job ${jobId}: reusing existing household for parent ${email}`);
          } else {
            // Create new household from first row's data
            const parent1LastName = firstRow.row['parent1_last_name'] ?? '';
            const householdName = firstRow.row['household_name'] ?? '';
            const resolvedHouseholdName = householdName || `${parent1LastName} Family`;

            const familyHouseholdNumber = await this.sequenceService.generateHouseholdReference(
              tenantId,
              db,
            );
            const household = await db.household.create({
              data: {
                tenant_id: tenantId,
                household_name: resolvedHouseholdName,
                household_number: familyHouseholdNumber,
                address_line_1: firstRow.row['address_line1'] || null,
                address_line_2: firstRow.row['address_line2'] || null,
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
            const parent1FirstName = firstRow.row['parent1_first_name'] ?? '';
            const parent1Phone = firstRow.row['parent1_phone'] ?? '';
            const parent1Relationship = firstRow.row['parent1_relationship'] ?? '';

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
            const parent2FirstName = firstRow.row['parent2_first_name'] ?? '';
            const parent2LastName = firstRow.row['parent2_last_name'] ?? '';
            const parent2Email = firstRow.row['parent2_email'] ?? '';
            const parent2Phone = firstRow.row['parent2_phone'] ?? '';
            const parent2Relationship = firstRow.row['parent2_relationship'] ?? '';

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
          const createdStudentIds: string[] = [];
          for (const entry of familyRows) {
            try {
              const studentId = await this.createStudentFromRow(
                db,
                tenantId,
                entry.row,
                householdId,
              );
              createdStudentIds.push(studentId);
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

          // ── Auto-link created students to all household parents ──────
          if (createdStudentIds.length > 0) {
            const householdParents = await db.householdParent.findMany({
              where: { household_id: householdId, tenant_id: tenantId },
              select: { parent_id: true, role_label: true },
            });

            if (householdParents.length > 0) {
              await db.studentParent.createMany({
                data: createdStudentIds.flatMap((studentId) =>
                  householdParents.map((hp) => ({
                    tenant_id: tenantId,
                    student_id: studentId,
                    parent_id: hp.parent_id,
                    relationship_label: hp.role_label ?? null,
                  })),
                ),
                skipDuplicates: true,
              });
            }
          }
        } catch (err) {
          // If the whole family group fails (e.g. household creation fails),
          // mark all rows in the group as failed
          this.logger.warn(`Import job ${jobId} family group ${email} error: ${String(err)}`);
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
    const nationality = row['nationality'] ?? '';
    const cityOfBirth = row['city_of_birth'] ?? '';
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
    const parsedDob = this.parser.parseFlexibleDate(dateOfBirth);

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
        nationality: nationality || null,
        city_of_birth: cityOfBirth || null,
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

  // ─── Parent Row ───────────────────────────────────────────────────────────

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

  // ─── Staff Row ────────────────────────────────────────────────────────────

  private generateStaffNumber(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letterPart = Array.from(
      { length: 3 },
      () => letters[Math.floor(Math.random() * 26)],
    ).join('');
    const numberPart = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    const lastDigit = Math.floor(Math.random() * 10);
    return `${letterPart}${numberPart}-${lastDigit}`;
  }

  private resolveEmploymentType(
    raw: string,
  ): 'full_time' | 'part_time' | 'contract' | 'substitute' {
    if (!raw) return 'full_time';
    const et = raw.toLowerCase().replace(/[\s-]/g, '_');
    if (et === 'part_time') return 'part_time';
    if (et === 'contract' || et === 'contractor') return 'contract';
    if (et === 'substitute') return 'substitute';
    return 'full_time';
  }

  private async processStaffRow(
    db: PrismaService,
    tenantId: string,
    row: Record<string, string>,
  ): Promise<void> {
    // ─── Extract fields ──────────────────────────────────────────────────
    const firstName = row['first_name'] ?? '';
    const lastName = row['last_name'] ?? '';
    const email = (row['email'] ?? '').toLowerCase().trim();
    const phone = row['phone'] ?? '';
    const roleName = (row['role'] ?? '').trim();
    const jobTitle = row['job_title'] ?? '';
    const department = row['department'] ?? '';
    const employmentStatusRaw = (row['employment_status'] ?? '').toLowerCase().trim();
    const employmentType = this.resolveEmploymentType(row['employment_type'] ?? '');
    const bankName = row['bank_name'] ?? '';
    const bankAccountNumber = row['bank_account_number'] ?? '';
    const bankIban = row['bank_iban'] ?? '';

    const employmentStatus: 'active' | 'inactive' =
      employmentStatusRaw === 'inactive' ? 'inactive' : 'active';

    // ─── Generate unique staff number (ABC1234-5) ────────────────────────
    let staffNumber = this.generateStaffNumber();
    for (let attempt = 0; attempt < 5; attempt++) {
      const existing = await db.staffProfile.findFirst({
        where: { tenant_id: tenantId, staff_number: staffNumber },
        select: { id: true },
      });
      if (!existing) break;
      staffNumber = this.generateStaffNumber();
    }

    // ─── Hash staff number as initial password ───────────────────────────
    const { hash } = await import('bcryptjs');
    const passwordHash = await hash(staffNumber, 12);

    // ─── Resolve role by display_name (case-insensitive) ─────────────────
    let roleId: string | null = null;
    if (roleName) {
      const role = await db.role.findFirst({
        where: {
          tenant_id: tenantId,
          display_name: { equals: roleName, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (role) {
        roleId = role.id;
      } else {
        this.logger.warn(
          `Role "${roleName}" not found for tenant ${tenantId}, skipping role assignment`,
        );
      }
    }

    // ─── Encrypt bank details if provided ────────────────────────────────
    let bankAccountEncrypted: string | null = null;
    let bankIbanEncrypted: string | null = null;
    let bankEncryptionKeyRef: string | null = null;

    if (bankAccountNumber) {
      const result = this.encryptionService.encrypt(bankAccountNumber);
      bankAccountEncrypted = result.encrypted;
      bankEncryptionKeyRef = result.keyRef;
    }
    if (bankIban) {
      const result = this.encryptionService.encrypt(bankIban);
      bankIbanEncrypted = result.encrypted;
      bankEncryptionKeyRef = bankEncryptionKeyRef ?? result.keyRef;
    }

    // ─── Create or find user ─────────────────────────────────────────────
    let userId: string;
    const existingUser = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const newUser = await db.user.create({
        data: {
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || null,
          password_hash: passwordHash,
          email_verified_at: new Date(),
          global_status: 'active',
        },
      });
      userId = newUser.id;
    }

    // ─── Create tenant membership + role assignment ──────────────────────
    const existingMembership = await db.tenantMembership.findUnique({
      where: {
        idx_tenant_memberships_tenant_user: {
          tenant_id: tenantId,
          user_id: userId,
        },
      },
      select: { id: true },
    });

    let membershipId: string;
    if (existingMembership) {
      membershipId = existingMembership.id;
    } else {
      const membership = await db.tenantMembership.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          membership_status: 'active',
          joined_at: new Date(),
        },
      });
      membershipId = membership.id;
    }

    if (roleId) {
      // Check if role already assigned
      const existingRole = await db.membershipRole.findFirst({
        where: { membership_id: membershipId, role_id: roleId },
        select: { membership_id: true },
      });
      if (!existingRole) {
        await db.membershipRole.create({
          data: {
            membership_id: membershipId,
            role_id: roleId,
            tenant_id: tenantId,
          },
        });
      }
    }

    // ─── Create staff profile ────────────────────────────────────────────
    await db.staffProfile.create({
      data: {
        tenant_id: tenantId,
        user_id: userId,
        staff_number: staffNumber,
        job_title: jobTitle || null,
        department: department || null,
        employment_type: employmentType,
        employment_status: employmentStatus,
        bank_name: bankName || null,
        bank_account_number_encrypted: bankAccountEncrypted,
        bank_iban_encrypted: bankIbanEncrypted,
        bank_encryption_key_ref: bankEncryptionKeyRef,
      },
    });
  }

  // ─── Fee Row ──────────────────────────────────────────────────────────────

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

  // ─── Exam Result Row ──────────────────────────────────────────────────────

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

  // ─── Staff Compensation Row ───────────────────────────────────────────────

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
}
