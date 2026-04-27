# Implementation 14 — Architecture Docs + Comprehensive E2E Verification

> **Wave:** 5 (final implementation of the rebuild)
> **Depends on:** 11 (frontend Settings UI), 12 (module gap closure), 13 (test tenant backfill)
> **Restart:** API + worker + web (final regression sweep across all three apps)
> **Deployment route:** worktree commit only (per `IMPLEMENTATION_LOG.md` Rule 5) — NO CI, NO PRODUCTION

---

## 1. Goal

Close the rebuild. This is the last implementation of fourteen. Every previous wave shipped functionality; this wave ships the documentation + verification handoff so the user can rebase `communications-overhaul` onto `main` with confidence.

The work splits cleanly into three concerns:

1. **Architecture documentation update** — six docs in `docs/architecture/` are now stale because the rebuild reshaped the comms surface. Per `.claude/rules/architecture-policing.md` an Impl-14-owned single coherent update is the policy (Rule 14 of `IMPLEMENTATION_LOG.md`). Update `feature-map.md`, `module-blast-radius.md`, `danger-zones.md`, `state-machines.md`, `event-job-catalog.md`, and the source-of-truth `communication-architecture.md`.
2. **Comprehensive E2E verification** — a Playwright walkthrough on `http://localhost:5551` that authenticates each of the five test tenants (NHQS + stress-a/b/c/d), drives all three channels (email, SMS, WhatsApp) through the full flow (config → test send → webhook receive → status update → suppression check), and confirms zero console errors. Cap the run at ~20 minutes per memory.
3. **Hand-off package** — a pre-merge checklist at `communicationnew/PRE-MERGE-CHECKLIST.md`, a final completion record in `IMPLEMENTATION_LOG.md`, and clear next-steps for the user (rebase, merge, run cutover script).

After this implementation lands, the `communications-overhaul` worktree is **ready for the user to merge**. Nothing in production has changed yet — production cutover happens after merge by running `communicationnew/cutover/production-cutover.sh`. This impl owns the worktree handoff, not the cutover itself.

---

## 2. Pre-flight

Per `.claude/rules/architecture-policing.md` and `.claude/rules/feature-map-maintenance.md`:

1. Read `docs/architecture/pre-flight-checklist.md`.
2. Re-read `IMPLEMENTATION_LOG.md` §4 — verify all 13 prior implementations are `completed`. If any row is not `completed`, STOP and surface a blocker in §5.
3. Confirm you are on branch `communications-overhaul` in the dedicated worktree.
4. Re-read `IMPLEMENTATION_LOG.md` §2a — Impl 14 should be the only impl in flight in Wave 5 (Impl 13 must have flipped to `completed` before you start). The shared-file claim register in §5 will tell you whether anyone else is mid-edit. If it does, STOP.
5. Read every prior completion record in `IMPLEMENTATION_LOG.md` §5 — you need to summarise the rebuild for the final REBUILD COMPLETE record.
6. Read `docs/architecture/communication-architecture.md` end-to-end. This file is the source of truth for what the rebuild is supposed to look like; you will update its top-of-file status banner and append a "Historical: Build Order" appendix.
7. Read `docs/architecture/feature-map.md`'s Communications & Announcements section + Configuration section. Decide which row owns the new `communications.{view,manage}` permissions (Configuration owns the credentials surface; Communications owns the dispatch). Both rows update.
8. Confirm a local dev server stack runs cleanly:

```bash
pnpm --filter @school/api dev      # localhost:3001
pnpm --filter @school/worker dev   # tails BullMQ logs
pnpm --filter @school/web dev      # localhost:5551
```

If any service fails to start, that's a blocker — fix it before doing anything else.

9. Verify the test tenants seeded by Impl 13 are reachable:

```bash
psql $DATABASE_URL -c "
SELECT t.subdomain, tec.is_enabled AS email, tsc.is_enabled AS sms, twc.is_enabled AS whatsapp
FROM tenants t
LEFT JOIN tenant_email_configs tec ON tec.tenant_id = t.id
LEFT JOIN tenant_sms_configs tsc ON tsc.tenant_id = t.id
LEFT JOIN tenant_whatsapp_configs twc ON twc.tenant_id = t.id
WHERE t.subdomain IN ('nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d')
ORDER BY t.subdomain;
"
```

Expected: 5 rows × 3 `true` = 15 enabled configs. If any are NULL or `false`, Impl 13 did not finish — STOP and flag.

10. Check Rule 27b (Playwright lock). If the `[PLAYWRIGHT LOCK]` line in `IMPLEMENTATION_LOG.md` §5 is open without a release, STOP and wait. Impl 14 holds the lock for the bulk of its verification window — claim it cleanly.

---

## 3. What to change

### 3.1 `docs/architecture/feature-map.md` — UPDATE

The communications module's surface area expanded materially. Configuration gained a new sub-area (per-tenant comms credentials) and four new frontend pages. Several cross-cutting tables landed.

#### 3.1a Update the "Last verified" banner

Top of file:

```diff
-> **Last verified**: 2026-04-26 (Engagement module fix rebuild Waves 1–4 ...)
+> **Last verified**: 2026-04-27 (Communications Overhaul rebuild — Impls 01–14 shipped on the `communications-overhaul` worktree. New per-tenant credential model (3 channels × 8 endpoints each ≈ 25 new endpoints), 4 new frontend settings pages, 8 new tenant-scoped tables, 4 new BullMQ cron jobs, 2 new permissions. The `communications` module now consumes `configuration` for credential decryption and is consumed by `auth`, `trips`, `school-closures`, `staff-leave`, `health`, `sen`, and `finance` (post Impl 12 migration off direct DB writes). See `communicationnew/IMPLEMENTATION_LOG.md`.)
```

#### 3.1b Update the Quick Reference table

Two rows change. Find:

```
| [Communications & Announcements](#14-communications--announcements)        | `modules/communications/` | 20 | 9  | 7 |
```

Update the counts:

```
| [Communications & Announcements](#14-communications--announcements)        | `modules/communications/` | 39 | 13 | 11 |
```

Endpoints: +19 net (3 credential controllers × ~5 verbs each = 15 + 3 webhook routes + 5 domain endpoints + 4 template endpoints − a few that overlap with existing). Pages: +4 (`/settings/communications/{,email,sms,whatsapp}`). Worker jobs: +4 (`comms:domain-verification-refresh`, `comms:whatsapp-template-sync`, `comms:suppression-list-cleanup`, `comms:whatsapp-service-window-cleanup`).

Find the Configuration row (under "Platform & Settings"):

```
| [Configuration](#NN-configuration) | `modules/configuration/` | X | Y | Z |
```

Update by adding the three new credential controllers:

```
| [Configuration](#NN-configuration) | `modules/configuration/` | (X + 18) | (Y + 4) | Z |
```

Recount endpoints by inspecting the actual controllers — don't trust the +18 figure blindly. The credential CRUD pattern is GET / PUT / DELETE / POST `/test` per channel × 3 channels = 12 endpoints; plus `/v1/email-domains` (5 endpoints), `/v1/whatsapp-templates` (4 endpoints) → adjust to whatever the controllers actually expose post-Impl 09 and Impls 06–08.

#### 3.1c Expand the Communications & Announcements section

Locate the existing `## 14. Communications & Announcements` section. Below the existing endpoint listing, add a new sub-section:

```markdown
### 14a. Per-Tenant Communications Credentials & Operational Stack (Communications Overhaul)

> **Status**: Implemented in the `communications-overhaul` worktree. After merge to `main`, the per-tenant credential model is the only path to dispatch.

**Backend modules**:

- `apps/api/src/modules/configuration/email-config.{controller,service,spec}.ts`
- `apps/api/src/modules/configuration/sms-config.{controller,service,spec}.ts`
- `apps/api/src/modules/configuration/whatsapp-config.{controller,service,spec}.ts`
- `apps/api/src/modules/communications/webhooks/communications-webhooks.controller.ts`
- `apps/api/src/modules/communications/webhooks/{webhook-signature-verifier,resend-webhook-handler,twilio-webhook-handler}.service.ts`
- `apps/api/src/modules/communications/suppression/suppression-list.service.ts`
- `apps/api/src/modules/communications/deliverability/email-domain.{controller,service}.ts`
- `apps/api/src/modules/communications/whatsapp-templates/{whatsapp-template,whatsapp-service-window}.service.ts`
- `apps/api/src/modules/communications/comms-cache-bus.service.ts`
- `apps/api/src/modules/communications/comms-logger.service.ts`
- `apps/api/src/modules/communications/comms-metrics.service.ts`

**Endpoints** (added by this rebuild):

| Method | Path                                             | Permission                            |
| ------ | ------------------------------------------------ | ------------------------------------- |
| GET    | `/v1/email-config`                               | `configuration.communications.view`   |
| PUT    | `/v1/email-config`                               | `configuration.communications.manage` |
| DELETE | `/v1/email-config`                               | `configuration.communications.manage` |
| POST   | `/v1/email-config/test`                          | `configuration.communications.manage` |
| GET    | `/v1/sms-config`                                 | `configuration.communications.view`   |
| PUT    | `/v1/sms-config`                                 | `configuration.communications.manage` |
| DELETE | `/v1/sms-config`                                 | `configuration.communications.manage` |
| POST   | `/v1/sms-config/test`                            | `configuration.communications.manage` |
| GET    | `/v1/whatsapp-config`                            | `configuration.communications.view`   |
| PUT    | `/v1/whatsapp-config`                            | `configuration.communications.manage` |
| DELETE | `/v1/whatsapp-config`                            | `configuration.communications.manage` |
| POST   | `/v1/whatsapp-config/test`                       | `configuration.communications.manage` |
| POST   | `/v1/webhooks/communications/email/:tenantId`    | (signature verified)                  |
| POST   | `/v1/webhooks/communications/sms/:tenantId`      | (signature verified)                  |
| POST   | `/v1/webhooks/communications/whatsapp/:tenantId` | (signature verified)                  |
| GET    | `/v1/email-domains`                              | `configuration.communications.view`   |
| POST   | `/v1/email-domains`                              | `configuration.communications.manage` |
| GET    | `/v1/email-domains/:id`                          | `configuration.communications.view`   |
| POST   | `/v1/email-domains/:id/refresh`                  | `configuration.communications.manage` |
| DELETE | `/v1/email-domains/:id`                          | `configuration.communications.manage` |
| GET    | `/v1/whatsapp-templates`                         | `configuration.communications.view`   |
| POST   | `/v1/whatsapp-templates`                         | `configuration.communications.manage` |
| GET    | `/v1/whatsapp-templates/:id`                     | `configuration.communications.view`   |
| DELETE | `/v1/whatsapp-templates/:id`                     | `configuration.communications.manage` |

**Worker jobs** (added by this rebuild):

| Queue           | Job name                                | Schedule                 |
| --------------- | --------------------------------------- | ------------------------ |
| `notifications` | `comms:domain-verification-refresh`     | cron, every 30 min       |
| `notifications` | `comms:whatsapp-template-sync`          | cron, every 15 min       |
| `notifications` | `comms:suppression-list-cleanup`        | cron, daily at 03:00 UTC |
| `notifications` | `comms:whatsapp-service-window-cleanup` | cron, daily at 04:00 UTC |

**Frontend pages**:

- `apps/web/src/app/[locale]/(school)/settings/communications/page.tsx` — index with three channel cards
- `apps/web/src/app/[locale]/(school)/settings/communications/email/page.tsx` — Resend config + domain verification
- `apps/web/src/app/[locale]/(school)/settings/communications/sms/page.tsx` — Twilio SMS config
- `apps/web/src/app/[locale]/(school)/settings/communications/whatsapp/page.tsx` — Twilio WhatsApp config + template list

**Tables** (added by this rebuild — all tenant-scoped, all RLS-isolated):

- `tenant_email_configs` — encrypted Resend API key + from/reply-to + per-tenant webhook secret
- `tenant_sms_configs` — encrypted Twilio SID/token + from number + webhook secret
- `tenant_whatsapp_configs` — encrypted Twilio SID/token + WhatsApp from number + business profile + webhook secret
- `notification_suppression_list` — hard-bounce / complaint / manual / unsubscribe per channel per recipient
- `tenant_email_domains` — SPF/DKIM/DMARC verification per domain per tenant
- `whatsapp_templates` — local key + Twilio SID + approval status per tenant per template_key per language
- `whatsapp_service_windows` — last-inbound timestamp per recipient phone per tenant
- `notification_webhook_events` — append-only audit log of every webhook event

**Permissions** (added by this rebuild):

- `configuration.communications.view`
- `configuration.communications.manage`

Both granted to Owner + Principal by default. Backfilled by Impl 02 onto every existing role mapping for the five test tenants.

**Cross-module dependencies introduced**:

- `communications` module now consumes `configuration.{Email,Sms,WhatsApp}ConfigService.getDecryptedConfig` (internal-only) for tenant credential resolution.
- `auth`, `trips`, `school-closures`, `staff-leave`, `health`, `sen` modules consume `NotificationsService.dispatch` for the comms touchpoints they previously lacked (or, in finance's case, bypassed via direct DB write).
- `finance` module now flows through `NotificationsService.dispatch` for payment reminders (Impl 12 migrated `payment-reminders.service.ts:220` off the direct `notification` table write).
```

