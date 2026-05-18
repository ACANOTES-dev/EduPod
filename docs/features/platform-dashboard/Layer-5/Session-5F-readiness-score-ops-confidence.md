# Session 5F: Readiness Score / Ops Confidence

**Depends on:** 5A (synthetic uptime + certificates + external dependencies), 5B (alert route health), 5C (Sentry intake health), 5D (evidence freshness + uptime reconciliation), 5E (backup readiness), Layer 1C (alert history → unresolved critical incidents), Layer 4A (deploy event freshness). Final session in Layer 5.
**Unlocks:** Nothing (final layer-5 session).

---

## Objective

Boil "is the platform safe to walk away from" into **one number** the operator glances at every morning. Specifically, this session ships:

1. **`platform_readiness_score_snapshots`** — one row per daily snapshot of the readiness score (0–100) plus a per-dimension breakdown, written by a daily cron at 00:05 UTC. Used for the 90-day trend chart.
2. **`platform_readiness_dimension_weights`** — operator-tunable weights per dimension (default values seeded; operator can rebalance).
3. **`ReadinessScoreService`** — pure aggregator: pulls each dimension's current value (0–100), multiplies by its weight, sums, normalises. Returns the score + per-dimension breakdown + the worst-contributing dimension + a one-line explanation.
4. **A hero card** rendered at the top of `/admin` (dashboard home) and dedicated page `/admin/readiness` with the breakdown.
5. **Two evaluation cadences:**
   - **Live evaluation cron every 5 minutes** (`@Cron('0 */5 * * * *')`) — computes the score in-memory, evaluates alert thresholds, fires alerts on crossings. Does NOT write to `platform_readiness_score_snapshots`. This is what wakes the operator quickly when a critical pipeline goes silent at 03:00.
   - **Daily snapshot cron at 00:05 UTC** — computes once and persists. Powers the 90-day trend chart and the audit trail.
6. **Alert thresholds** — score crossing 80 fires `warning`; crossing 40 fires `critical`. (Operator-tunable via env or weights table.) Debounce: must be below threshold for **2 consecutive 5-minute live evaluations** (≈ 10 minutes) before alerting; daily snapshots no longer drive alerts directly.
7. **Daily snapshot trend** — 90-day chart of the score so the operator sees direction (improving / degrading) at a glance.

After this session, the operator has a single sentence to answer the question "if something breaks right now, will I know, and will I have enough evidence to respond?". Score 92 = "yes, I'm covered". Score 38 = "no, fix the dimension labelled 'silent: bullmq snapshots' first".

---

## Critical Safety Constraints

- **No-AI guard.** No LLM imports. The score is a deterministic weighted sum.
- **No vanity metrics.** The score must answer the wake-up question, not represent generic system health. Inputs are explicitly enumerated; "uptime %", "request latency p95", "tenant satisfaction" etc. are NOT inputs to this score because they don't change the operator's wake-up readiness.
- **The score is operator-tunable, not operator-game-able.** Operators can rebalance weights but cannot inflate dimension values. Each dimension reads from the underlying source-of-truth table; there is no manual override of, say, "alert route health = 100" while routes are actually broken.
- **Missing data is penalised, not ignored.** A dimension whose source pipeline is silent reports `null`; the aggregator treats `null` as 0 (not as "skip"). This prevents a broken evidence pipeline from artificially inflating the score.
- **Weight changes audit-log.** Every PATCH on `platform_readiness_dimension_weights` writes a `platform_audit_logs` entry via 1.5B. Prevents quiet "I tuned the score to 100" gaming.
- **Score crossing thresholds debounced.** A momentary dip below 80 (one cron tick) does NOT alert; the score must stay below for 2 consecutive snapshots OR the operator-tunable cooldown elapses. Prevents alert flapping during short outages.
- **The score is informational, not authoritative.** It informs the operator; it does NOT trigger automatic remediation, lockouts, or any state change beyond an alert.

---

## Database

