import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as XLSX from 'xlsx';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

import type { ImportProcessDto } from './dto/gradebook.dto';

export interface CsvValidationResult {
  valid: boolean;
  rows: Array<{
    line: number;
    student_identifier: string;
    subject_code: string;
    assessment_title: string;
    score: string;
    matched_student_id: string | null;
    matched_subject_id: string | null;
    matched_assessment_id: string | null;
    errors: string[];
  }>;
  summary: {
    total_rows: number;
    valid_rows: number;
    error_rows: number;
  };
}

@Injectable()
export class BulkImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}
  /**
   * Validate a CSV buffer against the database.
   * CSV columns: student_identifier, subject_code, assessment_title, score
   * Matching: student_number first, then first_name + last_name
   *           subject code first, then name
   *           assessment by title within matched student's enrolled classes for matched subject
   */
  async validateCsv(tenantId: string, csvBuffer: Buffer): Promise<CsvValidationResult> {
    const lines = csvBuffer.toString('utf-8').split('\n');
    const rows: CsvValidationResult['rows'] = [];

    if (lines.length < 2) {
      throw new BadRequestException({
        code: 'CSV_EMPTY',
        message: 'CSV file must contain a header row and at least one data row',
      });
    }

    // Parse header to validate columns
    const header = this.parseCsvLine(lines[0]!);
    const expectedColumns = ['student_identifier', 'subject_code', 'assessment_title', 'score'];
    const normalizedHeader = header.map((h) => h.trim().toLowerCase());

    for (const col of expectedColumns) {
      if (!normalizedHeader.includes(col)) {
        throw new BadRequestException({
          code: 'CSV_MISSING_COLUMN',
          message: `CSV is missing required column: "${col}". Expected columns: ${expectedColumns.join(', ')}`,
        });
      }
    }

    const colIndices = {
      student_identifier: normalizedHeader.indexOf('student_identifier'),
      subject_code: normalizedHeader.indexOf('subject_code'),
      assessment_title: normalizedHeader.indexOf('assessment_title'),
      score: normalizedHeader.indexOf('score'),
    };

    // Load all students for this tenant for matching
    const allStudents = (await this.studentReadFacade.findManyGeneric(tenantId, {
      select: {
        id: true,
        student_number: true,
        first_name: true,
        last_name: true,
      },
    })) as Array<{
      id: string;
      student_number: string | null;
      first_name: string;
      last_name: string;
    }>;

    // Load all subjects for this tenant
    const allSubjects = (await this.academicReadFacade.findAllSubjects(tenantId, {
      id: true,
      name: true,
      code: true,
    })) as Array<{ id: string; name: string; code: string | null }>;

    // Build lookup maps
    const studentByNumber = new Map<string, string>();
    const studentByName = new Map<string, string>();
    for (const s of allStudents) {
      if (s.student_number) {
        studentByNumber.set(s.student_number.toLowerCase(), s.id);
      }
      studentByName.set(`${s.first_name} ${s.last_name}`.toLowerCase(), s.id);
    }

    const subjectByCode = new Map<string, string>();
    const subjectByName = new Map<string, string>();
    for (const s of allSubjects) {
      if (s.code) {
        subjectByCode.set(s.code.toLowerCase(), s.id);
      }
      subjectByName.set(s.name.toLowerCase(), s.id);
    }

    // Process each data row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (line === '') continue;

      const cols = this.parseCsvLine(line);
      const errors: string[] = [];

      const studentIdentifier = (cols[colIndices.student_identifier] ?? '').trim();
      const subjectCode = (cols[colIndices.subject_code] ?? '').trim();
      const assessmentTitle = (cols[colIndices.assessment_title] ?? '').trim();
      const scoreStr = (cols[colIndices.score] ?? '').trim();

      if (!studentIdentifier) errors.push('Missing student_identifier');
      if (!subjectCode) errors.push('Missing subject_code');
      if (!assessmentTitle) errors.push('Missing assessment_title');
      if (!scoreStr) errors.push('Missing score');

      const score = parseFloat(scoreStr);
      if (scoreStr && isNaN(score)) {
        errors.push(`Invalid score value: "${scoreStr}"`);
      }

      // Match student
      let matchedStudentId: string | null = null;
      if (studentIdentifier) {
        matchedStudentId =
          studentByNumber.get(studentIdentifier.toLowerCase()) ??
          studentByName.get(studentIdentifier.toLowerCase()) ??
          null;

        if (!matchedStudentId) {
          errors.push(`Student not found: "${studentIdentifier}"`);
        }
      }

      // Match subject
      let matchedSubjectId: string | null = null;
      if (subjectCode) {
        matchedSubjectId =
          subjectByCode.get(subjectCode.toLowerCase()) ??
          subjectByName.get(subjectCode.toLowerCase()) ??
          null;

        if (!matchedSubjectId) {
          errors.push(`Subject not found: "${subjectCode}"`);
        }
      }

      // Match assessment by title within student's enrolled classes for the matched subject
      let matchedAssessmentId: string | null = null;
      if (matchedStudentId && matchedSubjectId && assessmentTitle) {
        // Find classes the student is enrolled in
        const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
          tenantId,
          { student_id: matchedStudentId, status: 'active' },
          { class_id: true },
        )) as Array<{ class_id: string }>;

        const classIds = enrolments.map((e) => e.class_id);

        if (classIds.length > 0) {
          const assessment = await this.prisma.assessment.findFirst({
            where: {
              tenant_id: tenantId,
              subject_id: matchedSubjectId,
              class_id: { in: classIds },
              title: assessmentTitle,
            },
            select: { id: true, max_score: true },
          });

          if (assessment) {
            matchedAssessmentId = assessment.id;
            // Validate score against max_score
            if (!isNaN(score) && score > Number(assessment.max_score)) {
              errors.push(`Score ${score} exceeds max score ${assessment.max_score}`);
            }
            if (!isNaN(score) && score < 0) {
              errors.push(`Score cannot be negative`);
            }
          } else {
            errors.push(`Assessment not found: "${assessmentTitle}" for subject "${subjectCode}"`);
          }
        } else {
          errors.push(`Student is not enrolled in any class`);
        }
      }

      rows.push({
        line: i + 1,
        student_identifier: studentIdentifier,
        subject_code: subjectCode,
        assessment_title: assessmentTitle,
        score: scoreStr,
        matched_student_id: matchedStudentId,
        matched_subject_id: matchedSubjectId,
        matched_assessment_id: matchedAssessmentId,
        errors,
      });
    }

    const validRows = rows.filter((r) => r.errors.length === 0);
    const errorRows = rows.filter((r) => r.errors.length > 0);

    return {
      valid: errorRows.length === 0,
      rows,
      summary: {
        total_rows: rows.length,
        valid_rows: validRows.length,
        error_rows: errorRows.length,
      },
    };
  }

  /**
   * Generate a CSV template with student names and assessment columns pre-filled.
   */
  async generateTemplate(tenantId: string, classId?: string, periodId?: string) {
    // Get students — optionally filtered by class
    let studentFilter: { id?: { in: string[] } } = {};

    if (classId) {
      const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
        tenantId,
        { class_id: classId, status: 'active' },
        { student_id: true },
      )) as Array<{ student_id: string }>;
      const studentIds = enrolments.map((e) => e.student_id);
      studentFilter = { id: { in: studentIds } };
    }

    const students = (await this.studentReadFacade.findManyGeneric(tenantId, {
      where: studentFilter,
      select: { student_number: true, first_name: true, last_name: true },
      orderBy: { last_name: 'asc' },
    })) as Array<{ student_number: string | null; first_name: string; last_name: string }>;

    // Get assessments — optionally filtered by class and period
    const assessmentWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { in: ['draft', 'open'] },
    };
    if (classId) assessmentWhere['class_id'] = classId;
    if (periodId) assessmentWhere['academic_period_id'] = periodId;

    const assessments = await this.prisma.assessment.findMany({
      where: assessmentWhere,
      include: {
        subject: { select: { code: true, name: true } },
      },
      orderBy: [{ subject: { name: 'asc' } }, { title: 'asc' }],
    });

    // Build template rows: one row per student × assessment combination
    const rows: string[][] = [['student_identifier', 'subject_code', 'assessment_title', 'score']];

    for (const student of students) {
      const identifier = student.student_number ?? `${student.first_name} ${student.last_name}`;
      for (const assessment of assessments) {
        const subjectCode = assessment.subject.code ?? assessment.subject.name;
        rows.push([identifier, subjectCode, assessment.title, '']);
      }
    }

    return {
      data: {
        headers: rows[0],
        rows: rows.slice(1),
        csv: rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'),
      },
    };
  }

  /**
   * Validate an XLSX buffer by converting it to CSV format and running the CSV validator.
   */
  async validateXlsx(tenantId: string, xlsxBuffer: Buffer): Promise<CsvValidationResult> {
    const workbook = XLSX.read(xlsxBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException({
        code: 'XLSX_EMPTY',
        message: 'Excel file contains no sheets',
      });
    }
    const sheet = workbook.Sheets[sheetName]!;
    const csvContent = XLSX.utils.sheet_to_csv(sheet);
    return this.validateCsv(tenantId, Buffer.from(csvContent, 'utf-8'));
  }

  /**
   * Process validated import rows.
   * Verifies assessments are draft/open, upserts grades in batches within transaction.
   */
  async processImport(tenantId: string, userId: string, rows: ImportProcessDto['rows']) {
    if (rows.length === 0) {
      throw new BadRequestException({
        code: 'NO_ROWS',
        message: 'No rows to import',
      });
    }

    // 1. Validate all assessments exist and are draft/open
    const assessmentIds = [...new Set(rows.map((r) => r.assessment_id))];
    const assessments = await this.prisma.assessment.findMany({
      where: {
        id: { in: assessmentIds },
        tenant_id: tenantId,
      },
      select: { id: true, status: true, max_score: true },
    });

    const assessmentMap = new Map(assessments.map((a) => [a.id, a]));

    for (const assessmentId of assessmentIds) {
      const assessment = assessmentMap.get(assessmentId);
      if (!assessment) {
        throw new NotFoundException({
          code: 'ASSESSMENT_NOT_FOUND',
          message: `Assessment with id "${assessmentId}" not found`,
        });
      }
      if (assessment.status !== 'draft' && assessment.status !== 'open') {
        throw new ConflictException({
          code: 'ASSESSMENT_NOT_GRADEABLE',
          message: `Assessment "${assessmentId}" has status "${assessment.status}". Must be draft or open.`,
        });
      }
    }

    // 2. Validate scores
    for (const row of rows) {
      const assessment = assessmentMap.get(row.assessment_id);
      if (assessment && row.score > Number(assessment.max_score)) {
        throw new BadRequestException({
          code: 'SCORE_EXCEEDS_MAX',
          message: `Score ${row.score} exceeds max score ${assessment.max_score} for assessment "${row.assessment_id}"`,
        });
      }
      if (row.score < 0) {
        throw new BadRequestException({
          code: 'SCORE_NEGATIVE',
          message: `Score cannot be negative for assessment "${row.assessment_id}"`,
        });
      }
    }

    // 3. Upsert grades in batches within a transaction
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const now = new Date();

    const results = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const upserted = [];

      for (const row of rows) {
        const result = await db.grade.upsert({
          where: {
            idx_grades_unique: {
              tenant_id: tenantId,
              assessment_id: row.assessment_id,
              student_id: row.student_id,
            },
          },
          update: {
            raw_score: row.score,
            is_missing: false,
            entered_by_user_id: userId,
            entered_at: now,
          },
          create: {
            tenant_id: tenantId,
            assessment_id: row.assessment_id,
            student_id: row.student_id,
            raw_score: row.score,
            is_missing: false,
            entered_by_user_id: userId,
            entered_at: now,
          },
        });

        upserted.push(result);
      }

      return upserted;
    })) as { id: string }[];

    return {
      data: results,
      summary: {
        total_imported: results.length,
        assessments_affected: assessmentIds.length,
      },
    };
  }

  /**
   * Parse a single CSV line, handling basic quoting.
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Push the last field
    result.push(current.trim());

    return result;
  }
}
