import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { StaffProfileReadFacade } from './staff-profile-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROFILE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const staffProfileSummary = {
  id: PROFILE_ID,
  tenant_id: TENANT_ID,
  user_id: USER_ID,
  staff_number: 'STF-001',
  job_title: 'Teacher',
  employment_status: 'active',
  department: 'Mathematics',
  employment_type: 'full_time',
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-02T00:00:00.000Z'),
  user: {
    id: USER_ID,
    first_name: 'Sarah',
    last_name: 'Johnson',
    email: 'sarah@example.com',
  },
};

const staffProfileWithScheduling = {
  ...staffProfileSummary,
  staff_availability: [],
  staff_scheduling_preferences: [],
  teacher_scheduling_configs: [],
};

function buildMockPrisma() {
  return {
    staffProfile: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };
}

describe('StaffProfileReadFacade', () => {
  let facade: StaffProfileReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [StaffProfileReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<StaffProfileReadFacade>(StaffProfileReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('findById returns the matching profile', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue(staffProfileSummary);

    const result = await facade.findById(TENANT_ID, PROFILE_ID);

    expect(result).toEqual(staffProfileSummary);
    expect(mockPrisma.staffProfile.findFirst).toHaveBeenCalledWith({
      where: { id: PROFILE_ID, tenant_id: TENANT_ID },
      select: expect.objectContaining({ id: true, user: expect.any(Object) }),
    });
  });

  it('findByIds short-circuits when no ids are provided', async () => {
    await expect(facade.findByIds(TENANT_ID, [])).resolves.toEqual([]);
    expect(mockPrisma.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it('findByIds queries all requested ids', async () => {
    mockPrisma.staffProfile.findMany.mockResolvedValue([staffProfileSummary]);

    const result = await facade.findByIds(TENANT_ID, [PROFILE_ID]);

    expect(result).toEqual([staffProfileSummary]);
    expect(mockPrisma.staffProfile.findMany).toHaveBeenCalledWith({
      where: { id: { in: [PROFILE_ID] }, tenant_id: TENANT_ID },
      select: expect.objectContaining({ id: true }),
    });
  });

  it('findByUserId queries by linked user id', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue(staffProfileSummary);

    const result = await facade.findByUserId(TENANT_ID, USER_ID);

    expect(result).toEqual(staffProfileSummary);
    expect(mockPrisma.staffProfile.findFirst).toHaveBeenCalledWith({
      where: { user_id: USER_ID, tenant_id: TENANT_ID },
      select: expect.objectContaining({ user_id: true }),
    });
  });

  it('findActiveStaff restricts to active staff and orders by first name', async () => {
    mockPrisma.staffProfile.findMany.mockResolvedValue([staffProfileSummary]);

    const result = await facade.findActiveStaff(TENANT_ID);

    expect(result).toEqual([staffProfileSummary]);
    expect(mockPrisma.staffProfile.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, employment_status: 'active' },
      select: expect.objectContaining({ employment_status: true }),
      orderBy: { user: { first_name: 'asc' } },
    });
  });

  it('findStaffWithSchedulingInfo short-circuits when no ids are provided', async () => {
    await expect(facade.findStaffWithSchedulingInfo(TENANT_ID, [])).resolves.toEqual([]);
    expect(mockPrisma.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it('findStaffWithSchedulingInfo returns scheduling-enriched profiles', async () => {
    mockPrisma.staffProfile.findMany.mockResolvedValue([staffProfileWithScheduling]);

    const result = await facade.findStaffWithSchedulingInfo(TENANT_ID, [PROFILE_ID]);

    expect(result).toEqual([staffProfileWithScheduling]);
    expect(mockPrisma.staffProfile.findMany).toHaveBeenCalledWith({
      where: { id: { in: [PROFILE_ID] }, tenant_id: TENANT_ID },
      select: expect.objectContaining({
        staff_availability: expect.any(Object),
        staff_scheduling_preferences: expect.any(Object),
        teacher_scheduling_configs: expect.any(Object),
      }),
    });
  });

  it('resolveProfileId returns the profile id when found', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: PROFILE_ID });

    await expect(facade.resolveProfileId(TENANT_ID, USER_ID)).resolves.toBe(PROFILE_ID);
  });

  it('resolveProfileId throws when no profile exists for the user', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

    await expect(facade.resolveProfileId(TENANT_ID, USER_ID)).rejects.toThrow(NotFoundException);
  });

  it('existsOrThrow completes silently when the profile exists', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue({ id: PROFILE_ID });

    await expect(facade.existsOrThrow(TENANT_ID, PROFILE_ID)).resolves.toBeUndefined();
  });

  it('existsOrThrow throws when the profile does not exist', async () => {
    mockPrisma.staffProfile.findFirst.mockResolvedValue(null);

    await expect(facade.existsOrThrow(TENANT_ID, PROFILE_ID)).rejects.toThrow(NotFoundException);
  });

  it('count merges tenant scoping with caller filters', async () => {
    mockPrisma.staffProfile.count.mockResolvedValue(3);

    const result = await facade.count(TENANT_ID, { employment_status: 'active' });

    expect(result).toBe(3);
    expect(mockPrisma.staffProfile.count).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, employment_status: 'active' },
    });
  });

  it('findAllWithUser includes the user relation and optional ordering', async () => {
    mockPrisma.staffProfile.findMany.mockResolvedValue([staffProfileSummary]);

    const result = await facade.findAllWithUser(TENANT_ID, {
      where: { employment_status: 'active' },
      orderBy: { staff_number: 'asc' },
    });

    expect(result).toEqual([staffProfileSummary]);
    expect(mockPrisma.staffProfile.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, employment_status: 'active' },
      include: {
        user: { select: { first_name: true, last_name: true } },
      },
      orderBy: { staff_number: 'asc' },
    });
  });

  it('findManyGeneric forwards select, skip, and take when provided', async () => {
    mockPrisma.staffProfile.findMany.mockResolvedValue([staffProfileSummary]);

    const result = await facade.findManyGeneric(TENANT_ID, {
      where: { employment_status: 'active' },
      select: { id: true, user_id: true },
      skip: 5,
      take: 10,
    });

    expect(result).toEqual([staffProfileSummary]);
    expect(mockPrisma.staffProfile.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, employment_status: 'active' },
      select: { id: true, user_id: true },
      skip: 5,
      take: 10,
    });
  });

  it('findManyGeneric omits optional fields when not provided', async () => {
    mockPrisma.staffProfile.findMany.mockResolvedValue([]);

    await facade.findManyGeneric(TENANT_ID, {});

    expect(mockPrisma.staffProfile.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID },
    });
  });

  it('groupBy scopes by tenant and returns the grouped rows', async () => {
    const grouped = [{ department: 'Mathematics', _count: { _all: 2 } }];
    mockPrisma.staffProfile.groupBy.mockResolvedValue(grouped);

    const result = await facade.groupBy(TENANT_ID, ['department'], {
      employment_status: 'active',
    });

    expect(result).toEqual(grouped);
    expect(mockPrisma.staffProfile.groupBy).toHaveBeenCalledWith({
      by: ['department'],
      where: { tenant_id: TENANT_ID, employment_status: 'active' },
      _count: true,
    });
  });

  it('findWithStaleBankEncryptionKey queries stale non-null key refs', async () => {
    const staleProfiles = [
      {
        id: PROFILE_ID,
        bank_account_number_encrypted: 'enc-account',
        bank_iban_encrypted: null,
        bank_encryption_key_ref: 'old-key',
      },
    ];
    mockPrisma.staffProfile.findMany.mockResolvedValue(staleProfiles);

    const result = await facade.findWithStaleBankEncryptionKey('current-key', 50, 10);

    expect(result).toEqual(staleProfiles);
    expect(mockPrisma.staffProfile.findMany).toHaveBeenCalledWith({
      where: {
        bank_encryption_key_ref: {
          not: 'current-key',
        },
        NOT: {
          bank_encryption_key_ref: null,
        },
      },
      take: 50,
      skip: 10,
    });
  });
});
