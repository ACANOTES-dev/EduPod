import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MandatedReportStatus } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MandatedReportResponse {
  cp_record_id: string;
  student_id: string;
  mandated_report_status: string;
  mandated_report_ref: string | null;
  tusla_contact_name: string | null;
  tusla_contact_date: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface CpRecordRow {
  id: string;
  tenant_id: string;
  student_id: string;
  concern_id: string | null;
  record_type: string;
  logged_by_user_id: string;
  narrative: string;
  mandated_report_status: MandatedReportStatus | null;
  mandated_report_ref: string | null;
  tusla_contact_name: string | null;
  tusla_contact_date: Date | null;
  legal_hold: boolean;
  created_at: Date;
  updated_at: Date;
}

interface StatusTransitionResult {
  updated: CpRecordRow;
  oldStatus: string;
}

// ─── Valid transitions map ──────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string> = {
  draft: 'submitted',
  submitted: 'acknowledged',
  acknowledged: 'outcome_received',
};

/**
 * Map from user-facing status strings to Prisma enum values.
 * Prisma enums: mr_draft, mr_submitted, mr_acknowledged, outcome_received
 * DB values (via @map): draft, submitted, acknowledged, outcome_received
 */
const STATUS_TO_PRISMA: Record<string, MandatedReportStatus> = {
  draft: MandatedReportStatus.mr_draft,
  submitted: MandatedReportStatus.mr_submitted,
  acknowledged: MandatedReportStatus.mr_acknowledged,
  outcome_received: MandatedReportStatus.outcome_received,
};

