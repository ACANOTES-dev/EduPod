# Implementation 03 — Settings & Templates Backend

**Wave:** 2 (backend fan-out)
**Depends on:** 01 (database foundation)
**Blocks:** 04 (generation backend depends on template content_scope), 09 (frontend wizard + settings)
**Can run in parallel with:** 02, 05, 06
**Complexity:** medium (CRUD services, JSONB payload validation, file upload for signature)

---

## 1. Purpose

Build the tenant settings service (powers the Settings page and feeds defaults into the generation wizard) and refactor the existing template service to support the new "content scope" concept. This implementation also introduces the principal signature upload/retrieval flow.

**Authoritative design:** `report-card-spec/design-spec.md` Sections 5.5, 5.8, 13, 15.

---

## 2. Scope

### In scope

1. `ReportCardTenantSettingsService` + controller — CRUD for the single settings row per tenant
2. Refactor of `ReportCardTemplateService` to support content-scope and enumerate language variants
3. Principal signature upload endpoint (stores image in tenant-scoped storage, updates settings)
4. Default settings row bootstrapping — if a tenant doesn't have a row, lazily create one from defaults
5. Unit + integration + RLS tests

### Out of scope

- Frontend pages (impl 09)
- Generation service changes (impl 04)
- Comment services (impl 02)

---

## 3. Prerequisites

1. Impl 01 merged — `report_card_tenant_settings` table and `ReportCardTemplate.content_scope` column exist
2. Default tenant settings seed rows exist (seeded in impl 01)
3. Default "Grades Only" template rows exist for `en` + `ar` per tenant
4. `turbo test` green on main

---

## 4. Task breakdown

### 4.1 `ReportCardTenantSettingsService`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-tenant-settings.service.ts`

**Methods:**

```ts
class ReportCardTenantSettingsService {
  get(tenantId: string): Promise<ReportCardTenantSettings>; // creates default if missing
  update(
    tenantId: string,
    actor: User,
    dto: UpdateTenantSettingsDto,
  ): Promise<ReportCardTenantSettings>;

  uploadPrincipalSignature(
    tenantId: string,
    actor: User,
    file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ storage_key: string }>;

  deletePrincipalSignature(tenantId: string, actor: User): Promise<void>;
}
```

**Key behaviours:**

- `get` — uses `findFirst` on `(tenant_id)`. If missing, inserts a default row (defined in `@school/shared` tenant settings schema `defaultSettings` constant) and returns it. Lazy bootstrap covers tenants created before impl 01.
- `update` — partial update. Merges the incoming DTO into the existing `settings_json` payload. Validates the merged payload with the full Zod schema before persisting.
- `uploadPrincipalSignature` — validates file type (`image/png`, `image/jpeg`, `image/webp`, max 2MB), stores under `tenant/{tenant_id}/report-cards/principal-signature.{ext}` in the existing storage provider, updates `settings_json.principal_signature_storage_key`. Overwrites if one already exists.
- `deletePrincipalSignature` — removes the file from storage, clears the key in settings.

**Validation notes:**

- The `settings_json` payload is validated by the full `tenantSettingsSchema` from `@school/shared` on every write — the merge happens in-memory, then the full payload is re-validated before persisting.
- Empty/null fields in the DTO mean "don't touch" (partial update), not "clear".
- To explicitly clear a field, the caller sends `null` AND the Zod schema allows that field to be null.

