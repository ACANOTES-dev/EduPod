# Phase G: Audit Logging Enhancement

**Master Plan Section:** 2.4
**Estimated Effort:** 2–3 days
**Prerequisites:** None
**Unlocks:** Phase J (Breach Detection & Management)
**Wave:** 1 (can start immediately)

---

## Objective

Extend audit logging from mutation-only to comprehensive coverage: read access for sensitive data, security events (login, MFA, brute force), and permission-denied events. The current `AuditLogInterceptor` only logs POST/PUT/PATCH/DELETE — zero read access is logged, zero security events are logged. This is a significant gap for DPC accountability requirements.

---

## Scope

### G.1 — Sensitive Data Read Access Logging

**The gap:** No read access is logged. Accessing a child's allergy report, a staff member's bank details, or a student's full data export generates zero audit trail.

**Implementation: `@SensitiveDataAccess` decorator**

```typescript
@SensitiveDataAccess('special_category')  // or 'financial', 'full_export', 'dsar_response'
@Get(':id/allergy-report')
async getAllergyReport(@Param('id') id: string) { ... }
```

The decorator creates a method interceptor that:
1. Runs AFTER the handler (so we know the response was successful)
2. Logs to `audit_logs` with: user, endpoint, data category, entity IDs accessed, timestamp
3. Does NOT log the actual data content (that would be a new privacy risk)

**Priority endpoints for read access logging:**

| Endpoint | Category | Why |
|---|---|---|
| `GET v1/students/:id` (allergy/medical fields) | `special_category` | Children's health data — DPC priority |
| `GET v1/students/allergy-report` | `special_category` | Bulk health data access |
| `GET v1/staff-profiles/:id/bank-details` | `financial` | Encrypted financial data |
| `GET v1/students/:id/export-pack` | `full_export` | All student data in one request |
| `GET v1/compliance-requests/:id/export` | `dsar_response` | DSAR response data |
| All report endpoints | `analytics` | Aggregated data access |
| Platform admin impersonation | `cross_tenant` | Cross-tenant access |

### G.2 — Security Event Logging

**Add to `AuthService` and related guards:**

| Event | Current State | Implementation |
|---|---|---|
| Login success | Only updates `last_login_at` | Add audit log entry with IP, user agent |
| Login failure | Only Redis counter for rate limiting | Add audit log entry with attempted email, IP |
| MFA setup | Not logged | Add audit log entry |
| MFA disable | Not logged | Add audit log entry |
| Password reset request | Not logged | Add audit log entry |
| Password change | Not logged | Add audit log entry |
| Session revocation | Not logged | Add audit log entry |
| Brute force lockout | Not logged | Add audit log entry with IP, lockout duration |

**Implementation:** Create a `SecurityAuditService` that wraps audit log creation for security events. This keeps the AuthService clean and provides a consistent interface.

```typescript
@Injectable()
export class SecurityAuditService {
  async logLoginSuccess(userId: string, ip: string, userAgent: string): Promise<void>
  async logLoginFailure(email: string, ip: string, reason: string): Promise<void>
  async logMfaSetup(userId: string): Promise<void>
  async logMfaDisable(userId: string): Promise<void>
  async logPasswordReset(userId: string, method: 'email' | 'admin'): Promise<void>
  async logPasswordChange(userId: string): Promise<void>
  async logSessionRevocation(userId: string, revokedByUserId: string): Promise<void>
  async logBruteForceLockout(email: string, ip: string, durationMinutes: number): Promise<void>
}
```

### G.3 — Permission Denied Logging

**Add to `PermissionGuard`:**

When a user attempts an action they don't have permission for, log:
- User ID
- Attempted endpoint
- Required permission
- IP address
- Timestamp

This is critical for breach detection (Phase J) — a spike in permission-denied events from a single user could indicate a compromised account probing for access.

**Implementation:** Add a single line to the `PermissionGuard`'s deny path:

```typescript
if (!hasPermission) {
  await this.securityAuditService.logPermissionDenied(userId, requiredPermission, endpoint, ip);
  throw new ForbiddenException(/* ... */);
}
```

### G.4 — Audit Log Categories

Extend the audit log schema to support categories for easier querying:

```typescript
// Add to audit log entry metadata
category: 'mutation' | 'read_access' | 'security_event' | 'permission_denied'
sensitivity: 'normal' | 'special_category' | 'financial' | 'cross_tenant'
```

If the existing audit log schema doesn't support metadata, add a JSONB `metadata` column or use the existing one.

---

## Data Model Changes

No new tables. Extend existing `audit_logs` entries with richer metadata. If needed:

```sql
-- Only if audit_logs doesn't already have a metadata/details column
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS category VARCHAR(30);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS sensitivity VARCHAR(30);
```

---

## Testing Requirements

1. **Read access logging:** Access allergy report → verify audit log entry created with `special_category` sensitivity
2. **Financial data logging:** Access bank details → verify audit log entry with `financial` sensitivity
3. **Login success logging:** Successful login → verify audit log with IP and user agent
4. **Login failure logging:** Failed login → verify audit log with attempted email and IP
5. **MFA events:** Setup and disable MFA → verify both logged
6. **Password events:** Reset and change → verify both logged
7. **Brute force:** Trigger lockout → verify logged with duration
8. **Permission denied:** Attempt forbidden action → verify logged with required permission
9. **No data leakage:** Read access logs do NOT contain the actual sensitive data, only metadata about the access
10. **Performance:** Read access decorator adds < 10ms to endpoint response time (async logging)

---

## Definition of Done

- [ ] `@SensitiveDataAccess` decorator implemented
- [ ] Applied to all priority endpoints listed above
- [ ] `SecurityAuditService` implemented with all methods
- [ ] Login success/failure logging in AuthService
- [ ] MFA event logging
- [ ] Password event logging
- [ ] Session revocation logging
- [ ] Brute force lockout logging
- [ ] Permission denied logging in PermissionGuard
- [ ] Audit log categories added (read_access, security_event, permission_denied)
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase G: Audit Logging Enhancement
- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [deviations — especially audit log schema changes]
- **Schema changes:** [migration name if any]
- **New endpoints:** None
- **New frontend pages:** None
- **Tests added:** [count]
- **Architecture files updated:** [if any]
- **Unlocks:** Phase J (Breach Detection) is now available
- **Notes:** [any endpoints where decorator couldn't be applied, performance observations]
```