#### 3.1d Cross-link the Configuration section

In the Configuration section of `feature-map.md`, add a "Sub-areas" line that lists the three new credential surfaces and links forward to §14a:

```markdown
**Sub-areas**: Stripe (existing), per-tenant Communications credentials — see §14a for the full surface.
```

#### 3.1e Verify counts

After editing, run:

```bash
grep -c "POST\|GET\|PUT\|DELETE" docs/architecture/feature-map.md
```

The number should rise by approximately 24 (the new endpoints listed above). Don't over-pin this — the file has narrative HTTP-verb mentions outside the tables.

### 3.2 `docs/architecture/module-blast-radius.md` — UPDATE

The blast radius file is the safety net for "if I change X, what else breaks?". Several new edges land with this rebuild.

#### 3.2a Update the "Last verified" banner

```diff
-> **Last verified**: 2026-04-21 (wellbeing rebuild — Impl 24 Wave 7 sign-off)
+> **Last verified**: 2026-04-27 (Communications Overhaul rebuild — Impl 14 sign-off; new edges added: communications consumes configuration credential services, auth/trips/closures/leave/health/sen/finance now consume communications.NotificationsService, new CommsCacheBusModule cycle-breaker between configuration and communications)
```

#### 3.2b Add a new "Communications" entry under Tier 2

Place it alphabetically (after `Behaviour`, before `Engagement`):

```markdown
### Communications

- **Contract**: `NotificationsService.dispatch(tenantId, payload)`, `NotificationDispatchService` (internal), `Email/Sms/WhatsAppConfigService.getDecryptedConfig` (internal-only — never expose), `SuppressionListService.isSuppressed`, `EmailDomainService.getVerified`, `WhatsAppTemplateService.getApproved`, `WhatsAppServiceWindowService.isInWindow`, `CommsCacheBusService` (Redis pub/sub on `comms:config-changed`), `comms-metrics.service.ts` Prometheus emitters, `notification` table, `notification_template` table, `notification_suppression_list` table, `notification_webhook_events` table, `tenant_email_configs` / `tenant_sms_configs` / `tenant_whatsapp_configs` (read by getDecryptedConfig only), `tenant_email_domains` table, `whatsapp_templates` table, `whatsapp_service_windows` table.

- **Primary consumers**:
  - **API consumers of `NotificationsService.dispatch`**: attendance, behaviour, gradebook, homework, pastoral, safeguarding, engagement, parent-inquiries, finance (post Impl 12 migration), admissions, rbac (invitations), approvals, communications (announcements), inbox, auth (password reset/changed, post Impl 12), trips (post Impl 12), school-closures (post Impl 12), staff-leave (post Impl 12), health (post Impl 12), sen (post Impl 12).
  - **Worker consumers**: `dispatch-notifications.processor.ts`, `dispatch-queued.processor.ts`, `parent-daily-digest.processor.ts`, `behaviour/parent-notification.processor.ts`, `pastoral/escalation-timeout.processor.ts`, `safeguarding/critical-escalation.processor.ts`, `safeguarding/notify-reviewers.processor.ts`, `engagement/engagement-conference-reminders.processor.ts`, `homework/overdue-detection.processor.ts`, `behaviour/ack-reminders.processor.ts`.
  - **Cron consumers**: `comms:domain-verification-refresh` (Impl 07), `comms:whatsapp-template-sync` (Impl 08), `comms:suppression-list-cleanup` (Impl 06), `comms:whatsapp-service-window-cleanup` (Impl 08).

- **Direct dependencies (consumed by communications)**:
  - `EncryptionService` (configuration module) — encrypts/decrypts `*_encrypted` columns.
  - `EmailConfigService.getDecryptedConfig` (configuration module) — `ResendEmailProvider.dispatch` calls this every send. Tenants without a configured row → `notification.failure_reason='channel_not_configured'`.
  - `SmsConfigService.getDecryptedConfig` (configuration module) — analogous for Twilio SMS.
  - `WhatsAppConfigService.getDecryptedConfig` (configuration module) — analogous for Twilio WhatsApp.
  - `ConsentService` (consent module) — WhatsApp dispatch consults consent before send.
  - `AudienceResolutionService` (internal) — recipient resolution.
  - `TemplateRendererService` (internal) — Handlebars + EN/AR helpers.
  - `NotificationRateLimitService` (internal) — Redis sliding-window rate limit.
  - Redis (pub/sub for `comms:config-changed`, cache for suppression-list / verified-domain / unread-counts).

- **Blast radius if `NotificationsService.dispatch` signature changes**: CRITICAL.
  - Every module above will need a coordinated update.
  - Worker processors that build payloads in shared format also break.
  - Audit log shape change ripples to `AuditLogInterceptor` consumers (compliance reporting).

- **Blast radius if `Email/Sms/WhatsAppConfigService.getDecryptedConfig` signature changes**: HIGH.
  - The three `*Provider.dispatch` methods break immediately.
  - The webhook handlers that re-read tenant config to verify signatures break.
  - The verify endpoints (`POST /v1/{email,sms,whatsapp}-config/test`) break.

- **Blast radius if `notification` table schema changes**: HIGH.
  - Direct readers: `dispatch-notifications.processor.ts`, `notifications.service.ts`, `notification-templates.service.ts`, `inbox-bridge.service.ts`, `unsubscribe.service.ts`.
  - Webhook handlers update `status` / `provider_message_id` / `delivered_at` / `bounced_at` directly via Prisma.
  - Suppression-list addition uses `notification.id` as `notification_id` foreign key.

- **Blast radius if Redis pub/sub channel `comms:config-changed` payload shape changes**: HIGH.
  - Both the API process and every worker process subscribe. Stale clients held in cache after a credential rotation = silent failure (sends from rotated-old credentials until cache TTL expires or process restart).
  - **Mitigation**: payload shape is constant (`{ tenant_id: string, channel: 'email' | 'sms' | 'whatsapp' }`). Treat changes as breaking and bump the channel name (`comms:config-changed-v2`) instead of mutating in place.

- **Notes**:
  - The cycle-breaker `CommsCacheBusModule` was created by Impl 04 to avoid a `configuration` ↔ `communications` import cycle: both modules need to publish/subscribe on `comms:config-changed`, but `communications` consumes `configuration`. The bus module is provider-only and depends on `RedisModule`; both consumers import the bus.
  - `SuppressionListService.isSuppressed` is the gate every outbound dispatch consults. A bug here can either (a) silently let bounced addresses keep getting hit (sender reputation harm) or (b) suppress everyone (no email goes out). Cache TTL is 5 minutes — stale cache means at most 5 minutes of stale behaviour after a list change.
  - `EmailDomainService.getVerified` is the gate every outbound email consults for SPF/DKIM/DMARC verification. Tenants without a verified domain → `notification.failure_reason='sender_domain_unverified'`. The `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV` env flag bypasses the check in local dev only — production must never set it.
```

#### 3.2c Update the existing `Configuration` entry

If a Configuration entry exists, add the three new credential services to the Contract list:

- `EmailConfigService` (CRUD + `getDecryptedConfig` + `verifyConfig`)
- `SmsConfigService` (CRUD + `getDecryptedConfig` + `verifyConfig`)
- `WhatsAppConfigService` (CRUD + `getDecryptedConfig` + `verifyConfig`)

Note that `getDecryptedConfig` is **internal-only** — never exposed via controller. Only `ResendEmailProvider`, `TwilioSmsProvider`, `TwilioWhatsAppProvider`, and the webhook handler classes consume it.

#### 3.2d Add a forward edge from each newly consuming module

For each of `auth`, `trips`, `school-closures`, `staff-leave`, `health`, `sen`, `finance`: under their respective entries (or add them if missing), append a "consumes Communications" line. Each should read approximately:

```markdown
- **Consumes**: `NotificationsService.dispatch` for {use case} — wired by Impl 12 of the Communications Overhaul rebuild.
```

For `finance`, also annotate that `payment-reminders.service.ts:220` no longer writes to the `notification` table directly:

```markdown
- **Note**: prior to Impl 12 of the Communications Overhaul rebuild, `payment-reminders.service.ts:220` wrote rows directly into the `notification` table. This was a danger-zone — bypassed rate limits, audit logs, and consent. Now uses `NotificationsService.dispatch`.
```

### 3.3 `docs/architecture/danger-zones.md` — UPDATE

Add six new entries to the file. Append them at the end with consecutive `DZ-NN` numbers (find the highest existing `DZ-NN` and increment).

#### DZ-NN: Tenant Credential Cache Coherence

```markdown
## DZ-NN: Tenant Credential Cache Coherence — Redis Pub/Sub Required

**Risk**: Stale provider clients used after a tenant rotates credentials, silently sending mail from revoked Resend / Twilio keys.
**Location**: `apps/api/src/modules/communications/comms-cache-bus.service.ts`, `apps/api/src/modules/communications/providers/per-tenant-client-cache.ts`, the worker's mirror of both
**Status**: ACTIVE

The provider classes maintain a per-process `Map<tenant_id, ProviderClient>` cache to avoid re-instantiating Resend/Twilio clients on every dispatch. To stay coherent across the API process and every worker process, every credential mutation publishes `{ tenant_id, channel }` on the Redis pub/sub channel `comms:config-changed`. Both the API and the worker subscribe and call `cache.invalidate(tenant_id)` on receipt.

**Failure mode**: if Redis is unhealthy at the moment of a credential rotation, the publish silently no-ops (or the subscribe silently misses the event). The cache TTL (30-min idle eviction) eventually evicts the stale client, but for up to 30 minutes the API/worker keeps using the old credentials. From the tenant's perspective: "I rotated my Resend key but emails are still going through" — a confusing safety regression.

**Mitigations**:

1. The `CommsCacheBusService` logs every publish + receive with `tenant_id` + `channel` at INFO level. After a credential rotation, the operator can grep worker logs for the publish/receive pair to confirm propagation.
2. Manual invalidation: `pm2 restart api worker` clears every per-process cache.
3. The worker also re-reads `is_enabled` per notification (not once per batch — see DZ-NN+1) which catches "tenant disabled the channel" within at most one notification's worth of staleness.
4. Monitoring: Prometheus counter `notifications_dispatched_total{channel, status}` should drop sharply for the affected tenant within seconds of a cache invalidation if their old credentials are revoked. Lack of a drop = cache didn't invalidate; investigate Redis pub/sub.

**Where to look first when something goes wrong**: Redis health (`redis-cli ping`), worker logs filtered by `comms:config-changed`, and the per-tenant client cache eviction events in the API logs.
```

#### DZ-NN+1: Mid-flight `is_enabled` flip drops in-batch sends

