# Module Tier System

> **Purpose**: Formal tier definitions that govern allowed dependency directions between modules.
> **Enforcement**: `scripts/check-module-tiers.js` — runs in CI on every push and PR.
> **Last verified**: 2026-04-01

---

## Why Tiers Exist

At 300k+ lines of code a flat module list becomes unmanageable. Tiers impose a DAG discipline: dependencies only flow downward (toward lower-numbered tiers). This prevents hidden coupling, circular imports, and the gradual collapse of isolation that kills large monoliths.

---

## Tier Definitions

### Tier 1 — Infrastructure

Global, @Global()-decorated modules. Provided by the NestJS DI container globally — no explicit import needed in most consumers. Zero domain knowledge.

**Rule**: Tier 1 modules import NOTHING from other application modules.

**Modules**:
| Module | Exports |
|--------|---------|
| `prisma` | `PrismaService` |
| `redis` | `RedisService` |
| `config` | NestJS `ConfigService` (global via `ConfigModule.forRoot`) |
| `common` | `PermissionCacheService` |
| `audit-log` | `AuditLogService`, `SecurityAuditService` (global via `APP_INTERCEPTOR`) |

---

### Tier 2 — Cross-Cutting Services

Utility and compliance services consumed across many domains. They know about infrastructure (Tier 1) but nothing about business domains (Tiers 3/4).

**Rule**: Tier 2 modules may only import from Tier 1. They must NOT import from Tier 3 or Tier 4.

**Exception**: `gdpr` and `policy-engine` have documented circular `forwardRef()` dependencies on Tier 3 modules (see Known Exceptions below). Within Tier 2, `auth` and `s3` are the most foundational modules (zero deps on other Tier 2 modules). `search`, `configuration`, and `gdpr` may import `auth` or `s3` for guards and file storage — these are whitelisted intra-tier flows.

**Modules**:
| Module | Key Exports | Tier 1 Deps Used |
|--------|-------------|------------------|
| `auth` | `AuthService` | none (uses PrismaService globally) |
| `s3` | `S3Service` | none |
| `sequence` | `SequenceService` | PrismaService |
| `approvals` | `ApprovalRequestsService` | PrismaService |
| `pdf-rendering` | `PdfRenderingService`, `PdfJobService` | PrismaService |
| `search` | `SearchIndexService` | PrismaService, RedisService |
| `configuration` | `SettingsService`, `EncryptionService` | PrismaService, S3Module |
| `gdpr` | `GdprTokenService`, `AiAuditService`, `ConsentService`, `DpaService`, `PrivacyNoticesService`, `SubProcessorsService`, `AgeGateService` | PrismaService; `forwardRef(CommunicationsModule)` (see exceptions) |
| `policy-engine` | `PolicyEvaluationEngine`, `PolicyRulesService`, `PolicyReplayService` | PrismaService; `forwardRef(BehaviourModule)` (see exceptions) |

---

### Tier 3 — Domain Services

Core business modules. They implement feature domains and may import from Tier 1 and Tier 2. Tier 3 modules may import other Tier 3 modules only when there is a documented, intentional dependency — these are listed in `module-blast-radius.md`.

**Rule**: Tier 3 modules may import from Tier 1 and Tier 2. They must NOT import from Tier 4. Peer Tier 3 imports require explicit documentation in `module-blast-radius.md`.

