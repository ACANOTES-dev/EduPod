import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * HomeworkAuthorityService — gates homework writes against the teacher's
 * published schedule.
 *
 * Policy:
 *   - School owner / principal / vice principal bypass the scheduling check
 *     entirely (they may assign to any class).
 *   - Any other user with `homework.manage` must have at least one Schedule
 *     row covering the target (class_id, academic_year_id, today).
 *   - If the homework carries a `subject_id`, it must match the class's
 *     own `subject_id`. A null homework subject is always allowed (the UI
 *     offers subjectless homework for general study tasks).
 *
 * The Schedule table is date-range-aware, so substitute/cover assignments
 * scoped by `effective_start_date`/`effective_end_date` naturally grant
 * the covering teacher authority during their window.
 */
@Injectable()
export class HomeworkAuthorityService {
  constructor(
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly permissionCache: PermissionCacheService,
  ) {}

  /**
   * Throws ForbiddenException if the user is neither (a) an owner/principal/VP
   * nor (b) scheduled to teach the given class. Throws BadRequestException if
   * `subjectId` is provided but doesn't match the class's subject.
   */
  async assertCanAssignHomework(
    tenantId: string,
    userId: string,
    membershipId: string | null,
    classId: string,
    subjectId: string | null,
  ): Promise<void> {
    if (membershipId) {
      const isOwner = await this.permissionCache.isOwner(membershipId);
      if (isOwner) {
        await this.assertSubjectMatchesClass(tenantId, classId, subjectId);
        return;
      }
    }

    const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, userId);
    if (!staffProfile) {
      throw new ForbiddenException({
        code: 'NOT_YOUR_CLASS',
        message:
          'Only teachers scheduled for this class may assign homework. No staff profile found for this user.',
      });
    }

    const academicYearId = await this.academicReadFacade.findCurrentYearId(tenantId);

    const scheduled = await this.schedulesReadFacade.isTeacherScheduledForClass(
      tenantId,
      staffProfile.id,
      classId,
      academicYearId,
    );

    if (!scheduled) {
      throw new ForbiddenException({
        code: 'NOT_YOUR_CLASS',
        message:
          'You are not scheduled to teach this class. Only the assigned teacher (or a principal) may assign homework here.',
      });
    }

    await this.assertSubjectMatchesClass(tenantId, classId, subjectId);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async assertSubjectMatchesClass(
    tenantId: string,
    classId: string,
    subjectId: string | null,
  ): Promise<void> {
    if (subjectId === null) return;

    const classRow = await this.classesReadFacade.findById(tenantId, classId);

    if (!classRow) {
      throw new BadRequestException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${classId}" not found`,
      });
    }

    if (classRow.subject_id !== null && classRow.subject_id !== subjectId) {
      throw new BadRequestException({
        code: 'SUBJECT_MISMATCH',
        message: `Homework subject does not match the class's subject. Omit subject_id to assign a subjectless task.`,
      });
    }
  }
}
