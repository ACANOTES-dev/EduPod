# Production Readiness Checklist

Last updated: 2026-03-16

---

## Overview

This checklist must be completed before the School Operating System is declared production-ready. Each item must be verified and signed off. Do not proceed to production launch with any unchecked item unless explicitly waived by the engineering lead with documented justification.

---

## 1. CI/CD Pipeline

- [ ] **1.1** CI pipeline runs end-to-end on every push to `main` and every pull request
- [ ] **1.2** All pipeline stages pass: lint, type-check, test, build, PDF snapshots, visual regression
- [ ] **1.3** RLS leakage test suite runs as a dedicated CI job and passes
- [ ] **1.4** Critical workflow test suite runs as a dedicated CI job and passes
- [ ] **1.5** Pipeline failure blocks merge to `main` (branch protection rules enforced)

**CI workflow file**: `.github/workflows/ci.yml`

---

## 2. Security -- Row-Level Security (RLS)

- [ ] **2.1** Every tenant-scoped table has `tenant_id UUID NOT NULL` with a foreign key to `tenants`
- [ ] **2.2** Every tenant-scoped table has RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] **2.3** Every tenant-scoped table has a SELECT/INSERT/UPDATE/DELETE policy filtering on `app.current_tenant_id`
- [ ] **2.4** RLS leakage tests exist for every tenant-scoped table
- [ ] **2.5** RLS leakage tests cover: direct queries, search results, notification dispatch, queue payloads
- [ ] **2.6** No usage of `$executeRawUnsafe` or `$queryRawUnsafe` outside the RLS middleware
- [ ] **2.7** Custom ESLint rule `no-sequential-transaction` is active and passing
- [ ] **2.8** Every BullMQ job payload includes `tenant_id` (enforced by `TenantAwareJob` base class)

---

## 3. Testing Coverage

- [ ] **3.1** Every API endpoint has at least one happy-path test
- [ ] **3.2** Every API endpoint has at least one permission-denied (403) test
- [ ] **3.3** Every tenant-scoped table has at least one cross-tenant RLS leakage test
- [ ] **3.4** Every calculation (payroll formulas, grade computation, payment allocation, fee generation) has unit tests with exact expected outputs
- [ ] **3.5** Every state machine has tests for all valid transitions and verification that blocked transitions throw
- [ ] **3.6** PDF snapshot tests pass for all templates in both locales (en, ar): report cards, transcripts, receipts, invoices, payslips

---

## 4. Visual Regression and RTL

- [ ] **4.1** Playwright visual regression baselines established for all school-facing views
- [ ] **4.2** Visual regression covers both locales (en, ar), dark mode, and mobile breakpoints
- [ ] **4.3** RTL regression tests verify Tailwind logical utilities are used (no physical left/right)
- [ ] **4.4** RTL regression tests verify LTR enforcement on: email addresses, URLs, phone numbers, numeric inputs, enrolment IDs
- [ ] **4.5** Visual regression runs in CI and fails on unexpected changes

---

## 5. Load and Performance Testing

- [ ] **5.1** Load test simulates 100 concurrent users across 5 tenants
- [ ] **5.2** Load test covers: login, search, attendance marking, invoice generation, payroll finalisation
- [ ] **5.3** p95 response time under load is below 2 seconds for API endpoints
- [ ] **5.4** p99 response time under load is below 5 seconds for API endpoints
- [ ] **5.5** No memory leaks detected during sustained load (30-minute test)
- [ ] **5.6** RLS context switching does not degrade performance under concurrent multi-tenant load
- [ ] **5.7** Meilisearch search latency remains below 200ms under load
- [ ] **5.8** PDF rendering does not block the API event loop (runs in worker)

---

## 6. Backup and Disaster Recovery