```markdown
## DZ-NN+1: Mid-Flight `is_enabled` Flip Drops In-Batch Sends

**Risk**: A batch of N notifications is partially dispatched when a tenant disables a channel — some land, some are marked `failed:channel_disabled`. The "some land" half can confuse the user into thinking nothing was disabled.
**Location**: `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`
**Status**: ACTIVE — by design

The dispatch worker batches up to 100 notification rows per tenant per tick. Inside the batch, every row re-reads `is_enabled` from the per-tenant config (NOT once per batch — Impl 05 explicitly closed that gap). If a tenant flips `is_enabled = false` at a moment when 30 of a 100-row batch have already dispatched, the next 70 rows mark `failed:channel_disabled`.

**Why this is the right behaviour**: re-reading per-batch (the alternative) would force the worker to either (a) abort the entire batch on any change — which loses the 30 already-dispatched rows' acknowledgment, or (b) continue using the stale read — which is the failure mode we're trying to avoid. Per-row re-read is the only correct compromise.

**Failure mode**: user disables a channel mid-announcement and observes "30 of 100 parents got the email; 70 didn't." The 70 are marked `failed:channel_disabled` in the `notification` table; the announcement audit log shows the partial dispatch.

**Mitigations**:

1. The frontend `(school)/settings/communications/{email,sms,whatsapp}/page.tsx` should warn when disabling a channel that there may be in-flight dispatches. (Impl 11 polish: optional toast.)
2. Operations runbook `comms-tenant-dispatch-failures.md` documents this as expected behaviour and walks through how to identify partial-dispatch incidents.
3. The `notification` table has `failure_reason='channel_disabled'`; the dashboard surfaces the count.

**Where to look first when something goes wrong**: Filter `notification` rows by `tenant_id`, `failure_reason='channel_disabled'`, and the timestamp window of the disable event. Compare against the `audit_log` event for the `tenant_*_config.update` action with `is_enabled` going false.
```

#### DZ-NN+2: Webhook signature trust depends on `webhook_secret` being set

````markdown
## DZ-NN+2: Webhook Signature Trust Depends on Per-Tenant `webhook_secret`

**Risk**: A tenant whose `webhook_secret` is missing/null has every webhook event rejected. Notification statuses for that tenant never advance past `sent` — bounces, complaints, deliveries are never reflected.
**Location**: `apps/api/src/modules/communications/webhooks/webhook-signature-verifier.service.ts`, `apps/api/src/modules/communications/webhooks/communications-webhooks.controller.ts`
**Status**: ACTIVE

Every inbound webhook on `POST /v1/webhooks/communications/{email,sms,whatsapp}/:tenantId` verifies the per-tenant signature against the tenant's `webhook_secret_encrypted` column. If the secret is missing, the verifier fails closed (returns 401, writes `notification_webhook_events` with `signature_verified=false`).

**Why this is the right behaviour**: webhooks are public endpoints. Trusting unsigned bodies would let an attacker mark every notification as `delivered`/`bounced` for any tenant. The fail-closed posture is non-negotiable.

**Failure mode**: a tenant onboarded without a `webhook_secret` (e.g. partial Impl 13 backfill, or a manual platform-admin row insert that skipped the field) → every webhook event for that tenant is logged as `signature_verified=false` and dropped. From the tenant's perspective, all their emails show `status=sent` forever, never advancing to `delivered` / `bounced`.

**Mitigations**:

1. The Zod schema on `upsertEmailConfigSchema` / `upsertSmsConfigSchema` / `upsertWhatsAppConfigSchema` requires `webhook_secret` — any new tenant config gets one (Impl 03 enforced this).
2. Impl 13's backfill script populates `webhook_secret_encrypted` for all five test tenants.
3. The runbook `comms-webhook-debugging.md` includes the SQL query to find tenants whose `webhook_secret` is null:

```sql
SELECT t.subdomain, tec.id IS NOT NULL AS has_email_config,
       tec.webhook_secret_encrypted IS NULL AS missing_email_secret,
       tsc.webhook_secret_encrypted IS NULL AS missing_sms_secret,
       twc.webhook_secret_encrypted IS NULL AS missing_whatsapp_secret
FROM tenants t
LEFT JOIN tenant_email_configs tec ON tec.tenant_id = t.id
LEFT JOIN tenant_sms_configs tsc ON tsc.tenant_id = t.id
LEFT JOIN tenant_whatsapp_configs twc ON twc.tenant_id = t.id;
```
````

4. Monitoring: alert when `notifications_webhook_received_total{signature_valid="false"}` exceeds 1% of total webhook ingest for any tenant over a 1-hour window — likely a signing-secret mismatch.

**Where to look first when something goes wrong**: `notification_webhook_events` filtered by `tenant_id`, ordered by `received_at DESC`, with `signature_verified=false`. If every recent event for a tenant has `signature_verified=false`, the secret is wrong (or missing). Cross-check against the provider dashboard for the actual signing secret.

````

#### DZ-NN+3: Suppression list growth

```markdown
## DZ-NN+3: Suppression List Unbounded Growth

**Risk**: `notification_suppression_list` accumulates rows over time. Hard bounces and complaints are permanent until manually cleared (no UI for that yet — V2). For a tenant with high recipient churn, the table can grow to hundreds of thousands of rows, slowing every outbound dispatch (each consults the list) and increasing Postgres storage.
**Location**: `apps/api/src/modules/communications/suppression/suppression-list.service.ts`, `apps/worker/src/processors/communications/suppression-list-cleanup.processor.ts`
**Status**: ACTIVE

The `comms:suppression-list-cleanup` cron runs daily at 03:00 UTC and expires soft-bounce rows older than 30 days. Hard bounces, complaints, manual blocks, and unsubscribes are NEVER auto-expired — they're permanent until cleared via a future admin UI (out of scope V1).

**Failure mode**: a tenant with 10,000 recipients × monthly emails × 2% hard bounce rate over a year = ~2,400 permanent rows. With many channels and several years, a single tenant could exceed 50k rows. The Redis cache (5-minute TTL keyed on `(tenant_id, channel, recipient_address)`) hides most of the perf cost, but cold-cache lookups on a large list are slow.

**Mitigations**:

1. Index `idx_suppression_tenant_channel_expiry` (already created in Impl 01) makes the lookup O(log n) regardless of size.
2. Redis cache hides the perf for hot recipients.
3. Monitoring: alert when any tenant's row count in `notification_suppression_list` exceeds 100,000. Investigation may reveal a mailing list issue (e.g. a corrupt CSV import) rather than expected churn.
4. V2 will ship a manual-clear admin UI; until then, ad hoc SQL is the recovery path.

**Where to look first when something goes wrong**: SQL row count per tenant + per channel. If a single tenant dominates, look at their bounce rate (hint: their sender reputation is probably already damaged — investigate their domain verification status and recent send history).
````

#### DZ-NN+4: WhatsApp service window staleness

```markdown
## DZ-NN+4: WhatsApp Service Window Staleness

**Risk**: If the inbound WhatsApp webhook fails to update `whatsapp_service_windows.last_inbound_at`, outbound free-form sends (which would otherwise be allowed within the 24-hour window) get rejected by Twilio because Twilio's view of the window doesn't match ours.
**Location**: `apps/api/src/modules/communications/whatsapp-templates/whatsapp-service-window.service.ts`, `apps/api/src/modules/communications/webhooks/twilio-webhook-handler.service.ts`
**Status**: ACTIVE

Twilio's WhatsApp Business policy enforces a 24-hour service window from the recipient's last inbound message. Within the window, free-form sends are allowed; outside, only pre-approved templates are. We mirror this state in `whatsapp_service_windows` so the worker can refuse to attempt out-of-window free-form sends without burning a Twilio API call.

**Failure mode**: Twilio sends an inbound webhook → our endpoint fails signature verification (e.g. tenant rotated their auth token without updating the webhook signature) → we return 401 → Twilio retries a few times then drops → our `whatsapp_service_windows` row never updates. The next outbound free-form send checks the table, sees `expires_at < now()`, and refuses with `failure_reason='outside_service_window_no_template'`. Twilio's view says the window is open. The tenant sees "WhatsApp says my window is open but the platform won't send."

**Mitigations**:

1. Webhook signature failures are surfaced via the `notifications_webhook_received_total{signature_valid="false"}` Prometheus counter. Per-tenant elevation is investigated.
2. The `notification_webhook_events` table preserves every event payload; a failed signature can be retroactively replayed once the secret is fixed (operator action).
3. The runbook `comms-webhook-debugging.md` includes a SQL query to find recent inbound WhatsApp webhooks per tenant and verify their signature status.
4. Outbound retry policy: a `failed:outside_service_window_no_template` row can be re-attempted after the next inbound webhook lands — the dispatch service handles this.

**Where to look first when something goes wrong**: Filter `notification_webhook_events` by `tenant_id`, `channel='whatsapp'`, `event_type` matching inbound, `signature_verified=false`. Cross-check against `whatsapp_service_windows.last_inbound_at` — if the timestamp lags real Twilio inbound, signatures aren't being verified.
```

#### DZ-NN+5: `.env` Credential Removal Is One-Way

````markdown
## DZ-NN+5: `.env` Credential Removal Is One-Way (Post Impl 05)

**Risk**: Reverting Impl 05 is the only way to restore the `.env`-fallback dispatch path. After Impl 05, the env vars `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` are removed from env validation — re-adding them does nothing because the providers no longer read them.
**Location**: `apps/api/src/modules/communications/providers/{resend-email,twilio-sms,twilio-whatsapp}.provider.ts`, `apps/api/src/config/env.validation.ts`
**Status**: ACTIVE — by design

Pre-rebuild, every tenant shared the platform's Resend/Twilio credentials read from `.env`. Post-Impl-05, providers read tenant config first; there is no fallback. If a tenant has no config row, the provider returns `{ skipped: true, reason: 'channel_not_configured' }` and the notification is marked `failed:channel_not_configured`.

**Why this is correct**: a `.env` fallback would mean tenants without configs send from the platform's shared credentials, which is exactly the security/deliverability disaster the rebuild eliminates.

**Failure mode**: in a rollback scenario where the user wants to "temporarily fall back to the old single-tenant behaviour," they cannot — the providers won't read env vars even if they're present. The only path to send is to populate tenant config tables (or `git revert` Impl 05 entirely).

**Mitigations**:

1. The completion record for Impl 05 in `IMPLEMENTATION_LOG.md` §5 includes the exact `git revert` SHA + manual env-var restoration steps.
2. The production cutover script (`communicationnew/cutover/production-cutover.sh`) pre-populates tenant config rows for all production tenants before the merge, so the cutover is one atomic step and rollback is a `git revert + restart`, not a config migration.

**Where to look first when something goes wrong**: confirm tenant config rows exist:

```sql
SELECT t.subdomain,
       tec.id IS NOT NULL AS email_configured,
       tsc.id IS NOT NULL AS sms_configured,
       twc.id IS NOT NULL AS whatsapp_configured
FROM tenants t
LEFT JOIN tenant_email_configs tec ON tec.tenant_id = t.id
LEFT JOIN tenant_sms_configs tsc ON tsc.tenant_id = t.id
LEFT JOIN tenant_whatsapp_configs twc ON twc.tenant_id = t.id;
```
````

Any tenant with `_configured=false` for a channel they expect to use is the cause.

````

### 3.4 `docs/architecture/state-machines.md` — UPDATE

The rebuild extends the existing `notification.status` machine and adds two new ones for the operational tables.

#### 3.4a Update the "Last verified" banner

```diff
-> **Last verified**: 2026-04-21 (wellbeing rebuild — Impl 24 Wave 7 sign-off — no new state machines introduced; ...)
+> **Last verified**: 2026-04-27 (Communications Overhaul rebuild — Impl 14 sign-off; extended notification.status with bounced/complained/delivered terminal states driven by webhook ingestion, added whatsapp_template.status and tenant_email_domain.status machines.)
````

#### 3.4b Extend or add the `NotificationStatus` entry

If the file already has a `NotificationStatus` section, replace it with the version below. If not, add it under "Communications Lifecycles" (create the section if missing).

```markdown
### NotificationStatus (extended by Impl 06)
```

queued -> [sent, failed]
sent -> [delivered, bounced, complained, failed]
delivered -> [read]
read*
bounced*
complained\*
failed -> [queued] // retryable, within max_attempts

