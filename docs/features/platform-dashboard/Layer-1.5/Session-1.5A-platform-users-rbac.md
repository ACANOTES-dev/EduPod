# Session 1.5A: Platform Users + RBAC

**Depends on:** Layer 1 complete (1A WebSocket, 1B Health, 1C Alerts, 1D Onboarding); Session 0 stealth subdomain shipped (uses the new tables)
**Unlocks:** Session 1.5B (audit ledger references `platform_users.id` for `actor_user_id`); all of Layer 2/3 dangerous actions; Layer 4 AI Copilot's permission boundary

---

## Objective

Replace the existing `platform_owner_user_ids` Redis-set workaround with a proper relational model: `platform_users` + `platform_user_roles` + `platform_roles` + `platform_role_permissions` + `platform_permissions`. Seed the two roles the master spec §2.1 calls for (`platform_owner`, `platform_support`) with their respective permission sets. Replace every direct `platform_owner_user_ids` check in the codebase with a new `PlatformRoleGuard`. Migrate the existing operator (Ram) from the Redis set to the new tables without losing access. Update Session 0's auth host check to consult the new tables.

After this session:

- Adding a `platform_support` operator is a clean invite flow, not a manual SADD.
- Each platform-side controller declares the permission(s) it requires; the guard enforces them.
- `Session-0-stealth-subdomain.md`'s "if user is NOT in `platform_users`" check works against a real table.
- Layer 2/3 dangerous actions (cache flush, MFA reset, ownership transfer, queue clean) can require specific permissions (`platform.cache.flush_global`, `platform.users.reset_mfa`, etc.) that `platform_support` MAY have but typically doesn't.

---

## Critical safety constraints

- **The migration MUST run before the new guard ships.** If guard ships first, every operator request 403s because the table is empty. Order in the same deploy: migration first → seed → backfill from Redis set → guard rollout. The deploy script handles this naturally (migrations run before app restart) but verify in this session's PR.
- **Backfill is non-destructive.** The existing `platform_owner_user_ids` Redis set is READ during the migration to seed `platform_users` rows; the set is NOT deleted by this session. Drop the set in a follow-up cleanup commit AFTER 7 days of confirmed stability with the new tables.
- **Default-deny on missing role row.** Same posture as Module Gating's `ModuleEnabledGuard` (DZ-MG-1). A `users.id` not in `platform_users` is treated as "not a platform user." This is intentional security; document with `// SAFETY:` inline in the guard.
- **Append-only role mutations.** Adding a role is via INSERT. Removing a role is via DELETE on the join table (`platform_user_roles`). Never UPDATE the role assignment in place — that loses audit history. Layer 1.5B's audit ledger captures the INSERT/DELETE events.
- **`platform_owner` is irrevocable from yourself.** A `platform_owner` cannot remove their own `platform_owner` role (would lock themselves out). Enforce in the service layer with a check that the actor cannot DELETE their own owner role; surface as a clean error in the UI.
- **Email invites must include a one-time setup link.** New invitees set their password via the link, not via an admin-typed temporary password. Reuses the existing tenant-side invitation flow if compatible.

---

## Database

### New tables (Prisma schema)