### 4.2 `ReportCardTenantSettingsController`

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-tenant-settings.controller.ts`

**Routes:**

```
GET    /v1/report-card-tenant-settings                       — read                                   (report_cards.view)
PATCH  /v1/report-card-tenant-settings                       — update                                 (report_cards.manage)
POST   /v1/report-card-tenant-settings/principal-signature   — upload (multipart/form-data)           (report_cards.manage)
DELETE /v1/report-card-tenant-settings/principal-signature   — delete signature                       (report_cards.manage)
```

Use NestJS `@UploadedFile()` + `FileInterceptor` for the signature upload. Follow the existing upload pattern in the codebase — search for an existing file upload endpoint (e.g., tenant logo upload) and copy its shape.

### 4.3 `ReportCardTemplateService` refactor

**File:** `apps/api/src/modules/gradebook/report-cards/report-card-template.service.ts` (existing — refactor, don't rewrite)

**Current shape:** read the file to understand. It likely has basic CRUD for templates.

**Refactored methods:**

```ts
class ReportCardTemplateService {
  // NEW — list content-scope template families grouped by scope
  listContentScopes(tenantId: string): Promise<Array<{
    content_scope: ReportCardContentScope;
    name: string;
    locales: Array<{ template_id: string; locale: string }>;
    is_default: boolean;
    is_available: boolean;  // false for scopes that depend on unimplemented modules (homework, attendance, etc.)
  }>>

  // NEW — resolve a content-scope template in the right language for a student
  resolveForGeneration(tenantId: string, {
    contentScope: ReportCardContentScope,
    locale: 'en' | 'ar',
  }): Promise<ReportCardTemplate | null>

  // EXISTING — keep intact for backwards compat with approval flow etc.
  findById(...)
  list(...)
  // etc
}
```

**Key behaviours:**

- `listContentScopes` groups the tenant's templates by `content_scope`, showing which locales are available for each.
- For v1, only `grades_only` is marked `is_available: true`. Other scopes return entries with `is_available: false` so the frontend can show them with "coming soon" badges.
- `resolveForGeneration` is called by the generation service (impl 04) to find the right template row for a given (scope, locale) pair.

### 4.4 Module registration

Update `apps/api/src/modules/gradebook/report-cards/report-card.module.ts`:

- Add `ReportCardTenantSettingsService` and its controller
- `ReportCardTemplateService` is likely already registered — keep it, export it so impl 04 can inject it
- Export `ReportCardTenantSettingsService` so impl 04 (generation) can read tenant defaults

Run DI verification.

---

## 5. Files to create

- `apps/api/src/modules/gradebook/report-cards/report-card-tenant-settings.service.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-tenant-settings.service.spec.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-tenant-settings.controller.ts`
- `apps/api/src/modules/gradebook/report-cards/report-card-tenant-settings.controller.spec.ts`
- `apps/api/test/report-cards/tenant-settings.e2e-spec.ts`
- `apps/api/test/report-cards/templates.e2e-spec.ts` (if none exists; otherwise extend)

## 6. Files to modify

- `apps/api/src/modules/gradebook/report-cards/report-card-template.service.ts` — refactor per §4.3
- `apps/api/src/modules/gradebook/report-cards/report-card-template.service.spec.ts` — add tests for the new methods
- `apps/api/src/modules/gradebook/report-cards/report-card.module.ts` — registration + exports

---

## 7. Testing requirements

### 7.1 Unit tests

**`report-card-tenant-settings.service.spec.ts`:**

- `get` returns the existing row when present
- `get` lazily creates a default row when absent
- `update` merges partial changes into `settings_json`
- `update` re-validates the full payload with the Zod schema and rejects invalid merges
- `uploadPrincipalSignature` rejects wrong mime types
- `uploadPrincipalSignature` rejects files over 2MB
- `uploadPrincipalSignature` overwrites existing key
- `deletePrincipalSignature` removes the key and returns success even if no key was set

**`report-card-template.service.spec.ts` additions:**

- `listContentScopes` groups templates correctly
- `listContentScopes` marks non-grades_only scopes as `is_available: false`
- `resolveForGeneration('grades_only', 'en')` returns the English template
- `resolveForGeneration('grades_only', 'ar')` returns the Arabic template
- `resolveForGeneration('grades_only', 'fr')` returns `null` (no French template for v1)

### 7.2 Integration tests (e2e)

**`tenant-settings.e2e-spec.ts`:**

- `GET /v1/report-card-tenant-settings` returns default when none exists
- `PATCH` with partial payload updates only touched fields
- `PATCH` with invalid payload returns 400
- `POST .../principal-signature` with a valid PNG returns storage key
- `POST .../principal-signature` with a PDF returns 400 `INVALID_FILE_TYPE`
- `DELETE .../principal-signature` clears the key
- Permission: `report_cards.view` can `GET` but not `PATCH` or upload
- RLS: Tenant A can't read Tenant B's settings

**`templates.e2e-spec.ts`:**

- `GET /v1/report-card-templates/content-scopes` returns the grouped list
- Only `grades_only` is marked available
- RLS leakage test for template reads (existing table — still worth verifying)

### 7.3 Regression

```bash
turbo test && turbo lint && turbo type-check
```

---

## 8. Security / RLS checklist

- [ ] Settings writes use RLS transactions
- [ ] File upload validates mime type AND magic bytes (don't trust the mime type alone)
- [ ] File size capped at 2MB
- [ ] Uploaded file path includes `tenant_id` for storage isolation
- [ ] Signature download/embedding happens only at generation time, not via a public URL
- [ ] Permission checks: view vs manage correctly enforced
- [ ] RLS leakage test passes for settings table

---

## 9. Acceptance criteria

1. `ReportCardTenantSettingsService` compiles, tests pass
2. Template service refactor preserves existing behaviour (existing specs still pass)
3. Template service exposes `listContentScopes` and `resolveForGeneration`
4. Settings controller exposes all four routes
5. Signature upload works end-to-end (can be verified with a test file)
6. DI verification passes
7. `turbo test`, `turbo lint`, `turbo type-check` green
8. Log entry added

---

## 10. Architecture doc update check

| File                     | Decision                                                                                                                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module-blast-radius.md` | Likely NO — all within the report-cards module                                                                                                                                                                       |
| `event-job-catalog.md`   | NO                                                                                                                                                                                                                   |
| `state-machines.md`      | NO                                                                                                                                                                                                                   |
| `danger-zones.md`        | **Consider:** "Tenant settings JSONB is validated at write time but NOT at read time — if a migration changes the schema shape, existing rows may fail validation on first read." Add if you think it's non-obvious. |

