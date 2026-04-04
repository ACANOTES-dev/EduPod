import { Injectable } from '@nestjs/common';

import type {
  BulkMarkServedDto,
  CreateSanctionDto,
  RecordParentMeetingDto,
  SanctionCalendarQuery,
  SanctionListQuery,
  SanctionStatusKey,
  UpdateSanctionDto,
} from '@school/shared/behaviour';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourSanctionsCrudService } from './behaviour-sanctions-crud.service';
import { BehaviourSanctionsLifecycleService } from './behaviour-sanctions-lifecycle.service';
import { BehaviourSanctionsMeetingsService } from './behaviour-sanctions-meetings.service';

/**
 * Thin facade preserving the original public interface.
 * Delegates to focused sub-services for sanction CRUD, lifecycle transitions,
 * and meeting/conflict management.
 */
@Injectable()
export class BehaviourSanctionsService {
  constructor(
    private readonly crud: BehaviourSanctionsCrudService,
    private readonly lifecycle: BehaviourSanctionsLifecycleService,
    private readonly meetings: BehaviourSanctionsMeetingsService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSanctionDto) {
    return this.crud.create(tenantId, userId, dto);
  }

  async createFromPolicy(
    tenantId: string,
    data: {
      incident_id: string;
      student_id: string;
      type: string;
      scheduled_date: Date;
      notes: string | null;
      created_by_id: string;
    },
    tx: PrismaService,
  ) {
    return this.crud.createFromPolicy(tenantId, data, tx);
  }

  async list(tenantId: string, query: SanctionListQuery) {
    return this.crud.list(tenantId, query);
  }

  async getById(tenantId: string, id: string) {
    return this.crud.getById(tenantId, id);
  }

  async update(tenantId: string, id: string, dto: UpdateSanctionDto, userId: string) {
    return this.crud.update(tenantId, id, dto, userId);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────

  async transitionStatus(
    tenantId: string,
    id: string,
    newStatus: SanctionStatusKey,
    reason: string | undefined,
    userId: string,
  ) {
    return this.lifecycle.transitionStatus(tenantId, id, newStatus, reason, userId);
  }

  async getTodaySanctions(tenantId: string) {
    return this.lifecycle.getTodaySanctions(tenantId);
  }

  async getMySupervision(tenantId: string, userId: string) {
    return this.lifecycle.getMySupervision(tenantId, userId);
  }

  async getCalendarView(tenantId: string, query: SanctionCalendarQuery) {
    return this.lifecycle.getCalendarView(tenantId, query);
  }

  async getActiveSuspensions(tenantId: string) {
    return this.lifecycle.getActiveSuspensions(tenantId);
  }

  async getReturningSoon(tenantId: string) {
    return this.lifecycle.getReturningSoon(tenantId);
  }

  async bulkMarkServed(tenantId: string, dto: BulkMarkServedDto, userId: string) {
    return this.lifecycle.bulkMarkServed(tenantId, dto, userId);
  }

  // ─── Meetings & Conflicts ─────────────────────────────────────────────

  async recordParentMeeting(tenantId: string, id: string, dto: RecordParentMeetingDto) {
    return this.meetings.recordParentMeeting(tenantId, id, dto);
  }

  async checkConflicts(
    tenantId: string,
    studentId: string,
    date: string,
    startTime: string | null,
    endTime: string | null,
  ) {
    return this.meetings.checkConflicts(tenantId, studentId, date, startTime, endTime);
  }
}
