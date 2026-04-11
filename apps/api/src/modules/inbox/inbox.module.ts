import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { S3Module } from '../s3/s3.module';

import { AudienceComposer } from './audience/audience-composer';
import { AudienceProviderRegistry } from './audience/audience-provider.registry';
import { AudienceResolutionService } from './audience/audience-resolution.service';
import { AudienceUserIdResolver } from './audience/audience-user-id.resolver';
import { InboxAudienceProvidersInit } from './audience/inbox-audience-providers.init';
import { ClassParentsAudienceProvider } from './audience/providers/class-parents.provider';
import { ClassStudentsAudienceProvider } from './audience/providers/class-students.provider';
import { DepartmentAudienceProvider } from './audience/providers/department.provider';
import { HandpickedAudienceProvider } from './audience/providers/handpicked.provider';
import { HouseholdAudienceProvider } from './audience/providers/household.provider';
import { ParentsSchoolAudienceProvider } from './audience/providers/parents-school.provider';
import { SavedGroupAudienceProvider } from './audience/providers/saved-group.provider';
import { SchoolAudienceProvider } from './audience/providers/school.provider';
import { SectionParentsAudienceProvider } from './audience/providers/section-parents.provider';
import { StaffAllAudienceProvider } from './audience/providers/staff-all.provider';
import { StaffRoleAudienceProvider } from './audience/providers/staff-role.provider';
import { YearGroupParentsAudienceProvider } from './audience/providers/year-group-parents.provider';
import { YearGroupStudentsAudienceProvider } from './audience/providers/year-group-students.provider';
import { SavedAudiencesController } from './audience/saved-audiences.controller';
import { SavedAudiencesRepository } from './audience/saved-audiences.repository';
import { SavedAudiencesService } from './audience/saved-audiences.service';
import { AdminTierOnlyGuard } from './common/admin-tier-only.guard';
import { AttachmentValidator } from './common/attachment-validator';
import { InboxOutboxService } from './common/inbox-outbox.service';
import { InboxSystemUserInit } from './common/inbox-system-user.init';
import { ConversationsController } from './conversations/conversations.controller';
import { ConversationsReadFacade } from './conversations/conversations.read.facade';
import { ConversationsService } from './conversations/conversations.service';
import { InboxPermissionsInit } from './inbox-permissions.init';
import { MessagesController } from './messages/messages.controller';
import { MessagesService } from './messages/messages.service';
import { InboxOversightController } from './oversight/inbox-oversight.controller';
import { InboxOversightService } from './oversight/inbox-oversight.service';
import { OversightAuditService } from './oversight/oversight-audit.service';
import { OversightPdfService } from './oversight/oversight-pdf.service';
import { MessagingPolicyService } from './policy/messaging-policy.service';
import { RelationalScopeResolver } from './policy/relational-scope.resolver';
import { RoleMappingService } from './policy/role-mapping.service';
import { TenantMessagingPolicyRepository } from './policy/tenant-messaging-policy.repository';
import { InboxSearchController } from './search/inbox-search.controller';
import { InboxSearchService } from './search/inbox-search.service';
import { InboxSettingsController } from './settings/inbox-settings.controller';
import { InboxSettingsService } from './settings/inbox-settings.service';

/**
 * InboxModule — parent module for the new inbox / messaging surface.
 *
 * Wave 2 backend services (this module now wires all four):
 *
 *   - 02: policy engine + read-only settings controller
 *   - 03: audience engine v2 — registry, providers, composer, saved
 *         audiences CRUD + resolver service, saved audiences controller
 *   - 04: conversations + messages service (consumes the policy
 *         chokepoint and the audience engine; lands in a follow-up commit)
 *   - 05: admin oversight service
 *
 * Read facades are resolved via the global `ReadFacadesModule`, so we
 * never need to import `ClassesModule`, `ParentsModule`, `StudentsModule`,
 * `StaffProfilesModule`, `HouseholdsModule`, `RbacModule`, or `AuthModule`
 * here for data access — the facades are all injectable globally.
 *
 * Cross-module audience providers (`fees_in_arrears`, `event_attendees`,
 * `trip_roster`) live in `FinanceModule`, `EventsModule`, `TripsModule`
 * respectively and self-register with `AudienceProviderRegistry` from
 * their own `onModuleInit` hooks so the inbox module never touches
 * finance / events / trips Prisma models.
 *
 * `AuthModule` is imported so the `AuthGuard` has everything it needs
 * to authenticate requests on controllers. `S3Module` is imported for
 * the oversight thread-export path.
 */
@Module({
  imports: [AuthModule, S3Module],
  controllers: [
    InboxSettingsController,
    InboxOversightController,
    InboxSearchController,
    SavedAudiencesController,
    ConversationsController,
    MessagesController,
  ],
  providers: [
    InboxPermissionsInit,
    InboxSystemUserInit,
    // Policy engine (impl 02)
    MessagingPolicyService,
    RelationalScopeResolver,
    RoleMappingService,
    TenantMessagingPolicyRepository,
    // Settings — read-only in Wave 2
    InboxSettingsService,
    // Oversight (impl 05)
    AdminTierOnlyGuard,
    InboxOversightService,
    OversightAuditService,
    OversightPdfService,
    // Full-text search (impl 09)
    InboxSearchService,
    // Conversations + messages (impl 04)
    AttachmentValidator,
    InboxOutboxService,
    ConversationsService,
    ConversationsReadFacade,
    MessagesService,
    // Audience engine (impl 03)
    AudienceProviderRegistry,
    AudienceUserIdResolver,
    AudienceComposer,
    AudienceResolutionService,
    SavedAudiencesRepository,
    SavedAudiencesService,
    InboxAudienceProvidersInit,
    SchoolAudienceProvider,
    ParentsSchoolAudienceProvider,
    StaffAllAudienceProvider,
    StaffRoleAudienceProvider,
    DepartmentAudienceProvider,
    YearGroupParentsAudienceProvider,
    ClassParentsAudienceProvider,
    SectionParentsAudienceProvider,
    HouseholdAudienceProvider,
    YearGroupStudentsAudienceProvider,
    ClassStudentsAudienceProvider,
    HandpickedAudienceProvider,
    SavedGroupAudienceProvider,
  ],
  exports: [
    // Re-exported so Wave-3 consumers (impl 06 dispatcher) can inject
    // the chokepoint + audience engine + conversations service without
    // importing concrete files.
    MessagingPolicyService,
    RelationalScopeResolver,
    RoleMappingService,
    TenantMessagingPolicyRepository,
    InboxSettingsService,
    InboxOversightService,
    InboxSearchService,
    AudienceProviderRegistry,
    AudienceResolutionService,
    SavedAudiencesService,
    SavedAudiencesRepository,
    AudienceUserIdResolver,
    ConversationsService,
    ConversationsReadFacade,
    MessagesService,
    InboxOutboxService,
    // Re-exported so `SafeguardingModule` (impl 08 keyword CRUD) can
    // reuse the same guard on the `/v1/safeguarding/keywords` endpoints.
    AdminTierOnlyGuard,
  ],
})
export class InboxModule {}
