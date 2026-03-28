# Phase A: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** Lay the complete data layer, shared types, queue infrastructure, permission seeds, and empty NestJS module scaffold for the Predictive Early Warning System. After this phase, all subsequent phases (signal collectors, scoring engine, API, worker, frontend) have a stable foundation to build on.

**Architecture:** 4 new tenant-scoped tables with RLS, 3 new Prisma enums, Zod-validated JSONB schemas, BullMQ queue registration, permission seeds, empty NestJS module registered in app.module.ts, worker queue registration.

**Tech Stack:** Prisma (migration + schema), PostgreSQL (RLS policies), Zod (shared schemas), NestJS (module scaffold), BullMQ (queue constant).

**Spec:** `docs/superpowers/specs/2026-03-28-predictive-early-warning-design.md`

---

## Task 1: Add Prisma Enums and Models

**Files:**
- Modify: `packages/prisma/schema.prisma`

- [ ] **Step 1.1: Add the three new enums**

Append immediately after the last enum in the file (after `CriticalIncidentImpactLevel`). Search for the line `enum CriticalIncidentImpactLevel {` and find its closing `}`, then add after it:

```prisma
// ─── Early Warning Enums ────────────────────────────────────────────────────

enum EarlyWarningRiskTier {
  green
  yellow
  amber
  red

  @@map("early_warning_risk_tier")
}

enum EarlyWarningDomain {
  attendance
  grades
  behaviour
  wellbeing
  engagement

  @@map("early_warning_domain")
}

enum EarlyWarningSignalSeverity {
  low
  medium
  high
  critical

  @@map("early_warning_signal_severity")
}
```

- [ ] **Step 1.2: Add the four new models**

Append at the end of the schema file (after the `SecurityIncidentEvent` model, i.e. after line 7489):

