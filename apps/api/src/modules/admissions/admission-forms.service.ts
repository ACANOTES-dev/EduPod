import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationFieldType, Prisma } from '@prisma/client';

import type {
  CreateFormDefinitionDto,
  FormFieldInput,
  ListFormDefinitionsQuery,
  UpdateFormDefinitionDto,
} from '@school/shared';
import { detectSpecialCategoryFields, type DataMinimisationWarning } from '@school/shared/gdpr';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── Prisma result shapes ─────────────────────────────────────────────────────

export interface FormDefinitionListItem {
  id: string;
  tenant_id: string;
  name: string;
  base_form_id: string | null;
  version_number: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  _count: { fields: number; applications: number };
}

export interface FormFieldRecord {
  id: string;
  tenant_id: string;
  form_definition_id: string;
  field_key: string;
  label: string;
  help_text: string | null;
  field_type: string;
  required: boolean;
  visible_to_parent: boolean;
  visible_to_staff: boolean;
  searchable: boolean;
  reportable: boolean;
  options_json: Prisma.JsonValue;
  validation_rules_json: Prisma.JsonValue;
  conditional_visibility_json: Prisma.JsonValue;
  display_order: number;
  active: boolean;
}

export interface FormDefinitionDetail {
  id: string;
  tenant_id: string;
  name: string;
  base_form_id: string | null;
  version_number: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  fields: FormFieldRecord[];
  _count: { applications: number };
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AdmissionFormsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create ──────────────────────────────────────────────────────────────

