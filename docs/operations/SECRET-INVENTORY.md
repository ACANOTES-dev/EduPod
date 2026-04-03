# Secret Inventory & Rotation Schedule

> Last updated: 2026-04-01
> Classification: CONFIDENTIAL — do not commit, share, or screenshot except through authorised channels

This document catalogues every runtime secret used by the EduPod platform, where each secret lives, how it is consumed, and the required rotation cadence. It is the authoritative reference for secret hygiene. Review and update this document whenever a new secret is introduced or an existing one is rotated.

---

## Secret Classes

### 1. Database Credentials

| Secret                          | Env Var                            | Where Used                     | Rotation             | Notes                                                                                                                                                                              |
| ------------------------------- | ---------------------------------- | ------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL application password | `DATABASE_URL` (connection string) | API, Worker, Prisma migrations | 90 days              | PgBouncer connection string — uses port 6432, not 5432. Password must be URL-encoded (`=` → `%3D`). Also update `DATABASE_MIGRATE_URL` used in CI/CD and `pgbouncer/userlist.txt`. |
| PostgreSQL migration URL        | `DATABASE_MIGRATE_URL`             | GitHub Actions deploy workflow | Same as DATABASE_URL | Used only during `prisma migrate deploy` in the deploy script. Must match the direct PostgreSQL password (port 5432), not PgBouncer.                                               |
| Redis authentication password   | `REDIS_URL` (connection string)    | API, Worker                    | 90 days              | Password embedded in connection string URL. Must be URL-encoded. Also update the Docker container's `redis.conf` and the admin commands in the operations manual.                  |

---

### 2. Encryption Keys

These keys protect field-level encrypted data at rest: Stripe API keys per tenant, per-tenant Stripe webhook secrets, staff bank details (account number, IBAN), per-user TOTP/MFA secrets, and per-tenant HMAC secrets for wellbeing surveys.

| Secret                               | Env Var                                    | Where Used                                             | Rotation                                | Notes                                                                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------ | ------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AES-256-GCM encryption key (current) | `ENCRYPTION_KEY_V1` (or V2, V3…)           | API `EncryptionService`, Worker `KeyRotationProcessor` | Annually                                | 64 hex characters (32 bytes). Versioned — add `ENCRYPTION_KEY_V2` as the new key and update `ENCRYPTION_CURRENT_VERSION=2`. **Do not delete old keys** until all ciphertext has been re-encrypted via the key rotation job. |
| Encryption version pointer           | `ENCRYPTION_CURRENT_VERSION`               | API `EncryptionService`, Worker `KeyRotationProcessor` | Updated at each key rotation            | Integer (e.g., `1`, `2`). Determines which versioned key is used for new encryptions.                                                                                                                                       |
| Legacy fallback key (v1 alias)       | `ENCRYPTION_KEY` or `ENCRYPTION_KEY_LOCAL` | API `EncryptionService`, Worker `KeyRotationProcessor` | Legacy — migrate to `ENCRYPTION_KEY_V1` | Accepted only if `ENCRYPTION_KEY_V1` is absent. New deployments must use versioned keys. Do not introduce new uses of the legacy var names.                                                                                 |

**Encrypted data locations:**

| Data                             | DB Column                                                   | Table                                   |
| -------------------------------- | ----------------------------------------------------------- | --------------------------------------- |
| Per-tenant Stripe secret key     | `stripe_secret_key_encrypted` + `encryption_key_ref`        | `tenant_stripe_configs`                 |
| Per-tenant Stripe webhook secret | `stripe_webhook_secret_encrypted` + `encryption_key_ref`    | `tenant_stripe_configs`                 |
| Staff bank account number        | `bank_account_number_encrypted` + `bank_encryption_key_ref` | `staff_profiles`                        |
| Staff IBAN                       | `bank_iban_encrypted` + `bank_encryption_key_ref`           | `staff_profiles`                        |
| User TOTP/MFA secret             | `mfa_secret` + `mfa_secret_key_ref`                         | `users`                                 |
| Per-tenant wellbeing HMAC secret | `hmac_secret_encrypted`                                     | `wellbeing_settings` (via HMAC service) |

