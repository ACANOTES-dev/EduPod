import { Test, TestingModule } from '@nestjs/testing';

import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { StaffAvailabilityController } from './staff-availability.controller';
import { StaffAvailabilityService } from './staff-availability.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACADEMIC_YEAR_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AVAIL_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('StaffAvailabilityController', () => {
  let controller: StaffAvailabilityController;
  let mockService: {
    findAll: jest.Mock;
    replaceForStaff: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      findAll: jest.fn().mockResolvedValue([]),
      replaceForStaff: jest.fn().mockResolvedValue({ data: [], count: 0 }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffAvailabilityController],
      providers: [
        { provide: StaffAvailabilityService, useValue: mockService },
        { provide: PermissionCacheService, useValue: { getPermissions: jest.fn() } },
      ],
    }).compile();

    controller = module.get<StaffAvailabilityController>(StaffAvailabilityController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call findAll with tenant, academic year, and optional staff profile', async () => {
    const tenant = { tenant_id: TENANT_ID };
    const query = { academic_year_id: ACADEMIC_YEAR_ID, staff_profile_id: STAFF_ID };

    await controller.findAll(tenant, query);

    expect(mockService.findAll).toHaveBeenCalledWith(TENANT_ID, ACADEMIC_YEAR_ID, STAFF_ID);
  });

  it('should call replaceForStaff with tenant, staffProfileId, academicYearId and entries', async () => {
    const tenant = { tenant_id: TENANT_ID };
    const entries = [{ weekday: 1, available_from: '08:00', available_to: '14:00' }];

    await controller.replaceForStaff(tenant, STAFF_ID, ACADEMIC_YEAR_ID, { entries });

    expect(mockService.replaceForStaff).toHaveBeenCalledWith(
      TENANT_ID,
      STAFF_ID,
      ACADEMIC_YEAR_ID,
      entries,
    );
  });

  it('should call delete with tenant and id', async () => {
    const tenant = { tenant_id: TENANT_ID };

    await controller.remove(tenant, AVAIL_ID);

    expect(mockService.delete).toHaveBeenCalledWith(TENANT_ID, AVAIL_ID);
  });
});