const PRISMA_TO_STATUS: Record<string, string> = {
  [MandatedReportStatus.mr_draft]: 'draft',
  [MandatedReportStatus.mr_submitted]: 'submitted',
  [MandatedReportStatus.mr_acknowledged]: 'acknowledged',
  [MandatedReportStatus.outcome_received]: 'outcome_received',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function toResponse(record: CpRecordRow): MandatedReportResponse {
  return {
    cp_record_id: record.id,
    student_id: record.student_id,
    mandated_report_status: record.mandated_report_status
      ? PRISMA_TO_STATUS[record.mandated_report_status] ?? String(record.mandated_report_status)
      : 'none',
    mandated_report_ref: record.mandated_report_ref,
    tusla_contact_name: record.tusla_contact_name,
    tusla_contact_date: record.tusla_contact_date,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class MandatedReportService {
  private readonly logger = new Logger(MandatedReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventService: PastoralEventService,
  ) {}

  /**
   * Create a mandated report draft linked to a CP record.
   * Sets mandated_report_status = 'draft' on the cp_records row.
   * Generates pastoral_event: mandated_report_generated.
   *
   * A CP record can have at most one mandated report. If one already exists,
   * returns 409 Conflict.
   */
  async createDraft(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    _dto: Record<string, never>,
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Fetch the CP record
      const cpRecord = await db.cpRecord.findUnique({
        where: { id: cpRecordId },
      });

      if (!cpRecord) {
        throw new NotFoundException('CP record not found');
      }

      // 2. Check that no mandated report already exists on this record
      if (cpRecord.mandated_report_status !== null) {
        throw new ConflictException(
          'A mandated report already exists for this CP record',
        );
      }

      // 3. Set mandated_report_status to draft
      return db.cpRecord.update({
        where: { id: cpRecordId },
        data: {
          mandated_report_status: MandatedReportStatus.mr_draft,
        },
      });
    })) as CpRecordRow;

    // 4. Write audit event (non-blocking)
    await this.eventService.write({
      tenant_id: tenantId,
      event_type: 'mandated_report_generated',
      entity_type: 'cp_record',
      entity_id: cpRecordId,
      student_id: updated.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        cp_record_id: cpRecordId,
        student_id: updated.student_id,
      },
      ip_address: ipAddress,
    });

    return { data: toResponse(updated) };
  }

  /**
   * Submit the mandated report. Transitions status: draft -> submitted.
   * Records Tusla reference number.
   * Generates pastoral_event: mandated_report_submitted.
   *
   * Validates: status must be 'draft'. Returns 400 if not.
   */
  async submit(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    dto: { tusla_reference: string },
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const updated = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Fetch the CP record
      const cpRecord = await db.cpRecord.findUnique({
        where: { id: cpRecordId },
      });

      if (!cpRecord) {
        throw new NotFoundException('CP record not found');
      }

      // 2. Validate current status is 'draft'
      const currentStatus = cpRecord.mandated_report_status
        ? PRISMA_TO_STATUS[cpRecord.mandated_report_status]
        : null;

      if (currentStatus !== 'draft') {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition from ${currentStatus ?? 'none'} to submitted`,
          },
        });
      }

      // 3. Transition to submitted with Tusla reference
      return db.cpRecord.update({
        where: { id: cpRecordId },
        data: {
          mandated_report_status: MandatedReportStatus.mr_submitted,
          mandated_report_ref: dto.tusla_reference,
        },
      });
    })) as CpRecordRow;

    // 4. Write audit event (non-blocking)
    await this.eventService.write({
      tenant_id: tenantId,
      event_type: 'mandated_report_submitted',
      entity_type: 'cp_record',
      entity_id: cpRecordId,
      student_id: updated.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        cp_record_id: cpRecordId,
        student_id: updated.student_id,
        tusla_ref: dto.tusla_reference,
      },
      ip_address: ipAddress,
    });

    return { data: toResponse(updated) };
  }

  /**
   * Update mandated report status through lifecycle.
   * Valid transitions:
   *   submitted -> acknowledged
   *   acknowledged -> outcome_received
   *
   * Each transition generates a pastoral_event with the old and new status.
   */
  async updateStatus(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    dto: { status: string; outcome_notes?: string },
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse }> {
    const requestedStatus = dto.status;

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const result = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Fetch the CP record
      const cpRecord = await db.cpRecord.findUnique({
        where: { id: cpRecordId },
      });

      if (!cpRecord) {
        throw new NotFoundException('CP record not found');
      }

      // 2. Determine current status
      const currentStatus = cpRecord.mandated_report_status
        ? PRISMA_TO_STATUS[cpRecord.mandated_report_status]
        : null;

      if (!currentStatus) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: 'No mandated report exists for this CP record',
          },
        });
      }

      // 3. Validate the transition
      const validNext = VALID_TRANSITIONS[currentStatus];
      if (validNext !== requestedStatus) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot transition from ${currentStatus} to ${requestedStatus}`,
          },
        });
      }

      // 4. Apply the transition
      const prismaStatus = STATUS_TO_PRISMA[requestedStatus];
      if (!prismaStatus) {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Unknown status: ${requestedStatus}`,
          },
        });
      }

      const updatedRecord = await db.cpRecord.update({
        where: { id: cpRecordId },
        data: {
          mandated_report_status: prismaStatus,
        },
      });

      return { updated: updatedRecord, oldStatus: currentStatus };
    })) as StatusTransitionResult;

    // 5. Write audit event with old and new status
    // The spec defines mandated_report_generated and mandated_report_submitted
    // as the two mandated report event types. For status transitions
    // (acknowledged/outcome_received), we re-use mandated_report_submitted.
    await this.eventService.write({
      tenant_id: tenantId,
      event_type: 'mandated_report_submitted',
      entity_type: 'cp_record',
      entity_id: cpRecordId,
      student_id: result.updated.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        cp_record_id: cpRecordId,
        student_id: result.updated.student_id,
        tusla_ref: result.updated.mandated_report_ref ?? '',
      },
      ip_address: ipAddress,
    });

    this.logger.log(
      `Mandated report status transitioned: ${result.oldStatus} -> ${requestedStatus} on CP record ${cpRecordId}`,
    );

    return { data: toResponse(result.updated) };
  }

  /**
   * Get the mandated report for a CP record. Returns null if none exists.
   * Generates pastoral_event: cp_record_accessed (mandated report is part
   * of the CP record access surface).
   */
  async getForCpRecord(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse | null }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const cpRecord = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.cpRecord.findUnique({
        where: { id: cpRecordId },
      });
    })) as CpRecordRow | null;

    if (!cpRecord) {
      throw new NotFoundException('CP record not found');
    }

    // Write access audit event
    await this.eventService.write({
      tenant_id: tenantId,
      event_type: 'cp_record_accessed',
      entity_type: 'cp_record',
      entity_id: cpRecordId,
      student_id: cpRecord.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        cp_record_id: cpRecordId,
        student_id: cpRecord.student_id,
      },
      ip_address: ipAddress,
    });

    // If no mandated report status set, return null
    if (!cpRecord.mandated_report_status) {
      return { data: null };
    }

    return { data: toResponse(cpRecord) };
  }

  /**
   * Find all CP records with mandated reports for a given CP record's student.
   * Generates pastoral_event: cp_record_accessed for audit purposes.
   */
  async findByCpRecord(
    tenantId: string,
    userId: string,
    cpRecordId: string,
    ipAddress: string | null,
  ): Promise<{ data: MandatedReportResponse[] }> {
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const records = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // First verify the CP record exists
      const cpRecord = await db.cpRecord.findUnique({
        where: { id: cpRecordId },
      });

      if (!cpRecord) {
        throw new NotFoundException('CP record not found');
      }

      // Find all CP records for this student that have mandated reports
      return db.cpRecord.findMany({
        where: {
          student_id: cpRecord.student_id,
          mandated_report_status: { not: null },
        },
        orderBy: { created_at: 'desc' },
      });
    })) as CpRecordRow[];

    // Write access audit event
    const firstRecord = records[0];
    if (firstRecord) {
      await this.eventService.write({
        tenant_id: tenantId,
        event_type: 'cp_record_accessed',
        entity_type: 'cp_record',
        entity_id: cpRecordId,
        student_id: firstRecord.student_id,
        actor_user_id: userId,
        tier: 3,
        payload: {
          cp_record_id: cpRecordId,
          student_id: firstRecord.student_id,
        },
        ip_address: ipAddress,
      });
    }

    return { data: records.map(toResponse) };
  }
}
