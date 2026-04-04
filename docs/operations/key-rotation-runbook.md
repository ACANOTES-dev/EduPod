# Encryption Key Rotation Runbook

> Last updated: 2026-04-04

Procedure for rotating the AES-256-GCM encryption keys used to protect sensitive data at rest. This covers routine annual rotation, compliance-driven rotation, and emergency rotation after suspected compromise.

Reference: `docs/operations/SECRET-INVENTORY.md` (Class 2 -- Encryption Keys)

---

## 1. Overview

EduPod encrypts three categories of data at rest using AES-256-GCM with versioned keys:

| Category           | Table                   | Encrypted columns                                                | Key ref column            |
| ------------------ | ----------------------- | ---------------------------------------------------------------- | ------------------------- |
| Stripe configs     | `tenant_stripe_configs` | `stripe_secret_key_encrypted`, `stripe_webhook_secret_encrypted` | `encryption_key_ref`      |
| Staff bank details | `staff_profiles`        | `bank_account_number_encrypted`, `bank_iban_encrypted`           | `bank_encryption_key_ref` |
| MFA TOTP secrets   | `users`                 | `mfa_secret`                                                     | `mfa_secret_key_ref`      |

Keys are stored as environment variables: `ENCRYPTION_KEY_V1`, `ENCRYPTION_KEY_V2`, etc. The variable `ENCRYPTION_CURRENT_VERSION` controls which key version is used for new encryptions. Each encrypted record stores a `keyRef` (e.g., `v1`, `v2`) so decryption always uses the correct key.

**When to rotate:**

- Annual scheduled rotation (compliance baseline)
- Suspected key compromise (see Section 7)
- After a personnel change involving someone with server access
- Regulatory or audit requirement

---

## 2. Prerequisites

- SSH access to the production server (`/opt/edupod/app/.env`)
- Ability to restart PM2 services (`pm2 restart api worker`)
- Access to production PostgreSQL (for verification queries)
- The current encryption key (`ENCRYPTION_KEY_V{current}`) MUST remain in the environment throughout rotation -- it is needed to decrypt existing data before re-encrypting with the new key
- Maintenance window is recommended but not required -- rotation is safe during normal operation, though it may cause brief latency during batch re-encryption

---

## 3. Step-by-step Procedure

Throughout this procedure, `{N}` refers to the new key version number. If the current version is 1, then `{N}` is 2. If the current version is 2, then `{N}` is 3.

### Step 1: Determine current version

```bash
grep ENCRYPTION_CURRENT_VERSION /opt/edupod/app/.env
```

Note the current version number. The new version will be current + 1.

### Step 2: Generate a new 256-bit key

```bash
openssl rand -hex 32
```

This outputs 64 hex characters (32 bytes). Copy the output -- this is your new key.

### Step 3: Add the new key to the environment

Edit `/opt/edupod/app/.env` and add:

```
ENCRYPTION_KEY_V{N}=<paste-64-hex-chars-here>
```

Do NOT change `ENCRYPTION_CURRENT_VERSION` yet. Both keys must be loaded before any re-encryption begins.

### Step 4: Update the version pointer

In the same `.env` file, update:

```
ENCRYPTION_CURRENT_VERSION={N}
```

### Step 5: Restart API and Worker services

```bash
pm2 restart api worker
```

### Step 6: Verify the new key is active

```bash
pm2 logs api --lines 20 --nostream | grep -i "encryption"
```

Confirm the application started without encryption key errors. The `EncryptionService` constructor validates that the key for `ENCRYPTION_CURRENT_VERSION` is present and is exactly 32 bytes.

Also verify the health endpoint:

```bash
curl -sf http://localhost:3001/api/v1/health && echo "API OK"
```

### Step 7: Run a dry-run rotation

**Option A -- CLI script:**

```bash
cd /opt/edupod/app
npx tsx scripts/rotate-encryption-key.ts --dry-run
```

