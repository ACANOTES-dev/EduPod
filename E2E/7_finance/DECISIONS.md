# Finance Bug-Fix Decisions Log

Running log of judgement calls made during `/fix-bug-log` autonomous run on `E2E/7_finance/BUG-LOG.md`.

Format: `- <BUG-ID> (YYYY-MM-DD): <decision>. — <agent>`

---

- FIN-001 (2026-04-12): Hardened `escapeHtml` + added `formatDate` in invoice EN/AR templates, accepted nested `payment.*` shape; chose template-side guards over service-side stringification. — Claude Opus 4.6
- FIN-006 (2026-04-12): Flattened `student` + `fee_structure` joins to `student_name` / `fee_structure_name` in the serializer; fixed server-side to avoid a coordinated web+api deploy. — Claude Opus 4.6
- FIN-002 (2026-04-12): Option A (fix frontend) + Sub-option A1 (add parent receipt endpoint). Route parent to `/students/:id/finances` per-student + aggregate; added `/parent/payments/:id/receipt/pdf` that enforces household ownership. — Claude Opus 4.6
- FIN-003+FIN-013 (2026-04-12): Bundled into one commit since both touch `parent-home.tsx`. Replaced hardcoded demo data with real fetches, added Arabic quick-action keys. — Claude Opus 4.6
- FIN-004 (2026-04-12): Scoped to the one cron whose processor already exists in the worker (overdue-detection). Remaining cron candidates flagged as follow-up bugs — they need API service to worker migration which is out of a bug-fix commit's scope. — Claude Opus 4.6
- FIN-005 (2026-04-12): Wrote into shared `notification` table with status=queued so `DispatchQueuedProcessor` picks it up — avoided a bespoke finance-notifications job type. Used direct Prisma access + eslint-disable to avoid a DI cycle through the audit interceptor. — Claude Opus 4.6
- FIN-007 (2026-04-12): Extended `credit-notes.service.ts` serializer to flatten household_name + issued_by_name from existing joins. — Claude Opus 4.6
- FIN-008 (2026-04-12): Normalised audit actions client-side (POST/PATCH/DELETE → create/update/delete) rather than rewriting the backend interceptor + migrating historical rows. — Claude Opus 4.6
- FIN-010 (2026-04-12): Populated existing `hubSubStripConfigs.finance` with 17 chip entries; reused the shell's existing SubStrip component rather than building a bespoke one. — Claude Opus 4.6
- FIN-011 (2026-04-12): Backend bug, not missing UI. Top-debtor derivation in `finance-dashboard.service.ts` was joined to overdueInvoices (due_date < now); widened to all outstanding invoices so debtors with not-yet-overdue balance appear. — Claude Opus 4.6
- FIN-012+FIN-015 (2026-04-12): Bundled into one commit since both touch the finance hub page. — Claude Opus 4.6
- FIN-019 (2026-04-12): No-op. Code at `refunds.service.ts:188` already throws on self-approval and test at `refunds.service.spec.ts:224` covers it. Marked Verified without change. — Claude Opus 4.6
- FIN-021, FIN-022, FIN-023, FIN-026 (2026-04-12): Blocked pending user input — see per-entry "Open question". — Claude Opus 4.6
- FIN-021 (2026-04-13): User chose hard cap. Set to 200 (matches documented perf-spec max) rather than 50 — 12-month stability goal + ~10 tenants at launch means 50 would create friction sooner than the infra change is worth. — Claude Opus 4.6
- FIN-022 (2026-04-13): User approved migration. Applied to prod via `DATABASE_MIGRATE_URL` (superuser). Used plain `CREATE INDEX` — Prisma migrations run inside a transaction which is incompatible with `CREATE INDEX CONCURRENTLY`. Volume is small enough that the brief lock is a non-event. — Claude Opus 4.6
- FIN-023 (2026-04-13): Option 1 (reconciliation cron) over Option 2 (saga). Alert-only initially. Inlined AES decrypt in the worker processor (same pattern as admissions-payment-link and key-rotation processors). — Claude Opus 4.6
- FIN-026 (2026-04-13): Investigation revealed not three competing code paths but a timeline artifact — `782bc94d` on 2026-04-07 stripped YYYYMM from all sequence consumers. User chose to keep current `{prefix}-NNNNNN` and leave pre-Apr-7 records as historical. — Claude Opus 4.6
- FIN-024 (2026-04-12): Ref guard against StrictMode double-invoke; kept simple rather than wrapping in a dedup cache. — Claude Opus 4.6
- FIN-025 (2026-04-12): Module-scoped promise cache in use-tenant-currency rather than a React context provider — unchanged hook API, no layout refactor. — Claude Opus 4.6
- FIN-028 (2026-04-12): `ar-u-nu-latn` locale variant preserves Arabic text, forces Latin digits. — Claude Opus 4.6