**Modules**:
| Module | Primary Tier 2 Deps | Notable Tier 3 Peer Deps |
|--------|---------------------|--------------------------|
| `academics` | `auth` | — |
| `admissions` | `auth`, `approvals`, `configuration`, `search`, `sequence` | — |
| `attendance` | `auth`, `configuration`, `gdpr` | `school-closures`, `communications` |
| `behaviour` | `auth`, `approvals`, `pdf-rendering`, `s3`, `sequence` | `pastoral` (forwardRef), `child-protection` (forwardRef), `policy-engine` (forwardRef) |
| `child-protection` | `auth`, `pdf-rendering`, `sequence` | `pastoral` (forwardRef) |
| `class-requirements` | `auth` | — |
| `classes` | `auth` | `schedules` |
| `communications` | `approvals`, `gdpr` (forwardRef) | — |
| `critical-incidents` | — (stub) | — |
| `finance` | `approvals`, `configuration`, `pdf-rendering`, `sequence` | — |
| `gradebook` | `auth`, `configuration`, `gdpr`, `pdf-rendering` | `academics`, `communications` |
| `homework` | `s3` | — |
| `imports` | `configuration`, `s3`, `sequence` | — |
| `pastoral` | `auth`, `pdf-rendering`, `sequence` | `child-protection` (forwardRef), `communications` |
| `pastoral-checkins` | — (stub) | — |
| `pastoral-dsar` | — (stub) | — |
| `payroll` | `approvals`, `configuration`, `pdf-rendering` | — |
| `period-grid` | `auth` | — |
| `rbac` | — | — |
| `registration` | `auth`, `configuration`, `sequence` | `finance` |
| `regulatory` | `auth`, `s3` | — |
| `rooms` | `auth` | — |
| `schedules` | `auth` | `rooms` |
| `scheduling` | `auth`, `configuration`, `gdpr` | — |
| `scheduling-runs` | `auth` | `period-grid` |
| `school-closures` | `auth` | — |
| `sen` | `auth`, `configuration`, `sequence` | — |
| `staff-availability` | `auth` | — |
| `staff-preferences` | `auth` | — |
| `staff-profiles` | `auth`, `configuration`, `sequence` | — |
| `staff-wellbeing` | `configuration` | — |
| `students` | `auth`, `sequence` | — |
| `tenants` | `auth`, `sequence` | — |

---

### Tier 4 — Leaf Modules

Isolated feature modules with no downstream dependents. They may import from Tiers 1, 2, and 3, but must NOT import from other Tier 4 modules. These are designed to be independently modifiable.

**Rule**: Tier 4 modules must NOT import from other Tier 4 modules. They may import from Tiers 1–3.

**Exception**: `dashboard` imports `reports` — both are Tier 4, but `reports` exports `ReportsDataAccessService` as a deliberate cross-module read facade. This is a documented, approved exception (see Known Exceptions below).

**Modules**:
| Module | Tier 3 Deps | Notes |
|--------|-------------|-------|
| `compliance` | `gdpr`, `pastoral` (forwardRef), `s3`, `search` | Imports 2× Tier 2 + 1× Tier 3 |
| `dashboard` | `auth`, `reports` | `reports` is Tier 4 — documented exception |
| `early-warning` | — | Uses global PrismaModule only |
| `engagement` | `pdf-rendering` | — |
| `health` | `search` | — |
| `households` | `auth`, `sequence`, `registration` | `registration` is Tier 3 |
| `parent-inquiries` | — | Uses global PrismaModule only |
| `parents` | `auth` | — |
| `preferences` | `auth` | — |
| `reports` | `configuration`, `gdpr` | Exports `ReportsDataAccessService` |
| `security-incidents` | `auth`, `sequence` | Platform-level, no tenant scope |
| `website` | — | Uses global PrismaModule + RedisModule |

---

## Dependency Rules Summary

```
Tier 1 ← may be imported by: Tier 2, Tier 3, Tier 4
Tier 2 ← may be imported by: Tier 3, Tier 4
Tier 3 ← may be imported by: Tier 4
Tier 4 ← may NOT be imported by any other module
```

Stated the other way:

| Module Tier | May import from                              |
| ----------- | -------------------------------------------- |
| Tier 1      | Nothing (no application module deps)         |
| Tier 2      | Tier 1 only                                  |
| Tier 3      | Tier 1, Tier 2, same-tier peers (documented) |
| Tier 4      | Tier 1, Tier 2, Tier 3                       |

**Violations the CI check enforces**:

1. Tier 1 importing from Tier 2, 3, or 4
2. Tier 2 importing from Tier 3 or 4 (without `forwardRef` exception)
3. Tier 3 importing from Tier 4
4. Tier 4 importing from Tier 4 (without documented exception)

---

## Known Exceptions

These violations are real but intentional. They are documented here and whitelisted in `scripts/check-module-tiers.js`.