- [ ] **6.1** RDS automated backups configured: daily snapshots, 14-day retention
- [ ] **6.2** Point-in-time recovery (PITR) enabled with 5-minute granularity
- [ ] **6.3** Quarterly backup restore drill completed and documented
- [ ] **6.4** PITR procedure tested: restore to new instance, verify data integrity, switch application
- [ ] **6.5** Redis AOF persistence enabled
- [ ] **6.6** Backup monitoring CloudWatch alarm configured (alert on backup failure)

**Drill results**: `docs/drill-results/` (or `scripts/backup-drill-checklist.md`)

---

## 7. Runbooks and Documentation

- [ ] **7.1** Deployment runbook written and reviewed: `docs/runbooks/deployment.md`
- [ ] **7.2** Rollback runbook written and reviewed: `docs/runbooks/rollback.md`
- [ ] **7.3** Tenant provisioning runbook written and reviewed: `docs/runbooks/tenant-provisioning.md`
- [ ] **7.4** Incident response runbook written and reviewed: `docs/runbooks/incident-response.md`
- [ ] **7.5** Backup and restore runbook written and reviewed: `docs/runbooks/backup-restore.md`
- [ ] **7.6** Backup drill script and checklist available: `scripts/backup-drill.sh`, `scripts/backup-drill-checklist.md`

---

## 8. Demo Environment

- [ ] **8.1** Demo environment is functional and accessible
- [ ] **8.2** Demo environment seeded with representative sample data (students, staff, invoices, payroll runs)
- [ ] **8.3** Demo environment uses a separate database (not connected to production)
- [ ] **8.4** Demo seed script is repeatable: `pnpm seed:demo`
- [ ] **8.5** Demo covers both English and Arabic tenants

---

## 9. PWA and Offline Cache

- [ ] **9.1** Service worker registered and operational
- [ ] **9.2** Key operational views cached for offline access: timetable, class roster, recent announcements
- [ ] **9.3** Offline mode is read-only (no writes)
- [ ] **9.4** Locale and font bundles cached for offline use
- [ ] **9.5** Cached views are accessible when the device is offline
- [ ] **9.6** Stale data indicator shown when viewing cached content

---

## 10. External Service Integration

- [ ] **10.1** Stripe integration verified: payment intents, webhook processing, refunds
- [ ] **10.2** Stripe webhook endpoint is secured (signature verification)
- [ ] **10.3** Resend email integration verified: transactional emails, invitation flow, notification dispatch
- [ ] **10.4** Meilisearch configured and indexed: students, staff, and other searchable entities
- [ ] **10.5** Meilisearch search results respect tenant isolation (filtered by `tenant_id`)
- [ ] **10.6** Twilio WhatsApp integration verified (if enabled): notification delivery

---

## 11. Monitoring and Alerting

- [ ] **11.1** Sentry configured for error tracking (API, Web, Worker)
- [ ] **11.2** Sentry release tracking enabled (errors tagged with git SHA)
- [ ] **11.3** Sentry alerts configured for error spikes and RLS-related errors
- [ ] **11.4** CloudWatch alarms configured:
  - [ ] API 5xx error rate > 1%
  - [ ] API response time p99 > 5s
  - [ ] RDS CPU > 80%
  - [ ] RDS free storage < 10 GB
  - [ ] RDS connection count > 80% of max
  - [ ] ECS task count < desired count
  - [ ] ElastiCache memory > 80%
  - [ ] BullMQ failed job count > 50 in 5 min
- [ ] **11.5** Health check endpoints monitored externally (uptime monitoring service)

---

## 12. DNS and SSL

- [ ] **12.1** Production domain DNS configured and resolving
- [ ] **12.2** SSL certificates active for all domains (platform subdomains and custom domains)
- [ ] **12.3** Cloudflare for SaaS configured for custom hostname provisioning
- [ ] **12.4** HTTPS enforced (HTTP redirects to HTTPS)
- [ ] **12.5** HSTS header set with appropriate max-age

---

## 13. Environment Variables and Secrets

