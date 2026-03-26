# Phase D: Safeguarding — Implementation Plan

## Section 1 — Overview

Phase D delivers an inspection-grade safeguarding module with:
- Full concern lifecycle (report → acknowledge → investigate → refer → resolve → seal)
- SLA tracking with wall-clock hours and configurable per-severity thresholds
- Critical concern escalation chain (DLP → deputy → principal)
- Reporter acknowledgement view (status only, no case detail)
- ClamAV attachment pipeline (scan-gated downloads)
- Break-glass emergency access with audit logging and after-action review
- Dual-control seal (two distinct `safeguarding.seal` holders required)
- Status projection (`converted_to_safeguarding` → `closed` for non-safeguarding users)
- Case file PDF generation (watermarked + SHA-256, redacted variant)
- Safeguarding dashboard with SLA compliance metrics

**Dependencies on Phase A**:
- 4 safeguarding tables exist with RLS: `safeguarding_concerns`, `safeguarding_actions`, `safeguarding_concern_incidents`, `safeguarding_break_glass_grants`
- `behaviour_attachments` table exists
- All safeguarding enums defined in Prisma schema
- Permissions registered: `safeguarding.report`, `safeguarding.view`, `safeguarding.manage`, `safeguarding.seal`
- SequenceService live (CP- prefix registered)
- BehaviourHistoryService, BehaviourTasksService, data classification framework all live
- Settings schema includes safeguarding keys (DLP IDs, SLA hours, retention years)

**Key established patterns** (from `apps/api/src/modules/behaviour/`):
- `createRlsClient(this.prisma, { tenant_id })` for tenant-scoped DB access
- `SequenceService.nextNumber(tenantId, 'safeguarding_concern', tx, 'CP')` for concern numbers
- Worker processors extend `WorkerHost`, use inner `TenantAwareJob` classes
- Controllers use `@UseGuards(AuthGuard, PermissionGuard)` + `@RequiresPermission()`
- `ZodValidationPipe` for body/query validation
- `@CurrentTenant()` and `@CurrentUser()` decorators for request context
- `AuditLogService.write()` for fire-and-forget audit entries
- Prisma enum mapping: `low_sev`→"low", `sg_resolved`→"resolved", `pending_scan`→"pending", etc.

---

## Section 2 — Database Changes

All 4 safeguarding tables + `behaviour_attachments` already exist from Phase A. **No new migrations needed.**

Phase D adds missing indexes via a migration if the spec indexes are not all present. The Phase A migration created most indexes. I need to verify and add any missing partial indexes:

- `(tenant_id, severity, status)` on `safeguarding_concerns` — for SLA worker
- `(tenant_id, reported_by_id)` on `safeguarding_concerns` — for my-reports
- `(tenant_id, sla_first_response_due) WHERE sla_first_response_met_at IS NULL` — partial index for SLA check
- `(tenant_id, assigned_to_id, status)` on `safeguarding_concerns` — task views
- `(tenant_id, concern_id, created_at DESC)` on `safeguarding_actions` — chronology
- `(tenant_id, action_by_id, created_at DESC)` on `safeguarding_actions` — staff activity
- `(tenant_id, scan_status) WHERE scan_status = 'pending'` on `behaviour_attachments` — scan backlog

No seed data changes needed — permissions and sequences already registered in Phase A.

---

## Section 3 — API Endpoints

All endpoints under `v1/safeguarding/`, served by `SafeguardingController`.

### 1. POST `v1/safeguarding/concerns` — Report concern
- **Permission**: `safeguarding.report`
- **Request**: `reportSafeguardingConcernSchema` (student_id, concern_type, severity, description, immediate_actions_taken?, incident_id?)
- **Response**: `{ data: { id, concern_number, status } }`
- **Logic**: Generate CP- number, set SLA deadline, set retention_until, create action entry, notify DLP, enqueue critical escalation if critical, link incident if provided

### 2. GET `v1/safeguarding/my-reports` — Reporter's own reports
- **Permission**: `safeguarding.report`
- **Response**: `{ data: [{ concern_number, concern_type, reported_at, reporter_acknowledgement_status }], meta }`
- **Strips**: All case detail (student name, description, assigned staff, actions)

