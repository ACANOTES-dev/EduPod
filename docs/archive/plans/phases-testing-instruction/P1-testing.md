# P1 Testing — Tenancy, Users, RBAC, Branding

---

## Section 1 — Unit Tests

### 1.1 EncryptionService (`apps/api/src/modules/configuration/encryption.service.spec.ts`)

| Test                                                     | Description                             | Expected                                        |
| -------------------------------------------------------- | --------------------------------------- | ----------------------------------------------- |
| `should encrypt and decrypt a string correctly`          | Encrypt "sk_test_abc123", then decrypt. | Decrypted value === original                    |
| `should produce different ciphertext for same plaintext` | Encrypt same value twice.               | Two different encrypted strings (different IVs) |
| `should return correct key reference`                    | Encrypt any value.                      | `keyRef` is a non-empty string                  |
| `should mask a value showing only last 4 chars`          | `mask("sk_test_abc123")`                | `"****c123"`                                    |
| `should mask short values`                               | `mask("abc")`                           | `"****abc"` (or `"****"` if < 4 chars)          |
| `should throw on decrypt with wrong key ref`             | Encrypt with key A, decrypt with key B. | Throws error                                    |
| `should throw on decrypt with tampered ciphertext`       | Modify ciphertext bytes.                | Throws error (auth tag failure)                 |

### 1.2 AuthService — Brute Force Logic (`apps/api/src/modules/auth/auth.service.spec.ts`)

| Test                                  | Description                 | Expected                                  |
| ------------------------------------- | --------------------------- | ----------------------------------------- |
| `should allow login on first attempt` | No prior failures.          | Login proceeds                            |
| `should track failed attempts`        | Fail 3 times.               | Attempts counter incremented              |
| `should delay after 5 failures`       | Fail 5 times, then attempt. | Throws BRUTE_FORCE_LOCKED with ~30s delay |
| `should delay after 8 failures`       | Fail 8 times.               | Throws with ~2min delay                   |
| `should delay after 10 failures`      | Fail 10 times.              | Throws with ~30min delay                  |

### 1.3 AuthService — JWT and Sessions

| Test                                            | Description                | Expected                                                |
| ----------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| `should generate valid JWT with correct claims` | Sign JWT for user.         | Token decodes with sub, email, tenant_id, membership_id |
| `should generate refresh token with session_id` | Sign refresh token.        | Token contains session_id claim                         |
| `should reject expired JWT`                     | Verify token after expiry. | Throws                                                  |
| `should reject tampered JWT`                    | Modify payload bytes.      | Throws                                                  |
| `should store session in Redis on login`        | Login successfully.        | Redis contains session key                              |
| `should delete session from Redis on logout`    | Login, then logout.        | Session key removed                                     |

### 1.4 AuthService — MFA

| Test                                       | Description                                  | Expected                                |
| ------------------------------------------ | -------------------------------------------- | --------------------------------------- |
| `should generate TOTP secret and QR URI`   | Call setupMfa().                             | Returns { secret, qr_uri, qr_data_url } |
| `should verify correct TOTP code`          | Generate secret, compute valid code, verify. | MFA enabled on user                     |
| `should reject incorrect TOTP code`        | Verify with wrong code.                      | Throws INVALID_MFA_CODE                 |
| `should generate 10 recovery codes`        | Complete MFA setup.                          | 10 hashed codes stored in DB            |
| `should accept valid recovery code`        | Use one of the 10 codes.                     | Login succeeds, code marked used        |
| `should reject already-used recovery code` | Use same code twice.                         | Second attempt fails                    |
| `should reject invalid recovery code`      | Use random string.                           | Fails                                   |

### 1.5 AuthService — Password Reset

| Test                                         | Description                 | Expected                                       |
| -------------------------------------------- | --------------------------- | ---------------------------------------------- |
| `should generate reset token and store hash` | Request reset.              | Token hash stored, expires in future           |
| `should accept valid reset token`            | Confirm with correct token. | Password updated                               |
| `should reject expired token`                | Use token after expiry.     | Throws                                         |
| `should reject already-used token`           | Use token twice.            | Second attempt fails                           |
| `should limit to 3 active tokens per user`   | Request 4 times.            | Only 3 active at once (oldest reused/replaced) |

