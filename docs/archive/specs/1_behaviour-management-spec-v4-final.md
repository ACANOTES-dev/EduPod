# Behaviour Management Module — Full Specification v4.0 Final

> **Module**: `modules/behaviour/` + `modules/safeguarding/`
> **Priority**: Non-negotiable — Phase 2 launch-gate feature
> **Spec version**: 4.0 Final — 26 March 2026
> **Review history**: v1.0 → 14 findings → v2.0 → 15 findings → v3.0 → 13 findings → v4.0
> **Estimated scope**: ~155 endpoints, ~32 frontend pages, 13 worker jobs, 8 settings pages
> **Estimated implementation**: 14–15 weeks (see §17)

---

## Version History

### v1.0 → v2.0 (14 findings)

| #   | Finding                           | Resolution                                                   |
| --- | --------------------------------- | ------------------------------------------------------------ |
| 1   | Policy engine too shallow         | Full rule-based policy matrix                                |
| 2   | No evidence layer                 | `behaviour_attachments` with metadata, checksums, visibility |
| 3   | Dual group incident model         | Single participant model                                     |
| 4   | Permissions too broad             | Scope-based access + field-level visibility                  |
| 5   | Quick-log under-specified         | Local cache, offline queue, deterministic-first              |
| 6   | No task/action model              | `behaviour_tasks` unified tracker                            |
| 7   | State machines too light          | Expanded incident and sanction states                        |
| 8   | Analytics not exposure-adjusted   | Normalised by contact hours, 5-dimension pulse               |
| 9   | AI governance missing             | Confidence, fallback, audit, tenant opt-in                   |
| 10  | Safeguarding not inspection-grade | No delete, SLA, DLP fallback, reporter ack                   |
| 11  | Parent comms not productised      | Delivery logs, ack tracking, digest, guardian visibility     |
| 12  | ETB benchmarking not comparable   | Canonical taxonomy with cohort thresholds                    |
| 13  | Missing support tables            | All entities explicit                                        |
| 14  | Scope estimate off                | Revised with phase breakdown                                 |

### v2.0 → v3.0 (15 findings)

| #   | Finding                         | Resolution                                             |
| --- | ------------------------------- | ------------------------------------------------------ |
| 15  | Policy needs versioning         | Rule versions, evaluation ledger, action execution log |
| 16  | Historical truth under-modelled | Context snapshots frozen at creation                   |
| 17  | Offline needs idempotency       | Client idempotency key, compensating actions           |
| 18  | Participant boundary unclear    | Constraint: at least one student participant           |
| 19  | Parent-safe content not solved  | `parent_description` with generation rules             |
| 20  | Appeals not first-class         | `behaviour_appeals` with full lifecycle                |
| 21  | Alerts need ownership           | `behaviour_alert_recipients` per-user state            |
| 22  | Attachment security             | AV scan, signed URLs, object lock, legal hold          |
| 23  | Safeguarding status leak        | Permission-projected status rendering                  |
| 24  | Break-glass governance          | Post-access review, accessed-records log               |
| 25  | Awards need repeatability       | `repeat_mode`, tier groups, dedup                      |
| 26  | Templates need real table       | `behaviour_description_templates`                      |
| 27  | Control-plane missing           | Admin ops controller                                   |
| 28  | Timezone unresolved             | Tenant TZ, school days, holiday-aware                  |
| 29  | Visibility-class discipline     | 5-class data classification model                      |

### v3.0 → v4.0 (13 findings)

| #   | Finding                                                | Resolution                                                                                   | Section     |
| --- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ----------- |
| 30  | Rule engine first-match-wins too rigid                 | Staged rule composition with per-stage match strategy                                        | §2.3, §3.3  |
| 31  | Structured histories only for incidents                | Unified `behaviour_entity_history` for all high-stakes entities                              | §2.1        |
| 32  | Non-safeguarding retention too thin                    | Full record lifecycle policy with per-entity retention rules                                 | §7          |
| 33  | No amendment workflow after notifications sent         | `behaviour_amendment_notices` with correction/supersession chain                             | §2.1, §3.12 |
| 34  | High-stakes exclusions need bespoke workflow           | `behaviour_exclusion_cases` with statutory timeline, board pack, formal documents            | §2.1, §3.4  |
| 35  | Scale/partition strategy unspecified                   | Partitioning, archival, index maintenance, contention design                                 | §8          |
| 36  | Admin ops need stronger guardrails                     | Dry-run/preview, async execution, impact summary, dual approval for destructive ops          | §15         |
| 37  | Parent-safe language needs workflow rules              | Required/optional matrix, send-gate, locale-aware `parent_description_ar`, locked-after-send | §3.7        |
| 38  | Data classification needs automated release-gate tests | Mandatory test suites for visibility, scope, projection, rendering                           | §14         |
| 39  | Appeal outcome packaging incomplete                    | Document generation, outcome notices, evidence bundles                                       | §3.11       |
| 40  | Guardian restrictions need effective dates             | `behaviour_guardian_restrictions` with legal basis, dates, review                            | §2.1        |
| 41  | Policy needs historical replay                         | Replay endpoint: evaluate new rules against historical incidents                             | §3.3        |
| 42  | Official document generation too light                 | `behaviour_document_templates` + generation engine for notices, letters, packs               | §2.1, §3.13 |

---

## 1. Vision

Six design principles (expanded from five):

1. **Speed above all**: 5-second quick-log from phone.
2. **Positive-first culture**: Architecturally biased toward recognition.
3. **Cross-module intelligence**: Behaviour linked to attendance, scheduling, grades, communications. Structurally impossible for siloed competitors.
4. **Safeguarding is sacred**: Separate permission domain, every access audit-logged, inspection-grade chronology.
5. **ETB-ready from day one**: Anonymous cross-school benchmarking with standardised taxonomy.
6. **Operational maturity**: The system is not just feature-complete but operationally self-sustaining — with lifecycle governance, scale strategy, amendment workflows, and automated trust verification.

v1.0: wow factor. v2.0: institutional trust. v3.0: forensic defensibility. v4.0: **operational completeness** — the system sustains itself in production across years, across scale, through disputes, corrections, and policy evolution.

---

## 2. Data Model

### 2.1 Core Tables

All tables from v3.0 are retained with the following modifications and additions. Only modified/new tables are shown below; unmodified tables from v3.0 remain as specified.

#### Modified: `behaviour_incidents`

All v3.0 columns retained. Add:

| Column                         | Type                                                      | Notes                                                                    |
| ------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `parent_description_ar`        | TEXT NULL                                                 | Arabic parent-safe description. Visibility class: PARENT                 |
| `parent_description_locked`    | BOOLEAN DEFAULT false                                     | Locked after parent notification sent — edits require amendment workflow |
| `parent_description_set_by_id` | UUID FK NULL                                              | Staff who wrote/approved the parent description                          |
| `parent_description_set_at`    | TIMESTAMPTZ NULL                                          |                                                                          |
| `retention_status`             | ENUM('active', 'archived', 'anonymised') DEFAULT 'active' | Record lifecycle status                                                  |
| `archived_at`                  | TIMESTAMPTZ NULL                                          |                                                                          |

**Parent description send-gate**: For negative incidents with severity ≥ `parent_notification_send_gate_severity` (new setting, default 3), parent notification cannot dispatch until one of:

- `parent_description` is non-null (staff-written safe description), OR
- A `behaviour_description_template` was used at creation (template is inherently safe), OR
- `parent_description` is explicitly set to empty string (staff confirmed: use category name only)

This prevents accidental dispatch of thin or internal-facing content to parents.

---

#### Modified: `behaviour_policy_rules` — Staged Composition

Replace `priority` with stage-based execution:

| Column                  | Type                                                                            | Notes                                                                       |
| ----------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`                    | UUID PK                                                                         |                                                                             |
| `tenant_id`             | UUID FK NOT NULL                                                                | RLS                                                                         |
| `name`                  | VARCHAR(200) NOT NULL                                                           |                                                                             |
| `description`           | TEXT NULL                                                                       |                                                                             |
| `is_active`             | BOOLEAN DEFAULT true                                                            |                                                                             |
| `stage`                 | ENUM('consequence', 'approval', 'notification', 'support', 'alerting') NOT NULL | Execution stage                                                             |
| `priority`              | INT NOT NULL DEFAULT 100                                                        | Priority within stage                                                       |
| `match_strategy`        | ENUM('first_match', 'all_matching') NOT NULL DEFAULT 'first_match'              | Per-rule override within stage                                              |
| `stop_processing_stage` | BOOLEAN DEFAULT false                                                           | If true and this rule matches, no further rules in this stage are evaluated |
| `conditions`            | JSONB NOT NULL                                                                  |                                                                             |
| `current_version`       | INT NOT NULL DEFAULT 1                                                          |                                                                             |
| `last_published_at`     | TIMESTAMPTZ NULL                                                                |                                                                             |
| `created_at`            | TIMESTAMPTZ                                                                     |                                                                             |
| `updated_at`            | TIMESTAMPTZ                                                                     |                                                                             |

**Stage execution order** (always in this order):

| Stage          | Purpose                                            | Default Match                                         |
| -------------- | -------------------------------------------------- | ----------------------------------------------------- |
| `consequence`  | Escalation, sanction creation                      | `first_match` (one consequence per incident-student)  |
| `approval`     | Approval gating, blocking                          | `first_match` (one approval requirement)              |
| `notification` | Parent notification, role notification             | `all_matching` (multiple notification rules can fire) |
| `support`      | Intervention creation, SEND tasks, pastoral alerts | `all_matching` (multiple support actions can fire)    |
| `alerting`     | Flag for review, analytics flagging                | `all_matching` (multiple flags can fire)              |

**Evaluation flow** (replaces v3.0 single-pass):

```
for each stage in [consequence, approval, notification, support, alerting]:
  load rules for this stage, sorted by priority ASC
  matched_rules = []
  for each rule in stage:
    if rule.conditions match incident + student:
      matched_rules.push(rule)
      if rule.match_strategy == 'first_match' or rule.stop_processing_stage:
        break
  execute actions for all matched_rules in this stage
```

This means a single incident can trigger: one consequence rule (escalation to written warning), one approval rule (requires deputy sign-off), two notification rules (notify year head AND notify parent), one support rule (create SENCO task), and one alerting rule (flag for review). Previously this required one giant composite rule or was impossible.

**Seed rules updated**: Stage-tagged. "3 verbal warnings → written warning" = consequence stage. "Suspension requires approval" = approval stage. "Expulsion requires approval" = approval stage.

---

#### New: `behaviour_entity_history`

Unified structured history for all high-stakes entities. Replaces the incident-only `behaviour_incident_history` from v3.0.

| Column            | Type                                                                                                                                                           | Notes                                                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`              | UUID PK                                                                                                                                                        |                                                                                                                                            |
| `tenant_id`       | UUID FK NOT NULL                                                                                                                                               | RLS                                                                                                                                        |
| `entity_type`     | ENUM('incident', 'sanction', 'intervention', 'appeal', 'task', 'exclusion_case', 'publication_approval', 'break_glass_grant', 'guardian_restriction') NOT NULL |                                                                                                                                            |
| `entity_id`       | UUID NOT NULL                                                                                                                                                  | FK to origin                                                                                                                               |
| `changed_by_id`   | UUID FK NOT NULL                                                                                                                                               |                                                                                                                                            |
| `change_type`     | VARCHAR(50) NOT NULL                                                                                                                                           | Domain-specific: 'created', 'status_changed', 'updated', 'participant_added', 'sanction_created', 'appeal_outcome', 'amendment_sent', etc. |
| `previous_values` | JSONB NULL                                                                                                                                                     |                                                                                                                                            |
| `new_values`      | JSONB NOT NULL                                                                                                                                                 |                                                                                                                                            |
| `reason`          | TEXT NULL                                                                                                                                                      | Required for status changes, withdrawals, amendments                                                                                       |
| `created_at`      | TIMESTAMPTZ                                                                                                                                                    | Append-only                                                                                                                                |

**Indexes**:

- `(tenant_id, entity_type, entity_id, created_at)` — entity timeline query
- `(tenant_id, entity_type, created_at)` — global activity feed

Replaces `behaviour_incident_history` (which was incident-only). All entities now get full structured lifecycle — sanctions, appeals, tasks, interventions, exclusion cases, publication approvals, break-glass grants, guardian restrictions.

---

#### New: `behaviour_amendment_notices`

Tracks corrections to records after parent notification or export has already been sent.

| Column                              | Type                                                      | Notes                                                |
| ----------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| `id`                                | UUID PK                                                   |                                                      |
| `tenant_id`                         | UUID FK NOT NULL                                          | RLS                                                  |
| `entity_type`                       | ENUM('incident', 'sanction', 'appeal') NOT NULL           | What was amended                                     |
| `entity_id`                         | UUID NOT NULL                                             |                                                      |
| `amendment_type`                    | ENUM('correction', 'supersession', 'retraction') NOT NULL |                                                      |
| `original_notification_id`          | UUID FK NULL                                              | → `notifications` — the original outbound notice     |
| `original_export_id`                | UUID FK NULL                                              | If an export was generated before amendment          |
| `what_changed`                      | JSONB NOT NULL                                            | Structured diff: `{ field, old_value, new_value }[]` |
| `change_reason`                     | TEXT NOT NULL                                             |                                                      |
| `changed_by_id`                     | UUID FK NOT NULL                                          |                                                      |
| `authorised_by_id`                  | UUID FK NULL                                              | If amendment requires authorisation                  |
| `correction_notification_sent`      | BOOLEAN DEFAULT false                                     |                                                      |
| `correction_notification_id`        | UUID FK NULL                                              | → `notifications`                                    |
| `correction_notification_sent_at`   | TIMESTAMPTZ NULL                                          |                                                      |
| `requires_parent_reacknowledgement` | BOOLEAN DEFAULT false                                     |                                                      |
| `parent_reacknowledged_at`          | TIMESTAMPTZ NULL                                          |                                                      |
| `created_at`                        | TIMESTAMPTZ                                               |                                                      |

**Amendment workflow**: When a record is modified after parent notification has been sent:

1. `behaviour_entity_history` records the change
2. If the change affects parent-visible data (category, parent_description, sanction dates, appeal outcome):
   - `behaviour_amendment_notices` created
   - If `parent_description_locked = true`: unlock requires `behaviour.manage` + reason
   - Correction notification queued via comms module
   - If severity ≥ `parent_acknowledgement_required_severity`: `requires_parent_reacknowledgement = true`
3. If a PDF export was generated before the amendment: export marked as superseded, new export auto-generated with "Amended" watermark

---

#### New: `behaviour_exclusion_cases`

Bespoke workflow for suspensions and expulsions that exceed the standard sanction lifecycle.

