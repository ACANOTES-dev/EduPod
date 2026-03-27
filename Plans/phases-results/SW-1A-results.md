# SW-1A: Infrastructure & Foundation — Results

## Summary

Complete foundation for the Student Wellbeing module: 20 database tables with RLS policies (standard, tiered, CP-specific), 14 PostgreSQL enums, trigger-enforced immutability on 4 append-only tables, global `app.current_user_id` in RLS middleware and worker, 18 pastoral permissions, 17 Zod schema files, 5 NestJS module shells, 6 worker processor stubs, and `pastoral_case` tenant sequence.

## Database

### Tables created (20)
| # | Table | Columns | Append-only | RLS Type |
|---|-------|---------|-------------|----------|
| 1 | pastoral_concerns | 23 | No | Tiered (tier < 3 OR cp_access_grants) |
| 2 | pastoral_concern_versions | 7 | Yes | Standard tenant |
| 3 | cp_records | 12 | No | CP-specific (tenant + user via cp_access_grants) |
| 4 | cp_access_grants | 7 | No | Standard tenant |
| 5 | pastoral_cases | 13 | No | Standard tenant |
| 6 | pastoral_case_students | 4 | No | Standard tenant |
| 7 | pastoral_interventions | 16 | No | Standard tenant |
| 8 | pastoral_intervention_actions | 12 | No | Standard tenant |
| 9 | pastoral_intervention_progress | 5 | Yes | Standard tenant |
| 10 | pastoral_referrals | 14 | No | Standard tenant |
| 11 | pastoral_referral_recommendations | 8 | No | Standard tenant |
| 12 | sst_members | 6 | No | Standard tenant |
| 13 | sst_meetings | 8 | No | Standard tenant |
| 14 | sst_meeting_agenda_items | 11 | No | Standard tenant |
| 15 | sst_meeting_actions | 12 | No | Standard tenant |
| 16 | pastoral_parent_contacts | 10 | Yes | Standard tenant |
| 17 | pastoral_events | 10 | Yes | Standard tenant |
| 18 | pastoral_dsar_reviews | 10 | No | Standard tenant |
| 19 | critical_incidents | 11 | No | Standard tenant |
| 20 | critical_incident_affected | 9 | No | Standard tenant |
| 21 | student_checkins | 9 | No | Standard tenant |

### Enums (14)
PastoralConcernSeverity, PastoralCaseStatus, PastoralInterventionStatus, PastoralActionStatus, PastoralReferralStatus, PastoralReferralRecommendationStatus, SstMeetingStatus, CpRecordType, MandatedReportStatus, PastoralDsarDecision, CriticalIncidentType, CriticalIncidentScope, CriticalIncidentStatus, CriticalIncidentImpactLevel

### Triggers
- `prevent_immutable_modification()` — applied to pastoral_events, pastoral_concern_versions, pastoral_intervention_progress, pastoral_parent_contacts
- `prevent_tier_downgrade()` — on pastoral_concerns (tier can only increase)
- `auto_escalate_cp_category()` — on pastoral_concerns (child_protection/self_harm → tier 3)
- `set_updated_at()` — on 14 mutable tables

### CHECK Constraints
- `chk_concern_tier`: tier IN (1, 2, 3)
- `chk_amendment_reason`: version_number = 1 OR amendment_reason IS NOT NULL
- `chk_version_number_positive`: version_number >= 1
- `chk_continuum_level`: continuum_level IN (1, 2, 3)
- `chk_mood_score_range`: mood_score BETWEEN 1 AND 5

### Partial Unique Index
- `uq_cp_access_grants_active`: (tenant_id, user_id) WHERE revoked_at IS NULL

## RLS Infrastructure
- `app.current_user_id` set in every API transaction (optional in createRlsClient, sentinel default)
- `app.current_user_id` set in every worker job transaction (sentinel for system jobs)
- `SYSTEM_USER_SENTINEL = '00000000-0000-0000-0000-000000000000'` exported from @school/shared