### 1.6 SettingsService — Deep Merge & Validation

| Test                                         | Description                                                                                                                               | Expected                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `should deep merge partial settings`         | Existing: `{attendance: {allowTeacherAmendment: false, pendingAlertTimeHour: 14}}`, Update: `{attendance: {allowTeacherAmendment: true}}` | Merged: `{attendance: {allowTeacherAmendment: true, pendingAlertTimeHour: 14}}` |
| `should replace arrays not merge them`       | Existing has `channels: ["email"]`, update `channels: ["sms"]`                                                                            | Result: `channels: ["sms"]`                                                     |
| `should fill missing defaults via Zod parse` | Partial settings without some fields.                                                                                                     | Full settings with Zod defaults                                                 |
| `should reject invalid settings values`      | Pass `{attendance: {pendingAlertTimeHour: "not a number"}}`                                                                               | Throws validation error                                                         |

### 1.7 SettingsService — Cross-Module Warnings

| Test                                                                           | Description                                                                           | Expected                                         |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `should warn when autoPopulateClassCounts=true but attendance module disabled` | Set payroll.autoPopulateClassCounts=true, attendance module disabled.                 | Warning: 'payroll.autoPopulateClassCounts'       |
| `should warn when whatsapp channel set but communications module disabled`     | Set communications.primaryOutboundChannel='whatsapp', communications module disabled. | Warning: 'communications.primaryOutboundChannel' |
| `should not warn when module is enabled`                                       | Same settings but modules enabled.                                                    | No warnings                                      |

### 1.8 RolesService — Tier Enforcement

| Test                                                           | Description                                        | Expected              |
| -------------------------------------------------------------- | -------------------------------------------------- | --------------------- |
| `should allow assigning staff-tier permissions to staff role`  | Create staff role, assign staff permission.        | Success               |
| `should reject assigning admin-tier permissions to staff role` | Create staff role, try to assign admin permission. | Throws TIER_VIOLATION |
| `should allow admin to have both admin and staff permissions`  | Create admin role, assign both tiers.              | Success               |
| `should prevent deleting system roles`                         | Try to delete school_admin.                        | Throws error          |
| `should allow deleting custom roles`                           | Create custom role, then delete.                   | Success               |

### 1.9 MembershipsService — Last School Owner Guard

| Test                                                        | Description                   | Expected                 |
| ----------------------------------------------------------- | ----------------------------- | ------------------------ |
| `should prevent suspending the last school_owner`           | Only 1 owner, try to suspend. | Throws LAST_SCHOOL_OWNER |
| `should allow suspending when multiple owners exist`        | 2 owners, suspend one.        | Success                  |
| `should prevent removing school_owner role from last owner` | 1 owner, try to change roles. | Throws LAST_SCHOOL_OWNER |

### 1.10 InvitationsService — Token Flow

| Test                                                       | Description                     | Expected                               |
| ---------------------------------------------------------- | ------------------------------- | -------------------------------------- |
| `should create invitation with hashed token`               | Create invitation.              | DB has token_hash, not plaintext token |
| `should set 72h expiry`                                    | Create invitation.              | expires_at = now + 72h                 |
| `should reject expired invitation on accept`               | Accept after expiry.            | Throws INVITATION_EXPIRED              |
| `should reject revoked invitation`                         | Revoke then accept.             | Throws                                 |
| `should create membership on accept for existing user`     | Existing user accepts.          | New TenantMembership created           |
| `should create user and membership on accept for new user` | New user accepts with password. | New User + TenantMembership created    |

### 1.11 TenantsService — Provisioning

| Test                                     | Description                          | Expected                                                                                           |
| ---------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `should create tenant with all defaults` | Call createTenant().                 | Tenant + domain + branding + settings + 11 modules + 12 notifications + 4 sequences + system roles |
| `should reject duplicate slug`           | Create two tenants with same slug.   | Throws SLUG_TAKEN                                                                                  |
| `should reject duplicate domain`         | Create two tenants with same domain. | Throws DOMAIN_TAKEN                                                                                |

### 1.12 ApprovalRequestsService — State Machine

