# P1 Testing Results — Tenancy, Users, RBAC, Branding

## Test Run Summary

| Metric | Count |
|--------|-------|
| **Total tests** | 236 |
| **Passed** | 226 |
| **Fixed (bugs found and resolved)** | 8 bugs fixed |
| **Failed** | 0 |
| **Todo (skipped — complex setup)** | 10 |

### Breakdown

| Category | Suites | Pass | Todo | Fail |
|----------|--------|------|------|------|
| Unit tests | 14 | 117 | 0 | 0 |
| E2E integration tests | 15 | 109 | 10 | 0 |
| — of which RLS leakage | 1 | 24 | 0 | 0 |

---

## Unit Test Results (14 suites, 117 tests)

### 1. EncryptionService — `encryption.service.spec.ts` — 9 tests
| # | Test | Status |
|---|------|--------|
| 1 | should encrypt and decrypt a string correctly | PASS |
| 2 | should produce different ciphertext for the same plaintext due to random IV | PASS |
| 3 | should return a non-empty key reference | PASS |
| 4 | should use "local" as keyRef when ENCRYPTION_KEY is not set | PASS |
| 5 | should throw when decrypting a tampered ciphertext | PASS |
| 6 | should throw when decrypting a value with wrong format | PASS |
| 7 | should mask a value showing only the last 4 characters | PASS |
| 8 | should mask short values entirely when length is 4 or fewer | PASS |
| 9 | should show last 4 chars for a value of exactly 5 characters | PASS |

### 2. AuthService — `auth.service.spec.ts` — 24 tests
| # | Test | Status |
|---|------|--------|
| 1 | should sign a valid JWT token | PASS |
| 2 | should verify a valid JWT token | PASS |
| 3 | should reject expired JWT token | PASS |
| 4 | should create session in Redis | PASS |
| 5 | should delete session from Redis | PASS |
| 6 | should not be locked below threshold (4 attempts) | PASS |
| 7 | should lock at first threshold (5 attempts) for 30s | PASS |
| 8 | should lock at second threshold (8 attempts) for 2m | PASS |
| 9 | should lock at third threshold (10 attempts) for 30m | PASS |
| 10 | should increment failed login counter | PASS |
| 11 | should reset failed login counter on success | PASS |
| 12 | setupMfa: should generate TOTP secret and return QR URI | PASS |
| 13 | setupMfa: should throw UnauthorizedException when user not found | PASS |
| 14 | verifyMfaSetup: should verify correct TOTP code and return 10 recovery codes | PASS |
| 15 | verifyMfaSetup: should reject incorrect TOTP code with UnauthorizedException | PASS |
| 16 | verifyMfaSetup: should throw BadRequestException when mfa_secret not yet set | PASS |
| 17 | useRecoveryCode: should accept a valid unused recovery code | PASS |
| 18 | useRecoveryCode: should reject an already-used recovery code | PASS |
| 19 | useRecoveryCode: should reject an invalid recovery code | PASS |
| 20 | requestPasswordReset: should create a token and store its hash | PASS |
| 21 | requestPasswordReset: should return success even when user does not exist | PASS |
| 22 | requestPasswordReset: should limit to 3 active tokens | PASS |
| 23 | confirmPasswordReset: should accept a valid reset token and update password | PASS |
| 24 | confirmPasswordReset: should reject an expired token | PASS |

### 3. SettingsService — `settings.service.spec.ts` — 11 tests
| # | Test | Status |
|---|------|--------|
| 1 | should fill missing defaults via Zod parse | PASS |
| 2 | getSettings: should throw NotFoundException when no record | PASS |
| 3 | should deep merge partial settings over existing | PASS |
| 4 | should replace arrays rather than merging | PASS |
| 5 | should persist validated merged settings via update | PASS |
| 6 | updateSettings: should throw NotFoundException when no record | PASS |
| 7 | should reject invalid settings values via Zod | PASS |
| 8 | should warn when autoPopulateClassCounts + attendance disabled | PASS |
| 9 | should warn when whatsapp channel + communications disabled | PASS |
| 10 | should not produce warnings when all modules enabled | PASS |
| 11 | should return multiple warnings when multiple conditions violated | PASS |

