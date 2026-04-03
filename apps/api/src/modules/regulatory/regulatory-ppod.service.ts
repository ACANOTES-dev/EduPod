import { createHash } from 'crypto';

import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PodDatabaseType, PodSyncLogStatus, PodSyncStatus, PodSyncType } from '@prisma/client';

import type { PpodExportDto, PpodImportDto } from '@school/shared/regulatory';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import type { PodRecord, PodTransport } from './adapters/pod-transport.interface';
import { POD_TRANSPORT } from './adapters/pod-transport.interface';

// ─── Student select shape for sync ───────────────────────────────────────────

const STUDENT_SYNC_SELECT = {
  id: true,
  student_number: true,
  national_id: true,
  first_name: true,
  last_name: true,
  date_of_birth: true,
  gender: true,
  nationality: true,
  entry_date: true,
  exit_date: true,
  status: true,
  household: {
    select: {
      address_line_1: true,
      address_line_2: true,
      city: true,
      country: true,
      postal_code: true,
    },
  },
  year_group: {
    select: { name: true },
  },
  homeroom_class: {
    select: { name: true },
  },
} as const;

/** Shape returned by the student select query. */
interface StudentSyncData {
  id: string;
  student_number: string | null;
  national_id: string | null;
  first_name: string;
  last_name: string;
  date_of_birth: Date;
  gender: string | null;
  nationality: string | null;
  entry_date: Date | null;
  exit_date: Date | null;
  status: string;
  household: {
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    country: string | null;
    postal_code: string | null;
  };
  year_group: { name: string } | null;
  homeroom_class: { name: string } | null;
}

/** Diff entry for a single student mapping. */
export interface DiffEntry {
  student_id: string;
  mapping_id: string;
  status: 'new' | 'changed' | 'unchanged';
  current_hash: string;
  stored_hash: string | null;
  record?: PodRecord;
}

// ─── PPOD Sync Service ──────────────────────────────────────────────────────