**Option B -- Worker job (via API):**

```bash
curl -X POST http://localhost:3001/api/v1/admin/security/rotate-keys \
  -H "Authorization: Bearer <platform-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": true}'
```

**Option C -- Direct service call (via Worker queue):**

Enqueue the `security:key-rotation` job on the `security` queue with `{ "dry_run": true }`.

### Step 8: Review dry-run output

The output reports per-category stats:

```
Stripe: total=X rotated=Y skipped=Z failed=0
Staff:  total=X rotated=Y skipped=Z failed=0
MFA:    total=X rotated=Y skipped=Z failed=0
```

Confirm:

- `total` counts match your expectations (cross-reference with verification queries in Section 4)
- `failed` is 0
- `skipped` count is explained (typically records with a missing old key, or records with no encrypted data)

If anything looks wrong, stop and investigate before proceeding.

### Step 9: Run the actual rotation

**Option A -- CLI script:**

```bash
cd /opt/edupod/app
npx tsx scripts/rotate-encryption-key.ts
```

**Option B -- Worker job (via API):**

```bash
curl -X POST http://localhost:3001/api/v1/admin/security/rotate-keys \
  -H "Authorization: Bearer <platform-admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"dry_run": false}'
```

Monitor progress:

```bash
pm2 logs worker --lines 100 --nostream
```

### Step 10: Verify completion

Confirm the output shows zero failures and all records rotated. Then run the verification queries in Section 4 to confirm no records remain on the old key version.

---

## 4. Verification Queries

After rotation completes, run these queries against production PostgreSQL. Replace `{N}` with the new version number (e.g., `v2`).

```sql
-- Stripe configs still on an old key version
SELECT COUNT(*) AS stripe_remaining
FROM tenant_stripe_configs
WHERE encryption_key_ref != 'v{N}';

-- Staff profiles still on an old key version
SELECT COUNT(*) AS staff_remaining
FROM staff_profiles
WHERE bank_encryption_key_ref IS NOT NULL
  AND bank_encryption_key_ref != 'v{N}';

-- MFA secrets still on an old key version
SELECT COUNT(*) AS mfa_remaining
FROM users
WHERE mfa_secret IS NOT NULL
  AND mfa_secret_key_ref IS NOT NULL
  AND mfa_secret_key_ref != 'v{N}';
```

All three queries should return 0. If any return a non-zero count:

- Check the rotation logs for errors on specific record IDs
- Records with `skipped` status may have a `keyRef` that does not match any loaded key -- investigate which key version they reference
- Re-run the rotation (it is idempotent -- already-rotated records are skipped)

---

## 5. Rollback

### Old keys must NEVER be removed until all data is re-encrypted

The encryption system reads the `keyRef` on each record to determine which key to use for decryption. As long as both the old and new key environment variables are present, both old-key and new-key records decrypt correctly. This is by design.

### If rotation fails partway through

Records already re-encrypted use the new key (`v{N}`). Records not yet processed still use the old key. Both work because both keys are in the environment. No data is lost or corrupted.

To resume: simply re-run the rotation command. It queries for records where `keyRef != v{N}` and processes only those that remain.

### To rollback to the old key for new encryptions

If you need to revert to the old key for new writes (e.g., the new key is suspected bad):

1. Update `.env`: `ENCRYPTION_CURRENT_VERSION={old-version}`
2. Restart services: `pm2 restart api worker`
3. New encryptions will use the old key again
4. Records already re-encrypted with the new key will still decrypt correctly (the new key is still in the environment)

### To fully revert all records to the old key

Set `ENCRYPTION_CURRENT_VERSION` back to the old version and re-run the rotation. This will re-encrypt all new-key records back to the old key.

---

## 6. Post-Rotation Cleanup

After all verification queries return 0 and the system has been running without decryption errors for at least 24 hours:

1. **Keep the old key for 30 days** as a safety margin. If any edge case surfaces (a backup restore, a delayed job), the old key is still available for decryption.

