# SW-1B: Concern Logging & Audit Events — Implementation Plan

## Overview
First feature layer on SW-1A infrastructure: ConcernService (CRUD + tier escalation + shareable marking + author masking), ConcernVersionService (append-only narrative versioning), PastoralEventService (immutable audit writer), ConcernsController (11 REST endpoints), and 26+ unit/integration tests.

## Work Breakdown — 5 Opus Agents

### Agent 1: Shared Schemas
- Refine `packages/shared/src/pastoral/schemas/concern.schema.ts` (createConcern, updateConcernMetadata, escalateConcernTier, shareConcernWithParent, listConcernsQuery)
- Refine `packages/shared/src/pastoral/schemas/concern-version.schema.ts` (amendNarrative)
- Verify `packages/shared/src/pastoral/schemas/pastoral-event.schema.ts` has all 26 event payload schemas
- Add `packages/shared/src/pastoral/schemas/concern-response.schema.ts` (response DTOs for list/detail)
- Update barrel exports

### Agent 2: PastoralEventService + tests
- `apps/api/src/modules/pastoral/services/pastoral-event.service.ts` — INSERT-only writer, fire-and-forget, Zod validation, query methods
- `apps/api/src/modules/pastoral/services/pastoral-event.service.spec.ts` — 5 unit tests

### Agent 3: ConcernVersionService + tests
- `apps/api/src/modules/pastoral/services/concern-version.service.ts` — createInitialVersion, amendNarrative (SELECT FOR UPDATE), listVersions
- `apps/api/src/modules/pastoral/services/concern-version.service.spec.ts` — 6 unit tests

### Agent 4: ConcernService + Controller + constants + module wiring
- `apps/api/src/modules/pastoral/services/concern.service.ts` — create, list, getById, updateMetadata, escalateTier, markShareable, getCategories, acknowledge + private helpers
- `apps/api/src/modules/pastoral/controllers/concerns.controller.ts` — 11 endpoints
- `apps/api/src/modules/pastoral/pastoral.constants.ts` — default categories, severity levels
- `apps/api/src/modules/pastoral/pastoral.module.ts` — register all services + controller

### Agent 5: ConcernService unit tests + E2E/RLS tests
- `apps/api/src/modules/pastoral/services/concern.service.spec.ts` — 15 unit tests
- `apps/api/test/pastoral-concerns.e2e.spec.ts` — 5 RLS leakage + 4 permission tests
