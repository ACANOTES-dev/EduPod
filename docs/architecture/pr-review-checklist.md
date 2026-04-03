# PR Review Checklist

> Quick-reference for reviewing PRs against the codebase's architectural constraints.
> This is for **reviewers**. Authors should use `architecture/pre-flight-checklist.md` before submitting.

---

## Always Check

- [ ] No new direct Prisma reads of facade-protected tables -- run `pnpm check:boundaries`
- [ ] No new cross-module internal imports (lint rule enforces this)
- [ ] No empty catch blocks (lint rule enforces this)
- [ ] No hand-rolled forms in new frontend code (must use `react-hook-form` + `zodResolver`)
- [ ] No physical CSS directions (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`) -- use logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`)
- [ ] Import ordering follows the three-block pattern (external, internal `@school/*`, relative)
- [ ] Tenant-scoped tables have RLS policies (including `FORCE ROW LEVEL SECURITY`)
- [ ] No `$executeRawUnsafe` or `$queryRawUnsafe` outside the RLS middleware
- [ ] No sequential/batch `prisma.$transaction([...])` -- only interactive transactions
- [ ] Architecture files updated if cross-module deps, jobs, state machines, or danger zones changed

---

## Module-Specific Review Notes

### Behaviour (7 sub-modules, 17 controllers, 214 endpoints)

**Sub-module placement**: Verify the change lands in the correct sub-module. The boundaries are:

| Sub-module                  | Responsibility                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| BehaviourCoreModule         | Incidents, config, points, scope, alerts, history, tasks, attachments, side-effects                      |
| BehaviourDisciplineModule   | Sanctions, appeals, exclusions, amendments, legal holds, documents, guardian restrictions, interventions |
| BehaviourAnalyticsModule    | Analytics, pulse, AI, comparison, staff analytics, export analytics                                      |
| BehaviourRecognitionModule  | Awards, recognition, houses                                                                              |
| BehaviourSafeguardingModule | Safeguarding concerns, referrals, seal, break-glass                                                      |
| BehaviourOpsModule          | Admin tools, exports, health checks, dead-letter, recompute, retention                                   |
| BehaviourPortalModule       | Student-facing and parent-facing read-only views                                                         |

**Watch for:**

- [ ] SafeguardingModule isolation -- no other sub-module should inject safeguarding services. Safeguarding data leaks are a legal risk (DZ-13).
- [ ] AlertsService is in CoreModule -- alert creation must go through `BehaviourAlertsService`, not direct DB writes to `behaviour_alert_recipients`.
- [ ] `@Optional()` document injection in DisciplineModule (`BehaviourSanctionsService`, `BehaviourExclusionCasesService`, `BehaviourAppealsService`). Do NOT add more `@Optional()` patterns -- existing ones are legacy.
- [ ] Points cache invalidation -- any change to point calculations in `BehaviourPointsService` must invalidate Redis cache. Check `BehaviourPulseService` cache keys.
- [ ] Status projection -- every surface rendering incident status MUST call `projectIncidentStatus()` from `packages/shared`. `converted_to_safeguarding` must appear as `closed` to non-safeguarding users (DZ-13).
- [ ] Appeal decision cascades -- `decide()` touches 6 tables in one transaction (DZ-17). Verify no new writes added inside that transaction.
- [ ] Legal hold propagation -- exclusion cases and appeals auto-create legal holds. Verify holds are not inadvertently released (DZ-18, DZ-21).

### Pastoral (7 sub-modules, 14 controllers)

**Sub-module placement**: Verify the change lands in the correct sub-module. The boundaries are:

| Sub-module                      | Responsibility                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| PastoralCoreModule              | Concerns, concern versions, affected tracking, DSAR, events, notifications, chronology |
| PastoralCasesModule             | Cases, interventions, NEPS visits, parent contacts, referrals                          |
| PastoralCheckinsSubModule       | Student check-ins                                                                      |
| PastoralSstModule               | Student support team meetings                                                          |
| PastoralCriticalIncidentsModule | Critical incidents + response plans                                                    |
| PastoralAdminModule             | Reports (5 report-type services), exports, imports                                     |
| PastoralParentPortalModule      | Parent-facing read-only views                                                          |

**Watch for:**