---

## 11. Completion log stub

```markdown
### Implementation 03: Settings & Templates Backend

- **Completed at:** YYYY-MM-DD HH:MM
- **Completed by:** <agent>
- **Branch / commit:** `<branch>` @ `<sha>`
- **Status:** ✅ complete
- **Summary:** Built tenant settings service with JSONB payload validation, principal signature upload, and refactored template service to support content scopes.

**What changed:**

- New `ReportCardTenantSettingsService` + controller
- `ReportCardTemplateService` refactored to expose `listContentScopes` and `resolveForGeneration`
- Module registration updated
- 2 new e2e test files

**Database changes:**

- None (uses tables from impl 01)

**Test coverage:**

- Unit specs: settings service, template service
- Integration/E2E: tenant-settings.e2e, templates.e2e
- RLS leakage: settings table passing
- `turbo test`, `turbo lint`, `turbo type-check`: ✅

**Architecture docs updated:**

- None required

**Blockers or follow-ups:**

- Implementation 04 (generation) can now consume `listContentScopes` and `resolveForGeneration`
- Implementation 09 (frontend wizard + settings) is unblocked
```

---

## 12. If you get stuck

- **File upload provider unclear:** search the codebase for existing upload endpoints (e.g., `tenant-logo`, `student-photo`). Use the same provider + pattern.
- **Template refactor breaks existing tests:** run the existing spec file first before refactoring. Understand what the tests expect. Refactor in additive increments — add new methods first, then refactor old ones only if needed.
- **Default settings row missing:** `get` must lazily create it. Do not expect every tenant to already have a seeded row — tenants created between impl 01's seed and this impl may not.