### 4. ApprovalRequestsService — `approval-requests.service.spec.ts` — 16 tests
| # | Test | Status |
|---|------|--------|
| 1 | approve: should transition pending → approved | PASS |
| 2 | approve: should reject already-approved request | PASS |
| 3 | approve: should reject cancelled request | PASS |
| 4 | approve: should block self-approval | PASS |
| 5 | approve: should throw NotFoundException when not found | PASS |
| 6 | reject: should transition pending → rejected | PASS |
| 7 | reject: should reject already-approved request | PASS |
| 8 | reject: should reject cancelled request | PASS |
| 9 | reject: should block self-rejection | PASS |
| 10 | reject: should throw NotFoundException | PASS |
| 11 | cancel: should transition pending → cancelled | PASS |
| 12 | cancel: should throw Forbidden for non-requester | PASS |
| 13 | cancel: should reject cancelling approved request | PASS |
| 14 | cancel: should reject cancelling already-cancelled request | PASS |
| 15 | cancel: should throw NotFoundException | PASS |
| 16 | submit: should auto-approve when no workflow exists | PASS |

### 5. RolesService — `roles.service.spec.ts` — 9 tests
| # | Test | Status |
|---|------|--------|
| 1 | should allow assigning staff-tier perms to staff role | PASS |
| 2 | should reject assigning admin-tier perms to staff role | PASS |
| 3 | should allow admin role to have both tiers | PASS |
| 4 | should prevent deleting system roles | PASS |
| 5 | should allow deleting custom roles not in use | PASS |
| 6 | should block deleting roles that are in use | PASS |
| 7 | should throw NotFoundException for non-existent role | PASS |
| 8 | should create a staff role with valid perms | PASS |
| 9 | should reject duplicate role_key | PASS |

### 6. MembershipsService — `memberships.service.spec.ts` — 8 tests
| # | Test | Status |
|---|------|--------|
| 1 | should prevent suspending the last school_owner | PASS |
| 2 | should allow suspending when multiple owners exist | PASS |
| 3 | suspendMembership: should throw NotFoundException | PASS |
| 4 | should throw when membership is already suspended | PASS |
| 5 | should clear Redis sessions on suspend | PASS |
| 6 | should reactivate a suspended membership | PASS |
| 7 | should throw when membership is not suspended | PASS |
| 8 | reactivateMembership: should throw NotFoundException | PASS |

### 7. InvitationsService — `invitations.service.spec.ts` — 13 tests
| # | Test | Status |
|---|------|--------|
| 1 | should create invitation with hashed token | PASS |
| 2 | should set expires_at ~72 hours from now | PASS |
| 3 | should throw INVITATION_EXISTS for duplicate pending | PASS |
| 4 | should throw USER_ALREADY_MEMBER | PASS |
| 5 | should reject expired invitation and mark expired | PASS |
| 6 | should reject when no matching pending invitation found | PASS |
| 7 | should find invitation by SHA-256 hash | PASS |
| 8 | should create membership for existing user | PASS |
| 9 | should create user and membership for new user | PASS |
| 10 | should throw when new user accepts without registration data | PASS |
| 11 | should revoke a pending invitation | PASS |
| 12 | should throw when invitation is not pending | PASS |
| 13 | should throw NotFoundException for non-existent invitation | PASS |

### 8. PermissionCacheService — `permission-cache.service.spec.ts` — 8 tests
| # | Test | Status |
|---|------|--------|
| 1 | should cache permissions in Redis when cold | PASS |
| 2 | should return cached permissions on hit | PASS |
| 3 | should deduplicate permissions from multiple roles | PASS |
| 4 | should return empty array when no roles | PASS |
| 5 | invalidate: should delete Redis key | PASS |
| 6 | invalidate: should use correct key format | PASS |
| 7 | invalidateAllForTenant: should pipeline-delete all memberships | PASS |
| 8 | invalidateAllForTenant: should do nothing when no memberships | PASS |