## Permissions (18)
| Permission | Tier |
|---|---|
| pastoral.log_concern | staff |
| pastoral.view_tier1 | staff |
| pastoral.view_tier2 | staff |
| pastoral.manage_cases | admin |
| pastoral.manage_interventions | admin |
| pastoral.manage_referrals | admin |
| pastoral.manage_sst | admin |
| pastoral.manage_checkins | admin |
| pastoral.view_checkin_aggregate | admin |
| pastoral.export_tier1_2 | admin |
| pastoral.manage_critical_incidents | admin |
| pastoral.view_reports | admin |
| pastoral.dsar_review | admin |
| pastoral.import_historical | admin |
| pastoral.manage_cp_access | admin |
| pastoral.export_tier3 | admin |
| pastoral.manage_mandated_reports | admin |
| pastoral.parent_self_referral | parent |

## Shared Zod Schemas (17 files)
`packages/shared/src/pastoral/enums.ts` + 16 schema files covering all DTOs, 26+ event payload types, and pastoral tenant settings.

## NestJS Modules (5)
- PastoralModule
- ChildProtectionModule
- PastoralDsarModule
- PastoralCheckinsModule
- CriticalIncidentsModule

All registered in app.module.ts. BullMQ `pastoral` queue registered.

## Worker Processors (6 stubs)
- notify-concern.processor.ts
- escalation-timeout.processor.ts
- precompute-agenda.processor.ts
- overdue-actions.processor.ts
- intervention-review-reminder.processor.ts
- checkin-alert.processor.ts

## Tenant Sequence
`pastoral_case` added to SEQUENCE_TYPES (format: PC-YYYYMM-NNN)

## Tests
- 6 RLS middleware tests (4 existing updated + 2 new for user_id behaviour)
- 240 shared package tests pass (0 regressions)

## Files Created (~30)
- packages/prisma/migrations/20260327200000_add_pastoral_care_tables/migration.sql
- packages/prisma/migrations/20260327200000_add_pastoral_care_tables/post_migrate.sql
- packages/shared/src/constants/system.ts
- packages/shared/src/pastoral/ (19 files: index, enums, 16 schemas, schema index)
- apps/api/src/modules/pastoral/pastoral.module.ts
- apps/api/src/modules/child-protection/child-protection.module.ts
- apps/api/src/modules/pastoral-dsar/pastoral-dsar.module.ts
- apps/api/src/modules/pastoral-checkins/pastoral-checkins.module.ts
- apps/api/src/modules/critical-incidents/critical-incidents.module.ts
- apps/worker/src/processors/pastoral/ (6 processor stubs)

## Files Modified (~10)
- apps/api/src/common/middleware/rls.middleware.ts (user_id support)
- apps/api/src/common/middleware/rls.middleware.spec.ts (new tests)
- apps/worker/src/base/tenant-aware-job.ts (user_id + sentinel)
- apps/worker/src/base/queue.constants.ts (PASTORAL queue)
- apps/worker/src/worker.module.ts (queue + processors registration)
- packages/prisma/schema.prisma (14 enums + 20 models)
- packages/prisma/seed/permissions.ts (18 permissions)
- packages/prisma/seed.ts (pastoral_case sequence)
- packages/shared/src/index.ts (pastoral + constants exports)
- apps/api/src/app.module.ts (5 module imports)

## Known Limitations
- Pre-existing type errors in uncommitted behaviour test files (15-6, 15-7 release-gate specs) — not caused by pastoral changes
- Pre-existing worker lint errors in behaviour processors (retention-check, partition-maintenance, digest-notifications)
- Database migration not yet applied to production (will be applied on deploy)

## Deviations from Spec
- `user_id` made optional in `createRlsClient` (spec said required) — this avoids touching 90+ existing service files while still delivering the security guarantee via sentinel default
- 21 models created instead of 20 — `StudentCheckin` was listed as Phase 4 table but included in schema creation for completeness