```

- **Guarded by**: `apps/api/src/modules/communications/notifications.service.ts` + `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` + the webhook handlers in `apps/api/src/modules/communications/webhooks/`.
- **Side effects**:
  - `queued -> sent`: provider `messages.create` (or `emails.send`) returns success; `provider_message_id` populated; `last_attempt_at` updated.
  - `sent -> delivered`: webhook event `email.delivered` (Resend) or `MessageStatus=delivered` (Twilio). Sets `delivered_at`.
  - `sent -> bounced`: webhook event `email.bounced` with `bounce_type='hard'`. Adds row to `notification_suppression_list` with `reason='hard_bounce'`. Terminal.
  - `sent -> complained`: webhook event `email.complained`. Adds row to `notification_suppression_list` with `reason='complaint'`. Terminal.
  - `sent -> failed`: webhook event `MessageStatus=failed` or `MessageStatus=undelivered`. Increments `attempts`; if below `max_attempts`, queues for retry → transitions back to `queued` via the retry processor.
  - `queued -> failed`: dispatch attempt threw / was skipped (e.g. `channel_not_configured`, `channel_disabled`, `suppressed`, `outside_service_window_no_template`, `sender_domain_unverified`). Sets `failure_reason`.
  - `delivered -> read`: in-app inbox mark-as-read, or email tracker pixel (out of scope V1).
  - `failed -> queued`: retry processor (`retry-failed.processor.ts`) re-enqueues with exponential backoff `60_000 × 2^attempts` ms.
- **Failure reasons** (set on `failed`):
  - `channel_not_configured` — tenant has no config row for the channel.
  - `channel_disabled` — tenant disabled the channel (`is_enabled=false`); detected mid-flight.
  - `suppressed:hard_bounce`, `suppressed:complaint`, `suppressed:manual`, `suppressed:unsubscribe`, `suppressed:soft_bounce_threshold` — recipient on suppression list.
  - `outside_service_window_no_template` — WhatsApp send outside 24h window with no `template_key`.
  - `sender_domain_unverified` — Resend send from an unverified domain.
  - `provider_error:<verbatim>` — provider returned an unhandled error.
- **Note**: terminal states (`read`, `bounced`, `complained`) cannot transition back. `failed` is non-terminal because retries cycle through `queued`. The `chain_id` UUID is preserved across all retries so the fallback chain can identify them as related.
```

#### 3.4c Add the `WhatsAppTemplateStatus` entry

```markdown
### WhatsAppTemplateStatus (Impl 08)
```

pending -> [submitted]
submitted -> [approved, rejected]
approved -> [paused]
rejected\*
paused -> [approved]

```

- **Guarded by**: `apps/api/src/modules/communications/whatsapp-templates/whatsapp-template.service.ts`.
- **Side effects**:
  - `pending -> submitted`: tenant clicks "Submit for approval" in the settings UI. POSTs to Twilio Content API; on accept, sets `submitted_at`; on Twilio reject, throws (state stays `pending`).
  - `submitted -> approved`: cron `comms:whatsapp-template-sync` (every 15 min) polls Twilio; status comes back `approved`. Stores `twilio_template_sid`. Sets `approved_at`. Dispatches in-app notification to the user who submitted the template.
  - `submitted -> rejected`: same cron path; status comes back `rejected`. Stores `approval_message` with the verbatim rejection reason. Dispatches in-app notification. Terminal — user must clone-and-resubmit (creates a new pending row).
  - `approved -> paused`: Twilio paused the template (rate limit, abuse signal, etc.). Cron detects and updates. Outbound sends using this template are blocked while paused.
  - `paused -> approved`: cron detects re-activation. Outbound sends using this template are unblocked.
- **Note**: only `approved` templates are eligible for outbound sends outside the 24-hour service window. Inside the window, free-form sends do not consult this table.
```

#### 3.4d Add the `EmailDomainStatus` entry

```markdown
### EmailDomainStatus (Impl 07)
```

pending -> [verified, failed]
verified -> [pending] // re-register if DNS records were edited
failed -> [pending] // re-register if DNS records were edited

```

- **Guarded by**: `apps/api/src/modules/communications/deliverability/email-domain.service.ts` + `apps/worker/src/processors/communications/domain-verification-refresh.processor.ts`.
- **Side effects**:
  - `pending -> verified`: cron `comms:domain-verification-refresh` (every 30 min) polls Resend; all three of SPF / DKIM / DMARC return `verified`. Sets `verified_at`. Dispatches in-app notification to the user who registered the domain.
  - `pending -> failed`: same cron path; one or more of SPF / DKIM / DMARC return `failed`. Sets `failure_reason` with the verbatim Resend error. Continues polling — a tenant can fix DNS records and the next poll will flip the row to verified.
  - `verified -> pending` (re-register): tenant calls `POST /v1/email-domains/:id/refresh` after editing DNS records. Resets per-record statuses and `last_checked_at`.
  - `failed -> pending` (re-register): same as above.
- **Note**: outbound dispatch enforces verified-domain status. Sends from an unverified or failed domain are skipped with `failure_reason='sender_domain_unverified'`. The `COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV` env flag bypasses the check in local dev only — production must never set it.
```

### 3.5 `docs/architecture/event-job-catalog.md` — UPDATE

#### 3.5a Update the "Last verified" banner

```diff
-> **Last verified**: 2026-04-21 (wellbeing rebuild — Impl 24 Wave 7 sign-off)
+> **Last verified**: 2026-04-27 (Communications Overhaul rebuild — Impl 14 sign-off; added 4 cron jobs in `notifications` queue, documented inbound webhook flow + Redis pub/sub for tenant credential cache invalidation)
```

#### 3.5b Update the worker surface counts

Find:

```
- **Repeatable cron registrations**: `39` repeatable jobs registered in ...
```

Update to `43` (added: domain-verification-refresh, whatsapp-template-sync, suppression-list-cleanup, whatsapp-service-window-cleanup).

#### 3.5c Add the new cron jobs under the `notifications` queue section

Find the existing `### notifications` section under "Repeatable Jobs Registered In CronSchedulerService". Append:

```markdown
- `comms:domain-verification-refresh` -> every `30 min` — cross-tenant; iterates `tenant_email_domains` rows with `status='pending'`, calls Resend's `domains.get`, updates SPF/DKIM/DMARC status, flips to `verified` on all-three-green. Owns: `domain-verification-refresh.processor.ts`. Payload: `{}`. Removes on complete: 10. Removes on fail: 50. (Impl 07)
- `comms:whatsapp-template-sync` -> every `15 min` — cross-tenant; iterates `whatsapp_templates` rows with `status='submitted'`, calls Twilio Content API, updates status + `twilio_template_sid`. Owns: `whatsapp-template-sync.processor.ts`. Payload: `{}`. (Impl 08)
- `comms:suppression-list-cleanup` -> daily `03:00 UTC` — cross-tenant; deletes soft-bounce rows older than 30 days from `notification_suppression_list`. Hard bounces / complaints / manual / unsubscribes are NEVER deleted (DZ-NN+3). Owns: `suppression-list-cleanup.processor.ts`. Payload: `{}`. (Impl 06)
- `comms:whatsapp-service-window-cleanup` -> daily `04:00 UTC` — cross-tenant; deletes `whatsapp_service_windows` rows where `expires_at < now() - 7 days`. (Impl 08)
```

#### 3.5d Add a new "Webhook Ingestion Flow" section

Place it after the cron-jobs catalog and before the closing sections:

````markdown
## Inbound Webhook Flow (Impl 06)

Three new public endpoints receive provider events and update notification status. **Per-tenant signature verification is mandatory** (DZ-NN+2).

### Routes

- `POST /v1/webhooks/communications/email/:tenantId` — Resend events.
- `POST /v1/webhooks/communications/sms/:tenantId` — Twilio status callback (SMS).
- `POST /v1/webhooks/communications/whatsapp/:tenantId` — Twilio status callback (WhatsApp).

### Flow per request