| Test                                               | Description                | Expected                          |
| -------------------------------------------------- | -------------------------- | --------------------------------- |
| `should transition pending_approval → approved`    | Approve pending request.   | Status = approved, decided_at set |
| `should transition pending_approval → rejected`    | Reject pending request.    | Status = rejected                 |
| `should transition pending_approval → cancelled`   | Cancel pending request.    | Status = cancelled                |
| `should reject approving already-approved request` | Try to approve again.      | Throws INVALID_STATUS_TRANSITION  |
| `should reject approving cancelled request`        | Approve cancelled request. | Throws                            |

### 1.13 PermissionCacheService

| Test                                              | Description                    | Expected                             |
| ------------------------------------------------- | ------------------------------ | ------------------------------------ |
| `should cache permissions in Redis`               | Load permissions, check Redis. | Redis key exists with TTL            |
| `should return cached permissions on second call` | Call twice.                    | Second call reads from Redis, not DB |
| `should invalidate cache`                         | Load, invalidate, load again.  | Second load hits DB                  |

---

## Section 2 — Integration Tests

### 2.1 Auth Endpoints (`apps/api/test/auth.e2e-spec.ts`)

| Test                                        | Method | Path                              | Scenario                       | Expected                                 |
| ------------------------------------------- | ------ | --------------------------------- | ------------------------------ | ---------------------------------------- |
| `should login successfully`                 | POST   | `/v1/auth/login`                  | Valid credentials.             | 200, { access_token, user } + Set-Cookie |
| `should reject wrong password`              | POST   | `/v1/auth/login`                  | Wrong password.                | 401, INVALID_CREDENTIALS                 |
| `should reject non-existent email`          | POST   | `/v1/auth/login`                  | Unknown email.                 | 401, INVALID_CREDENTIALS                 |
| `should require MFA when enabled`           | POST   | `/v1/auth/login`                  | User has MFA, no code.         | 200, { mfa_required: true }              |
| `should login with MFA code`                | POST   | `/v1/auth/login`                  | User has MFA, correct code.    | 200, { access_token }                    |
| `should refresh token`                      | POST   | `/v1/auth/refresh`                | Valid refresh cookie.          | 200, { access_token }                    |
| `should reject refresh without cookie`      | POST   | `/v1/auth/refresh`                | No cookie.                     | 401                                      |
| `should logout and clear cookie`            | POST   | `/v1/auth/logout`                 | Valid JWT.                     | 204, cookie cleared                      |
| `should request password reset`             | POST   | `/v1/auth/password-reset/request` | Valid email.                   | 200                                      |
| `should confirm password reset`             | POST   | `/v1/auth/password-reset/confirm` | Valid token + new password.    | 200                                      |
| `should reject invalid reset token`         | POST   | `/v1/auth/password-reset/confirm` | Invalid token.                 | 400                                      |
| `should setup MFA`                          | POST   | `/v1/auth/mfa/setup`              | Authenticated.                 | 200, { secret, qr_uri, qr_data_url }     |
| `should verify MFA code`                    | POST   | `/v1/auth/mfa/verify`             | Valid TOTP code.               | 200                                      |
| `should switch tenant`                      | POST   | `/v1/auth/switch-tenant`          | User has membership in target. | 200, { access_token }                    |
| `should reject switch to non-member tenant` | POST   | `/v1/auth/switch-tenant`          | No membership.                 | 403                                      |
| `should get current user`                   | GET    | `/v1/auth/me`                     | Authenticated.                 | 200, user + memberships                  |
| `should list sessions`                      | GET    | `/v1/auth/sessions`               | Authenticated.                 | 200, { data: sessions[] }                |
| `should revoke session`                     | DELETE | `/v1/auth/sessions/:id`           | Own session.                   | 204                                      |

### 2.2 Platform Admin Endpoints (`apps/api/test/tenants.e2e-spec.ts`)

