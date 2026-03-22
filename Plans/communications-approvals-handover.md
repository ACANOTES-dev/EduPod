# Communications & Approvals — Handover Document

## Purpose

Two related modules that need bug fixes and feature work. Communications needs multi-channel delivery. Approvals has a broken detail page.

---

## Communications

### Current State

**What works well:**
- Announcements creation UI — title, body, scope (school-wide/year group/class/household/custom), schedule for later, save as draft or publish
- No structural changes needed to the announcements UI

**What's missing: Multi-channel delivery**

Currently announcements are in-app only. The system needs to support sending copies via:
1. **Email** (via Resend — already integrated)
2. **WhatsApp** (via Twilio — already scaffolded)
3. **SMS** (via Twilio — already scaffolded)

The user must be able to select which channels to use per announcement, in addition to the in-app notification.

### Existing Infrastructure

| Component | Path | Status |
|-----------|------|--------|
| Resend email service | `apps/api/src/modules/communications/` | Built |
| Twilio WhatsApp/SMS | `apps/api/src/modules/communications/` | Scaffolded |
| Notification templates | `packages/prisma/seed.ts` | Seeded |
| Tenant setting: `primaryOutboundChannel` | `packages/shared/src/schemas/tenant.schema.ts` | `'email'` or `'whatsapp'` |
| Tenant setting: `requireApprovalForAnnouncements` | Same file | Boolean, default true |
| Communications frontend | `apps/web/src/app/[locale]/(school)/communications/` | Built |

### What to Build

**Phase A: Per-announcement channel selection**

Add a channel selector to the announcement creation form:
- Checkboxes: "In-app" (always on), "Email", "WhatsApp", "SMS"
- Store selected channels on the announcement record
- When published, dispatch to each selected channel

**Phase B: Actual delivery integration**

- Email: Use Resend service to send the announcement body to all recipients in scope
- WhatsApp: Use Twilio service to send a message to parent phone numbers in scope
- SMS: Use Twilio service to send a shorter message to parent phone numbers
- Handle delivery failures gracefully (retry, log, don't block other channels)
- Delivery status tracking per recipient per channel

**Phase C: Communication history**

- Show delivery status per announcement (sent, delivered, failed per channel)
- Allow resending to failed recipients

### Key Files to Reference

| Purpose | Path |
|---------|------|
| Communications module | `apps/api/src/modules/communications/` |
| Announcements frontend | `apps/web/src/app/[locale]/(school)/communications/` |
| Notification service | `apps/api/src/modules/notifications/` |
| Tenant settings | `packages/shared/src/schemas/tenant.schema.ts` |

---

## Approvals

### Current State

The approvals module is a **generic workflow engine**. Actions that require approval create an `ApprovalRequest` record instead of executing immediately.

**What currently routes through approvals (controlled by tenant settings):**

| Action | Setting | Default |
|--------|---------|---------|
| Announcements | `communications.requireApprovalForAnnouncements` | true |
| Invoice issuance | `finance.requireApprovalForInvoiceIssue` | false |
| Admissions acceptance | `admissions.requireApprovalForAcceptance` | true |
| Payroll runs | `payroll.requireApprovalForNonPrincipal` | true |
| Schedule publishing | `scheduling.requireApprovalForNonPrincipal` | true |

### Bug: Approval detail page 404

**Location**: `/approvals` list page → click into any approval → 404 broken page

**Issue**: The list page at `/approvals` renders correctly and shows pending approval requests. But clicking into a specific approval navigates to `/approvals/{id}` which either:
- Has no page component (`apps/web/src/app/[locale]/(school)/approvals/[id]/page.tsx` doesn't exist)
- Or the page exists but queries a wrong/non-existent API endpoint

**Fix approach**:
1. Check if `apps/web/src/app/[locale]/(school)/approvals/[id]/page.tsx` exists
2. If not, create it — should show: request type, requester, submitted date, the content being approved (e.g., the announcement body), and Approve/Reject buttons
3. If it exists, check what API it calls and fix the endpoint mismatch
4. The approve/reject actions should call the approval service to transition the request and trigger the original action (e.g., publish the announcement)

### Approval tenant settings

The approval settings also include:
- `approvals.expiryDays` (default 7) — auto-expire unanswered requests
- `approvals.reminderAfterHours` (default 48) — send reminder to approver

### Key Files to Reference

| Purpose | Path |
|---------|------|
| Approvals backend | `apps/api/src/modules/approvals/` |
| Approvals frontend | `apps/web/src/app/[locale]/(school)/approvals/` |
| Approval settings | `packages/shared/src/schemas/tenant.schema.ts` (approvals section) |

---

## Implementation Order

```
1. Fix approvals detail page 404 (quick — likely just a missing page or wrong route)
2. Communications: add channel selector to announcement form (medium)
3. Communications: wire up email delivery via Resend (medium)
4. Communications: wire up WhatsApp/SMS delivery via Twilio (large)
5. Communications: delivery status tracking (medium)
```

The approvals fix is independent and quick. Communications multi-channel is a phased effort — email first (Resend is already working), then WhatsApp/SMS.

---

**Prompt for the new session:**

```
Read plans/communications-approvals-handover.md and CLAUDE.md. Start by fixing the approvals detail page 404 — check if apps/web/src/app/[locale]/(school)/approvals/[id]/page.tsx exists and either create it or fix the routing. Then move to communications: add per-announcement channel selection (checkboxes for Email, WhatsApp, SMS in addition to in-app) to the announcement creation form, and wire up email delivery via the existing Resend service.
```
