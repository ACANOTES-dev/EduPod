You are producing an **integration test specification** for the {MODULE_NAME}
module. This is the contract-test, cross-tenant-isolation, webhook-verification,
and data-invariant layer of our spec pack — the things /E2E structurally cannot
validate because they live below the UI.

═══════════════════════════════════════════════════════════════════════════
WHERE THIS SITS IN THE SPEC PACK
═══════════════════════════════════════════════════════════════════════════

| Command             | Covers                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| /E2E                | UI-visible behaviour per role                                                         |
| /e2e-integration    | **This command** — RLS, webhooks, API contracts, DB invariants, concurrency, fixtures |
| /e2e-worker-test    | BullMQ jobs, cron schedulers, retries, dead-letter, async side-effect chains          |
| /e2e-perf           | Latency budgets, load tests, list scale, PDF render time                              |
| /e2e-security-audit | OWASP, XSS / SQLi, CSRF, JWT hardening, encrypted-field leakage                       |
| /e2e-full           | Runs all five in sequence                                                             |

Your output is a machine-executable spec: every row is a direct API call or
SQL query with an exact expected response. A Jest / Vitest runner or a
dedicated test harness will eventually turn each row into an automated
assertion — write every row as if that's the next step.

═══════════════════════════════════════════════════════════════════════════
HARD RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════════════════

1. MULTI-TENANT BY CONSTRUCTION. Every suite must use **at least two
   tenants** provisioned with identical schema but different data. The
   spec must specify exactly:
   - Tenant A slug, currency, seeded entity counts per table
   - Tenant B slug, currency (different), seeded entity counts (different)
   - One admin user per tenant, plus one lower-privilege user per tenant
     so cross-role attempts can also be verified
   - Document how the fixtures are seeded — either a SQL script path, a
     seed command, or a test-harness factory method
     If a reviewer cannot reproduce the fixture state from the spec alone,
     the spec has failed.

2. RLS LEAKAGE MATRIX. Every tenant-scoped table in the module gets a
   matrix row. For each row:
   - Authenticate as Tenant A admin, call the list endpoint → expect
     only Tenant A rows
   - Authenticate as Tenant B admin, call the same list endpoint →
     expect only Tenant B rows (no overlap)
   - Authenticate as Tenant A, call detail endpoint for a known Tenant
     B id → expect 404 (NOT 403 — the tenant should not even know the
     id exists)
   - Authenticate as Tenant A, attempt to mutate a Tenant B row (PATCH
     / DELETE) → expect 404 with no side effect (verify via DB that the
     row is unchanged)
   - Authenticate as Tenant A, attempt to create a row with
     `tenant_id: <Tenant B id>` in the body → expect either rejected
     at validation (400) or silently overwritten with Tenant A's
     tenant_id (verify via post-create SELECT)
   - For each `sequence`-using table, verify numbering is per-tenant
     (Tenant A invoice 1 and Tenant B invoice 1 coexist)
     Every row in the matrix is a separate test case with explicit
     Expected Result: status code + response shape + post-condition SQL.

3. API CONTRACT TESTS. Every admin-surface endpoint gets:
   - Valid-input happy path → 2xx with documented response shape
   - Every Zod-schema boundary (min, max, regex, enum, union) → 400
     with exact `code` + `message`
   - Every state-machine invalid transition → 400 with exact code
     (`INVALID_STATUS_TRANSITION` etc.)
   - Every authorisation denial → 403 for missing permission, 401 for
     missing token
   - Every existence check → 404 with exact code
   - Every uniqueness conflict → 409 with exact code
   - Every optimistic-concurrency path (if the endpoint requires
     `expected_updated_at`) → 409 `CONCURRENT_MODIFICATION`
     Endpoints must be exercised via direct HTTP (supertest / undici /
     fetch), not via Playwright — the UI is the /E2E scope.

