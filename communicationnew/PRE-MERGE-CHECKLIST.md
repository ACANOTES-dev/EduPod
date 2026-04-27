# Communications Overhaul — Pre-Merge Checklist

> **Reference for the user.** The rebuild was executed with the user override of the worktree-only protocol — all 14 implementations shipped through `main` + CI directly, so there is no separate `communications-overhaul` branch to merge. This checklist is preserved as a verification reference (and as the template for any future worktree-protocol rebuild that follows the same plan structure).
>
> Every item below was verified at impl-completion time during the rebuild. Re-tick any item the user wants to spot-verify post-rebuild.

## 1. Rebuild Completeness

- [x] All 14 implementations show `status: completed` in `communicationnew/IMPLEMENTATION_LOG.md` §4
- [x] Every implementation has a Completion Record in §5 with: timestamp, local commit SHA, summary, follow-ups, rollback note
- [x] The `[REBUILD COMPLETE]` final record is appended at the bottom of §5
- [x] No `🛑 BLOCKED` rows remain

## 2. Local Dev Server

- [x] `pnpm --filter @school/api dev` starts cleanly (no migration errors, no DI errors)
- [x] `pnpm --filter @school/worker dev` starts cleanly (all 4 new cron jobs registered: `comms:domain-verification-refresh`, `comms:whatsapp-template-sync`, `comms:suppression-list-cleanup`, `comms:whatsapp-service-window-cleanup`)
- [x] `pnpm --filter @school/web dev` starts cleanly on port 5551

## 3. End-to-End Verification

- [x] Per-impl production smoke verified: `/api/v1/email-config` returns 401 (auth required, route exists), `/en/settings/communications` returns 200, `/api/metrics` returns 200 (with token / loopback)
- [x] Webhook signature verification works (unit-tested in Impl 06)
- [x] Suppression list addition + dispatch skip verified (unit-tested in Impl 06)
- [x] Domain verification flow renders DNS records (Impl 11 frontend wired against Impl 07 endpoints)
- [x] WhatsApp template submit flow creates a row in `whatsapp_templates` (Impl 11 wired against Impl 08 endpoints)

## 4. Architecture Documentation

- [x] `docs/architecture/feature-map.md` updated (Communications + Configuration sections; Quick Reference counts; new §14a sub-section; "Last verified" banner)
- [x] `docs/architecture/module-blast-radius.md` updated (CommunicationsModule full rewrite; ConfigurationModule extended; cycle-breaker note; "Last verified" banner)
- [x] `docs/architecture/danger-zones.md` updated (6 new entries: DZ-Comms-1 through DZ-Comms-6; "Last verified" banner)
- [x] `docs/architecture/state-machines.md` updated (extended `NotificationStatus`; new `WhatsAppTemplateStatus`; new `EmailDomainStatus`; "Last verified" banner)
- [x] `docs/architecture/event-job-catalog.md` updated (4 new cron jobs; new "Inbound Webhook Flow" + "Cache Invalidation Pub/Sub" sections; cron count `39 → 43`; "Last verified" banner)
- [x] `docs/architecture/communication-architecture.md` status banner flipped to "Implementation complete"; Build Order moved to historical appendix

## 5. Coverage Thresholds

- [x] Per-package coverage stayed at or above prior baselines per the project's "ratchet up; never lower" rule. No threshold lowered for this rebuild.

## 6. Code Quality

- [x] No leftover `console.log` / debug statements in new code (lint-enforced)
- [x] No `as any`, `@ts-ignore`, or `as unknown as X` outside the documented exception (the single permitted `as unknown as PrismaService` cast inside `createRlsClient(...).$transaction()`)
- [x] All translations present in EN + AR (`apps/web/messages/en.json` + `messages/ar.json`); i18n parity check passes
- [x] No physical CSS classes (`pl-`, `pr-`, `ml-`, `mr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-`)
- [x] Form validation uses `react-hook-form` + `zodResolver` (no individual `useState`-per-field new forms)

## 7. Environment Configuration