| Column                        | Type                                                                                                                                 | Notes                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `id`                          | UUID PK                                                                                                                              |                                                                                              |
| `tenant_id`                   | UUID FK NOT NULL                                                                                                                     | RLS                                                                                          |
| `case_number`                 | VARCHAR(20) NOT NULL                                                                                                                 | Sequence: `EX-000001`                                                                        |
| `sanction_id`                 | UUID FK NOT NULL                                                                                                                     | → `behaviour_sanctions` — the triggering sanction                                            |
| `incident_id`                 | UUID FK NOT NULL                                                                                                                     |                                                                                              |
| `student_id`                  | UUID FK NOT NULL                                                                                                                     |                                                                                              |
| `type`                        | ENUM('suspension_extended', 'expulsion', 'managed_move', 'permanent_exclusion') NOT NULL                                             |                                                                                              |
| `status`                      | ENUM('initiated', 'notice_issued', 'hearing_scheduled', 'hearing_held', 'decision_made', 'appeal_window', 'finalised', 'overturned') |                                                                                              |
| `formal_notice_issued_at`     | TIMESTAMPTZ NULL                                                                                                                     |                                                                                              |
| `formal_notice_document_id`   | UUID FK NULL                                                                                                                         | → `behaviour_documents`                                                                      |
| `hearing_date`                | TIMESTAMPTZ NULL                                                                                                                     |                                                                                              |
| `hearing_attendees`           | JSONB NULL                                                                                                                           | `[{ name, role, relationship }]`                                                             |
| `hearing_minutes_document_id` | UUID FK NULL                                                                                                                         | → `behaviour_documents`                                                                      |
| `student_representation`      | TEXT NULL                                                                                                                            | Who represented the student                                                                  |
| `board_pack_generated_at`     | TIMESTAMPTZ NULL                                                                                                                     |                                                                                              |
| `board_pack_document_id`      | UUID FK NULL                                                                                                                         | → `behaviour_documents`                                                                      |
| `decision`                    | ENUM('exclusion_confirmed', 'exclusion_modified', 'exclusion_reversed', 'alternative_consequence') NULL                              |                                                                                              |
| `decision_date`               | TIMESTAMPTZ NULL                                                                                                                     |                                                                                              |
| `decision_letter_document_id` | UUID FK NULL                                                                                                                         | → `behaviour_documents`                                                                      |
| `decision_reasoning`          | TEXT NULL                                                                                                                            |                                                                                              |
| `decided_by_id`               | UUID FK NULL                                                                                                                         |                                                                                              |
| `conditions_for_return`       | TEXT NULL                                                                                                                            |                                                                                              |
| `conditions_for_transfer`     | TEXT NULL                                                                                                                            |                                                                                              |
| `appeal_deadline`             | DATE NULL                                                                                                                            | Statutory: usually 10–15 school days from decision                                           |
| `appeal_id`                   | UUID FK NULL                                                                                                                         | → `behaviour_appeals`                                                                        |
| `statutory_timeline`          | JSONB NULL                                                                                                                           | `[{ step, required_by, completed_at, status }]` — tracks compliance with statutory timelines |
| `linked_evidence_ids`         | UUID[] DEFAULT '{}'                                                                                                                  | → `behaviour_attachments`                                                                    |
| `created_at`                  | TIMESTAMPTZ                                                                                                                          |                                                                                              |
| `updated_at`                  | TIMESTAMPTZ                                                                                                                          |                                                                                              |

**Statutory timeline tracking**: The `statutory_timeline` JSONB auto-populates based on case type with configurable deadlines. For Irish schools, this maps to Education Act provisions. Staff see a timeline checklist with green/amber/red status per step.

---

#### New: `behaviour_documents`

Generated formal documents — detention notices, suspension letters, appeal decisions, board packs.

| Column              | Type                                                                                                                                                                                                                                                      | Notes                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `id`                | UUID PK                                                                                                                                                                                                                                                   |                                           |
| `tenant_id`         | UUID FK NOT NULL                                                                                                                                                                                                                                          | RLS                                       |
| `document_type`     | ENUM('detention_notice', 'suspension_letter', 'return_meeting_letter', 'behaviour_contract', 'intervention_summary', 'appeal_hearing_invite', 'appeal_decision_letter', 'exclusion_notice', 'exclusion_decision_letter', 'board_pack', 'custom') NOT NULL |                                           |
| `template_id`       | UUID FK NULL                                                                                                                                                                                                                                              | → `behaviour_document_templates`          |
| `entity_type`       | ENUM('incident', 'sanction', 'intervention', 'appeal', 'exclusion_case') NOT NULL                                                                                                                                                                         | Source entity                             |
| `entity_id`         | UUID NOT NULL                                                                                                                                                                                                                                             |                                           |
| `student_id`        | UUID FK NOT NULL                                                                                                                                                                                                                                          |                                           |
| `generated_by_id`   | UUID FK NOT NULL                                                                                                                                                                                                                                          |                                           |
| `generated_at`      | TIMESTAMPTZ NOT NULL                                                                                                                                                                                                                                      |                                           |
| `file_key`          | VARCHAR(500) NOT NULL                                                                                                                                                                                                                                     | S3 key (PDF)                              |
| `file_size_bytes`   | BIGINT NOT NULL                                                                                                                                                                                                                                           |                                           |
| `sha256_hash`       | VARCHAR(64) NOT NULL                                                                                                                                                                                                                                      |                                           |
| `locale`            | VARCHAR(5) NOT NULL DEFAULT 'en'                                                                                                                                                                                                                          |                                           |
| `data_snapshot`     | JSONB NOT NULL                                                                                                                                                                                                                                            | All merge-field values at generation time |
| `status`            | ENUM('draft', 'finalised', 'sent', 'superseded') DEFAULT 'draft'                                                                                                                                                                                          |                                           |
| `sent_at`           | TIMESTAMPTZ NULL                                                                                                                                                                                                                                          |                                           |
| `sent_via`          | ENUM('email', 'whatsapp', 'in_app', 'print') NULL                                                                                                                                                                                                         |                                           |
| `superseded_by_id`  | UUID FK NULL                                                                                                                                                                                                                                              | → `behaviour_documents`                   |
| `superseded_reason` | TEXT NULL                                                                                                                                                                                                                                                 |                                           |
| `created_at`        | TIMESTAMPTZ                                                                                                                                                                                                                                               |                                           |

---

#### New: `behaviour_document_templates`

Configurable templates per tenant for formal documents.

| Column          | Type                                               | Notes                                                                      |
| --------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| `id`            | UUID PK                                            |                                                                            |
| `tenant_id`     | UUID FK NOT NULL                                   | RLS                                                                        |
| `document_type` | ENUM — same as `behaviour_documents.document_type` |                                                                            |
| `name`          | VARCHAR(200) NOT NULL                              |                                                                            |
| `locale`        | VARCHAR(5) NOT NULL DEFAULT 'en'                   |                                                                            |
| `template_body` | TEXT NOT NULL                                      | HTML template with `{{merge_field}}` placeholders                          |
| `merge_fields`  | JSONB NOT NULL                                     | `[{ field_name, source, description }]` — documents available merge fields |
| `is_active`     | BOOLEAN DEFAULT true                               |                                                                            |
| `is_system`     | BOOLEAN DEFAULT false                              |                                                                            |
| `created_at`    | TIMESTAMPTZ                                        |                                                                            |
| `updated_at`    | TIMESTAMPTZ                                        |                                                                            |

**Merge fields** include: `{{student_name}}`, `{{student_year_group}}`, `{{incident_date}}`, `{{incident_category}}`, `{{incident_description}}`, `{{parent_description}}`, `{{sanction_type}}`, `{{sanction_date}}`, `{{school_name}}`, `{{school_logo}}`, `{{principal_name}}`, `{{today_date}}`, etc.

**Seed templates**: System templates (en + ar) for each document type. Schools can customise or create their own.

---

#### New: `behaviour_guardian_restrictions`

Explicit, auditable guardian visibility restrictions with effective dates and legal basis.

| Column             | Type                                                                                                            | Notes                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `id`               | UUID PK                                                                                                         |                                      |
| `tenant_id`        | UUID FK NOT NULL                                                                                                | RLS                                  |
| `student_id`       | UUID FK NOT NULL                                                                                                |                                      |
| `parent_id`        | UUID FK NOT NULL                                                                                                |                                      |
| `restriction_type` | ENUM('no_behaviour_visibility', 'no_behaviour_notifications', 'no_portal_access', 'no_communications') NOT NULL |                                      |
| `legal_basis`      | VARCHAR(200) NULL                                                                                               | e.g. "Court order ref. 2025/FC/1234" |
| `reason`           | TEXT NOT NULL                                                                                                   |                                      |
| `set_by_id`        | UUID FK NOT NULL                                                                                                |                                      |
| `approved_by_id`   | UUID FK NULL                                                                                                    |                                      |
| `effective_from`   | DATE NOT NULL                                                                                                   |                                      |
| `effective_until`  | DATE NULL                                                                                                       | NULL = indefinite                    |
| `review_date`      | DATE NULL                                                                                                       | When to review the restriction       |
| `status`           | ENUM('active', 'expired', 'revoked', 'superseded') DEFAULT 'active'                                             |                                      |
| `revoked_at`       | TIMESTAMPTZ NULL                                                                                                |                                      |
| `revoked_by_id`    | UUID FK NULL                                                                                                    |                                      |
| `revoke_reason`    | TEXT NULL                                                                                                       |                                      |
| `created_at`       | TIMESTAMPTZ                                                                                                     |                                      |
| `updated_at`       | TIMESTAMPTZ                                                                                                     |                                      |

Replaces the simple `behaviour_visibility` flag from v3.0. Every restriction change recorded in `behaviour_entity_history`. Worker checks daily for restrictions nearing review_date and creates reminder tasks.

**Query pattern**: Before rendering parent portal or sending notification, check:

```sql
SELECT 1 FROM behaviour_guardian_restrictions
WHERE tenant_id = $1 AND student_id = $2 AND parent_id = $3
  AND restriction_type IN ('no_behaviour_visibility', 'no_behaviour_notifications')
  AND status = 'active'
  AND effective_from <= CURRENT_DATE
  AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
```

---

### 2.2 Evidence & Attachments

Unchanged from v3.0. `behaviour_attachments` with full security hardening (AV scan, signed URLs, SSE-S3, object lock, legal hold, version tracking).

---

### 2.3 Policy Rules Engine

#### `behaviour_policy_rules` — Now with stages

See modified table in §2.1. Key change: `stage` field replaces single-priority execution with 5-stage pipeline.

#### `behaviour_policy_rule_actions` — Unchanged from v3.0

#### `behaviour_policy_rule_versions` — Unchanged from v3.0

Add `stage` and `match_strategy` to the version snapshot JSONB.

#### `behaviour_policy_evaluations` — Modified

Add:

| Column  | Type                                                                            | Notes                                  |
| ------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| `stage` | ENUM('consequence', 'approval', 'notification', 'support', 'alerting') NOT NULL | Which stage this evaluation belongs to |

One evaluation record per stage per student per incident (up to 5 per student). The evaluation ledger now shows the complete multi-stage decision path.

#### `behaviour_policy_action_executions` — Unchanged from v3.0

---

### 2.4 Safeguarding Tables

Unchanged from v3.0: `safeguarding_concerns`, `safeguarding_actions`, `safeguarding_concern_incidents`, `safeguarding_break_glass_grants`.

---

### 2.5 Configuration (`tenant_settings.behaviour` JSONB)

All v3.0 keys retained. Add:

```typescript
  // Parent-safe content (new in v4.0)
  parent_notification_send_gate_severity: number = 3,    // require parent_description for negative >= this
  parent_description_auto_lock_on_send: boolean = true,   // lock after notification dispatched
  parent_description_amendment_requires_auth: boolean = true, // amendment needs behaviour.manage

  // Document generation (new in v4.0)
  document_generation_enabled: boolean = true,
  document_auto_generate_detention_notice: boolean = false,
  document_auto_generate_suspension_letter: boolean = true,
  document_auto_generate_exclusion_notice: boolean = true,

  // Retention (new in v4.0)
  incident_retention_years: number = 7,                   // after student leaves
  sanction_retention_years: number = 7,
  intervention_retention_years: number = 7,
  appeal_retention_years: number = 10,
  exclusion_case_retention_years: number = 25,            // matches safeguarding
  task_retention_years: number = 3,
  policy_evaluation_retention_years: number = 7,
  alert_retention_years: number = 3,
  parent_ack_retention_years: number = 7,
  // safeguarding_retention_years already exists (25)

  // Admin ops (new in v4.0)
  admin_destructive_ops_dual_approval: boolean = true,    // require second admin for tenant-wide rebuilds
```

---

## 3. Feature Domains

### 3.1 Quick-Log Engine

Unchanged from v3.0. Three-layer architecture (local-first, optimistic with idempotency, AI enhancement). Four-tap context-aware flow. Bulk positive. Tap-from-register.

---

### 3.2 Points & Recognition

Unchanged from v3.0. Computed points, permanent awards with repeatability semantics, publication consent workflow.

---

### 3.3 Policy Rules Engine — Staged Composition with Replay

#### 3.3.1 Staged Evaluation

See §2.1 for the 5-stage pipeline. Key behaviour:

A single incident involving a SEND student during transport could trigger:

- **Consequence stage**: "Transport incident → flag for investigation" (first_match)
- **Approval stage**: "SEND student negative → require deputy approval" (first_match)
- **Notification stage**: "Transport incident → notify deputy" AND "Severity ≥ 3 → notify year head" (all_matching, both fire)
- **Support stage**: "SEND student with active intervention → create SENCO review task" (all_matching)
- **Alerting stage**: "Transport context → flag for transport review" (all_matching)

In v3.0, this required either one impossibly complex rule or was not expressible. In v4.0, it's five simple rules in different stages.

#### 3.3.2 Historical Replay

New capability. Before activating a new or modified rule, admins can replay it against historical data:

`POST v1/behaviour/policies/replay`

Request body:

```json
{
  "rule_id": "uuid",
  "replay_period": { "from": "2025-09-01", "to": "2025-12-20" },
  "dry_run": true
}
```

The engine:

1. Loads all incidents in the replay period
2. Evaluates the candidate rule against each (in its stage, with historical student snapshots from `incident_context_snapshot` and `participant.student_snapshot`)
3. Returns: how many incidents would have matched, what actions would have fired, which students affected, which year groups, estimated sanction/task volume

Response:

```json
{
  "incidents_evaluated": 847,
  "incidents_matched": 23,
  "actions_that_would_fire": {
    "auto_escalate": 8,
    "create_task": 23,
    "notify_roles": 23
  },
  "affected_students": 18,
  "affected_year_groups": ["Year 9", "Year 10"],
  "estimated_detentions_created": 0,
  "estimated_suspensions_created": 0,
  "sample_matches": [
    /* first 10 matched incidents with evaluation detail */
  ]
}
```

This answers: "If we turn on this rule, would it create 8 detentions or 80?" Schools can test policy in historical reality, not just theory.

#### 3.3.3 Settings UI

`/settings/behaviour-policies` — now with:

- Stage tabs (consequence / approval / notification / support / alerting)
- Per-stage rule list with priority ordering
- Match strategy toggle per rule (first_match / all_matching)
- Stop-processing flag
- Replay button: "Test against last term's data"
- Replay results view with sample matches and impact summary
- Import/export JSON for ETB policy sharing

---

### 3.4 Sanctions, Exclusions & Consequences

#### 3.4.1 Detentions & Suspensions

Unchanged from v3.0. Conflict checks, attendance integration, dual metrics, return workflow, parent acknowledgement.

**Document generation added**: When a suspension is created and `document_auto_generate_suspension_letter = true`:

1. System generates PDF from `behaviour_document_templates` (type: `suspension_letter`)
2. Merge fields populated from incident + sanction + student context snapshot
3. Document created in `behaviour_documents` with status `draft`
4. Staff reviews, optionally edits, finalises
5. Finalised document can be sent via notification channels or printed

#### 3.4.2 Appeals

See §3.11 for full appeal workflow (expanded in v4.0).

#### 3.4.3 High-Stakes Exclusion Cases

New in v4.0. When a sanction involves extended suspension (>5 days), expulsion, managed move, or permanent exclusion, an exclusion case is auto-created from `behaviour_exclusion_cases`.

**Exclusion case lifecycle**:

```
initiated → notice_issued            (formal notice generated and sent to parent)
notice_issued → hearing_scheduled    (hearing date set, invite sent)
hearing_scheduled → hearing_held     (hearing took place, minutes recorded)
hearing_held → decision_made         (board/principal decision recorded)
decision_made → appeal_window        (statutory appeal period begins)
appeal_window → finalised            (appeal deadline passed, or appeal decided)
appeal_window → overturned           (appeal succeeded)
```

**Statutory timeline tracking**: The `statutory_timeline` JSONB auto-populates with required steps and deadlines. Each step shows as a checklist item:

```json
[
  {
    "step": "Written notice to parents",
    "required_by": "2025-11-15",
    "completed_at": "2025-11-14",
    "status": "complete"
  },
  {
    "step": "Hearing scheduled (min 5 school days notice)",
    "required_by": "2025-11-22",
    "completed_at": null,
    "status": "pending"
  },
  {
    "step": "Board pack assembled",
    "required_by": "2025-11-21",
    "completed_at": null,
    "status": "pending"
  },
  {
    "step": "Decision communicated in writing",
    "required_by": null,
    "completed_at": null,
    "status": "not_started"
  },
  {
    "step": "Appeal window (15 school days)",
    "required_by": null,
    "completed_at": null,
    "status": "not_started"
  }
]
```

**Board pack generation**: One-click assembly of a complete evidence bundle as a single PDF:

- Incident detail with context snapshot
- All related incidents (escalation chain)
- Student behaviour profile summary
- Relevant intervention history
- All attached evidence
- Sanction history
- Chronological timeline
- Table of contents and page numbers

Generated via `behaviour_documents` with type `board_pack`.

---