  async create(tenantId: string, dto: CreateFormDefinitionDto) {
    this.validateFields(dto.fields);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const form = await db.admissionFormDefinition.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          version_number: 1,
          status: 'draft',
        },
      });

      // Set base_form_id to self for the root form
      await db.admissionFormDefinition.update({
        where: { id: form.id },
        data: { base_form_id: form.id },
      });

      for (const field of dto.fields) {
        await db.admissionFormField.create({
          data: {
            tenant_id: tenantId,
            form_definition_id: form.id,
            field_key: field.field_key,
            label: field.label,
            help_text: field.help_text ?? null,
            field_type: field.field_type,
            required: field.required,
            visible_to_parent: field.visible_to_parent,
            visible_to_staff: field.visible_to_staff,
            searchable: field.searchable,
            reportable: field.reportable,
            options_json: field.options_json ?? Prisma.JsonNull,
            validation_rules_json: field.validation_rules_json ?? Prisma.JsonNull,
            conditional_visibility_json: field.conditional_visibility_json ?? Prisma.JsonNull,
            display_order: field.display_order,
            active: field.active,
          },
        });
      }

      return db.admissionFormDefinition.findFirst({
        where: { id: form.id, tenant_id: tenantId },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
          _count: { select: { applications: true } },
        },
      });
    });
  }

  // ─── Find All ─────────────────────────────────────────────────────────────

  async findAll(tenantId: string, query: ListFormDefinitionsQuery) {
    const { page, pageSize, status } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.AdmissionFormDefinitionWhereInput = {
      tenant_id: tenantId,
    };

    if (status) {
      where.status = status;
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return Promise.all([
        db.admissionFormDefinition.findMany({
          where,
          skip,
          take: pageSize,
          orderBy: { created_at: 'desc' },
          include: {
            _count: { select: { fields: true, applications: true } },
          },
        }),
        db.admissionFormDefinition.count({ where }),
      ]);
    })) as [FormDefinitionListItem[], number];

    const [data, total] = result;

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── Find One ─────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const form = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.admissionFormDefinition.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
          _count: { select: { applications: true } },
        },
      });
    })) as FormDefinitionDetail | null;

    if (!form) {
      throw new NotFoundException({
        error: {
          code: 'FORM_NOT_FOUND',
          message: `Admission form with id "${id}" not found`,
        },
      });
    }

    return form;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(tenantId: string, id: string, dto: UpdateFormDefinitionDto) {
    this.validateFields(dto.fields);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.admissionFormDefinition.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          error: {
            code: 'FORM_NOT_FOUND',
            message: `Admission form with id "${id}" not found`,
          },
        });
      }

      // Optimistic concurrency check
      if (
        dto.expected_updated_at &&
        existing.updated_at.toISOString() !== dto.expected_updated_at
      ) {
        throw new BadRequestException({
          error: {
            code: 'CONCURRENT_MODIFICATION',
            message: 'The form has been modified by another user. Please reload and try again.',
          },
        });
      }

      // Draft forms can be edited in-place
      if (existing.status === 'draft') {
        // Delete existing fields and recreate
        await db.admissionFormField.deleteMany({
          where: { form_definition_id: id, tenant_id: tenantId },
        });

        await db.admissionFormDefinition.update({
          where: { id },
          data: { name: dto.name },
        });

        for (const field of dto.fields) {
          await db.admissionFormField.create({
            data: {
              tenant_id: tenantId,
              form_definition_id: id,
              field_key: field.field_key,
              label: field.label,
              help_text: field.help_text ?? null,
              field_type: field.field_type,
              required: field.required,
              visible_to_parent: field.visible_to_parent,
              visible_to_staff: field.visible_to_staff,
              searchable: field.searchable,
              reportable: field.reportable,
              options_json: field.options_json ?? Prisma.JsonNull,
              validation_rules_json: field.validation_rules_json ?? Prisma.JsonNull,
              conditional_visibility_json: field.conditional_visibility_json ?? Prisma.JsonNull,
              display_order: field.display_order,
              active: field.active,
            },
          });
        }

        return db.admissionFormDefinition.findFirst({
          where: { id, tenant_id: tenantId },
          include: {
            fields: { orderBy: { display_order: 'asc' } },
            _count: { select: { applications: true } },
          },
        });
      }

      // Published forms: create a new version
      if (existing.status === 'published') {
        const baseFormId = existing.base_form_id ?? existing.id;

        // Find the highest version number in this lineage
        const latestVersion = await db.admissionFormDefinition.findFirst({
          where: { base_form_id: baseFormId, tenant_id: tenantId },
          orderBy: { version_number: 'desc' },
        });

        const newVersionNumber = (latestVersion?.version_number ?? 0) + 1;

        const newForm = await db.admissionFormDefinition.create({
          data: {
            tenant_id: tenantId,
            name: dto.name,
            base_form_id: baseFormId,
            version_number: newVersionNumber,
            status: 'draft',
          },
        });

        for (const field of dto.fields) {
          await db.admissionFormField.create({
            data: {
              tenant_id: tenantId,
              form_definition_id: newForm.id,
              field_key: field.field_key,
              label: field.label,
              help_text: field.help_text ?? null,
              field_type: field.field_type,
              required: field.required,
              visible_to_parent: field.visible_to_parent,
              visible_to_staff: field.visible_to_staff,
              searchable: field.searchable,
              reportable: field.reportable,
              options_json: field.options_json ?? Prisma.JsonNull,
              validation_rules_json: field.validation_rules_json ?? Prisma.JsonNull,
              conditional_visibility_json: field.conditional_visibility_json ?? Prisma.JsonNull,
              display_order: field.display_order,
              active: field.active,
            },
          });
        }

        return db.admissionFormDefinition.findFirst({
          where: { id: newForm.id, tenant_id: tenantId },
          include: {
            fields: { orderBy: { display_order: 'asc' } },
            _count: { select: { applications: true } },
          },
        });
      }

      throw new BadRequestException({
        error: {
          code: 'FORM_NOT_EDITABLE',
          message: `Cannot edit a form with status "${existing.status}"`,
        },
      });
    });
  }

  // ─── Publish ──────────────────────────────────────────────────────────────

  async publish(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const form = await db.admissionFormDefinition.findFirst({
        where: { id, tenant_id: tenantId },
        include: { fields: true },
      });

      if (!form) {
        throw new NotFoundException({
          error: {
            code: 'FORM_NOT_FOUND',
            message: `Admission form with id "${id}" not found`,
          },
        });
      }

      if (form.status !== 'draft') {
        throw new BadRequestException({
          error: {
            code: 'INVALID_STATUS_TRANSITION',
            message: `Cannot publish a form with status "${form.status}". Only draft forms can be published.`,
          },
        });
      }

      if (form.fields.length === 0) {
        throw new BadRequestException({
          error: {
            code: 'NO_FIELDS',
            message: 'Cannot publish a form with no fields',
          },
        });
      }

      const baseFormId = form.base_form_id ?? form.id;

      // Archive all other published forms in this lineage
      await db.admissionFormDefinition.updateMany({
        where: {
          tenant_id: tenantId,
          base_form_id: baseFormId,
          status: 'published',
          id: { not: id },
        },
        data: { status: 'archived' },
      });

      await db.admissionFormDefinition.update({
        where: { id },
        data: { status: 'published' },
      });

      return db.admissionFormDefinition.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
          _count: { select: { applications: true } },
        },
      });
    });
  }

  // ─── Archive ──────────────────────────────────────────────────────────────

  async archive(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const form = await db.admissionFormDefinition.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!form) {
        throw new NotFoundException({
          error: {
            code: 'FORM_NOT_FOUND',
            message: `Admission form with id "${id}" not found`,
          },
        });
      }

      if (form.status === 'archived') {
        throw new BadRequestException({
          error: {
            code: 'ALREADY_ARCHIVED',
            message: 'Form is already archived',
          },
        });
      }

      await db.admissionFormDefinition.update({
        where: { id },
        data: { status: 'archived' },
      });

      return db.admissionFormDefinition.findFirst({
        where: { id, tenant_id: tenantId },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
          _count: { select: { applications: true } },
        },
      });
    });
  }

  // ─── Get Versions ─────────────────────────────────────────────────────────

  async getVersions(tenantId: string, id: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const form = await db.admissionFormDefinition.findFirst({
        where: { id, tenant_id: tenantId },
      });

      if (!form) {
        throw new NotFoundException({
          error: {
            code: 'FORM_NOT_FOUND',
            message: `Admission form with id "${id}" not found`,
          },
        });
      }

      const baseFormId = form.base_form_id ?? form.id;

      return db.admissionFormDefinition.findMany({
        where: { base_form_id: baseFormId, tenant_id: tenantId },
        orderBy: { version_number: 'desc' },
        include: {
          _count: { select: { fields: true, applications: true } },
        },
      });
    });
  }

  // ─── Get Published Form (Public) ──────────────────────────────────────────

  async getPublishedForm(tenantId: string) {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const form = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.admissionFormDefinition.findFirst({
        where: { tenant_id: tenantId, status: 'published' },
        include: {
          fields: {
            where: { active: true, visible_to_parent: true },
            orderBy: { display_order: 'asc' },
          },
        },
      });
    })) as FormDefinitionDetail | null;

    if (!form) {
      throw new NotFoundException({
        error: {
          code: 'NO_PUBLISHED_FORM',
          message: 'No published admission form found for this school',
        },
      });
    }

    return form;
  }

  // ─── Create System Form ─────────────────────────────────────────────────

  /**
   * Creates and publishes a system admission form with fields matching the
   * Registration Wizard exactly. If a published system form already exists,
   * returns it without creating a duplicate.
   */
  async createSystemForm(tenantId: string) {
    const prismaWithRls = createRlsClient(this.prisma, {
      tenant_id: tenantId,
    });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Check if a system form already exists
      const existing = await db.admissionFormDefinition.findFirst({
        where: {
          tenant_id: tenantId,
          name: 'System Application Form',
          status: { in: ['draft', 'published'] },
        },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
          _count: { select: { applications: true } },
        },
      });

      if (existing) {
        return existing;
      }

      // Define canonical fields matching the Registration Wizard
      const systemFields = this.getSystemFormFields();

      const form = await db.admissionFormDefinition.create({
        data: {
          tenant_id: tenantId,
          name: 'System Application Form',
          version_number: 1,
          status: 'published',
        },
      });

      await db.admissionFormDefinition.update({
        where: { id: form.id },
        data: { base_form_id: form.id },
      });

      for (const field of systemFields) {
        await db.admissionFormField.create({
          data: {
            tenant_id: tenantId,
            form_definition_id: form.id,
            field_key: field.field_key,
            label: field.label,
            help_text: field.help_text ?? null,
            field_type: field.field_type,
            required: field.required,
            visible_to_parent: true,
            visible_to_staff: true,
            searchable: field.searchable ?? false,
            reportable: field.reportable ?? false,
            options_json: field.options_json ?? Prisma.JsonNull,
            validation_rules_json: Prisma.JsonNull,
            conditional_visibility_json: Prisma.JsonNull,
            display_order: field.display_order,
            active: true,
          },
        });
      }

      // Archive any previously published forms
      await db.admissionFormDefinition.updateMany({
        where: {
          tenant_id: tenantId,
          status: 'published',
          id: { not: form.id },
        },
        data: { status: 'archived' },
      });

      return db.admissionFormDefinition.findFirst({
        where: { id: form.id, tenant_id: tenantId },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
          _count: { select: { applications: true } },
        },
      });
    });
  }

  /**
   * Returns the canonical field definitions matching the Registration Wizard.
   * Email is mandatory for online applications.
   */
  private getSystemFormFields(): Array<{
    field_key: string;
    label: string;
    help_text?: string;
    field_type: ApplicationFieldType;
    required: boolean;
    searchable?: boolean;
    reportable?: boolean;
    options_json?: Array<{ value: string; label: string }>;
    display_order: number;
  }> {
    let order = 0;
    return [
      // ── Parent/Guardian 1 ──
      {
        field_key: 'parent1_first_name',
        label: 'Parent/Guardian First Name',
        field_type: 'short_text',
        required: true,
        searchable: true,
        display_order: order++,
      },
      {
        field_key: 'parent1_last_name',
        label: 'Parent/Guardian Last Name',
        field_type: 'short_text',
        required: true,
        searchable: true,
        display_order: order++,
      },
      {
        field_key: 'parent1_email',
        label: 'Parent/Guardian Email',
        field_type: 'email',
        required: true,
        searchable: true,
        help_text: 'Required for online applications',
        display_order: order++,
      },
      {
        field_key: 'parent1_phone',
        label: 'Parent/Guardian Phone',
        field_type: 'phone',
        required: true,
        display_order: order++,
      },
      {
        field_key: 'parent1_relationship',
        label: 'Relationship to Student',
        field_type: 'single_select',
        required: true,
        options_json: [
          { value: 'father', label: 'Father' },
          { value: 'mother', label: 'Mother' },
          { value: 'guardian', label: 'Guardian' },
          { value: 'other', label: 'Other' },
        ],
        display_order: order++,
      },

      // ── Parent/Guardian 2 (optional) ──
      {
        field_key: 'parent2_first_name',
        label: 'Second Parent First Name',
        field_type: 'short_text',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'parent2_last_name',
        label: 'Second Parent Last Name',
        field_type: 'short_text',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'parent2_email',
        label: 'Second Parent Email',
        field_type: 'email',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'parent2_phone',
        label: 'Second Parent Phone',
        field_type: 'phone',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'parent2_relationship',
        label: 'Second Parent Relationship',
        field_type: 'single_select',
        required: false,
        options_json: [
          { value: 'father', label: 'Father' },
          { value: 'mother', label: 'Mother' },
          { value: 'guardian', label: 'Guardian' },
          { value: 'other', label: 'Other' },
        ],
        display_order: order++,
      },

      // ── Household / Address ──
      {
        field_key: 'address_line_1',
        label: 'Address Line 1',
        field_type: 'short_text',
        required: true,
        display_order: order++,
      },
      {
        field_key: 'address_line_2',
        label: 'Address Line 2',
        field_type: 'short_text',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'city',
        label: 'City',
        field_type: 'short_text',
        required: true,
        display_order: order++,
      },
      {
        field_key: 'country',
        label: 'Country',
        field_type: 'country',
        required: true,
        display_order: order++,
      },
      {
        field_key: 'postal_code',
        label: 'Postal Code',
        field_type: 'short_text',
        required: false,
        display_order: order++,
      },

      // ── Emergency Contact ──
      {
        field_key: 'emergency_name',
        label: 'Emergency Contact Name',
        field_type: 'short_text',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'emergency_phone',
        label: 'Emergency Contact Phone',
        field_type: 'phone',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'emergency_relationship',
        label: 'Emergency Contact Relationship',
        field_type: 'short_text',
        required: false,
        display_order: order++,
      },

      // ── Student ──
      {
        field_key: 'student_first_name',
        label: 'Student First Name',
        field_type: 'short_text',
        required: true,
        searchable: true,
        display_order: order++,
      },
      {
        field_key: 'student_middle_name',
        label: 'Student Middle Name',
        field_type: 'short_text',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'student_last_name',
        label: 'Student Last Name',
        field_type: 'short_text',
        required: true,
        searchable: true,
        display_order: order++,
      },
      {
        field_key: 'student_dob',
        label: 'Date of Birth',
        field_type: 'date',
        required: true,
        display_order: order++,
      },
      {
        field_key: 'student_gender',
        label: 'Gender',
        field_type: 'single_select',
        required: true,
        options_json: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ],
        reportable: true,
        display_order: order++,
      },
      {
        field_key: 'student_year_group',
        label: 'Year Group',
        field_type: 'short_text',
        required: true,
        help_text: 'The year/grade the student is applying for',
        reportable: true,
        display_order: order++,
      },
      {
        field_key: 'student_national_id',
        label: 'National ID',
        field_type: 'short_text',
        required: true,
        display_order: order++,
      },
      {
        field_key: 'student_medical_notes',
        label: 'Medical Notes',
        field_type: 'long_text',
        required: false,
        display_order: order++,
      },
      {
        field_key: 'student_allergies',
        label: 'Has Allergies',
        field_type: 'yes_no',
        required: false,
        display_order: order++,
      },
    ];
  }

  // ─── Data Minimisation ────────────────────────────────────────────────────

  validateFieldsForDataMinimisation(
    fields: Array<{ field_key: string; label: string }>,
  ): DataMinimisationWarning[] {
    return detectSpecialCategoryFields(fields);
  }

  /**
   * Log data minimisation overrides to audit_logs when an admin
   * justifies keeping special category fields in an admissions form.
   */
  async logDataMinimisationOverrides(
    tenantId: string,
    userId: string,
    formId: string,
    overrides: Array<{
      field_key: string;
      field_label: string;
      matched_keyword: string;
      justification: string;
    }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const override of overrides) {
        await tx.auditLog.create({
          data: {
            tenant_id: tenantId,
            actor_user_id: userId,
            entity_type: 'admission_form_field',
            entity_id: formId,
            action: 'data_minimisation_override',
            metadata_json: {
              field_key: override.field_key,
              field_label: override.field_label,
              matched_keyword: override.matched_keyword,
              justification: override.justification,
              dpc_guidance: 'August 2025 — special category data at pre-enrolment',
            } as Prisma.InputJsonValue,
            ip_address: null,
          },
        });
      }
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private validateFields(fields: FormFieldInput[]): void {
    // Validate unique field_keys
    const keys = fields.map((f) => f.field_key);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      const duplicates = keys.filter((k, i) => keys.indexOf(k) !== i);
      throw new BadRequestException({
        error: {
          code: 'DUPLICATE_FIELD_KEYS',
          message: `Duplicate field keys found: ${[...new Set(duplicates)].join(', ')}`,
        },
      });
    }

    // Validate select types have options
    for (const field of fields) {
      if (
        (field.field_type === 'single_select' || field.field_type === 'multi_select') &&
        (!field.options_json || field.options_json.length === 0)
      ) {
        throw new BadRequestException({
          error: {
            code: 'SELECT_REQUIRES_OPTIONS',
            message: `Field "${field.field_key}" is a ${field.field_type} but has no options`,
          },
        });
      }
    }

    // Validate conditional visibility references
    for (const field of fields) {
      if (field.conditional_visibility_json) {
        const depKey = field.conditional_visibility_json.depends_on_field_key;
        if (!uniqueKeys.has(depKey)) {
          throw new BadRequestException({
            error: {
              code: 'INVALID_CONDITIONAL_REFERENCE',
              message: `Field "${field.field_key}" has conditional visibility referencing unknown field "${depKey}"`,
            },
          });
        }
      }
    }
  }
}
