import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ImportFilterDto, ImportType } from '@school/shared';
import type { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

const TEMPLATE_HEADERS: Record<ImportType, string> = {
  students: 'first_name,last_name,student_number,date_of_birth,year_group_name,gender,nationality',
  parents: 'first_name,last_name,email,phone,household_name',
  staff: 'first_name,last_name,email,job_title,department,employment_type',
  fees: 'fee_structure_name,household_name,amount',
  exam_results: 'student_number,subject_name,score,grade',
  staff_compensation: 'staff_number,compensation_type,base_salary,per_class_rate',
};

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    @InjectQueue('imports') private readonly importsQueue: Queue,
  ) {}

  /**
   * Upload a CSV file to S3 and create an import_job record.
   * Enqueues an `imports:validate` job for async validation.
   */
  async upload(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    importType: ImportType,
  ) {
    // Create the job record first to get the ID
    const job = await this.prisma.importJob.create({
      data: {
        tenant_id: tenantId,
        import_type: importType,
        status: 'uploaded',
        created_by_user_id: userId,
        summary_json: {},
      },
    });

    // Upload CSV to S3 at {tenantId}/imports/{jobId}.csv
    const s3Key = `imports/${job.id}.csv`;
    const fullKey = await this.s3Service.upload(
      tenantId,
      s3Key,
      fileBuffer,
      'text/csv',
    );

    // Update the job with the file key
    const updatedJob = await this.prisma.importJob.update({
      where: { id: job.id },
      data: { file_key: fullKey },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    // Enqueue validation job
    await this.importsQueue.add('imports:validate', {
      tenant_id: tenantId,
      job_id: job.id,
    });

    this.logger.log(
      `Import job ${job.id} created for tenant ${tenantId}, type=${importType}, file=${fileName}`,
    );

    return this.serializeJob(updatedJob);
  }

  /**
   * Paginated list of import jobs with optional status filter.
   */
  async list(tenantId: string, filters: ImportFilterDto) {
    const { page, pageSize, status } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };
    if (status) {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      this.prisma.importJob.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          created_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.importJob.count({ where }),
    ]);

    return {
      data: data.map((j) => this.serializeJob(j)),
      meta: { page, pageSize, total },
    };
  }

  /**
   * Get a single import job with full summary.
   */
  async get(tenantId: string, jobId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenant_id: tenantId },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'IMPORT_JOB_NOT_FOUND',
        message: `Import job with id "${jobId}" not found`,
      });
    }

    return this.serializeJob(job);
  }

  /**
   * Confirm a validated import job for processing.
   * Validates status is 'validated' and not all rows failed.
   * Sets status to 'processing' and enqueues the process job.
   */
  async confirm(tenantId: string, jobId: string) {
    const job = await this.prisma.importJob.findFirst({
      where: { id: jobId, tenant_id: tenantId },
    });

    if (!job) {
      throw new NotFoundException({
        code: 'IMPORT_JOB_NOT_FOUND',
        message: `Import job with id "${jobId}" not found`,
      });
    }

    if (job.status !== 'validated') {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_STATUS',
        message: `Import job must be in "validated" status to confirm. Current status: "${job.status}"`,
      });
    }

    // Check that not all rows have errors (failed === total_rows means nothing to import)
    const summary = job.summary_json as Record<string, unknown>;
    const totalRows = typeof summary['total_rows'] === 'number' ? summary['total_rows'] : 0;
    const failedRows = typeof summary['failed'] === 'number' ? summary['failed'] : 0;

    if (totalRows > 0 && failedRows >= totalRows) {
      throw new BadRequestException({
        code: 'ALL_ROWS_FAILED',
        message: 'All rows have validation errors. Fix the CSV and re-upload.',
      });
    }

    // Update status to processing
    const updatedJob = await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'processing' },
      include: {
        created_by: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });

    // Enqueue processing job
    await this.importsQueue.add('imports:process', {
      tenant_id: tenantId,
      job_id: jobId,
    });

    this.logger.log(`Import job ${jobId} confirmed for processing`);

    return this.serializeJob(updatedJob);
  }

  /**
   * Return CSV template string with headers for the given import type.
   */
  getTemplate(importType: ImportType): string {
    const headers = TEMPLATE_HEADERS[importType];
    if (!headers) {
      throw new BadRequestException({
        code: 'INVALID_IMPORT_TYPE',
        message: `Unknown import type: "${importType}"`,
      });
    }
    // Return headers row followed by a newline (ready for data entry)
    return headers + '\n';
  }

  private serializeJob(job: Record<string, unknown>): Record<string, unknown> {
    return { ...job };
  }
}