### 3.5 Safeguarding Chronicle

Unchanged from v3.0. No delete (seal only), SLA tracking, critical escalation with DLP fallback, reporter acknowledgement, watermarked/redacted exports, break-glass with post-access governance, 25-year retention.

---

### 3.6 Intervention Tracking

Unchanged from v3.0. SEND-aware, task integration, review cycles with auto-populated data.

---

### 3.7 Student Behaviour Profile & Parent View

#### Parent-Safe Content Workflow (Expanded from v3.0)

**`parent_description` lifecycle rules**:

| Scenario                                      | `parent_description` status       | Can send notification?                                                                       |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| Quick-log with template                       | Auto-set to template text         | Yes (template is inherently safe)                                                            |
| Quick-log with custom text                    | NULL                              | Only if severity < send_gate_severity. Otherwise blocked until staff sets parent_description |
| Standard form — staff writes parent desc      | Set by staff                      | Yes                                                                                          |
| Standard form — no parent desc, low severity  | NULL                              | Yes (category name only)                                                                     |
| Standard form — no parent desc, high severity | NULL                              | Blocked until set                                                                            |
| AI-generated parent desc                      | Proposed, requires staff approval | Yes after approval                                                                           |

**Locale-aware**: `parent_description` (en) and `parent_description_ar` (ar). If the parent's preferred locale is Arabic and `parent_description_ar` is NULL, the system falls back to `parent_description` (en). If both are NULL, falls back to template/category name.

**Locked after send**: When `parent_description_auto_lock_on_send = true`, after the parent notification dispatches, `parent_description_locked = true`. Editing a locked description triggers the amendment workflow (§3.12).

#### Guardian Restrictions (Expanded from v3.0)

Replaces the simple visibility flag with `behaviour_guardian_restrictions` (§2.1). Every restriction has effective dates, legal basis, and review dates. Expired restrictions auto-deactivate. Upcoming review dates create reminder tasks.

The parent portal, notification dispatcher, and digest worker all check active restrictions before rendering or sending. The check is timezone-aware and uses the effective_from/effective_until date range.

---

### 3.8 Behaviour Pulse

Unchanged from v3.0. Five-dimension pulse with exposure-adjusted analytics and reporting confidence gate.

---

### 3.9 AI Features

Unchanged from v3.0. Governance framework, blocked diagnostic language, confidence thresholds, fallback behaviour, audit logging.

---

### 3.10 Analytics & ETB Benchmarking

Unchanged from v3.0. Exposure-adjusted rates, canonical taxonomy mapping, cohort thresholds, materialised views.

---

### 3.11 Appeals — With Outcome Packaging

v3.0 appeal lifecycle retained. v4.0 adds:

**Outcome document generation**: When an appeal is decided:

1. System generates `appeal_decision_letter` from template
2. Merge fields: student name, appeal grounds, hearing date, decision, reasoning, amendments, appeal rights
3. Document created in `behaviour_documents`, reviewed by deciding staff
4. On finalisation: sent to appellant via notification
5. If decision modifies the record: amendment notice auto-created (§3.12)

**Evidence bundle export**: One-click PDF assembly:

- Appeal submission details
- Original incident/sanction record with context snapshot
- All appeal attachments
- Hearing minutes (if hearing held)
- Decision and reasoning
- Resulting amendments

**Outcome communication chain**:

- Appellant notified of decision
- If amendments affect parent-visible data: amendment notice sent to parent
- If parent re-acknowledgement required: re-ack request sent
- All communications logged in `behaviour_parent_acknowledgements` with `amendment_notice_id` reference

---

### 3.12 Amendment Workflow

New in v4.0. Handles corrections to records after outbound communication.

**Triggers**:

- Incident edited after parent notification sent
- Category changed after notification
- Parent description corrected after send
- Sanction modified after notification
- Appeal changes underlying record

**Process**:

1. Edit detected (service layer checks if parent notification was sent for this entity)
2. If change affects parent-visible fields:
   a. `behaviour_amendment_notices` record created
   b. Original `parent_description_locked` must be unlocked (requires `behaviour.manage` + reason)
   c. New parent_description written (or AI-generated safe version)
   d. Correction notification queued with template `behaviour_correction_parent`
   e. If severity warrants: re-acknowledgement requested
3. If a PDF document was sent before the amendment:
   a. Original document status → `superseded`
   b. New document generated with "Amended — [date]" watermark
   c. Both versions retained for audit

**Amendment types**:

- `correction`: factual error in the record
- `supersession`: new information changes the interpretation
- `retraction`: record was made in error (distinct from withdrawal — retraction applies after communication)

---

### 3.13 Document Generation

New in v4.0. Formal document production integrated into behaviour workflows.

**Supported document types**:

| Type                        | Trigger                       | Auto-generate?     |
| --------------------------- | ----------------------------- | ------------------ |
| `detention_notice`          | Detention sanction created    | Optional (setting) |
| `suspension_letter`         | Suspension created            | Default on         |
| `return_meeting_letter`     | Return meeting scheduled      | Manual             |
| `behaviour_contract`        | Intervention with contract    | Manual             |
| `intervention_summary`      | For parent meeting            | Manual             |
| `appeal_hearing_invite`     | Hearing scheduled             | Auto               |
| `appeal_decision_letter`    | Appeal decided                | Auto               |
| `exclusion_notice`          | Exclusion case initiated      | Auto               |
| `exclusion_decision_letter` | Exclusion decided             | Auto               |
| `board_pack`                | Exclusion hearing preparation | Manual             |

**Generation pipeline**:

1. Template loaded (`behaviour_document_templates`)
2. Merge fields populated from entity + student + school context snapshots
3. HTML rendered with merge fields
4. PDF generated via Puppeteer (Noto Sans Arabic for RTL)
5. SHA-256 hash computed
6. PDF uploaded to S3 (encrypted)
7. `behaviour_documents` record created with `data_snapshot` (all merge field values frozen)
8. Status: `draft` → staff reviews → `finalised` → optionally `sent`

**Locale**: Templates exist per locale. Document generated in parent's preferred language when parent-facing, staff's locale when internal.

---

## 4. Data Classification Model

Unchanged from v3.0. Five classes: PUBLIC, PARENT, STAFF, SENSITIVE, SAFEGUARDING. Enforced across API, search, cache, export, AI, reports, notifications.

---

## 5. Timezone & School Calendar

Unchanged from v3.0. Tenant TZ, school days via `school_closures`, SLA on wall-clock hours, DST via Luxon.

---

## 6. Record Lifecycle & Retention Policy

New in v4.0. Complete lifecycle governance for all behaviour data.

### 6.1 Lifecycle States

| State        | Meaning                                            | Access                                                                                                 |
| ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `active`     | Current, live record                               | Full access per permissions                                                                            |
| `archived`   | Past academic year, no longer operationally active | Read-only. Not in default list views. Accessible via "Include archived" toggle and search              |
| `anonymised` | Retention period expired, PII removed              | Aggregate analytics only. Student name → "Student [hash]". Staff name → role. Free text → "[Archived]" |

### 6.2 Retention Rules

| Entity                  | Default Retention                           | Basis                            | Legal Hold Propagation                    |
| ----------------------- | ------------------------------------------- | -------------------------------- | ----------------------------------------- |
| Behaviour incidents     | 7 years after student withdrawal/graduation | Irish education records guidance | Yes — if linked to appeal or safeguarding |
| Sanctions               | 7 years                                     | Same                             | Yes                                       |
| Interventions           | 7 years                                     | Same                             | Yes                                       |
| Appeals                 | 10 years                                    | Dispute resolution records       | Yes                                       |
| Exclusion cases         | 25 years from student DOB                   | Matches safeguarding             | Always                                    |
| Tasks                   | 3 years from completion                     | Operational records              | No                                        |
| Policy evaluations      | 7 years                                     | Decision audit trail             | Yes — if linked to appealed incident      |
| Action executions       | 7 years                                     | Decision audit trail             | Yes                                       |
| Alerts                  | 3 years                                     | Operational records              | No                                        |
| Parent acknowledgements | 7 years                                     | Communication records            | Yes                                       |
| Entity history          | Matches parent entity                       | Audit trail                      | Yes                                       |
| Amendment notices       | Matches parent entity                       | Communication records            | Yes                                       |
| Documents (generated)   | Matches parent entity                       | Record of communication          | Yes                                       |
| Safeguarding concerns   | 25 years from student DOB                   | Children First Act 2015          | Always                                    |
| Safeguarding actions    | 25 years from student DOB                   | Same                             | Always                                    |
| Attachments             | Matches parent entity                       | Evidence                         | Yes                                       |

