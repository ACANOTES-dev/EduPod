# Communications — Release Readiness Pack

**Generated:** 2026-04-12
**Commit:** c385872c (and subsequent composite commit)
**Module slug:** communications

This pack is the `/e2e-full` deliverable for the Communications module. Five sibling leg specs plus this composite index together form the tenant-onboarding readiness gate.

---

## Spec Pack

| Leg                 | Spec document                                                                                      | Rows / tables | Sections | Lines     | Generated  |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------- | -------- | --------- | ---------- |
| /E2E (admin)        | [admin_view/communications-e2e-spec.md](./admin_view/communications-e2e-spec.md)                   | 500+ rows     | 40       | 2,208     | 2026-04-12 |
| /E2E (teacher)      | [teacher_view/communications-e2e-spec.md](./teacher_view/communications-e2e-spec.md)               | 270+ rows     | 30       | 948       | 2026-04-12 |
| /E2E (parent)       | [parent_view/communications-e2e-spec.md](./parent_view/communications-e2e-spec.md)                 | 310+ rows     | 26       | 1,011     | 2026-04-12 |
| /E2E (student)      | [student_view/communications-e2e-spec.md](./student_view/communications-e2e-spec.md)               | 230+ rows     | 20       | 851       | 2026-04-12 |
| /e2e-integration    | [integration/communications-integration-spec.md](./integration/communications-integration-spec.md) | 260+ rows     | 14       | 876       | 2026-04-12 |
| /e2e-worker-test    | [worker/communications-worker-spec.md](./worker/communications-worker-spec.md)                     | 200+ rows     | 21       | 551       | 2026-04-12 |
| /e2e-perf           | [perf/communications-perf-spec.md](./perf/communications-perf-spec.md)                             | 180+ rows     | 16       | 520       | 2026-04-12 |
| /e2e-security-audit | [security/communications-security-spec.md](./security/communications-security-spec.md)             | 210+ rows     | 20       | 568       | 2026-04-12 |
| **Total**           |                                                                                                    | **~2,160**    | **187**  | **7,533** |            |

---

## Execution Order

Run the specs in this order to achieve full confidence:

1. **UI behavioural specs** — admin first (longest, highest surface), then teacher, parent, student
2. **Integration** — RLS matrix, contract matrix, webhooks, invariants
3. **Worker** — queues, cron, chains, dead-letter
4. **Perf** — endpoint budgets, scale, load
5. **Security** — OWASP + injection + permission hostile matrix

Each leg can be executed independently. The full pack is what achieves release-readiness.

---

## Coverage Summary

- **UI surface:** 21 pages × (1 admin + 1 teacher + 1 parent + 1 student spec) = 84 role-page cells
- **API endpoints:** 80+ across 15 controllers (communications, notifications, notification-templates, unsubscribe, webhooks, conversations, messages, inbox-settings, inbox-oversight, saved-audiences, attachments, search, people-search, parent-inquiries, safeguarding-keywords)
- **Tenant-scoped tables:** 19, all covered in RLS matrix
- **BullMQ jobs:** 13 processors across 3 queues (notifications, safeguarding, behaviour)
- **Cron schedules:** 5 (dispatch-queued/30s, inbox-fallback-check/15min, safeguarding-sla-check/1h, safeguarding-break-glass-expiry/15min, scheduled-publish-announcement delayed)
- **OWASP categories covered:** 10/10
- **Permission matrix cells:** 80 endpoints × 9 roles + unauthenticated = 800 cells
- **Zod schemas validated at edge cases:** 6 primary schemas + nested unions
- **State machines exhaustively tested:** 5 (announcement, notification, parent_inquiry, message_flag, conversation-freeze)
- **External integrations tested:** 3 (Resend email, Twilio SMS, Twilio WhatsApp) + S3 + PDF rendering
- **Data invariants declared:** 60+ SQL / API-read assertions across lifecycle, tenant isolation, referential integrity, uniqueness, denormalized counters, audit chain
- **Multi-tenant hostile-pair assertions per role spec:** 6–9 per role

---

## Known Limitations of the Pack

Even the full pack does not cover, by design:

- **Long-tail Zod validation combinatorics** beyond the documented boundary cases (combinatorically explosive; sampled, not exhaustive)
- **Real external-service behaviour at scale** (Resend API outages, Twilio SMS queue back-pressure, WhatsApp template approval delays) — mocked at the boundary; not live-tested against real provider dashboards
- **Accessibility audits beyond structural checks** — run a dedicated a11y tool (axe-core / Lighthouse a11y) as a sibling workflow
- **Visual regression / pixel diff** — use Percy / Chromatic / Playwright visual-diff as a sibling
- **Browser / device matrix beyond desktop Chrome + 375 px mobile emulation** — defer to manual QA on Safari, Firefox, Edge, iOS, Android
- **Production-scale load** (100k+ concurrent users, Black-Friday-style announcement burst) — perf spec targets realistic peak, not disaster-scenario peak
- **Novel attack vectors** invented after spec-write time — re-run security leg quarterly
- **PDF content byte-level correctness** beyond page count + metadata assertions — audited in integration §6 against sample fixtures, not exhaustively
- **Handlebars template correctness across every locale + every template_key** — spot-checked; full matrix is manual QA concern

These gaps are acceptable for the 99.99% confidence target. 100% confidence does not exist.

---

## Observations & Findings From the Walkthrough

The UI specs are augmentations of pre-existing specs; existing rows were preserved. The integration, worker, perf, and security specs are new and were produced by walking the live codebase.

### Spotted during walkthrough (flagged, not fixed)