```prisma
// ─── Early Warning System ───────────────────────────────────────────────────

model StudentRiskProfile {
  id                  String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String               @db.Uuid
  student_id          String               @db.Uuid
  academic_year_id    String               @db.Uuid
  composite_score     Decimal              @default(0) @db.Decimal(5, 2)
  risk_tier           EarlyWarningRiskTier @default(green)
  tier_entered_at     DateTime?            @db.Timestamptz(6)
  attendance_score    Decimal              @default(0) @db.Decimal(5, 2)
  grades_score        Decimal              @default(0) @db.Decimal(5, 2)
  behaviour_score     Decimal              @default(0) @db.Decimal(5, 2)
  wellbeing_score     Decimal              @default(0) @db.Decimal(5, 2)
  engagement_score    Decimal              @default(0) @db.Decimal(5, 2)
  signal_summary_json Json?
  trend_json          Json?
  assigned_to_user_id String?              @db.Uuid
  assigned_at         DateTime?            @db.Timestamptz(6)
  last_computed_at    DateTime             @default(now()) @db.Timestamptz(6)
  created_at          DateTime             @default(now()) @db.Timestamptz(6)
  updated_at          DateTime             @default(now()) @updatedAt @db.Timestamptz(6)

  // Relations
  tenant        Tenant       @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student       Student      @relation("ew_risk_profile_student", fields: [student_id], references: [id], onDelete: Restrict)
  academic_year AcademicYear @relation("ew_risk_profile_academic_year", fields: [academic_year_id], references: [id], onDelete: Restrict)
  assigned_to   User?        @relation("ew_risk_profile_assigned_to", fields: [assigned_to_user_id], references: [id], onDelete: SetNull)

  tier_transitions EarlyWarningTierTransition[]

  @@unique([tenant_id, student_id, academic_year_id], name: "uq_risk_profile_tenant_student_year")
  @@index([tenant_id, risk_tier], map: "idx_risk_profiles_tenant_tier")
  @@index([tenant_id, composite_score(sort: Desc)], map: "idx_risk_profiles_tenant_score")
  @@map("student_risk_profiles")
}

/// Append-only signal audit trail. No updated_at.
model StudentRiskSignal {
  id                 String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id          String                      @db.Uuid
  student_id         String                      @db.Uuid
  academic_year_id   String                      @db.Uuid
  domain             EarlyWarningDomain
  signal_type        String                      @db.VarChar(100)
  severity           EarlyWarningSignalSeverity
  score_contribution Decimal                     @db.Decimal(5, 2)
  details_json       Json?
  source_entity_type String                      @db.VarChar(100)
  source_entity_id   String                      @db.Uuid
  detected_at        DateTime                    @db.Timestamptz(6)
  created_at         DateTime                    @default(now()) @db.Timestamptz(6)

  // Relations
  tenant        Tenant       @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student       Student      @relation("ew_risk_signal_student", fields: [student_id], references: [id], onDelete: Restrict)
  academic_year AcademicYear @relation("ew_risk_signal_academic_year", fields: [academic_year_id], references: [id], onDelete: Restrict)

  @@index([tenant_id, student_id, detected_at(sort: Desc)], map: "idx_risk_signals_tenant_student_detected")
  @@index([tenant_id, domain, detected_at(sort: Desc)], map: "idx_risk_signals_tenant_domain_detected")
  @@map("student_risk_signals")
}

/// Append-only tier transition log. No updated_at.
model EarlyWarningTierTransition {
  id                   String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id            String                @db.Uuid
  student_id           String                @db.Uuid
  profile_id           String                @db.Uuid
  from_tier            EarlyWarningRiskTier?
  to_tier              EarlyWarningRiskTier
  composite_score      Decimal               @db.Decimal(5, 2)
  trigger_signals_json Json?
  routed_to_user_id    String?               @db.Uuid
  notification_id      String?               @db.Uuid
  transitioned_at      DateTime              @db.Timestamptz(6)
  created_at           DateTime              @default(now()) @db.Timestamptz(6)

  // Relations
  tenant     Tenant             @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  student    Student            @relation("ew_tier_transition_student", fields: [student_id], references: [id], onDelete: Restrict)
  profile    StudentRiskProfile @relation(fields: [profile_id], references: [id], onDelete: Cascade)
  routed_to  User?              @relation("ew_tier_transition_routed_to", fields: [routed_to_user_id], references: [id], onDelete: SetNull)
  notification Notification?    @relation("ew_tier_transition_notification", fields: [notification_id], references: [id], onDelete: SetNull)

  @@index([tenant_id, student_id, transitioned_at(sort: Desc)], map: "idx_tier_transitions_tenant_student_at")
  @@index([tenant_id, to_tier, transitioned_at(sort: Desc)], map: "idx_tier_transitions_tenant_tier_at")
  @@map("early_warning_tier_transitions")
}

model EarlyWarningConfig {
  id                       String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id                String   @unique @db.Uuid
  is_enabled               Boolean  @default(false)
  weights_json             Json     @default("{\"attendance\":25,\"grades\":25,\"behaviour\":20,\"wellbeing\":20,\"engagement\":10}")
  thresholds_json          Json     @default("{\"green\":0,\"yellow\":30,\"amber\":50,\"red\":75}")
  hysteresis_buffer        Int      @default(10)
  routing_rules_json       Json     @default("{\"yellow\":{\"role\":\"homeroom_teacher\"},\"amber\":{\"role\":\"year_head\"},\"red\":{\"roles\":[\"principal\",\"pastoral_lead\"]}}")
  digest_day               Int      @default(1)
  digest_recipients_json   Json     @default("[]")
  high_severity_events_json Json    @default("[\"suspension\",\"critical_incident\",\"third_consecutive_absence\"]")
  created_at               DateTime @default(now()) @db.Timestamptz(6)
  updated_at               DateTime @default(now()) @updatedAt @db.Timestamptz(6)

  // Relations
  tenant Tenant @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@map("early_warning_configs")
}
```

- [ ] **Step 1.3: Add relation fields to the Tenant model**

In the `Tenant` model, after the GDPR Relations block (after `retention_policies RetentionPolicy[]`, before `@@map("tenants")`), add:

```prisma
  // Early Warning Relations
  student_risk_profiles          StudentRiskProfile[]
  student_risk_signals           StudentRiskSignal[]
  early_warning_tier_transitions EarlyWarningTierTransition[]
  early_warning_configs          EarlyWarningConfig?
```

- [ ] **Step 1.4: Add relation fields to the User model**

In the `User` model, after the Phase J Relations block (after `incident_events SecurityIncidentEvent[] @relation("incident_event_created_by")`, before `@@map("users")`), add:

```prisma
  // Early Warning Relations
  ew_risk_profiles_assigned       StudentRiskProfile[]           @relation("ew_risk_profile_assigned_to")
  ew_tier_transitions_routed_to   EarlyWarningTierTransition[]   @relation("ew_tier_transition_routed_to")
```

- [ ] **Step 1.5: Add relation fields to the Student model**

In the `Student` model, find the last relation array and add before `@@map("students")`:

```prisma
  // Early Warning Relations
  ew_risk_profiles      StudentRiskProfile[]           @relation("ew_risk_profile_student")
  ew_risk_signals       StudentRiskSignal[]            @relation("ew_risk_signal_student")
  ew_tier_transitions   EarlyWarningTierTransition[]   @relation("ew_tier_transition_student")
```

