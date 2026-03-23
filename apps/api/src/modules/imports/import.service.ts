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

import { ImportValidationService } from './import-validation.service';

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    @InjectQueue('imports') private readonly importsQueue: Queue,
    private readonly importValidationService: ImportValidationService,
  ) {}

  /**
   * Upload a CSV or XLSX file to S3 and create an import_job record.
   * Enqueues an `imports:validate` job for async validation.
   */
  async upload(
    tenantId: string,
    userId: string,
    fileBuffer: Buffer,
    fileName: string,
    importType: ImportType,
  ) {
    // Determine file extension for S3 key and mime type
    const ext = fileName.toLowerCase().endsWith('.xlsx') ? 'xlsx' : 'csv';
    const mimeType = ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

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

    // Upload file to S3 at {tenantId}/imports/{jobId}.{ext}
    const s3Key = `imports/${job.id}.${ext}`;
    const fullKey = await this.s3Service.upload(
      tenantId,
      s3Key,
      fileBuffer,
      mimeType,
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

    this.logger.log(
      `Import job ${job.id} created for tenant ${tenantId}, type=${importType}, file=${fileName}`,
    );

    // Run validation inline (faster than waiting for worker to pick up BullMQ job)
    this.importValidationService.validate(tenantId, job.id).catch((err) => {
      this.logger.error(`Inline validation failed for job ${job.id}: ${err instanceof Error ? err.message : String(err)}`);
    });

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
        message: 'All rows have validation errors. Fix the file and re-upload.',
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
      import_job_id: jobId,
    });

    this.logger.log(`Import job ${jobId} confirmed for processing`);

    return this.serializeJob(updatedJob);
  }

  private serializeJob(job: Record<string, unknown>): Record<string, unknown> {
    return { ...job };
  }
}
