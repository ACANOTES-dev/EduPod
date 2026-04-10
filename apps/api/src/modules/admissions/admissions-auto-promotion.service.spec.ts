import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';

import {
  ADMISSIONS_AUTO_PROMOTED_JOB,
  AdmissionsAutoPromotionService,
} from './admissions-auto-promotion.service';
import { AdmissionsCapacityService } from './admissions-capacity.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ACADEMIC_YEAR_ID = '22222222-2222-2222-2222-222222222222';
const YEAR_GROUP_ID = '33333333-3333-3333-3333-333333333333';
const OTHER_YEAR_GROUP_ID = '44444444-4444-4444-4444-444444444444';
const CLASS_ID = '55555555-5555-5555-5555-555555555555';

// ─── Mocks ───────────────────────────────────────────────────────────────────

interface MockDb {
  class: { findFirst: jest.Mock };
  application: { update: jest.Mock; updateMany: jest.Mock };
  applicationNote: { create: jest.Mock };
  $queryRaw: jest.Mock;
}

function buildMockDb(): MockDb {
  return {
    class: { findFirst: jest.fn() },
    application: {
      update: jest.fn().mockResolvedValue(undefined),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    applicationNote: { create: jest.fn().mockResolvedValue(undefined) },
    $queryRaw: jest.fn(),
  };
}

function buildService() {
  const capacityService = {
    getAvailableSeats: jest.fn(),
  } as unknown as jest.Mocked<AdmissionsCapacityService>;

  const searchIndexService = {
    indexEntity: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<SearchIndexService>;

  const notificationsQueue = {
    add: jest.fn().mockResolvedValue(undefined),
  };

  const service = new AdmissionsAutoPromotionService(
    {} as PrismaService,
    capacityService,
    searchIndexService,
    notificationsQueue as never,
  );

  return { service, capacityService, searchIndexService, notificationsQueue };
}

function candidateRow(id: string, applicationNumber: string) {
  return {
    id,
    application_number: applicationNumber,
    student_first_name: 'Alice',
    student_last_name: 'Applicant',
    submitted_by_parent_id: null,
    status: 'waiting_list',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdmissionsAutoPromotionService — promoteYearGroup', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns zero promotions when no seats are available', async () => {
    const { service, capacityService } = buildService();
    const db = buildMockDb();
    (capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
      total_capacity: 25,
      enrolled_student_count: 25,
      conditional_approval_count: 0,
      available_seats: 0,
      configured: true,
    });

    const result = await service.promoteYearGroup(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      yearGroupId: YEAR_GROUP_ID,
    });

    expect(result).toEqual({
      promoted_count: 0,
      promoted_application_ids: [],
      remaining_seats: 0,
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.application.update).not.toHaveBeenCalled();
  });

  it('promotes all waiting applications when fewer candidates than seats', async () => {
    const { service, capacityService, searchIndexService, notificationsQueue } = buildService();
    const db = buildMockDb();
    (capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
      total_capacity: 25,
      enrolled_student_count: 20,
      conditional_approval_count: 0,
      available_seats: 5,
      configured: true,
    });
    db.$queryRaw.mockResolvedValue([
      candidateRow('app-1', 'APP-1'),
      candidateRow('app-2', 'APP-2'),
      candidateRow('app-3', 'APP-3'),
    ]);

    const result = await service.promoteYearGroup(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      yearGroupId: YEAR_GROUP_ID,
    });

    expect(result.promoted_count).toBe(3);
    expect(result.promoted_application_ids).toEqual(['app-1', 'app-2', 'app-3']);
    expect(result.remaining_seats).toBe(2);
    expect(db.application.update).toHaveBeenCalledTimes(3);
    expect(db.application.update).toHaveBeenCalledWith({
      where: { id: 'app-1' },
      data: { status: 'ready_to_admit' },
    });
    expect(db.applicationNote.create).toHaveBeenCalledTimes(3);
    expect(searchIndexService.indexEntity).toHaveBeenCalledTimes(3);
    expect(notificationsQueue.add).toHaveBeenCalledTimes(3);
    expect(notificationsQueue.add).toHaveBeenCalledWith(
      ADMISSIONS_AUTO_PROMOTED_JOB,
      expect.objectContaining({ tenant_id: TENANT_ID, application_id: 'app-1' }),
      expect.anything(),
    );
  });

  it('promotes exactly the available seat count in FIFO order', async () => {
    const { service, capacityService } = buildService();
    const db = buildMockDb();
    (capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
      total_capacity: 25,
      enrolled_student_count: 20,
      conditional_approval_count: 0,
      available_seats: 5,
      configured: true,
    });
    // DB returns only the 5 earliest waiting applications because of LIMIT.
    db.$queryRaw.mockResolvedValue([
      candidateRow('app-1', 'APP-1'),
      candidateRow('app-2', 'APP-2'),
      candidateRow('app-3', 'APP-3'),
      candidateRow('app-4', 'APP-4'),
      candidateRow('app-5', 'APP-5'),
    ]);

    const result = await service.promoteYearGroup(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      yearGroupId: YEAR_GROUP_ID,
    });

    expect(result.promoted_count).toBe(5);
    expect(result.remaining_seats).toBe(0);
    expect(result.promoted_application_ids).toEqual(['app-1', 'app-2', 'app-3', 'app-4', 'app-5']);
  });

  it('returns remaining_seats when the FIFO query is empty (e.g. all skip-locked)', async () => {
    const { service, capacityService } = buildService();
    const db = buildMockDb();
    (capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
      total_capacity: 25,
      enrolled_student_count: 20,
      conditional_approval_count: 0,
      available_seats: 5,
      configured: true,
    });
    db.$queryRaw.mockResolvedValue([]);

    const result = await service.promoteYearGroup(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      yearGroupId: YEAR_GROUP_ID,
    });

    expect(result).toEqual({
      promoted_count: 0,
      promoted_application_ids: [],
      remaining_seats: 5,
    });
    expect(db.application.update).not.toHaveBeenCalled();
  });

  it('does not surface search or notification failures as errors', async () => {
    const { service, capacityService, searchIndexService, notificationsQueue } = buildService();
    const db = buildMockDb();
    (capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
      total_capacity: 25,
      enrolled_student_count: 20,
      conditional_approval_count: 0,
      available_seats: 5,
      configured: true,
    });
    db.$queryRaw.mockResolvedValue([candidateRow('app-1', 'APP-1')]);
    (searchIndexService.indexEntity as jest.Mock).mockRejectedValue(new Error('meili down'));
    (notificationsQueue.add as jest.Mock).mockRejectedValue(new Error('bull down'));

    const result = await service.promoteYearGroup(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      yearGroupId: YEAR_GROUP_ID,
    });

    expect(result.promoted_count).toBe(1);
    expect(db.application.update).toHaveBeenCalledTimes(1);
  });
});