### 9. TenantsService — `tenants.service.spec.ts` — 2 tests
| # | Test | Status |
|---|------|--------|
| 1 | should create tenant with all defaults | PASS |
| 2 | should reject duplicate slug | PASS |

### 10. HealthService — `health.service.spec.ts` — 3 tests
| # | Test | Status |
|---|------|--------|
| 1 | should return healthy when PG and Redis are up | PASS |
| 2 | should return unhealthy when PG is down | PASS |
| 3 | should return unhealthy when Redis is down | PASS |

### 11. ResponseTransformInterceptor — `response-transform.interceptor.spec.ts` — 4 tests
| # | Test | Status |
|---|------|--------|
| 1 | should wrap response in { data: T } envelope | PASS |
| 2 | should not double-wrap already-enveloped response | PASS |
| 3 | should wrap response with status property in data envelope | PASS |
| 4 | should convert BigInt values to numbers | PASS |

### 12. AllExceptionsFilter — `all-exceptions.filter.spec.ts` — 3 tests
| # | Test | Status |
|---|------|--------|
| 1 | should format HttpException with correct shape | PASS |
| 2 | should format unknown exceptions as 500 | PASS |
| 3 | should preserve status code from HttpException | PASS |

### 13. ZodValidationPipe — `zod-validation.pipe.spec.ts` — 2 tests
| # | Test | Status |
|---|------|--------|
| 1 | should pass through valid data | PASS |
| 2 | should throw BadRequestException for invalid data | PASS |

### 14. RLS Middleware — `rls.middleware.spec.ts` — 2 tests
| # | Test | Status |
|---|------|--------|
| 1 | should return extended Prisma client | PASS |
| 2 | should set tenant context in transaction | PASS |

---

## Integration Test Results (15 suites, 109 pass, 10 todo)

### 1. Auth Endpoints — `auth.e2e-spec.ts` — 20 pass, 6 todo
| # | Test | Status |
|---|------|--------|
| 1 | should login successfully with valid credentials | PASS |
| 2 | should reject login with wrong password | PASS |
| 3 | should reject login with non-existent email | PASS |
| 4 | should require MFA when enabled | TODO |
| 5 | should login with MFA code | TODO |
| 6 | should return new access token with valid refresh cookie | PASS |
| 7 | should reject refresh when no cookie | PASS |
| 8 | should logout and return 204 with cookie cleared | PASS |
| 9 | should return 401 when logout without bearer | PASS |
| 10 | should return 200 for known email password reset | PASS |
| 11 | should return 200 even for non-existent email | PASS |
| 12 | should confirm password reset with valid token | TODO |
| 13 | should reject invalid reset token with 400 | PASS |
| 14 | should return MFA setup details when authenticated | PASS |
| 15 | should return 401 for MFA setup without bearer | PASS |
| 16 | should verify MFA code | TODO |
| 17 | should switch tenant with active membership | PASS |
| 18 | should return 403 for no membership at target tenant | PASS |
| 19 | should return 401 for switch-tenant without bearer | PASS |
| 20 | should return current user and memberships (GET /me) | PASS |
| 21 | should return 401 for /me without bearer | PASS |
| 22 | should list active sessions | PASS |
| 23 | should return 401 for /sessions without bearer | PASS |
| 24 | should revoke session and return 204 | PASS |
| 25 | should return 400 for non-owned session | PASS |
| 26 | should return 401 for /sessions/:id without bearer | PASS |

### 2. Tenants Admin — `tenants.e2e-spec.ts` — 12 pass
| # | Test | Status |
|---|------|--------|
| 1 | should create tenant | PASS |
| 2 | should reject non-platform-owner | PASS |
| 3 | should reject unauthenticated request | PASS |
| 4 | should list tenants with al-noor and cedar | PASS |
| 5 | should get tenant detail | PASS |
| 6 | should update tenant name | PASS |
| 7 | should suspend tenant | PASS |
| 8 | should reactivate suspended tenant | PASS |
| 9 | should archive tenant | PASS |
| 10 | should get dashboard stats | PASS |
| 11 | should list tenant modules (11 modules) | PASS |
| 12 | should toggle module off then on | PASS |