### 3. GET `v1/safeguarding/concerns` — List concerns
- **Permission**: `safeguarding.view` (or break-glass)
- **Query**: page, pageSize, status, severity, type, from, to, assigned_to_id, sla_status
- **Response**: `{ data: SafeguardingConcernSummary[], meta, sla_summary }`
- **Audit**: Every access logged

### 4. GET `v1/safeguarding/concerns/:id` — Concern detail
- **Permission**: `safeguarding.view` (or break-glass)
- **Response**: Full concern with student info, actions count, attachments count
- **Audit**: Access logged with break-glass context if applicable

### 5. PATCH `v1/safeguarding/concerns/:id` — Update concern
- **Permission**: `safeguarding.manage`
- **Sealed check**: Return 403 if sealed
- **Request**: Partial update (description, concern_type, severity, referral details)

### 6. PATCH `v1/safeguarding/concerns/:id/status` — Status transition
- **Permission**: `safeguarding.manage`
- **Request**: `{ status, reason }`
- **Logic**: Validate transition against state machine, apply side effects per status

### 7. POST `v1/safeguarding/concerns/:id/assign` — Assign concern
- **Permission**: `safeguarding.manage`
- **Request**: `{ designated_liaison_id?, assigned_to_id? }`

### 8. POST `v1/safeguarding/concerns/:id/actions` — Record action
- **Permission**: `safeguarding.manage`
- **Request**: `{ action_type, description, due_date?, metadata? }`
- **Append-only**: Creates safeguarding_actions entry

### 9. GET `v1/safeguarding/concerns/:id/actions` — Action history
- **Permission**: `safeguarding.view` (or break-glass)
- **Response**: Chronological actions list

### 10. POST `v1/safeguarding/concerns/:id/tusla-referral` — Record Tusla referral
- **Permission**: `safeguarding.manage`
- **Request**: `{ reference_number, referred_at }`

### 11. POST `v1/safeguarding/concerns/:id/garda-referral` — Record Garda referral
- **Permission**: `safeguarding.manage`
- **Request**: `{ reference_number, referred_at }`

### 12. POST `v1/safeguarding/concerns/:id/attachments` — Upload attachment
- **Permission**: `safeguarding.manage`
- **Returns 202**: Starts ClamAV pipeline
- **Logic**: Validate file size/type/MIME, compute SHA-256, upload to S3, create DB record, enqueue scan job

### 13. GET `v1/safeguarding/concerns/:id/attachments/:aid/download` — Download attachment
- **Permission**: `safeguarding.view` (or break-glass)
- **Gated**: scan_status must be 'clean'
- **Returns**: Pre-signed URL (15-min expiry)
- **Audit**: Creates safeguarding_actions entry

### 14. POST `v1/safeguarding/concerns/:id/case-file` — Generate case file PDF
- **Permission**: `safeguarding.manage`
- **Returns**: `{ job_id, status: 'queued' }` (async via BullMQ)

### 15. POST `v1/safeguarding/concerns/:id/case-file/redacted` — Generate redacted PDF
- **Permission**: `safeguarding.manage`
- **Returns**: `{ job_id, status: 'queued' }`

### 16. POST `v1/safeguarding/concerns/:id/seal/initiate` — Initiate seal
- **Permission**: `safeguarding.seal`
- **Precondition**: status = 'resolved'
- **Logic**: Set sealed_by_id + reason, create task for second seal holder

### 17. POST `v1/safeguarding/concerns/:id/seal/approve` — Approve seal
- **Permission**: `safeguarding.seal`
- **Precondition**: sealed_by_id set, approver != initiator
- **Logic**: Set status=sealed, sealed_at, seal_approved_by_id

### 18. GET `v1/safeguarding/dashboard` — Dashboard stats
- **Permission**: `safeguarding.view`
- **Response**: open_by_severity, sla_compliance, by_status, overdue_tasks, recent_actions

### 19. POST `v1/safeguarding/break-glass` — Grant break-glass access
- **Permission**: `safeguarding.seal`
- **Request**: `{ granted_to_id, reason, duration_hours, scope, scoped_concern_ids? }`
- **Validation**: duration_hours <= 72

### 20. GET `v1/safeguarding/break-glass` — List active grants
- **Permission**: `safeguarding.seal`