| Test                               | Method | Path                                 | Scenario            | Expected                      |
| ---------------------------------- | ------ | ------------------------------------ | ------------------- | ----------------------------- |
| `should create tenant`             | POST   | `/v1/admin/tenants`                  | PlatformOwner auth. | 201, tenant with all defaults |
| `should reject non-platform-owner` | POST   | `/v1/admin/tenants`                  | Regular user auth.  | 403                           |
| `should reject unauthenticated`    | POST   | `/v1/admin/tenants`                  | No auth.            | 401                           |
| `should list tenants`              | GET    | `/v1/admin/tenants`                  | PlatformOwner.      | 200, paginated list           |
| `should get tenant detail`         | GET    | `/v1/admin/tenants/:id`              | PlatformOwner.      | 200, tenant                   |
| `should update tenant`             | PATCH  | `/v1/admin/tenants/:id`              | PlatformOwner.      | 200, updated                  |
| `should suspend tenant`            | POST   | `/v1/admin/tenants/:id/suspend`      | PlatformOwner.      | 200, status=suspended         |
| `should reactivate tenant`         | POST   | `/v1/admin/tenants/:id/reactivate`   | PlatformOwner.      | 200, status=active            |
| `should archive tenant`            | POST   | `/v1/admin/tenants/:id/archive`      | PlatformOwner.      | 200, status=archived          |
| `should get dashboard stats`       | GET    | `/v1/admin/dashboard`                | PlatformOwner.      | 200, { totalTenants, ... }    |
| `should list tenant modules`       | GET    | `/v1/admin/tenants/:id/modules`      | PlatformOwner.      | 200, modules array            |
| `should toggle module`             | PATCH  | `/v1/admin/tenants/:id/modules/:key` | PlatformOwner.      | 200, updated module           |

### 2.3 Domains Endpoints (`apps/api/test/domains.e2e-spec.ts`)

| Test                             | Method | Path                                 | Scenario               | Expected           |
| -------------------------------- | ------ | ------------------------------------ | ---------------------- | ------------------ |
| `should list domains`            | GET    | `/v1/admin/tenants/:id/domains`      | PlatformOwner.         | 200, domains array |
| `should add domain`              | POST   | `/v1/admin/tenants/:id/domains`      | PlatformOwner.         | 201, new domain    |
| `should reject duplicate domain` | POST   | `/v1/admin/tenants/:id/domains`      | Domain already exists. | 409                |
| `should update domain`           | PATCH  | `/v1/admin/tenants/:id/domains/:did` | PlatformOwner.         | 200, updated       |
| `should remove domain`           | DELETE | `/v1/admin/tenants/:id/domains/:did` | PlatformOwner.         | 200                |

### 2.4 Branding Endpoints (`apps/api/test/branding.e2e-spec.ts`)

| Test                                    | Method | Path                | Scenario                        | Expected              |
| --------------------------------------- | ------ | ------------------- | ------------------------------- | --------------------- |
| `should get branding`                   | GET    | `/v1/branding`      | Authenticated, tenant context.  | 200, branding object  |
| `should update branding`                | PATCH  | `/v1/branding`      | `branding.manage` permission.   | 200, updated branding |
| `should reject without branding.manage` | PATCH  | `/v1/branding`      | User without permission.        | 403                   |
| `should upload logo`                    | POST   | `/v1/branding/logo` | File upload, `branding.manage`. | 200, { logo_url }     |

### 2.5 Settings Endpoints (`apps/api/test/settings.e2e-spec.ts`)

| Test                                       | Method | Path           | Scenario                                             | Expected                         |
| ------------------------------------------ | ------ | -------------- | ---------------------------------------------------- | -------------------------------- |
| `should get settings`                      | GET    | `/v1/settings` | Authenticated.                                       | 200, full settings with defaults |
| `should update settings with partial data` | PATCH  | `/v1/settings` | `settings.manage`, partial payload.                  | 200, { settings, warnings }      |
| `should return cross-module warnings`      | PATCH  | `/v1/settings` | Enable autoPopulateClassCounts, attendance disabled. | 200, warnings array non-empty    |
| `should reject without settings.manage`    | PATCH  | `/v1/settings` | User without permission.                             | 403                              |
| `should reject invalid settings`           | PATCH  | `/v1/settings` | Invalid data types.                                  | 400                              |

### 2.6 Stripe Config Endpoints (`apps/api/test/stripe-config.e2e-spec.ts`)

