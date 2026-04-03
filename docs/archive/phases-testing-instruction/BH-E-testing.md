# Phase E: Recognition + Interventions — Testing Instructions

## Unit Tests

### `BehaviourPointsService`

- `should return sum of non-withdrawn participant points`
- `should exclude participants on withdrawn incidents`
- `should return points from cache when cache hit`
- `should invalidate cache on incident withdrawal`
- `should compute house points as aggregate of member points`

### `BehaviourAwardService`

- `should create award when student crosses threshold`
- `should not create duplicate award for same incident (dedup guard)`
- `should not create award if repeat_mode = once_per_year and already awarded this year`
- `should not create award if repeat_mode = once_ever and already awarded`
- `should set superseded_by_id on lower-tier awards when supersedes_lower_tiers = true`
- `should not exceed repeat_max_per_year`
- `should create manual award respecting repeat checks`

### `BehaviourRecognitionService`

- `should publish item when both consent and admin gates pass`
- `should not publish when consent gate is blocked`
- `should auto-pass consent gate when recognition_wall_requires_consent = false`
- `should auto-pass admin gate when recognition_wall_admin_approval_required = false`
- `should set unpublished_at on reject`

### `BehaviourInterventionsService`

- `should generate IV-number on creation`
- `should auto-create follow-up task on creation`
- `should validate state machine transitions`
- `should reject invalid transitions (e.g. completed -> active)`
- `should strip send_notes when user lacks behaviour.view_sensitive`
- `should auto-populate behaviour_points_since_last on review`
- `should create next review task when next_review_date is set`
- `should set actual_end_date on completion`
- `should list overdue interventions (next_review_date < today)`

### `BehaviourGuardianRestrictionsService`

- `should return true when active restriction matches effective date range`
- `should return false when restriction.effective_until < today`
- `should return false when restriction.effective_from > today`
- `should return false when restriction.status = expired`
- `should create review task when review_date is within 14 days`
- `should not create duplicate review task`
- `should escalate task priority to high within 3 days of review_date`
- `should set status to revoked with revoke_reason on revocation`

### `BehaviourHouseService`

- `should enforce one house per student per academic year`
- `should bulk assign atomically (delete + insert)`
- `should invalidate house points cache on bulk assign`

## Integration Tests

### Recognition

- `POST /recognition/awards` should create award and return 201
- `POST /recognition/awards` should return 400 for exceeded repeat_max_per_year
- `GET /recognition/wall` should return only published items
- `PATCH /recognition/publications/:id/approve` should publish when both gates pass
- `POST /recognition/houses/bulk-assign` should replace memberships atomically

### Interventions

- `POST /interventions` should create with IV-number and auto-create task
- `PATCH /interventions/:id/status` with valid transition should succeed
- `PATCH /interventions/:id/status` with invalid transition should return 400
- `POST /interventions/:id/reviews` should auto-populate stats
- `GET /interventions/:id` should strip send_notes without behaviour.view_sensitive
- `edge: student in two concurrent interventions — overdue check returns both`

### Guardian Restrictions

- `POST /guardian-restrictions` should create restriction and record history
- `POST /guardian-restrictions/:id/revoke` should require reason
- `GET /guardian-restrictions/active` should filter by effective dates
- `edge: restriction with null effective_until is indefinite — should block for all future dates`

## RLS Leakage Tests

- `RLS: house memberships from tenant A not visible to tenant B query`
- `RLS: guardian restrictions from tenant A not accessible to tenant B`
- `RLS: awards from tenant A not visible to tenant B`
- `RLS: interventions from tenant A not accessible to tenant B`

## Permission Tests

- `should return 403 when creating award without behaviour.manage`
- `should return 403 when creating guardian restriction without behaviour.admin`
- `should return 403 when approving publication without behaviour.admin`
- `should return 403 when revoking guardian restriction without behaviour.admin`
- `should return 403 when creating intervention without behaviour.manage`

## Manual QA Checklist

- [ ] Navigate to /behaviour/recognition — all 4 tabs load
- [ ] Create a manual award via the awards list
- [ ] Verify award appears on the recognition wall (if auto-populate enabled)
- [ ] Approve a publication from the Pending Approvals tab
- [ ] Navigate to /behaviour/interventions — tabs filter correctly
- [ ] Create a new intervention with goals and strategies
- [ ] Add a review to an active intervention
- [ ] Complete an intervention with outcome
- [ ] Navigate to /settings/behaviour-awards — CRUD operations work
- [ ] Navigate to /settings/behaviour-houses — create house, assign members
- [ ] Create a guardian restriction and verify it appears in the active list
- [ ] Revoke a restriction and verify the reason is required
- [ ] Mobile: verify all pages work at 375px width
- [ ] RTL: switch to Arabic and verify layout is correct
