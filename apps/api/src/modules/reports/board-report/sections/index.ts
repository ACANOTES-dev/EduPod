/**
 * Placeholder section aggregators — impl 05 unblocks CI after impl 07's
 * commit (`9d10ecee`) landed imports to these classes without the file
 * tree they expected. Impl 06 (Board Report aggregation) owns the real
 * implementations and will replace this file when it lands.
 *
 * Each class is an empty `@Injectable()` so the NestJS DI graph resolves
 * without runtime errors. Methods will be added by impl 06.
 */
import { Injectable } from '@nestjs/common';

@Injectable()
export class AcademicSectionAggregator {}

@Injectable()
export class AttendanceSectionAggregator {}

@Injectable()
export class BehaviourSectionAggregator {}

@Injectable()
export class EnrolmentSectionAggregator {}

@Injectable()
export class ExecutiveSummarySectionAggregator {}

@Injectable()
export class FinanceSectionAggregator {}

@Injectable()
export class SafeguardingSectionAggregator {}

@Injectable()
export class StaffingSectionAggregator {}