- [ ] `PastoralEventService` is infrastructure (audit bus) -- it is injected by 20/28 services. This is expected, not a smell.
- [ ] CriticalIncidentService was split into core vs response-plan (`CriticalIncidentResponseService` is internal to `PastoralCriticalIncidentsModule`). Do not re-merge them.
- [ ] ParentPortalModule is read-only -- no mutations should be added to `ParentPastoralService` or `ParentPastoralController`.
- [ ] Child-protection coupling direction: `PastoralCore <- ChildProtection` is correct. The only reverse link is `PastoralAdmin -> CP`. Both use `forwardRef` (DZ-35). Adding new CP imports from other pastoral sub-modules will create coupling tangles.
- [ ] Escalation self-chain -- `notify-concern` can trigger `escalation-timeout` which re-enqueues itself (DZ-36). Verify termination conditions are intact if touching escalation logic.
- [ ] State machines -- 6 state machines (CaseStatus, ReferralStatus, SstMeetingStatus, CriticalIncidentStatus, PastoralInterventionStatus, ReferralRecommendationStatus). Verify transitions against `architecture/state-machines.md`.

### Finance (invoices, payments, payroll, fees)

**Watch for:**

- [ ] Transaction safety -- payment allocation MUST use RLS-scoped interactive transactions. No batch/sequential transactions.
- [ ] State machines -- invoice, payment, payroll run status transitions. Verify against `architecture/state-machines.md` (DZ-01).
- [ ] Monetary values -- `NUMERIC(12,2)` in DB, `number` in API responses. Never `FLOAT`, never floating-point arithmetic for money.
- [ ] `deriveInvoiceStatus()` -- system-driven transitions (payment -> partially_paid/paid, overdue cron) go through this helper, not the service. Do not duplicate this logic.
- [ ] `isPayableStatus()` -- consolidates "can this invoice accept payments/credits/late-fees". Used by credit-notes, late-fees, Stripe, payments services. Changes here cascade widely.
- [ ] Approval callback chain -- invoice approval dispatches via `MODE_A_CALLBACKS`. If adding a new approval type, both the callback map AND the worker processor must be updated (DZ-03).
- [ ] Encrypted Stripe keys -- decrypted only in memory, never logged, never returned in API responses. Only last 4 characters shown (DZ-09).
- [ ] Sequence generation -- receipts, invoices, payments, refunds all use `SequenceService`. The `refund` type is NOT in the canonical `SEQUENCE_TYPES` constant (DZ-04).

### Scheduling (orchestration, conflict detection, AI substitution)

**Watch for:**

- [ ] Solver boundary -- the CSP solver lives in `packages/shared/src/scheduler/` and is pure TypeScript. It MUST NOT have DB dependencies. No Prisma imports, no service injections.
- [ ] Orchestration service size -- `scheduling-orchestration.service.ts` is 964 lines. If the PR adds lines, verify it stays within the hotspot budget (check `scripts/hotspot-budgets.json`).
- [ ] Conflict detection -- must handle cross-year-group student overlaps. Verify conflict checks are not scoped only to a single year group.
- [ ] Classes-Schedules circular dependency -- resolved via `ModuleRef` lazy injection in ClassesModule (DZ-07). Do NOT add a direct `SchedulesService` constructor import in any classes service.
- [ ] AI substitution -- routes through `GdprTokenService` for tokenisation (Tier 1 dependency). Changing AI substitution payloads may require updating GDPR tokenisation rules.

### Auth (5 sub-services + facade)

**Watch for:**

- [ ] Decomposition boundary -- auth was recently split into 5 sub-services + `AuthService` facade. Do not re-merge logic into the facade.
- [ ] `TokenService` is the only external export -- `TenantsService` uses it for tenant provisioning. All other auth sub-services are internal.
- [ ] AuthGuard does NOT depend on AuthService -- keep it that way. The guard uses JWT verification directly, not the service layer.
- [ ] Rate limiting -- 3 layers (IP rate limit, brute-force detection, account lockout). All three must fire on login attempts. Removing or weakening any layer is a security regression.
- [ ] Bootstrap RLS -- auth flows execute before full tenant-scoped RLS context is available. They depend on special bootstrap RLS policies for `tenant_domains`, `tenant_memberships`, `membership_roles`, `roles`, `role_permissions` (DZ-38). Changes to these policies require login + `/auth/me` + permission-cache regression testing.
- [ ] MFA TOTP secrets are AES-256 encrypted via `EncryptionService` (DZ-09). Do not log, cache, or return decrypted secrets.
