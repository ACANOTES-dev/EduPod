# Implementation 09 — Safeguarding (Break-Glass + Sealing) + Admin Repair + Policy Engine Ops

> **Wave:** 3 (parallel-safe — owns endpoints under `apps/api/src/modules/safeguarding/` and `apps/api/src/modules/behaviour/admin/`)
> **Classification:** backend + worker
> **Depends on:** 01, 04
> **Deploys:** API restart only
>
> **⚠️ PRIVACY-CRITICAL.** This impl ships endpoints that bypass normal access controls (break-glass), permanently destroy data (anonymisation), and execute mass mutations across the tenant (admin repair). Run with Ultrathink-grade attention.

---

## Goal

Three sets of endpoints, all sensitive:

1. **Safeguarding break-glass + sealing** — emergency time-bound access override with mandatory after-action review; irreversible sealing with dual approval.
2. **Admin data repair** — recompute points, rebuild awards, recompute pulse, backfill tasks, reindex search, retention sweep, legal-hold lifecycle. Each has a `/preview` endpoint that returns the would-be effect without committing, and a `/execute` (or unprefixed) endpoint that performs the action under audit.
3. **Policy engine ops** — replay rules against historical incidents (preview + execute), import/export policy JSON, dry-run a policy against a synthetic incident.

## Shared files this impl touches

- `apps/api/src/modules/safeguarding/safeguarding.module.ts` — register controllers. Edit late.
- `apps/api/src/modules/behaviour/behaviour.module.ts` — register `BehaviourAdminController`, `BehaviourPolicyOpsController`. Edit late.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **low** (different controllers from impls 02 / 05 / 06 / 07 / 08).

## What to build

### 1. Safeguarding break-glass

#### Endpoints (verify exist; harden shapes)

```
POST   /v1/safeguarding/break-glass                          — request grant (or auto-grant for high-tier roles)
GET    /v1/safeguarding/break-glass                          — list active + recent grants
GET    /v1/safeguarding/break-glass/:id                      — single grant
POST   /v1/safeguarding/break-glass/:id/review               — file mandatory after-action review
GET    /v1/safeguarding/break-glass/:id/access-log           — what data was accessed under this grant
```

Grant model: `granted_to_user_id`, `granted_by_user_id`, `scope` (`all_concerns` | `specific_concerns`), `scoped_concern_ids` (UUID array; only when scope is `specific_concerns`), `granted_at`, `expires_at`, `justification`, `after_action_review_completed_at`, `after_action_review_by_id`, `after_action_summary`.

Permissions:

- `safeguarding.break_glass.request` — designated safeguarding leads (DSL) + principals
- `safeguarding.break_glass.approve` — owner + principal (auto-approves DSL requests; principal requests need owner)
- `safeguarding.break_glass.review` — same as approve

Post-grant: every safeguarding read query while the grant is active is logged (`safeguarding_break_glass_access_log` table — verify exists; if not, add).

After-action review is **mandatory** within 7 days of grant expiry. If not filed, the user's break-glass permission is suspended until the review is filed (enforced by a guard).

### 2. Safeguarding sealing

#### Endpoints

```
POST   /v1/safeguarding/concerns/:id/request-seal           — DSL initiates seal
POST   /v1/safeguarding/concerns/:id/approve-seal           — second approver confirms (dual approval — must be different person)
POST   /v1/safeguarding/concerns/:id/reject-seal            — second approver rejects
GET    /v1/safeguarding/concerns/:id/seal-status            — current state
```

Sealing is **irreversible**. Once sealed:

- Concern is excluded from all standard queries (the safeguarding service's read methods filter `sealed_at IS NULL` by default; sealed records require `safeguarding.seal.view` permission)
- PII fields are not modified — sealing is a visibility flag, not anonymisation
- Audit log records seal request, approval/rejection, and any seal-view access

Dual approval: `request_seal_by_user_id` and `approve_seal_by_user_id` MUST differ. Service rejects with `SAME_PERSON_DUAL_APPROVAL_FORBIDDEN` if same user attempts both.

### 3. Admin data repair

#### Endpoints (each pair: preview + execute)

```
POST   /v1/behaviour/admin/recompute-points/preview         — returns { affected_students, total_changes }
POST   /v1/behaviour/admin/recompute-points                 — runs the recomputation as a background job
POST   /v1/behaviour/admin/rebuild-awards/preview
POST   /v1/behaviour/admin/rebuild-awards
POST   /v1/behaviour/admin/recompute-pulse                  — sync (fast)
POST   /v1/behaviour/admin/backfill-tasks/preview
POST   /v1/behaviour/admin/backfill-tasks
POST   /v1/behaviour/admin/reindex-search/preview
POST   /v1/behaviour/admin/reindex-search                   — async via worker
POST   /v1/behaviour/admin/retention/preview                — what would be archived/anonymised
POST   /v1/behaviour/admin/retention/execute                — runs retention pass

POST   /v1/behaviour/admin/legal-holds                      — create new hold
GET    /v1/behaviour/admin/legal-holds                      — list active holds
POST   /v1/behaviour/admin/legal-holds/:id/release          — release a hold (audit logged)
```

Permissions: `behaviour.admin` for all of the above.

Each preview is a read-only count + sample. Each execute writes an `admin_repair_runs` row tracking who triggered, started_at, completed_at, affected_count, summary, and is queued to a background worker for the long-running ones (recompute-points, rebuild-awards, reindex, retention).

Long-running execution runs in a worker job. Endpoint returns the run row immediately; a polling endpoint `GET /admin/repair-runs/:id` returns status. Wave 6 impl 23 polls this for the UI.

### 4. Policy engine ops

#### Endpoints

```
POST   /v1/behaviour/policies/replay/preview                — body: { incident_filter, rule_ids? }
POST   /v1/behaviour/policies/replay                        — execute against historical incidents
GET    /v1/behaviour/policies/export                        — JSON dump of all rules
POST   /v1/behaviour/policies/import                        — validate + import JSON; body: { dry_run: bool, rules: [...] }
POST   /v1/behaviour/policy-dry-run                         — body: { incident_payload }; returns matched rules + actions without persisting
```

Permissions: `behaviour.admin`.

Replay is destructive in the sense that it can create sanctions / tasks / notifications retroactively. The preview endpoint returns the count of would-be side effects per rule. Execute endpoint enqueues a `behaviour:policy-replay` job (existing queue; verify) with idempotency on `(rule_id, incident_id)` to allow safe re-runs.

Import dry_run validates schema + checks for duplicate rule keys; non-dry returns the persisted rule IDs.

## Tests

- Break-glass:
  - Grant with `scope: 'specific_concerns'` requires `scoped_concern_ids` array
  - DSL requesting auto-approves; principal request requires owner approval
  - Access log captures every safeguarding read while grant active
  - Mandatory after-action review enforces 7-day window — guard blocks new grants if overdue
- Sealing:
  - Dual approval — same user cannot request and approve
  - Rejection state preserves concern visibility
  - Sealed concern excluded from standard list endpoint
  - `safeguarding.seal.view` required to read sealed concerns
- Admin repair:
  - Each preview returns count without mutation
  - Each execute creates `admin_repair_runs` row + enqueues worker job
  - Polling endpoint returns run status correctly
- Policy engine:
  - Dry-run does not persist
  - Replay preview matches replay execute counts
  - Import schema validation: rejects invalid rule shapes

## Watch out for

- **Break-glass scope leakage** — when scope is `specific_concerns`, every read endpoint that returns concern data must filter by `scoped_concern_ids`. Forgetting this in any endpoint defeats the entire scope mechanism. Audit ALL safeguarding read endpoints in this impl.
- **Sealing irreversibility** — there is NO `unseal` endpoint. Do not add one even if it seems convenient. The audit guarantee depends on sealing being permanent.
- **Admin repair on production** — every execute endpoint should have `confirm_phrase` body field that the user must type to match (e.g. `"recompute-points-yes"`). The Wave 6 UI surfaces a typed confirmation. Backend rejects with `CONFIRMATION_PHRASE_MISMATCH` if missing/wrong.
- **Replay idempotency** — without idempotency, re-running a replay creates duplicate sanctions. Use `(rule_id, incident_id, replay_run_id)` uniqueness, or check existing actions before inserting.
- **Legal hold ↔ retention interaction** — retention worker MUST honour legal holds. Verify the existing retention worker queries legal holds before anonymising; if not, fix in this impl.

## Deployment notes

- Restart: API only.
- Smoke: each preview endpoint returns counts on NHQS (likely all zeros). Trigger one execute (e.g. recompute-pulse — fast, side-effect-light) and verify `admin_repair_runs` row + completion. Try requesting break-glass as the seeded principal account; verify grant + access log working. Do NOT trigger destructive operations on prod NHQS without explicit user direction.
