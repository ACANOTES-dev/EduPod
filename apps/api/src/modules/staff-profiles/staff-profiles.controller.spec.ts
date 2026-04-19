/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type {
  CreateStaffProfileDto,
  StaffProfileQueryDto,
  UpdateStaffProfileDto,
} from '@school/shared';

import { StaffProfilesController } from './staff-profiles.controller';
import { StaffProfilesService } from './staff-profiles.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STAFF_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockTenant = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

// ─── Mock service builder ─────────────────────────────────────────────────────

function buildMockStaffProfilesService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    getBankDetails: jest.fn(),
    preview: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StaffProfilesController', () => {
  let controller: StaffProfilesController;
  let service: ReturnType<typeof buildMockStaffProfilesService>;

  beforeEach(async () => {
    service = buildMockStaffProfilesService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffProfilesController],
      providers: [{ provide: StaffProfilesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<StaffProfilesController>(StaffProfilesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call create with tenant_id and dto', async () => {
    const dto: CreateStaffProfileDto = {
      first_name: 'Alice',
      last_name: 'Smith',
      phone: '+353871234567',
      role_id: 'role-uuid-0001-0001-0001-000100010001',
      employment_status: 'active',
      employment_type: 'full_time',
    };
    const expected = { id: STAFF_ID, staff_number: 'ABC123' };
    service.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant, dto);

    expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call findAll with tenant_id and query', async () => {
    const query: StaffProfileQueryDto = { page: 1, pageSize: 20 };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, query);

    expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should call findOne with tenant_id and id', async () => {
    const expected = { id: STAFF_ID, user_first_name: 'Alice', class_assignments: [] };
    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, STAFF_ID);

    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    expect(result).toBe(expected);
  });

  it('should call update with tenant_id, id, and dto', async () => {
    const dto: UpdateStaffProfileDto = { job_title: 'Senior Teacher', employment_status: 'active' };
    const expected = { id: STAFF_ID, job_title: 'Senior Teacher' };
    service.update.mockResolvedValue(expected);

    const result = await controller.update(mockTenant, STAFF_ID, dto);

    expect(service.update).toHaveBeenCalledWith(TENANT_ID, STAFF_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call getBankDetails with tenant_id and id', async () => {
    const expected = {
      id: STAFF_ID,
      bank_name: 'AIB',
      bank_account_number_masked: '****6789',
      bank_iban_masked: '****5678',
    };
    service.getBankDetails.mockResolvedValue(expected);

    const result = await controller.getBankDetails(mockTenant, STAFF_ID);

    expect(service.getBankDetails).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    expect(result).toBe(expected);
  });

  it('should call preview with tenant_id and id', async () => {
    const expected = {
      id: STAFF_ID,
      entity_type: 'staff' as const,
      primary_label: 'Alice Smith',
      secondary_label: 'Teacher',
      status: 'active',
      facts: [{ label: 'Email', value: 'alice@example.com' }],
    };
    service.preview.mockResolvedValue(expected);

    const result = await controller.preview(mockTenant, STAFF_ID);

    expect(service.preview).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    expect(result).toBe(expected);
  });
});
