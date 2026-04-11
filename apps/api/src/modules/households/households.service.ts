import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type {
  CreateHouseholdDto,
  EmergencyContactDto,
  MergeHouseholdDto,
  SplitHouseholdDto,
  UpdateHouseholdDto,
} from '@school/shared';

import { HouseholdsCrudService } from './households-crud.service';
import { HouseholdsRelationsService } from './households-relations.service';
import { HouseholdsStructuralService } from './households-structural.service';

// ─── Query filter type ────────────────────────────────────────────────────────

interface HouseholdQueryParams {
  page: number;
  pageSize: number;
  status?: string;
  search?: string;
}

// ─── Prisma result shapes ─────────────────────────────────────────────────────

export interface HouseholdListItem {
  id: string;
  tenant_id: string;
  household_name: string;
  household_number: string | null;
  primary_billing_parent_id: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  needs_completion: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  _count: { students: number };
}

export interface EmergencyContactRecord {
  id: string;
  tenant_id: string;
  household_id: string;
  contact_name: string;
  phone: string;
  relationship_label: string;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface ParentSummary {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact_channels: Prisma.JsonValue;
  is_primary_contact: boolean;
  is_billing_contact: boolean;
}

export interface HouseholdParentRecord {
  household_id: string;
  parent_id: string;
  role_label: string | null;
  tenant_id: string;
  updated_at: Date;
  parent: ParentSummary;
}

export interface HouseholdDetail {
  id: string;
  tenant_id: string;
  household_name: string;
  household_number: string | null;
  student_counter: number;
  primary_billing_parent_id: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  country: string | null;
  postal_code: string | null;
  needs_completion: boolean;
  status: string;
  created_at: Date;
  updated_at: Date;
  billing_parent: ParentSummary | null;
  emergency_contacts: EmergencyContactRecord[];
  household_parents: HouseholdParentRecord[];
  students: { id: string; first_name: string; last_name: string; status: string }[];
}

// ─── Facade service ──────────────────────────────────────────────────────────

/**
 * HouseholdsService — Thin facade that delegates to domain-specific sub-services.
 *
 * Preserves the public API consumed by HouseholdsController and existing tests.
 * Business logic lives in:
 *   - HouseholdsCrudService      (create, findAll, findOne, update, updateStatus)
 *   - HouseholdsRelationsService  (setBillingParent, emergency contacts, parent links)
 *   - HouseholdsStructuralService (merge, split, preview)
 */
@Injectable()
export class HouseholdsService {
  constructor(
    private readonly crud: HouseholdsCrudService,
    private readonly relations: HouseholdsRelationsService,
    private readonly structural: HouseholdsStructuralService,
  ) {}

  // ─── Preview ─────────────────────────────────────────────────────────────────

  async previewNextNumber(tenantId: string) {
    return this.crud.previewNextNumber(tenantId);
  }

  // ─── CRUD ───────────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateHouseholdDto) {
    return this.crud.create(tenantId, dto);
  }

  async findAll(tenantId: string, query: HouseholdQueryParams) {
    return this.crud.findAll(tenantId, query);
  }

  async findOne(tenantId: string, id: string) {
    return this.crud.findOne(tenantId, id);
  }

  async update(tenantId: string, id: string, dto: UpdateHouseholdDto) {
    return this.crud.update(tenantId, id, dto);
  }

  async updateStatus(tenantId: string, id: string, status: string) {
    return this.crud.updateStatus(tenantId, id, status);
  }

  // ─── Relations ──────────────────────────────────────────────────────────────

  async setBillingParent(tenantId: string, id: string, parentId: string) {
    return this.relations.setBillingParent(tenantId, id, parentId);
  }

  async addEmergencyContact(tenantId: string, householdId: string, dto: EmergencyContactDto) {
    return this.relations.addEmergencyContact(tenantId, householdId, dto);
  }

  async updateEmergencyContact(
    tenantId: string,
    householdId: string,
    contactId: string,
    dto: EmergencyContactDto,
  ) {
    return this.relations.updateEmergencyContact(tenantId, householdId, contactId, dto);
  }

  async removeEmergencyContact(tenantId: string, householdId: string, contactId: string) {
    return this.relations.removeEmergencyContact(tenantId, householdId, contactId);
  }

  async linkParent(tenantId: string, householdId: string, parentId: string, roleLabel?: string) {
    return this.relations.linkParent(tenantId, householdId, parentId, roleLabel);
  }

  async unlinkParent(tenantId: string, householdId: string, parentId: string) {
    return this.relations.unlinkParent(tenantId, householdId, parentId);
  }

  // ─── Structural ─────────────────────────────────────────────────────────────

  async merge(tenantId: string, dto: MergeHouseholdDto) {
    return this.structural.merge(tenantId, dto);
  }

  async split(tenantId: string, dto: SplitHouseholdDto) {
    return this.structural.split(tenantId, dto);
  }

  async preview(tenantId: string, id: string) {
    return this.structural.preview(tenantId, id);
  }
}