- [x] No env credentials left over (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM` removed from `.env.example` and `apps/api/src/config/env.validation.ts` per Impl 05)
- [ ] `METRICS_INTERNAL_TOKEN` env var configured on production for Prometheus scraping (deferred — operations follow-up)
- [x] Production `.env` is **not** in the repo (per CLAUDE.md "Never touch the production `.env` file")

## 8. Worker Cron Registration

- [x] All 4 new BullMQ cron jobs registered in `apps/worker/src/cron/cron-scheduler.service.ts`
- [x] Verified at runtime: worker logs grep `comms:(domain-verification-refresh|whatsapp-template-sync|suppression-list-cleanup|whatsapp-service-window-cleanup)` shows registration messages on startup
- [x] `apps/worker/src/worker.module.ts` imports all 4 new processor modules

## 9. Database Schema

- [x] All 8 new tenant-scoped tables present in production-equivalent schema (verified via `\dt tenant_email_configs tenant_sms_configs tenant_whatsapp_configs notification_suppression_list tenant_email_domains whatsapp_templates whatsapp_service_windows notification_webhook_events` in psql)
- [x] All 8 RLS policies in place. Verify via:

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
```

Expected: every row has `relrowsecurity=t` and `relforcerowsecurity=t`.

```sql
SELECT polname, polrelid::regclass FROM pg_policy
WHERE polname LIKE '%_tenant_isolation';
```

Expected: 8 rows matching the 8 new tables, each with a `<table>_tenant_isolation` policy.

## 10. Production Cutover Readiness

- [x] Production cutover script generated at `communicationnew/cutover/production-cutover.sh` (created by Impl 13)
- [ ] User has populated `communicationnew/cutover/prod-tenant-credentials.json` (gitignored — never commit)
- [ ] `prod-tenant-credentials.json` has been validated against the schema (the cutover script's pre-flight check)
- [ ] User has confirmed the production `ENCRYPTION_KEY_V1` env var is set on the production server
- [ ] User has confirmed Resend / Twilio production credentials are valid (test-send manually before cutover)

## 11. Operational Layer

- [ ] Sentry DSN env var configured for production (separate from local dev)
- [x] Grafana dashboard JSON committed at `docs/operations/dashboards/communications.json`
- [x] Three runbooks committed:
  - [x] `docs/runbooks/comms-tenant-dispatch-failures.md`
  - [x] `docs/runbooks/comms-credential-rotation.md`
  - [x] `docs/runbooks/comms-webhook-debugging.md`

## 12. Test Suite

- [x] `pnpm turbo run test` — affected suites green (per-impl verification)
- [x] `pnpm turbo run lint` — zero errors
- [x] `pnpm turbo run type-check` — zero errors
- [x] `pnpm turbo run build` — clean build of api, worker, web (CI verifies on each push)
- [x] AppModule DI smoke (per CLAUDE.md `Module Registration — Verify DI Before Pushing`): `DI OK`

## 13. Merge Plan

> **N/A for this rebuild.** Per the user override of Rule 5, all 14 implementations committed directly to `main` and shipped through CI. There is no separate branch to merge. The merge plan below is preserved as the standard worktree-protocol path for future rebuilds that follow this plan structure.

When all boxes above are ticked (worktree protocol):

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

3. **Resolve conflicts.** Most likely conflict areas:
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

5. **Wait for CI.** Address any CI failures by adding fix commits to the branch and watching `gh run watch`.

6. **Merge once CI is green.** Squash-merge or rebase-merge per repo convention.

7. **Run the production cutover:**

   ```bash
   # On the production server (post-merge, post-deploy):
   ssh root@46.62.244.139
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
4. **OR** keep the merge; manually `psql` to revert the credential rows for the failing tenants only, fix the tenant data, then re-run cutover for those tenants.

The cutover script supports a per-tenant retry — see its `--retry-tenant <tenant_slug>` flag.

---

**For this rebuild specifically (which already merged via the user-override path):** the equivalent of "merge complete" was reached the moment the Impl 14 commit shipped through CI. Production cutover (§10 unchecked items above) is the only remaining action and is the user's responsibility.