---

### 3. Authentication Secrets

| Secret                           | Env Var              | Where Used                                                                                                                 | Rotation | Notes                                                                                                                                    |
| -------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| JWT access token signing secret  | `JWT_SECRET`         | `auth.service.ts`, `jwt.strategy.ts`, `tenant-resolution.middleware.ts`, `unsubscribe.service.ts`, `dpa-accepted.guard.ts` | 90 days  | Minimum 32 characters. Rotating immediately invalidates **all active sessions** — all users are logged out. Plan for low-traffic window. |
| JWT refresh token signing secret | `JWT_REFRESH_SECRET` | `auth.service.ts`                                                                                                          | 90 days  | Must be different from `JWT_SECRET`. Same impact on active sessions as `JWT_SECRET` rotation. Rotate both together.                      |

---

### 4. External Provider Credentials

#### Stripe

| Secret                        | Env Var                                          | Where Used                                                     | Rotation                                          | Notes                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global Stripe webhook secret  | `STRIPE_WEBHOOK_SECRET`                          | `stripe.service.ts` (falls back to per-tenant encrypted value) | Per Stripe's recommendation (no automatic expiry) | Used to verify webhook signatures. Set in the Stripe dashboard under Webhooks. If absent, falls back to the per-tenant encrypted webhook secret in `tenant_stripe_configs`. |
| Per-tenant Stripe secret keys | Stored encrypted in DB (`tenant_stripe_configs`) | `stripe.service.ts`, `stripe-config.service.ts`                | Per tenant's Stripe account policy                | These are entered by the school admin in the tenant settings UI and stored AES-256-GCM encrypted. They are never in environment variables.                                  |

#### Email — Resend

| Secret                | Env Var                 | Where Used                                                               | Rotation                    | Notes                                                                                               |
| --------------------- | ----------------------- | ------------------------------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------- |
| Resend API key        | `RESEND_API_KEY`        | `resend-email.provider.ts`, Worker `dispatch-notifications.processor.ts` | Annually or on compromise   | Without this, all email delivery is disabled. Format: `re_…`.                                       |
| Resend webhook secret | `RESEND_WEBHOOK_SECRET` | `webhook.controller.ts`                                                  | Per Resend's recommendation | Used to verify Svix-signed webhook payloads from Resend (email delivery events). Format: `whsec_…`. |

#### SMS / WhatsApp — Twilio

| Secret                 | Env Var                | Where Used                                                                                                                     | Rotation                   | Notes                                                                                                                                                                                       |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Twilio Account SID     | `TWILIO_ACCOUNT_SID`   | `twilio-sms.provider.ts`, `twilio-whatsapp.provider.ts`, Worker `dispatch-notifications.processor.ts`                          | Annually                   | This is technically an identifier, but it enables API access when paired with the auth token. Treat as secret.                                                                              |
| Twilio Auth Token      | `TWILIO_AUTH_TOKEN`    | `twilio-sms.provider.ts`, `twilio-whatsapp.provider.ts`, `webhook.controller.ts`, Worker `dispatch-notifications.processor.ts` | 90 days                    | Master credential for the Twilio account. Also used to verify incoming Twilio webhook signatures (HMAC-SHA1). Rotating requires updating the Twilio console and all webhook configurations. |
| Twilio WhatsApp sender | `TWILIO_WHATSAPP_FROM` | `twilio-whatsapp.provider.ts`, Worker                                                                                          | Not a secret; config value | Format: `whatsapp:+14155238886`. Not sensitive but required for WhatsApp dispatch.                                                                                                          |
| Twilio SMS sender      | `TWILIO_SMS_FROM`      | `twilio-sms.provider.ts`, Worker                                                                                               | Not a secret; config value | Phone number in E.164 format. Not sensitive.                                                                                                                                                |

