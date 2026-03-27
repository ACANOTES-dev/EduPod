# Phase L: Security Hardening

**Master Plan Sections:** 3.4, 3.5, 3.6
**Estimated Effort:** 4–5 days
**Prerequisites:** None
**Unlocks:** None (terminal phase)
**Wave:** 1 (can start immediately — fully independent)

---

## Objective

Three independent security/privacy hardening tasks: cookie consent for public pages, Sentry PII reduction, and encryption key rotation. These have no dependencies on other GDPR phases and can be scheduled at any convenient time. Grouped together because they share the theme of "reducing unnecessary personal data exposure."

---

## Scope

### L.1 — Cookie Consent for Public Pages (Master Plan 3.4)

**The requirement:** GDPR (via the ePrivacy Directive) requires consent before setting non-essential cookies. All public-facing pages (school website CMS, contact forms, admissions pages) must have a cookie consent banner.

**Implementation:**

#### Cookie Classification

| Cookie/Storage | Purpose | Essential? | Consent Needed? |
|---|---|---|---|
| Session cookie (httpOnly) | Authentication | Yes | No |
| CSRF token | Security | Yes | No |
| Locale preference | Language setting | Yes (accessibility) | No |
| Sentry replay | Error monitoring | No | Yes |
| Any future analytics | Analytics | No | Yes |

#### Banner Component

```
┌──────────────────────────────────────────────────────────┐
│  We use cookies to ensure our site works properly.       │
│  Some cookies help us improve your experience.           │
│                                                          │
│  [Accept All]  [Essential Only]  [Manage Preferences]    │
│                                                          │
│  Learn more in our [Cookie Policy]                       │
└──────────────────────────────────────────────────────────┘
```

**Behaviour:**
- No non-essential cookies set before consent
- Consent stored in a first-party cookie (itself essential — paradox resolved by ePrivacy Directive)
- Consent persists for 6 months (then re-prompt)
- "Manage Preferences" opens a modal with toggleable categories
- Consent choice respected immediately (Sentry replay disabled if declined)

#### IP Address Disclosure

Contact form pages must disclose that IP addresses are collected:
- Add text below the form: "Your IP address is recorded with this submission for security purposes and will be automatically deleted after 90 days."

### L.2 — Sentry PII Enhancement (Master Plan 3.5)

**Current state:** Sentry is configured but may capture PII in error contexts, session replays, and transaction names.

**Changes:**

1. **Reduce replay sample rate:**
   ```typescript
   // Current (if high):
   replaysOnErrorSampleRate: 1.0
   // New:
   replaysOnErrorSampleRate: 0.1  // 10% of error sessions
   ```
   Or implement PII masking in replays if Sentry SDK supports it.

2. **Add `beforeSendTransaction` hook:**
   ```typescript
   beforeSendTransaction(event) {
     // Strip tenant-scoped data from transaction names
     // e.g., "/api/v1/students/uuid-here" → "/api/v1/students/:id"
     if (event.transaction) {
       event.transaction = event.transaction.replace(
         /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
         ':id'
       );
     }
     return event;
   }
   ```

3. **Add `beforeSend` hook for error events:**
   ```typescript
   beforeSend(event) {
     // Strip student/parent IDs from error context
     if (event.extra) {
       for (const key of Object.keys(event.extra)) {
         if (key.match(/student|parent|staff|name|email/i)) {
           event.extra[key] = '[REDACTED]';
         }
       }
     }
     // Strip PII from breadcrumb data
     if (event.breadcrumbs) {
       for (const crumb of event.breadcrumbs) {
         if (crumb.data?.url) {
           crumb.data.url = crumb.data.url.replace(
             /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
             ':id'
           );
         }
       }
     }
     return event;
   }
   ```

4. **Verify existing scrubbing:**
   - Confirm `sendDefaultPii: false` is set
   - Confirm auth tokens are not in error context
   - Review any custom context additions for PII

### L.3 — Encryption Key Rotation (Master Plan 3.6)

**Current state:** AES-256-GCM encryption for bank details and Stripe keys, single key.

**The requirement:** Key rotation capability — encrypt with new key, decrypt with old or new. This is a security best practice and often required in DPAs.

**Implementation:**

#### Key Versioning