describe('AdmissionsAutoPromotionService — onClassAdded', () => {
  afterEach(() => jest.clearAllMocks());

  it('resolves the class pair and calls promoteYearGroup', async () => {
    const { service, capacityService } = buildService();
    const db = buildMockDb();
    db.class.findFirst.mockResolvedValue({
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: YEAR_GROUP_ID,
    });
    (capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
      total_capacity: 25,
      enrolled_student_count: 24,
      conditional_approval_count: 0,
      available_seats: 1,
      configured: true,
    });
    db.$queryRaw.mockResolvedValue([candidateRow('app-1', 'APP-1')]);

    const result = await service.onClassAdded(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      classId: CLASS_ID,
    });

    expect(result.promoted_count).toBe(1);
    expect(db.class.findFirst).toHaveBeenCalledWith({
      where: { id: CLASS_ID, tenant_id: TENANT_ID },
      select: { academic_year_id: true, year_group_id: true },
    });
    expect(capacityService.getAvailableSeats).toHaveBeenCalledWith(expect.anything(), {
      tenantId: TENANT_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      yearGroupId: YEAR_GROUP_ID,
    });
  });

  it('throws NotFoundException when the class does not exist', async () => {
    const { service } = buildService();
    const db = buildMockDb();
    db.class.findFirst.mockResolvedValue(null);

    await expect(
      service.onClassAdded(db as unknown as PrismaService, {
        tenantId: TENANT_ID,
        classId: CLASS_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('no-ops when the class has no year group', async () => {
    const { service, capacityService } = buildService();
    const db = buildMockDb();
    db.class.findFirst.mockResolvedValue({
      academic_year_id: ACADEMIC_YEAR_ID,
      year_group_id: null,
    });

    const result = await service.onClassAdded(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      classId: CLASS_ID,
    });

    expect(result).toEqual({
      promoted_count: 0,
      promoted_application_ids: [],
      remaining_seats: 0,
    });
    expect(capacityService.getAvailableSeats).not.toHaveBeenCalled();
  });
});

describe('AdmissionsAutoPromotionService — onYearGroupActivated', () => {
  afterEach(() => jest.clearAllMocks());

  it('drops awaiting_year_setup substatus and then runs a FIFO promotion pass', async () => {
    const { service, capacityService } = buildService();
    const db = buildMockDb();
    // First $queryRaw = FOR UPDATE lock of awaiting_year_setup rows.
    // Second $queryRaw = FIFO SKIP LOCKED candidate fetch.
    db.$queryRaw
      .mockResolvedValueOnce([{ id: 'app-1' }, { id: 'app-2' }])
      .mockResolvedValueOnce([candidateRow('app-1', 'APP-1'), candidateRow('app-2', 'APP-2')]);
    (capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
      total_capacity: 25,
      enrolled_student_count: 0,
      conditional_approval_count: 0,
      available_seats: 25,
      configured: true,
    });

    const result = await service.onYearGroupActivated(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      yearGroupId: YEAR_GROUP_ID,
    });

    expect(db.application.updateMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        status: 'waiting_list',
        waiting_list_substatus: 'awaiting_year_setup',
        target_academic_year_id: ACADEMIC_YEAR_ID,
        target_year_group_id: YEAR_GROUP_ID,
      },
      data: { waiting_list_substatus: null },
    });
    expect(result.promoted_count).toBe(2);
  });

  it('does not touch year groups other than the requested pair', async () => {
    const { service, capacityService } = buildService();
    const db = buildMockDb();
    db.$queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    (capacityService.getAvailableSeats as jest.Mock).mockResolvedValue({
      total_capacity: 25,
      enrolled_student_count: 0,
      conditional_approval_count: 0,
      available_seats: 25,
      configured: true,
    });

    await service.onYearGroupActivated(db as unknown as PrismaService, {
      tenantId: TENANT_ID,
      academicYearId: ACADEMIC_YEAR_ID,
      yearGroupId: OTHER_YEAR_GROUP_ID,
    });

    expect(db.application.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ target_year_group_id: OTHER_YEAR_GROUP_ID }),
      }),
    );
  });
});