```prisma
model PlatformReadinessScoreSnapshot {
  id                       String                            @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  snapshot_at              DateTime                          @default(now()) @db.Timestamptz()
  score                    Decimal                           @db.Decimal(5, 2)        // 0.00 – 100.00
  worst_dimension          ReadinessDimension?
  worst_dimension_value    Decimal?                          @db.Decimal(5, 2)
  breakdown                Json                              @db.JsonB                // { dimension: { value, weight, weighted_contribution } }
  reasons                  Json                              @db.JsonB                // ['Sentry intake silent for 7h']
  weights_snapshot         Json                              @db.JsonB                // weights at the time of computation, for auditability

  @@map("platform_readiness_score_snapshots")
  @@index([snapshot_at(sort: Desc)])
}

model PlatformReadinessDimensionWeight {
  dimension                ReadinessDimension                @id
  weight                   Decimal                           @db.Decimal(5, 2)        // 0.00 – 100.00; sum across all dimensions = 100
  enabled                  Boolean                           @default(true)
  updated_by_user_id       String?                            @db.Uuid
  updated_at               DateTime                          @updatedAt @db.Timestamptz()

  @@map("platform_readiness_dimension_weights")
}

enum ReadinessDimension {
  synthetic_journeys
  alert_route_health
  evidence_freshness
  backup_readiness
  sentry_intake
  queue_canary
  deploy_event_freshness
  unresolved_critical_incidents
  certificate_expiry
  external_dependency_status
}
```

### Seeded weights (default — sum = 100)

| Dimension                       | Weight | Rationale                                              |
| ------------------------------- | ------ | ------------------------------------------------------ |
| `alert_route_health`            | 20     | If alerts can't reach you, nothing else matters        |
| `evidence_freshness`            | 15     | Without fresh evidence, diagnosis is impossible        |
| `backup_readiness`              | 15     | Disaster recovery is binary                            |
| `synthetic_journeys`            | 12     | Continuous platform exercise                           |
| `unresolved_critical_incidents` | 10     | Active fires drain readiness                           |
| `sentry_intake`                 | 8      | Production error visibility                            |
| `queue_canary`                  | 7      | BullMQ end-to-end liveness                             |
| `certificate_expiry`            | 5      | Cliff-edge failure mode                                |
| `deploy_event_freshness`        | 4      | Recent deploy correlation only relevant intermittently |
| `external_dependency_status`    | 4      | Upstream provider status                               |

Operators can rebalance via PATCH (Layer 1.5B audit-logged); the only constraint enforced at the DB layer is that disabled dimensions don't count and that no weight is negative. Sum can be anything (the aggregator normalises by sum-of-enabled-weights), but the UI nudges operators to keep the sum at 100 for readability.

---

## API + Service Layer

### `ReadinessScoreService`

```ts
@Injectable()
export class ReadinessScoreService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly synthetic: SyntheticCheckSummariserService, // 5A — produces dimension value
    private readonly alertRoutes: AlertRouteHealthSummariserService, // 5B
    private readonly evidence: EvidenceFreshnessService, // 5D
    private readonly backups: BackupReadinessService, // 5E
    private readonly sentry: SentryIntakeHealthSummariserService, // 5C
    private readonly queues: QueueCanarySummariserService, // 5A queue canary subset
    private readonly deploys: DeployEventFreshnessSummariserService, // 4A
    private readonly incidents: UnresolvedCriticalIncidentsSummariserService, // 1C/4E
    private readonly certificates: CertificateExpirySummariserService, // 5A
    private readonly externalDeps: ExternalDependencySummariserService, // 5A
  ) {}

  /** Compute the score on demand — used by GET /readiness-score. */
  async compute(): Promise<ReadinessScoreResult>;

  /** Persist a snapshot (called by daily cron). */
  async snapshot(): Promise<PlatformReadinessScoreSnapshot>;

  /** Read weights — for the dimensions endpoint. */
  async getWeights(): Promise<PlatformReadinessDimensionWeight[]>;

  /** Update one weight; audit-log via 1.5B. */
  async updateWeight(input: {
    dimension: ReadinessDimension;
    weight: number;
    user_id: string;
  }): Promise<PlatformReadinessDimensionWeight>;
}

type ReadinessScoreResult = {
  score: number; // 0–100
  worst_dimension: ReadinessDimension | null;
  worst_dimension_value: number | null;
  breakdown: Array<{
    dimension: ReadinessDimension;
    value: number; // 0–100
    weight: number;
    weighted_contribution: number;
    reason?: string;
  }>;
  reasons: string[]; // top 3 worst reasons across dimensions
  computed_at: string;
};
```

### Per-dimension summariser shape

Every dimension's summariser returns `{ value: number /* 0-100 */; reason?: string }`. Conventions:

- `100` = ideal state.
- `0` = total failure (silent / broken / overdue).
- `null` = data missing → treated as 0 with reason `'no data — pipeline silent'`.
- The summariser is a thin adapter over the underlying source-of-truth service; no business logic added at this layer.