| Test                                  | Method | Path                | Scenario          | Expected                                    |
| ------------------------------------- | ------ | ------------------- | ----------------- | ------------------------------------------- |
| `should return 404 when no config`    | GET    | `/v1/stripe-config` | No config exists. | 404                                         |
| `should create stripe config`         | PUT    | `/v1/stripe-config` | `stripe.manage`.  | 200, masked response                        |
| `should return masked secrets`        | GET    | `/v1/stripe-config` | Config exists.    | 200, `stripe_secret_key_masked: "****xxxx"` |
| `should reject without stripe.manage` | PUT    | `/v1/stripe-config` | No permission.    | 403                                         |

### 2.7 Notification Settings Endpoints (`apps/api/test/notification-settings.e2e-spec.ts`)

| Test                                         | Method | Path                              | Scenario                | Expected               |
| -------------------------------------------- | ------ | --------------------------------- | ----------------------- | ---------------------- |
| `should list notification settings`          | GET    | `/v1/notification-settings`       | Authenticated.          | 200, array of settings |
| `should update notification setting`         | PATCH  | `/v1/notification-settings/:type` | `notifications.manage`. | 200, updated setting   |
| `should reject without notifications.manage` | PATCH  | `/v1/notification-settings/:type` | No permission.          | 403                    |

### 2.8 Roles Endpoints (`apps/api/test/roles.e2e-spec.ts`)

| Test                                              | Method | Path                        | Scenario                        | Expected                   |
| ------------------------------------------------- | ------ | --------------------------- | ------------------------------- | -------------------------- |
| `should list roles`                               | GET    | `/v1/roles`                 | Authenticated.                  | 200, roles array           |
| `should create custom role`                       | POST   | `/v1/roles`                 | `roles.manage`.                 | 201, new role              |
| `should reject creating role above caller tier`   | POST   | `/v1/roles`                 | Staff user creates admin role.  | 403                        |
| `should get role detail`                          | GET    | `/v1/roles/:id`             | Authenticated.                  | 200, role with permissions |
| `should update role`                              | PATCH  | `/v1/roles/:id`             | `roles.manage`.                 | 200, updated               |
| `should reject updating system role`              | PATCH  | `/v1/roles/:id`             | System role ID.                 | 400                        |
| `should delete custom role`                       | DELETE | `/v1/roles/:id`             | `roles.manage`.                 | 200                        |
| `should reject deleting system role`              | DELETE | `/v1/roles/:id`             | System role ID.                 | 400                        |
| `should assign permissions with tier enforcement` | PUT    | `/v1/roles/:id/permissions` | Staff role + staff permissions. | 200                        |
| `should reject above-tier permission assignment`  | PUT    | `/v1/roles/:id/permissions` | Staff role + admin permission.  | 400 TIER_VIOLATION         |
| `should reject without roles.manage`              | POST   | `/v1/roles`                 | User without permission.        | 403                        |

### 2.9 Users/Memberships Endpoints (`apps/api/test/memberships.e2e-spec.ts`)

| Test                                  | Method | Path                       | Scenario           | Expected                  |
| ------------------------------------- | ------ | -------------------------- | ------------------ | ------------------------- |
| `should list users`                   | GET    | `/v1/users`                | `users.view`.      | 200, paginated users      |
| `should get user detail`              | GET    | `/v1/users/:id`            | `users.view`.      | 200, user with membership |
| `should update membership roles`      | PATCH  | `/v1/users/:id/membership` | `users.manage`.    | 200                       |
| `should suspend membership`           | POST   | `/v1/users/:id/suspend`    | `users.manage`.    | 200                       |
| `should reject suspending last owner` | POST   | `/v1/users/:id/suspend`    | Last school_owner. | 400 LAST_SCHOOL_OWNER     |
| `should reactivate membership`        | POST   | `/v1/users/:id/reactivate` | `users.manage`.    | 200                       |
| `should reject without users.view`    | GET    | `/v1/users`                | No permission.     | 403                       |

### 2.10 Invitations Endpoints (`apps/api/test/invitations.e2e-spec.ts`)