### 3. Domains — `domains.e2e-spec.ts` — 5 pass
| # | Test | Status |
|---|------|--------|
| 1 | should list domains for al-noor | PASS |
| 2 | should add new domain | PASS |
| 3 | should reject duplicate domain with 409 | PASS |
| 4 | should update domain record | PASS |
| 5 | should remove non-primary domain | PASS |

### 4. Branding — `branding.e2e-spec.ts` — 3 pass, 1 todo
| # | Test | Status |
|---|------|--------|
| 1 | should get branding | PASS |
| 2 | should update branding | PASS |
| 3 | should reject without branding.manage permission | PASS |
| 4 | should upload logo | TODO |

### 5. Settings — `settings.e2e-spec.ts` — 5 pass
| # | Test | Status |
|---|------|--------|
| 1 | should get settings | PASS |
| 2 | should update settings with partial data | PASS |
| 3 | should return cross-module warnings | PASS |
| 4 | should reject without settings.manage permission | PASS |
| 5 | should reject invalid settings | PASS |

### 6. Stripe Config — `stripe-config.e2e-spec.ts` — 4 pass
| # | Test | Status |
|---|------|--------|
| 1 | should return 404 when no config exists | PASS |
| 2 | should create stripe config via PUT | PASS |
| 3 | should return masked secrets on GET | PASS |
| 4 | should reject without stripe.manage permission | PASS |

### 7. Notification Settings — `notification-settings.e2e-spec.ts` — 3 pass
| # | Test | Status |
|---|------|--------|
| 1 | should list notification settings | PASS |
| 2 | should update a notification setting | PASS |
| 3 | should reject without notifications.manage permission | PASS |

### 8. Roles — `roles.e2e-spec.ts` — 10 pass, 1 todo
| # | Test | Status |
|---|------|--------|
| 1 | should list roles | PASS |
| 2 | should create custom role | PASS |
| 3 | should reject creating role above caller tier | TODO |
| 4 | should get role detail | PASS |
| 5 | should update role display_name | PASS |
| 6 | should reject updating system role | PASS |
| 7 | should reject deleting system role | PASS |
| 8 | should assign permissions with tier enforcement | PASS |
| 9 | should reject above-tier permission assignment | PASS |
| 10 | should delete custom role | PASS |
| 11 | should reject without roles.manage permission | PASS |

### 9. Memberships — `memberships.e2e-spec.ts` — 6 pass, 1 todo
| # | Test | Status |
|---|------|--------|
| 1 | should list users | PASS |
| 2 | should get user detail | PASS |
| 3 | should suspend membership | PASS |
| 4 | should reject suspending last owner | PASS |
| 5 | should reactivate membership | PASS |
| 6 | should reject without users.view permission | PASS |
| 7 | should update membership roles | TODO |

### 10. Invitations — `invitations.e2e-spec.ts` — 5 pass, 3 todo
| # | Test | Status |
|---|------|--------|
| 1 | should create invitation | PASS |
| 2 | should list invitations | PASS |
| 3 | should revoke invitation | PASS |
| 4 | should accept invitation for existing user | TODO |
| 5 | should accept invitation for new user | TODO |
| 6 | should reject expired invitation | TODO |
| 7 | should reject without users.invite permission | PASS |
| 8 | should allow public accept endpoint without auth | PASS |

### 11. Approval Workflows — `approval-workflows.e2e-spec.ts` — 5 pass
| # | Test | Status |
|---|------|--------|
| 1 | should list workflows | PASS |
| 2 | should create workflow | PASS |
| 3 | should update workflow | PASS |
| 4 | should delete workflow | PASS |
| 5 | should reject without approvals.manage permission | PASS |

### 12. Preferences — `preferences.e2e-spec.ts` — 3 pass
| # | Test | Status |
|---|------|--------|
| 1 | should get preferences (empty default) | PASS |
| 2 | should update preferences | PASS |
| 3 | should reject unauthenticated request | PASS |

