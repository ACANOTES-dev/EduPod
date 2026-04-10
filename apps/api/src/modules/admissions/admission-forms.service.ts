import { Injectable } from '@nestjs/common';
import { ApplicationFieldType, Prisma } from '@prisma/client';

import {
  DYNAMIC_OPTION_FIELD_KEYS,
  SYSTEM_FORM_FIELDS,
  SYSTEM_FORM_NAME,
} from '@school/shared/admissions';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { SettingsService } from '../configuration/settings.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Published form shape returned to API consumers ──────────────────────────

export interface PublishedFormField {
  id: string;
  tenant_id: string;
  form_definition_id: string;
  field_key: string;
  label: string;
  help_text: string | null;
  field_type: ApplicationFieldType;
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

export interface PublishedForm {
  id: string;
  tenant_id: string;
  name: string;
  base_form_id: string | null;
  version_number: number;
  status: string;
  created_at: Date;
  updated_at: Date;
  fields: PublishedFormField[];
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class AdmissionFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly academicReadFacade: AcademicReadFacade,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns the single published system form for the tenant with dropdown
   * options for dynamic fields (target academic year, target year group)
   * resolved from live DB state. Used by the public admissions controller
   * and the admin form-preview page.
   */
  async getPublishedForm(tenantId: string): Promise<PublishedForm> {
    await this.ensureSystemForm(tenantId);

    const form = await this.loadPublishedSystemForm(tenantId);

    const [academicYearOptions, yearGroupOptions] = await Promise.all([
      this.loadAcademicYearOptions(tenantId),
      this.loadYearGroupOptions(tenantId),
    ]);

    const fields = form.fields.map((field) => {
      if (field.field_key === 'target_academic_year_id') {
        return { ...field, options_json: academicYearOptions as Prisma.JsonValue };
      }
      if (field.field_key === 'target_year_group_id') {
        return { ...field, options_json: yearGroupOptions as Prisma.JsonValue };
      }
      return field;
    });

    return { ...form, fields };
  }

  /**
   * Rebuilds the tenant's single system form from SYSTEM_FORM_FIELDS.
   * Idempotent: if the existing published form already matches the canonical
   * field set, returns it unchanged. Otherwise archives the existing form
   * and creates a new published version in the same lineage. Existing
   * applications keep referencing their original form_definition_id.
   */
  async rebuildSystemForm(tenantId: string, actingUserId: string | null): Promise<PublishedForm> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const existing = await db.admissionFormDefinition.findFirst({
        where: {
          tenant_id: tenantId,
          name: SYSTEM_FORM_NAME,
          status: 'published',
        },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
        },
      });

      if (existing && this.fieldsMatchCanonical(existing.fields)) {
        return existing;
      }

      // Archive all existing published forms in the lineage (or any stray
      // published system forms from prior migrations).
      const baseFormId = existing?.base_form_id ?? existing?.id ?? null;

      if (existing) {
        await db.admissionFormDefinition.updateMany({
          where: {
            tenant_id: tenantId,
            status: 'published',
            OR: baseFormId
              ? [{ base_form_id: baseFormId }, { id: baseFormId }]
              : [{ name: SYSTEM_FORM_NAME }],
          },
          data: { status: 'archived' },
        });
      }

      const latestVersion = baseFormId
        ? await db.admissionFormDefinition.findFirst({
            where: {
              tenant_id: tenantId,
              OR: [{ base_form_id: baseFormId }, { id: baseFormId }],
            },
            orderBy: { version_number: 'desc' },
          })
        : null;

      const nextVersionNumber = (latestVersion?.version_number ?? 0) + 1;

      const newForm = await db.admissionFormDefinition.create({
        data: {
          tenant_id: tenantId,
          name: SYSTEM_FORM_NAME,
          base_form_id: baseFormId,
          version_number: nextVersionNumber,
          status: 'published',
        },
      });

      // If this is the first form in the lineage, point base_form_id at itself.
      if (!baseFormId) {
        await db.admissionFormDefinition.update({
          where: { id: newForm.id },
          data: { base_form_id: newForm.id },
        });
      }

      for (const field of SYSTEM_FORM_FIELDS) {
        await db.admissionFormField.create({
          data: {
            tenant_id: tenantId,
            form_definition_id: newForm.id,
            field_key: field.field_key,
            label: field.label,
            help_text: field.help_text ?? null,
            field_type: field.field_type as ApplicationFieldType,
            required: field.required,
            visible_to_parent: true,
            visible_to_staff: true,
            searchable: field.searchable ?? false,
            reportable: field.reportable ?? false,
            options_json: field.options_json
              ? (field.options_json as unknown as Prisma.InputJsonValue)
              : Prisma.JsonNull,
            validation_rules_json: Prisma.JsonNull,
            conditional_visibility_json: Prisma.JsonNull,
            display_order: field.display_order,
            active: true,
          },
        });
      }