- [ ] **13.1** All environment variables documented in `env.example` files for each service
- [ ] **13.2** No secrets hardcoded in source code, Docker images, or task definitions
- [ ] **13.3** Secrets stored in AWS Secrets Manager (database password, JWT secrets, API keys)
- [ ] **13.4** Encryption keys for sensitive fields (bank details, Stripe keys) stored in Secrets Manager
- [ ] **13.5** Environment variables in ECS task definitions reference Parameter Store / Secrets Manager
- [ ] **13.6** `.env` files are in `.gitignore` and not committed to the repository

---

## 14. Network Security

- [ ] **14.1** CORS restricted to known origins (production domains only, not `*`)
- [ ] **14.2** Rate limiting enabled on authentication endpoints (login, token refresh, password reset)
- [ ] **14.3** Rate limiting enabled on public-facing endpoints (admissions forms, contact forms)
- [ ] **14.4** CSP (Content Security Policy) headers configured and verified
- [ ] **14.5** RDS instance is not publicly accessible (VPC-only access)
- [ ] **14.6** ElastiCache is not publicly accessible (VPC-only access)
- [ ] **14.7** Security groups restrict inbound traffic to necessary ports only

---

## 15. GDPR and Data Protection

- [ ] **15.1** Personal data inventory documented (what data, where stored, retention period)
- [ ] **15.2** Data processing agreement (DPA) template available for school tenants
- [ ] **15.3** Right to erasure: procedure documented for deleting a user's personal data
- [ ] **15.4** Right to portability: procedure documented for exporting a user's data
- [ ] **15.5** Audit logging captures all access to sensitive data (encrypted fields, personal records)
- [ ] **15.6** Data breach notification procedure documented (72-hour GDPR window)
- [ ] **15.7** Cookie consent implemented on public-facing pages
- [ ] **15.8** Privacy policy and terms of service published

---

## 16. Database

- [ ] **16.1** All Prisma migrations applied cleanly
- [ ] **16.2** Post-migrate script runs without errors (RLS policies, triggers, extensions)
- [ ] **16.3** All indexes are created and appropriate for query patterns
- [ ] **16.4** No unused or redundant indexes
- [ ] **16.5** `VACUUM ANALYZE` run on production database
- [ ] **16.6** Connection pooling configured (RDS Proxy or PgBouncer in transaction mode)
- [ ] **16.7** Slow query logging enabled (queries > 1 second)

---

## 17. Application Health

- [ ] **17.1** `/api/health` endpoint returns service liveness (postgres up, redis up)
- [ ] **17.2** `/api/health/ready` endpoint returns full readiness (postgres, redis, meilisearch, version, uptime)
- [ ] **17.3** ECS health checks configured to use `/api/health/ready`
- [ ] **17.4** ALB health checks configured with appropriate thresholds
- [ ] **17.5** Graceful shutdown implemented (drain connections before stopping)

---

## 18. Operational Procedures

- [ ] **18.1** On-call rotation established and documented
- [ ] **18.2** Escalation paths defined (see incident-response.md)
- [ ] **18.3** Incident severity classification agreed upon by the team
- [ ] **18.4** Post-incident review template available
- [ ] **18.5** Deployment schedule communicated (preferred windows, blackout periods)

---

## Sign-Off

| Role             | Name                 | Date         | Signature            |
| ---------------- | -------------------- | ------------ | -------------------- |
| Engineering Lead | ********\_\_******** | **\_\_\_\_** | ********\_\_******** |
| Backend Lead     | ********\_\_******** | **\_\_\_\_** | ********\_\_******** |
| Frontend Lead    | ********\_\_******** | **\_\_\_\_** | ********\_\_******** |
| DevOps / Infra   | ********\_\_******** | **\_\_\_\_** | ********\_\_******** |
| QA Lead          | ********\_\_******** | **\_\_\_\_** | ********\_\_******** |

**Production launch authorised**: [ ] Yes / [ ] No (with conditions)

**Conditions (if any)**:

---

---
