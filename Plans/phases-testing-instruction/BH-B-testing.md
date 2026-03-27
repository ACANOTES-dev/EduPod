# Phase B: Policy Engine — Testing Instructions

## Unit Tests

### PolicyEvaluationEngine — Condition Matching
- All conditions pass → match
- Any condition fails → no match
- No conditions specified → wildcard (matches everything)
- severity_min and severity_max boundary tests (inclusive)
- repeat_count_min with window period
- student_has_send reads from student_snapshot, not live data
- year_group_ids returns false when student has no year group
- Edge: severity_min = 1 matches all severities >= 1
- Edge: repeat_window_days = 365 covers full year

### PolicyEvaluationEngine — Stage Execution
- Stages always execute in order: consequence → approval → notification → support → alerting
- stop_processing_stage flag halts further rules in stage when matched
- first_match strategy skips subsequent rules after first match
- all_matching strategy evaluates all rules in stage

### PolicyEvaluationEngine — Action Execution
- Evaluation row with matched conditions when rule fires
- Evaluation row with no_match when no rule fires
- skipped_duplicate recorded when same action already succeeded
- Pipeline continues when single action fails
- incident.policy_evaluation_id links to consequence stage evaluation

### PolicyRulesService — Versioning
- Snapshot previous version before applying update
- Increment current_version on every update
- Evaluation links to rule_version_id, not rule_id
- Old evaluations still reference old version after rule edit

### PolicyEvaluationEngine — Per-Student Isolation
- Separate evaluations for each student participant
- Each student snapshot used independently
- repeat_count calculated per student, not per incident

## Integration Tests

### Endpoint Tests
- GET /policies returns rules filtered by stage/active
- POST /policies creates rule + version 1 snapshot
- PATCH /policies/:id snapshots prev, updates, increments version
- DELETE /policies/:id sets is_active=false
- GET /policies/:id/versions returns all versions desc
- POST /policies/replay returns correct match counts
- POST /admin/policy-dry-run returns all 5 stage results
- GET /incidents/:id/policy-evaluation returns full decision trace

### Worker Job Tests
- Job enqueued on incident creation (active status)
- Job enqueued on participant addition (student type)
- Job skips withdrawn incidents
- Job skips draft incidents
- Job is idempotent — retrying doesn't duplicate evaluations
- Job completes all 5 stages for each student participant
- Job sets incident.policy_evaluation_id after evaluation

### Replay Tests
- Correct incident count for replay period
- Correct match count using historical snapshots
- Zero rows written when dry_run=true
- Rejects replay windows exceeding 10,000 incidents

## RLS Tests
- Tenant A cannot read tenant B policy rules
- Tenant A cannot read tenant B policy evaluations
- Tenant A cannot read tenant B policy action executions
- Tenant A cannot read tenant B policy rule versions

## Permission Tests
- 403 for GET /policies without behaviour.admin
- 403 for POST /policies without behaviour.admin
- 403 for POST /policies/replay without behaviour.admin
- 403 for POST /admin/policy-dry-run without behaviour.admin
- behaviour.manage user CAN GET /incidents/:id/policy-evaluation
- behaviour.view user CANNOT GET /incidents/:id/policy-evaluation

## Manual QA Checklist
- [ ] Navigate to /settings/behaviour-policies
- [ ] Verify 5 stage tabs render with correct rule counts
- [ ] Create a new rule with conditions and actions
- [ ] Edit the rule — verify version history shows previous state
- [ ] Toggle rule enabled/disabled
- [ ] Reorder rules via priority buttons
- [ ] Run a replay against past data — verify results render
- [ ] Open dry-run mode — test a hypothetical incident
- [ ] Export rules as JSON — verify file downloads
- [ ] Import rules from JSON — verify new rules created
- [ ] View version history dialog
- [ ] Create an incident — verify policy evaluation runs (check evaluation trace endpoint)