```prisma
// packages/prisma/prisma/schema.prisma

model PlatformUser {
  id                String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  user_id           String                @unique @db.Uuid
  invited_by_user_id String?              @db.Uuid
  invited_at        DateTime              @default(now()) @db.Timestamptz()
  activated_at      DateTime?             @db.Timestamptz()
  revoked_at        DateTime?             @db.Timestamptz()
  notes             String?               @db.Text
  created_at        DateTime              @default(now()) @db.Timestamptz()
  updated_at        DateTime              @updatedAt @db.Timestamptz()

  user              User                  @relation(fields: [user_id], references: [id], onDelete: Cascade)
  invited_by        User?                 @relation("PlatformUserInvitedBy", fields: [invited_by_user_id], references: [id], onDelete: SetNull)
  roles             PlatformUserRole[]

  @@map("platform_users")
  @@index([user_id])
  @@index([revoked_at])
}

model PlatformRole {
  id          String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  role_key    PlatformRoleKey              @unique
  display_name String                      @db.VarChar(100)
  description String                       @db.Text
  is_system   Boolean                      @default(true)
  created_at  DateTime                     @default(now()) @db.Timestamptz()
  updated_at  DateTime                     @updatedAt @db.Timestamptz()

  users       PlatformUserRole[]
  permissions PlatformRolePermission[]

  @@map("platform_roles")
}

model PlatformUserRole {
  platform_user_id String       @db.Uuid
  role_id          String       @db.Uuid
  granted_by_user_id String?    @db.Uuid
  granted_at       DateTime     @default(now()) @db.Timestamptz()

  platform_user    PlatformUser @relation(fields: [platform_user_id], references: [id], onDelete: Cascade)
  role             PlatformRole @relation(fields: [role_id], references: [id], onDelete: Cascade)
  granted_by       User?        @relation("PlatformRoleGrantedBy", fields: [granted_by_user_id], references: [id], onDelete: SetNull)

  @@id([platform_user_id, role_id])
  @@map("platform_user_roles")
  @@index([role_id])
}

model PlatformPermission {
  id              String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  permission_key  String                       @unique @db.VarChar(120)
  display_name    String                       @db.VarChar(100)
  description     String                       @db.Text
  category        String                       @db.VarChar(60)  // 'tenants' | 'users' | 'cache' | 'queues' | 'maintenance' | etc.
  is_destructive  Boolean                      @default(false)  // hint for confirmation modals
  requires_two_person Boolean                  @default(false)  // hint for the two-person approval flow
  created_at      DateTime                     @default(now()) @db.Timestamptz()

  roles           PlatformRolePermission[]

  @@map("platform_permissions")
}

model PlatformRolePermission {
  role_id       String             @db.Uuid
  permission_id String             @db.Uuid

  role          PlatformRole       @relation(fields: [role_id], references: [id], onDelete: Cascade)
  permission    PlatformPermission @relation(fields: [permission_id], references: [id], onDelete: Cascade)

  @@id([role_id, permission_id])
  @@map("platform_role_permissions")
  @@index([permission_id])
}

enum PlatformRoleKey {
  platform_owner
  platform_support
}
```

### Seed data

`packages/prisma/seed/platform-roles.ts` (new file):