| Test                                         | Method | Path                         | Scenario                         | Expected                       |
| -------------------------------------------- | ------ | ---------------------------- | -------------------------------- | ------------------------------ |
| `should create invitation`                   | POST   | `/v1/invitations`            | `users.invite`.                  | 201, { id, token }             |
| `should list invitations`                    | GET    | `/v1/invitations`            | `users.invite`.                  | 200, paginated                 |
| `should revoke invitation`                   | POST   | `/v1/invitations/:id/revoke` | `users.invite`.                  | 200, status=revoked            |
| `should accept invitation for existing user` | POST   | `/v1/invitations/accept`     | Valid token, user exists.        | 200, membership created        |
| `should accept invitation for new user`      | POST   | `/v1/invitations/accept`     | Valid token + registration data. | 200, user + membership created |
| `should reject expired invitation`           | POST   | `/v1/invitations/accept`     | Token past expires_at.           | 400 INVITATION_EXPIRED         |
| `should reject without users.invite`         | POST   | `/v1/invitations`            | No permission.                   | 403                            |

### 2.11 Approval Workflows Endpoints (`apps/api/test/approval-workflows.e2e-spec.ts`)

| Test                                     | Method | Path                         | Scenario            | Expected      |
| ---------------------------------------- | ------ | ---------------------------- | ------------------- | ------------- |
| `should list workflows`                  | GET    | `/v1/approval-workflows`     | `approvals.view`.   | 200, array    |
| `should create workflow`                 | POST   | `/v1/approval-workflows`     | `approvals.manage`. | 201, workflow |
| `should update workflow`                 | PATCH  | `/v1/approval-workflows/:id` | `approvals.manage`. | 200           |
| `should delete workflow`                 | DELETE | `/v1/approval-workflows/:id` | `approvals.manage`. | 200           |
| `should reject without approvals.manage` | POST   | `/v1/approval-workflows`     | No permission.      | 403           |

### 2.12 Approval Requests Endpoints (`apps/api/test/approval-requests.e2e-spec.ts`)

| Test                           | Method | Path                                | Scenario            | Expected              |
| ------------------------------ | ------ | ----------------------------------- | ------------------- | --------------------- |
| `should list requests`         | GET    | `/v1/approval-requests`             | `approvals.view`.   | 200, paginated        |
| `should get request detail`    | GET    | `/v1/approval-requests/:id`         | `approvals.view`.   | 200, request          |
| `should approve request`       | POST   | `/v1/approval-requests/:id/approve` | `approvals.manage`. | 200, status=approved  |
| `should reject request`        | POST   | `/v1/approval-requests/:id/reject`  | `approvals.manage`. | 200, status=rejected  |
| `should cancel own request`    | POST   | `/v1/approval-requests/:id/cancel`  | Request owner.      | 200, status=cancelled |
| `should reject double-approve` | POST   | `/v1/approval-requests/:id/approve` | Already approved.   | 400                   |

### 2.13 Preferences Endpoints (`apps/api/test/preferences.e2e-spec.ts`)

| Test                                     | Method | Path                 | Scenario       | Expected                |
| ---------------------------------------- | ------ | -------------------- | -------------- | ----------------------- |
| `should get preferences (empty default)` | GET    | `/v1/me/preferences` | First access.  | 200, {} or default      |
| `should update preferences`              | PATCH  | `/v1/me/preferences` | Valid payload. | 200, merged preferences |
| `should reject unauthenticated`          | GET    | `/v1/me/preferences` | No auth.       | 401                     |

---

## Section 3 — RLS Leakage Tests

For each tenant-scoped table, the test pattern is:

1. Seed data for Tenant A
2. Set RLS context to Tenant B
3. Query the table
4. Assert: Tenant A's data is NOT returned

### 3.1 Table-Level RLS Tests (`apps/api/test/rls-leakage.e2e-spec.ts`)