| Importer                | Imported                | Tier Direction | Justification                                                                                                                                                                       |
| ----------------------- | ----------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search` (T2)           | `auth` (T2)             | T2 → T2        | `SearchController` needs `AuthGuard` for authenticated search endpoints. `auth` is the most foundational T2 module (zero Tier 2 deps itself).                                       |
| `configuration` (T2)    | `s3` (T2)               | T2 → T2        | `BrandingService` uploads logos to S3. `s3` is a foundational T2 module with zero Tier 2 deps.                                                                                      |
| `gdpr` (T2)             | `auth` (T2)             | T2 → T2        | GDPR controllers need `AuthGuard`. Same justification as `search → auth`.                                                                                                           |
| `policy-engine` (T2)    | `behaviour` (T3)        | T2 → T3        | Bidirectional policy evaluation — `PolicyEvaluationEngine` needs `BehaviourHistoryService`. Resolved via `forwardRef()`. Documented in blast-radius under DZ-related circular deps. |
| `gdpr` (T2)             | `communications` (T3)   | T2 → T3        | Privacy notice publish fans out notifications. GDPR is @Global provider so the forwardRef is needed. Resolved via `forwardRef()`.                                                   |
| `dashboard` (T4)        | `reports` (T4)          | T4 → T4        | `ReportsDataAccessService` is the intentional cross-module read facade. Dashboard is its primary consumer.                                                                          |
| `compliance` (T4)       | `pastoral` (T3)         | T4 → T3        | DSAR traversal requires pastoral data. Uses `forwardRef()` to break circular initialization.                                                                                        |
| `behaviour` (T3)        | `pastoral` (T3)         | T3 → T3        | Behaviour incidents link to pastoral concerns for safeguarding escalation. Resolved via `forwardRef()`. Blast-radius documented.                                                    |
| `behaviour` (T3)        | `child-protection` (T3) | T3 → T3        | Safeguarding concerns may escalate to CP records. Resolved via `forwardRef()`. Blast-radius documented.                                                                             |
| `child-protection` (T3) | `pastoral` (T3)         | T3 → T3        | CP records link to pastoral concerns. Circular with pastoral. `forwardRef()` on both sides. Blast-radius documented.                                                                |
| `pastoral` (T3)         | `child-protection` (T3) | T3 → T3        | Pastoral concerns can escalate to CP. Symmetric with above.                                                                                                                         |
| `gradebook` (T3)        | `academics` (T3)        | T3 → T3        | Gradebook needs academic period data. Blast-radius documented.                                                                                                                      |
| `gradebook` (T3)        | `communications` (T3)   | T3 → T3        | Grade publication notifications. Blast-radius documented.                                                                                                                           |
| `attendance` (T3)       | `communications` (T3)   | T3 → T3        | Parent attendance notifications. Blast-radius documented.                                                                                                                           |
| `attendance` (T3)       | `school-closures` (T3)  | T3 → T3        | Closures affect session generation. Blast-radius documented.                                                                                                                        |
| `classes` (T3)          | `schedules` (T3)        | T3 → T3        | Class assignments depend on schedule slots. Blast-radius documented.                                                                                                                |
| `registration` (T3)     | `finance` (T3)          | T3 → T3        | Registration creates invoices. Blast-radius documented.                                                                                                                             |
| `households` (T4)       | `registration` (T3)     | T4 → T3        | Households link to registrations. Documented.                                                                                                                                       |
| `scheduling-runs` (T3)  | `period-grid` (T3)      | T3 → T3        | Run generation needs period grid. Blast-radius documented.                                                                                                                          |
| `schedules` (T3)        | `rooms` (T3)            | T3 → T3        | Schedule slots require room data. Blast-radius documented.                                                                                                                          |

---

## Adding a New Module

1. Place the module in `apps/api/src/modules/{module-name}/`
2. Determine its tier based on the definitions above
3. Add it to the tier mapping in `scripts/check-module-tiers.js` (the `MODULE_TIERS` constant)
4. Add an entry to the appropriate tier section in this document
5. If the module introduces a peer-tier or cross-tier dependency, add it to the Known Exceptions table above AND in `architecture/module-blast-radius.md`
6. Run `node scripts/check-module-tiers.js` locally to confirm no violations

---

## Changing an Existing Module's Tier

Tier re-classification is a significant architectural event:

1. Open a PR describing the re-classification rationale
2. Update `scripts/check-module-tiers.js` (the `MODULE_TIERS` constant)
3. Update this document
4. Update `architecture/module-blast-radius.md` if blast radius changes
5. Verify `node scripts/check-module-tiers.js` passes with zero violations
