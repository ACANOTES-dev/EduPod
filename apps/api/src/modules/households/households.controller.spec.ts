import { Test, TestingModule } from '@nestjs/testing';

import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSEHOLD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockTenant = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

// ─── Mock service factory ─────────────────────────────────────────────────────

function buildMockHouseholdsService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    merge: jest.fn(),
    split: jest.fn(),
    setBillingParent: jest.fn(),
    addEmergencyContact: jest.fn(),
    updateEmergencyContact: jest.fn(),
    removeEmergencyContact: jest.fn(),
    linkParent: jest.fn(),
    unlinkParent: jest.fn(),
    preview: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseholdsController', () => {
  let controller: HouseholdsController;
  let service: ReturnType<typeof buildMockHouseholdsService>;

  beforeEach(async () => {
    service = buildMockHouseholdsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HouseholdsController],
      providers: [{ provide: HouseholdsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HouseholdsController>(HouseholdsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call create with tenant_id and dto', async () => {
    const dto = {
      household_name: 'Smith Family',
      emergency_contacts: [
        {
          contact_name: 'Alice Smith',
          phone: '+353-1-555-0001',
          relationship_label: 'Mother',
          display_order: 1 as const,
        },
      ],
    };
    const expected = { id: HOUSEHOLD_ID, household_name: 'Smith Family' };
    service.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant, dto);

    expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call findAll with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, query);

    expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should call findOne with tenant_id and id', async () => {
    const expected = { id: HOUSEHOLD_ID, household_name: 'Smith Family' };
    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, HOUSEHOLD_ID);

    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID);
    expect(result).toBe(expected);
  });

  it('should call setBillingParent with correct args', async () => {
    const body = { parent_id: PARENT_ID };
    const expected = { id: HOUSEHOLD_ID, primary_billing_parent_id: PARENT_ID };
    service.setBillingParent.mockResolvedValue(expected);

    const result = await controller.setBillingParent(mockTenant, HOUSEHOLD_ID, body);

    expect(service.setBillingParent).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);
    expect(result).toBe(expected);
  });

  it('should call merge with tenant_id and dto', async () => {
    const SOURCE_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const dto = {
      source_household_id: SOURCE_ID,
      target_household_id: HOUSEHOLD_ID,
    };
    const expected = { id: HOUSEHOLD_ID, household_name: 'Smith Family' };
    service.merge.mockResolvedValue(expected);

    const result = await controller.merge(mockTenant, dto);

    expect(service.merge).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call update with tenant_id, id, and dto', async () => {
    const dto = { household_name: 'Updated Family' };
    const expected = { id: HOUSEHOLD_ID, household_name: 'Updated Family' };
    service.update.mockResolvedValue(expected);

    const result = await controller.update(mockTenant, HOUSEHOLD_ID, dto);

    expect(service.update).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call linkParent with tenant_id, householdId, parentId, and roleLabel', async () => {
    const body = { parent_id: PARENT_ID, role_label: 'Guardian' };
    const expected = { household_id: HOUSEHOLD_ID, parent_id: PARENT_ID };
    service.linkParent.mockResolvedValue(expected);

    const result = await controller.linkParent(mockTenant, HOUSEHOLD_ID, body);

    expect(service.linkParent).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, PARENT_ID, 'Guardian');
    expect(result).toBe(expected);
  });

  it('should call unlinkParent with tenant_id, householdId, and parentId', async () => {
    service.unlinkParent.mockResolvedValue(undefined);

    await controller.unlinkParent(mockTenant, HOUSEHOLD_ID, PARENT_ID);

    expect(service.unlinkParent).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);
  });

  it('should call preview with tenant_id and id', async () => {
    const expected = {
      id: HOUSEHOLD_ID,
      entity_type: 'household',
      primary_label: 'Smith Family',
      secondary_label: 'No billing parent',
      status: 'active',
      facts: [],
    };
    service.preview.mockResolvedValue(expected);

    const result = await controller.preview(mockTenant, HOUSEHOLD_ID);

    expect(service.preview).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID);
    expect(result).toBe(expected);
  });
});
