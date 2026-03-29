import { createHash } from 'crypto';

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import type { DesFileType } from '@school/shared';
import { DES_FILE_TYPES } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import type { DesColumnDef, DesFileExporter, DesFileRow } from './adapters/des-file-exporter.interface';
import { DES_FILE_EXPORTER } from './adapters/des-file-exporter.interface';
import { RegulatorySubmissionService } from './regulatory-submission.service';

// ─── Validation Error Shape ──────────────────────────────────────────────────

export interface ValidationError {
  row_index: number;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

// ─── Readiness Category ──────────────────────────────────────────────────────

export interface ReadinessCategory {
  name: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: { total: number; valid: number; issues: number };
}

// ─── Column Definitions per File Type ────────────────────────────────────────

const FILE_A_COLUMNS: DesColumnDef[] = [
  { header: 'Teacher Number', field: 'teacher_number' },
  { header: 'First Name', field: 'first_name' },
  { header: 'Last Name', field: 'last_name' },
  { header: 'Employment Type', field: 'employment_type' },
  { header: 'Job Title', field: 'job_title' },
];

const FILE_C_COLUMNS: DesColumnDef[] = [
  { header: 'Class Name', field: 'class_name' },
  { header: 'Year Group', field: 'year_group' },
  { header: 'Max Capacity', field: 'max_capacity' },
  { header: 'Enrolment Count', field: 'enrolment_count' },
];

const FILE_D_COLUMNS: DesColumnDef[] = [
  { header: 'Subject Name', field: 'subject_name' },
  { header: 'DES Code', field: 'des_code' },
  { header: 'DES Name', field: 'des_name' },
  { header: 'DES Level', field: 'des_level' },
];

const FILE_E_COLUMNS: DesColumnDef[] = [
  { header: 'PPSN', field: 'ppsn' },
  { header: 'First Name', field: 'first_name' },
  { header: 'Last Name', field: 'last_name' },
  { header: 'Date of Birth', field: 'date_of_birth' },
  { header: 'Gender', field: 'gender' },
  { header: 'Nationality', field: 'nationality' },
  { header: 'Entry Date', field: 'entry_date' },
];

const FORM_TL_COLUMNS: DesColumnDef[] = [
  { header: 'Teacher Name', field: 'teacher_name' },
  { header: 'Subject Name', field: 'subject_name' },
  { header: 'DES Code', field: 'des_code' },
  { header: 'Weekly Hours', field: 'weekly_hours' },
];

// ─── PPSN Regex ──────────────────────────────────────────────────────────────

const PPSN_REGEX = /^\d{7}[A-Za-z]{1,2}$/;

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class RegulatoryDesService {
  private readonly logger = new Logger(RegulatoryDesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly submissionService: RegulatorySubmissionService,
    @Inject(DES_FILE_EXPORTER) private readonly exporter: DesFileExporter,
  ) {}

  // ─── Check Readiness ─────────────────────────────────────────────────────────

  async checkReadiness(tenantId: string, academicYear: string) {
    const categories: ReadinessCategory[] = [];

    // Staff data check
    const staffTotal = await this.prisma.staffProfile.count({
      where: { tenant_id: tenantId },
    });
    const staffWithUser = await this.prisma.staffProfile.count({
      where: {
        tenant_id: tenantId,
        user_id: { not: undefined },
        employment_type: { not: undefined },
      },
    });
    const staffIssues = staffTotal - staffWithUser;
    categories.push({
      name: 'staff_data',
      status: staffTotal === 0 ? 'fail' : staffIssues > 0 ? 'warning' : 'pass',
      message:
        staffTotal === 0
          ? 'No staff profiles found'
          : staffIssues > 0
            ? `${staffIssues} staff profile(s) missing user link or employment type`
            : `${staffTotal} staff profile(s) ready`,
      details: { total: staffTotal, valid: staffWithUser, issues: staffIssues },
    });

    // Class data check
    const academicYearRecord = await this.findAcademicYear(tenantId, academicYear);
    const classTotal = academicYearRecord
      ? await this.prisma.class.count({
          where: { tenant_id: tenantId, academic_year_id: academicYearRecord.id },
        })
      : 0;
    const classesWithEnrolments = academicYearRecord
      ? await this.prisma.class.count({
          where: {
            tenant_id: tenantId,
            academic_year_id: academicYearRecord.id,
            class_enrolments: { some: { status: 'active' } },
          },
        })
      : 0;
    const classIssues = classTotal - classesWithEnrolments;
    categories.push({
      name: 'class_data',
      status: classTotal === 0 ? 'fail' : classIssues > 0 ? 'warning' : 'pass',
      message:
        classTotal === 0
          ? 'No classes found for this academic year'
          : classIssues > 0
            ? `${classIssues} class(es) have no active enrolments`
            : `${classTotal} class(es) with active enrolments`,
      details: { total: classTotal, valid: classesWithEnrolments, issues: classIssues },
    });

    // Subject mappings check
    const subjectTotal = await this.prisma.subject.count({
      where: { tenant_id: tenantId, active: true },
    });
    const subjectsWithMapping = await this.prisma.subject.count({
      where: {
        tenant_id: tenantId,
        active: true,
        reg_des_code_mappings: { some: {} },
      },
    });
    const subjectIssues = subjectTotal - subjectsWithMapping;
    categories.push({
      name: 'subject_mappings',
      status: subjectTotal === 0 ? 'fail' : subjectIssues > 0 ? 'warning' : 'pass',
      message:
        subjectTotal === 0
          ? 'No active subjects found'
          : subjectIssues > 0
            ? `${subjectIssues} active subject(s) missing DES code mapping`
            : `All ${subjectTotal} active subject(s) have DES code mappings`,
      details: { total: subjectTotal, valid: subjectsWithMapping, issues: subjectIssues },
    });

    // Student data check
    const studentTotal = await this.prisma.student.count({
      where: { tenant_id: tenantId, status: 'active' },
    });
    const studentsValid = await this.prisma.student.count({
      where: {
        tenant_id: tenantId,
        status: 'active',
        national_id: { not: null },
        date_of_birth: { not: undefined },
        gender: { not: null },
      },
    });
    const studentIssues = studentTotal - studentsValid;
    categories.push({
      name: 'student_data',
      status: studentTotal === 0 ? 'fail' : studentIssues > 0 ? 'warning' : 'pass',
      message:
        studentTotal === 0
          ? 'No active students found'
          : studentIssues > 0
            ? `${studentIssues} active student(s) missing PPSN, date of birth, or gender`
            : `All ${studentTotal} active student(s) have required fields`,
      details: { total: studentTotal, valid: studentsValid, issues: studentIssues },
    });

    // Schedule data check
    const scheduleTotal = academicYearRecord
      ? await this.prisma.schedule.count({
          where: { tenant_id: tenantId, academic_year_id: academicYearRecord.id },
        })
      : 0;
    categories.push({
      name: 'schedule_data',
      status: scheduleTotal === 0 ? 'fail' : 'pass',
      message:
        scheduleTotal === 0
          ? 'No schedules found for this academic year'
          : `${scheduleTotal} schedule(s) found`,
      details: { total: scheduleTotal, valid: scheduleTotal, issues: 0 },
    });

    const ready = categories.every((c) => c.status === 'pass');

    return { ready, academic_year: academicYear, categories };
  }

  // ─── Preview File ────────────────────────────────────────────────────────────

  async previewFile(tenantId: string, fileType: DesFileType, academicYear: string) {
    this.validateFileType(fileType);

    const rawRows = await this.collectRows(tenantId, fileType, academicYear);
    const validationErrors = this.validateRows(fileType, rawRows);
    const { columns, rows } = this.formatRows(fileType, rawRows);
    const previewColumns = columns.map((column) => column.header);
    const sampleRows = rows.slice(0, 10);

    return {
      file_type: fileType,
      academic_year: academicYear,
      columns: previewColumns,
      column_defs: columns,
      sample_rows: sampleRows,
      rows,
      row_count: rows.length,
      record_count: rows.length,
      validation_warnings: validationErrors,
      validation_errors: validationErrors,
    };
  }

  // ─── Generate File ───────────────────────────────────────────────────────────

  async generateFile(tenantId: string, userId: string, fileType: DesFileType, academicYear: string) {
    this.validateFileType(fileType);

    const rawRows = await this.collectRows(tenantId, fileType, academicYear);
    const validationErrors = this.validateRows(fileType, rawRows);
    const { columns, rows } = this.formatRows(fileType, rawRows);

    const result = this.exporter.export(fileType, rows, columns);
    const generatedAt = new Date().toISOString();

    const s3Key = `regulatory/des/${academicYear}/${result.filename}`;
    await this.s3Service.upload(tenantId, s3Key, result.content, result.content_type);

    const fileHash = createHash('md5').update(result.content).digest('hex');

    const submission = (await this.submissionService.create(tenantId, userId, {
      domain: 'des_september_returns',
      submission_type: fileType,
      academic_year: academicYear,
      status: 'in_progress',
      record_count: result.record_count,
    })) as { id: string };

    await this.submissionService.update(tenantId, submission.id, userId, {
      file_key: `${tenantId}/${s3Key}`,
      file_hash: fileHash,
      validation_errors: validationErrors.length > 0 ? validationErrors : null,
    });

    this.logger.log(
      `Generated DES ${fileType} for tenant ${tenantId}, academic year ${academicYear}: ${result.record_count} records`,
    );

    return {
      submission_id: submission.id,
      file_type: fileType,
      academic_year: academicYear,
      row_count: result.record_count,
      record_count: result.record_count,
      csv_content: result.content.toString('utf-8'),
      generated_at: generatedAt,
      file_key: `${tenantId}/${s3Key}`,
      file_hash: fileHash,
      validation_warnings: validationErrors,
      validation_errors: validationErrors,
    };
  }

  // ─── Private: Validate File Type ───────────────────────────────────────────

  private validateFileType(fileType: DesFileType): void {
    if (!DES_FILE_TYPES.includes(fileType)) {
      throw new BadRequestException({
        code: 'INVALID_DES_FILE_TYPE',
        message: `Invalid DES file type: "${fileType}"`,
      });
    }
    if (fileType === 'file_b') {
      throw new BadRequestException({
        code: 'DES_FILE_B_NOT_IMPLEMENTED',
        message: 'DES File B generation is not yet implemented',
      });
    }
  }

  // ─── Private: Route to Collect Method ──────────────────────────────────────

  private async collectRows(
    tenantId: string,
    fileType: DesFileType,
    academicYear: string,
  ): Promise<unknown[]> {
    switch (fileType) {
      case 'file_a':
        return this.collectFileA(tenantId, academicYear);
      case 'file_c':
        return this.collectFileC(tenantId, academicYear);
      case 'file_d':
        return this.collectFileD(tenantId, academicYear);
      case 'file_e':
        return this.collectFileE(tenantId, academicYear);
      case 'form_tl':
        return this.collectFormTl(tenantId, academicYear);
      default:
        return [];
    }
  }

  // ─── Private: Collect File A (Staff) ───────────────────────────────────────

  private async collectFileA(tenantId: string, _academicYear: string) {
    return this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId },
      include: {
        user: { select: { first_name: true, last_name: true } },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  // ─── Private: Collect File C (Classes) ─────────────────────────────────────

  private async collectFileC(tenantId: string, academicYear: string) {
    const academicYearRecord = await this.findAcademicYear(tenantId, academicYear);
    if (!academicYearRecord) return [];

    return this.prisma.class.findMany({
      where: { tenant_id: tenantId, academic_year_id: academicYearRecord.id },
      include: {
        year_group: { select: { name: true } },
        _count: { select: { class_enrolments: { where: { status: 'active' } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Private: Collect File D (Subjects with DES Mappings) ──────────────────

  private async collectFileD(tenantId: string, _academicYear: string) {
    return this.prisma.subject.findMany({
      where: {
        tenant_id: tenantId,
        active: true,
        reg_des_code_mappings: { some: {} },
      },
      include: {
        reg_des_code_mappings: {
          select: { des_code: true, des_name: true, des_level: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Private: Collect File E (Students) ────────────────────────────────────

  private async collectFileE(tenantId: string, _academicYear: string) {
    return this.prisma.student.findMany({
      where: { tenant_id: tenantId, status: 'active' },
      select: {
        national_id: true,
        first_name: true,
        last_name: true,
        date_of_birth: true,
        gender: true,
        nationality: true,
        entry_date: true,
      },
      orderBy: { last_name: 'asc' },
    });
  }

  // ─── Private: Collect Form TL (Teaching Loads) ─────────────────────────────

  private async collectFormTl(tenantId: string, academicYear: string) {
    const academicYearRecord = await this.findAcademicYear(tenantId, academicYear);
    if (!academicYearRecord) return [];

    const schedules = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearRecord.id,
        teacher_staff_id: { not: null },
      },
      include: {
        teacher: {
          include: {
            user: { select: { first_name: true, last_name: true } },
          },
        },
        class_entity: {
          include: {
            subject: {
              include: {
                reg_des_code_mappings: {
                  select: { des_code: true },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    // Group by teacher + subject to calculate weekly hours
    const loadMap = new Map<string, {
      teacher_name: string;
      subject_name: string;
      des_code: string | null;
      total_minutes: number;
    }>();

    for (const schedule of schedules) {
      const teacher = schedule.teacher;
      if (!teacher) continue;

      const subject = schedule.class_entity.subject;
      if (!subject) continue;

      const key = `${teacher.id}::${subject.id}`;
      const startMinutes = schedule.start_time.getHours() * 60 + schedule.start_time.getMinutes();
      const endMinutes = schedule.end_time.getHours() * 60 + schedule.end_time.getMinutes();
      const durationMinutes = endMinutes - startMinutes;

      const desMapping = subject.reg_des_code_mappings[0];

      const existing = loadMap.get(key);
      if (existing) {
        existing.total_minutes += durationMinutes;
      } else {
        loadMap.set(key, {
          teacher_name: `${teacher.user.first_name} ${teacher.user.last_name}`,
          subject_name: subject.name,
          des_code: desMapping?.des_code ?? null,
          total_minutes: durationMinutes,
        });
      }
    }

    return Array.from(loadMap.values());
  }

  // ─── Private: Validate Rows ────────────────────────────────────────────────

  private validateRows(fileType: DesFileType, rows: unknown[]): ValidationError[] {
    const errors: ValidationError[] = [];

    switch (fileType) {
      case 'file_a':
        this.validateFileARows(rows, errors);
        break;
      case 'file_c':
        this.validateFileCRows(rows, errors);
        break;
      case 'file_d':
        this.validateFileDRows(rows, errors);
        break;
      case 'file_e':
        this.validateFileERows(rows, errors);
        break;
      case 'form_tl':
        this.validateFormTlRows(rows, errors);
        break;
    }

    return errors;
  }

  private validateFileARows(
    rows: unknown[],
    errors: ValidationError[],
  ): void {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const user = row.user as Record<string, string> | null;
      if (!user?.first_name) {
        errors.push({ row_index: i, field: 'first_name', message: 'Staff member missing first name', severity: 'error' });
      }
      if (!user?.last_name) {
        errors.push({ row_index: i, field: 'last_name', message: 'Staff member missing last name', severity: 'error' });
      }
    }
  }

  private validateFileCRows(
    rows: unknown[],
    errors: ValidationError[],
  ): void {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      if (!row.name) {
        errors.push({ row_index: i, field: 'name', message: 'Class missing name', severity: 'error' });
      }
      if (!row.year_group) {
        errors.push({ row_index: i, field: 'year_group', message: 'Class missing year group', severity: 'warning' });
      }
    }
  }

  private validateFileDRows(
    rows: unknown[],
    errors: ValidationError[],
  ): void {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const mappings = row.reg_des_code_mappings as Array<Record<string, string>> | undefined;
      const firstMapping = mappings?.[0];
      if (!firstMapping?.des_code) {
        errors.push({ row_index: i, field: 'des_code', message: 'Subject missing DES code', severity: 'error' });
      }
    }
  }

  private validateFileERows(
    rows: unknown[],
    errors: ValidationError[],
  ): void {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      const ppsn = row.national_id as string | null;
      if (!ppsn) {
        errors.push({ row_index: i, field: 'ppsn', message: 'Student missing PPSN', severity: 'error' });
      } else if (!PPSN_REGEX.test(ppsn)) {
        errors.push({ row_index: i, field: 'ppsn', message: `Invalid PPSN format: "${ppsn}"`, severity: 'error' });
      }
      if (!row.date_of_birth) {
        errors.push({ row_index: i, field: 'date_of_birth', message: 'Student missing date of birth', severity: 'error' });
      }
      if (!row.gender) {
        errors.push({ row_index: i, field: 'gender', message: 'Student missing gender', severity: 'error' });
      }
    }
  }

  private validateFormTlRows(
    rows: unknown[],
    errors: ValidationError[],
  ): void {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      if (!row.teacher_name) {
        errors.push({ row_index: i, field: 'teacher_name', message: 'Teaching load missing teacher name', severity: 'error' });
      }
      if (!row.des_code) {
        errors.push({ row_index: i, field: 'des_code', message: 'Teaching load missing DES code for subject', severity: 'warning' });
      }
      const totalMinutes = row.total_minutes as number | undefined;
      if (!totalMinutes || totalMinutes <= 0) {
        errors.push({ row_index: i, field: 'weekly_hours', message: 'Teaching load has zero or negative hours', severity: 'error' });
      }
    }
  }

  // ─── Private: Format Rows ──────────────────────────────────────────────────

  private formatRows(
    fileType: DesFileType,
    rawRows: unknown[],
  ): { columns: DesColumnDef[]; rows: DesFileRow[] } {
    switch (fileType) {
      case 'file_a':
        return { columns: FILE_A_COLUMNS, rows: this.formatFileARows(rawRows) };
      case 'file_c':
        return { columns: FILE_C_COLUMNS, rows: this.formatFileCRows(rawRows) };
      case 'file_d':
        return { columns: FILE_D_COLUMNS, rows: this.formatFileDRows(rawRows) };
      case 'file_e':
        return { columns: FILE_E_COLUMNS, rows: this.formatFileERows(rawRows) };
      case 'form_tl':
        return { columns: FORM_TL_COLUMNS, rows: this.formatFormTlRows(rawRows) };
      default:
        return { columns: [], rows: [] };
    }
  }

  private formatFileARows(rawRows: unknown[]): DesFileRow[] {
    return rawRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const user = row.user as Record<string, string> | null;
      return {
        teacher_number: (row.staff_number as string | null) ?? null,
        first_name: user?.first_name ?? null,
        last_name: user?.last_name ?? null,
        employment_type: (row.employment_type as string | null) ?? null,
        job_title: (row.job_title as string | null) ?? null,
      };
    });
  }

  private formatFileCRows(rawRows: unknown[]): DesFileRow[] {
    return rawRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const yearGroup = row.year_group as Record<string, string> | null;
      const count = row._count as Record<string, number> | undefined;
      return {
        class_name: (row.name as string | null) ?? null,
        year_group: yearGroup?.name ?? null,
        max_capacity: (row.max_capacity as number | null) ?? null,
        enrolment_count: count?.class_enrolments ?? 0,
      };
    });
  }

  private formatFileDRows(rawRows: unknown[]): DesFileRow[] {
    return rawRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const mappings = row.reg_des_code_mappings as Array<Record<string, string | null>> | undefined;
      const mapping = mappings?.[0];
      return {
        subject_name: (row.name as string | null) ?? null,
        des_code: mapping?.des_code ?? null,
        des_name: mapping?.des_name ?? null,
        des_level: mapping?.des_level ?? null,
      };
    });
  }

  private formatFileERows(rawRows: unknown[]): DesFileRow[] {
    return rawRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const dob = row.date_of_birth as Date | null;
      const entryDate = row.entry_date as Date | null;
      return {
        ppsn: (row.national_id as string | null) ?? null,
        first_name: (row.first_name as string | null) ?? null,
        last_name: (row.last_name as string | null) ?? null,
        date_of_birth: dob ? (dob.toISOString().split('T')[0] ?? null) : null,
        gender: (row.gender as string | null) ?? null,
        nationality: (row.nationality as string | null) ?? null,
        entry_date: entryDate ? (entryDate.toISOString().split('T')[0] ?? null) : null,
      };
    });
  }

  private formatFormTlRows(rawRows: unknown[]): DesFileRow[] {
    return rawRows.map((raw) => {
      const row = raw as Record<string, unknown>;
      const totalMinutes = (row.total_minutes as number) ?? 0;
      const weeklyHours = Math.round((totalMinutes / 60) * 100) / 100;
      return {
        teacher_name: (row.teacher_name as string | null) ?? null,
        subject_name: (row.subject_name as string | null) ?? null,
        des_code: (row.des_code as string | null) ?? null,
        weekly_hours: weeklyHours,
      };
    });
  }

  // ─── Private: Find Academic Year ───────────────────────────────────────────

  private async findAcademicYear(tenantId: string, academicYear: string) {
    return this.prisma.academicYear.findFirst({
      where: { tenant_id: tenantId, name: academicYear },
    });
  }
}
