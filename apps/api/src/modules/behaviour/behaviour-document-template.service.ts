import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import type {
  CreateDocumentTemplateDto,
  DocumentType,
  ListDocumentTemplatesQuery,
  MergeFieldDefinition,
  UpdateDocumentTemplateDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Merge Field Definitions (per document type) ─────────────────────────────

const COMMON_MERGE_FIELDS: MergeFieldDefinition[] = [
  { field_name: 'student_name', source: 'student', description: 'Student full name' },
  { field_name: 'student_year_group', source: 'student', description: 'Year group name' },
  { field_name: 'student_class', source: 'student', description: 'Class name' },
  { field_name: 'student_dob', source: 'student', description: 'Date of birth' },
  { field_name: 'school_name', source: 'school', description: 'School name' },
  { field_name: 'school_address', source: 'school', description: 'School address' },
  { field_name: 'school_logo_url', source: 'school', description: 'School logo URL' },
  { field_name: 'principal_name', source: 'school', description: 'Principal name' },
  { field_name: 'today_date', source: 'system', description: "Today's date formatted" },
  { field_name: 'academic_year', source: 'system', description: 'Current academic year' },
  { field_name: 'parent_name', source: 'parent', description: 'Primary guardian name' },
  { field_name: 'parent_address', source: 'parent', description: 'Parent address' },
];

const INCIDENT_FIELDS: MergeFieldDefinition[] = [
  { field_name: 'incident_date', source: 'incident', description: 'Incident date formatted' },
  { field_name: 'incident_category', source: 'incident', description: 'Category name' },
  {
    field_name: 'incident_description',
    source: 'incident',
    description: 'Parent-safe description',
  },
  { field_name: 'incident_location', source: 'incident', description: 'Location' },
];

const SANCTION_FIELDS: MergeFieldDefinition[] = [
  { field_name: 'sanction_type', source: 'sanction', description: 'Sanction type' },
  { field_name: 'sanction_date', source: 'sanction', description: 'Scheduled date' },
  { field_name: 'sanction_start_date', source: 'sanction', description: 'Suspension start date' },
  { field_name: 'sanction_end_date', source: 'sanction', description: 'Suspension end date' },
  { field_name: 'suspension_days', source: 'sanction', description: 'Number of suspension days' },
  { field_name: 'return_conditions', source: 'sanction', description: 'Return conditions text' },
];

const APPEAL_FIELDS: MergeFieldDefinition[] = [
  { field_name: 'appeal_grounds', source: 'appeal', description: 'Appeal grounds' },
  { field_name: 'appeal_hearing_date', source: 'appeal', description: 'Hearing date formatted' },
  { field_name: 'appeal_decision', source: 'appeal', description: 'Appeal decision' },
  { field_name: 'appeal_decision_reasoning', source: 'appeal', description: 'Decision reasoning' },
];

const INTERVENTION_FIELDS: MergeFieldDefinition[] = [
  { field_name: 'intervention_goals', source: 'intervention', description: 'Goals array' },
];

const EVIDENCE_FIELDS: MergeFieldDefinition[] = [
  { field_name: 'evidence_list', source: 'evidence', description: 'Evidence items array' },
];

const MERGE_FIELDS_BY_TYPE: Record<string, MergeFieldDefinition[]> = {
  detention_notice: [...COMMON_MERGE_FIELDS, ...INCIDENT_FIELDS, ...SANCTION_FIELDS],
  suspension_letter: [...COMMON_MERGE_FIELDS, ...INCIDENT_FIELDS, ...SANCTION_FIELDS],
  return_meeting_letter: [...COMMON_MERGE_FIELDS, ...SANCTION_FIELDS],
  behaviour_contract: [...COMMON_MERGE_FIELDS, ...INTERVENTION_FIELDS],
  intervention_summary: [...COMMON_MERGE_FIELDS, ...INTERVENTION_FIELDS],
  appeal_hearing_invite: [...COMMON_MERGE_FIELDS, ...APPEAL_FIELDS],
  appeal_decision_letter: [...COMMON_MERGE_FIELDS, ...APPEAL_FIELDS],
  exclusion_notice: [...COMMON_MERGE_FIELDS, ...INCIDENT_FIELDS, ...SANCTION_FIELDS],
  exclusion_decision_letter: [...COMMON_MERGE_FIELDS, ...APPEAL_FIELDS],
  board_pack: [...COMMON_MERGE_FIELDS, ...INCIDENT_FIELDS, ...SANCTION_FIELDS, ...EVIDENCE_FIELDS],
  custom_document: COMMON_MERGE_FIELDS,
};

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class BehaviourDocumentTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all templates for a tenant with optional filters.
   */
  async listTemplates(tenantId: string, query: ListDocumentTemplatesQuery) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = { tenant_id: tenantId };
      if (query.document_type) where.document_type = query.document_type;
      if (query.locale) where.locale = query.locale;
      if (query.is_active !== undefined) where.is_active = query.is_active;

      const templates = await db.behaviourDocumentTemplate.findMany({
        where,
        orderBy: [{ document_type: 'asc' }, { locale: 'asc' }, { is_system: 'asc' }],
      });

      return { data: templates };
    });
  }

  /**
   * Create a school-custom template (is_system = false).
   */
  async createTemplate(tenantId: string, dto: CreateDocumentTemplateDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const mergeFields = dto.merge_fields ?? this.getMergeFieldsForType(dto.document_type);

      const template = await db.behaviourDocumentTemplate.create({
        data: {
          tenant_id: tenantId,
          document_type: dto.document_type,
          name: dto.name,
          locale: dto.locale ?? 'en',
          template_body: dto.template_body,
          merge_fields: mergeFields,
          is_active: true,
          is_system: false,
        },
      });

      return { data: template };
    });
  }

  /**
   * Update a template. System templates: only is_active and template_body editable.
   */
  async updateTemplate(tenantId: string, templateId: string, dto: UpdateDocumentTemplateDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const template = await db.behaviourDocumentTemplate.findFirst({
        where: { id: templateId, tenant_id: tenantId },
      });

      if (!template) {
        throw new NotFoundException('Document template not found');
      }

      const updateData: Record<string, unknown> = {};

      if (template.is_system) {
        // System templates: only is_active and template_body can be changed
        if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
        if (dto.template_body !== undefined) updateData.template_body = dto.template_body;
        if (dto.name !== undefined) {
          throw new BadRequestException('Cannot rename system templates');
        }
      } else {
        // Custom templates: all fields editable
        if (dto.name !== undefined) updateData.name = dto.name;
        if (dto.template_body !== undefined) updateData.template_body = dto.template_body;
        if (dto.is_active !== undefined) updateData.is_active = dto.is_active;
      }

      const updated = await db.behaviourDocumentTemplate.update({
        where: { id: templateId },
        data: updateData,
      });

      return { data: updated };
    });
  }

  /**
   * Find the best active template for a given type+locale.
   * School custom templates (is_system=false) take priority over system ones.
   */
  async getActiveTemplate(
    tx: PrismaClient,
    tenantId: string,
    documentType: string,
    locale: string,
  ) {
    const db = tx as unknown as PrismaService;

    const template = await db.behaviourDocumentTemplate.findFirst({
      where: {
        tenant_id: tenantId,
        document_type: documentType as DocumentType,
        locale,
        is_active: true,
      },
      orderBy: { is_system: 'asc' }, // custom templates sort first
    });

    return template;
  }

  /**
   * Get available merge fields for a document type.
   */
  getMergeFieldsForType(documentType: string): MergeFieldDefinition[] {
    return MERGE_FIELDS_BY_TYPE[documentType] ?? COMMON_MERGE_FIELDS;
  }
}