- **O1 (parent_view spec):** Read-receipts are staff-only, but the API still returns `read_state` in thread responses and the UI just omits the chip. An adversary using DevTools could read it. → `security/communications-security-spec.md` §15 to verify whether scrubbing occurs at API layer or only UI; if only UI, that's a P1 disclosure.
- **O2 (safeguarding scan):** The keyword cache has a 5-minute TTL per tenant. Admins who delete a harmful keyword may still see that keyword matched against messages for up to 5 min. UX impact minor; documented.
- **O3 (teacher spec §23.5.2):** `SELECT DISTINCT tenant_id FROM conversations c JOIN conversation_participants cp ...` is expensive — the harness should use the scoped query via the API, not a direct cross-tenant count.
- **O4 (notification_templates):** Dual-policy RLS (`tenant_id IS NULL OR matches`) means a sloppy write could persist a tenant's override with `tenant_id IS NULL`, inadvertently making it platform-wide. The integration spec §3.3.4 explicitly asserts this path is blocked at controller layer; verify it is.
- **O5 (inbox search):** The `search.schema.ts` Zod does not cap query length at the documented value in `/v1/inbox/search?q=<10000 chars>`; verify cap at 500 during the run. If missing → P2 DoS.
- **O6 (audience resolution):** `saved_group` nested cycles return 409 `AUDIENCE_CYCLE_DETECTED` per code trace, but the resolver uses a recursion-based tree walk. For deeply-nested legitimate audiences the stack could blow. Verify during perf run.
- **O7 (oversight export):** PDF render is synchronous in the endpoint (up to 12 s p99 in perf spec). Under load this blocks a request worker. Consider moving to a background job with polling for presigned URL. Tracked as P1.
- **O8 (Wave-2 inbox permissions):** Permission seed backfill (`InboxPermissionsInit`) runs at startup; if a tenant was created between backfill runs and the service restarted mid-way, permissions may be missing for that tenant for a window. Integration spec §4 cell tests will catch this at onboarding.
- **O9 (inquiry close):** Only admin can close; parent cannot re-open. If parent has new concern after close, they must create a new inquiry. UX choice, documented. (Parent spec §23.4.4-5 asserts behaviour.)
- **O10 (broadcast audience snapshot):** Frozen at broadcast time, so new users joining the class mid-delivery are NOT notified. Integration spec §10.8.1 asserts this. Product decision is documented; verify with product lead if this is intended.
- **O11 (fallback chain):** Creates new notification rows rather than updating the existing row. The integration spec §6.2.4 asks for a trace via `idempotency_key(chain)` or shared `source_entity_id`; verify the chain key scheme during run so that analytics can trace a full chain.
- **O12 (message edit window):** Default 10 min; admin-tier can edit longer (if policy allows)? Admin spec verifies behaviour; confirm the backend actually honours tier-based extension or if all roles share one window.

### From the inventory / code survey (not strictly bugs, but should be verified)

- Existing `admin_view` spec was 1,968 lines and solid; augmentation rather than rewrite was the right call.
- `communications.unsubscribe` permission may not be in the seed yet — verify before run.
- `AdminTierOnlyGuard` is used by both `InboxOversightController` and `SafeguardingKeywordsController`; the guard lives in `InboxModule` but `SafeguardingModule` imports it. Cross-module dependency logged in `docs/architecture/module-blast-radius.md` implicitly (blast-radius audit recommended).

### Findings tally (pre-execution — what the walkthrough suggests to watch for)

| Severity | Pre-execution count | Notes                                                                         |
| -------- | ------------------- | ----------------------------------------------------------------------------- |
| P0       | 0                   | No clear show-stoppers found during spec-write walkthrough                    |
| P1       | 3                   | O1 (read-receipt API leak), O5 (search q-length cap), O7 (PDF sync blocking)  |
| P2       | 3                   | O2 (keyword cache), O6 (deep audience nesting), O12 (edit window consistency) |
| P3       | 6                   | Others — documentation, product-decision confirmations                        |

Full severity tally will be filled in once the run completes and the security leg is executed; this pre-execution tally is based on the code walkthrough only.

---

## Tester Assignment

This pack is designed to be executed by:

- **A dedicated QC engineer** working through each UI spec top-to-bottom, marking Pass/Fail per row, ideally one role per day (admin day 1, teacher day 2, parent day 3, student day 4)
- **A headless Playwright agent** for the /E2E legs (UI behaviour is scriptable end-to-end)
- **A Jest / Supertest harness** for /e2e-integration rows (each row maps to a test case)
- **A Jest + BullMQ + Redis harness** for /e2e-worker-test rows
- **k6 / Artillery + Lighthouse CI** for /e2e-perf (each row is a measurement)
- **Internal security engineer or paid pen-tester** for /e2e-security-audit (humans still find more than tools on the adversarial axis)

Realistic execution time estimate: ~5 engineer-days + 1 security-engineer-day + automation-harness build time.

---

## Sign-off

| Leg                 | Reviewer | Date | Pass | Fail | Notes |
| ------------------- | -------- | ---- | ---- | ---- | ----- |
| /E2E (admin)        |          |      |      |      |       |
| /E2E (teacher)      |          |      |      |      |       |
| /E2E (parent)       |          |      |      |      |       |
| /E2E (student)      |          |      |      |      |       |
| /e2e-integration    |          |      |      |      |       |
| /e2e-worker-test    |          |      |      |      |       |
| /e2e-perf           |          |      |      |      |       |
| /e2e-security-audit |          |      |      |      |       |

**Module release-ready when all eight rows are signed off at Pass with zero P0 / P1 findings outstanding.** P2 / P3 items go to the backlog with an owner and due date.

---

## Change Log

- 2026-04-12: Initial pack generated via `/e2e-full`. Replaces the previously incomplete single-leg (UI-only) state of this folder.