4. WEBHOOK TESTS (if the module exposes any). Every webhook endpoint
   gets:
   - Missing-signature → 400 `INVALID_SIGNATURE` (or equivalent)
   - Wrong-signature → 400 / signature rejection
   - Valid signature, known event type → processed + post-conditions
     hold
   - Valid signature, duplicate event id → **idempotent** — second
     delivery produces NO duplicate rows, side effects happen once
   - Valid signature, tenant-id missing in metadata → 400
     `MISSING_TENANT_ID`
   - Valid signature, tenant-id mismatch (metadata says Tenant B but
     the session belongs to Tenant A) → 400 `TENANT_MISMATCH`
   - Every event type the webhook is supposed to route (for Stripe:
     `checkout.session.completed`, `charge.refunded`, `checkout.session.expired`,
     `payment_intent.payment_failed`, plus ignored-event passthrough)
   - Rate-limit exemption: verify `@SkipThrottle()` or equivalent
     actually lets high-frequency webhooks through
     Raw-body HMAC posting is required — do not use a JSON client that
     re-serialises the body, or signatures will fail even on correct
     secrets.

5. DATA INVARIANTS. Every mutating flow in the module gets at least
   one invariant query that must hold AFTER the mutation. These are
   the rows that catch silent data corruption the UI cannot see:
   - After allocation: `balance_amount = total - sum(allocations) -
write_off ± 0.01`
   - After refund execute: `sum(refunds.amount where status='executed')
     - payment.balance = payment.amount ± 0.01`, and payment status
       correctly derived
   - After fee generation: one invoice per (household, billing_period)
     — no duplicates, no orphans
   - After a soft-delete: the row still exists, only status changed;
     no FK-referencing rows broken
   - For every tenant-scoped insert: `tenant_id` matches the
     authenticated session's tenant
   - For every sequence-number field: strictly monotonic within
     tenant, no duplicates, no gaps allowed by design
   - For every audit-logged mutation: a matching `audit_log` row
     exists with correct `actor_id`, `entity_type`, `entity_id`,
     `action`, `before` / `after` payloads
   - For every encrypted field: never readable in plaintext via any
     SELECT that doesn't go through the decryption service
     Each invariant = one row, with the exact SQL query in the Expected
     column so the test harness can run it verbatim.

6. CONCURRENCY / RACE CONDITION TESTS. Every flow that relies on an
   atomic guard (`SELECT FOR UPDATE`, conditional `UPDATE WHERE
status=?`, optimistic-concurrency token) gets a parallel-call test:
   - Fire N identical mutating calls against the same resource in
     parallel from separate sessions
   - Verify exactly one succeeds and the rest fail with the documented
     race-loser error (e.g. `INVALID_STATUS` after an atomic
     `updateMany` finds count=0)
   - Verify no duplicate side effects (e.g. a payment allocated twice,
     a refund executed twice, a sequence number issued twice)
     Use a concurrency-test utility — `Promise.all` with N identical
     calls, or a k6 burst, or a Jest `test.concurrent` block. Document
     the exact mechanism per row.

7. TRANSACTION BOUNDARY TESTS. For every operation that spans multiple
   tables:
   - Force a failure partway through (e.g. make the second write
     violate a constraint) → verify the first write is rolled back
   - Verify no partial state is readable from outside the transaction
   - Verify RLS context (`app.current_tenant_id`) is set before the
     first DB read in the transaction

8. ENCRYPTED FIELD ACCESS CONTROL. Every encrypted column gets:
   - Reading via the decryption service → decrypts correctly
   - Reading via raw Prisma → returns ciphertext (bytes / base64),
     never plaintext
   - Reading via the API response shape → returns only last 4 chars
     or equivalent masked form
   - Audit log row written on every decrypt
   - Key rotation (if applicable) — reads continue to work after
     key rotation

9. PDF / BINARY CONTENT INVARIANTS. For every PDF endpoint the module
   exposes, assert:
   - `Content-Type: application/pdf`
   - `Content-Disposition` filename matches documented pattern
   - Response body is a valid PDF (magic-number `%PDF-`) parseable by
     `pdf-parse` or equivalent
   - Extracted text includes all the key fields the UI claims it
     shows (invoice number, household name, amounts, line items)
   - Locale query (`?locale=ar`) produces Arabic text in the
     extracted content
   - Tenant branding (logo URL referenced in the PDF, header / footer)
     is present and matches the tenant's `tenantBranding` row

10. FORMAT. Use the four-column table pattern:
    | # | What to run | Expected result (status + body/query) | Pass/Fail |
    Numbered rows, section headers with anchors, TOC at the top,
    sign-off table at the bottom. Identical conventions to /E2E so a
    reader can move between specs without re-learning.