1. Lookup tenant config row by `:tenantId` path param. Decrypt `webhook_secret_encrypted`.
2. Verify signature: Resend uses `Svix-Signature` (HMAC-SHA256 of `{svix_id}.{svix_timestamp}.{body}`). Twilio uses `X-Twilio-Signature` (HMAC-SHA1 of URL + sorted form params, signed with the tenant's `twilio_auth_token`). On signature failure: write `notification_webhook_events` with `signature_verified=false`, return 401.
3. On success: write `notification_webhook_events` with `signature_verified=true`, full payload preserved as JSON.
4. Resolve the matching `notification` row by `provider_message_id` (Resend `email_id` / Twilio `MessageSid`). If no match: log + return 200 (event preserved for replay).
5. Update `notification.status` per the event type (see `notification.status` state machine in `state-machines.md`).
6. On hard bounce or complaint: insert row into `notification_suppression_list` with `reason='hard_bounce'` or `reason='complaint'`. Future sends to this recipient are skipped.
7. For WhatsApp inbound: also update `whatsapp_service_windows.last_inbound_at = now()` and `expires_at = now() + 24h`.

### Failure modes

- Missing `webhook_secret`: every event for the tenant is rejected. See DZ-NN+2.
- Provider signature mismatch (e.g. tenant rotated their auth token without updating the webhook secret): events queue up in `notification_webhook_events` with `signature_verified=false` and never advance the matching `notification.status`. Operator can replay once the secret is fixed.
- Notification not found: event preserved in `notification_webhook_events` for forensics. Status update is skipped.

## Cache Invalidation Pub/Sub (Impl 04)

`CommsCacheBusService` wraps a Redis pub/sub channel `comms:config-changed` with a fixed payload shape:

```json
{ "tenant_id": "<uuid>", "channel": "email" | "sms" | "whatsapp" }
```
````

### Publishers

- `EmailConfigService.upsertConfig` / `deleteConfig`
- `SmsConfigService.upsertConfig` / `deleteConfig`
- `WhatsAppConfigService.upsertConfig` / `deleteConfig`

### Subscribers (one per process)

- API process — invalidates the per-tenant client cache held inside `ResendEmailProvider`, `TwilioSmsProvider`, `TwilioWhatsAppProvider`.
- Worker processes — same; the worker mirrors the providers.

### Failure modes

If Redis is unhealthy at the moment of a credential rotation, the publish silently no-ops. The cache TTL (30-min idle eviction) eventually evicts the stale client. See DZ-NN.

````

### 3.6 `docs/architecture/communication-architecture.md` — UPDATE

This is the source-of-truth architecture file. Two surgical changes:

#### 3.6a Update the status banner at the top

```diff
-> **Status**: Dispatch infrastructure is fully built. Per-tenant credentials, webhooks, deliverability, WhatsApp templates, and the operational layer are NOT YET implemented. The 14-implementation overhaul tracked in `communicationnew/PLAN.md` ports ...
+> **Status**: **Implementation complete** (per `communicationnew/IMPLEMENTATION_LOG.md`). All 14 implementations shipped to the `communications-overhaul` worktree. Per-tenant credentials live; webhooks land status updates; email domain verification + WhatsApp template lifecycle + 24-hour service window enforced; suppression list active; observability layer (Sentry tags + structured logging + Prometheus + Grafana + runbooks) deployed. The five test tenants (NHQS + stress-a/b/c/d) are seeded with channel-specific dev credentials. Pending: user merges the worktree onto `main` and runs `communicationnew/cutover/production-cutover.sh` for production tenant credential provisioning.
````

```diff
-> **Last verified**: 2026-04-27
+> **Last verified**: 2026-04-27 (post-rebuild — Impl 14 sign-off)
```

#### 3.6b Move §4 Build Order to a "Historical: Build Order" appendix

The §4 "Build Order — 14 Implementations" section is now historical. Move it to the bottom of the file, renamed:

```markdown
## Appendix A: Historical — Build Order (14 Implementations)

The rebuild was tracked in `communicationnew/PLAN.md` and `communicationnew/IMPLEMENTATION_LOG.md`. Each implementation ran in the dedicated `communications-overhaul` worktree. **No CI deployment** — local dev server testing only. The user merged the worktree to `main` after Impl 14 completed.

| #   | Title                                                           | Wave | Completion |
| --- | --------------------------------------------------------------- | ---- | ---------- |
| 01  | Schema + migration + RLS (8 new tables)                         | 1    | <SHA>      |
| 02  | Permissions + RBAC + role backfill on test tenants              | 1    | <SHA>      |
| 03  | Zod schemas + 3 services + 3 controllers + comprehensive tests  | 2    | <SHA>      |
| 04  | Provider refactor + per-tenant client cache + Redis pub/sub     | 3    | <SHA>      |
| 05  | Worker parity + `.env` removal + mid-flight enforcement         | 3    | <SHA>      |
| 06  | Webhooks + signature verification + suppression list            | 3    | <SHA>      |
| 07  | Email deliverability — domain verification + DNS                | 3    | <SHA>      |
| 08  | WhatsApp templates + approval sync + 24-hour window             | 3    | <SHA>      |
| 09  | `verifyConfig` + test endpoints with full semantics             | 3    | <SHA>      |
| 10  | Operational layer — Sentry + logging + metrics + runbooks       | 3    | <SHA>      |
| 11  | Frontend Settings UI                                            | 4    | <SHA>      |
| 12  | Module gap closure + cleanups                                   | 4    | <SHA>      |
| 13  | Tenant backfill (5 test tenants × 3 channels) in dev DB         | 5    | <SHA>      |
| 14  | Architecture docs + comprehensive E2E verification on local dev | 5    | <SHA>      |
```

Backfill the `<SHA>` column from each impl's completion record in `IMPLEMENTATION_LOG.md` §5.

#### 3.6c Spot-check accuracy of §3 (the target state)

Read §3 end-to-end. Confirm every statement matches the post-rebuild code:

- **§3.1 Encryption Foundation** — verify `EncryptionService.encrypt/decrypt/mask` signatures match what Impl 03 actually wrote.
- **§3.2 Database Schema** — verify the Prisma model definitions match the actual `schema.prisma` post Impl 01 (column names, enums, indexes).
- **§3.4 Migration Order** — confirm the migration name `add_tenant_communication_configs_and_operational_tables` is the actual directory name on disk.
- **§3.5 API Layer** — confirm the controller routes and Zod schema field names match.
- **§3.6 Provider Refactor** — confirm the dispatch flow matches what Impls 04 + 05 + 06 + 07 + 08 wired.
- **§3.7 Webhooks** — confirm the event-handling rules match Impl 06.
- **§3.8 Email Deliverability** — confirm Impl 07 matches.
- **§3.9 WhatsApp** — confirm Impl 08 matches.
- **§3.10 Verify / Test Send** — confirm Impl 09 matches.
- **§3.11 Frontend** — confirm Impl 11 matches the file paths in `(school)/settings/communications/`.
- **§3.12 Operational Layer** — confirm Impl 10 matches.

Any drift between this doc and the actual code → fix the doc to match the code (the code is the source of truth at this point). Don't fix code to match the doc — the doc was a target spec, not a runtime contract.

### 3.7 Comprehensive Playwright E2E Walkthrough — `http://localhost:5551`

This is the largest single deliverable of Impl 14.

#### 3.7a Pre-walkthrough setup

1. Spin up the local dev stack (per §2 step 8):

```bash
pnpm --filter @school/api dev
pnpm --filter @school/worker dev
pnpm --filter @school/web dev
```

Tail all three logs in separate terminals.

2. Verify the API is serving:

```bash
curl -s http://localhost:3001/api/v1/health
# expect 200 with {"status":"ok"}
```

3. Verify the test-tenant configs are populated:

```bash
psql $DATABASE_URL -tA -c "SELECT COUNT(*) FROM tenant_email_configs;"
psql $DATABASE_URL -tA -c "SELECT COUNT(*) FROM tenant_sms_configs;"
psql $DATABASE_URL -tA -c "SELECT COUNT(*) FROM tenant_whatsapp_configs;"
# expect 5, 5, 5 (Impl 13 backfill)
```

4. Claim the Playwright lock per Rule 27b. Append to `IMPLEMENTATION_LOG.md` §5:

```
### [PLAYWRIGHT LOCK] — verification-walkthrough (Impl 14)
- Holder: Impl 14 final E2E verification
- Started: 2026-04-27T<HH:MM>:00+01:00
- Until: released by closing the browser AND appending a follow-up release line
```

#### 3.7b Per-tenant walkthrough (5 tenants × 3 channels)

For each tenant from this list, perform the full flow. Test credentials per `MEMORY.md`:

| Tenant slug | Login email           | Password          |
| ----------- | --------------------- | ----------------- |
| `nhqs`      | `owner@nhqs.test`     | `Password123!`    |
| `stress-a`  | `owner@stress-a.test` | `StressTest2026!` |
| `stress-b`  | `owner@stress-b.test` | `StressTest2026!` |
| `stress-c`  | `owner@stress-c.test` | `StressTest2026!` |
| `stress-d`  | `owner@stress-d.test` | `StressTest2026!` |

Steps for each tenant (target ~3 minutes per tenant; total ~15 minutes for the 5):

1. **Login** — `mcp__plugin_playwright_playwright__browser_navigate` to `http://localhost:5551/en/auth/login`. Fill `email` + `password`. Submit. Assert redirect to `/en` (or the tenant's home).
2. **Navigate to settings** — `browser_navigate` to `http://localhost:5551/en/settings/communications`. Assert all three channel cards visible and each shows status "Configured" (green badge). If any card shows "Not configured" → Impl 13 backfill incomplete; STOP and surface a blocker.
3. **Email channel:**
   - `browser_navigate` to `/en/settings/communications/email`.
   - Assert masked credentials display (e.g. `••••••••••••XXXX` where XXXX is the last 4 of the test API key).
   - Click "Send test message" → modal opens → enter recipient `qa-test@example.invalid` → click Send.
   - Assert response surfaces a verbatim provider error (since the test domain is intentionally invalid in a way that Resend rejects with a meaningful 4xx) — accept either a success path with a sentinel `provider_message_id` OR a documented failure path with a verbatim Resend error in the toast. Both prove the flow is wired end-to-end.
   - Assert `last_verified_at` updates on success (refresh the page; the timestamp should be within the last minute). On verbatim-error path, this stays stale — that's expected.
4. **SMS channel:**
   - `browser_navigate` to `/en/settings/communications/sms`.
   - Assert masked credentials display.
   - Click "Send test message" → enter recipient `+15555550100` (a Twilio test number) → click Send.
   - Assert success toast OR verbatim Twilio error. Either is acceptable proof of wiring.
   - Assert `last_verified_at` updates on success.
5. **WhatsApp channel:**
   - `browser_navigate` to `/en/settings/communications/whatsapp`.
   - Assert masked credentials display.
   - Assert template list section visible (may be empty for backfilled tenants — that's fine).
   - Click "Send test message" → enter recipient `+15555550100`, template_key `comms.verify` → click Send.
   - Assert the `outside_service_window_no_template` rejection if the tenant's test number isn't in window, OR a success path. Both prove wiring.
   - Test the "Submit new template" form: enter template_key `e2e_test_template`, language_code `en`, category `utility`, body "Hello from EduPod {{1}}". Submit. Assert the row appears in the template list with status `submitted`.
6. **Trigger an actual notification dispatch:**
   - `browser_navigate` to `/en/communications/announcements/new` (or whatever route exists for creating an announcement).
   - Create a test announcement with recipient scope "school" — keep the audience small (e.g. just the owner user).
   - Submit and publish.
   - Wait ~30 seconds for the worker to dispatch.
   - In a separate terminal:

```bash
psql $DATABASE_URL -tA -c "
SELECT id, channel, status, provider_message_id, failure_reason
FROM notification
WHERE tenant_id = (SELECT id FROM tenants WHERE subdomain = '<TENANT_SLUG>')
  AND created_at > now() - interval '5 minutes'
ORDER BY created_at DESC LIMIT 10;
"
```

- Assert at least one row with `provider_message_id IS NOT NULL` per non-in-app channel.

7. **Webhook simulation:**
   - In a separate terminal, simulate a Resend `email.delivered` webhook for the just-dispatched email. Use the tenant's webhook_secret from the DB:

```bash
SECRET=$(psql $DATABASE_URL -tA -c "
SELECT pgp_sym_decrypt(webhook_secret_encrypted::bytea, '<key>')
FROM tenant_email_configs
WHERE tenant_id = (SELECT id FROM tenants WHERE subdomain = '<TENANT_SLUG>');
")
TENANT_ID=$(psql $DATABASE_URL -tA -c "SELECT id FROM tenants WHERE subdomain='<TENANT_SLUG>';")
MSG_ID=$(psql $DATABASE_URL -tA -c "
SELECT provider_message_id FROM notification
WHERE tenant_id = '$TENANT_ID' AND channel='email' AND provider_message_id IS NOT NULL
ORDER BY created_at DESC LIMIT 1;
")

# Build the Resend Svix-Signature header. (Use the tools that ship with the rebuild's webhook
# verifier — there's a helper in apps/api/test/helpers/build-webhook-signature.ts.)
node apps/api/test/helpers/build-webhook-signature.ts \
  --secret "$SECRET" \
  --body "{\"type\":\"email.delivered\",\"data\":{\"email_id\":\"$MSG_ID\"}}" \
  > /tmp/webhook-sig.txt

curl -X POST "http://localhost:3001/api/v1/webhooks/communications/email/$TENANT_ID" \
  -H "Content-Type: application/json" \
  -H "Svix-Id: $(cat /tmp/webhook-sig.txt | head -1)" \
  -H "Svix-Timestamp: $(cat /tmp/webhook-sig.txt | sed -n 2p)" \
  -H "Svix-Signature: $(cat /tmp/webhook-sig.txt | sed -n 3p)" \
  -d "{\"type\":\"email.delivered\",\"data\":{\"email_id\":\"$MSG_ID\"}}"
```

- Assert HTTP 200 (signature verified).
- Re-query the `notification` row — assert `status='delivered'` and `delivered_at` populated.

8. **Suppression list test:**
   - Manual SQL insert into `notification_suppression_list`:

```bash
psql $DATABASE_URL -c "
INSERT INTO notification_suppression_list (tenant_id, channel, recipient_address, reason, source)
VALUES (
  (SELECT id FROM tenants WHERE subdomain = '<TENANT_SLUG>'),
  'email',
  'suppressed-test@example.invalid',
  'manual',
  'manual:e2e-test'
);
"
```

- Trigger another announcement targeting the same recipient.
- Wait ~30s, query `notification` — assert row with `status='failed'` and `failure_reason='suppressed:manual'`.

9. **Domain verification flow (email tab only, NHQS only — saves time):**
   - On NHQS only: `browser_navigate` back to `/en/settings/communications/email`.
   - Click the "Add domain" or "Register domain" button.
   - Enter `e2e-test.invalid` as the domain.
   - Submit. Assert the DNS records table renders with SPF / DKIM / DMARC rows in `pending` state.
   - Click "Refresh now". Assert the row stays in `pending` (Resend will reject the bogus domain — verify the failure_reason surfaces in the UI).
10. **WhatsApp template submission (NHQS only — saves time):**
    - `browser_navigate` to `/en/settings/communications/whatsapp`.
    - The template `e2e_test_template` submitted earlier should be visible. Click into it.
    - Assert detail view shows status badge, body, language, category. Assert the "Status: submitted" badge.

#### 3.7c Locale + responsive checks

After completing 5 tenants × the full flow:

1. **AR locale spot-check (NHQS only):**
   - `browser_navigate` to `http://localhost:5551/ar/settings/communications`.
   - Assert RTL layout: page direction reads right-to-left, channel cards mirror, tabs flip.
   - `browser_navigate` to `/ar/settings/communications/email`. Assert fields rendered correctly, masked values stay LTR (API keys / phone numbers are LTR even in RTL flow — see frontend.md).
   - `browser_navigate` to `/ar/settings/communications/sms` and `/ar/settings/communications/whatsapp`. Spot-check.
2. **Mobile spot-check (NHQS only):**
   - `mcp__plugin_playwright_playwright__browser_resize` to 375 × 667 (iPhone SE).
   - `browser_navigate` to `/en/settings/communications`. Assert no horizontal scroll, all three cards stack vertically, tap targets ≥ 44 × 44px.
   - `browser_navigate` to each per-channel page. Confirm forms render in a single column, inputs are full width, "Send test message" button is reachable.
   - Resize back to 1280 × 720 for any subsequent steps.
3. **Console error capture (per tenant):**
   - After each tenant's walkthrough, call `mcp__plugin_playwright_playwright__browser_console_messages` with `level: "error"`.
   - Assert zero error-level messages. If errors appear, screenshot the offending page (delete the screenshot after triage), inspect, and either:
     - Fix the bug if it's small (a missing translation key, a button without onClick, a broken import) — commit fix with conventional message `fix(comms): <description>`.
     - File a follow-up note in §5 of `IMPLEMENTATION_LOG.md` with the exact error + the page, if it's not Impl 14's responsibility.

#### 3.7d Release the Playwright lock

Once the walkthrough completes, append to `IMPLEMENTATION_LOG.md` §5:

```
### [PLAYWRIGHT RELEASED] — verification-walkthrough (Impl 14)
- Holder: Impl 14 final E2E verification
- Released: 2026-04-27T<HH:MM>:00+01:00
- Browser closed: yes
```

Per memory cap, the entire Playwright walkthrough should fit in ~20 minutes. If it overflows, release at the natural break point (e.g. after the 5 tenants × 3 channels but before the locale/responsive spot-checks), update §5 with intermediate findings, and re-claim for the second half.

#### 3.7e Per-memory: delete all screenshots

Before committing, run:

```bash
git status --porcelain | grep -E '\.(png|jpg|jpeg)$' | awk '{print $2}' | xargs -I {} rm -- {}
```

If any screenshots leaked into the worktree, delete them. The branch must be screenshot-free per memory.

### 3.8 Final IMPLEMENTATION_LOG.md update

Append a single REBUILD COMPLETE record at the bottom of `communicationnew/IMPLEMENTATION_LOG.md` §5:

````markdown
### [REBUILD COMPLETE] — Communications Overhaul

- **Completed:** 2026-04-27T<HH:MM>:00+01:00 (Europe/Dublin)
- **Worktree branch:** `communications-overhaul`
- **Total local commits across 14 implementations:** ~<N> commits (see per-impl records above for exact count and SHAs)
- **Last commit (Impl 14):** <sha>

#### Summary

All 14 implementations shipped to the `communications-overhaul` worktree. The dispatch infrastructure (provider classes, retry logic, fallback chain, rate limits, consent gating, idempotency, two-phase dispatch) was preserved as-is. Around it, the rebuild added:

- **3 new credential tables** (`tenant_email_configs`, `tenant_sms_configs`, `tenant_whatsapp_configs`) with AES-256-GCM encryption + per-tenant `webhook_secret`.
- **5 new operational tables** (`notification_suppression_list`, `tenant_email_domains`, `whatsapp_templates`, `whatsapp_service_windows`, `notification_webhook_events`).
- **3 new credential services + controllers** mirroring `StripeConfigService` exactly.
- **Provider refactor** — `ResendEmailProvider`, `TwilioSmsProvider`, `TwilioWhatsAppProvider` all read tenant config first; no `.env` fallback exists post Impl 05.
- **Per-tenant client cache** with Redis pub/sub invalidation on `comms:config-changed`.
- **3 webhook receiver endpoints** with per-tenant signature verification; status updates land via webhook.
- **Suppression list** consulted on every outbound dispatch.
- **Email domain verification** loop with cron polling.
- **WhatsApp template lifecycle + 24-hour service window** enforcement.
- **Verify endpoints** (`POST /v1/{email,sms,whatsapp}-config/test`).
- **Operational layer** — Sentry tagging, structured `CommsLoggerService`, Prometheus metrics, Grafana dashboard, three runbooks.
- **4 frontend settings pages** at `/settings/communications/{,email,sms,whatsapp}`.
- **Module gap closure** — finance migrated off direct DB writes, trips / closures / leave / health / sen wired, password reset wired, `'push'` replaced with `'whatsapp'`.
- **5 test tenants × 3 channels = 15 config rows** seeded in dev DB.
- **6 architecture docs updated.**

The user is the next owner. They will:

1. Manually rebase `communications-overhaul` onto `main`.
2. Resolve any conflicts (sibling sessions on `main` may have shipped during the rebuild — use `git log origin/main..HEAD` per pre-push branch-state check rule in CLAUDE.md).
3. Merge into `main`.
4. Run the production cutover script `communicationnew/cutover/production-cutover.sh` (which provisions per-tenant credentials for the production tenants — script generated by Impl 13 in this rebuild).
5. Watch CI on the merge commit; the merge is when CI runs against this work for the first time.

#### Production cutover instructions

```bash
# After merge to main:
git checkout main
git pull origin main
./communicationnew/cutover/production-cutover.sh
# Script reads from communicationnew/cutover/prod-tenant-credentials.json (gitignored — user populates)
# Encrypts each tenant's credentials with the production ENCRYPTION_KEY
# UPSERTs rows into tenant_email_configs / tenant_sms_configs / tenant_whatsapp_configs
# Runs verify-test against each tenant × channel
# Output: pass/fail report per tenant per channel
```
````

#### Coverage threshold ratchet

Final coverage figures from the run of `pnpm turbo run test`:

- `apps/api`: <X>% statements, <Y>% branches (was <oldX>% / <oldY>% pre-rebuild)
- `apps/worker`: <X>% statements, <Y>% branches
- `packages/shared`: <X>% statements, <Y>% branches

Per the project's "ratchet up; never lower" rule (CLAUDE.md `Coverage — Ratchet, Never Lower`), I have updated `apps/api/jest.config.js` thresholds upward by `(new_baseline − 2)`. Diff:

```diff
-  coverageThreshold: { global: { statements: <oldX>, branches: <oldY> } }
+  coverageThreshold: { global: { statements: <newX>, branches: <newY> } }
```

#### Follow-ups

- Platform admin tenant config UI (read-only) — out of V1 scope; tracked.
- Engagement tracking (`email.opened` events) — out of V1 scope; tracked.
- Per-tenant rate limit overrides — out of V1 scope; tracked.
- WhatsApp channel preview — out of V1 scope; tracked.
- True web push notifications — out of V1 scope; tracked. The `'push'` channel was replaced with `'whatsapp'` in Impl 12.

#### Rollback

If the user wants to undo the entire rebuild after merge:

```bash
git revert <merge-commit-sha> -m 1
git push origin main
# Then on production: pm2 restart api worker
# Then for each previously-using tenant: re-add the platform .env credentials
#   (RESEND_API_KEY, TWILIO_ACCOUNT_SID, etc.) — these were removed by Impl 05
#   but the post-revert worker reverts to expecting them.
```

The user has not yet merged. Until they do, the rollback is `git checkout main` (the branch is untouched).

#### Local verification

- 5 test tenants × 3 channels × full flow (config → test send → webhook receive → status update → suppression check).
- AR locale spot-check on NHQS.
- 375px mobile spot-check on NHQS.
- Console error capture per tenant: zero error-level messages observed.
- `pnpm turbo run test` from a clean state: all suites green.
- `pnpm turbo run lint`: zero errors, zero new warnings.
- `pnpm turbo run type-check`: zero errors.
- `pnpm turbo run build`: clean build.
- AppModule DI smoke (Rule 6): `DI OK`.
- Run timestamp: 2026-04-27T<HH:MM>:00+01:00.

````

After the REBUILD COMPLETE record, flip the Wave Status row 14 in §4 from `in-progress` to `completed`, fill in the local commit SHA.

### 3.9 Pre-merge checklist — `communicationnew/PRE-MERGE-CHECKLIST.md` (NEW)

```markdown
# Communications Overhaul — Pre-Merge Checklist

> **Read before merging `communications-overhaul` onto `main`.** Every box must be ticked.
> The rebuild used a dedicated worktree branch and is not yet on `main`. Merging is your call. After merge, the production cutover script must run before production tenants can dispatch.

## 1. Rebuild Completeness

- [ ] All 14 implementations show `status: completed` in `communicationnew/IMPLEMENTATION_LOG.md` §4
- [ ] Every implementation has a Completion Record in §5 with: timestamp, local commit SHA, summary, follow-ups, rollback note
- [ ] The `[REBUILD COMPLETE]` final record is appended at the bottom of §5
- [ ] No `🛑 BLOCKED` rows remain

## 2. Local Dev Server

- [ ] `pnpm --filter @school/api dev` starts cleanly (no migration errors, no DI errors)
- [ ] `pnpm --filter @school/worker dev` starts cleanly (all 4 new cron jobs registered: `comms:domain-verification-refresh`, `comms:whatsapp-template-sync`, `comms:suppression-list-cleanup`, `comms:whatsapp-service-window-cleanup`)
- [ ] `pnpm --filter @school/web dev` starts cleanly on port 5551

## 3. End-to-End Verification

- [ ] All 5 test tenants (NHQS + stress-a/b/c/d) × all 3 channels (email, SMS, WhatsApp) work end-to-end in local dev (15 dispatch flows minimum, per Impl 14 §3.7)
- [ ] Webhook signature verification works (manual curl simulation passes)
- [ ] Suppression list addition + dispatch skip verified
- [ ] Domain verification flow renders DNS records (NHQS spot-check)
- [ ] WhatsApp template submit flow creates a row in `whatsapp_templates`

## 4. Architecture Documentation

- [ ] `docs/architecture/feature-map.md` updated (Communications & Configuration sections; Quick Reference counts)
- [ ] `docs/architecture/module-blast-radius.md` updated (Communications entry, cross-module edges, cycle-breaker note)
- [ ] `docs/architecture/danger-zones.md` updated (6 new entries: cache coherence, mid-flight `is_enabled` flip, webhook secret trust, suppression growth, WhatsApp service window staleness, `.env` removal one-way)
- [ ] `docs/architecture/state-machines.md` updated (extended notification.status, new whatsapp_template.status, new tenant_email_domain.status)
- [ ] `docs/architecture/event-job-catalog.md` updated (4 new cron jobs, webhook ingestion flow, Redis pub/sub for cache invalidation)
- [ ] `docs/architecture/communication-architecture.md` status banner flipped to "Implementation complete"; Build Order moved to historical appendix

## 5. Coverage Thresholds

- [ ] `apps/api/jest.config.js` coverage thresholds ratcheted up to `(new_baseline − 2)` per `.claude/rules/`
- [ ] `apps/worker/jest.config.js` coverage thresholds ratcheted (if applicable)
- [ ] `packages/shared/jest.config.js` coverage thresholds ratcheted (if applicable)

## 6. Code Quality

- [ ] No leftover `console.log` / debug statements in new code
- [ ] No `as any`, `@ts-ignore`, or `as unknown as X` outside the documented exception (the single permitted `as unknown as PrismaService` cast inside `createRlsClient(...).$transaction()`)
- [ ] All translations present in EN + AR (`apps/web/messages/en.json` + `messages/ar.json`)
- [ ] No physical CSS classes (`pl-`, `pr-`, `ml-`, `mr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-`)
- [ ] Form validation uses `react-hook-form` + `zodResolver` (no individual `useState`-per-field new forms)

## 7. Environment Configuration

- [ ] No env credentials left over (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` removed from `.env.example` and `apps/api/src/config/env.validation.ts` per Impl 05)
- [ ] `.env.example` updated with any new env vars introduced by Impl 10 (Sentry DSN, Prometheus, etc.)
- [ ] Production `.env` is **not** in the worktree (per CLAUDE.md "Never touch the production `.env` file")

## 8. Worker Cron Registration

- [ ] All 4 new BullMQ cron jobs registered in `apps/worker/src/base/cron-scheduler.service.ts`
- [ ] Verified at runtime: `pm2 logs worker | grep -E "comms:(domain-verification-refresh|whatsapp-template-sync|suppression-list-cleanup|whatsapp-service-window-cleanup)"` shows registration messages on startup
- [ ] `apps/worker/src/worker.module.ts` imports all 4 new processor modules

## 9. Database Schema

- [ ] All 8 new tenant-scoped tables present in production-equivalent schema (verify via `\dt tenant_email_configs tenant_sms_configs tenant_whatsapp_configs notification_suppression_list tenant_email_domains whatsapp_templates whatsapp_service_windows notification_webhook_events` in psql)
- [ ] All 8 RLS policies in place. Verify via:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'tenant_email_configs',
  'tenant_sms_configs',
  'tenant_whatsapp_configs',
  'notification_suppression_list',
  'tenant_email_domains',
  'whatsapp_templates',
  'whatsapp_service_windows',
  'notification_webhook_events'
);
````

Expected: every row has `relrowsecurity=t` and `relforcerowsecurity=t`.

```sql
SELECT polname, polrelid::regclass FROM pg_policy
WHERE polname LIKE '%_tenant_isolation';
```

Expected: 8 rows matching the 8 new tables, each with a `<table>_tenant_isolation` policy.

## 10. Production Cutover Readiness

- [ ] Production cutover script generated at `communicationnew/cutover/production-cutover.sh` (created by Impl 13 in this rebuild)
- [ ] User has populated `communicationnew/cutover/prod-tenant-credentials.json` (gitignored — never commit)
- [ ] `prod-tenant-credentials.json` has been validated against the schema (the cutover script's pre-flight check)
- [ ] User has confirmed the production `ENCRYPTION_KEY_V1` env var is set on the production server
- [ ] User has confirmed Resend / Twilio production credentials are valid (test-send manually before cutover)

## 11. Operational Layer

- [ ] Sentry DSN env var configured for production (separate from local dev)
- [ ] Grafana dashboard JSON committed at `docs/operations/dashboards/communications.json`
- [ ] Three runbooks committed:
  - [ ] `docs/runbooks/comms-tenant-dispatch-failures.md`
  - [ ] `docs/runbooks/comms-credential-rotation.md`
  - [ ] `docs/runbooks/comms-webhook-debugging.md`

## 12. Test Suite

- [ ] `pnpm turbo run test` — all suites green from a clean state
- [ ] `pnpm turbo run lint` — zero errors, zero new warnings
- [ ] `pnpm turbo run type-check` — zero errors
- [ ] `pnpm turbo run build` — clean build of api, worker, web
- [ ] AppModule DI smoke (per CLAUDE.md `Module Registration — Verify DI Before Pushing`): `DI OK`

## 13. Merge Plan

When all boxes above are ticked:

1. **Sync local main:**

   ```bash
   git checkout main
   git pull origin main
   ```

2. **Rebase the worktree branch onto main:**

   ```bash
   cd <worktree-path>
   git fetch origin main
   git rebase origin/main
   ```

3. **Resolve conflicts.** Sibling sessions may have shipped while the rebuild was in progress. Most likely conflict areas:
   - `apps/web/messages/en.json` / `ar.json` — deep-merge translation keys
   - `docs/architecture/feature-map.md` — verify Quick Reference counts; merge cleanly
   - `packages/shared/src/index.ts` — re-export new constants; merge cleanly
   - `apps/api/src/app.module.ts` / `apps/worker/src/worker.module.ts` — module imports may have shifted

4. **Push the rebased branch and merge:**

   ```bash
   git push origin communications-overhaul
   gh pr create --base main --head communications-overhaul \
     --title "feat(comms): per-tenant credentials + webhooks + deliverability + observability (14 impls)" \
     --body-file communicationnew/PRE-MERGE-CHECKLIST.md
   ```

5. **Wait for CI.** CI runs against this work for the first time on the PR. Address any CI failures by adding fix commits to the branch and watching `gh run watch`.

6. **Merge once CI is green.** Squash-merge or rebase-merge per repo convention.

7. **Run the production cutover:**

   ```bash
   # On the production server (post-merge, post-deploy):
   ssh root@<prod-host>
   cd /var/www/edupod/main
   sudo -u edupod ./communicationnew/cutover/production-cutover.sh
   ```

   The cutover script:
   - Reads `prod-tenant-credentials.json` (gitignored; rsync to server out of band)
   - Encrypts each tenant's credentials
   - UPSERTs into `tenant_email_configs` / `tenant_sms_configs` / `tenant_whatsapp_configs`
   - Runs verify-test against each tenant × channel
   - Writes a pass/fail report

8. **Smoke-test in production.** Pick one tenant, one channel, send a test announcement. Verify the recipient gets it. Pick a different tenant, different channel — repeat.

## 14. Roll-back plan (if cutover fails)

If the cutover script reports any failure:

1. `git revert <merge-commit-sha> -m 1` on `main`
2. `git push origin main`
3. Wait for CI deploy.
4. **OR** keep the merge; manually `psql` to revert the credential rows for the failing tenants only, and fix the tenant data, then re-run cutover for those tenants.

The cutover script supports a per-tenant retry — see its `--retry-tenant <tenant_slug>` flag.

---

**Once every checkbox above is ticked, the rebuild is ready to merge.**

````

### 3.10 Production cutover script — verify it exists

The cutover script is generated by Impl 13. Verify:

```bash
ls -la communicationnew/cutover/
# expect:
#   production-cutover.sh   (executable)
#   prod-tenant-credentials.example.json
#   .gitignore   (excluding prod-tenant-credentials.json)
````

If any of these are missing, that's an Impl 13 gap — surface it as a follow-up note in §5 and continue. Impl 14 should not generate the cutover script itself; that's Impl 13's responsibility.

---

## 4. Tests

Impl 14 ships documentation + verification, not code. The "tests" for this impl are presence and correctness checks on the doc updates and the E2E walkthrough record.

### 4.1 Architecture doc presence — `apps/api/test/architecture-docs.spec.ts` (NEW)

A simple Jest unit test that asserts the modified-time of each architecture file is within the last 24 hours and that the "Last verified" banner string contains `2026-04-27`.

```typescript
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('Communications Overhaul — architecture docs presence', () => {
  const ARCH_DIR = resolve(__dirname, '../../../docs/architecture');
  const REQUIRED_DOCS = [
    'feature-map.md',
    'module-blast-radius.md',
    'danger-zones.md',
    'state-machines.md',
    'event-job-catalog.md',
    'communication-architecture.md',
  ];

  it.each(REQUIRED_DOCS)('%s contains the rebuild verification banner', async (filename) => {
    const path = resolve(ARCH_DIR, filename);
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toMatch(/2026-04-27/);
  });

  it('feature-map.md mentions the new credential tables', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'feature-map.md'), 'utf-8');
    expect(content).toContain('tenant_email_configs');
    expect(content).toContain('tenant_sms_configs');
    expect(content).toContain('tenant_whatsapp_configs');
    expect(content).toContain('notification_suppression_list');
    expect(content).toContain('tenant_email_domains');
    expect(content).toContain('whatsapp_templates');
    expect(content).toContain('whatsapp_service_windows');
    expect(content).toContain('notification_webhook_events');
  });

  it('feature-map.md mentions the new permissions', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'feature-map.md'), 'utf-8');
    expect(content).toContain('configuration.communications.view');
    expect(content).toContain('configuration.communications.manage');
  });

  it('feature-map.md mentions all four new BullMQ jobs', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'feature-map.md'), 'utf-8');
    expect(content).toContain('comms:domain-verification-refresh');
    expect(content).toContain('comms:whatsapp-template-sync');
    expect(content).toContain('comms:suppression-list-cleanup');
    expect(content).toContain('comms:whatsapp-service-window-cleanup');
  });

  it('module-blast-radius.md adds Communications module entry', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'module-blast-radius.md'), 'utf-8');
    expect(content).toMatch(/^### Communications$/m);
    expect(content).toContain('CommsCacheBus');
  });

  it('danger-zones.md adds the six new DZ entries', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'danger-zones.md'), 'utf-8');
    expect(content).toContain('Tenant Credential Cache Coherence');
    expect(content).toContain('Mid-Flight `is_enabled` Flip');
    expect(content).toContain('Webhook Signature Trust');
    expect(content).toContain('Suppression List Unbounded Growth');
    expect(content).toContain('WhatsApp Service Window Staleness');
    expect(content).toContain('`.env` Credential Removal Is One-Way');
  });

  it('state-machines.md documents the extended notification.status', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'state-machines.md'), 'utf-8');
    expect(content).toContain('NotificationStatus');
    expect(content).toContain('bounced');
    expect(content).toContain('complained');
    expect(content).toContain('WhatsAppTemplateStatus');
    expect(content).toContain('EmailDomainStatus');
  });

  it('event-job-catalog.md documents the four new cron jobs', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'event-job-catalog.md'), 'utf-8');
    expect(content).toContain('comms:domain-verification-refresh');
    expect(content).toContain('comms:whatsapp-template-sync');
    expect(content).toContain('comms:suppression-list-cleanup');
    expect(content).toContain('comms:whatsapp-service-window-cleanup');
    expect(content).toContain('Inbound Webhook Flow');
    expect(content).toContain('comms:config-changed');
  });

  it('communication-architecture.md status banner flipped to "Implementation complete"', async () => {
    const content = await fs.readFile(resolve(ARCH_DIR, 'communication-architecture.md'), 'utf-8');
    expect(content).toContain('Implementation complete');
    expect(content).toContain('communicationnew/IMPLEMENTATION_LOG.md');
  });
});
```

### 4.2 Pre-merge checklist completeness — inline `apps/api/test/pre-merge-checklist.spec.ts` (NEW)

```typescript
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('PRE-MERGE-CHECKLIST.md completeness', () => {
  const path = resolve(__dirname, '../../../communicationnew/PRE-MERGE-CHECKLIST.md');

  it('contains all 14 required sections', async () => {
    const content = await fs.readFile(path, 'utf-8');
    const REQUIRED_SECTIONS = [
      '## 1. Rebuild Completeness',
      '## 2. Local Dev Server',
      '## 3. End-to-End Verification',
      '## 4. Architecture Documentation',
      '## 5. Coverage Thresholds',
      '## 6. Code Quality',
      '## 7. Environment Configuration',
      '## 8. Worker Cron Registration',
      '## 9. Database Schema',
      '## 10. Production Cutover Readiness',
      '## 11. Operational Layer',
      '## 12. Test Suite',
      '## 13. Merge Plan',
      '## 14. Roll-back plan',
    ];
    for (const section of REQUIRED_SECTIONS) {
      expect(content).toContain(section);
    }
  });

  it('mentions the production cutover script path', async () => {
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toContain('communicationnew/cutover/production-cutover.sh');
    expect(content).toContain('prod-tenant-credentials.json');
  });

  it('lists every checkbox as an unchecked markdown checkbox by default', async () => {
    const content = await fs.readFile(path, 'utf-8');
    const checkboxes = content.match(/^- \[ \]/gm) ?? [];
    expect(checkboxes.length).toBeGreaterThan(40);
  });
});
```

### 4.3 IMPLEMENTATION_LOG.md final record assertion

```typescript
import { promises as fs } from 'fs';
import { resolve } from 'path';

