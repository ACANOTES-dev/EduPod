# Implementation 04 — Form Service Simplification

> **Wave:** 2 (parallelizable with 02, 03, 05)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Simplify `apps/api/src/modules/admissions/admission-forms.service.ts` so there is exactly one system form per tenant, auto-generated from the same field set the walk-in `RegistrationWizard` collects. Delete every code path that assumes multiple custom forms, form versioning, admin-driven form CRUD, or the form builder. The frontend delete happens in Wave 4 (impl 13 keeps a read-only preview, impl 15 deletes the old pages entirely).

## Why this matters

The user doesn't want to maintain two separate form definitions. The walk-in wizard and the public online form must always ask for the same things. The plan is to make the walk-in wizard tenant-configurable eventually — and when that happens, the public form should inherit the configuration automatically, with zero dual-maintenance.

This implementation codifies the "one form, generated from wizard field set" contract.

## What to change

### 1. Slim down `admission-forms.service.ts`

Keep only these methods (delete everything else):

```ts
@Injectable()
export class AdmissionFormsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public endpoint — parents fetching the form to fill in. */
  async getPublishedForm(tenantId: string): Promise<PublishedForm>;

  /**
   * Admin endpoint — called from the form-preview page to rebuild
   * the tenant's single system form from the canonical wizard field set.
   * Idempotent: replaces the existing system form with a new version
   * if the wizard field definitions have changed.
   */
  async rebuildSystemForm(tenantId: string, actingUserId: string): Promise<PublishedForm>;

  /**
   * Called at tenant provisioning time (bootstrap).
   * If no system form exists, creates one. Idempotent.
   */
  async ensureSystemForm(tenantId: string): Promise<PublishedForm>;

  /**
   * Returns the single system form definition for this tenant, creating
   * it if missing. Used by other services (e.g. the state machine at
   * submission time) to resolve form_definition_id.
   */
  async getSystemFormDefinitionId(tenantId: string): Promise<string>;
}
```

Delete: `create`, `findAll`, `update`, `delete`, `publish`, `archive`, `listVersions`, `validateFieldsForDataMinimisation`, `logDataMinimisationOverrides`, and `getSystemFormFields` (the last one is moved — see below).

### 2. Move the canonical field set to shared

The current `admission-forms.service.ts` has a private `getSystemFormFields()` method returning the canonical list. Move this to `packages/shared/src/admissions/system-form-fields.ts` and export it as a pure-data constant. This makes it importable by both the API service and the frontend form-preview page without crossing module boundaries.

```ts
// packages/shared/src/admissions/system-form-fields.ts
export const SYSTEM_FORM_FIELDS = [
  // Parent 1
  {
    field_key: 'parent1_first_name',
    label: 'Parent/Guardian First Name',
    field_type: 'short_text',
    required: true,
    display_order: 0,
  },
  // ... (full list from the existing service)
  // + target_academic_year (new in this rebuild)
  // + target_year_group (new in this rebuild)
];
```

**Important:** add two new fields to the list that did not exist before:

```ts
{
  field_key: 'target_academic_year_id',
  label: 'Target Academic Year',
  field_type: 'single_select',
  required: true,
  // Options are resolved server-side at form fetch time, based on the tenant's
  // configured horizon. Leave options_json empty in the static list.
  display_order: /* before student fields */,
},
{
  field_key: 'target_year_group_id',
  label: 'Target Year Group',
  field_type: 'single_select',
  required: true,
  display_order: /* right after target_academic_year_id */,
},
```

### 3. `getPublishedForm()` resolves dropdown options dynamically

At request time, the service must fetch:

- Available academic years inside the tenant's horizon (current + up to `tenantSettings.admissions.max_application_horizon_years` ahead). Populate `options_json` for `target_academic_year_id`.
- Available year groups (all of them). Populate `options_json` for `target_year_group_id`.

Return the form definition with these options resolved. The frontend's `DynamicFormRenderer` already supports select fields, so no frontend change is needed to consume this.

