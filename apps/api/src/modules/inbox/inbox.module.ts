import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { InboxPermissionsInit } from './inbox-permissions.init';
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
 * conversations, oversight). Impl 02 (this file) wires the policy engine
 * and the read-only settings controller. Subsequent implementations in
 * the wave add providers to this module:
 *
 *   - 03: audience engine v2 — providers, saved audiences, composer
 *   - 04: conversations + messages service (send chokepoint consumer)
 *   - 05: admin oversight service
 *
 * Read facades are resolved via the global `ReadFacadesModule`, so
 * `ClassesModule`, `ParentsModule`, `StudentsModule`, `StaffProfilesModule`
 * do NOT need to be imported here — the read facades that we depend on
 * (ClassesReadFacade, StudentReadFacade, ParentReadFacade,
 * StaffProfileReadFacade) are all injectable globally.
 *
 * `AuthModule` is imported so the `AuthGuard` has everything it needs to
 * authenticate requests on the controller.
 */
@Module({
  imports: [AuthModule],
  controllers: [InboxSettingsController],
  providers: [
    InboxPermissionsInit,
    // Policy engine
    MessagingPolicyService,
    RelationalScopeResolver,
    RoleMappingService,
    TenantMessagingPolicyRepository,
    // Settings (read-only in Wave 2)
    InboxSettingsService,
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
  ],
})
export class InboxModule {}