Mapping per dimension:

| Dimension                       | Summariser Source                                                                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `synthetic_journeys`            | % of enabled checks whose latest result is `passed` × 100                                                        |
| `alert_route_health`            | % of enabled routes whose last dead-man check succeeded × 100                                                    |
| `evidence_freshness`            | 100 - (% of enabled pipelines in non-`fresh` state weighted by severity)                                         |
| `backup_readiness`              | Maps `BackupReadinessSummary.overall_status` → green=100 / amber=60 / red=20                                     |
| `sentry_intake`                 | 100 if last webhook < 1h AND signature_valid_rate > 99% over last 24h, scaled down otherwise                     |
| `queue_canary`                  | % of canary runs in last hour that completed within latency SLO × 100                                            |
| `deploy_event_freshness`        | 100 if `platform_deploy_events` has at least one row in last 30 days; partial scoring on staleness               |
| `unresolved_critical_incidents` | 100 if no unresolved `critical` alerts; deducts 25 per unresolved critical (floored at 0)                        |
| `certificate_expiry`            | 100 if all certs > 30 days; scaled by minimum days-until-expiry across inventory                                 |
| `external_dependency_status`    | 100 if all providers `operational`; -10 per `degraded`, -25 per `partial_outage`, -50 per `major_outage` (min 0) |

### Daily snapshot cron

NestJS `@Cron('0 5 0 * * *')` (00:05 UTC daily, after the date rolls over). Persists one row to `platform_readiness_score_snapshots` for the trend chart + audit trail. Does NOT drive alerts (live evaluation owns alerts):

```ts
@Cron('0 5 0 * * *')
async dailySnapshot() {
  await this.readinessScore.snapshot();
}
```

### Live evaluation cron

NestJS `@Cron('0 */5 * * * *')` (every 5 minutes). Computes the score in-memory (no row written), evaluates alert thresholds, fires alerts on debounced crossings. This is the wake-up path:

```ts
@Cron('0 */5 * * * *')
async liveEvaluate() {
  const result = await this.readinessScore.compute();
  await this.alertEvaluator.evaluate(result);    // pushes recent values into a rolling window in Redis
}
```

The live evaluator keeps a Redis-backed sliding window of the last 4 evaluations (≈ 20 minutes) per threshold. A `warning` alert fires when 2 consecutive evaluations cross below 80; a `critical` alert fires when 2 consecutive evaluations cross below 40. This 10-minute debounce prevents flapping during short outages without making the operator wait until tomorrow's snapshot.

### Alert evaluation rules

| Trigger                                                                          | Severity   |
| -------------------------------------------------------------------------------- | ---------- |
| 2 consecutive live evaluations below 80                                          | `warning`  |
| 2 consecutive live evaluations below 40                                          | `critical` |
| Live evaluation crosses back above 80 from below                                 | `info`     |
| Live evaluation cron itself fails (try/catch in `@Cron`) for 3 consecutive ticks | `critical` |

### Endpoints

```
GET    /v1/admin/readiness-score                         @RequiresPlatformPermission('platform.readiness.view')
GET    /v1/admin/readiness-score/history                 @RequiresPlatformPermission('platform.readiness.view')
GET    /v1/admin/readiness-score/dimensions              @RequiresPlatformPermission('platform.readiness.view')
PATCH  /v1/admin/readiness-score/dimensions/:dimension   @RequiresPlatformPermission('platform.readiness.manage')
```

