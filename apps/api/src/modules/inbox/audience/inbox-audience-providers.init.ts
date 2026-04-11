import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { AudienceProviderRegistry } from './audience-provider.registry';
import { ClassParentsAudienceProvider } from './providers/class-parents.provider';
import { ClassStudentsAudienceProvider } from './providers/class-students.provider';
import { DepartmentAudienceProvider } from './providers/department.provider';
import { HandpickedAudienceProvider } from './providers/handpicked.provider';
import { HouseholdAudienceProvider } from './providers/household.provider';
import { ParentsSchoolAudienceProvider } from './providers/parents-school.provider';
import { SavedGroupAudienceProvider } from './providers/saved-group.provider';
import { SchoolAudienceProvider } from './providers/school.provider';
import { SectionParentsAudienceProvider } from './providers/section-parents.provider';
import { StaffAllAudienceProvider } from './providers/staff-all.provider';
import { StaffRoleAudienceProvider } from './providers/staff-role.provider';
import { YearGroupParentsAudienceProvider } from './providers/year-group-parents.provider';
import { YearGroupStudentsAudienceProvider } from './providers/year-group-students.provider';

/**
 * InboxAudienceProvidersInit — registers all 13 inbox-owned audience
 * providers with the process-wide `AudienceProviderRegistry` at module
 * init time.
 *
 * Cross-module providers (`fees_in_arrears`, `event_attendees`,
 * `trip_roster`) register themselves from their own modules so the
 * inbox never reaches across a module boundary to touch finance /
 * events / trips Prisma models.
 */
@Injectable()
export class InboxAudienceProvidersInit implements OnModuleInit {
  private readonly logger = new Logger(InboxAudienceProvidersInit.name);

  constructor(
    private readonly registry: AudienceProviderRegistry,
    private readonly school: SchoolAudienceProvider,
    private readonly parentsSchool: ParentsSchoolAudienceProvider,
    private readonly staffAll: StaffAllAudienceProvider,
    private readonly staffRole: StaffRoleAudienceProvider,
    private readonly department: DepartmentAudienceProvider,
    private readonly yearGroupParents: YearGroupParentsAudienceProvider,
    private readonly classParents: ClassParentsAudienceProvider,
    private readonly sectionParents: SectionParentsAudienceProvider,
    private readonly household: HouseholdAudienceProvider,
    private readonly yearGroupStudents: YearGroupStudentsAudienceProvider,
    private readonly classStudents: ClassStudentsAudienceProvider,
    private readonly handpicked: HandpickedAudienceProvider,
    private readonly savedGroup: SavedGroupAudienceProvider,
  ) {}

  onModuleInit(): void {
    const providers = [
      this.school,
      this.parentsSchool,
      this.staffAll,
      this.staffRole,
      this.department,
      this.yearGroupParents,
      this.classParents,
      this.sectionParents,
      this.household,
      this.yearGroupStudents,
      this.classStudents,
      this.handpicked,
      this.savedGroup,
    ];
    for (const provider of providers) this.registry.register(provider);
    this.logger.log(`Registered ${providers.length} inbox-owned audience providers.`);
  }
}
