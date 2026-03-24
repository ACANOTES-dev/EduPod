# Output Instructions

Save the full review report as a Markdown file in the `Code Review/` directory at the project root. Create the directory if it doesn't exist.

Filename convention: `review-YYYY-MM-DD-HHMMSS.md` using the current local timestamp at the time of execution.

Example: `Code Review/review-2026-03-24-143022.md`

At the top of the saved report, include a metadata header:

```
# Code Review — [YYYY-MM-DD HH:MM]
**Repository:** [repo name from package.json or directory name]
**Commit:** [current HEAD short SHA if git repo, otherwise "N/A"]
**Reviewed by:** Claude Code
**Scope:** Full codebase — 11 dimensions (P0–P4)
---
```

After saving, confirm the file path and total finding count to the chat.

---

# Review Brief

Review this entire codebase as a hostile auditor. Assume I'm about to pay a senior systems engineer $7,500–$10,000 to review and fix this. Every issue you catch saves me money. Be ruthless.

# Scope

Perform a full critical review across these dimensions, ordered by cost-of-failure.

## 1. Security (P0)

- Auth/authz flaws: broken access control, privilege escalation, token handling, session management
- Injection vectors: SQL, XSS, SSRF, command injection, path traversal, template injection
- Secrets management: hardcoded keys, env leakage, exposed config, .env in version control
- OWASP Top 10 coverage gaps
- Dependency vulnerabilities: outdated packages with known CVEs
- Data exposure risks: PII leakage, verbose errors, debug endpoints left in prod config
- CORS misconfiguration, missing security headers (CSP, HSTS, X-Frame-Options)

## 2. Data Privacy & Regulatory Compliance (P0)

This platform processes children's data in the EU. Treat this as equal severity to security.

- GDPR Article 8 compliance: lawful basis for processing minors' data, parental consent flows
- Data minimisation: is every field collected actually necessary? Are retention periods defined?
- Right to erasure: can a guardian request full deletion? Does it cascade correctly across all tables and backups?
- Data portability: can user data be exported in a structured, machine-readable format?
- Data Protection Impact Assessment (DPIA) readiness: has processing been documented?
- Cross-border data transfers: where are processors hosted? Are DPAs in place for Supabase, Cloudflare, any third-party service?
- Consent records: is consent timestamped, versioned, and auditable?
- PII in logs, error messages, analytics payloads, or URL parameters

## 3. Architecture & Scalability (P1)

- Coupling/cohesion: where does a change cascade unnecessarily?
- State management anti-patterns
- Database: N+1 queries, missing indexes, unbounded queries, connection pool misuse, missing foreign key constraints
- Concurrency and race conditions
- Horizontal scaling blockers: in-memory state, file system assumptions, sticky sessions
- API design: inconsistent patterns, missing pagination, no rate limiting, no versioning strategy
- Service boundary clarity: are responsibilities cleanly separated or bleeding across layers?

## 4. Data Integrity & Transactional Safety (P1)

- Incomplete transactions: can a multi-step operation (e.g. student enrolment, timetable generation) leave the database in an inconsistent state?
- Orphaned records: what happens when a parent entity is deleted?
- Audit trail: are critical mutations (grade changes, attendance edits, permission changes) logged with actor, timestamp, and previous value?
- Soft-delete strategy: is it consistent? Are soft-deleted records excluded from all relevant queries?
- Referential integrity: are foreign keys enforced at the database level, not just application level?
- Idempotency: can retried requests cause duplicate records or side effects?

## 5. Reliability & Error Handling (P2)

- Unhandled promise rejections and uncaught exceptions
- Missing retry logic, circuit breakers, or timeouts on external calls
- Silent failures: catch blocks that swallow errors without logging or re-throwing
- Missing input validation at trust boundaries (API endpoints, form submissions, webhook receivers)
- Graceful degradation: what happens when a downstream service (auth provider, email service, storage) is unavailable?
- Queue/job failure handling: are background tasks retried? Is there dead-letter handling?

## 6. Performance & Resource Management (P2)

- Memory leaks over long sessions or repeated operations
- Event loop blocking (if Node.js): synchronous operations in hot paths
- Unbounded payload sizes: missing request size limits, file upload caps
- Missing asset compression, CDN strategy, cache headers
- Cold start latency if serverless: impact on user-facing operations
- Computationally intensive operations (e.g. auto-scheduler): timeout strategy, cancellation support, progress feedback
- Database query performance: missing EXPLAIN analysis on complex queries