- [ ] **Step 1.6: Add relation fields to the AcademicYear model**

In the `AcademicYear` model, find the last relation array and add before `@@map("academic_years")`:

```prisma
  // Early Warning Relations
  ew_risk_profiles StudentRiskProfile[] @relation("ew_risk_profile_academic_year")
  ew_risk_signals  StudentRiskSignal[]  @relation("ew_risk_signal_academic_year")
```

- [ ] **Step 1.7: Add relation field to the Notification model**

In the `Notification` model, add before `@@map("notifications")`:

```prisma
  // Early Warning Relations
  ew_tier_transitions EarlyWarningTierTransition[] @relation("ew_tier_transition_notification")
```

---

## Task 2: Generate Prisma Migration

**Files:**
- Create: `packages/prisma/migrations/YYYYMMDDHHMMSS_add_early_warning_tables/migration.sql` (auto-generated)

- [ ] **Step 2.1: Run prisma migrate dev**

```bash
cd /Users/ram/Library/Mobile\ Documents/com~apple~CloudDocs/Shared/GitHub\ Repos/SDB
npx prisma migrate dev --name add_early_warning_tables --schema packages/prisma/schema.prisma
```

**Expected:** Migration creates 4 tables (`student_risk_profiles`, `student_risk_signals`, `early_warning_tier_transitions`, `early_warning_configs`), 3 enums (`early_warning_risk_tier`, `early_warning_domain`, `early_warning_signal_severity`), and all indexes.

- [ ] **Step 2.2: Verify migration SQL**

Open the generated migration file and confirm it contains:
- `CREATE TYPE "early_warning_risk_tier"` with values `green`, `yellow`, `amber`, `red`
- `CREATE TYPE "early_warning_domain"` with values `attendance`, `grades`, `behaviour`, `wellbeing`, `engagement`
- `CREATE TYPE "early_warning_signal_severity"` with values `low`, `medium`, `high`, `critical`
- `CREATE TABLE "student_risk_profiles"` with UNIQUE constraint on `(tenant_id, student_id, academic_year_id)`
- `CREATE TABLE "student_risk_signals"` (no `updated_at` column)
- `CREATE TABLE "early_warning_tier_transitions"` (no `updated_at` column)
- `CREATE TABLE "early_warning_configs"` with UNIQUE on `tenant_id`

---

## Task 3: Create RLS Policies (post_migrate.sql)

**Files:**
- Create: `packages/prisma/migrations/YYYYMMDDHHMMSS_add_early_warning_tables/post_migrate.sql`

Use the exact migration folder name generated in Task 2.

- [ ] **Step 3.1: Write post_migrate.sql**

```sql
-- ============================================================
-- Early Warning System Post-Migrate: RLS Policies
-- ============================================================
-- This file is executed by scripts/post-migrate.ts after prisma migrate deploy.
-- All statements are idempotent (DROP IF EXISTS).

-- ─── 1. RLS Policies ─────────────────────────────────────────────────────────

-- student_risk_profiles
ALTER TABLE student_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_risk_profiles_tenant_isolation ON student_risk_profiles;
CREATE POLICY student_risk_profiles_tenant_isolation ON student_risk_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_risk_signals
ALTER TABLE student_risk_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_signals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_risk_signals_tenant_isolation ON student_risk_signals;
CREATE POLICY student_risk_signals_tenant_isolation ON student_risk_signals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- early_warning_tier_transitions
ALTER TABLE early_warning_tier_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_tier_transitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS early_warning_tier_transitions_tenant_isolation ON early_warning_tier_transitions;
CREATE POLICY early_warning_tier_transitions_tenant_isolation ON early_warning_tier_transitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- early_warning_configs
ALTER TABLE early_warning_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS early_warning_configs_tenant_isolation ON early_warning_configs;
CREATE POLICY early_warning_configs_tenant_isolation ON early_warning_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);


-- ─── 2. updated_at triggers ─────────────────────────────────────────────────
-- The set_updated_at() function already exists from P1 migration.

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_student_risk_profiles_updated_at ON student_risk_profiles;
  CREATE TRIGGER trg_student_risk_profiles_updated_at
    BEFORE UPDATE ON student_risk_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

DO $$ BEGIN
  DROP TRIGGER IF EXISTS trg_early_warning_configs_updated_at ON early_warning_configs;
  CREATE TRIGGER trg_early_warning_configs_updated_at
    BEFORE UPDATE ON early_warning_configs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
END $$;

-- NOTE: student_risk_signals and early_warning_tier_transitions are append-only.
-- No updated_at trigger needed.
```

