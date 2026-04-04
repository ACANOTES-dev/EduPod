import { Injectable } from '@nestjs/common';

import type {
  CreateIncidentDto,
  CreateParticipantDto,
  ListIncidentsQuery,
  StatusTransitionDto,
  UpdateIncidentDto,
  WithdrawIncidentDto,
} from '@school/shared/behaviour';

import { BehaviourIncidentsService } from './behaviour-incidents.service';
import { BehaviourParticipantsService } from './behaviour-participants.service';
import { BehaviourStatusService } from './behaviour-status.service';

/**
 * Thin facade preserving the original public interface.
 * Delegates to focused sub-services for incident CRUD, status transitions,
 * and participant management.
 */
@Injectable()
export class BehaviourService {
  constructor(
    private readonly incidents: BehaviourIncidentsService,
    private readonly status: BehaviourStatusService,
    private readonly participants: BehaviourParticipantsService,
  ) {}

  // ─── Incident CRUD ──────────────────────────────────────────────────────

  async createIncident(tenantId: string, userId: string, dto: CreateIncidentDto) {
    return this.incidents.createIncident(tenantId, userId, dto);
  }

  async listIncidents(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: ListIncidentsQuery,
  ) {
    return this.incidents.listIncidents(tenantId, userId, permissions, query);
  }

  async getIncident(tenantId: string, id: string, userId: string, permissions: string[]) {
    return this.incidents.getIncident(tenantId, id, userId, permissions);
  }

  async updateIncident(tenantId: string, id: string, userId: string, dto: UpdateIncidentDto) {
    return this.incidents.updateIncident(tenantId, id, userId, dto);
  }

  async getMyIncidents(tenantId: string, userId: string, page: number, pageSize: number) {
    return this.incidents.getMyIncidents(tenantId, userId, page, pageSize);
  }

  async getFeed(
    tenantId: string,
    userId: string,
    permissions: string[],
    page: number,
    pageSize: number,
  ) {
    return this.incidents.getFeed(tenantId, userId, permissions, page, pageSize);
  }

  // ─── Status Transitions ─────────────────────────────────────────────────

  async transitionStatus(tenantId: string, id: string, userId: string, dto: StatusTransitionDto) {
    return this.status.transitionStatus(tenantId, id, userId, dto);
  }

  async withdrawIncident(tenantId: string, id: string, userId: string, dto: WithdrawIncidentDto) {
    return this.status.withdrawIncident(tenantId, id, userId, dto);
  }

  // ─── Participants ───────────────────────────────────────────────────────

  async addParticipant(
    tenantId: string,
    incidentId: string,
    userId: string,
    dto: CreateParticipantDto,
  ) {
    return this.participants.addParticipant(tenantId, incidentId, userId, dto);
  }

  async removeParticipant(
    tenantId: string,
    incidentId: string,
    participantId: string,
    userId: string,
  ) {
    return this.participants.removeParticipant(tenantId, incidentId, participantId, userId);
  }
}