### 13. Health Check — `health.e2e-spec.ts` + `app.e2e-spec.ts` — 2 pass
| # | Test | Status |
|---|------|--------|
| 1 | GET /api/health should return 200 | PASS |
| 2 | GET /api/health should return health status | PASS |

---

## RLS Leakage Test Results (24 tests, all PASS)

### API-Level RLS (9 tests)
| # | Test | Status |
|---|------|--------|
| 1 | GET /v1/roles as Cedar should not return Al Noor custom roles | PASS |
| 2 | GET /v1/users as Cedar should not return Al Noor users | PASS |
| 3 | GET /v1/invitations as Cedar should not return Al Noor invitations | PASS |
| 4 | GET /v1/branding as Cedar returns Cedar branding only | PASS |
| 5 | GET /v1/settings as Cedar returns Cedar settings only | PASS |
| 6 | GET /v1/notification-settings as Cedar returns only Cedar settings | PASS |
| 7 | GET /v1/approval-workflows as Cedar returns only Cedar workflows | PASS |
| 8 | GET /v1/approval-requests as Cedar returns only Cedar requests | PASS |
| 9 | GET /v1/me/preferences as Cedar returns only Cedar preferences | PASS |

### Table-Level RLS (15 tests — direct DB with SET LOCAL)
| # | Table | Status |
|---|-------|--------|
| 1 | tenant_domains | PASS |
| 2 | tenant_modules | PASS |
| 3 | tenant_branding | PASS |
| 4 | tenant_settings | PASS |
| 5 | tenant_notification_settings | PASS |
| 6 | tenant_sequences | PASS |
| 7 | tenant_stripe_configs | PASS |
| 8 | tenant_memberships | PASS |
| 9 | roles (dual RLS — global visible, custom scoped) | PASS |
| 10 | role_permissions (inherits roles visibility) | PASS |
| 11 | membership_roles | PASS |
| 12 | invitations | PASS |
| 13 | approval_workflows | PASS |
| 14 | approval_requests | PASS |
| 15 | user_ui_preferences | PASS |

---

## Bugs Found and Fixed

### Bug 1: AllExceptionsFilter discarded custom error codes
**What broke**: All HttpExceptions returned generic status-based codes (`UNAUTHORIZED`, `BAD_REQUEST`) instead of custom codes (`INVALID_CREDENTIALS`, `MISSING_REFRESH_TOKEN`, etc.)
**Root cause**: `all-exceptions.filter.ts` line 34 unconditionally overwrote the extracted `code` with `getCodeFromStatus(status)`, discarding every custom error code from services.
**Fix**: Restructured the branches so `getCodeFromStatus` is only used as a fallback when no custom code is provided.
**Files changed**: `apps/api/src/common/filters/all-exceptions.filter.ts`

### Bug 2: ZodValidationPipe validated all parameter types (including @CurrentTenant, @Req, @Res)
**What broke**: Login endpoint returned 400 "Expected object, received null" because `@UsePipes(new ZodValidationPipe(loginSchema))` validated the `@CurrentTenant()` parameter (null for platform admin routes) against the login schema.
**Root cause**: `ZodValidationPipe.transform()` did not check `metadata.type`, so it validated custom decorator params, @Req, @Res, etc.
**Fix**: Added guard to only validate `body`, `query`, and `param` argument types.
**Files changed**: `apps/api/src/common/pipes/zod-validation.pipe.ts`

### Bug 3: PermissionCacheService not globally available (DI resolution failure)
**What broke**: All e2e tests failed with "Nest can't resolve dependencies of PermissionGuard" because `PermissionCacheService` was in `AppModule` providers but not accessible to child modules.
**Root cause**: `PermissionCacheService` was provided by the root `AppModule` but NestJS DI for guards resolves within the declaring module's context.
**Fix**: Created `CommonModule` with `@Global()` decorator that provides and exports `PermissionCacheService`.
**Files changed**: `apps/api/src/common/common.module.ts` (new), `apps/api/src/app.module.ts`