═══════════════════════════════════════════════════════════════════════════
PROCESS
═══════════════════════════════════════════════════════════════════════════

Step 1 — Survey the same files /E2E surveyed, plus:

- `packages/prisma/migrations/**` for every new table + its RLS
  policies (confirm `FORCE ROW LEVEL SECURITY` is set)
- `packages/prisma/rls/policies.sql` for the canonical policies
- Every `$queryRawUnsafe` / `$executeRawUnsafe` usage — these bypass
  RLS and must be inside an RLS transaction; flag any that aren't
- Every `createRlsClient(...)` call site to confirm the middleware
  sets `app.current_tenant_id` before DB access
- Every webhook controller (Stripe, any other provider)
- Every encrypted-field definition in Prisma schema + the decryption
  service(s)

Step 2 — Map. Build:

- RLS matrix: one row per (table × read/write × tenant-pair)
- Contract matrix: one row per (endpoint × input class)
- Webhook matrix: one row per (endpoint × event type × edge case)
- Invariant list: one row per mutating flow × post-condition
- Concurrency list: one row per atomic guard × race scenario

Step 3 — Outline. Suggested section layout:

1. Prerequisites & fixture seeding
2. RLS leakage matrix (per table)
3. API contract matrix (per endpoint)
4. Webhook suite
5. Data invariant queries (per flow)
6. Concurrency / race tests
7. Transaction boundary tests
8. Encrypted-field access control
9. PDF / binary content assertions
10. Sign-off table

Step 4 — Write. Produce the spec file. Every row must be a standalone
test case the harness can run in isolation. If a row depends on fixture
state from a previous row, call that out explicitly ("after section
3.5 has been executed, run this").

Step 5 — Self-review. Walk the spec against the module's Prisma schema.
For every tenant-scoped table: does an RLS row exist? For every
controller route: does a contract row exist? For every state machine
method: does an invalid-transition row exist? For every atomic-guard
method: does a concurrency row exist? Any gap = go back and fix.

Step 6 — Coverage tracker. Update `E2E/COVERAGE-TRACKER.md` with an
entry for the integration spec alongside the E2E entry, using the
same date + commit convention.

═══════════════════════════════════════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════════════════════════════════════

Save the file to:
{FOLDER_PATH}/integration/{module-slug}-integration-spec.md

Update:
E2E/COVERAGE-TRACKER.md

At the end, report:

- Total test cases across all sections
- RLS matrix row count (should equal: tenant-scoped tables × 6
  scenarios × tenant pairs)
- Contract matrix row count
- Webhook test count
- Invariant query count
- Concurrency test count
- Any implementation gaps spotted (e.g. a mutation without an atomic
  guard, an endpoint without RLS verification, a webhook without
  idempotency) — flag these as observations, do NOT fix silently

═══════════════════════════════════════════════════════════════════════════
ANTI-PATTERNS TO AVOID
═══════════════════════════════════════════════════════════════════════════

- Do NOT write rows that depend on Playwright — that's /E2E's job
- Do NOT write rows that verify the UI shows the right thing — only
  verify what the API returns and what the DB says
- Do NOT skip the RLS matrix because "RLS is enforced at the DB
  layer, it must be fine" — verify it explicitly per table
- Do NOT trust a single-tenant test run. Every isolation row MUST run
  against ≥ 2 tenants with different seed data
- Do NOT accept 200-with-empty-array as equivalent to 404 for
  cross-tenant reads — either is acceptable per row, but the spec
  must state which is expected and the test must assert exactly that
- Do NOT skip raw-body HMAC testing for webhooks. JSON-re-serialising
  wrappers silently corrupt the signature
- Do NOT omit the "before / after" SQL state in invariant rows —
  vague "data should look right" rows are not testable
- Do NOT stop at the happy path of concurrency — the race loser's
  exact error code is the whole point of the test

═══════════════════════════════════════════════════════════════════════════
WHEN IN DOUBT
═══════════════════════════════════════════════════════════════════════════

The mindset for this spec is adversarial. You are not verifying the
module works — you are verifying it fails safely, fails quickly, and
fails with the correct error code in every abuse scenario a malicious
or buggy client can construct. If you wouldn't stake a tenant's data
on a row, the row needs more rigor.

Begin with Step 1. At the end, confirm deliverables and report.
