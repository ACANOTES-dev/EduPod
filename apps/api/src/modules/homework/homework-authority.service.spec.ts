import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { HomeworkAuthorityService } from './homework-authority.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const MEMBERSHIP_ID = 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm';
const CLASS_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUBJECT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OTHER_SUBJECT_ID = 'eeeeeeee-eeee-eeee-eeee-ffffffffffff';
const STAFF_PROFILE_ID = '99999999-9999-9999-9999-999999999999';
const ACADEMIC_YEAR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPermissionCache(isOwner: boolean) {
  return {
    isOwner: jest.fn().mockResolvedValue(isOwner),
  };
}

interface SchedulesMock {
  isTeacherScheduledForClass: jest.Mock;
  findClassesTaughtByTeacher: jest.Mock;
}

interface ClassesMock {
  findById: jest.Mock;
}

interface StaffProfilesMock {
  findByUserId: jest.Mock;
}

interface AcademicMock {
  findCurrentYearId: jest.Mock;
  findCurrentYear: jest.Mock;
}

describe('HomeworkAuthorityService — assertCanAssignHomework', () => {
  let service: HomeworkAuthorityService;
  let schedules: SchedulesMock;
  let classes: ClassesMock;
  let staffProfiles: StaffProfilesMock;
  let academic: AcademicMock;
  let permissionCache: ReturnType<typeof buildMockPermissionCache>;

  async function buildModule(isOwnerValue: boolean): Promise<TestingModule> {
    permissionCache = buildMockPermissionCache(isOwnerValue);

    return Test.createTestingModule({
      providers: [
        HomeworkAuthorityService,
        ...MOCK_FACADE_PROVIDERS,
        { provide: PermissionCacheService, useValue: permissionCache },
      ],
    }).compile();
  }

  beforeEach(async () => {
    const module = await buildModule(false);
    service = module.get(HomeworkAuthorityService);
    schedules = module.get(SchedulesReadFacade) as unknown as SchedulesMock;
    classes = module.get(ClassesReadFacade) as unknown as ClassesMock;
    staffProfiles = module.get(StaffProfileReadFacade) as unknown as StaffProfilesMock;
    academic = module.get(AcademicReadFacade) as unknown as AcademicMock;
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Owner bypass ──────────────────────────────────────────────────────────

  it('allows owners/principals/VPs to assign to any class without a scheduling check', async () => {
    const module = await buildModule(true);
    service = module.get(HomeworkAuthorityService);

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, MEMBERSHIP_ID, CLASS_ID, null),
    ).resolves.toBeUndefined();

    expect(permissionCache.isOwner).toHaveBeenCalledWith(MEMBERSHIP_ID);
  });

  // ─── Teacher path — happy ──────────────────────────────────────────────────

  it('allows a teacher who is scheduled for the class', async () => {
    staffProfiles.findByUserId.mockResolvedValue({
      id: STAFF_PROFILE_ID,
      tenant_id: TENANT_ID,
      user_id: USER_ID,
    });
    academic.findCurrentYearId.mockResolvedValue(ACADEMIC_YEAR_ID);
    schedules.isTeacherScheduledForClass.mockResolvedValue(true);

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, MEMBERSHIP_ID, CLASS_ID, null),
    ).resolves.toBeUndefined();

    expect(schedules.isTeacherScheduledForClass).toHaveBeenCalledWith(
      TENANT_ID,
      STAFF_PROFILE_ID,
      CLASS_ID,
      ACADEMIC_YEAR_ID,
    );
  });

  // ─── Teacher path — rejections ─────────────────────────────────────────────

  it('rejects a teacher who is not scheduled for the class', async () => {
    staffProfiles.findByUserId.mockResolvedValue({
      id: STAFF_PROFILE_ID,
      tenant_id: TENANT_ID,
      user_id: USER_ID,
    });
    academic.findCurrentYearId.mockResolvedValue(ACADEMIC_YEAR_ID);
    schedules.isTeacherScheduledForClass.mockResolvedValue(false);

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, MEMBERSHIP_ID, CLASS_ID, null),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a user with no staff profile', async () => {
    staffProfiles.findByUserId.mockResolvedValue(null);

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, MEMBERSHIP_ID, CLASS_ID, null),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects when membership is missing and the user has no staff profile', async () => {
    staffProfiles.findByUserId.mockResolvedValue(null);

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, null, CLASS_ID, null),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── Subject match ─────────────────────────────────────────────────────────

  it('allows subjectless homework even when the class has a subject', async () => {
    staffProfiles.findByUserId.mockResolvedValue({
      id: STAFF_PROFILE_ID,
    });
    academic.findCurrentYearId.mockResolvedValue(ACADEMIC_YEAR_ID);
    schedules.isTeacherScheduledForClass.mockResolvedValue(true);

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, MEMBERSHIP_ID, CLASS_ID, null),
    ).resolves.toBeUndefined();

    expect(classes.findById).not.toHaveBeenCalled();
  });

  it('allows homework whose subject matches the class subject', async () => {
    staffProfiles.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
    academic.findCurrentYearId.mockResolvedValue(ACADEMIC_YEAR_ID);
    schedules.isTeacherScheduledForClass.mockResolvedValue(true);
    classes.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, MEMBERSHIP_ID, CLASS_ID, SUBJECT_ID),
    ).resolves.toBeUndefined();
  });

  it('rejects homework whose subject differs from the class subject', async () => {
    staffProfiles.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
    academic.findCurrentYearId.mockResolvedValue(ACADEMIC_YEAR_ID);
    schedules.isTeacherScheduledForClass.mockResolvedValue(true);
    classes.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });

    await expect(
      service.assertCanAssignHomework(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CLASS_ID,
        OTHER_SUBJECT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequest when class row is missing during subject check', async () => {
    staffProfiles.findByUserId.mockResolvedValue({ id: STAFF_PROFILE_ID });
    academic.findCurrentYearId.mockResolvedValue(ACADEMIC_YEAR_ID);
    schedules.isTeacherScheduledForClass.mockResolvedValue(true);
    classes.findById.mockResolvedValue(null);

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, MEMBERSHIP_ID, CLASS_ID, SUBJECT_ID),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows owner bypass plus subject match when subject is provided', async () => {
    const module = await buildModule(true);
    service = module.get(HomeworkAuthorityService);
    classes.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });

    await expect(
      service.assertCanAssignHomework(TENANT_ID, USER_ID, MEMBERSHIP_ID, CLASS_ID, SUBJECT_ID),
    ).resolves.toBeUndefined();
  });

  it('rejects owner bypass when subject mismatches the class subject', async () => {
    const module = await buildModule(true);
    service = module.get(HomeworkAuthorityService);
    classes.findById.mockResolvedValue({ id: CLASS_ID, subject_id: SUBJECT_ID });

    await expect(
      service.assertCanAssignHomework(
        TENANT_ID,
        USER_ID,
        MEMBERSHIP_ID,
        CLASS_ID,
        OTHER_SUBJECT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