### 21. POST `v1/safeguarding/break-glass/:id/review` — Complete after-action review
- **Permission**: `safeguarding.manage`
- **Request**: `{ notes }`

---

## Section 4 — Service Layer

### SafeguardingService
- **File**: `apps/api/src/modules/behaviour/safeguarding.service.ts`
- **Dependencies**: PrismaService, SequenceService, BehaviourHistoryService, BehaviourTasksService, AuditLogService, PermissionCacheService, NotificationsQueue

**Public methods**:
- `reportConcern(tenantId, userId, dto)` — Create concern with all side effects
- `getMyReports(tenantId, userId, query)` — Reporter-only view
- `listConcerns(tenantId, userId, query)` — Paginated list with SLA summary
- `getConcernDetail(tenantId, userId, concernId)` — Full detail with audit
- `updateConcern(tenantId, userId, concernId, dto)` — Partial update (sealed check)
- `transitionStatus(tenantId, userId, concernId, dto)` — State machine transition
- `assignConcern(tenantId, userId, concernId, dto)` — Assign DLP/investigator
- `recordAction(tenantId, userId, concernId, dto)` — Append to action log
- `getActions(tenantId, userId, concernId, query)` — List actions
- `recordTuslaReferral(tenantId, userId, concernId, dto)` — Tusla referral
- `recordGardaReferral(tenantId, userId, concernId, dto)` — Garda referral
- `initiateSeal(tenantId, userId, concernId, dto)` — First seal step
- `approveSeal(tenantId, userId, concernId)` — Second seal step
- `getDashboard(tenantId)` — Dashboard aggregates
- `checkEffectivePermission(userId, tenantId, membershipId, concernId?)` — Normal + break-glass

### SafeguardingAttachmentService
- **File**: `apps/api/src/modules/behaviour/safeguarding-attachment.service.ts`
- **Dependencies**: PrismaService, S3Client (AWS SDK), AuditLogService, NotificationsQueue

**Public methods**:
- `uploadAttachment(tenantId, userId, concernId, file, dto)` — Upload with scan pipeline
- `generateDownloadUrl(tenantId, userId, concernId, attachmentId)` — Scan-gated pre-signed URL
- `listAttachments(tenantId, userId, concernId)` — List for concern

### SafeguardingBreakGlassService
- **File**: `apps/api/src/modules/behaviour/safeguarding-break-glass.service.ts`
- **Dependencies**: PrismaService, BehaviourTasksService, AuditLogService, NotificationsQueue

**Public methods**:
- `grantAccess(tenantId, userId, dto)` — Create break-glass grant
- `listActiveGrants(tenantId)` — List non-expired grants
- `completeReview(tenantId, userId, grantId, dto)` — After-action review

---

## Section 5 — Frontend Pages and Components

### `/safeguarding` — Dashboard
- **Route**: `apps/web/src/app/[locale]/(school)/safeguarding/page.tsx`
- **Access**: `safeguarding.view` → dashboard; `safeguarding.report` only → redirect to my-reports
- **Server component** with client sub-components for interactive elements
- **Data**: GET `v1/safeguarding/dashboard`
- **Layout**: SLA traffic light (top), severity counters, status funnel, overdue tasks, recent activity

### `/safeguarding/concerns` — Concern List
- **Route**: `apps/web/src/app/[locale]/(school)/safeguarding/concerns/page.tsx`
- **Access**: `safeguarding.view`
- **Filters**: status, severity, type, date range, assigned_to, SLA status
- **Table**: concern number, student, type, severity badge, status badge, SLA deadline

### `/safeguarding/concerns/new` — Report Concern
- **Route**: `apps/web/src/app/[locale]/(school)/safeguarding/concerns/new/page.tsx`
- **Access**: `safeguarding.report`
- **Client component** (form interactivity)
- **Form**: student search, concern type, severity, description, immediate actions, incident link
- **After submit**: redirect to `/safeguarding/my-reports`

### `/safeguarding/concerns/[id]` — Case File Detail
- **Route**: `apps/web/src/app/[locale]/(school)/safeguarding/concerns/[id]/page.tsx`
- **Access**: `safeguarding.view` (or break-glass)
- **Layout**: 2-panel desktop (detail + actions timeline), tabbed mobile
- **Tabs**: Detail, Actions, Attachments, Linked Incidents
- **Actions sidebar**: status transition, referrals, assign, export, seal