```ts
export const PLATFORM_PERMISSIONS = [
  // Tenants
  { key: 'platform.tenants.view', category: 'tenants', display_name: 'View tenants' },
  {
    key: 'platform.tenants.create',
    category: 'tenants',
    display_name: 'Create tenants',
    is_destructive: false,
  },
  {
    key: 'platform.tenants.suspend',
    category: 'tenants',
    display_name: 'Suspend tenants',
    is_destructive: true,
  },
  {
    key: 'platform.tenants.archive',
    category: 'tenants',
    display_name: 'Archive tenants',
    is_destructive: true,
    requires_two_person: true,
  },
  {
    key: 'platform.tenants.impersonate',
    category: 'tenants',
    display_name: 'Impersonate (read-only)',
  },

  // Users (cross-tenant)
  {
    key: 'platform.users.reset_password',
    category: 'users',
    display_name: 'Trigger password reset',
  },
  { key: 'platform.users.reset_mfa', category: 'users', display_name: 'Reset MFA enrolment' },
  {
    key: 'platform.users.unlock_account',
    category: 'users',
    display_name: 'Unlock brute-force lockout',
  },
  {
    key: 'platform.users.disable',
    category: 'users',
    display_name: 'Disable user account',
    is_destructive: true,
  },
  {
    key: 'platform.users.transfer_ownership',
    category: 'users',
    display_name: 'Transfer tenant ownership',
    is_destructive: true,
    requires_two_person: true,
  },

  // Modules (Module Gating consumer)
  {
    key: 'platform.modules.toggle',
    category: 'modules',
    display_name: 'Toggle per-tenant module state',
  },

  // Operations
  { key: 'platform.cache.flush_tenant', category: 'cache', display_name: "Flush a tenant's cache" },
  {
    key: 'platform.cache.flush_global',
    category: 'cache',
    display_name: 'Flush global cache',
    is_destructive: true,
    requires_two_person: true,
  },
  { key: 'platform.queues.view', category: 'queues', display_name: 'View queue state' },
  { key: 'platform.queues.retry', category: 'queues', display_name: 'Retry failed jobs' },
  { key: 'platform.queues.pause', category: 'queues', display_name: 'Pause a queue' },
  {
    key: 'platform.queues.clean',
    category: 'queues',
    display_name: 'Clean a queue (delete jobs)',
    is_destructive: true,
    requires_two_person: true,
  },
  {
    key: 'platform.maintenance.toggle',
    category: 'maintenance',
    display_name: 'Enter / exit maintenance mode',
    is_destructive: true,
  },
  {
    key: 'platform.sessions.force_logout_user',
    category: 'sessions',
    display_name: 'Force-logout a user',
  },
  {
    key: 'platform.sessions.force_logout_tenant',
    category: 'sessions',
    display_name: 'Force-logout an entire tenant',
    is_destructive: true,
    requires_two_person: true,
  },

  // Platform users themselves
  {
    key: 'platform.platform_users.view',
    category: 'platform_users',
    display_name: 'View platform users',
  },
  {
    key: 'platform.platform_users.invite',
    category: 'platform_users',
    display_name: 'Invite platform users',
  },
  {
    key: 'platform.platform_users.revoke',
    category: 'platform_users',
    display_name: 'Revoke platform user access',
    is_destructive: true,
  },
  {
    key: 'platform.platform_users.assign_roles',
    category: 'platform_users',
    display_name: 'Assign / unassign platform roles',
  },

  // Audit + alerts
  { key: 'platform.audit_log.view', category: 'audit', display_name: 'View platform audit log' },
  { key: 'platform.alerts.view', category: 'alerts', display_name: 'View alerts' },
  {
    key: 'platform.alerts.acknowledge',
    category: 'alerts',
    display_name: 'Acknowledge / resolve alerts',
  },
  {
    key: 'platform.alerts.silence',
    category: 'alerts',
    display_name: 'Silence alerts (Layer 1.5C)',
  },

  // AI Copilot (Layer 4)
  {
    key: 'platform.ai.read',
    category: 'ai_copilot',
    display_name: 'Read AI Copilot suggestions (Layer 4)',
  },
  {
    key: 'platform.ai.approve_action',
    category: 'ai_copilot',
    display_name: 'Approve AI-proposed supervised actions (Layer 4D)',
  },
];

export const PLATFORM_ROLE_PERMISSIONS = {
  platform_owner: 'ALL', // every permission
  platform_support: [
    'platform.tenants.view',
    'platform.tenants.impersonate',
    'platform.users.reset_password',
    'platform.users.reset_mfa',
    'platform.users.unlock_account',
    'platform.modules.toggle', // operator decision; can revoke if too broad
    'platform.cache.flush_tenant',
    'platform.queues.view',
    'platform.queues.retry',
    'platform.audit_log.view',
    'platform.alerts.view',
    'platform.alerts.acknowledge',
    'platform.platform_users.view',
    'platform.ai.read',
    // Notably NOT: suspend, archive, disable, transfer_ownership, flush_global,
    // queues.pause/clean, maintenance.toggle, force_logout_*, invite/revoke/assign_roles,
    // ai.approve_action
  ],
};
```

### Migration script

`packages/prisma/migrations/<timestamp>_platform_users_rbac/migration.sql`:

```sql
BEGIN;

-- 1. Create the new tables (Prisma migrate handles this from the schema above)
-- 2. Seed PLATFORM_PERMISSIONS + PLATFORM_ROLES + PLATFORM_ROLE_PERMISSIONS via post_migrate.sql
-- 3. Backfill platform_users from Redis (run-once script invoked by deploy)

COMMIT;
```

