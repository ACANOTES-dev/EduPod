# Phase C: Sanctions + Exclusions + Appeals — Testing Instructions

## Unit Tests

### SanctionService (`behaviour-sanctions.service.spec.ts`)
1. `should create sanction with pending_approval status when suspension_requires_approval is true`
2. `should create sanction with scheduled status when approval not required`
3. `should generate SN- sequence number on creation`
4. `should return conflict warning when detention clashes with existing sanction`
5. `should not block detention creation despite conflict (warning only)`
6. `should compute suspension_days excluding school closures`
7. `should transition scheduled -> served and write entity history`
8. `should throw BadRequestException for invalid state transition (served -> appealed)`
9. `edge: should handle bulk-mark-served with mix of valid and invalid sanction IDs (partial success)`
10. `should trigger exclusion case creation when suspension_days >= 5 on external suspension`
11. `should not create duplicate exclusion case if one already exists for sanction`
12. `should transition to superseded on reschedule and create new sanction`
13. `should get today's sanctions grouped by type`
14. `should get my supervision sanctions filtered by supervised_by_id`
15. `should detect amendment needed when parent-visible field changes after notification sent`

### ExclusionCaseService (`behaviour-exclusion-cases.service.spec.ts`)
1. `should generate EX- sequence number on creation`
2. `should populate statutory_timeline with correctly calculated dates`
3. `should mark timeline step overdue when required_by is past and completed_at is null`
4. `should set legal hold on incident, sanction, and all linked entities`
5. `should transition status through notice_issued -> hearing_scheduled -> hearing_held -> decision_made -> appeal_window`
6. `should throw BadRequestException for invalid exclusion case transition`
7. `should calculate appeal_deadline as 15 school days from decision_date`
8. `should be idempotent — not create duplicate case for same sanction`
9. `should create appeal_review task on case creation`
10. `should map suspension_external to suspension_extended case type`

### AppealService (`behaviour-appeals.service.spec.ts`)
1. `should generate AP- sequence number on submission`
2. `should transition linked sanction to appealed on submission`
3. `should reject submission if open appeal already exists for the sanction`
4. `should set legal hold on incident and sanction on submission`
5. `should apply upheld_original: revert sanction from appealed to scheduled`
6. `should apply overturned: cancel sanction and set incident to closed_after_appeal`
7. `should apply modified: create replacement sanction and set original to replaced`
8. `should auto-create amendment notices when decision modifies parent-visible fields`
9. `edge: decide endpoint must be atomic — if amendment notice creation fails, entire transaction rolls back`
10. `should transition to withdrawn_appeal and restore sanction to scheduled on withdraw`
11. `should link to exclusion case when appealing an exclusion-triggering sanction`

### AmendmentService (`behaviour-amendments.service.spec.ts`)
1. `should create amendment notice when parent-notified incident category is changed`
2. `should create amendment notice when parent-notified sanction date is changed`
3. `should not create amendment notice if notification was not yet sent`
4. `should throw 403 when editing parent_description_locked=true without behaviour.manage`
5. `should record authorised_by_id when behaviour.manage unlocks locked description`
6. `should set requires_parent_reacknowledgement=true when high-severity field changes`
7. `should dispatch correction notification on sendCorrection`
8. `should return only pending amendments from getPending`

### SuspensionReturnWorker (`suspension-return.processor.spec.ts`)
1. `should create return_check_in task 3 school days before suspension_end_date`
2. `should not create duplicate task if one already exists for the sanction`
3. `should skip school_closures when counting 3 school days`
4. `should fall back to principal if supervised_by_id is null`

## Integration Tests (RLS)
1. `should not return sanctions belonging to another tenant`
2. `should not return exclusion cases belonging to another tenant`
3. `should not return appeals belonging to another tenant`
4. `should not return amendment notices belonging to another tenant`
5. `Tenant A's sanction cannot be retrieved by Tenant B via GET /sanctions/:id`

## Permission Tests
1. `GET /sanctions without behaviour.manage returns 403`
2. `POST /appeals/:id/decide without behaviour.manage returns 403`
3. `GET /amendments without behaviour.manage returns 403`
4. `GET /sanctions/my-supervision with behaviour.view succeeds`
5. `POST /sanctions/bulk-mark-served without behaviour.manage returns 403`

## Manual QA Checklist
- [ ] Create a sanction manually from an incident → verify SN- sequence, status=scheduled
- [ ] Create a suspension sanction with suspension_requires_approval=true → verify status=pending_approval
- [ ] Create external suspension with 5+ days → verify exclusion case auto-created
- [ ] Transition sanction through: scheduled → served → verify entity history
- [ ] Attempt invalid transition (served → appealed) → verify 400 error
- [ ] Bulk mark served on today's detentions page → verify all transition
- [ ] Submit appeal against a scheduled sanction → verify sanction → appealed
- [ ] Decide appeal as upheld → verify sanction → scheduled
- [ ] Decide appeal as overturned → verify sanction → cancelled, incident → closed_after_appeal
- [ ] Edit parent-notified incident category → verify amendment notice created
- [ ] Send correction from amendments page → verify notification dispatched
- [ ] Check exclusion case statutory timeline → verify dynamic status computation
- [ ] Record exclusion decision → verify appeal_deadline computed
- [ ] Verify all 7 frontend pages load without errors
- [ ] Verify sanctions list filter/pagination works
- [ ] Verify appeals detail page shows all sections
- [ ] Verify exclusion timeline checklist with color coding