### 4. `rebuildSystemForm()` behaviour

- Load the existing system form for the tenant (if any).
- Compare current fields against `SYSTEM_FORM_FIELDS`.
- If identical, return the existing form (no-op).
- If different, transactionally:
  1. Archive the existing form (`status = 'archived'`).
  2. Create a new form definition linked to the same `base_form_id` (or new if this is the first).
  3. Insert the field rows from `SYSTEM_FORM_FIELDS`.
  4. Mark the new form as `published`.
  5. **Do not** repoint existing applications' `form_definition_id` — they keep referencing their original form so their payload displays correctly in the detail page.
- Write an audit log entry (actor, action: `admission_form_rebuilt`).

### 5. `ensureSystemForm()`

Called once per tenant at bootstrap. If no form exists for the tenant, calls `rebuildSystemForm` internally. Called:

- From tenant provisioning (wherever that currently lives).
- As a safety net at the top of `getPublishedForm` — if no form, build it on demand, then fetch.

### 6. Controller surface — `admission-forms.controller.ts`

Reduce to:

```ts
@Controller('v1/admission-forms')
export class AdmissionFormsController {
  constructor(private readonly service: AdmissionFormsService) {}

  @Get('system')
  @RequiresPermission('admissions.view')
  async getSystemForm(@CurrentTenant() tenant: TenantContext) {
    return this.service.getPublishedForm(tenant.tenant_id);
  }

  @Post('system/rebuild')
  @RequiresPermission('admissions.manage')
  async rebuildSystemForm(@CurrentTenant() tenant: TenantContext, @CurrentUser() user) {
    return this.service.rebuildSystemForm(tenant.tenant_id, user.id);
  }
}
```

Delete every other endpoint in the controller. The public-admissions controller stays as-is (it already calls `getPublishedForm`).

### 7. Permissions

Add two permissions to the RBAC seed/config if they don't already exist:

- `admissions.view` — staff roles.
- `admissions.manage` — admin roles.

### 8. Data minimisation checks

The existing `validateFieldsForDataMinimisation` function exists because the old form builder allowed admins to add arbitrary fields. Since we no longer have a builder, this check is dead code — delete it. The canonical field set has already been audited to comply with DPC guidance on pre-enrolment data minimisation; if the list changes, a dev reviews it at code time.

## Tests

`admission-forms.service.spec.ts` — rewrite.

- `ensureSystemForm`: creates when missing, no-op when present.
- `rebuildSystemForm`: creates new version when field set differs, archives old, preserves existing application references.
- `getPublishedForm`: returns form with academic year + year group options populated from live DB.
- Horizon respected: tenant with `max_application_horizon_years = 2` sees current year + 2 future years in the options.
- Cross-tenant isolation (RLS leakage test).
- `getSystemFormDefinitionId` returns the right id after rebuild.

## Deployment

1. Commit locally.
2. Patch → production.
3. Build `@school/api`, restart api.
4. Smoke test: `curl -H "Cookie: ..." https://nhqs.edupod.app/api/v1/admission-forms/system` should return a form definition with `target_academic_year_id` and `target_year_group_id` as select fields populated with year options.
5. Update `IMPLEMENTATION_LOG.md`.

## Definition of done

- Service slimmed to the four methods listed.
- Canonical field set moved to `@school/shared`.
- Controller reduced to two endpoints.
- Tests rewritten, passing.
- API restarted on production.
- Completion record added to the log.

## Notes for downstream implementations

- **11 (queue sub-pages)** doesn't touch forms.
- **13 (form preview page)** fetches via `GET /v1/admission-forms/system` and displays read-only + offers a "Rebuild from wizard" button that calls `POST /v1/admission-forms/system/rebuild`.
- **14 (public form)** fetches via `GET /v1/public/admissions/form` which the public controller already implements — just ensure it reaches the simplified service correctly.
- **15 (cleanup)** will delete the old frontend pages under `admissions/forms/*` entirely.