      await db.auditLog.create({
        data: {
          tenant_id: tenantId,
          actor_user_id: actingUserId ?? null,
          entity_type: 'admission_form_definition',
          entity_id: newForm.id,
          action: 'admission_form_rebuilt',
          metadata_json: {
            version_number: nextVersionNumber,
            field_count: SYSTEM_FORM_FIELDS.length,
          } satisfies Prisma.InputJsonValue,
        },
      });

      const withFields = await db.admissionFormDefinition.findFirstOrThrow({
        where: { id: newForm.id, tenant_id: tenantId },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
        },
      });

      return withFields;
    });

    return result as PublishedForm;
  }

  /**
   * Ensures a published system form exists for the tenant. Idempotent —
   * if one already exists, it is returned unchanged. Called at tenant
   * provisioning time and as a safety net inside getPublishedForm.
   *
   * Note: this is called from contexts without an acting user (bootstrap,
   * public form fetch). The audit log entry written by the internal rebuild
   * uses a null actor which is valid per the AuditLog schema.
   */
  async ensureSystemForm(tenantId: string): Promise<PublishedForm> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const existing = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.admissionFormDefinition.findFirst({
        where: {
          tenant_id: tenantId,
          name: SYSTEM_FORM_NAME,
          status: 'published',
        },
        include: {
          fields: { orderBy: { display_order: 'asc' } },
        },
      });
    })) as PublishedForm | null;

    if (existing) {
      return existing;
    }

    return this.rebuildSystemForm(tenantId, null);
  }

  /**
   * Returns the id of the tenant's single published system form. Used by
   * other services (e.g. the applications creation path) to resolve the
   * form_definition_id without re-fetching the full form payload.
   */
  async getSystemFormDefinitionId(tenantId: string): Promise<string> {
    const form = await this.ensureSystemForm(tenantId);
    return form.id;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async loadPublishedSystemForm(tenantId: string): Promise<PublishedForm> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const form = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.admissionFormDefinition.findFirstOrThrow({
        where: {
          tenant_id: tenantId,
          name: SYSTEM_FORM_NAME,
          status: 'published',
        },
        include: {
          fields: {
            where: { active: true, visible_to_parent: true },
            orderBy: { display_order: 'asc' },
          },
        },
      });
    })) as PublishedForm;

    return form;
  }

  /**
   * Returns true when the stored fields exactly match SYSTEM_FORM_FIELDS
   * (ignoring dynamic option fields whose options_json is populated at
   * request time). Used by rebuildSystemForm to short-circuit no-op rebuilds.
   */
  private fieldsMatchCanonical(
    storedFields: Array<{
      field_key: string;
      label: string;
      help_text: string | null;
      field_type: ApplicationFieldType;
      required: boolean;
      searchable: boolean;
      reportable: boolean;
      display_order: number;
      options_json: Prisma.JsonValue;
    }>,
  ): boolean {
    if (storedFields.length !== SYSTEM_FORM_FIELDS.length) {
      return false;
    }

    for (let i = 0; i < SYSTEM_FORM_FIELDS.length; i++) {
      const canonical = SYSTEM_FORM_FIELDS[i]!;
      const stored = storedFields[i]!;

      if (
        stored.field_key !== canonical.field_key ||
        stored.label !== canonical.label ||
        stored.field_type !== canonical.field_type ||
        stored.required !== canonical.required ||
        stored.display_order !== canonical.display_order ||
        (stored.help_text ?? undefined) !== canonical.help_text ||
        stored.searchable !== (canonical.searchable ?? false) ||
        stored.reportable !== (canonical.reportable ?? false)
      ) {
        return false;
      }

      // Options match only for non-dynamic fields. Dynamic option fields
      // are resolved at request time so their stored options_json is
      // meaningless and must not trigger a rebuild.
      if (!DYNAMIC_OPTION_FIELD_KEYS.has(canonical.field_key)) {
        const canonicalOptions = canonical.options_json ?? null;
        const storedOptions = stored.options_json ?? null;
        if (JSON.stringify(canonicalOptions) !== JSON.stringify(storedOptions)) {
          return false;
        }
      }
    }

    return true;
  }

  private async loadAcademicYearOptions(
    tenantId: string,
  ): Promise<Array<{ value: string; label: string }>> {
    const admissionsSettings = await this.settingsService.getModuleSettings(tenantId, 'admissions');
    const horizonYears = admissionsSettings.max_application_horizon_years;

    const cutoff = addYears(new Date(), horizonYears);
    const years = await this.academicReadFacade.findAcademicYearsWithinHorizon(tenantId, cutoff);
    return years.map((year) => ({ value: year.id, label: year.name }));
  }

  private async loadYearGroupOptions(
    tenantId: string,
  ): Promise<Array<{ value: string; label: string }>> {
    const yearGroups = await this.academicReadFacade.findAllYearGroupsWithOrder(tenantId);
    return yearGroups.map((group) => ({ value: group.id, label: group.name }));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addYears(date: Date, years: number): Date {
  const copy = new Date(date.getTime());
  copy.setFullYear(copy.getFullYear() + years);
  return copy;
}
