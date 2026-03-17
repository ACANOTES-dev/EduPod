import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import type { PayslipSnapshotPayload } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import type { PdfBranding } from '../pdf-rendering/pdf-rendering.service';
import { RedisService } from '../redis/redis.service';
import { EncryptionService } from '../configuration/encryption.service';

interface PayslipFilters {
  page: number;
  pageSize: number;
  payroll_run_id?: string;
  staff_profile_id?: string;
}

const PAYSLIP_RENDER_VERSION = '1.0.0';

@Injectable()
export class PayslipsService {
  private readonly logger = new Logger(PayslipsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly redisService: RedisService,
    private readonly encryptionService: EncryptionService,
    @InjectQueue('payroll') private readonly payrollQueue: Queue,
  ) {}

  async listPayslips(tenantId: string, filters: PayslipFilters) {
    const { page, pageSize, payroll_run_id, staff_profile_id } = filters;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (payroll_run_id) {
      where.payroll_entry = { payroll_run_id };
    }
    if (staff_profile_id) {
      where.payroll_entry = {
        ...(where.payroll_entry as Record<string, unknown> | undefined),
        staff_profile_id,
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.payslip.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          payroll_entry: {
            select: {
              id: true,
              payroll_run_id: true,
              staff_profile_id: true,
              compensation_type: true,
              basic_pay: true,
              bonus_pay: true,
              total_pay: true,
              staff_profile: {
                select: {
                  id: true,
                  staff_number: true,
                  user: {
                    select: {
                      first_name: true,
                      last_name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
      this.prisma.payslip.count({ where }),
    ]);

    return {
      data: data.map((p) => this.serializePayslip(p)),
      meta: { page, pageSize, total },
    };
  }

  async getPayslip(tenantId: string, id: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        payroll_entry: {
          select: {
            id: true,
            payroll_run_id: true,
            staff_profile_id: true,
            compensation_type: true,
            basic_pay: true,
            bonus_pay: true,
            total_pay: true,
            staff_profile: {
              select: {
                id: true,
                staff_number: true,
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!payslip) {
      throw new NotFoundException({
        code: 'PAYSLIP_NOT_FOUND',
        message: `Payslip with id "${id}" not found`,
      });
    }

    return this.serializePayslip(payslip);
  }

  async renderPayslipPdf(tenantId: string, payslipId: string, locale?: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id: payslipId, tenant_id: tenantId },
    });

    if (!payslip) {
      throw new NotFoundException({
        code: 'PAYSLIP_NOT_FOUND',
        message: `Payslip with id "${payslipId}" not found`,
      });
    }

    const snapshot = payslip.snapshot_payload_json as unknown as PayslipSnapshotPayload;
    const renderLocale = locale ?? payslip.template_locale;

    const branding: PdfBranding = {
      school_name: snapshot.school.name,
      school_name_ar: snapshot.school.name_ar ?? undefined,
      logo_url: snapshot.school.logo_url ?? undefined,
    };

    return this.pdfRenderingService.renderPdf(
      'payslip',
      renderLocale,
      snapshot,
      branding,
    );
  }

  async generatePayslipsForRun(
    tenantId: string,
    runId: string,
    userId: string,
    db: unknown,
  ) {
    const prismaDb = db as unknown as PrismaService;

    // Get the run with entries
    const run = await prismaDb.payrollRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      include: {
        entries: {
          include: {
            staff_profile: {
              include: {
                user: {
                  select: {
                    first_name: true,
                    last_name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'PAYROLL_RUN_NOT_FOUND',
        message: `Payroll run with id "${runId}" not found`,
      });
    }

    // Get branding
    const branding = await prismaDb.tenantBranding.findUnique({
      where: { tenant_id: tenantId },
    });

    // Get tenant for currency
    const tenant = await prismaDb.tenant.findUnique({
      where: { id: tenantId },
    });

    // Get payslip prefix from branding
    const payslipPrefix = branding?.payslip_prefix ?? 'PSL';

    // Generate sequence numbers using FOR UPDATE
    const rawTx = db as unknown as {
      $queryRaw: (sql: Prisma.Sql) => Promise<unknown[]>;
      $executeRaw: (sql: Prisma.Sql) => Promise<number>;
    };

    const seqRows = (await rawTx.$queryRaw(
      Prisma.sql`SELECT current_value FROM tenant_sequences WHERE tenant_id = ${tenantId}::uuid AND sequence_type = 'payslip' FOR UPDATE`,
    )) as Array<{ current_value: bigint }>;

    let currentSeqValue = seqRows.length > 0 ? Number((seqRows[0] as { current_value: bigint }).current_value) : 0;
    const entriesToProcess = run.entries;
    const newSeqValue = currentSeqValue + entriesToProcess.length;

    await rawTx.$executeRaw(
      Prisma.sql`UPDATE tenant_sequences SET current_value = ${newSeqValue} WHERE tenant_id = ${tenantId}::uuid AND sequence_type = 'payslip'`,
    );

    const now = new Date();
    const yearMonth = `${run.period_year}${String(run.period_month).padStart(2, '0')}`;

    const payslips: Array<Record<string, unknown>> = [];

    for (const entry of entriesToProcess) {
      currentSeqValue++;
      const paddedSeq = String(currentSeqValue).padStart(6, '0');
      const payslipNumber = `${payslipPrefix}-${yearMonth}-${paddedSeq}`;

      // Build bank detail snippet (last 4 chars only)
      let bankAccountLast4: string | null = null;
      let bankIbanLast4: string | null = null;

      if (entry.staff_profile.bank_account_number_encrypted && entry.staff_profile.bank_encryption_key_ref) {
        try {
          const decrypted = this.encryptionService.decrypt(
            entry.staff_profile.bank_account_number_encrypted,
            entry.staff_profile.bank_encryption_key_ref,
          );
          bankAccountLast4 = decrypted.length > 4 ? decrypted.slice(-4) : decrypted;
        } catch {
          this.logger.warn(`Failed to decrypt bank account for staff ${entry.staff_profile_id}`);
          bankAccountLast4 = null;
        }
      }

      if (entry.staff_profile.bank_iban_encrypted && entry.staff_profile.bank_encryption_key_ref) {
        try {
          const decrypted = this.encryptionService.decrypt(
            entry.staff_profile.bank_iban_encrypted,
            entry.staff_profile.bank_encryption_key_ref,
          );
          bankIbanLast4 = decrypted.length > 4 ? decrypted.slice(-4) : decrypted;
        } catch {
          this.logger.warn(`Failed to decrypt bank IBAN for staff ${entry.staff_profile_id}`);
          bankIbanLast4 = null;
        }
      }

      const snapshotPayload: PayslipSnapshotPayload = {
        staff: {
          full_name: `${entry.staff_profile.user.first_name} ${entry.staff_profile.user.last_name}`,
          staff_number: entry.staff_profile.staff_number,
          department: entry.staff_profile.department,
          job_title: entry.staff_profile.job_title,
          employment_type: entry.staff_profile.employment_type,
          bank_name: entry.staff_profile.bank_name,
          bank_account_last4: bankAccountLast4,
          bank_iban_last4: bankIbanLast4,
        },
        period: {
          label: run.period_label,
          month: run.period_month,
          year: run.period_year,
          total_working_days: run.total_working_days,
        },
        compensation: {
          type: entry.compensation_type as 'salaried' | 'per_class',
          base_salary: entry.snapshot_base_salary !== null ? Number(entry.snapshot_base_salary) : null,
          per_class_rate: entry.snapshot_per_class_rate !== null ? Number(entry.snapshot_per_class_rate) : null,
          assigned_class_count: entry.snapshot_assigned_class_count,
          bonus_class_rate: entry.snapshot_bonus_class_rate !== null ? Number(entry.snapshot_bonus_class_rate) : null,
          bonus_day_multiplier: entry.snapshot_bonus_day_multiplier !== null ? Number(entry.snapshot_bonus_day_multiplier) : null,
        },
        inputs: {
          days_worked: entry.days_worked,
          classes_taught: entry.classes_taught,
        },
        calculations: {
          basic_pay: Number(entry.basic_pay),
          bonus_pay: Number(entry.bonus_pay),
          total_pay: Number(entry.total_pay),
        },
        school: {
          name: branding?.school_name_display ?? tenant?.name ?? 'School',
          name_ar: branding?.school_name_ar ?? null,
          logo_url: branding?.logo_url ?? null,
          currency_code: tenant?.currency_code ?? 'SAR',
        },
      };

      const payslip = await prismaDb.payslip.create({
        data: {
          tenant_id: tenantId,
          payroll_entry_id: entry.id,
          payslip_number: payslipNumber,
          template_locale: 'en',
          issued_at: now,
          issued_by_user_id: userId,
          snapshot_payload_json: snapshotPayload as unknown as Prisma.InputJsonValue,
          render_version: PAYSLIP_RENDER_VERSION,
        },
      });

      payslips.push(payslip);
    }

    return payslips;
  }

  async triggerMassExport(tenantId: string, runId: string, locale: string, userId: string) {
    const redisKey = `payroll:mass-export:${tenantId}:${runId}`;
    const redis = this.redisService.getClient();

    await redis.set(redisKey, JSON.stringify({ status: 'queued', started_at: new Date().toISOString() }), 'EX', 3600);

    await this.payrollQueue.add('payroll:mass-export', {
      tenant_id: tenantId,
      run_id: runId,
      locale,
      user_id: userId,
    });

    return { status: 'queued', run_id: runId };
  }

  async getMassExportStatus(tenantId: string, runId: string) {
    const redisKey = `payroll:mass-export:${tenantId}:${runId}`;
    const redis = this.redisService.getClient();
    const data = await redis.get(redisKey);

    if (!data) {
      return { status: 'not_found' };
    }

    return JSON.parse(data) as Record<string, unknown>;
  }

  private serializePayslip(payslip: Record<string, unknown>): Record<string, unknown> {
    const serialized: Record<string, unknown> = { ...payslip };

    if (serialized['payroll_entry']) {
      const entry = { ...(serialized['payroll_entry'] as Record<string, unknown>) };
      const decimalFields = ['basic_pay', 'bonus_pay', 'total_pay'];
      for (const field of decimalFields) {
        if (entry[field] !== null && entry[field] !== undefined) {
          entry[field] = Number(entry[field]);
        }
      }
      serialized['payroll_entry'] = entry;
    }

    return serialized;
  }
}