New permission keys (seeded in 1.5A's catalogue update):

- `platform.readiness.view`
- `platform.readiness.manage`

Both `platform_owner` and `platform_support` get `view`; only `platform_owner` gets `manage`.

---

## Frontend

### `<ReadinessScoreHeroCard>` (rendered on `/admin` dashboard home + as the page header on `/admin/readiness`)

Layout:

```
┌────────────────────────────────────────────────────┐
│   READINESS SCORE                                  │
│                                                    │
│         92  /  100        (green)                  │
│                                                    │
│   ✓ All evidence pipelines fresh                   │
│   ⚠ Backup is 27h old — slightly past SLO          │
│   ✓ All routes healthy                             │
│                                                    │
│   [ View dimensions →  /admin/readiness ]          │
└────────────────────────────────────────────────────┘
```

Score colour: green ≥ 80, amber 40–79, red < 40.

### `/admin/readiness`

Top: hero card (same as above, larger).

Mid: 90-day score trend chart (Recharts area chart). Hover → tooltip shows the snapshot's breakdown.

Bottom: `<DimensionBreakdownTable>` — every dimension as a row with: name, current value, weight, weighted contribution, reason, sparkline of last 30 days. Sortable by weighted contribution descending — the worst dimensions show first.

Right rail: `<DimensionWeightEditor>` — only visible to `platform_owner`. Lists every dimension with a number input for its weight. "Save weights" button confirms via Layer 1.5C `<OwnerActionConfirmDialog>` (since rebalancing is a sensitive change), then PATCHes each changed weight, audit-logged.

### `<WorstDimensionCallout>`

Standalone component — also reused in 4B's Copilot opening message ("I see your readiness is 38 — the worst dimension is `evidence_freshness` because 3 pipelines are silent. Do you want me to look at one?").

The callout itself does not call the model; it just renders the data. Layer 4B's chat opening uses it to bootstrap context.

### Components

- `ReadinessScoreHeroCard`
- `DimensionBreakdownTable`
- `DimensionWeightEditor` (with owner-confirmation modal)
- `WorstDimensionCallout`
- `ReadinessTrendChart` (90-day area chart)
- `ScoreBadge` (small inline pill — used in admin shell header)

---

## Alerting Behaviour

| Event                                                                    | Severity   | Routed Through                                              |
| ------------------------------------------------------------------------ | ---------- | ----------------------------------------------------------- |
| Score crosses below 80 for 2 consecutive **live** evaluations (≈ 10 min) | `warning`  | Default route (5B)                                          |
| Score crosses below 40 for 2 consecutive **live** evaluations            | `critical` | Escalation policy (5B)                                      |
| Score recovers above 80 (next live evaluation after a crossing alert)    | `info`     | Default route                                               |
| Live evaluation cron fails 3 consecutive ticks                           | `critical` | Default route + meta-monitoring path                        |
| Daily snapshot cron fails (try/catch in `@Cron`)                         | `warning`  | Default route — historical chart loses a day, not an outage |
| Weight rebalanced                                                        | `info`     | Default route — confirms operator-initiated change          |

All alerts respect maintenance windows for `warning`; `critical` is NOT suppressible (a low score during maintenance still matters — maintenance shouldn't hide systemic problems).

---

## Tests

### Unit

- `readiness-score.service.spec.ts` — given fixture summariser outputs, computes the expected score, identifies the correct worst dimension, enumerates the right reasons.
- `dimension-summariser-mapping.spec.ts` — each summariser returns `0–100` or `null`; null is treated as 0 with reason.
- `weight-normalisation.spec.ts` — when weights don't sum to 100, the aggregator normalises by sum-of-enabled-weights; disabled dimensions excluded.
- `score-debounce.spec.ts` — single 5-minute live evaluation below 80 does NOT alert; two consecutive live evaluations below 80 DO alert; recovery on the next evaluation above 80 fires `info`.
- `score-live-vs-snapshot.spec.ts` — the live evaluation cron does NOT write to `platform_readiness_score_snapshots`; the daily snapshot cron does write but does NOT fire alerts.
- `weight-update-audit.spec.ts` — PATCH writes audit log entry with before/after values.
- `weight-update-owner-confirmation.spec.ts` — PATCH without `owner_confirmation_id` returns 403 if dimension weight delta > 10 (reasonably-sized change uses owner confirmation; trivial 1-point tweaks don't).
- `readiness-no-anthropic.spec.ts` — static analysis: no LLM imports.

### Integration

- `daily-snapshot-cron.e2e.ts` — trigger snapshot manually; row created with current breakdown; subsequent days computed correctly.
- `score-alert-cross.e2e.ts` — fixture state with score 78 → alert; recover to 85 → info recovery alert.
- `worst-dimension-display.e2e.ts` — render the dashboard home; assert hero card shows the correct worst dimension.

### Acceptance

- [x] Both new tables exist; default weights seeded; migration applies cleanly.
- [x] `ReadinessScoreService.compute()` returns deterministic results given fixture inputs.
- [x] Live evaluation cron runs every 5 minutes; computes in-memory; does NOT write rows.
- [x] Daily snapshot cron runs at 00:05 UTC; snapshot row created; does NOT fire alerts.
- [x] Hero card renders on dashboard home with current score + breakdown (sourced from live computation, not yesterday's snapshot).
- [x] `/admin/readiness` page renders breakdown table + 90-day trend (sourced from snapshots).
- [x] Weight editor visible only to `platform_owner`; large changes require Layer 1.5C owner confirmation; all changes audit-log.
- [x] Alerts fire on score crossings, debounced across 2 consecutive 5-minute live evaluations (≈ 10 min). Daily snapshots do NOT drive alerts.
- [x] Disabled dimensions excluded from the score; missing data treated as 0 (not skipped).
- [x] No-AI guard test passes.
- [x] All new code passes `turbo lint` + `turbo type-check`; no regressions.

---

## Commits / CI / Notes

- Implementation commit: `8147d6eb feat(platform): add readiness score dashboard`
- GitHub Actions: `CI / Deploy` run `26006222932` passed all jobs and deployed to production.
- Local verification passed:
  - `pnpm --filter @school/prisma generate`
  - `pnpm run snapshot:schema`
  - Prisma validation
  - `pnpm run snapshot:api`
  - `pnpm --filter @school/api type-check`
  - `pnpm --filter @school/web type-check`
  - `pnpm --filter @school/api lint:ci`
  - `pnpm --filter @school/web lint`
  - targeted readiness/evidence Jest suite
  - `pnpm validate:fast`
  - `pnpm test`
  - API + worker coverage gate
- Production smoke on `https://dua.edupod.app` passed:
  - Platform admin login succeeded with the local platform-admin smoke account.
  - `/en/admin` renders the readiness hero card from live computation.
  - `/en/admin/readiness` renders the readiness hero, 90-day trend empty state, dimension breakdown, and owner weight editor.
  - Readiness APIs return HTTP 200 for current score, 90-day history, and dimension weights. Current production score at smoke time was `35.21` with 10 editable dimensions and 0 daily snapshots, which is expected immediately after first deploy before the next 00:05 UTC snapshot.
  - Regression smoke covered `/en/admin/backups` and `/en/admin/evidence-completeness`.
- Production readiness notes:
  - Current red score is expected because production still has no real alert routes/escalation policies, no Sentry webhook receipts, no offsite replication metadata, and no restore drill. These are operational provisioning gaps, not Session 5F deployment failures.
  - Daily snapshots are expected to appear after the next 00:05 UTC scheduled run.
  - Layer 5 readiness/background/snapshot/dashboard code remains deterministic and non-AI.

---

## Next Implementation Session Prompt

```md
Implement the Layer 5 Operational Provisioning & Readiness Closeout session for the Platform Admin Dashboard build. Server access granted for diagnostics only unless Ram explicitly grants provisioning access for external services.

Spec:
docs/features/platform-dashboard/Layer-5/Layer-5-Plan.md
docs/features/platform-dashboard/Layer-5/Session-5A-synthetic-journey-monitoring.md
docs/features/platform-dashboard/Layer-5/Session-5B-alert-routing-escalation.md
docs/features/platform-dashboard/Layer-5/Session-5C-sentry-intake-agent-handoff.md
docs/features/platform-dashboard/Layer-5/Session-5D-evidence-completeness.md
docs/features/platform-dashboard/Layer-5/Session-5E-backup-restore-readiness.md
docs/features/platform-dashboard/Layer-5/Session-5F-readiness-score-ops-confidence.md

Context:

- Sessions 5A through 5F are implemented, deployed through CI, smoke-tested, and accepted for code delivery.
- Production currently starts with intentionally red/empty readiness inputs until operations are provisioned:
  - no real alert channels/routes/escalation policies are configured yet;
  - no mirrored Sentry issues or webhook receipts exist until Sentry webhook delivery is configured;
  - backup readiness remains red/partial until offsite metadata is configured and a restore drill is recorded;
  - the first readiness snapshot appears only after the next 00:05 UTC scheduled snapshot run.
- Layer 5 monitoring/background/readiness work must not call AI.
- Platform admin host: https://dua.edupod.app
- Credentials are stored locally at /Users/ram/.codex/secrets/edupod-platform-admin.env
- Do not print, commit, log, or screenshot secrets.
- Deploy through CI only by pushing to origin main if code or documentation changes are required.

Before acting:

1. Read AGENTS.md.
2. Read docs/plans/context.md.
3. Read docs/plans/ux-redesign-final-spec.md.
4. Read Layer 5 plan and all Session 5A-5F closeout notes end-to-end.
5. Inspect existing 5A-5F services, alert routing hooks, maintenance-window suppression, evidence freshness pipelines, backup readiness, readiness score, Platform Admin dashboard conventions, audit ledger, and owner-confirmation primitives before changing anything.
6. Load backend, frontend, prisma, testing, worker, code-quality, architecture-policing, feature-map-maintenance, and pre-launch-tracking rules as relevant.

Implementation / operations requirements:

- Stay strictly within Layer 5 operational closeout.
- Do not invent new product features.
- First produce a production readiness gap report from live data:
  - synthetic checks and latest results;
  - alert channels, routes, route health, escalation policies, emergency contacts;
  - Sentry webhook audit receipts and mirrored issue counts;
  - evidence pipeline status, including Layer 5 self-monitoring pipelines;
  - backup runs, offsite replication metadata, restore drills, and backup readiness summary;
  - readiness score, dimension breakdown, weights, and 90-day snapshot history.
- Treat known empty states as provisioning gaps, not deployment failures.
- If Ram grants external-service/operator provisioning access, configure the missing operational pieces using existing UI/API paths:
  - at least one email route and at least one urgent route;
  - distinct route health-check sink destinations;
  - a critical escalation policy;
  - Sentry webhook delivery and signing-secret validation;
  - offsite replication metadata polling;
  - one recorded restore drill if a real drill has been performed.
- If provisioning access is not granted, document exact manual steps and verify all code paths continue to handle empty states honestly.
- Verify no Layer 5 scheduled/background/readiness code imports or calls AI services.
- Update the Layer 5 plan acceptance checklist only for criteria actually satisfied in production; leave external provisioning criteria unchecked if real destinations are not configured.
- Update relevant runbooks/docs with operational notes if needed, but do not edit production `.env` or rotate credentials.

Verification:

- Run targeted backend/frontend checks if any code changes are made.
- Run Prisma validation and relevant tests if database-facing docs/code changed.
- Production smoke:
  - `/en/admin`
  - `/en/admin/readiness`
  - `/en/admin/alerts/routes`
  - `/en/admin/alerts/escalation`
  - `/en/admin/sentry`
  - `/en/admin/evidence-completeness`
  - `/en/admin/backups`
- Verify readiness score changes are explainable by real dimension inputs and missing data remains penalised as 0.

Deployment:

- Commit to main and push to origin main only if code or documentation changes are made.
- Watch GitHub Actions.
- Fix forward if CI fails.
- Production smoke on https://dua.edupod.app after green deploy when runtime-affecting changes are shipped.

Completion:

- Add "Commits / CI / Notes" to the relevant Layer 5 documentation.
- Generate the prompt for the next implementation session in this same style.
  Include this same instruction that the next agent should generate the following prompt when it finishes.
- Final response should say whether the Layer 5 operational closeout is complete and whether the repo is ready for next work.
- Final response should include the generated next-session prompt.
```

---

## Notes / Risks

- **The score is the front-door product of Layer 5.** It is what the operator sees first. Make the hero card good. Big number, clear color, three-line reason summary. Keep it simple.
- **Default thresholds (80 warning, 40 critical) are conservative.** Operators can tune via env. After a few weeks of real data, the operator can decide whether 80 is too high (alert fatigue) or too low (false confidence).
- **Why no AI summary of the breakdown?** Because that introduces an always-on AI path. The "explain my readiness" capability is operator-clicked via Layer 4B's Explain button — never automatic. The pre-AI text in the hero card is templated, not generated.
- **Why not render the score on every page?** It would become wallpaper. Concentrate on dashboard home + dedicated page + (optionally) the admin shell header pill when the score is < 80.
- **Connection to Layer 4 (allowed):** Layer 4B's chat opening can render `<WorstDimensionCallout>` based on the current readiness score. This is read-only — it does not call the model to generate the callout. The operator clicks "Explain why this dimension is dragging" if they want analysis.
- **Connection to Layer 4 (forbidden):** No daily cron asks the Copilot to "summarise the readiness change". No background recommendation generated when the score drops. The score itself is computed without ANY model involvement; the static-analysis guard enforces this.
- **Risk: weight tuning to game the score.** Mitigation: every weight change is audit-logged with `before` and `after` values; the snapshot stores `weights_snapshot` so historical scores can always be re-explained against the weights in force at the time. A future audit-review tool can flag suspicious weight churn.
- **Risk: false confidence.** A score of 95 could still mask a critical issue if the operator has disabled the relevant dimension's source pipeline. Mitigation: the dimension table shows enabled/disabled state per dimension; dashboard home banner warns if any dimension is disabled.
- **Future enhancement (out of scope):** per-week / per-month roll-ups for SLO reporting (uptime % over 30 days, mean time to acknowledge over 30 days). Not in 5F — defer until real operating data exists.