### 6.3 Lifecycle Operations

**Archival** (annual, after academic year close):

1. Worker identifies records for students who have left the school (withdrawn/graduated) with `left_date` + retention_years < now
2. Records transition to `archived` — `retention_status = 'archived'`, `archived_at` set
3. Archived records excluded from default list views, search results, and analytics (but included in "All time" historical reports)
4. No data deleted. No PII removed. Full read access maintained for authorised staff.

**Anonymisation** (after full retention period):

1. Worker identifies archived records past retention deadline
2. Check for legal holds (any linked appeal, safeguarding concern, or exclusion case with legal_hold = true blocks anonymisation)
3. If no legal hold: anonymise PII fields:
   - Student names → "Student-[first 8 chars of SHA-256(student_id)]"
   - Staff names → role title
   - Parent names → "Guardian"
   - Free text descriptions → "[Archived content]"
   - Context notes → NULL
   - Attachments → marked for deletion (actual S3 deletion after 30 days)
4. Record status → `anonymised`
5. Search index entries removed
6. Entity history preserved (with anonymised names)

**Parent portal visibility**: Ends when the student's status transitions to withdrawn/graduated. Configurable grace period (default: 30 days after status change).

### 6.4 Legal Hold Propagation

When legal_hold is set on any entity:

- All linked entities inherit the hold (incident → participants, sanctions, tasks, attachments, policy evaluations, entity history, amendment notices, documents)
- If an appeal is filed: the entire incident chain gets legal hold
- If a safeguarding concern links to an incident: the incident and all linked entities get legal hold
- If an exclusion case exists: all linked entities get legal hold
- Legal holds are set by staff with `behaviour.admin`, require reason, and are logged in entity history

---

## 7. Data Volume & Scale Strategy

New in v4.0.

### 7.1 Growth Estimates

Per school (30 teachers, 500 students, active usage):

- ~50 incidents/week → ~2,000/year
- ~2,000 participants/year
- ~2,000 entity history records/year
- ~10,000 policy evaluations/year (5 stages × 2,000 incidents)
- ~5,000 action executions/year
- ~1,000 tasks/year
- ~500 alerts/year
- ~1,000 parent acknowledgements/year

Per ETB (15 schools, 5 years): ~150,000 incidents, ~750,000 evaluations, ~75,000 entity history records.

Manageable with proper indexing, but requires planning for multi-year deployment.

### 7.2 Partitioning Strategy

| Table                                | Partition Strategy            | Key                                   |
| ------------------------------------ | ----------------------------- | ------------------------------------- |
| `behaviour_entity_history`           | Monthly range on `created_at` | Same pattern as existing `audit_logs` |
| `behaviour_policy_evaluations`       | Monthly range on `created_at` | High volume, append-only              |
| `behaviour_policy_action_executions` | Monthly range on `created_at` |                                       |
| `behaviour_parent_acknowledgements`  | Monthly range on `created_at` | Append-only                           |
| `behaviour_alerts`                   | Yearly range on `created_at`  | Lower volume                          |
| `behaviour_alert_recipients`         | Yearly range on `created_at`  |                                       |

Core operational tables (`behaviour_incidents`, `behaviour_sanctions`, `behaviour_tasks`, etc.) are NOT partitioned — they need full-table indexes for cross-date queries. Their volume is manageable with proper indexing.

### 7.3 Archival & Compaction

- Annual archival worker (§6.3) moves stale records to `archived` status
- Archived records can be moved to a separate tablespace on cheaper storage (RDS configuration)
- Materialised views refresh nightly; contention managed by refreshing `CONCURRENTLY`
- Search index pruned of archived records (reduces Meilisearch memory)
- Redis cache entries for archived students expire naturally (5-min TTL)

### 7.4 Index Maintenance

- `REINDEX CONCURRENTLY` scheduled monthly for high-write tables
- Partial indexes on `status = 'active'` for tables with lifecycle states (incidents, sanctions, tasks) — most queries filter on active records
- `pg_stat_user_indexes` monitored for unused indexes (removed in quarterly review)

### 7.5 Export & View Refresh

- Materialised view refresh: `REFRESH MATERIALIZED VIEW CONCURRENTLY` — no read locks
- Stagger refresh times: `mv_student_behaviour_summary` every 15min, `mv_behaviour_exposure_rates` at 02:00 UTC, `mv_behaviour_benchmarks` at 03:00 UTC
- Large PDF exports (board packs, case files) generated async via BullMQ, not in request cycle
- Export job has 120s timeout, 512MB memory limit

### 7.6 Dead-Letter & Queue Health

- BullMQ dead-letter threshold: 3 retries with exponential backoff
- Dead-letter queue monitored by `behaviour:admin/health` endpoint
- Alert created when dead-letter queue depth > 10
- Stale job reaper: jobs older than 24h in active state are moved to failed

---

## 8. API Endpoints

### 8.1 Core Behaviour — ~28 endpoints

Unchanged from v3.0.

### 8.2 Student Behaviour — 13 endpoints

Unchanged from v3.0.

### 8.3 Sanctions — 14 endpoints

Unchanged from v3.0.

### 8.4 Interventions — 12 endpoints

Unchanged from v3.0.

### 8.5 Tasks — 8 endpoints

Unchanged from v3.0.

### 8.6 Appeals — 10 endpoints (expanded from v3.0's 8)

Add:
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| POST | `v1/behaviour/appeals/:id/generate-decision-letter` | Generate decision letter from template | `behaviour.manage` |
| GET | `v1/behaviour/appeals/:id/evidence-bundle` | Export complete evidence bundle PDF | `behaviour.manage` |

### 8.7 Safeguarding — 18 endpoints

Unchanged from v3.0.

### 8.8 Recognition & Houses — 12 endpoints

Unchanged from v3.0.

### 8.9 Analytics & Pulse — 16 endpoints

Unchanged from v3.0.

### 8.10 Configuration — 21 endpoints (expanded from v3.0's 17)

Add:
| Method | Route | Description | Permission |
|--------|-------|-------------|------------|
| GET | `v1/behaviour/document-templates` | List templates | `behaviour.admin` |
| POST | `v1/behaviour/document-templates` | Create template | `behaviour.admin` |
| PATCH | `v1/behaviour/document-templates/:id` | Update | `behaviour.admin` |
| POST | `v1/behaviour/policies/replay` | Historical replay | `behaviour.admin` |

### 8.11 Parent Behaviour — 6 endpoints

Unchanged from v3.0.

### 8.12 Admin Operations — 14 endpoints (expanded from v3.0's 12)

All v3.0 endpoints retained. Modified with guardrails + add:

| Method | Route                                  | Description                                  | Permission        |
| ------ | -------------------------------------- | -------------------------------------------- | ----------------- |
| POST   | `v1/behaviour/admin/*/preview`         | Every destructive op gains a preview mode    | `behaviour.admin` |
| POST   | `v1/behaviour/admin/retention/preview` | Preview what would be archived/anonymised    | `behaviour.admin` |
| POST   | `v1/behaviour/admin/retention/execute` | Execute retention (dual approval if enabled) | `behaviour.admin` |

**Admin op guardrails** (all destructive operations):

```
1. POST .../preview → returns impact summary:
   { affected_records: 847, affected_students: 234, estimated_duration: "~45s" }
2. Staff reviews impact summary
3. POST .../execute → executes as async BullMQ job
   - If tenant_settings.admin_destructive_ops_dual_approval = true:
     creates an approval request (existing approvals module)
     job only starts after second admin approves
4. Job progress trackable via GET .../jobs/:jobId
5. Full audit log of what changed
6. Undo/rollback available for: recompute-points (cache invalidation only),
   rebuild-awards (new awards can be individually revoked),
   backfill-tasks (new tasks can be individually cancelled)
   NOT available for: retention execution, reindex (idempotent)
```

### 8.13 Exclusion Cases — 10 endpoints (new)