#### Object Storage — Hetzner (S3-compatible)

| Secret               | Env Var                | Where Used      | Rotation                   | Notes                                                                                            |
| -------------------- | ---------------------- | --------------- | -------------------------- | ------------------------------------------------------------------------------------------------ |
| S3 access key ID     | `S3_ACCESS_KEY_ID`     | `s3.service.ts` | Annually                   | Hetzner Object Storage access key. Not the same as AWS credentials.                              |
| S3 secret access key | `S3_SECRET_ACCESS_KEY` | `s3.service.ts` | Annually                   | Paired with the access key ID above.                                                             |
| S3 endpoint          | `S3_ENDPOINT`          | `s3.service.ts` | Not a secret; config value | Hetzner Object Storage endpoint URL (e.g., `https://edupod-assets.hel1.your-objectstorage.com`). |
| S3 bucket name       | `S3_BUCKET_NAME`       | `s3.service.ts` | Not a secret; config value | Bucket name. Not sensitive.                                                                      |
| S3 region            | `S3_REGION`            | `s3.service.ts` | Not a secret; config value | Region identifier (e.g., `eu-central`). Not sensitive.                                           |

#### AI — Anthropic

| Secret            | Env Var             | Where Used                                                                                                                                                                                                                                                                                 | Rotation                  | Notes                                                                                                                                                                        |
| ----------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic API key | `ANTHROPIC_API_KEY` | Multiple AI service files: `ai-predictions.service.ts`, `ai-report-narrator.service.ts`, `attendance-scan.service.ts`, `ai-substitution.service.ts`, `ai-grading.service.ts`, `ai-progress-summary.service.ts`, `nl-query.service.ts`, `ai-comments.service.ts`, `behaviour-ai.service.ts` | Annually or on compromise | Read directly from `process.env` (not via ConfigService). If absent, AI features degrade gracefully — they throw `ServiceUnavailableException` rather than crashing the app. |

#### Search — Meilisearch

| Secret                     | Env Var               | Where Used                                          | Rotation | Notes                                                                                                                                                                                |
| -------------------------- | --------------------- | --------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Meilisearch master API key | `MEILISEARCH_API_KEY` | `meilisearch.client.ts`, Worker `search.helpers.ts` | Annually | The master key grants full control over Meilisearch. In production, consider creating a restricted key with only the permissions needed. Without this, full-text search is disabled. |

#### Error Tracking — Sentry

| Secret                | Env Var                  | Where Used                                                                    | Rotation                                     | Notes                                                                                                                                                                 |
| --------------------- | ------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry DSN (backend)  | `SENTRY_DSN_BACKEND`     | `instrument.ts` (API preload)                                                 | Not a secret per se; safe to treat as config | DSN is technically public-facing but should not be committed to public repos. Uniquely identifies the Sentry project. If leaked, it only allows sending error events. |
| Sentry DSN (frontend) | `NEXT_PUBLIC_SENTRY_DSN` | `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` | Not a secret per se; safe to treat as config | Same as above — baked into the Next.js build. Changing requires a rebuild.                                                                                            |

#### DNS / CDN — Cloudflare

| Secret                | Env Var                 | Where Used                                                                            | Rotation                   | Notes                                                                         |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Cloudflare API token  | `CLOUDFLARE_API_TOKEN`  | Not currently consumed in application code — reserved for programmatic DNS management | Annually                   | Listed in `.env.example` as production-only. Scoped to the `edupod.app` zone. |
| Cloudflare Zone ID    | `CLOUDFLARE_ZONE_ID`    | Reserved                                                                              | Not a secret; config value | Zone identifier from the Cloudflare dashboard.                                |
| Cloudflare Account ID | `CLOUDFLARE_ACCOUNT_ID` | Reserved                                                                              | Not a secret; config value | Account identifier from the Cloudflare dashboard.                             |