```typescript
// Store key version alongside encrypted data
interface EncryptedField {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;  // NEW — identifies which key encrypted this
}
```

#### Key Store

```typescript
// Environment variables or secrets manager
ENCRYPTION_KEY_V1=<original key>
ENCRYPTION_KEY_V2=<new key>
ENCRYPTION_CURRENT_VERSION=2
```

#### Rotation Logic

```typescript
@Injectable()
export class EncryptionService {
  // Always encrypt with current version
  encrypt(plaintext: string): EncryptedField {
    const key = this.getKey(this.currentVersion);
    // ... encrypt with AES-256-GCM
    return { ciphertext, iv, authTag, keyVersion: this.currentVersion };
  }

  // Decrypt with whatever version was used
  decrypt(field: EncryptedField): string {
    const key = this.getKey(field.keyVersion);
    // ... decrypt with AES-256-GCM
    return plaintext;
  }

  // Background re-encryption job
  async rotateRecords(): Promise<{ reEncrypted: number; failed: number }> {
    // Find all records with keyVersion < currentVersion
    // For each: decrypt with old key → encrypt with new key → update record
    // Process in batches, log progress
  }
}
```

#### Schema Change

If encrypted fields don't already store key version:
```sql
-- Add key_version to staff_profiles (bank details)
ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS bank_encryption_version INT DEFAULT 1;

-- Add key_version to tenant_stripe_configs
ALTER TABLE tenant_stripe_configs ADD COLUMN IF NOT EXISTS encryption_version INT DEFAULT 1;
```

#### Rotation Cron Job

`security:key-rotation` — manually triggered (not scheduled), processes all records in batches:

1. Read record with old key version
2. Decrypt with old key
3. Re-encrypt with new key
4. Update record with new ciphertext + new key version
5. Log completion

**Safety:** The old key is NEVER deleted until all records are re-encrypted. Both keys must be available simultaneously during rotation.

---

## Testing Requirements

### Cookie Consent
1. **No non-essential cookies before consent:** Load public page → verify no tracking cookies set
2. **Accept all:** Click accept → Sentry replay enabled
3. **Essential only:** Click essential → Sentry replay disabled
4. **Persistence:** Consent remembered for 6 months
5. **Re-prompt:** After 6 months (mock), banner appears again

### Sentry PII
6. **UUID stripping:** Transaction names have UUIDs replaced with `:id`
7. **Extra context stripping:** Student/parent-related keys are redacted
8. **Replay rate:** Confirm reduced sample rate in config

### Key Rotation
9. **Encrypt with new key:** New encrypted field has `keyVersion: 2`
10. **Decrypt old key:** Existing data (version 1) decrypts correctly
11. **Decrypt new key:** Newly encrypted data (version 2) decrypts correctly
12. **Re-encryption:** Batch job re-encrypts version 1 → version 2
13. **No data loss:** Verify plaintext matches before and after re-encryption
14. **Batch safety:** Large dataset doesn't cause timeout

---

## Definition of Done

### L.1 Cookie Consent
- [ ] Cookie consent banner component
- [ ] Cookie classification documented
- [ ] Non-essential cookies blocked before consent
- [ ] Consent persistence (6-month cookie)
- [ ] "Manage Preferences" modal
- [ ] IP disclosure on contact forms

### L.2 Sentry PII
- [ ] `replaysOnErrorSampleRate` reduced
- [ ] `beforeSendTransaction` UUID stripping
- [ ] `beforeSend` PII redaction in extras and breadcrumbs
- [ ] Verified `sendDefaultPii: false`

### L.3 Key Rotation
- [ ] Key versioning in encrypted fields
- [ ] Dual-key decrypt (old + new)
- [ ] Re-encryption batch job
- [ ] Schema changes for key version tracking
- [ ] Key rotation documented in security measures

### All
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase L: Security Hardening
- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [deviations — especially Sentry config decisions, key rotation approach]
- **Schema changes:** [migration name(s) if any]
- **New endpoints:** None
- **New frontend pages:** Cookie consent banner (component, not page)
- **Tests added:** [count]
- **Architecture files updated:** [if any]
- **Unlocks:** None (terminal phase, fully independent)
- **Notes:** [Sentry replay rate chosen, key rotation batch performance, cookie policy content status]
```