| Method | Route                                                  | Description               | Permission         |
| ------ | ------------------------------------------------------ | ------------------------- | ------------------ |
| POST   | `v1/behaviour/exclusion-cases`                         | Create from sanction      | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases`                         | List with filters         | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id`                     | Detail with timeline      | `behaviour.manage` |
| PATCH  | `v1/behaviour/exclusion-cases/:id`                     | Update                    | `behaviour.manage` |
| PATCH  | `v1/behaviour/exclusion-cases/:id/status`              | Status transition         | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/generate-notice`     | Generate formal notice    | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/generate-board-pack` | Generate evidence bundle  | `behaviour.manage` |
| POST   | `v1/behaviour/exclusion-cases/:id/record-decision`     | Record decision + letter  | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id/timeline`            | Statutory timeline status | `behaviour.manage` |
| GET    | `v1/behaviour/exclusion-cases/:id/documents`           | All generated documents   | `behaviour.manage` |

### 8.14 Documents — 6 endpoints (new)

| Method | Route                                 | Description                     | Permission         |
| ------ | ------------------------------------- | ------------------------------- | ------------------ |
| POST   | `v1/behaviour/documents/generate`     | Generate from template + entity | `behaviour.manage` |
| GET    | `v1/behaviour/documents`              | List with filters               | `behaviour.view`   |
| GET    | `v1/behaviour/documents/:id`          | Detail                          | `behaviour.view`   |
| PATCH  | `v1/behaviour/documents/:id/finalise` | Finalise draft                  | `behaviour.manage` |
| POST   | `v1/behaviour/documents/:id/send`     | Send via notification channel   | `behaviour.manage` |
| GET    | `v1/behaviour/documents/:id/download` | Download PDF (signed URL)       | `behaviour.view`   |

### 8.15 Guardian Restrictions — 6 endpoints (new)

| Method | Route                                           | Description                         | Permission        |
| ------ | ----------------------------------------------- | ----------------------------------- | ----------------- |
| POST   | `v1/behaviour/guardian-restrictions`            | Create restriction                  | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions`            | List (filterable by student/parent) | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions/:id`        | Detail                              | `behaviour.admin` |
| PATCH  | `v1/behaviour/guardian-restrictions/:id`        | Update (extend, modify)             | `behaviour.admin` |
| POST   | `v1/behaviour/guardian-restrictions/:id/revoke` | Revoke with reason                  | `behaviour.admin` |
| GET    | `v1/behaviour/guardian-restrictions/active`     | All active restrictions             | `behaviour.admin` |

### 8.16 Amendment Notices — 4 endpoints (new)

| Method | Route                                         | Description                         | Permission         |
| ------ | --------------------------------------------- | ----------------------------------- | ------------------ |
| GET    | `v1/behaviour/amendments`                     | List amendment notices              | `behaviour.manage` |
| GET    | `v1/behaviour/amendments/:id`                 | Detail with diff                    | `behaviour.manage` |
| POST   | `v1/behaviour/amendments/:id/send-correction` | Dispatch correction notice          | `behaviour.manage` |
| GET    | `v1/behaviour/amendments/pending`             | Amendments awaiting correction send | `behaviour.manage` |

**Total: ~155 endpoints across 16 controllers.**

---

## 9. Frontend Pages

### Staff Behaviour — `/behaviour/`

All v3.0 pages retained. Add:

| Route                        | Description                                                   |
| ---------------------------- | ------------------------------------------------------------- |
| `/behaviour/exclusions`      | Exclusion cases list with statutory timeline status           |
| `/behaviour/exclusions/[id]` | Case detail: timeline checklist, documents, hearing, decision |
| `/behaviour/documents`       | Document list — generated notices, letters, packs             |
| `/behaviour/amendments`      | Amendment notices pending correction                          |

### Safeguarding — `/safeguarding/`

Unchanged from v3.0 (5 pages).

### Parent — `/parent/behaviour/`

Unchanged from v3.0 (2 pages).

### Settings

All v3.0 pages retained. Add:

| Route                           | Description                                         |
| ------------------------------- | --------------------------------------------------- |
| `/settings/behaviour-documents` | Document template editor with merge field reference |

**Total: ~32 pages + 8 settings pages.**

---

## 10. Worker Jobs

All v3.0 jobs retained. Add:

| Job                                    | Queue       | Trigger                    | Description                                                     |
| -------------------------------------- | ----------- | -------------------------- | --------------------------------------------------------------- |
| `behaviour:retention-check`            | `behaviour` | Cron monthly 01:00 UTC     | Identify records for archival/anonymisation, create review task |
| `behaviour:guardian-restriction-check` | `behaviour` | Cron daily 06:00 tenant TZ | Expire ended restrictions, create review reminders              |

**Total: 13 worker jobs.**

---

## 11. Permissions

All v3.0 permissions retained. No additions needed — existing `behaviour.manage` and `behaviour.admin` cover exclusion cases, documents, guardian restrictions, and amendments.

**Total: 12 permissions.**

---

## 12. Integration Points

Unchanged from v3.0. Add:

| Module             | Integration                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Communications** | Amendment correction notices dispatched via existing multi-channel infra. Document send via notification channels. |

---

## 13. Notification Templates

All v3.0 templates retained. Add:

| Template                                | Trigger                                                  | Channels                |
| --------------------------------------- | -------------------------------------------------------- | ----------------------- |
| `behaviour_correction_parent`           | Amendment to parent-visible data after notification sent | Per parent preference   |
| `behaviour_reacknowledgement_request`   | Amendment requires re-ack                                | In-app + email          |
| `behaviour_exclusion_notice_parent`     | Exclusion case formal notice                             | Email (always) + in-app |
| `behaviour_exclusion_decision_parent`   | Exclusion decision                                       | Email (always) + in-app |
| `behaviour_guardian_restriction_review` | Restriction approaching review date                      | In-app to admin         |

**Total: 18 notification templates.**

---

## 14. Testing & Release Gate Requirements

New in v4.0. Mandatory test suites that must pass before any behaviour module release.

### 14.1 Data Classification Contract Tests

For every API endpoint that returns behaviour data:

```typescript
describe('Data Classification', () => {
  it('STAFF-scope user never receives SENSITIVE fields', () => {
    // Call endpoint as teacher with behaviour.view (no view_sensitive)
    // Assert: context_notes is absent, meeting_notes is absent, send_notes is absent
  });

  it('PARENT-scope user never receives STAFF fields', () => {
    // Call endpoint as parent
    // Assert: description (internal) is absent, only parent_description/category shown
  });

  it('Non-safeguarding user never sees converted_to_safeguarding status', () => {
    // Call endpoint as teacher without safeguarding.view
    // Assert: status shown as 'closed', not 'converted_to_safeguarding'
  });
});
```

**Required coverage**: Every endpoint, every export type, every preview payload.

### 14.2 Scope Enforcement Tests

```typescript
describe('Scope Enforcement', () => {
  it('class-scope teacher only sees students in their classes', () => {});
  it('year_group-scope year head only sees their year groups', () => {});
  it('own-scope teacher only sees incidents they logged', () => {});
  it('scope applies to search results', () => {});
  it('scope applies to hover card previews', () => {});
  it('scope applies to PDF exports', () => {});
  it('scope applies to AI query results', () => {});
});
```

### 14.3 Status Projection Tests

```typescript
describe('Status Projection', () => {
  it('converted_to_safeguarding projected as closed for behaviour users', () => {});
  it('projected status in search index', () => {});
  it('projected status in entity history for non-safeguarding users', () => {});
  it('projected status in parent notifications', () => {});
});
```

### 14.4 Parent-Safe Rendering Tests

```typescript
describe('Parent-Safe Rendering', () => {
  it('parent portal never shows raw description field', () => {});
  it('parent portal uses parent_description when available', () => {});
  it('parent portal falls back to template text, then category name', () => {});
  it('parent portal never shows attachments or their existence', () => {});
  it('parent portal never shows other participants names', () => {});
  it('parent notification respects send-gate severity', () => {});
  it('guardian restriction blocks portal and notifications', () => {});
  it('guardian restriction respects effective dates', () => {});
});
```

### 14.5 Safeguarding Isolation Tests

```typescript
describe('Safeguarding Isolation', () => {
  it('safeguarding_concern_incidents join invisible from behaviour side', () => {});
  it('safeguarding entities not in search index', () => {});
  it('safeguarding fields never in AI prompts', () => {});
  it('safeguarding data never in materialised views', () => {});
  it('break-glass grants expire correctly', () => {});
  it('every safeguarding read creates audit log entry', () => {});
});
```

### 14.6 Idempotency & Dedup Tests

```typescript
describe('Idempotency', () => {
  it('duplicate idempotency_key returns existing incident', () => {});
  it('policy evaluation not re-executed on retry', () => {});
  it('award not re-created on worker retry', () => {});
  it('parent notification not re-sent on retry', () => {});
  it('compensating withdrawal cascades correctly', () => {});
});
```

### 14.7 RLS Verification

Standard EduPod RLS test suite applied to all 25+ behaviour tables: tenant isolation verified with cross-tenant query attempts.

---

## 15. Admin Operations — Guardrails

All operations from v3.0 retained. v4.0 adds guardrails:

**Every destructive admin operation follows this protocol**:

1. **Preview**: `POST .../preview` returns impact summary without executing
2. **Review**: Staff reviews impact (affected records, students, estimated duration)
3. **Execute**: `POST .../execute` queues as async BullMQ job
4. **Dual approval** (when `admin_destructive_ops_dual_approval = true`): job requires second admin to approve via existing approvals module before execution begins
5. **Progress**: `GET .../jobs/:jobId` returns completion percentage
6. **Audit**: Full audit log of operation, executor, approver, records affected
7. **Rollback**: Where possible (see matrix below)

**Rollback matrix**:

| Operation           | Rollback? | Method                                                       |
| ------------------- | --------- | ------------------------------------------------------------ |
| recompute-points    | Yes       | Cache invalidation only — rerun                              |
| rebuild-awards      | Partial   | New awards individually revokable                            |
| recompute-pulse     | Yes       | Idempotent rerun                                             |
| backfill-tasks      | Partial   | New tasks individually cancellable                           |
| resend-notification | No        | Already sent                                                 |
| refresh-views       | Yes       | Idempotent                                                   |
| reindex-search      | Yes       | Idempotent                                                   |
| retention-execute   | No        | Irreversible (anonymisation) — requires dual approval always |
| dead-letter-retry   | No        | Job re-executed                                              |

**Tenant-wide dangerous operations** (recompute-points for entire tenant, retention-execute, reindex-search) always require dual approval regardless of setting.

---

## 16. Seed Data per Tenant

| Entity                 | Count                                                                                                     |
| ---------------------- | --------------------------------------------------------------------------------------------------------- |
| Categories             | 12 with benchmark mappings                                                                                |
| Award types            | 4 with tier semantics                                                                                     |
| Description templates  | ~60 (en + ar)                                                                                             |
| Policy rules           | 5 (consequence: 1 escalation, approval: 2 suspension+expulsion, notification: 1 parent, alerting: 1 flag) |
| Document templates     | ~20 (10 types × 2 locales, system templates)                                                              |
| Notification templates | 18                                                                                                        |

---

## 17. Scope Summary & Implementation Estimate

### Scope

| Dimension              | v3.0             | v4.0             | Delta                                                                                                                                   |
| ---------------------- | ---------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Database tables        | 25               | 31               | +6 (entity_history replaces incident_history, amendment_notices, exclusion_cases, documents, document_templates, guardian_restrictions) |
| Materialised views     | 3                | 3                | Unchanged                                                                                                                               |
| API endpoints          | ~135             | ~155             | +20 (exclusions, documents, guardian restrictions, amendments, policy replay, admin previews)                                           |
| Frontend pages         | ~28 + 7 settings | ~32 + 8 settings | +5 (exclusions list/detail, documents, amendments, document template editor)                                                            |
| Worker jobs            | 11               | 13               | +2 (retention check, guardian restriction check)                                                                                        |
| Permissions            | 12               | 12               | Unchanged (covered by existing manage/admin)                                                                                            |
| Sequences              | 5                | 6                | +1 (EX-)                                                                                                                                |
| Notification templates | 13               | 18               | +5                                                                                                                                      |
| Test suites            | —                | 7 mandatory      | New gate requirement                                                                                                                    |

### Implementation

| Phase                                   | Scope                                                                                                                                                                                                                                                                      | Duration  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **A: Core + Temporal**                  | Data model with snapshots, incidents CRUD, participants, quick-log (idempotent + offline), categories, templates, permissions with scope, state machines with projection, data classification, unified entity_history, parent_description workflow with send-gate and lock | 3 weeks   |
| **B: Policy Engine**                    | Staged rules with 5-stage pipeline, versioning, evaluation ledger per stage, action execution with dedup, historical replay, settings UI with stage tabs + replay                                                                                                          | 2 weeks   |
| **C: Sanctions + Exclusions + Appeals** | Sanctions full lifecycle, exclusion cases with statutory timeline + board pack, appeals with outcome packaging + document generation, amendment workflow                                                                                                                   | 2 weeks   |
| **D: Safeguarding**                     | Concerns, actions, SLA, DLP workflow, attachments (AV + signed URLs + object lock), seal, reporter ack, break-glass with post-access governance, exports                                                                                                                   | 2 weeks   |
| **E: Recognition + Interventions**      | Points, awards with repeatability, houses, publication consent, interventions with SEND, reviews, guardian restrictions with effective dates                                                                                                                               | 1 week    |
| **F: Analytics + AI**                   | Pulse (5 dimensions, exposure-adjusted), analytics, AI with governance, pattern detection with alert ownership, ETB benchmarking                                                                                                                                           | 1.5 weeks |
| **G: Documents + Comms**                | Document templates + generation engine, parent portal with safe rendering, guardian visibility, notification digest, amendment correction chain                                                                                                                            | 1.5 weeks |
| **H: Hardening + Ops + Scale**          | Admin ops with guardrails + dual approval, retention lifecycle worker, partition setup, integration testing, release-gate test suites (§14), scope audit, RLS verification, classification audit, scale testing                                                            | 2 weeks   |

**Total: ~15 weeks. Budget 15–16 weeks.**

---

## 18. What Makes This the Final Form

v1.0: wow factor. v2.0: institutional trust. v3.0: forensic defensibility. v4.0: **operational completeness**.

The six things v4.0 adds that close the remaining gaps:

1. **Staged policy composition.** Schools no longer choose between one consequence rule and one notification rule. Five stages fire independently: consequence, approval, notification, support, alerting. A single incident can trigger actions across all five without composite-rule fragility. Historical replay lets schools test new policies against real data before activating them.

2. **Structured history for everything.** Not just incidents — sanctions, appeals, tasks, exclusion cases, guardian restrictions, publication approvals, break-glass grants all get full append-only lifecycle history. When a principal asks "show me every change to this suspension," the answer is a clean timeline, not reconstructed audit log fragments.

3. **Complete record lifecycle.** Every entity has explicit retention rules, archival workflow, and anonymisation path. Legal hold propagation prevents premature purging of records linked to appeals, safeguarding, or exclusion cases. Parent portal access ends on student departure with configurable grace period.

4. **Amendment workflow.** When a record changes after a parent was notified, the system doesn't silently update — it creates an amendment notice, generates a correction communication, optionally requires re-acknowledgement, and marks superseded documents. The school's communication history is always honest.

5. **Bespoke exclusion workflow.** Expulsion is no longer just a sanction variant. It's a full case with statutory timeline tracking, formal notice generation, board pack assembly, hearing management, decision letters, and appeal integration. Every step is documented, timed, and defensible.

6. **Operational maturity.** Partitioning strategy for high-growth tables. Admin ops with preview/dual-approval guardrails. Mandatory release-gate test suites for visibility classes, scope enforcement, status projection, and safeguarding isolation. Dead-letter monitoring. The system is designed to sustain itself across years of production use.

The competitor comparison has 45+ capability rows. Compass Chronicle checks roughly 6. VSware checks 2. EduPod checks all of them.

This is a school climate operating system built for forensic-grade trust, policy-driven consistency, statutory compliance, cross-school intelligence, and multi-year operational sustainability. Schools will demo it for the pulse dashboard. They'll buy it for the policy engine, the safeguarding chronology, and the exclusion workflow. They'll renew because the analytics helped them make better decisions, the task engine ensured nothing fell through the cracks, the amendment workflow kept their communication honest, and the lifecycle governance meant the system was still clean and performant three years later.