---

### 5. Infrastructure & CI/CD Secrets

These are stored as GitHub Actions repository secrets, not in `.env`.

| Secret                     | GitHub Secret Name | Purpose                                            | Rotation                            |
| -------------------------- | ------------------ | -------------------------------------------------- | ----------------------------------- |
| Production server hostname | `SSH_HOST`         | `deploy.yml` — target for `appleboy/ssh-action`    | On server IP change                 |
| SSH username               | `SSH_USER`         | `deploy.yml` — SSH login user                      | Rarely; only if server user changes |
| SSH private key            | `SSH_PRIVATE_KEY`  | `deploy.yml` — authentication to production server | Annually or on compromise           |

---

### 6. Database-Resident Secrets (Encrypted at Rest)

These secrets are not environment variables. They are stored in the database, encrypted with the AES-256-GCM key. They are listed here for completeness in the threat model.

| Secret                           | Table                   | Encrypted Column                  | Decrypted By                  | Access                                          |
| -------------------------------- | ----------------------- | --------------------------------- | ----------------------------- | ----------------------------------------------- |
| Per-tenant Stripe secret key     | `tenant_stripe_configs` | `stripe_secret_key_encrypted`     | `EncryptionService.decrypt()` | `stripe-config.service.ts`, `stripe.service.ts` |
| Per-tenant Stripe webhook secret | `tenant_stripe_configs` | `stripe_webhook_secret_encrypted` | `EncryptionService.decrypt()` | `stripe.service.ts` (webhook verification)      |
| Staff bank account number        | `staff_profiles`        | `bank_account_number_encrypted`   | `EncryptionService.decrypt()` | Payroll service only                            |
| Staff IBAN                       | `staff_profiles`        | `bank_iban_encrypted`             | `EncryptionService.decrypt()` | Payroll service only                            |
| User MFA/TOTP secret             | `users`                 | `mfa_secret`                      | `EncryptionService.decrypt()` | `auth.service.ts` only                          |
| Per-tenant wellbeing HMAC secret | `wellbeing_settings`    | `hmac_secret_encrypted`           | `HmacService`                 | Wellbeing survey double-vote prevention         |

---

## Rotation Procedures

### Class 1 — Database Credentials

**Rotating PostgreSQL password:**

1. Generate new password: `openssl rand -base64 32`
2. Update PostgreSQL user: `ALTER USER edupod_admin WITH PASSWORD 'new-password';`
3. Update PgBouncer auth file: `/opt/edupod/pgbouncer/userlist.txt`
4. Update `.env` on the server: both `DATABASE_URL` (PgBouncer, port 6432) and `DATABASE_MIGRATE_URL` (direct, port 5432), URL-encoding any `=` characters as `%3D`
5. Restart PgBouncer: `docker restart pgbouncer`
6. Restart API and Worker: `pm2 restart api worker`
7. Verify: `curl -sf http://localhost:3001/api/health`

**Rotating Redis password:**

1. Generate new password: `openssl rand -base64 32`
2. Update Redis container with new password (requires container recreation with updated `REDIS_PASSWORD` env var in Docker Compose)
3. Update `.env` on the server: `REDIS_URL`, URL-encoding `=` as `%3D`
4. Restart API and Worker: `pm2 restart api worker`

---

### Class 2 — Encryption Key Rotation

**This is the highest-risk rotation. Read the full procedure before executing.**

The key rotation system uses versioned keys and a background job (`security:key-rotation`). Old keys are kept until all data has been re-encrypted; only then are they removed.