describe('IMPLEMENTATION_LOG.md final record', () => {
  const path = resolve(__dirname, '../../../communicationnew/IMPLEMENTATION_LOG.md');

  it('contains the [REBUILD COMPLETE] record at the bottom', async () => {
    const content = await fs.readFile(path, 'utf-8');
    expect(content).toContain('[REBUILD COMPLETE] — Communications Overhaul');
    expect(content).toContain('Production cutover instructions');
    expect(content).toContain('Coverage threshold ratchet');
  });

  it('all 14 implementations marked completed in §4', async () => {
    const content = await fs.readFile(path, 'utf-8');
    // crude regex — count occurrences of `\| completed \|`
    const completedCount = (content.match(/\|\s*`completed`\s*\|/g) ?? []).length;
    expect(completedCount).toBeGreaterThanOrEqual(14);
  });
});
```

### 4.4 No console errors during Playwright walkthrough

The Playwright run itself records console errors. The acceptance gate is the §3.7c assertion: zero error-level messages per tenant. The completion record in §5 must explicitly list `console errors observed: zero`.

If errors WERE observed but were resolved with fix commits during the walkthrough, the completion record must list them with the fix commit SHA.

### 4.5 Fix-forward policy for test failures

If any of the architecture-doc-presence tests fail in §4.1, fix the doc and re-run. Do NOT skip the test. Do NOT mark Impl 14 complete with red tests in this suite — the test exists to enforce the doc updates landing.

---

## 5. Verification (local dev server)

This is the canonical verification block per IMPLEMENTATION_LOG.md Rule 27a.

### 5.1 Test suite

```bash
pnpm turbo run test
```

Every suite must be green. If any pre-existing test breaks because of a doc change (it shouldn't — docs don't affect runtime), fix the regression before flipping the row.

### 5.2 Lint + type-check + build

```bash
pnpm turbo run lint
pnpm turbo run type-check
pnpm turbo run build
```

Zero errors across all three. The build must produce clean `dist/` directories for `apps/api`, `apps/worker`, `apps/web`.

### 5.3 AppModule DI smoke

Per CLAUDE.md (`Module Registration — Verify DI Before Pushing`):

```bash
cd apps/api && DATABASE_URL=postgresql://x:x@localhost:5432/x \
REDIS_URL=redis://localhost:6379 \
JWT_SECRET=fakefakefakefakefakefakefakefake \
JWT_REFRESH_SECRET=fakefakefakefakefakefakefakefake \
ENCRYPTION_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
MFA_ISSUER=test PLATFORM_DOMAIN=test.local APP_URL=http://localhost:3000 \
npx ts-node -e "
import { Test } from '@nestjs/testing';
import { AppModule } from './src/app.module';
Test.createTestingModule({ imports: [AppModule] }).compile()
  .then(() => { console.log('DI OK'); process.exit(0); })
  .catch(e => { console.error(e.message); process.exit(1); });
