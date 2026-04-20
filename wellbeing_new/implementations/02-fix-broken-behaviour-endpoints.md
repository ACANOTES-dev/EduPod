# Implementation 02 — Fix Broken Behaviour Endpoints

> **Wave:** 2 (parallel-safe — owns endpoints in `apps/api/src/modules/behaviour/`)
> **Classification:** backend
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Three behaviour endpoints are broken in production: `GET /api/v1/behaviour/incidents/stats` returns 400 (Validation failed toast on every `/behaviour` page load), `GET /api/v1/behaviour/templates?pageSize=50` returns 404 (no route at all — fires a toast on every new-incident form open), `GET /api/v1/behaviour/recognition?pageSize=50&status=published` returns 404 (recognition wall fires a toast). This impl fixes all three: diagnose and correct the stats validation, create the missing templates endpoint and Prisma model if needed, create the missing recognition list endpoint backed by the existing recognition tables. Also tighten the per-tenant failure-tolerance on tasks/stats so a 400 doesn't bubble up as a generic toast.

## Shared files this impl touches

- `apps/api/src/modules/behaviour/behaviour.module.ts` — possibly register a new controller. Edit late.
- `packages/shared/src/behaviour/schemas/` — possibly add new Zod schemas. Yours alone in this wave.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **low.** Behaviour module touched by impls 04 (AI), 05 (AI services). They all add to different files.

## What to build

### 1. Diagnose `/incidents/stats` 400

Open `apps/api/src/modules/behaviour/incidents/incidents.controller.ts` (or wherever `/incidents/stats` lives — `grep -r "incidents/stats" apps/api/src/modules/behaviour/`). The 400 is a Zod validation rejection of the response shape (or query). Reproduce locally with curl:

```bash
curl -H "Authorization: Bearer $JWT" "https://nhqs.edupod.app/api/v1/behaviour/incidents/stats" -v
```

Compare the actual response shape against what `apps/web/src/app/[locale]/(school)/behaviour/page.tsx` expects (`PulseStats` interface). Likely cause: response uses different field names (`total` vs `total_incidents`) or missing fields. Fix the controller/service to return the shape the frontend expects:

```ts
{
  data: {
    total_incidents: number,
    positive_count: number,
    negative_count: number,
    open_tasks: number,
    overdue_tasks: number,
  }
}
```

If the existing endpoint returns a richer shape, add the four canonical aliases the frontend needs without breaking existing consumers.

### 2. Create `GET /api/v1/behaviour/templates`

Investigate whether a `behaviour_incident_templates` (or similar) Prisma model exists. `grep -r "Template" packages/prisma/schema.prisma` near behaviour models.

**If it exists:** add a controller method to list them with pagination. Standard `apps/api/src/modules/behaviour/templates/templates.controller.ts`:

```ts
@Controller('v1/behaviour/templates')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('behaviour.log')
export class BehaviourTemplatesController {
  constructor(private readonly service: BehaviourTemplatesService) {}

  @Get()
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(paginationQuerySchema)) query: PaginationQuery,
  ) {
    return this.service.list(tenant.tenant_id, query);
  }
}
```

**If it does NOT exist:** create it. Schema additions go through impl 01 — but since impl 01 is already shipped, add the model in this impl with a small follow-up migration:

```prisma
model BehaviourIncidentTemplate {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id     String   @db.Uuid
  name          String   @db.VarChar(255)
  category_id   String?  @db.Uuid
  description   String?  @db.Text
  parent_description String? @db.Text
  context_type  String?  @db.VarChar(64)
  is_active     Boolean  @default(true)
  sort_order    Int      @default(0)
  created_at    DateTime @default(now()) @db.Timestamptz()
  updated_at    DateTime @default(now()) @updatedAt @db.Timestamptz()

  @@index([tenant_id, is_active])
  @@map("behaviour_incident_templates")
}
```

Add RLS policy in the same migration. If you create the table, return an empty `data: []` response when the tenant has no templates (do not 404; the frontend treats empty as a normal state).

### 3. Create `GET /api/v1/behaviour/recognition`

The recognition wall list endpoint. Backed by existing `behaviour_incidents` filtered to `polarity = 'positive'` AND `status IN ('resolved', 'active')` AND visibility flag (if exists) — investigate the data model first. Likely shape:

```ts
@Get()
list(
  @CurrentTenant() tenant: TenantContext,
  @Query(new ZodValidationPipe(recognitionListQuerySchema)) query: RecognitionListQuery,
) {
  return this.service.listRecognition(tenant.tenant_id, query);
}
```

Where `recognitionListQuerySchema` accepts `status` (`published` | `pending` | `all`), `pageSize`, `page`, optional `student_id`, `class_id`. Returns `{ data, meta: { page, pageSize, total } }`. Each row includes student_name, category, point_value, awarded_by, awarded_at, optional description, optional photo URL.

### 4. Fix tasks/stats validation

The `/behaviour/tasks` page also fires a "Validation failed" toast. Same diagnosis pattern — reproduce, compare response vs frontend expected shape, align.

### 5. Module registration

Register any new controllers in `behaviour.module.ts`. Coordinate the edit — open it last in the impl, add your imports + controller registration, save, commit immediately. Do not leave the file open while you do other work; impls 04 and 05 may need the same file later in the wave.

## Tests

- `incidents.controller.spec.ts` — assert `/stats` returns the documented shape with exact field names.
- `templates.controller.spec.ts` (NEW if controller is new) — assert empty list returns `{ data: [], meta: { page: 1, pageSize: 50, total: 0 } }`.
- `recognition.controller.spec.ts` (NEW) — happy path + permission denied + RLS leakage (Tenant B cannot see Tenant A's positive incidents).
- Fixture: NHQS-style tenant with zero templates → list returns empty, no 404.

## Watch out for

- **DO NOT change the response shape for any endpoint that already has consumers** — find the canonical source-of-truth shape and align both ends. If the frontend was wrong, fix the frontend type in this impl too (it's `apps/web/src/app/[locale]/(school)/behaviour/page.tsx`'s `PulseStats` interface).
- **Pagination defaults** must match the rest of the codebase: `page=1`, `pageSize=20` default, max 100. The 400 may be Zod rejecting `pageSize=50` outside an unexpected enum/range.
- **If you create the templates table mid-wave**, your impl now has a schema change, which means the deployment matrix in IMPLEMENTATION_LOG.md needs updating too. Coordinate with the user before that — schema in Wave 2 is a deviation from the plan.
- **Do not introduce a new permission** for templates. Reuse `behaviour.log` (anyone who can log an incident can browse templates).

## Deployment notes

- Restart: API only (unless step 2 created a table — then API + migration).
- Smoke: `curl /api/v1/behaviour/incidents/stats` returns 200 with the documented shape; `/templates` returns 200 with `data: []`; `/recognition?pageSize=50&status=published` returns 200 with `data: []`.
- After deploy, verify on `nhqs.edupod.app/en/behaviour` that the "Validation failed" toast no longer appears on first load. Also `/en/behaviour/incidents/new` should not toast about templates.