| Test                                                        | Table                          | Scenario                                                                          |
| ----------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- |
| `tenant_domains: Tenant B cannot see Tenant A domains`      | `tenant_domains`               | Create domain for Tenant A, query as Tenant B → empty result                      |
| `tenant_modules: Tenant B cannot see Tenant A modules`      | `tenant_modules`               | Query as Tenant B → only Tenant B modules                                         |
| `tenant_branding: Tenant B cannot see Tenant A branding`    | `tenant_branding`              | Query as Tenant B → only Tenant B branding                                        |
| `tenant_settings: Tenant B cannot see Tenant A settings`    | `tenant_settings`              | Query as Tenant B → only Tenant B settings                                        |
| `tenant_notification_settings: cross-tenant isolation`      | `tenant_notification_settings` | Query as Tenant B → only Tenant B notification settings                           |
| `tenant_sequences: cross-tenant isolation`                  | `tenant_sequences`             | Query as Tenant B → only Tenant B sequences                                       |
| `tenant_stripe_configs: cross-tenant isolation`             | `tenant_stripe_configs`        | Create config for A, query as B → not found                                       |
| `tenant_memberships: cross-tenant isolation`                | `tenant_memberships`           | Create membership in A, query as B → empty                                        |
| `roles: tenant-scoped roles isolated, global roles visible` | `roles`                        | Tenant A role not visible to B, but global roles (tenant_id=NULL) visible to both |
| `role_permissions: tenant-scoped permissions isolated`      | `role_permissions`             | Tenant A role_permissions not visible to B                                        |
| `membership_roles: cross-tenant isolation`                  | `membership_roles`             | Query as Tenant B → only Tenant B membership_roles                                |
| `invitations: cross-tenant isolation`                       | `invitations`                  | Tenant A invitation not visible to B                                              |
| `approval_workflows: cross-tenant isolation`                | `approval_workflows`           | Tenant A workflow not visible to B                                                |
| `approval_requests: cross-tenant isolation`                 | `approval_requests`            | Tenant A request not visible to B                                                 |
| `user_ui_preferences: cross-tenant isolation`               | `user_ui_preferences`          | Tenant A preferences not visible to B                                             |

### 3.2 API-Level RLS Tests

| Test                                                                     | Endpoint                    | Scenario                                                      |
| ------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------- |
| `GET /v1/roles as Tenant B should not return Tenant A custom roles`      | `/v1/roles`                 | Authenticate as Tenant B, verify no Tenant A roles            |
| `GET /v1/users as Tenant B should not return Tenant A users`             | `/v1/users`                 | Authenticate as Tenant B, verify no Tenant A memberships      |
| `GET /v1/invitations as Tenant B should not return Tenant A invitations` | `/v1/invitations`           | Authenticate as Tenant B, verify no Tenant A invitations      |
| `GET /v1/branding as Tenant B returns Tenant B branding only`            | `/v1/branding`              | Authenticate as Tenant B, verify branding tenant_id matches B |
| `GET /v1/settings as Tenant B returns Tenant B settings only`            | `/v1/settings`              | Authenticate as Tenant B, verify settings not from A          |
| `GET /v1/notification-settings as Tenant B returns only B's settings`    | `/v1/notification-settings` | Authenticate as Tenant B, verify isolation                    |
| `GET /v1/approval-workflows as Tenant B returns only B's workflows`      | `/v1/approval-workflows`    | Authenticate as Tenant B, verify isolation                    |
| `GET /v1/approval-requests as Tenant B returns only B's requests`        | `/v1/approval-requests`     | Authenticate as Tenant B, verify isolation                    |
| `GET /v1/me/preferences as Tenant B returns only B's preferences`        | `/v1/me/preferences`        | Authenticate as Tenant B, verify isolation                    |

---

## Section 4 — Manual QA Checklist

### 4.1 Login Flow

1. Navigate to `http://localhost:5551/en/login`
2. Enter `admin@alnoor.test` / `Password123!`
3. Verify: redirected to school dashboard
4. Verify: access token stored in memory (no localStorage)
5. Verify: refresh_token cookie exists (httpOnly, path=/api/v1/auth/refresh)

### 4.2 Login — Arabic Locale

1. Navigate to `http://localhost:5551/ar/login`
2. Verify: page renders RTL
3. Verify: all labels in Arabic
4. Enter `admin@alnoor.test` / `Password123!`
5. Verify: successful login

### 4.3 Login — Wrong Password

1. Navigate to login page
2. Enter `admin@alnoor.test` / `WrongPassword`
3. Verify: error message displayed
4. Repeat 5+ times
5. Verify: brute force delay message appears

### 4.4 Password Reset Flow

1. Navigate to reset password page
2. Enter `admin@alnoor.test`
3. Verify: success message (email not actually sent)
4. Use the token from the database to complete reset (manual DB query)

### 4.5 School Selector