- [ ] **Step 3.2: Add RLS policies to the master policies.sql file**

Append to `packages/prisma/rls/policies.sql`:

```sql
-- =============================================================
-- Early Warning System RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/YYYYMMDDHHMMSS_add_early_warning_tables/post_migrate.sql

-- student_risk_profiles (standard)
ALTER TABLE student_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_risk_profiles_tenant_isolation ON student_risk_profiles;
CREATE POLICY student_risk_profiles_tenant_isolation ON student_risk_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_risk_signals (standard)
ALTER TABLE student_risk_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_signals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_risk_signals_tenant_isolation ON student_risk_signals;
CREATE POLICY student_risk_signals_tenant_isolation ON student_risk_signals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- early_warning_tier_transitions (standard)
ALTER TABLE early_warning_tier_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_tier_transitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS early_warning_tier_transitions_tenant_isolation ON early_warning_tier_transitions;
CREATE POLICY early_warning_tier_transitions_tenant_isolation ON early_warning_tier_transitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- early_warning_configs (standard)
ALTER TABLE early_warning_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS early_warning_configs_tenant_isolation ON early_warning_configs;
CREATE POLICY early_warning_configs_tenant_isolation ON early_warning_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

---

## Task 4: Create Zod Schemas and Shared Types

**Files:**
- Create: `packages/shared/src/early-warning/constants.ts`
- Create: `packages/shared/src/early-warning/types.ts`
- Create: `packages/shared/src/early-warning/schemas.ts`
- Create: `packages/shared/src/early-warning/index.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 4.1: Create `packages/shared/src/early-warning/constants.ts`**

```typescript
// ─── Risk Tiers ──────────────────────────────────────────────────────────────

export const RISK_TIERS = ['green', 'yellow', 'amber', 'red'] as const;
export type RiskTier = (typeof RISK_TIERS)[number];

// ─── Signal Domains ──────────────────────────────────────────────────────────

export const SIGNAL_DOMAINS = ['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement'] as const;
export type SignalDomain = (typeof SIGNAL_DOMAINS)[number];

// ─── Signal Severity ─────────────────────────────────────────────────────────

export const SIGNAL_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SignalSeverity = (typeof SIGNAL_SEVERITIES)[number];

// ─── Default Weights (must sum to 100) ───────────────────────────────────────

export const DEFAULT_WEIGHTS: Record<SignalDomain, number> = {
  attendance: 25,
  grades: 25,
  behaviour: 20,
  wellbeing: 20,
  engagement: 10,
} as const;

// ─── Default Tier Thresholds ─────────────────────────────────────────────────

export const DEFAULT_THRESHOLDS: Record<RiskTier, number> = {
  green: 0,
  yellow: 30,
  amber: 50,
  red: 75,
} as const;

// ─── Default Hysteresis Buffer ───────────────────────────────────────────────

export const DEFAULT_HYSTERESIS_BUFFER = 10;

// ─── Default Digest Day (Monday = 1) ─────────────────────────────────────────

export const DEFAULT_DIGEST_DAY = 1;

// ─── Default High Severity Events ────────────────────────────────────────────

export const DEFAULT_HIGH_SEVERITY_EVENTS = [
  'suspension',
  'critical_incident',
  'third_consecutive_absence',
] as const;
export type HighSeverityEvent = (typeof DEFAULT_HIGH_SEVERITY_EVENTS)[number];

// ─── Cross-Domain Boost Thresholds ───────────────────────────────────────────

export const CROSS_DOMAIN_BOOST = {
  DOMAIN_THRESHOLD: 40,
  BOOST_3_DOMAINS: 5,
  BOOST_4_DOMAINS: 10,
  BOOST_5_DOMAINS: 15,
} as const;

// ─── Signal Type Constants ───────────────────────────────────────────────────

export const ATTENDANCE_SIGNAL_TYPES = [
  'attendance_rate_decline',
  'consecutive_absences',
  'recurring_day_pattern',
  'chronic_tardiness',
  'attendance_trajectory',
] as const;

export const GRADES_SIGNAL_TYPES = [
  'below_class_mean',
  'grade_trajectory_decline',
  'missing_assessments',
  'score_anomaly',
  'multi_subject_decline',
] as const;

export const BEHAVIOUR_SIGNAL_TYPES = [
  'incident_frequency',
  'escalating_severity',
  'active_sanction',
  'exclusion_history',
  'failed_intervention',
] as const;

export const WELLBEING_SIGNAL_TYPES = [
  'declining_wellbeing_score',
  'low_mood_pattern',
  'active_pastoral_concern',
  'active_pastoral_case',
  'external_referral',
  'critical_incident_affected',
] as const;

export const ENGAGEMENT_SIGNAL_TYPES = [
  'low_notification_read_rate',
  'no_portal_login',
  'no_parent_inquiry',
  'slow_acknowledgement',
  'disengagement_trajectory',
] as const;

export const ALL_SIGNAL_TYPES = [
  ...ATTENDANCE_SIGNAL_TYPES,
  ...GRADES_SIGNAL_TYPES,
  ...BEHAVIOUR_SIGNAL_TYPES,
  ...WELLBEING_SIGNAL_TYPES,
  ...ENGAGEMENT_SIGNAL_TYPES,
] as const;
export type SignalType = (typeof ALL_SIGNAL_TYPES)[number];

// ─── Default Routing Rules ───────────────────────────────────────────────────

export const DEFAULT_ROUTING_RULES = {
  yellow: { role: 'homeroom_teacher' },
  amber: { role: 'year_head' },
  red: { roles: ['principal', 'pastoral_lead'] },
} as const;

// ─── Job Names ───────────────────────────────────────────────────────────────

export const EARLY_WARNING_COMPUTE_DAILY_JOB = 'early-warning:compute-daily';
export const EARLY_WARNING_COMPUTE_STUDENT_JOB = 'early-warning:compute-student';
export const EARLY_WARNING_WEEKLY_DIGEST_JOB = 'early-warning:weekly-digest';
```