## 7. Code Quality & Maintainability (P3)

- Dead code, duplicated logic, god files/functions
- Naming inconsistencies, misleading abstractions
- Config and magic numbers scattered through business logic
- Missing or misleading types: `any` abuse, incorrect interfaces, loose typing at boundaries
- Patterns that contradict the project's own established conventions
- Test quality: are tests testing behaviour or implementation details? Brittle mocks?

## 8. Dependency Health & Supply Chain (P3)

- Abandoned packages: no commits in 12+ months, single maintainer
- License contamination: GPL or copyleft dependencies in a commercial product
- Lockfile hygiene: is the lockfile committed? Are versions pinned or floating?
- Dependency depth: deeply nested transitive dependencies with no audit trail
- Duplicate dependencies: multiple versions of the same package in the bundle

## 9. Internationalisation & Localisation Readiness (P3)

- Hardcoded strings in UI components (English assumed)
- RTL layout support: is it structurally supported or will it require a retrofit?
- Date, time, and calendar locale handling: Hijri calendar relevance for target market
- Character encoding assumptions: UTF-8 throughout? Database collation correct?
- Number and currency formatting: locale-aware or hardcoded?
- Text expansion: will UI break with longer translated strings?

## 10. DevOps & Operational Readiness (P4)

- Logging: structured? Adequate coverage? Excessive noise? PII in logs?
- Health checks and readiness probes
- Database migration strategy: versioned, reversible, tested?
- Environment parity: dev/staging/prod configuration drift
- Build reproducibility: deterministic builds from lockfile?
- Monitoring and alerting: are failure modes observable?
- Secret rotation: can secrets be rotated without downtime?

## 11. Disaster Recovery & Data Continuity (P4)

- Backup strategy: automated? Frequency? Tested restores?
- Point-in-time recovery capability for the database
- RPO/RTO: what's the maximum acceptable data loss and downtime? Is the infrastructure configured to meet it?
- Restore procedure: documented and tested, or theoretical?
- Data corruption detection: checksums, integrity checks on critical data?
- Failover: single points of failure in the infrastructure?

# Output Format

For each finding:

```
[P0–P4] | [file:line] | SHORT_TITLE
Problem: What's wrong, concretely.
Risk: What happens if this ships as-is.
Fix: Exact change required (not vague advice).
Effort: S/M/L
```

# Summary Tables

After all findings, produce:

1. **Severity tally** — count of P0/P1/P2/P3/P4 issues
2. **Hotspot files** — files with 3+ issues, ranked by severity
3. **Top 10 fixes by ROI** — highest risk-reduction per unit of effort
4. **Estimated external review delta** — which of these findings would a paid reviewer likely also catch vs. which are you getting ahead of?
5. **Honest production-readiness verdict** — would you deploy this to a school with paying parents tomorrow? What is the minimum viable fix list to get there?

# Rules

- Do NOT tell me what's good. I'm not paying for compliments.
- Do NOT pad with generic best-practice advice. Every finding must reference a specific file and line.
- If you're uncertain whether something is a bug or intentional, flag it with a `[?]` marker.
- Assume 100% unit test coverage exists. Focus on what unit tests cannot catch: integration gaps, race conditions, security logic, infra config, data privacy flows, transactional integrity.
- Think like someone who wants to break this system, not someone who built it.
- For P0 findings, include a proof-of-concept attack vector or failure scenario where possible.
- Group related findings when they share a root cause — don't inflate the count artificially.

# Review History

After saving the report, append a one-line entry to `Code Review/REVIEW_LOG.md` (create if it doesn't exist). Format:

```
| YYYY-MM-DD HH:MM | [short SHA] | P0: X | P1: X | P2: X | P3: X | P4: X | Total: X | [filename] |
```

If the log file is new, add this header first:

```
# Review Log

| Date | Commit | P0 | P1 | P2 | P3 | P4 | Total | Report |
|------|--------|----|----|----|----|----|-------|--------|
```

This gives a running trendline across reviews so I can track whether the codebase is improving or regressing between iterations.