1. Login as a user with memberships in multiple tenants (create via seed)
2. Verify: school selector page shows both schools
3. Click on one school
4. Verify: redirected to that school's dashboard

### 4.6 Platform Admin — Tenant Management

1. Login as `admin@edupod.app` (platform admin)
2. Navigate to `/en/admin`
3. Verify: dashboard shows stat cards
4. Navigate to `/en/admin/tenants`
5. Verify: tenant list shows Al Noor and Cedar
6. Click "Create Tenant"
7. Fill form: name="Test School", slug="test-school", timezone="Asia/Dubai", etc.
8. Submit → verify tenant created
9. Click on the new tenant → verify detail page with tabs
10. Go to Modules tab → toggle a module off and on
11. Go to Domains tab → verify domain listed

### 4.7 Platform Admin — Access Control

1. Login as a regular school admin (e.g., `admin@alnoor.test`)
2. Try to navigate to `/en/admin`
3. Verify: either 403 or redirect (not accessible)

### 4.8 School Settings — Branding

1. Login as school admin for Al Noor
2. Navigate to settings → Branding tab
3. Verify: current branding values displayed
4. Change school display name and primary colour
5. Click Save
6. Refresh page → verify changes persisted

### 4.9 School Settings — General

1. Navigate to settings → General tab
2. Verify: all sections displayed (Attendance, Gradebook, etc.)
3. Toggle `attendance.allowTeacherAmendment` to true
4. Click Save
5. Verify: success message
6. Set `payroll.autoPopulateClassCounts` to true, then disable attendance module (via platform admin)
7. Refresh settings page → verify cross-module warning appears

### 4.10 School Settings — Stripe

1. Navigate to settings → Stripe tab
2. Verify: form shows empty (or "not configured" message)
3. Enter test Stripe keys
4. Click Save
5. Refresh → verify keys show masked (\*\*\*\*xxxx format)

### 4.11 School Settings — Notifications

1. Navigate to settings → Notifications tab
2. Verify: table lists all notification types
3. Toggle a notification type off
4. Change channel selection
5. Verify: changes save correctly

### 4.12 User Management

1. Navigate to settings → Users tab
2. Verify: user list displays with correct roles
3. Click Suspend on a user → verify status changes
4. Click Reactivate → verify status restored
5. Try to suspend the last school_owner → verify error

### 4.13 Invitation Flow

1. Navigate to settings → Invitations tab
2. Click "Invite User"
3. Enter email, select role
4. Submit → verify invitation created
5. Copy the invitation token
6. In incognito, navigate to invitation accept page with token
7. Fill registration form → submit
8. Verify: new user created and logged in

### 4.14 Role Management

1. Navigate to settings → Roles tab
2. Verify: system roles listed and not deletable
3. Click "New Role"
4. Create custom role: key="custom_staff", display_name="Custom Staff", tier=staff
5. Select permissions (only staff-tier should be selectable)
6. Save → verify role created
7. Go to role detail → edit permissions
8. Try to select an admin-tier permission → verify blocked
9. Delete the custom role → verify removed

### 4.15 Profile Page

1. Navigate to profile page
2. Verify: user info displayed (name, email, locale)
3. Change preferred locale to Arabic
4. Verify: page re-renders in RTL/Arabic
5. Change theme to dark → verify dark mode
6. Change theme to light → verify light mode

### 4.16 MFA Setup

1. Navigate to profile page → MFA section
2. Click "Enable MFA"
3. Verify: QR code displayed
4. Scan with authenticator app (or use secret manually)
5. Enter 6-digit code → verify MFA enabled
6. Logout
7. Login → verify MFA required
8. Enter code from authenticator → verify login succeeds

### 4.17 Session Management

1. Navigate to profile page → Sessions section
2. Verify: current session listed
3. Login from a different browser/incognito
4. Refresh sessions → verify 2 sessions
5. Revoke the other session → verify it disappears

### 4.18 RTL Verification (Arabic)

1. Switch locale to Arabic for all settings pages
2. Verify: all pages render RTL correctly
3. Verify: directional elements (margins, padding, text alignment) are mirrored
4. Verify: form labels and buttons are Arabic
5. Verify: numbers remain Western (0-9)
6. Verify: email addresses render LTR within RTL context