### `/safeguarding/my-reports` — Reporter View
- **Route**: `apps/web/src/app/[locale]/(school)/safeguarding/my-reports/page.tsx`
- **Access**: Any authenticated staff
- **Shows**: concern number, type, date, acknowledgement status badge
- **Does NOT show**: student name, description, assigned staff, any detail

### `/settings/safeguarding` — Settings
- **Route**: `apps/web/src/app/[locale]/(school)/settings/safeguarding/page.tsx`
- **Access**: `behaviour.admin`
- **Sections**: DLP assignment, SLA thresholds, retention years, module toggle

### Components
- `safeguarding-severity-badge.tsx` — Colour-coded severity badge
- `safeguarding-status-badge.tsx` — Status badge with appropriate colours
- `sla-indicator.tsx` — Traffic light SLA component (overdue/due-soon/on-track)
- `concern-card.tsx` — Mobile card view for concern list
- `action-timeline.tsx` — Chronological action display
- `break-glass-banner.tsx` — Amber banner for break-glass access

---

## Section 6 — Background Jobs

### `behaviour:attachment-scan`
- **Queue**: `behaviour`
- **Trigger**: On attachment upload
- **Processor**: `AttachmentScanProcessor`
- **Logic**: Stream S3 object → ClamAV socket → update scan_status → quarantine if infected
- **Retry**: 3 attempts, exponential backoff

### `behaviour:break-glass-expiry`
- **Queue**: `behaviour`
- **Trigger**: Cron every 5 minutes
- **Processor**: `BreakGlassExpiryProcessor`
- **Logic**: Find expired grants → set revoked_at → create review task → notify DLP

### `safeguarding:sla-check`
- **Queue**: `behaviour`
- **Trigger**: Cron every 30 minutes
- **Processor**: `SafeguardingSlaCheckProcessor`
- **Logic**: Find SLA breaches → create urgent tasks (dedup) → notify DLP (rate-limited to 2h)

### `safeguarding:critical-escalation`
- **Queue**: `behaviour`
- **Trigger**: Immediate on critical concern creation
- **Processor**: `SafeguardingCriticalEscalationProcessor`
- **Logic**: Notify chain[step] → if still reported after 30 min → escalate to next → repeat

---

## Section 7 — Implementation Order

1. **Shared types and Zod schemas** — safeguarding schemas in `packages/shared/`
2. **Database migration** — add missing indexes (if any)
3. **SafeguardingService** — core concern lifecycle
4. **SafeguardingAttachmentService** — upload/download/scan pipeline
5. **SafeguardingBreakGlassService** — break-glass lifecycle
6. **SafeguardingController** — all 21 endpoints
7. **Register in BehaviourModule** — wire services + controller
8. **Worker processors** — 4 job processors
9. **Status projection** — update BehaviourService to apply projection
10. **Frontend pages** — dashboard, concern list, report, detail, my-reports, settings
11. **Frontend components** — badges, SLA indicator, action timeline, cards

---

## Section 8 — Files to Create

### Shared (packages/shared)
- `packages/shared/src/behaviour/schemas/safeguarding.schema.ts`
- `packages/shared/src/behaviour/safeguarding-state-machine.ts`

### Backend (apps/api)
- `apps/api/src/modules/behaviour/safeguarding.service.ts`
- `apps/api/src/modules/behaviour/safeguarding-attachment.service.ts`
- `apps/api/src/modules/behaviour/safeguarding-break-glass.service.ts`
- `apps/api/src/modules/behaviour/safeguarding.controller.ts`

### Worker (apps/worker)
- `apps/worker/src/processors/behaviour/attachment-scan.processor.ts`
- `apps/worker/src/processors/behaviour/break-glass-expiry.processor.ts`
- `apps/worker/src/processors/behaviour/sla-check.processor.ts`
- `apps/worker/src/processors/behaviour/critical-escalation.processor.ts`

