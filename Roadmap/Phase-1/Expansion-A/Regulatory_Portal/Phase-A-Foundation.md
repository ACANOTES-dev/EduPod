# Phase A — Foundation: Schema, Shared Types, Core CRUD

**Wave**: 1
**Deploy Order**: d1
**Depends On**: None

## Scope

Establishes the entire data layer, shared type system, NestJS module shell, and foundational CRUD services for the Regulatory Portal. This phase creates the 9 new database tables, all enums, RLS policies, Zod validation schemas, constants, the module registration, permission seeds, and the simplest services (calendar event management, submission audit log, absence/subject mapping CRUD, reduced school day management). Every subsequent phase builds on these foundations.

## Deliverables

### Schema
- `packages/prisma/migrations/YYYYMMDDHHMMSS_add_regulatory_portal_tables/migration.sql` — 9 tables, ~12 enums
- `packages/prisma/schema.prisma` — new models, enums, relation additions to `Student`, `Subject`, `Tenant`, `User`
- `packages/prisma/migrations/YYYYMMDDHHMMSS_add_regulatory_portal_tables/post_migrate.sql` — RLS policies for all 9 tables

### Shared Package
- `packages/shared/src/regulatory/regulatory.schemas.ts` — all Zod schemas (~17 schemas)
- `packages/shared/src/regulatory/regulatory.constants.ts` — all constants (thresholds, SAR periods, domain labels, default events, DES codes, PPOD codes, CBA descriptors, anti-bullying categories, October Returns fields)
- `packages/shared/src/regulatory/index.ts` — barrel re-export

### API Module Shell
- `apps/api/src/modules/regulatory/regulatory.module.ts` — NestJS module with all providers/exports
- `apps/api/src/modules/regulatory/regulatory.controller.ts` — initial CRUD endpoints (calendar, submissions, absence mappings, DES subject mappings, reduced school days)
- `apps/api/src/modules/regulatory/regulatory.controller.spec.ts` — controller tests for CRUD endpoints
- `apps/api/src/modules/regulatory/dto/calendar-event.dto.ts`
- `apps/api/src/modules/regulatory/dto/generate-tusla-sar.dto.ts`
- `apps/api/src/modules/regulatory/dto/generate-tusla-aar.dto.ts`
- `apps/api/src/modules/regulatory/dto/reduced-school-day.dto.ts`
- `apps/api/src/modules/regulatory/dto/des-readiness.dto.ts`
- `apps/api/src/modules/regulatory/dto/ppod-sync.dto.ts`
- `apps/api/src/modules/regulatory/dto/cba-sync.dto.ts`
- `apps/api/src/modules/regulatory/dto/inter-school-transfer.dto.ts`

### Core CRUD Services
- `apps/api/src/modules/regulatory/regulatory-calendar.service.ts` — calendar event CRUD, seed defaults
- `apps/api/src/modules/regulatory/regulatory-calendar.service.spec.ts`
- `apps/api/src/modules/regulatory/regulatory-submission.service.ts` — submission audit log CRUD
- `apps/api/src/modules/regulatory/regulatory-submission.service.spec.ts`

### Registration & Permissions
- `apps/api/src/app.module.ts` — register `RegulatoryModule` in imports
- `packages/prisma/seed/permissions.ts` — add 11 regulatory permissions

### Architecture Docs
- `architecture/module-blast-radius.md` — add `regulatory` module (reads from attendance, behaviour, scheduling, students, gradebook, classes; writes only to own tables + student upserts via PPOD import)
- `architecture/event-job-catalog.md` — add skeleton entries for the 5 planned regulatory jobs

## Out of Scope

- Business logic services (Tusla threshold/SAR/AAR, DES pipeline, PPOD sync, CBA, transfers, dashboard aggregation) — these are Phases B–E
- Adapter implementations (DES exporters, POD transports) — Phases C and D
- Worker processors and cron registrations — Phase E
- All frontend pages and components — Phases F–H
- Automated esinet web integration (v2 future)

## Dependencies

None — this is the foundation phase.

## Implementation Notes

- The controller is created here with CRUD endpoints only. Phases B, C, D, and E will each add their respective endpoint groups to this same controller file. Use section separators (`// ─── Tusla ───`, `// ─── DES ───`, etc.) to keep groups visually distinct.
- The module registers all 9 service providers up front (some will be empty shells initially). This prevents import errors when later phases add implementations. Alternatively, later phases can add providers — but the module must compile after Phase A alone.
- All Zod schemas are created here even though some are consumed only by later phases. This prevents shared package churn across phases.
- Tusla absence mapping CRUD and DES subject mapping CRUD are included here (simple table operations). The complex business logic that *uses* these mappings (SAR generation, DES file pipeline) is in Phases B and C respectively.
- Reduced school day management (CRUD for the `reduced_school_days` table) is included here — it's straightforward record management.
- RLS policies use the standard `{table}_tenant_isolation` pattern. All 9 tables are tenant-scoped.
- Permission tier: most are `admin`, except `regulatory.view_tusla` which is `staff` (year heads need Tusla threshold visibility).