@Injectable()
export class RegulatoryPpodService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(POD_TRANSPORT) private readonly transport: PodTransport,
  ) {}

  // ─── Sync Status ──────────────────────────────────────────────────────────

  async getSyncStatus(tenantId: string, databaseType: PodDatabaseType) {
    const [statusCounts, lastSync] = await Promise.all([
      this.prisma.ppodStudentMapping.groupBy({
        by: ['sync_status'],
        where: { tenant_id: tenantId, database_type: databaseType },
        _count: { id: true },
      }),
      this.prisma.ppodSyncLog.findFirst({
        where: { tenant_id: tenantId, database_type: databaseType },
        orderBy: { started_at: 'desc' },
      }),
    ]);

    const counts: Record<string, number> = {
      synced: 0,
      pending: 0,
      changed: 0,
      error: 0,
      not_applicable: 0,
    };

    let totalMapped = 0;
    for (const entry of statusCounts) {
      const count = entry._count.id;
      totalMapped += count;

      switch (entry.sync_status) {
        case PodSyncStatus.synced:
          counts.synced = count;
          break;
        case PodSyncStatus.pod_pending:
          counts.pending = count;
          break;
        case PodSyncStatus.changed:
          counts.changed = count;
          break;
        case PodSyncStatus.pod_error:
          counts.error = count;
          break;
        case PodSyncStatus.not_applicable:
          counts.not_applicable = count;
          break;
      }
    }

    return {
      total_mapped: totalMapped,
      synced: counts.synced,
      pending: counts.pending,
      changed: counts.changed,
      errors: counts.error,
      last_sync: lastSync
        ? {
            id: lastSync.id,
            status: lastSync.status,
            started_at: lastSync.started_at,
            completed_at: lastSync.completed_at,
            records_created: lastSync.records_created,
            records_updated: lastSync.records_updated,
            records_failed: lastSync.records_failed,
          }
        : null,
    };
  }

  // ─── Import from PPOD ─────────────────────────────────────────────────────

  async importFromPpod(tenantId: string, userId: string, dto: PpodImportDto) {
    const databaseType = dto.database_type as PodDatabaseType;

    // Parse CSV via transport adapter
    const parseResult = await this.transport.pull(dto.file_content);
    if (!parseResult.success && parseResult.records.length === 0) {
      throw new BadRequestException({
        code: 'PPOD_IMPORT_PARSE_FAILED',
        message: `Failed to parse PPOD file: ${parseResult.errors.length} error(s)`,
        details: { errors: parseResult.errors },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Create sync log entry
      const syncLog = await db.ppodSyncLog.create({
        data: {
          tenant_id: tenantId,
          database_type: databaseType,
          sync_type: PodSyncType.manual,
          triggered_by_id: userId,
          started_at: new Date(),
          status: PodSyncLogStatus.sync_in_progress,
          transport_used: 'csv',
        },
      });

      let recordsCreated = 0;
      let recordsUpdated = 0;
      let recordsFailed = 0;
      const importErrors: Array<{ row: number; external_id: string; message: string }> = [];

      for (let i = 0; i < parseResult.records.length; i++) {
        const record = parseResult.records[i];
        if (!record) continue;

        try {
          const studentData = this.mapPodToStudent(record);
          const existingMapping = await db.ppodStudentMapping.findFirst({
            where: {
              tenant_id: tenantId,
              external_id: record.external_id,
              database_type: databaseType,
            },
          });

          const dataSnapshot = this.buildDataSnapshot(record);
          const syncHash = this.hashData(dataSnapshot);

          if (existingMapping) {
            // Update existing student and mapping
            await db.student.update({
              where: { id: existingMapping.student_id },
              data: studentData,
            });
            await db.ppodStudentMapping.update({
              where: { id: existingMapping.id },
              data: {
                sync_status: PodSyncStatus.synced,
                last_synced_at: new Date(),
                last_sync_hash: syncHash,
                last_sync_error: null,
                data_snapshot: dataSnapshot,
              },
            });
            recordsUpdated++;
          } else {
            // Look up student by national_id (PPS number) first
            let student = record.pps_number
              ? await db.student.findFirst({
                  where: { tenant_id: tenantId, national_id: record.pps_number },
                })
              : null;

            if (!student) {
              // Look up by name + date of birth as fallback
              student = await db.student.findFirst({
                where: {
                  tenant_id: tenantId,
                  first_name: record.first_name,
                  last_name: record.last_name,
                  date_of_birth: record.date_of_birth ? new Date(record.date_of_birth) : undefined,
                },
              });
            }

            if (student) {
              // Found matching student — create mapping only, update student data
              await db.student.update({
                where: { id: student.id },
                data: studentData,
              });
              await db.ppodStudentMapping.create({
                data: {
                  tenant_id: tenantId,
                  student_id: student.id,
                  database_type: databaseType,
                  external_id: record.external_id,
                  sync_status: PodSyncStatus.synced,
                  last_synced_at: new Date(),
                  last_sync_hash: syncHash,
                  data_snapshot: dataSnapshot,
                },
              });
              recordsCreated++;
            } else {
              // No matching student found — skip with error, do not auto-create students
              importErrors.push({
                row: i + 1,
                external_id: record.external_id,
                message: `No matching student found for external_id "${record.external_id}" (${record.first_name} ${record.last_name})`,
              });
              recordsFailed++;
            }
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          importErrors.push({
            row: i + 1,
            external_id: record.external_id,
            message: errorMessage,
          });
          recordsFailed++;
        }
      }

      // Include parse-level errors
      const allErrors = [
        ...parseResult.errors.map((e) => ({
          row: e.row,
          external_id: '',
          message: `Parse error in field "${e.field}": ${e.message}`,
        })),
        ...importErrors,
      ];

      // Determine final status
      let finalStatus: PodSyncLogStatus;
      if (recordsFailed > 0 && (recordsCreated > 0 || recordsUpdated > 0)) {
        finalStatus = PodSyncLogStatus.completed_with_errors;
      } else if (recordsFailed > 0) {
        finalStatus = PodSyncLogStatus.sync_failed;
      } else {
        finalStatus = PodSyncLogStatus.sync_completed;
      }

      await db.ppodSyncLog.update({
        where: { id: syncLog.id },
        data: {
          status: finalStatus,
          completed_at: new Date(),
          records_created: recordsCreated,
          records_updated: recordsUpdated,
          records_failed: recordsFailed,
          error_details: allErrors.length > 0 ? allErrors : undefined,
        },
      });

      return {
        sync_log_id: syncLog.id,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        records_failed: recordsFailed,
        errors: allErrors,
      };
    });
  }

  // ─── Calculate Diff ───────────────────────────────────────────────────────

  async calculateDiff(tenantId: string, databaseType: PodDatabaseType): Promise<DiffEntry[]> {
    const mappings = await this.prisma.ppodStudentMapping.findMany({
      where: { tenant_id: tenantId, database_type: databaseType },
      include: {
        student: {
          select: STUDENT_SYNC_SELECT,
        },
      },
    });

    const results: DiffEntry[] = [];

    for (const mapping of mappings) {
      const student = mapping.student as unknown as StudentSyncData;
      const podRecord = this.mapStudentToPod(student);
      const dataSnapshot = this.buildDataSnapshot(podRecord);
      const currentHash = this.hashData(dataSnapshot);
      const storedHash = mapping.last_sync_hash;

      let status: 'new' | 'changed' | 'unchanged';
      if (!storedHash) {
        status = 'new';
      } else if (currentHash !== storedHash) {
        status = 'changed';
      } else {
        status = 'unchanged';
      }

      results.push({
        student_id: mapping.student_id,
        mapping_id: mapping.id,
        status,
        current_hash: currentHash,
        stored_hash: storedHash,
        record: podRecord,
      });
    }

    return results;
  }

  // ─── Preview Diff ─────────────────────────────────────────────────────────

  async previewDiff(tenantId: string, databaseType: PodDatabaseType) {
    const diff = await this.calculateDiff(tenantId, databaseType);
    return diff.filter((entry) => entry.status === 'new' || entry.status === 'changed');
  }

  // ─── Export for PPOD ──────────────────────────────────────────────────────

  async exportForPpod(tenantId: string, userId: string, dto: PpodExportDto) {
    const databaseType = dto.database_type as PodDatabaseType;
    const isFullScope = dto.scope === 'full';

    const diff = await this.calculateDiff(tenantId, databaseType);
    const recordsToExport = isFullScope
      ? diff
      : diff.filter((entry) => entry.status === 'new' || entry.status === 'changed');

    if (recordsToExport.length === 0) {
      return {
        sync_log_id: null,
        records_pushed: 0,
        csv_content: '',
      };
    }

    const podRecords = recordsToExport
      .map((entry) => entry.record)
      .filter((r): r is PodRecord => r !== undefined);

    const pushResult = await this.transport.push(podRecords);
    if (!pushResult.success) {
      throw new BadRequestException({
        code: 'PPOD_EXPORT_GENERATION_FAILED',
        message: `Failed to generate PPOD export: ${pushResult.errors.length} error(s)`,
        details: { errors: pushResult.errors },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Create sync log
      const syncLog = await db.ppodSyncLog.create({
        data: {
          tenant_id: tenantId,
          database_type: databaseType,
          sync_type: isFullScope ? PodSyncType.full : PodSyncType.incremental,
          triggered_by_id: userId,
          started_at: new Date(),
          status: PodSyncLogStatus.sync_completed,
          completed_at: new Date(),
          records_pushed: recordsToExport.length,
          transport_used: 'csv',
        },
      });

      // Update mapping hashes for exported records
      for (const entry of recordsToExport) {
        await db.ppodStudentMapping.update({
          where: { id: entry.mapping_id },
          data: {
            sync_status: PodSyncStatus.synced,
            last_synced_at: new Date(),
            last_sync_hash: entry.current_hash,
            data_snapshot: entry.record ? this.buildDataSnapshot(entry.record) : undefined,
          },
        });
      }

      return {
        sync_log_id: syncLog.id,
        records_pushed: recordsToExport.length,
        csv_content: pushResult.raw_content ?? '',
      };
    });
  }

  // ─── Sync Logs (paginated) ────────────────────────────────────────────────

  async getSyncLog(tenantId: string, databaseType?: PodDatabaseType, page = 1, pageSize = 20) {
    const where = {
      tenant_id: tenantId,
      ...(databaseType ? { database_type: databaseType } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.ppodSyncLog.findMany({
        where,
        orderBy: { started_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          triggered_by: {
            select: { id: true, first_name: true, last_name: true, email: true },
          },
        },
      }),
      this.prisma.ppodSyncLog.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── List Mapped Students ─────────────────────────────────────────────────

  async listMappedStudents(
    tenantId: string,
    databaseType: PodDatabaseType,
    page = 1,
    pageSize = 20,
  ) {
    const where = { tenant_id: tenantId, database_type: databaseType };
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.ppodStudentMapping.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updated_at: 'desc' },
        include: {
          student: {
            select: { id: true, first_name: true, last_name: true, student_number: true },
          },
        },
      }),
      this.prisma.ppodStudentMapping.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  // ─── Sync Single Student ──────────────────────────────────────────────────

  async syncSingleStudent(
    tenantId: string,
    studentId: string,
    userId: string,
    databaseType: PodDatabaseType,
  ) {
    const mapping = await this.prisma.ppodStudentMapping.findFirst({
      where: { tenant_id: tenantId, student_id: studentId, database_type: databaseType },
      include: { student: { select: STUDENT_SYNC_SELECT } },
    });

    if (!mapping) {
      throw new NotFoundException({
        code: 'PPOD_MAPPING_NOT_FOUND',
        message: `No PPOD mapping found for student "${studentId}"`,
      });
    }

    const student = mapping.student as unknown as StudentSyncData;
    const podRecord = this.mapStudentToPod(student);
    const dataSnapshot = this.buildDataSnapshot(podRecord);
    const currentHash = this.hashData(dataSnapshot);

    if (currentHash === mapping.last_sync_hash) {
      return { status: 'unchanged', student_id: studentId, mapping_id: mapping.id };
    }

    const pushResult = await this.transport.push([podRecord]);
    if (!pushResult.success) {
      throw new BadRequestException({
        code: 'PPOD_SINGLE_EXPORT_FAILED',
        message: `Failed to export student "${studentId}"`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.ppodStudentMapping.update({
        where: { id: mapping.id },
        data: {
          sync_status: PodSyncStatus.synced,
          last_synced_at: new Date(),
          last_sync_hash: currentHash,
          data_snapshot: dataSnapshot,
        },
      });
      await db.ppodSyncLog.create({
        data: {
          tenant_id: tenantId,
          database_type: databaseType,
          sync_type: PodSyncType.manual,
          triggered_by_id: userId,
          started_at: new Date(),
          completed_at: new Date(),
          status: PodSyncLogStatus.sync_completed,
          records_pushed: 1,
          transport_used: 'csv',
        },
      });
    });

    return {
      status: 'synced',
      student_id: studentId,
      mapping_id: mapping.id,
      csv_content: pushResult.raw_content ?? '',
    };
  }

  // ─── Private: PodRecord → Student data ────────────────────────────────────

  private mapPodToStudent(record: PodRecord): Record<string, unknown> {
    const data: Record<string, unknown> = {
      first_name: record.first_name,
      last_name: record.last_name,
    };

    if (record.date_of_birth) {
      data.date_of_birth = new Date(record.date_of_birth);
    }

    if (record.gender) {
      const genderMap: Record<string, string> = {
        M: 'male',
        F: 'female',
        Male: 'male',
        Female: 'female',
        male: 'male',
        female: 'female',
        Other: 'other',
        other: 'other',
      };
      data.gender = genderMap[record.gender] ?? record.gender;
    }

    if (record.nationality) {
      data.nationality = record.nationality;
    }

    if (record.pps_number) {
      data.national_id = record.pps_number;
    }

    if (record.enrolment_date) {
      data.entry_date = new Date(record.enrolment_date);
    }

    if (record.leaving_date) {
      data.exit_date = new Date(record.leaving_date);
    }

    return data;
  }

  // ─── Private: Student data → PodRecord ────────────────────────────────────

  private mapStudentToPod(student: StudentSyncData): PodRecord {
    const dobIso = student.date_of_birth.toISOString();
    const record: PodRecord = {
      external_id: student.student_number ?? student.id,
      first_name: student.first_name,
      last_name: student.last_name,
      date_of_birth: dobIso.substring(0, 10),
      gender: student.gender ?? '',
    };

    // Address from household
    if (student.household) {
      record.address_line1 = student.household.address_line_1 ?? undefined;
      record.address_line2 = student.household.address_line_2 ?? undefined;
      record.address_city = student.household.city ?? undefined;
      record.address_county = student.household.country ?? undefined;
      record.address_eircode = student.household.postal_code ?? undefined;
    }

    if (student.nationality) {
      record.nationality = student.nationality;
    }

    if (student.national_id) {
      record.pps_number = student.national_id;
    }

    if (student.entry_date) {
      record.enrolment_date = student.entry_date.toISOString().substring(0, 10);
    }

    if (student.year_group) {
      record.year_group = student.year_group.name;
    }

    if (student.homeroom_class) {
      record.class_group = student.homeroom_class.name;
    }

    if (student.exit_date) {
      record.leaving_date = student.exit_date.toISOString().substring(0, 10);
    }

    return record;
  }

  // ─── Private: Build deterministic data snapshot for hashing ───────────────

  private buildDataSnapshot(record: PodRecord): Record<string, string> {
    const snapshot: Record<string, string> = {};
    const sortedKeys = Object.keys(record).sort();

    for (const key of sortedKeys) {
      const value = record[key];
      if (value !== undefined && value !== '') {
        snapshot[key] = value;
      }
    }

    return snapshot;
  }

  // ─── Private: SHA-256 hash of deterministic JSON ──────────────────────────

  private hashData(data: Record<string, string>): string {
    const json = JSON.stringify(data);
    return createHash('sha256').update(json).digest('hex');
  }
}