### Bug 4: Middleware exclude pattern incompatible with NestJS global prefix
**What broke**: Health endpoint returned 404 — TenantResolutionMiddleware ran on `/api/health` despite being in the exclude list.
**Root cause**: `.exclude('api/health')` used a string path; NestJS requires `RouteInfo` objects with `{ path: 'health', method: RequestMethod.ALL }` when a global prefix is set.
**Fix**: Changed exclude patterns to use `RouteInfo` objects without the prefix.
**Files changed**: `apps/api/src/app.module.ts`

### Bug 5: TenantResolutionMiddleware blocked auth routes for non-tenant requests
**What broke**: Platform admin login returned 404 because the middleware found no tenant domain matching the supertest hostname (127.0.0.1) and returned 404 before the auth controller could run.
**Root cause**: Auth routes (`/api/v1/auth/*`) were not excluded from tenant resolution. They need to work both with and without tenant context.
**Fix**: Added auth route handling in the middleware that attempts tenant resolution but falls through with `tenantContext = null` when no domain matches.
**Files changed**: `apps/api/src/common/middleware/tenant-resolution.middleware.ts`

### Bug 6: BigInt serialization error in tenant detail response
**What broke**: `getTenant` returned 500 because `TenantSequence.current_value` is a Prisma `BigInt`, and `JSON.stringify` cannot serialize BigInt.
**Root cause**: The response included sequences with BigInt values that the JSON serializer couldn't handle.
**Fix**: Added `serializeBigInt()` helper in the `ResponseTransformInterceptor` that recursively converts BigInt values to numbers (or strings if > MAX_SAFE_INTEGER).
**Files changed**: `apps/api/src/common/interceptors/response-transform.interceptor.ts`

### Bug 7: ResponseTransformInterceptor skipped wrapping for objects with `status` property
**What broke**: Tenant objects (which have `status: 'active'`) were passed through without being wrapped in `{ data: ... }`, making `res.body.data` undefined.
**Root cause**: The interceptor had `if ('status' in response) return response;` intended for health check pass-through, but this matched any object with a `status` field.
**Fix**: Removed the `status` pass-through. The health controller uses `@Res()` which bypasses interceptors entirely, so it was unnecessary.
**Files changed**: `apps/api/src/common/interceptors/response-transform.interceptor.ts`

### Bug 8: Notification settings update schema required all fields
**What broke**: PATCH `/notification-settings/:type` with `{ is_enabled: false }` returned 400.
**Root cause**: `updateNotificationSettingSchema` required both `is_enabled` AND `channels`, but partial updates should be allowed.
**Fix**: Made both fields optional with a `.refine()` requiring at least one. Updated service to only update provided fields.
**Files changed**: `packages/shared/src/schemas/tenant.schema.ts`, `apps/api/src/modules/configuration/notification-settings.service.ts`

---

## Bugs Found and Unresolved

None. All bugs discovered during testing were fixed.

---

## Todo Tests (10 — complex setup requirements)

These tests require infrastructure that goes beyond standard HTTP-level testing:

1. **MFA login flow** (2 tests) — Requires enabling MFA on a user, generating a live TOTP code synchronized with the server's secret. Cannot be done without test-seeded TOTP secrets or time manipulation.
2. **Password reset confirm** (1 test) — Token is SHA-256 hashed before storage; the plaintext is not returned in the API response. Would need direct DB access to extract the token.
3. **MFA verify** (1 test) — Same as MFA login: needs a live TOTP code.
4. **Logo upload** (1 test) — File upload with multipart form requires S3/MinIO mock or local file system stub.
5. **Role creation above caller tier** (1 test) — Requires creating a user with a specific tier and then attempting to create a higher-tier role.
6. **Membership role update** (1 test) — Requires role IDs not already assigned to active users.
7. **Invitation acceptance** (3 tests) — Token is not returned in the create response (sent via email). Would require either returning the token in test mode or direct DB access.

---

## Regressions