2. **After 30 days**, remove the old key from `.env`:

   ```bash
   # Remove ENCRYPTION_KEY_V{old} from /opt/edupod/app/.env
   pm2 restart api worker
   ```

3. **Update `docs/operations/SECRET-INVENTORY.md`** with the new key version and the rotation date.

4. **Log the rotation** in the operations channel with:
   - Date of rotation
   - Old version -> new version
   - Total records re-encrypted per category
   - Any failures or anomalies

---

## 7. Emergency: Suspected Key Compromise

If an encryption key may have been exposed (leaked env file, compromised server, unauthorized access):

**Act immediately -- do not wait for a maintenance window.**

1. **Generate a new key:**

   ```bash
   openssl rand -hex 32
   ```

2. **Add to environment and update version pointer** (Steps 3-4 above, combined):

   ```bash
   # Edit /opt/edupod/app/.env
   # Add: ENCRYPTION_KEY_V{N}=<new-key>
   # Update: ENCRYPTION_CURRENT_VERSION={N}
   ```

3. **Restart services immediately:**

   ```bash
   pm2 restart api worker
   ```

   New encryptions now use the new key. Existing data still decrypts via the old (compromised) key.

4. **Run rotation immediately** (skip the dry-run in an emergency):

   ```bash
   cd /opt/edupod/app && npx tsx scripts/rotate-encryption-key.ts
   ```

5. **Verify completion** using the queries in Section 4.

6. **Assess data exposure:**
   - If ciphertext was also exposed (database dump leaked alongside the key), the encrypted data must be treated as compromised
   - For Stripe configs: rotate the per-tenant Stripe API keys in each tenant's Stripe dashboard
   - For staff bank details: notify affected staff and the data protection lead
   - For MFA secrets: force MFA re-enrollment for affected users by clearing their `mfa_secret` and `mfa_enabled` flags

7. **Remove the compromised key from the environment** once all records are re-encrypted (do not wait 30 days in a compromise scenario).

8. **Document the incident:** what was exposed, the exposure window, actions taken, and affected parties.

---

## 8. Troubleshooting

### Key format error on startup

```
Error: ENCRYPTION_KEY_V{N} must be 32 bytes (64 hex characters), got X.
```

The key value in `.env` is the wrong length. Verify:

- Exactly 64 hex characters (0-9, a-f)
- No trailing whitespace or newline characters in the `.env` value
- No quotes wrapping the value (unless your `.env` parser expects them)

### Decryption failures during rotation

```
Failed to rotate record <id>: Failed to decrypt value
```

The ciphertext format is `{iv_hex}:{authTag_hex}:{ciphertext_hex}`. Possible causes:

- The record was encrypted with a key that is not in the environment. Check the record's `keyRef` value and verify the corresponding `ENCRYPTION_KEY_V{version}` is set.
- The ciphertext is corrupted. This record may need manual investigation.

### Legacy keyRef values (`aws`, `local`)

Records encrypted before the versioned key system may have `encryption_key_ref = 'aws'` or `'local'`. Both resolve to version 1 (`ENCRYPTION_KEY_V1`). The rotation handles this automatically -- no special action needed.

### Unknown keyRef values

The `EncryptionService` logs a warning and falls back to v1 for any unrecognized `keyRef`. If you see these warnings in logs after rotation, investigate the records -- they may have been created by an older code version.

### Partial rotation -- some records not rotated

Re-run the rotation. It is idempotent: it queries for records where the `keyRef` does not match the current version. Already-rotated records are not touched.

### Worker job stalls or times out

The `KeyRotationProcessor` has a lock duration of 5 minutes and processes in batches of 50. For very large datasets:

- Monitor via `pm2 logs worker`
- The job updates progress as it completes
- If it stalls, check for database locks or connection issues
- The job can be safely re-enqueued -- processing is idempotent