1. Generate new key: `openssl rand -hex 32`
2. Determine next version number (e.g., if current is `ENCRYPTION_KEY_V1` / `ENCRYPTION_CURRENT_VERSION=1`, next is V2)
3. Add new key to `.env`: `ENCRYPTION_KEY_V2=<new-64-hex-chars>`
4. **Do not yet change `ENCRYPTION_CURRENT_VERSION`** — both keys must be live before rotation
5. Restart API and Worker so both keys are loaded: `pm2 restart api worker`
6. Verify health: `curl -sf http://localhost:3001/api/health`
7. Trigger key rotation job via platform admin API: `POST /api/v1/admin/security/rotate-keys` (or with `dry_run: true` first to audit scope)
8. Monitor job completion in Worker logs: `pm2 logs worker --lines 50 --nostream`
9. After all records are re-encrypted, update `ENCRYPTION_CURRENT_VERSION=2` in `.env`
10. Restart API and Worker again: `pm2 restart api worker`
11. After confirming no decryption errors in logs for 24 hours, remove the old key var (`ENCRYPTION_KEY_V1`) from `.env`
12. Restart API and Worker: `pm2 restart api worker`

**Impact:** Zero downtime if executed correctly. Old ciphertext continues to decrypt using the old key until re-encrypted.

**Rollback:** If errors occur, revert `ENCRYPTION_CURRENT_VERSION` to the old value and restart. Old key is still in `.env` until explicitly removed.

---

### Class 3 — JWT Secrets

**Caution: Rotating either JWT secret immediately logs out all users.**

1. Generate new secrets: `openssl rand -hex 32` (run twice — one for each secret)
2. Schedule rotation during lowest-traffic window (typically early morning)
3. Update `.env`: `JWT_SECRET=<new>` and `JWT_REFRESH_SECRET=<new>`
4. Restart API: `pm2 restart api`
5. All existing refresh tokens and access tokens are immediately invalid — users must re-login
6. If worker also consumes JWT secrets, restart worker: `pm2 restart worker`

**Impact:** All active sessions are invalidated instantly. Communicate to users beforehand if possible.

**Rollback:** Revert `.env` to old secrets and restart API. Users who re-logged with the new secret will need to re-login again.

---

### Class 4 — External Provider Credentials

**Resend API key:**

1. Generate a new API key in the Resend dashboard
2. Update `RESEND_API_KEY` in `.env`
3. Restart API and Worker: `pm2 restart api worker`
4. Revoke the old key in the Resend dashboard only after confirming the new key is working
5. Verify email delivery via a test notification

**Twilio Auth Token:**

1. Go to Twilio console → Account → Auth Tokens
2. Enable the secondary auth token (this creates a temporary dual-auth state)
3. Update `TWILIO_AUTH_TOKEN` in `.env`
4. Restart API and Worker: `pm2 restart api worker`
5. Verify webhook signature validation is still working (test via an inbound Twilio webhook)
6. Promote secondary to primary in Twilio console; revoke old token

**S3 Access Keys (Hetzner):**