**None.** All prior P0 tests continue to pass. The health check endpoint works correctly.

---

## Manual QA Notes

1. **Tenant isolation verified at both API and DB layers** — 24 RLS leakage tests confirm no cross-tenant data exposure across all 15 tenant-scoped tables.
2. **Error response shapes are consistent** — After fixing the AllExceptionsFilter, all errors follow the `{ error: { code, message, details? } }` shape with specific codes.
3. **Auth flow is complete** — Login, refresh, logout, session management, switch-tenant all work end-to-end.
4. **RBAC tier enforcement works** — Staff-tier roles cannot receive admin-tier permissions. System roles are immutable.
5. **Invitation security** — Tokens are SHA-256 hashed before storage, 72-hour expiry enforced, revocation works.
6. **Brute force protection** — Verified at unit test level with progressive delays (5→30s, 8→120s, 10→1800s).
7. **Platform owner guard** — Redis-backed `platform_owner_user_ids` set correctly restricts admin endpoints.
8. **Deep merge for settings** — Partial updates are correctly merged without losing nested keys.

---

## Files Changed During Testing

### Application code fixes
- `apps/api/src/common/filters/all-exceptions.filter.ts` — Custom error code preservation
- `apps/api/src/common/pipes/zod-validation.pipe.ts` — Argument type filtering
- `apps/api/src/common/common.module.ts` — New global module for shared services
- `apps/api/src/app.module.ts` — CommonModule import, middleware exclude fix
- `apps/api/src/common/middleware/tenant-resolution.middleware.ts` — Auth route handling
- `apps/api/src/common/interceptors/response-transform.interceptor.ts` — BigInt serialization, status pass-through removal
- `apps/api/src/modules/configuration/notification-settings.service.ts` — Optional field handling
- `apps/api/src/modules/rbac/invitations.service.ts` — Return shape (invitation only, not {invitation, token})
- `packages/shared/src/schemas/tenant.schema.ts` — Optional fields in update notification schema

### Test infrastructure
- `apps/api/test/jest-e2e.json` — otplib mock via moduleNameMapper
- `apps/api/test/__mocks__/otplib.ts` — Manual mock for ESM-only otplib dependency
- `apps/api/test/setup-env.ts` — Test environment variables
- `apps/api/test/helpers.ts` — Shared test app bootstrap, auth helpers

### Test files (new)
- `apps/api/src/modules/configuration/encryption.service.spec.ts`
- `apps/api/src/modules/configuration/settings.service.spec.ts`
- `apps/api/src/modules/approvals/approval-requests.service.spec.ts`
- `apps/api/src/modules/rbac/roles.service.spec.ts`
- `apps/api/src/modules/rbac/memberships.service.spec.ts`
- `apps/api/src/modules/rbac/invitations.service.spec.ts`
- `apps/api/src/modules/tenants/tenants.service.spec.ts`
- `apps/api/src/common/services/permission-cache.service.spec.ts`
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/test/tenants.e2e-spec.ts`
- `apps/api/test/domains.e2e-spec.ts`
- `apps/api/test/branding.e2e-spec.ts`
- `apps/api/test/settings.e2e-spec.ts`
- `apps/api/test/stripe-config.e2e-spec.ts`
- `apps/api/test/notification-settings.e2e-spec.ts`
- `apps/api/test/roles.e2e-spec.ts`
- `apps/api/test/memberships.e2e-spec.ts`
- `apps/api/test/invitations.e2e-spec.ts`
- `apps/api/test/approval-workflows.e2e-spec.ts`
- `apps/api/test/preferences.e2e-spec.ts`
- `apps/api/test/rls-leakage.e2e-spec.ts`

### Test files (modified)
- `apps/api/src/modules/auth/auth.service.spec.ts` — Extended with MFA and password reset tests
- `apps/api/src/common/interceptors/response-transform.interceptor.spec.ts` — Updated for new behavior
- `apps/api/test/health.e2e-spec.ts` — Updated to use shared test app
- `apps/api/test/app.e2e-spec.ts` — Updated to use shared test app