- [ ] **Step 4.2: Create `packages/shared/src/early-warning/types.ts`**

```typescript
import type { SignalDomain, SignalSeverity, RiskTier } from './constants';

// ─── Signal Collector Output ─────────────────────────────────────────────────

export interface DetectedSignal {
  signalType: string;
  severity: SignalSeverity;
  scoreContribution: number;
  details: Record<string, unknown>;
  sourceEntityType: string;
  sourceEntityId: string;
  summaryFragment: string;
}

export interface SignalResult {
  domain: SignalDomain;
  rawScore: number;
  signals: DetectedSignal[];
  summaryFragments: string[];
}

// ─── Scoring Engine Output ───────────────────────────────────────────────────

export interface DomainScores {
  attendance: number;
  grades: number;
  behaviour: number;
  wellbeing: number;
  engagement: number;
}

export interface RiskAssessment {
  compositeScore: number;
  riskTier: RiskTier;
  domainScores: DomainScores;
  crossDomainBoost: number;
  signals: DetectedSignal[];
  summaryText: string;
  trendData: number[];
  tierChanged: boolean;
  previousTier: RiskTier | null;
}

// ─── Config Types ────────────────────────────────────────────────────────────

export interface EarlyWarningWeights {
  attendance: number;
  grades: number;
  behaviour: number;
  wellbeing: number;
  engagement: number;
}

export interface EarlyWarningThresholds {
  green: number;
  yellow: number;
  amber: number;
  red: number;
}

export interface RoutingRuleSingle {
  role: string;
}

export interface RoutingRuleMultiple {
  roles: string[];
}

export interface EarlyWarningRoutingRules {
  yellow: RoutingRuleSingle;
  amber: RoutingRuleSingle;
  red: RoutingRuleMultiple;
}

// ─── Signal Summary Shape (stored in signal_summary_json) ────────────────────

export interface SignalSummaryJson {
  summaryText: string;
  topSignals: Array<{
    signalType: string;
    domain: SignalDomain;
    severity: SignalSeverity;
    scoreContribution: number;
    summaryFragment: string;
  }>;
}

// ─── Trend Shape (stored in trend_json) ──────────────────────────────────────

export interface TrendJson {
  dailyScores: number[];
}

// ─── Trigger Signals Shape (stored in trigger_signals_json) ──────────────────

export interface TriggerSignalsJson {
  signals: Array<{
    signalType: string;
    domain: SignalDomain;
    severity: SignalSeverity;
    scoreContribution: number;
  }>;
}

// ─── Worker Job Payloads ─────────────────────────────────────────────────────

export interface ComputeDailyJobPayload {
  tenant_id: string;
}

export interface ComputeStudentJobPayload {
  tenant_id: string;
  student_id: string;
  trigger_event: string;
}

export interface WeeklyDigestJobPayload {
  tenant_id: string;
}
```

