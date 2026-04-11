import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { S3Module } from '../s3/s3.module';

import { AdminTierOnlyGuard } from './common/admin-tier-only.guard';
import { InboxSystemUserInit } from './common/inbox-system-user.init';
import { InboxPermissionsInit } from './inbox-permissions.init';
import { InboxOversightController } from './oversight/inbox-oversight.controller';
import { InboxOversightService } from './oversight/inbox-oversight.service';
import { OversightAuditService } from './oversight/oversight-audit.service';
import { OversightPdfService } from './oversight/oversight-pdf.service';
import { MessagingPolicyService } from './policy/messaging-policy.service';
import { RelationalScopeResolver } from './policy/relational-scope.resolver';
import { RoleMappingService } from './policy/role-mapping.service';
import { TenantMessagingPolicyRepository } from './policy/tenant-messaging-policy.repository';
import { InboxSettingsController } from './settings/inbox-settings.controller';
import { InboxSettingsService } from './settings/inbox-settings.service';

/**
 * InboxModule — parent module for the new inbox / messaging surface.
 *
 * Wave 2 lands the backend services (policy chokepoint, audience engine,
 * conversations, oversight). Impl 02 wired the policy engine and the
 * read-only settings controller. Impl 05 (this commit) adds the admin
 * oversight surface — a privileged, audit-logged read path for
 * Owner / Principal / Vice Principal to supervise tenant-wide
 * conversations. Subsequent implementations in the wave add providers
 * to this module:
 *
 *   - 03: audience engine v2 — providers, saved audiences, composer
 *   - 04: conversations + messages service (send chokepoint consumer)
 *   - 05: admin oversight service                           ← this commit
 *
 * Read facades are resolved via the global `ReadFacadesModule`, so
 * `ClassesModule`, `ParentsModule`, `StudentsModule`, `StaffProfilesModule`
 * do NOT need to be imported here — the read facades that we depend on
 * (ClassesReadFacade, StudentReadFacade, ParentReadFacade,
 * StaffProfileReadFacade) are all injectable globally.
 *
 * `AuthModule` is imported so the `AuthGuard` has everything it needs to
 * authenticate requests on the controller. `S3Module` is imported for
 * the oversight thread-export path which uploads a PDF and returns a
 * signed URL.
 */
@Module({
  imports: [AuthModule, S3Module],
  controllers: [InboxSettingsController, InboxOversightController],
  providers: [
    InboxPermissionsInit,
    InboxSystemUserInit,
    // Policy engine
    MessagingPolicyService,
    RelationalScopeResolver,
    RoleMappingService,
    TenantMessagingPolicyRepository,
    // Settings (read-only in Wave 2)
    InboxSettingsService,
    // Oversight
    AdminTierOnlyGuard,
    InboxOversightService,
    OversightAuditService,
    OversightPdfService,
  ],
  exports: [
    // Re-exported so Wave-2 siblings (impls 03/04/05) and the Wave-3
    // dispatcher provider can inject the policy chokepoint and matrix
    // repository without importing their concrete files.
    MessagingPolicyService,
    RelationalScopeResolver,
    RoleMappingService,
    TenantMessagingPolicyRepository,
    InboxSettingsService,
    InboxOversightService,
  ],
})
export class InboxModule {}
