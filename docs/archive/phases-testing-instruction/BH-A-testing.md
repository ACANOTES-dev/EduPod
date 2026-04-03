# Phase A: Core + Temporal — Testing Instructions

## Unit Tests

### BehaviourService

- `createIncident`: creates incident with context snapshot, student snapshot, idempotency dedup, auto-created follow-up task, notification queue
- `listIncidents`: scope filtering (own/class/year_group/all), tab filters, pagination, date range, status projection
- `getIncident`: data classification stripping (sensitive fields hidden without permission)
- `updateIncident`: parent description lock enforcement, history recording
- `transitionStatus`: valid transitions pass, invalid transitions rejected with INVALID_TRANSITION
- `withdrawIncident`: sets status to withdrawn, records history with reason
- `addParticipant`: creates participant with student snapshot, validates student exists
- `removeParticipant`: domain constraint (can't remove last student), records history

### BehaviourQuickLogService

- `getContext`: returns categories, templates grouped by category, recent students
- `quickLog`: delegates to createIncident with quick-log defaults, idempotency
- `bulkPositive`: creates one incident per student, returns count

### BehaviourTasksService

- `completeTask`: sets status, completed_at, completed_by_id, records history
- `cancelTask`: sets status, records history with reason
- `getMyTasks`: filters by assigned_to_id and active statuses
- `getOverdueTasks`: returns only overdue status tasks
- `getTaskStats`: counts pending, overdue, completed_today

### BehaviourConfigService

- `createCategory`: validates unique name per tenant, sets all fields
- `updateCategory`: prevents duplicate names, updates correctly
- `createTemplate`: associates with category, validates locale
- `updateTemplate`: partial update works

### BehaviourScopeService

- `getUserScope`: returns 'all' for behaviour.admin/manage, 'class' for behaviour.view with class assignments, 'own' for behaviour.log only
- `buildScopeFilter`: generates correct Prisma WHERE for each scope level

### Data Classification

- `stripFieldsByClassification`: strips SENSITIVE fields for STAFF-level users
- `stripFieldsByClassification`: includes all fields for SAFEGUARDING-level users
- `getUserDataClassification`: correctly maps permissions to classification levels

### State Machine

- `isValidTransition`: all valid transitions accepted
- `isValidTransition`: terminal states reject all transitions
- `projectIncidentStatus`: converted_to_safeguarding shows as closed for non-safeguarding users

## RLS Leakage Tests

For each table below:

1. Create data as Tenant A
2. Query as Tenant B
3. Assert: empty result or 404

Tables to test:

- `behaviour_incidents`
- `behaviour_incident_participants`
- `behaviour_categories`
- `behaviour_description_templates`
- `behaviour_entity_history`
- `behaviour_tasks`
- `behaviour_parent_acknowledgements`

## Permission Tests

- `behaviour.log` can POST incidents but cannot PATCH or change status
- `behaviour.view` can GET incidents within scope but cannot manage
- `behaviour.manage` can PATCH, transition status, withdraw, add/remove participants
- `behaviour.admin` can POST/PATCH categories and templates
- Without `behaviour.view_sensitive`: context_notes field stripped from responses
- Without `safeguarding.view`: converted_to_safeguarding shown as 'closed'

## Integration Tests

- Quick-log end-to-end: POST /incidents/quick -> incident created -> participant with snapshot -> history entry -> notification queued
- Bulk positive: 5 students -> 5 incidents -> 5 history entries -> correct point totals
- Status transition chain: draft -> active -> investigating -> resolved (via 3 PATCH calls)
- Idempotency: same idempotency_key twice -> same incident returned, no duplicates
- Domain constraint: remove last student participant -> 400 error

## Manual QA Checklist

- [ ] Navigate to /behaviour — pulse dashboard loads with stats
- [ ] Click "New Incident" — form loads with category picker
- [ ] Select category, search student, enter description, submit — incident created
- [ ] Verify incident appears in list with correct status
- [ ] Click incident — detail page shows participants, history
- [ ] Change status from active to investigating — history records change
- [ ] Navigate to /behaviour/students — student list shows point totals
- [ ] Click student — profile shows timeline tab with incidents
- [ ] Navigate to /behaviour/tasks — task inbox shows auto-created follow-up tasks
- [ ] Complete a task — status changes, completion notes recorded
- [ ] Navigate to /settings/behaviour-categories — categories CRUD works
- [ ] Navigate to /settings/behaviour-general — settings form loads, saves work
- [ ] Test quick-log FAB on mobile viewport — bottom sheet opens
- [ ] Test RTL (switch to Arabic locale) — layout mirrors correctly