- [ ] **Step 4.3: Create `packages/shared/src/early-warning/schemas.ts`**

```typescript
import { z } from 'zod';

// ─── Reusable Enum Schemas ───────────────────────────────────────────────────

export const riskTierSchema = z.enum(['green', 'yellow', 'amber', 'red']);
export const signalDomainSchema = z.enum(['attendance', 'grades', 'behaviour', 'wellbeing', 'engagement']);
export const signalSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// ─── Config JSONB Schemas ────────────────────────────────────────────────────

export const earlyWarningWeightsSchema = z.object({
  attendance: z.number().min(0).max(100),
  grades: z.number().min(0).max(100),
  behaviour: z.number().min(0).max(100),
  wellbeing: z.number().min(0).max(100),
  engagement: z.number().min(0).max(100),
}).refine(
  (w) => w.attendance + w.grades + w.behaviour + w.wellbeing + w.engagement === 100,
  { message: 'Weights must sum to 100', path: ['attendance'] },
).default({
  attendance: 25,
  grades: 25,
  behaviour: 20,
  wellbeing: 20,
  engagement: 10,
});
export type EarlyWarningWeightsDto = z.infer<typeof earlyWarningWeightsSchema>;

export const earlyWarningThresholdsSchema = z.object({
  green: z.number().min(0).max(100),
  yellow: z.number().min(0).max(100),
  amber: z.number().min(0).max(100),
  red: z.number().min(0).max(100),
}).refine(
  (t) => t.green < t.yellow && t.yellow < t.amber && t.amber < t.red,
  { message: 'Thresholds must be in ascending order: green < yellow < amber < red', path: ['green'] },
).default({
  green: 0,
  yellow: 30,
  amber: 50,
  red: 75,
});
export type EarlyWarningThresholdsDto = z.infer<typeof earlyWarningThresholdsSchema>;

export const routingRuleSingleSchema = z.object({
  role: z.string().min(1),
});

export const routingRuleMultipleSchema = z.object({
  roles: z.array(z.string().min(1)).min(1),
});

export const earlyWarningRoutingRulesSchema = z.object({
  yellow: routingRuleSingleSchema,
  amber: routingRuleSingleSchema,
  red: routingRuleMultipleSchema,
}).default({
  yellow: { role: 'homeroom_teacher' },
  amber: { role: 'year_head' },
  red: { roles: ['principal', 'pastoral_lead'] },
});
export type EarlyWarningRoutingRulesDto = z.infer<typeof earlyWarningRoutingRulesSchema>;

export const highSeverityEventsSchema = z.array(z.string().min(1)).default([
  'suspension',
  'critical_incident',
  'third_consecutive_absence',
]);

export const digestRecipientsSchema = z.array(z.string().uuid()).default([]);

// ─── Signal Summary JSONB Schema ─────────────────────────────────────────────

export const signalSummaryJsonSchema = z.object({
  summaryText: z.string(),
  topSignals: z.array(z.object({
    signalType: z.string(),
    domain: signalDomainSchema,
    severity: signalSeveritySchema,
    scoreContribution: z.number(),
    summaryFragment: z.string(),
  })),
});
export type SignalSummaryJsonDto = z.infer<typeof signalSummaryJsonSchema>;

// ─── Trend JSONB Schema ──────────────────────────────────────────────────────

export const trendJsonSchema = z.object({
  dailyScores: z.array(z.number().min(0).max(100)),
});
export type TrendJsonDto = z.infer<typeof trendJsonSchema>;

// ─── Trigger Signals JSONB Schema ────────────────────────────────────────────

export const triggerSignalsJsonSchema = z.object({
  signals: z.array(z.object({
    signalType: z.string(),
    domain: signalDomainSchema,
    severity: signalSeveritySchema,
    scoreContribution: z.number(),
  })),
});
export type TriggerSignalsJsonDto = z.infer<typeof triggerSignalsJsonSchema>;

// ─── Config Upsert Schema (PUT /v1/early-warnings/config) ───────────────────

export const updateEarlyWarningConfigSchema = z.object({
  is_enabled: z.boolean().optional(),
  weights_json: earlyWarningWeightsSchema.optional(),
  thresholds_json: earlyWarningThresholdsSchema.optional(),
  hysteresis_buffer: z.number().int().min(1).max(30).optional(),
  routing_rules_json: earlyWarningRoutingRulesSchema.optional(),
  digest_day: z.number().int().min(0).max(6).optional(),
  digest_recipients_json: digestRecipientsSchema.optional(),
  high_severity_events_json: highSeverityEventsSchema.optional(),
});
export type UpdateEarlyWarningConfigDto = z.infer<typeof updateEarlyWarningConfigSchema>;

// ─── Query Schemas ───────────────────────────────────────────────────────────

export const earlyWarningListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  risk_tier: riskTierSchema.optional(),
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  sort_by: z.enum(['composite_score', 'student_name']).default('composite_score'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});
export type EarlyWarningListQueryDto = z.infer<typeof earlyWarningListQuerySchema>;

export const cohortQuerySchema = z.object({
  group_by: z.enum(['year_group', 'class', 'subject', 'domain']),
  period: z.string().optional(),
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
});
export type CohortQueryDto = z.infer<typeof cohortQuerySchema>;

export const assignStudentSchema = z.object({
  assigned_to_user_id: z.string().uuid(),
});
export type AssignStudentDto = z.infer<typeof assignStudentSchema>;
```

