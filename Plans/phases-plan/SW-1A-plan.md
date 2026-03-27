# SW-1A: Infrastructure & Foundation — Implementation Plan

## Overview
Foundation sub-phase delivering: global `app.current_user_id` in RLS context, 20 Prisma models + 14 enums, RLS policies (standard + tiered + CP-specific), immutability triggers, 18 permissions, shared Zod schemas, 5 NestJS module shells, 6 worker processor stubs, and `pastoral_case` tenant sequence.

**Spec file**: `Next_Feature/student-wellbeing/phase-sw-1a-infrastructure.md`
**Master spec**: `Next_Feature/student-wellbeing/master-spec.md`

## Key Design Decision: user_id Optional with Sentinel Default

The `createRlsClient` function signature changes to accept an optional `user_id`. Existing callers continue working without modification — they get the sentinel value `00000000-0000-0000-0000-000000000000` which never matches `cp_access_grants`. New pastoral services will pass real `user_id` for CP RLS enforcement.

This avoids touching 90+ existing service files while delivering the security guarantee.

## Work Breakdown — 6 Sub-Agents

### Agent 1: RLS Infrastructure
- Modify `apps/api/src/common/middleware/rls.middleware.ts` (optional user_id, second set_config)
- Modify `apps/worker/src/base/tenant-aware-job.ts` (optional user_id, sentinel)
- Create `packages/shared/src/constants/system.ts` (SYSTEM_USER_SENTINEL export)
- Update `apps/api/src/common/middleware/rls.middleware.spec.ts`

### Agent 2: Database Layer (Schema + Migration + post_migrate.sql)
- Add 14 enums + 20 models to `packages/prisma/schema.prisma`
- Run `npx prisma migrate dev --name add_pastoral_care_tables`
- Create `post_migrate.sql` in the generated migration folder with all RLS policies, triggers, constraints

### Agent 3: Shared Zod Schemas
- Create `packages/shared/src/pastoral/` directory structure
- All enum files, 16 schema files, barrel exports
- Default concern categories + intervention types
- 26 event payload schemas
- Pastoral tenant settings schema

### Agent 4: NestJS Module Scaffolding
- Create 5 empty module files (pastoral, child-protection, pastoral-dsar, pastoral-checkins, critical-incidents)
- Register all 5 in `apps/api/src/app.module.ts`
- Register BullMQ `pastoral` queue in API

### Agent 5: Worker Scaffolding
- Add `PASTORAL` to queue constants
- Create 6 empty processor stubs in `apps/worker/src/processors/pastoral/`
- Register pastoral queue + processors in `apps/worker/src/worker.module.ts`

### Agent 6: Permissions & Seeds
- Add 18 pastoral permissions to `packages/prisma/seed/permissions.ts`
- Add `pastoral_case` sequence type to seed
- Integrate pastoral tenant settings into existing tenant settings schema

## Commit Message
`feat(pastoral): SW-1A — infrastructure foundation (schema, RLS, triggers, permissions, scaffolding)`
