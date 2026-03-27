# Phase G: Documents + Comms — Results

## Summary

Phase G delivers the document generation engine (Handlebars templates → Puppeteer PDF → S3 storage), document template management with 20 system templates (10 types × 2 locales), the parent behaviour portal with hardened parent-safe content rendering and guardian restriction enforcement, the notification digest worker for batched parent notifications, and the amendment correction chain wiring. 15 API endpoints across 2 new controllers + 3 config endpoints, 3 backend services, 1 worker job, 4 frontend pages, 30 unit tests.

## Database

### Schema Changes
- Added unique constraint `uq_behaviour_doc_templates_name` on `behaviour_document_templates(tenant_id, document_type, locale, name)`
- Migration: `20260327000000_phase_g_doc_template_unique`

### Tables Used (from Phase A)
- `behaviour_documents` (20 columns) — full document lifecycle implemented (draft → finalised → sent → superseded)
- `behaviour_document_templates` (10 columns) — template CRUD with system vs custom, merge field reference
- `behaviour_parent_acknowledgements` (13 columns) — parent acknowledgement tracking with amendment notice links

## API Endpoints: 15 routes

### Documents Controller (6 routes)
| Method | Path | Permission |
|--------|------|-----------|
| POST | `v1/behaviour/documents/generate` | `behaviour.manage` |
| GET | `v1/behaviour/documents` | `behaviour.view` |
| GET | `v1/behaviour/documents/:id` | `behaviour.view` |
| PATCH | `v1/behaviour/documents/:id/finalise` | `behaviour.manage` |
| POST | `v1/behaviour/documents/:id/send` | `behaviour.manage` |
| GET | `v1/behaviour/documents/:id/download` | `behaviour.view` |

### Parent Behaviour Controller (6 routes)
| Method | Path | Permission |
|--------|------|-----------|
| GET | `v1/parent/behaviour/summary` | `parent.view_behaviour` |
| GET | `v1/parent/behaviour/incidents` | `parent.view_behaviour` |
| GET | `v1/parent/behaviour/points-awards` | `parent.view_behaviour` |
| GET | `v1/parent/behaviour/sanctions` | `parent.view_behaviour` |
| POST | `v1/parent/behaviour/acknowledge/:acknowledgementId` | `parent.view_behaviour` |
| GET | `v1/parent/behaviour/recognition` | `parent.view_behaviour` |

### Document Templates (on Config Controller — 3 routes)
| Method | Path | Permission |
|--------|------|-----------|
| GET | `v1/behaviour/document-templates` | `behaviour.admin` |
| POST | `v1/behaviour/document-templates` | `behaviour.admin` |
| PATCH | `v1/behaviour/document-templates/:id` | `behaviour.admin` |

## Services: 3

| Service | Responsibilities |
|---------|-----------------|
| `BehaviourDocumentService` | 8-step document generation pipeline (Handlebars → Puppeteer → S3), document CRUD, finalise, send, download URL, supersede, auto-generate |
| `BehaviourDocumentTemplateService` | Template CRUD, merge field definitions per document type, active template resolution (custom priority over system) |
| `BehaviourParentService` | Parent-safe rendering with 3-priority content chain, guardian restriction enforcement, summary, incidents, points/awards, sanctions, acknowledgement, recognition wall |

## Frontend: 4 pages

| Route | Description |
|-------|-------------|
| `/behaviour/documents` | Document management list with filters, generate dialog, download/finalise/send actions |
| `/behaviour/parent-portal` | Per-child behaviour summary with incidents, sanctions, acknowledgement prompts |
| `/behaviour/parent-portal/recognition` | Recognition wall with achievement cards |
| `/settings/behaviour-documents` | Template editor with merge field reference, preview, system vs custom templates |

## Background Jobs: 1

| Job | Queue | Trigger |
|-----|-------|---------|
| `behaviour:digest-notifications` | notifications | Cron at tenant-configured time (default 16:00), per-tenant in tenant timezone |

## Configuration