1. Create new access key pair in Hetzner Object Storage console
2. Update `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in `.env`
3. Restart API and Worker: `pm2 restart api worker`
4. Verify file uploads and downloads work
5. Delete the old access key in Hetzner console

**Anthropic API key:**

1. Generate a new key in the Anthropic console
2. Update `ANTHROPIC_API_KEY` in `.env`
3. Restart API: `pm2 restart api`
4. Revoke the old key in the Anthropic console
5. Verify AI features respond (gradebook AI comments, attendance scan, etc.)

**Meilisearch master key:**

1. Generate new key: `openssl rand -hex 32`
2. Update the Meilisearch container with the new master key (requires container recreation with new `MEILI_MASTER_KEY` env var)
3. Update `MEILISEARCH_API_KEY` in `.env`
4. Restart API and Worker: `pm2 restart api worker`
5. Trigger a full search reindex via platform admin if needed

---

### Class 5 — SSH Keys (CI/CD)

1. Generate new key pair: `ssh-keygen -t ed25519 -C "edupod-deploy-$(date +%Y%m%d)"`
2. Add the new public key to `~/.ssh/authorized_keys` on the production server
3. Update the `SSH_PRIVATE_KEY` secret in GitHub Actions repository settings
4. Test a deployment to confirm the new key works
5. Remove the old public key from `authorized_keys` on the production server

---

## Emergency Procedures

### A Secret Is Compromised

**Immediate action (within 1 hour):**

1. **Identify the exposure scope** — which secret, how long was it exposed, who may have it?
2. **Revoke immediately** at the provider level (Stripe dashboard, Twilio console, Resend dashboard, Anthropic console, etc.) — do not wait for rotation procedures
3. **Generate a replacement** and deploy it following the relevant rotation procedure above
4. **Audit logs** — check provider activity logs (Stripe, Twilio, etc.) and platform audit logs (`audit_logs` table) for any anomalous activity during the exposure window
5. **Document** — record the incident: what was exposed, when, by whom, what was done

**For JWT secrets specifically:**

- All active sessions are already invalid the moment you rotate (step 3 of Class 3 rotation above)
- Review audit logs for any suspicious authenticated API calls during the exposure window

**For encryption keys specifically:**

- Rotating the key does NOT invalidate existing ciphertext — the old key must be kept to decrypt existing data
- Assess whether stored encrypted data (Stripe keys, bank details, MFA secrets) needs to be treated as compromised
- If ciphertext is at risk, contact affected tenants; per-tenant Stripe keys may need to be rotated at the Stripe level

**For database passwords specifically:**

- Rotate immediately (Class 1 procedure above)
- Review PostgreSQL logs for any connections during the exposure window: `docker logs edupod-postgres-1 --since <timestamp>`

---

## Rotation Schedule Summary

| Secret Class           | Secrets                                                         | Cadence                | Next Due                                   |
| ---------------------- | --------------------------------------------------------------- | ---------------------- | ------------------------------------------ |
| Database credentials   | DATABASE_URL, REDIS_URL                                         | 90 days                | Set based on last rotation date            |
| JWT secrets            | JWT_SECRET, JWT_REFRESH_SECRET                                  | 90 days                | Set based on last rotation date            |
| Encryption keys        | ENCRYPTION_KEY_V{n}                                             | Annually               | Set based on key creation date             |
| Resend API key         | RESEND_API_KEY                                                  | Annually               | Set based on key creation date             |
| Twilio Auth Token      | TWILIO_AUTH_TOKEN                                               | 90 days                | Set based on last rotation date            |
| S3 credentials         | S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY                          | Annually               | Set based on key creation date             |
| Anthropic API key      | ANTHROPIC_API_KEY                                               | Annually               | Set based on key creation date             |
| Meilisearch master key | MEILISEARCH_API_KEY                                             | Annually               | Set based on key creation date             |
| SSH deploy key         | SSH_PRIVATE_KEY (GitHub secret)                                 | Annually               | Set based on key creation date             |
| Webhook secrets        | STRIPE_WEBHOOK_SECRET, RESEND_WEBHOOK_SECRET, TWILIO_AUTH_TOKEN | Per-provider lifecycle | No automatic expiry — rotate on compromise |

---

## Notes on Secret Storage

- **Runtime secrets** live in `/opt/edupod/app/.env` on the production server. Only `root` and the `edupod` service user have access.
- **CI/CD secrets** (`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`) live in GitHub Actions repository secrets. Access is limited to repository admins.
- **Database-resident secrets** are encrypted at the application layer (AES-256-GCM) using the versioned `ENCRYPTION_KEY_V{n}`. The encryption key itself never enters the database.
- **Per-tenant HMAC secrets** are generated on first use, encrypted at rest, and never leave the application memory unencrypted.
- **TOTP secrets** are encrypted at rest; they are only decrypted in memory during MFA verification.
- **No secrets are stored in `localStorage`, `sessionStorage`, or browser cookies** other than the httpOnly refresh token cookie (which is a short-lived JWT, not a static credential).