### Frontend (apps/web)
- `apps/web/src/app/[locale]/(school)/safeguarding/page.tsx`
- `apps/web/src/app/[locale]/(school)/safeguarding/concerns/page.tsx`
- `apps/web/src/app/[locale]/(school)/safeguarding/concerns/new/page.tsx`
- `apps/web/src/app/[locale]/(school)/safeguarding/concerns/[id]/page.tsx`
- `apps/web/src/app/[locale]/(school)/safeguarding/my-reports/page.tsx`
- `apps/web/src/app/[locale]/(school)/settings/safeguarding/page.tsx`
- `apps/web/src/components/behaviour/safeguarding-severity-badge.tsx`
- `apps/web/src/components/behaviour/safeguarding-status-badge.tsx`
- `apps/web/src/components/behaviour/sla-indicator.tsx`
- `apps/web/src/components/behaviour/concern-card.tsx`
- `apps/web/src/components/behaviour/action-timeline.tsx`
- `apps/web/src/components/behaviour/break-glass-banner.tsx`

### Database (if needed)
- `packages/prisma/migrations/2026XXXX_add_safeguarding_indexes/migration.sql`

---

## Section 9 — Files to Modify

- `packages/shared/src/behaviour/schemas/index.ts` — export safeguarding schemas
- `packages/shared/src/behaviour/index.ts` — export safeguarding state machine
- `apps/api/src/modules/behaviour/behaviour.module.ts` — register safeguarding services + controller
- `apps/api/src/modules/behaviour/behaviour.service.ts` — add status projection to incident responses
- `apps/worker/src/worker.module.ts` — register 4 new processors
- `packages/prisma/schema.prisma` — add missing indexes (if any)

---

## Section 10 — Key Context for Executor

### Prisma Enum Mappings (critical for service code)
- `SafeguardingSeverity`: `low_sev`→"low", `medium_sev`→"medium", `high_sev`→"high", `critical_sev`→"critical"
- `SafeguardingStatus`: `sg_monitoring`→"monitoring", `sg_resolved`→"resolved"
- `SafeguardingConcernType`: `other_concern`→"other"
- `ScanStatus`: `pending_scan`→"pending"
- `ReporterAckStatus`: `assigned_ack`→"assigned", `under_review_ack`→"under_review"

### Pattern: RLS Client Usage
```typescript
const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
return rlsClient.$transaction(async (tx) => {
  const db = tx as unknown as PrismaService;
  // ... all queries through db
});
```

### Pattern: Worker Processor
```typescript
@Processor(QUEUE_NAMES.BEHAVIOUR)
export class MyProcessor extends WorkerHost {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) { super(); }
  async process(job: Job<MyPayload>) {
    if (job.name !== MY_JOB_NAME) return;
    const tenantJob = new MyTenantJob(this.prisma);
    await tenantJob.execute(job.data);
  }
}
class MyTenantJob extends TenantAwareJob<MyPayload> {
  protected async processJob(data, tx) { /* ... */ }
}
```

### Pattern: Controller Endpoint
```typescript
@Post('safeguarding/concerns')
@RequiresPermission('safeguarding.report')
@HttpCode(HttpStatus.CREATED)
async reportConcern(
  @CurrentTenant() tenant: TenantContext,
  @CurrentUser() user: JwtPayload,
  @Body(new ZodValidationPipe(reportConcernSchema)) dto,
) { return this.safeguardingService.reportConcern(tenant.tenant_id, user.sub, dto); }
```

### ClamAV: Soft Dependency
ClamAV integration requires the daemon running on the server. For local development and CI, the attachment-scan processor should handle connection failures gracefully (scan_failed status, retry). The service should not crash if ClamAV is unavailable — it queues the scan and the worker retries.

### S3 Object Lock: Graceful Degradation
S3 Object Lock requires bucket-level configuration. If not configured, upload should succeed without lock (log warning). The service should not block uploads if Object Lock is not available.

### Break-Glass: Scoped Concern IDs
The `scoped_concern_ids` column is a UUID array. Prisma `has` operator works for checking if a concern ID is in the array. For `scope = 'all_concerns'`, ignore the array.

### Seal: Dual-Control Invariant
`sealed_by_id !== seal_approved_by_id` — enforce at service layer. The controller just needs `safeguarding.seal` permission; the service validates the dual-control constraint.