### Permissions Added: 1
- `parent.view_behaviour` — parent tier, allows parents to view behaviour data for linked students

### Seed Data: 20 document templates
10 document types × 2 locales (en + ar):
- Detention Notice, Suspension Letter, Return Meeting Letter, Behaviour Contract, Intervention Summary, Appeal Hearing Invite, Appeal Decision Letter, Exclusion Notice, Exclusion Decision Letter, Board Pack

## Files Created: ~16

### Backend (5 files)
- `apps/api/src/modules/behaviour/behaviour-document.service.ts`
- `apps/api/src/modules/behaviour/behaviour-document-template.service.ts`
- `apps/api/src/modules/behaviour/behaviour-documents.controller.ts`
- `apps/api/src/modules/behaviour/behaviour-parent.service.ts`
- `apps/api/src/modules/behaviour/behaviour-parent.controller.ts`

### Shared (2 files)
- `packages/shared/src/behaviour/schemas/document.schema.ts`
- `packages/shared/src/behaviour/schemas/parent-behaviour.schema.ts`

### Worker (1 file)
- `apps/worker/src/processors/behaviour/digest-notifications.processor.ts`

### Frontend (4 files)
- `apps/web/src/app/[locale]/(school)/behaviour/documents/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/parent-portal/page.tsx`
- `apps/web/src/app/[locale]/(school)/behaviour/parent-portal/recognition/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/behaviour-documents/page.tsx`

### Tests (2 files)
- `apps/api/src/modules/behaviour/behaviour-document.service.spec.ts` (16 tests)
- `apps/api/src/modules/behaviour/behaviour-parent.service.spec.ts` (14 tests)

### Plan + Migration (2 files)
- `Plans/phases-plan/BH-G-plan.md`
- `packages/prisma/migrations/20260327000000_phase_g_doc_template_unique/migration.sql`

## Files Modified: 9
- `apps/api/package.json` — Added `handlebars` dependency
- `apps/api/src/modules/behaviour/behaviour.module.ts` — Registered 3 services, 2 controllers, imported PdfRenderingModule + S3Module
- `apps/api/src/modules/behaviour/behaviour-config.controller.ts` — Added 3 document template endpoints
- `apps/worker/src/worker.module.ts` — Registered DigestNotificationsProcessor
- `packages/prisma/schema.prisma` — Added unique constraint on document templates
- `packages/prisma/seed/behaviour-seed.ts` — Added 20 document template seeds
- `packages/prisma/seed/permissions.ts` — Added `parent.view_behaviour` permission
- `packages/shared/src/behaviour/schemas/index.ts` — Added document + parent-behaviour schema exports
- `architecture/module-blast-radius.md` — Updated BehaviourModule imports/exports
- `architecture/event-job-catalog.md` — Added behaviour:digest-notifications job

## Known Limitations
- Document generation requires Puppeteer running in the API process (not offloaded to worker yet — synchronous in transaction)
- Notification dispatch from `sendDocument` is logged but doesn't trigger the full communications module dispatch chain (creates acknowledgement row and history, but doesn't send email/WhatsApp)
- Digest worker processes all pending incidents in a single transaction — may need batching for high-volume tenants
- `parent_visible` check now filters through `category.parent_visible` (the field is on BehaviourCategory, not BehaviourIncident)
- Recognition wall consent check is a stub (always passes) — full publication_approvals table check deferred
- Translation files not yet created (hardcoded English)
- Sidebar nav not yet updated with documents/parent-portal links
- Server deployment required manual `pnpm install` due to stale node_modules

## Deviations from Plan
- Handlebars imported via `require()` with explicit type annotation instead of ES import (pnpm strict mode prevents type resolution on production server)
- Parent portal pages placed under `/behaviour/parent-portal` route (within school route group) instead of `/parent/behaviour` (follows existing codebase convention where parent pages live in the school shell)
- `class_entity` used instead of `class` for ClassEnrolment relation (Prisma reserves `class` keyword)
