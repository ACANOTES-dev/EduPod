# Phase D: Safeguarding — Testing Instructions

## Unit Tests

### SafeguardingService

1. **reportConcern** — Creates concern with correct concern_number (CP- prefix), sets SLA deadline based on severity, sets retention_until from student DOB, creates initial action entry, links incident if provided, enqueues critical escalation for critical severity
2. **getMyReports** — Returns only concern_number, concern_type, reported_at, reporter_acknowledgement_status. Does NOT return description, student name, assigned staff, actions
3. **listConcerns** — Filters by status, severity, type, date range, SLA status. Returns sla_summary aggregates
4. **getConcernDetail** — Returns full detail including student, referral blocks, seal status. Audit logs every view
5. **updateConcern** — Rejects update on sealed concerns (403). Creates action entry for updates
6. **transitionStatus** — Validates state machine transitions. Sets SLA met timestamp on acknowledge. Updates reporter ack status. Rejects invalid transitions. Blocks `sealed` via this endpoint
7. **assignConcern** — Updates DLP/investigator assignment. Rejects on sealed concerns
8. **recordAction** — Appends to action log. Rejects on sealed concerns
9. **initiateSeal** — Requires status=resolved. Sets sealed_by_id. Creates task for second seal holder
10. **approveSeal** — Enforces dual-control (different user than initiator). Sets status=sealed, sealed_at. Completes seal task
11. **getDashboard** — Returns correct counts for severity, status, SLA compliance, overdue tasks, recent actions
12. **checkEffectivePermission** — Returns normal access for safeguarding.view holders. Returns break-glass access for active grant holders. Returns denied for expired grants

### SafeguardingAttachmentService

1. **uploadAttachment** — Validates file size (413 for >10MB), extension (422 for disallowed), computes SHA-256, creates DB record with pending_scan status, enqueues scan job, returns 202
2. **generateDownloadUrl** — Gates on scan_status (403 for pending/infected/failed). Creates audit and action entries. Returns pre-signed URL for clean files
3. **listAttachments** — Returns all attachments for a concern with scan status

### SafeguardingBreakGlassService

1. **grantAccess** — Validates max 72h duration (422). Creates grant record. Enqueues notification
2. **listActiveGrants** — Returns only non-expired, non-revoked grants
3. **completeReview** — Sets review fields. Completes review task. Rejects if already reviewed

## Integration Tests

### Concern Lifecycle

```
1. POST /v1/safeguarding/concerns → 201 (concern created with SLA deadline)
2. GET /v1/safeguarding/my-reports → contains new concern (ack status null)
3. PATCH /v1/safeguarding/concerns/:id/status (→ acknowledged) → SLA met, ack=assigned
4. PATCH /v1/safeguarding/concerns/:id/status (→ under_investigation) → ack=under_review
5. POST /v1/safeguarding/concerns/:id/tusla-referral → referral recorded
6. PATCH /v1/safeguarding/concerns/:id/status (→ resolved)
7. POST /v1/safeguarding/concerns/:id/seal/initiate → seal_by_id set
8. POST /v1/safeguarding/concerns/:id/seal/approve (different user) → sealed
9. PATCH /v1/safeguarding/concerns/:id → 403 (sealed)
```

### Permission Tests

```
- safeguarding.report user CAN: POST concerns, GET my-reports
- safeguarding.report user CANNOT: GET concerns list (403), GET concern detail (403)
- safeguarding.view user CAN: GET concerns, GET concern detail, GET actions
- safeguarding.view user CANNOT: PATCH concern (403), POST actions (403)
- safeguarding.manage user CAN: PATCH, POST actions, POST referrals, POST attachments
- safeguarding.seal user CAN: POST seal/initiate, POST seal/approve, POST break-glass
```

### Break-Glass Tests

```
1. POST /v1/safeguarding/break-glass (duration=2h) → grant created
2. GET /v1/safeguarding/concerns/:id (as grantee) → 200 with break_glass context in audit
3. Wait for expiry (or mock) → GET returns 403
4. Break-glass review task should exist
5. POST /v1/safeguarding/break-glass/:id/review → review completed
```

### Dual-Control Seal Tests

```
- User A initiates seal → success
- User A tries to approve their own seal → 400 DUAL_CONTROL_VIOLATION
- User B (different safeguarding.seal holder) approves → success, status=sealed
- Any PATCH on sealed concern → 403 CONCERN_SEALED
```

## RLS Leakage Tests

```
- Tenant B cannot read Tenant A safeguarding_concerns (empty result)
- Tenant B cannot read Tenant A safeguarding_actions (empty result)
- Tenant B cannot read Tenant A safeguarding_break_glass_grants (empty result)
- Tenant B cannot download Tenant A safeguarding attachments (404)
```

## SLA Tests

```
- Critical concern: SLA due = now + 4h (default)
- High concern: SLA due = now + 24h
- SLA worker creates urgent task when overdue (no duplicate on re-run)
- SLA acknowledged → sla_first_response_met_at set
- SLA uses wall-clock hours (Friday 23:00 → Saturday 03:00, not Monday)
```

## Attachment Pipeline Tests

```
- Upload returns 202 with pending status
- Download while pending → 403 "awaiting security scan"
- After clean scan → download returns 200 with URL
- Upload >10MB → 413
- Upload .exe → 422
- Infected scan → status=infected, quarantine action
```

## Manual QA Checklist

- [ ] Navigate to `/safeguarding` — dashboard loads with SLA panel, severity grid
- [ ] Click "Report a Concern" — form loads with student search, severity radios
- [ ] Submit critical concern — amber warning appears before submit
- [ ] After submit — redirected to `/safeguarding/my-reports`
- [ ] My Reports shows concern number and ack status badge
- [ ] My Reports does NOT show student name or description
- [ ] Navigate to `/safeguarding/concerns` — list loads with filters
- [ ] Click a concern — detail page loads with two panels
- [ ] Actions timeline shows chronological entries
- [ ] Sealed concern shows "SEALED" banner
- [ ] Settings page at `/settings/safeguarding` loads with DLP inputs, SLA thresholds
- [ ] Mobile: all pages stack vertically, touch-friendly
- [ ] RTL (Arabic): all layouts mirror correctly