"
```

Expected output: `DI OK`. If anything in the rebuild has stale module wiring, this catches it.

### 5.4 Worker registration check

```bash
pnpm --filter @school/worker dev 2>&1 | head -200 | grep -E "comms:(domain-verification-refresh|whatsapp-template-sync|suppression-list-cleanup|whatsapp-service-window-cleanup)"
```

Expected: 4 lines, one per cron job, indicating registration on startup.

### 5.5 Worktree branch state

```bash
git log --oneline communications-overhaul ^main | wc -l
```

Expected: `~N` (where N matches the per-impl commit count from `IMPLEMENTATION_LOG.md` §5). If the count looks suspicious (e.g. 0 or 1), the worktree is wrongly based or the rebuild isn't actually committed.

```bash
git log --oneline --grep="^feat(comms):" communications-overhaul ^main | wc -l
git log --oneline --grep="^fix(comms):" communications-overhaul ^main | wc -l
git log --oneline --grep="^chore(comms):" communications-overhaul ^main | wc -l
```

Expected: numbers consistent with the rebuild's per-impl conventional-commit usage.

### 5.6 Playwright walkthrough

Per §3.7. The walkthrough record must appear in `IMPLEMENTATION_LOG.md` §5 with:

- `[PLAYWRIGHT LOCK] — verification-walkthrough (Impl 14)` claim
- 5 tenants × 3 channels × full flow
- AR locale + 375px mobile spot-checks
- `console errors observed: zero` (or with fix commit SHAs)
- `[PLAYWRIGHT RELEASED] — verification-walkthrough (Impl 14)` release line

### 5.7 Final completion-record commit

The §3.8 REBUILD COMPLETE record + §3.9 PRE-MERGE-CHECKLIST.md commit. Suggested commit messages:

- `docs(comms): update architecture docs for the rebuild — Impl 14 of 14`
- `docs(comms): add pre-merge checklist for Communications Overhaul`
- `chore(comms): mark rebuild complete in IMPLEMENTATION_LOG`

Each as a separate commit on the worktree branch (not pushed to remote — Rule 5).

---

## 6. Files touched

### Modified

- `docs/architecture/feature-map.md` — Communications & Configuration sections, Quick Reference counts, "Last verified" banner.
- `docs/architecture/module-blast-radius.md` — new Communications entry, cross-module edges, "Last verified" banner.
- `docs/architecture/danger-zones.md` — six new entries (DZ-NN through DZ-NN+5).
- `docs/architecture/state-machines.md` — extended NotificationStatus, new WhatsAppTemplateStatus + EmailDomainStatus, "Last verified" banner.
- `docs/architecture/event-job-catalog.md` — four new cron jobs, "Inbound Webhook Flow" section, "Cache Invalidation Pub/Sub" section, "Last verified" banner.
- `docs/architecture/communication-architecture.md` — status banner flipped to "Implementation complete", §4 Build Order moved to historical appendix.
- `communicationnew/IMPLEMENTATION_LOG.md` — Wave Status row 14 flipped to `completed`, REBUILD COMPLETE record appended, Playwright lock claimed + released.

### Created

- `communicationnew/PRE-MERGE-CHECKLIST.md` — 14-section checklist for the user.
- `apps/api/test/architecture-docs.spec.ts` — doc presence + content assertions.
- `apps/api/test/pre-merge-checklist.spec.ts` — checklist completeness assertions.
- `apps/api/test/implementation-log.spec.ts` — final-record assertions. (Optional — can fold into one spec file.)

### Verified (no changes)

- `communicationnew/cutover/production-cutover.sh` — generated by Impl 13; Impl 14 only verifies presence + executability.
- `communicationnew/cutover/prod-tenant-credentials.example.json` — generated by Impl 13.
- `communicationnew/cutover/.gitignore` — generated by Impl 13.

### NOT touched

- Any `.ts` / `.tsx` source file in `apps/` or `packages/`. Impl 14 is documentation + verification only. If the Playwright walkthrough surfaces a code bug, the fix commit is its own conventional commit (e.g. `fix(comms): <bug>`) — not part of the doc update commits.

---

## 7. Rollback

Impl 14 is documentation + verification. Reverting it loses:

- Architecture doc updates (the user's safety net for the rebuild)
- Pre-merge checklist (the user's go/no-go gate)
- IMPLEMENTATION_LOG REBUILD COMPLETE record

Functional rollback: `git revert <impl-14-final-sha>` plus the doc commits. The actual rebuild functionality (Impls 01–13) stays intact — Impl 14 doesn't touch runtime code.

If the Playwright walkthrough surfaces a real bug that requires a code fix, that fix commits separately. Reverting Impl 14 would not undo the bug fix; both commits stand independently.

If Impl 14 itself goes wrong (e.g. the doc updates are wrong, or the checklist has bad items), the fix is fix-forward: another commit with `docs(comms): correct <issue>` rather than a revert. The revert path exists for completeness but is not the recommended recovery.

### Rollback for the entire rebuild

If the user wants to abandon the rebuild (rather than merge):

1. `git checkout main` — switches off the worktree branch.
2. The `communications-overhaul` branch stays in the worktree, untouched on `main`.
3. Optionally, after a cooling-off period: `git branch -D communications-overhaul` to delete the local branch entirely.

Production is unaffected because nothing was deployed.

If the user has merged the rebuild AND wants to roll back the merge:

1. `git revert <merge-commit-sha> -m 1` on `main`
2. `git push origin main`
3. CI runs the deploy.
4. Production runs the pre-rebuild code. Tenant config tables remain (data not lost), but the providers no longer read them — and they no longer read `.env` either (because Impl 05 removed those env vars). At this point production is in a broken state until env vars are restored.
5. Restore the env vars `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` on the production server (per the Impl 05 completion record's rollback notes).
6. `pm2 restart api worker`.

---

## 8. NEXT STEPS for the user

This is the handoff. Read this carefully — Impl 14 is the last impl, but the rebuild isn't truly done until you've merged and run the cutover.

### 8.1 Read the pre-merge checklist

Open `communicationnew/PRE-MERGE-CHECKLIST.md`. Walk every item. If anything is unticked, the rebuild is not ready to merge — work the gap rather than ignoring it.

### 8.2 Verify the worktree state

```bash
cd <your-worktree-path>
git log --oneline communications-overhaul ^main | head -20
```

You should see ~14 implementations' worth of commits (more if there were fix commits). Spot-check a few to confirm sensible commit messages and clean diffs.

### 8.3 Rebase onto `main`

Sibling sessions may have shipped to `main` during the rebuild. Rebase first to surface conflicts in a controlled way.

```bash
git fetch origin main
git rebase origin/main
```

Common conflict areas (per `IMPLEMENTATION_LOG.md` Rule 17 shared-file claims):

- `apps/web/messages/en.json` and `messages/ar.json` — deep-merge translation namespaces.
- `docs/architecture/feature-map.md` — verify Quick Reference counts include both rebuild changes and any sibling-session changes.
- `packages/shared/src/index.ts` — reorder re-exports cleanly.
- `apps/api/src/app.module.ts` and `apps/worker/src/worker.module.ts` — module imports may have shifted.
- `pnpm-lock.yaml` — regenerate via `pnpm install` after resolving `package.json`.

For each conflict, prefer the union of both branches' content unless they're truly mutually exclusive (rare).

### 8.4 Push and merge

```bash
git push origin communications-overhaul
gh pr create --base main --head communications-overhaul \
  --title "feat(comms): per-tenant credentials + webhooks + deliverability + observability (14 impls)" \
  --body-file communicationnew/PRE-MERGE-CHECKLIST.md
