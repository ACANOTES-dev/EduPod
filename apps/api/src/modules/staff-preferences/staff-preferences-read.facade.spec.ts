import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { StaffPreferencesReadFacade } from './staff-preferences-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACADEMIC_YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STAFF_PROFILE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const preferenceRow = {
  id: 'pref-1',
  staff_profile_id: STAFF_PROFILE_ID,
  academic_year_id: ACADEMIC_YEAR_ID,
  preference_type: 'day_off',
  preference_payload: { weekday: 5 },
  priority: 'high',
};

function buildMockPrisma() {
  return {
    staffSchedulingPreference: {
      findMany: jest.fn(),
    },
  };
}

describe('StaffPreferencesReadFacade', () => {
  let facade: StaffPreferencesReadFacade;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [StaffPreferencesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<StaffPreferencesReadFacade>(StaffPreferencesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  it('findByAcademicYear scopes the query by tenant and academic year', async () => {
    mockPrisma.staffSchedulingPreference.findMany.mockResolvedValue([preferenceRow]);

    const result = await facade.findByAcademicYear(TENANT_ID, ACADEMIC_YEAR_ID);

    expect(result).toEqual([preferenceRow]);
    expect(mockPrisma.staffSchedulingPreference.findMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, academic_year_id: ACADEMIC_YEAR_ID },
    });
  });

  it('findByStaffProfile scopes the query to one staff profile', async () => {
    mockPrisma.staffSchedulingPreference.findMany.mockResolvedValue([preferenceRow]);

    const result = await facade.findByStaffProfile(TENANT_ID, ACADEMIC_YEAR_ID, STAFF_PROFILE_ID);

    expect(result).toEqual([preferenceRow]);
    expect(mockPrisma.staffSchedulingPreference.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        staff_profile_id: STAFF_PROFILE_ID,
      },
    });
  });
});
