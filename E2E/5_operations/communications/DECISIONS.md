# Communications Bug Log — Decisions

Running log of judgement calls made while working BUG-LOG.md.
Format: `- BUG-ID (YYYY-MM-DD): decision — Claude Opus 4.6`

- COMMS-001 (2026-04-13): Chose Option A — changed CTA href to `/inbox?compose=1` and added a client effect in InboxSidebar that auto-opens the compose dialog when the query param is present. Lower risk than building a dedicated compose route; reuses existing ComposeDialog. — Claude Opus 4.6
- COMMS-002 (2026-04-13): Chose Fix Direction Option A (service + UI) over Option B (lazy data provisioning). Service throws `UnprocessableEntityException { code: 'MISSING_PARENT_RECORD' }` when parent lookup fails. UI shows a visible banner instead of the misleading empty state. Data backfill NOT performed (no automated script run) — flagged in release-readiness as follow-up for ops. — Claude Opus 4.6
- COMMS-013 (2026-04-13): Shaped API response per caller role in the read-facade rather than relying on UI masking. Both `read_state` on messages and `last_read_at` on participants are omitted for parent/student callers. Types on both api and web made optional. No integration test added — covered by existing unit tests after the role-branching change. — Claude Opus 4.6
- COMMS-014 (2026-04-13): Marked Blocked — need input. Proper fix requires a migration (new `oversight_exports` table) + a new BullMQ processor, which exceeds autonomous scope per policy. Raised the decision back to the user: approve migration now, ship a Redis-cache+timeout stopgap, or accept the current behaviour. — Claude Opus 4.6
- COMMS-018 (2026-04-13): Chose `.strict()` Zod schema over introducing a DB CHECK constraint. The service layer was already safe; `.strict()` is defence-in-depth at the controller boundary and avoids a migration. DB-level CHECK left as a future window. — Claude Opus 4.6
- COMMS-005 (2026-04-13): Added the missing `settings.sen` i18n key rather than feature-flagging out the sidebar item — SEN pages already exist. — Claude Opus 4.6
- COMMS-006 (2026-04-13): Route-contextual redirect: `/communications*`, `/inbox/oversight*`, `/inbox/audiences*` all redirect to `/inbox` for non-admin users; everywhere else falls back to `/dashboard`. Centralised in `RequireRole`. — Claude Opus 4.6
- COMMS-009 (2026-04-13): Hide the Broadcast compose tab for non-admin roles rather than disabling it with tooltip. Cleaner UX; parity with backend policy. — Claude Opus 4.6
- COMMS-007 (2026-04-13): Thin `/logout` client page calling `auth.logout()` and redirecting to `/login`. Reuses existing auth-provider flow rather than introducing middleware. — Claude Opus 4.6
- COMMS-003 / COMMS-004 (2026-04-13): Hoist status tabs above the empty-state conditional so they stay visible with zero data. Wire to `?status=` query param for URL sync. — Claude Opus 4.6
- COMMS-015 (2026-04-13): Remove the safeguarding keyword cache entirely rather than adding Redis pub/sub. API and worker are separate processes — per-process invalidation can't reach the other. Keyword set is small; read-through is cheap. — Claude Opus 4.6
- COMMS-016 (2026-04-13): Audience depth cap of 8 implemented as a recursion parameter, not a Zod pre-pass. Threading depth as a function argument preserves sibling universe-promise sharing while still catching excessive nesting. — Claude Opus 4.6
- COMMS-017 (2026-04-13): No code change. Verified by code inspection that the edit-window applies uniformly across all staff roles — no admin-tier bypass exists. — Claude Opus 4.6
- COMMS-019 (2026-04-13): Direct helper-function call from TenantsService rather than introducing `@nestjs/event-emitter`. Wrapped in try/catch so a backfill error doesn't abort tenant creation — the boot-time init remains as a safety net. — Claude Opus 4.6
- COMMS-008 (2026-04-13): Role-gate the five admin dashboard widget fetches; also relax the `/v1/branding` GET to any authenticated role since tenant branding is non-sensitive and the shell needs it. — Claude Opus 4.6
- COMMS-011 / COMMS-012 / COMMS-014 / COMMS-022 / COMMS-010 (2026-04-13): Blocked. Out-of-module scope, test-env, migration-required, and product-decision items respectively. See each bug's Decisions block for specifics. — Claude Opus 4.6
- COMMS-020 / COMMS-021 (2026-04-13): Won't Fix. Both are documented in the spec as intentional behaviour. — Claude Opus 4.6
- COMMS-023 (2026-04-13): Spec-only edit: replaced the raw cross-tenant SQL assertion in teacher spec §27.5.2 with an API-based equivalent. — Claude Opus 4.6
