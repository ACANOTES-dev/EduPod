import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { StaffAvailabilityReadFacade } from './staff-availability-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STAFF_PROFILE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const availabilityRow = {
  id: 'availability-1',
  staff_profile_id: STAFF_PROFILE_ID,
  academic_year_id: ACADEMIC_YEAR_ID,
  weekday: 1,
  available_from: new Date('2026-01-01T09:00:00.000Z'),
  available_to: new Date('2026-01-01T15:00:00.000Z'),
};

function buildMockPrisma() {
  return {
    staffAvailability: {
      findMany: jest.fn(),
    },
  };
}

describe('StaffAvailabilityReadFacade', () => {
  let facade: StaffAvailabilityReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [StaffAvailabilityReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<StaffAvailabilityReadFacade>(StaffAvailabilityReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('findByAcademicYear scopes by tenant and academic year', async () => {
    mockPrisma.staffAvailability.findMany.mockResolvedValue([availabilityRow]);

    const result = await facade.findByAcademicYear(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toEqual([availabilityRow]);
    expect(mockPrisma.staffAvailability.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, academic_year_id: ACADEMIC_YEAR_ID },
    });
  });

  it('findByStaffIds returns an empty array when no staff ids are provided', async () => {
    await expect(facade.findByStaffIds(TENANT_ID, ACADEMIC_YEAR_ID, [])).resolves.toEqual([]);
    expect(mockPrisma.staffAvailability.findMany).not.toHaveBeenCalled();
  });

  it('findByStaffIds queries the requested staff ids', async () => {
    mockPrisma.staffAvailability.findMany.mockResolvedValue([availabilityRow]);

    const result = await facade.findByStaffIds(TENANT_ID, ACADEMIC_YEAR_ID, [STAFF_PROFILE_ID]);

    expect(result).toEqual([availabilityRow]);
    expect(mockPrisma.staffAvailability.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        staff_profile_id: { in: [STAFF_PROFILE_ID] },
      },
      select: {
        staff_profile_id: true,
        weekday: true,
        available_from: true,
        available_to: true,
      },
    });
  });

  it('findByWeekday filters by the supplied weekday', async () => {
    mockPrisma.staffAvailability.findMany.mockResolvedValue([availabilityRow]);

    const result = await facade.findByWeekday(TENANT_ID, ACADEMIC_YEAR_ID, 1);

    expect(result).toEqual([availabilityRow]);
    expect(mockPrisma.staffAvailability.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        weekday: 1,
      },
      select: {
        staff_profile_id: true,
        weekday: true,
        available_from: true,
        available_to: true,
      },
    });
  });
});