`packages/prisma/migrations/<timestamp>_platform_users_rbac/backfill-from-redis.ts` (new run-once script):

```ts
// Read the platform_owner_user_ids Redis set, insert a platform_users row for
// each member with the platform_owner role granted. Idempotent (ON CONFLICT
// DO NOTHING). Logs any user_id that doesn't have a corresponding users row.
```

Invoked by `scripts/deploy-production.sh` after the migration runs.

---

## API

### New controller

`apps/api/src/modules/platform-users/platform-users.controller.ts`:

```
GET    /v1/admin/platform-users                  -> @RequiresPlatformPermission('platform.platform_users.view')
POST   /v1/admin/platform-users/invite           -> @RequiresPlatformPermission('platform.platform_users.invite')
PATCH  /v1/admin/platform-users/:id/roles        -> @RequiresPlatformPermission('platform.platform_users.assign_roles')
DELETE /v1/admin/platform-users/:id              -> @RequiresPlatformPermission('platform.platform_users.revoke')
GET    /v1/admin/platform-permissions            -> @RequiresPlatformPermission('platform.platform_users.view')
```

### New decorator + guard

`apps/api/src/common/decorators/requires-platform-permission.decorator.ts`:

```ts
export const REQUIRES_PLATFORM_PERMISSION_KEY = 'requiresPlatformPermission';

export const RequiresPlatformPermission = (permission: string) =>
  SetMetadata(REQUIRES_PLATFORM_PERMISSION_KEY, permission);
```

`apps/api/src/common/guards/platform-role.guard.ts`:

```ts
@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly platformUsers: PlatformUsersService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_PLATFORM_PERMISSION_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (!required) return true;

    const userId = /* existing JWT user id resolution */;
    if (!userId) throw new UnauthorizedException();

    // SAFETY: default-deny on missing platform_users row OR missing permission.
    // Mirrors ModuleEnabledGuard (DZ-MG-1). The migration backfill ensures
    // every existing platform_owner has a row before this guard ships.
    const has = await this.platformUsers.hasPermission(userId, required);
    if (!has) throw new NotFoundException({
      code: 'PLATFORM_PERMISSION_DENIED',
      permission: required,
      message: 'You do not have permission to perform this action.',
    });
    return true;
  }
}
```

### Replace existing `PlatformOwnerGuard` usage

The existing `apps/api/src/modules/tenants/guards/platform-owner.guard.ts` (which checks the Redis set) is replaced by `PlatformRoleGuard`. Migration:

1. Find every `@UseGuards(...PlatformOwnerGuard...)` in `apps/api/src/`.
2. For each, decide which permission applies (usually inferred from the route — `tenants.suspend` for the suspend endpoint, etc.).
3. Replace `PlatformOwnerGuard` with `PlatformRoleGuard` and add `@RequiresPlatformPermission('<permission_key>')`.
4. Delete the old guard file once no references remain.

Audit log this migration in commit message — every controller modification is a security boundary change.

### Session 0 integration

Update Session 0's `AuthService.login` host check (per its §3.4) to query `platform_users` instead of the Redis set:

```ts
const isPlatformUser = await this.platformUsers.isMember(user.id);
```

---

## Frontend

### New pages

`apps/web/src/app/[locale]/(platform)/admin/users/page.tsx` — list:

- Table of platform users: email, roles (badges), invited_at, activated_at, last_seen, status (active/revoked).
- "Invite" button → opens `<InvitePlatformUserDialog>`.

`apps/web/src/app/[locale]/(platform)/admin/users/[id]/page.tsx` — single user:

- Show user's profile + roles + grant history.
- `<RoleSelector>` to add/remove roles (only available to `platform_owner`).
- "Revoke platform access" button (with confirmation modal — Layer 1.5C component if available, otherwise inline confirm).

`apps/web/src/app/[locale]/(platform)/admin/permissions/page.tsx` — read-only catalogue:

- `<PermissionMatrixTable>`: rows = permissions, columns = roles, cells = ✓/✗.
- Useful for the operator to understand what `platform_support` can/can't do.

### New components

- `PlatformUserCard` — compact display with email + role badges.
- `RoleSelector` — multi-select with disable-self-revocation safeguard.
- `InvitePlatformUserDialog` — email + role select + optional notes; submits to invite endpoint.
- `PermissionMatrixTable` — read from `/v1/admin/platform-permissions`.

### Nav addition

In the platform admin morph-shell sub-strip:

- "Platform Users" entry under a new "Operations" section (or wherever fits the existing nav grouping).
- Visible only if user has `platform.platform_users.view` permission.

---

## Tests

### Unit / integration

- `platform-users.service.spec.ts` — invite, role assignment, revocation, permission check.
- `platform-role.guard.spec.ts` — has permission → pass; missing permission → 404 PLATFORM_PERMISSION_DENIED; missing platform_users row → 404; missing JWT → 401.
- `disable-self-revocation.spec.ts` — actor cannot DELETE their own platform_owner role.

### Migration

- `backfill-from-redis.spec.ts` — given a Redis set with N members, after migration `platform_users` has N rows with `platform_owner` role granted. Idempotent on re-run.

### Static analysis

- A new spec file (`apps/api/src/common/guards/platform-permission-coverage.spec.ts`) scans all controllers under `apps/api/src/modules/` and asserts: every endpoint that previously used `PlatformOwnerGuard` now uses `PlatformRoleGuard` AND has `@RequiresPlatformPermission(...)`. Mirrors the Module Gating impl 07 static-analysis pattern.

### E2E

- Invite a new platform_support user → email link → set password → login at `dua.edupod.app/login` → visit `/admin` → confirm subset of UI is visible per their permissions (e.g., no suspend button, no MFA reset).

---

## Acceptance

- [ ] Migration runs in dev + paralleltest + production. Backfill creates one `platform_users` row per existing Redis set member.
- [ ] `platform_roles` seeded with `platform_owner` and `platform_support`. Permissions seeded per the catalogue above.
- [ ] `PlatformRoleGuard` exists and replaces `PlatformOwnerGuard` everywhere.
- [ ] Static-analysis test passes (zero violations).
- [ ] Session 0 auth check uses the new tables; existing platform_owner can still log in at `dua.edupod.app/login`.
- [ ] New platform_support user invitation flow works end-to-end (email → set password → login → permission-restricted UI).
- [ ] `platform_owner` cannot revoke their own owner role; clean error in the UI.
- [ ] Frontend: `/admin/users`, `/admin/users/[id]`, `/admin/permissions` pages render and respect role-based visibility.
- [ ] All Layer 1 functionality continues to work for the existing operator (Ram). No regressions.
- [ ] `docs/architecture/danger-zones.md` gains DZ-PA-1 (default-deny on missing platform_users / role row).
- [ ] `docs/architecture/feature-map.md` gains a "Platform Users + RBAC" entry under §29 (Platform Admin & Operations).

---

## Notes

- This session is the single most important Layer 1.5 unblock. The Module Gating initiative also assumed `platform_users` informally; this makes it real. Session 0's stealth subdomain assumed it explicitly. Layer 2/3 dangerous actions can't ship safely without it. Layer 4 needs it for the AI Copilot's permission boundary.
- The `platform_owner` role being "ALL permissions" is intentional. Future granularity (e.g., a `platform_finance_ops` role) is a seed-data change, not a schema change.
- The Redis-set workaround stays in place during migration (read-only) and is dropped 7 days after. Do NOT delete the Redis set in this session's PR.
- The `platform_user_roles.granted_by_user_id` field is the breadcrumb that powers Layer 1.5B's audit ledger ("operator A granted platform_support to operator B at 2026-05-15T...Z").
- Future addition (out of scope here): SSO / SAML for platform users. The schema accommodates it (the `users` table is the underlying identity; SSO is an auth-side change). Layer 4D may prompt for this if the AI Copilot detects credential-management toil.