- [ ] **Step 4.4: Create `packages/shared/src/early-warning/index.ts`**

```typescript
export * from './constants';
export * from './types';
export * from './schemas';
```

- [ ] **Step 4.5: Register in `packages/shared/src/index.ts`**

Add the following line after the `// Security Incidents (Phase J)` block (after `export * from './security';`):

```typescript
// Early Warning System
export * from './early-warning';
```

---

## Task 5: Add Queue Constant

**Files:**
- Modify: `apps/worker/src/base/queue.constants.ts`

- [ ] **Step 5.1: Add EARLY_WARNING to QUEUE_NAMES**

In `apps/worker/src/base/queue.constants.ts`, add `EARLY_WARNING: 'early-warning',` to the `QUEUE_NAMES` object, in alphabetical position (after `COMPLIANCE` and before `FINANCE`):

```typescript
export const QUEUE_NAMES = {
  ADMISSIONS: 'admissions',
  ATTENDANCE: 'attendance',
  BEHAVIOUR: 'behaviour',
  COMPLIANCE: 'compliance',
  EARLY_WARNING: 'early-warning',
  FINANCE: 'finance',
  GRADEBOOK: 'gradebook',
  IMPORTS: 'imports',
  NOTIFICATIONS: 'notifications',
  PASTORAL: 'pastoral',
  PAYROLL: 'payroll',
  REPORTS: 'reports',
  SCHEDULING: 'scheduling',
  SEARCH_SYNC: 'search-sync',
  SECURITY: 'security',
  WELLBEING: 'wellbeing',
} as const;
```

---

## Task 6: Add Module Key

**Files:**
- Modify: `packages/shared/src/constants/modules.ts`

- [ ] **Step 6.1: Add `early_warning` to MODULE_KEYS**

Add `'early_warning'` to the `MODULE_KEYS` array in alphabetical position (after `'compliance'` and before `'finance'`):

```typescript
export const MODULE_KEYS = [
  'admissions',
  'attendance',
  'auto_scheduling',
  'behaviour',
  'communications',
  'compliance',
  'early_warning',
  'finance',
  'gradebook',
  'parent_inquiries',
  'payroll',
  'staff_wellbeing',
  'website',
  'analytics',
  'ai_functions',
] as const;
```

---

## Task 7: Add Permission Seeds

**Files:**
- Modify: `packages/prisma/seed/permissions.ts`

- [ ] **Step 7.1: Add early warning permissions**

In `packages/prisma/seed/permissions.ts`, add the following 4 permissions after the Staff Wellbeing block (after `{ permission_key: 'wellbeing.manage_resources', ... }`), and before the closing `];`:

```typescript
  // ─── Early Warning System ─────────────────────────────────────────────────
  { permission_key: 'early_warning.view', description: 'View early warning risk profiles', permission_tier: 'staff' },
  { permission_key: 'early_warning.manage', description: 'Manage early warning configuration', permission_tier: 'admin' },
  { permission_key: 'early_warning.acknowledge', description: 'Acknowledge reviewed risk profiles', permission_tier: 'staff' },
  { permission_key: 'early_warning.assign', description: 'Assign staff to risk profiles', permission_tier: 'admin' },
```

---

## Task 8: Create Empty NestJS Module Scaffold

**Files:**
- Create: `apps/api/src/modules/early-warning/early-warning.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 8.1: Create the module file**

Create `apps/api/src/modules/early-warning/early-warning.module.ts`:

```typescript
import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
  exports: [],
})
export class EarlyWarningModule {}
```

- [ ] **Step 8.2: Register in app.module.ts**

In `apps/api/src/app.module.ts`:

1. Add the import statement in alphabetical position among the module imports (after `DashboardModule` import, before `FinanceModule` import):

```typescript
import { EarlyWarningModule } from './modules/early-warning/early-warning.module';
```

2. Add `EarlyWarningModule` to the `imports` array in the `@Module` decorator, in alphabetical position (after `DashboardModule,` and before `FinanceModule,`):

```typescript
    DashboardModule,
    EarlyWarningModule,
    FinanceModule,
