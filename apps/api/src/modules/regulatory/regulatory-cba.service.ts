import { Injectable } from '@nestjs/common';
import { CbaSyncStatus } from '@prisma/client';
import { CBA_GRADE_DESCRIPTORS } from '@school/shared';
import type { CbaSyncDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CbaStatusSummary {
  academic_year: string;
  total: number;
  pending: number;
  synced: number;
  errors: number;
  last_synced_at: Date | null;
}

interface SyncResult {
  synced_count: number;
  error_count: number;
  errors: Array<{ record_id: string; student_id: string; error: string }>;
}

type CbaDescriptor = (typeof CBA_GRADE_DESCRIPTORS)[number] | null;

@Injectable()
export class RegulatoryCbaService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get CBA Status ──────────────────────────────────────────────────────────

  async getCbaStatus(tenantId: string, academicYear: string): Promise<CbaStatusSummary> {
    const groups = await this.prisma.ppodCbaSyncRecord.groupBy({
      by: ['sync_status'],
      where: { tenant_id: tenantId, academic_year: academicYear },
      _count: true,
    });

    let pending = 0;
    let synced = 0;
    let errors = 0;

    for (const group of groups) {
      switch (group.sync_status) {
        case CbaSyncStatus.cba_pending:
          pending = group._count;
          break;
        case CbaSyncStatus.cba_synced:
          synced = group._count;
          break;
        case CbaSyncStatus.cba_error:
          errors = group._count;
          break;
      }
    }

    const lastSynced = await this.prisma.ppodCbaSyncRecord.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year: academicYear,
        sync_status: CbaSyncStatus.cba_synced,
      },
      orderBy: { synced_at: 'desc' },
      select: { synced_at: true },
    });

    return {
      academic_year: academicYear,
      total: pending + synced + errors,
      pending,
      synced,
      errors,
      last_synced_at: lastSynced?.synced_at ?? null,
    };
  }

  // ─── Get Pending Results ──────────────────────────────────────────────────────

  async getPendingResults(tenantId: string, academicYear: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    const where = {
      tenant_id: tenantId,
      academic_year: academicYear,
      sync_status: CbaSyncStatus.cba_pending,
    };

    const [data, total] = await Promise.all([
      this.prisma.ppodCbaSyncRecord.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true, student_number: true },
          },
        },
      }),
      this.prisma.ppodCbaSyncRecord.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Sync Export (Bulk) ───────────────────────────────────────────────────────

  async syncExport(tenantId: string, _userId: string, dto: CbaSyncDto): Promise<SyncResult> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
        academic_year: dto.academic_year,
        sync_status: CbaSyncStatus.cba_pending,
      };
      if (dto.subject_id) where.subject_id = dto.subject_id;

      const pendingRecords = await db.ppodCbaSyncRecord.findMany({ where });

      return this.processRecords(db, pendingRecords, tenantId);
    });

    return result as SyncResult;
  }

  // ─── Sync Single Student ─────────────────────────────────────────────────────

  async syncStudent(
    tenantId: string,
    studentId: string,
    dto: CbaSyncDto,
    _userId: string,
  ): Promise<SyncResult> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const pendingRecords = await db.ppodCbaSyncRecord.findMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          academic_year: dto.academic_year,
          sync_status: CbaSyncStatus.cba_pending,
        },
      });

      return this.processRecords(db, pendingRecords, tenantId);
    });

    return result as SyncResult;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  /** Maps an internal grade string to a Junior Cycle CBA descriptor. */
  private mapGradeToDescriptor(grade: string): CbaDescriptor {
    const byGrade = CBA_GRADE_DESCRIPTORS.find(
      (d) => d.grade.toLowerCase() === grade.toLowerCase(),
    );
    if (byGrade) return byGrade;

    const byCode = CBA_GRADE_DESCRIPTORS.find(
      (d) => d.code.toLowerCase() === grade.toLowerCase(),
    );
    return byCode ?? null;
  }

  /**
   * Processes an array of pending CBA sync records: resolves DES subject codes,
   * maps grades to descriptors, and marks each record as synced or errored.
   */
  private async processRecords(
    db: PrismaService,
    records: Array<{
      id: string;
      student_id: string;
      subject_id: string;
      grade: string;
      tenant_id: string;
    }>,
    tenantId: string,
  ): Promise<SyncResult> {
    let syncedCount = 0;
    let errorCount = 0;
    const errors: Array<{ record_id: string; student_id: string; error: string }> = [];

    for (const record of records) {
      try {
        const desMapping = await db.desSubjectCodeMapping.findFirst({
          where: { tenant_id: tenantId, subject_id: record.subject_id },
        });

        if (!desMapping) {
          throw new Error(
            `No DES subject code mapping found for subject "${record.subject_id}"`,
          );
        }

        const descriptor = this.mapGradeToDescriptor(record.grade);
        if (!descriptor) {
          throw new Error(
            `Unable to map grade "${record.grade}" to a CBA descriptor`,
          );
        }

        await db.ppodCbaSyncRecord.update({
          where: { id: record.id },
          data: {
            sync_status: CbaSyncStatus.cba_synced,
            synced_at: new Date(),
            sync_error: null,
          },
        });

        syncedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown sync error';

        await db.ppodCbaSyncRecord.update({
          where: { id: record.id },
          data: {
            sync_status: CbaSyncStatus.cba_error,
            sync_error: message,
          },
        });

        errorCount++;
        errors.push({
          record_id: record.id,
          student_id: record.student_id,
          error: message,
        });
      }
    }

    return { synced_count: syncedCount, error_count: errorCount, errors };
  }
}