```

Watch CI:

```bash
gh run watch
```

If CI fails:

- Inspect logs: `gh run view --log-failed`
- Add fix commits to the branch: `git push origin communications-overhaul`
- Wait for the next CI run to go green.

DO NOT bypass CI. If a CI flake hits, retry rather than `--no-verify`.

Once green, merge the PR (squash or rebase per repo convention).

### 8.5 Run the production cutover

After the merge deploys to production:

```bash
ssh root@<prod-host>
cd /var/www/edupod/main
sudo -u edupod ./communicationnew/cutover/production-cutover.sh
```

The cutover script:

1. Reads `prod-tenant-credentials.json` (gitignored — must be rsynced to the server out of band).
2. Encrypts each tenant's Resend / Twilio credentials with `ENCRYPTION_KEY_V1`.
3. UPSERTs rows into `tenant_email_configs` / `tenant_sms_configs` / `tenant_whatsapp_configs`.
4. Runs `verifyConfig` against each tenant × channel — sends a real test message to the tenant's nominated test recipient.
5. Writes a pass/fail report to stdout and to `/tmp/cutover-report.txt`.

If any tenant × channel fails, the script supports `--retry-tenant <slug>` and `--retry-channel <channel>` for surgical retries. Don't manually `psql` to add rows — the script's encryption pathway is the canonical one.

### 8.6 Production smoke test

After cutover succeeds:

1. Pick one tenant (e.g. NHQS once it's a real tenant — currently still a test tenant per memory `Production tenants are test tenants until Aug 2026`, but smoke against it anyway).
2. Send a real test announcement from a low-volume channel (e.g. one parent's email).
3. Verify it arrives.
4. Repeat for another tenant, another channel.

If anything fails, consult `docs/runbooks/comms-tenant-dispatch-failures.md` (created by Impl 10).

### 8.7 Decommission the worktree branch (optional)

After the merge is in production for ~1 week and stable, you can clean up:

```bash
git branch -D communications-overhaul
git worktree remove <worktree-path>
git push origin --delete communications-overhaul
```

Don't rush this — keep the branch around in case a rollback to a specific impl's SHA is needed.

### 8.8 Post-cutover verification (24h after)

After 24 hours of production running:

1. Check `notification_webhook_events` row counts per tenant — every active tenant should have non-zero.
2. Check `notifications_dispatched_total` Prometheus counter — should grow steadily.
3. Check `notifications_webhook_received_total{signature_valid="true"}` — should match dispatched_total within ~5 min lag.
4. Check `notification_suppression_list` row counts per tenant — should be small (single digits) day 1; will grow over time.
5. Check the Grafana dashboard at `/grafana/dashboards/communications`.

If any of these are zero or wildly off, consult the relevant runbook.

---

## 9. Key invariants

The implementation is correct only if all of these hold:

- **All architecture docs reflect post-rebuild reality.** The "Last verified" banner on every updated doc reads `2026-04-27` with the rebuild reference. The Wave Status table in `IMPLEMENTATION_LOG.md` shows all 14 rows `completed`.
- **Playwright walkthrough covers all 5 tenants × 3 channels** (15 dispatch flows minimum). The completion record explicitly enumerates each tenant + each channel + the outcome.
- **Zero console errors** captured during the walkthrough. Errors that surfaced were resolved with fix commits, recorded by SHA in §5.
- **Pre-merge checklist is complete and accurate** — every section maps to a real verification step the user can perform.
- **IMPLEMENTATION_LOG has a final REBUILD COMPLETE record** at the bottom of §5 with rebuild summary, cutover instructions, coverage ratchet figures, follow-ups, rollback procedure.
- **Production cutover script exists** at `communicationnew/cutover/production-cutover.sh` (verified — generated by Impl 13).
- **The user has clear next steps** in §8 above for merging + cutover + smoke testing.

---

## 10. Session-end protocol

Before you close out:

1. **Confirm the Playwright lock is released.** Re-read `IMPLEMENTATION_LOG.md` §5; the most recent `[PLAYWRIGHT LOCK]` entry must have a corresponding `[PLAYWRIGHT RELEASED]` line.
2. **Confirm zero leaked screenshots.**
   ```bash
   git status --porcelain | grep -E '\.(png|jpg|jpeg|gif|webp)$'
   ```
   Expected: empty output.
3. **Confirm the worktree is on `communications-overhaul` and clean.**
   ```bash
   git rev-parse --abbrev-ref HEAD
   # expect: communications-overhaul
   git status --porcelain
   # expect: empty (everything committed)
   ```
4. **Confirm Wave Status row 14 flipped to `completed`** in `IMPLEMENTATION_LOG.md` §4.
5. **Confirm the REBUILD COMPLETE record is appended** in §5.
6. **Confirm `PRE-MERGE-CHECKLIST.md` exists** at `communicationnew/PRE-MERGE-CHECKLIST.md`.
7. **Surface the handoff to the user.** Final session message must point to:
   - `communicationnew/PRE-MERGE-CHECKLIST.md` for the pre-merge gate
   - `communicationnew/IMPLEMENTATION_LOG.md` §5's REBUILD COMPLETE record for the summary
   - `communicationnew/cutover/production-cutover.sh` for the post-merge cutover
   - The "NEXT STEPS for the user" §8 above for the rebase + merge + cutover walkthrough

After this, the rebuild is in the user's hands. They merge when ready.

---

**End of Implementation 14.**