```

---

## Task 9: Register Queue in Worker Module

**Files:**
- Modify: `apps/worker/src/worker.module.ts`

- [ ] **Step 9.1: Add EARLY_WARNING queue registration**

In `apps/worker/src/worker.module.ts`, add a new queue registration entry inside `BullModule.registerQueue(...)` in alphabetical position (after the `COMPLIANCE` entry and before the `FINANCE` entry):

```typescript
      {
        name: QUEUE_NAMES.EARLY_WARNING,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
```

The full registerQueue block should read:

```typescript
    BullModule.registerQueue(
      {
        name: QUEUE_NAMES.PAYROLL,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.NOTIFICATIONS,
        defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 200, removeOnFail: 1000 },
      },
      {
        name: QUEUE_NAMES.SEARCH_SYNC,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.REPORTS,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 50, removeOnFail: 200 },
      },
      {
        name: QUEUE_NAMES.ATTENDANCE,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.SCHEDULING,
        defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 50, removeOnFail: 200 },
      },
      {
        name: QUEUE_NAMES.GRADEBOOK,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.FINANCE,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.IMPORTS,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 50, removeOnFail: 200 },
      },
      {
        name: QUEUE_NAMES.ADMISSIONS,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 50, removeOnFail: 200 },
      },
      {
        name: QUEUE_NAMES.BEHAVIOUR,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.PASTORAL,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.SECURITY,
        defaultJobOptions: { attempts: 2, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 10, removeOnFail: 50 },
      },
      {
        name: QUEUE_NAMES.WELLBEING,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
      {
        name: QUEUE_NAMES.EARLY_WARNING,
        defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 100, removeOnFail: 500 },
      },
    ),
```

---

## Task 10: Verify

- [ ] **Step 10.1: Type-check the monorepo**

```bash
cd /Users/ram/Library/Mobile\ Documents/com~apple~CloudDocs/Shared/GitHub\ Repos/SDB
npx turbo type-check
```

**Expected:** All packages pass type-checking. Zero errors.

- [ ] **Step 10.2: Lint the monorepo**

```bash
npx turbo lint
```

**Expected:** Zero lint errors.

- [ ] **Step 10.3: Run existing tests**

```bash
npx turbo test
```

**Expected:** All existing tests pass. No regressions.

- [ ] **Step 10.4: Verify Prisma client generation**

```bash
npx prisma generate --schema packages/prisma/schema.prisma
```

**Expected:** Prisma client generated successfully with the 3 new enums and 4 new model types.

---

## Completion Checklist

| Item | Location | Status |
|------|----------|--------|
| 3 Prisma enums | `packages/prisma/schema.prisma` | |
| 4 Prisma models | `packages/prisma/schema.prisma` | |
| Tenant/User/Student/AcademicYear/Notification relations | `packages/prisma/schema.prisma` | |
| Migration generated and applied | `packages/prisma/migrations/` | |
| RLS policies (4 tables) | `post_migrate.sql` + `policies.sql` | |
| updated_at triggers (2 mutable tables) | `post_migrate.sql` | |
| Zod schemas with defaults | `packages/shared/src/early-warning/schemas.ts` | |
| Shared types (SignalResult, RiskAssessment, etc.) | `packages/shared/src/early-warning/types.ts` | |
| Constants (tiers, domains, severities, signal types, job names) | `packages/shared/src/early-warning/constants.ts` | |
| Barrel export | `packages/shared/src/early-warning/index.ts` | |
| Registered in shared index | `packages/shared/src/index.ts` | |
| Queue constant EARLY_WARNING | `apps/worker/src/base/queue.constants.ts` | |
| Module key `early_warning` | `packages/shared/src/constants/modules.ts` | |
| 4 permission seeds | `packages/prisma/seed/permissions.ts` | |
| Empty NestJS module | `apps/api/src/modules/early-warning/early-warning.module.ts` | |
| Registered in app.module.ts | `apps/api/src/app.module.ts` | |
| Worker queue registration | `apps/worker/src/worker.module.ts` | |
| Type-check passes | `turbo type-check` | |
| Lint passes | `turbo lint` | |
| Existing tests pass | `turbo test` | |
