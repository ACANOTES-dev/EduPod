/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload } from '@school/shared';

import { RegistrationService } from '../registration/registration.service';

import { HouseholdsController } from './households.controller';
import { HouseholdsService } from './households.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOUSEHOLD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONTACT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const SOURCE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const mockTenant = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.test',
  tenant_id: TENANT_ID,
  membership_id: null,
  type: 'access',
  iat: 0,
  exp: 9999999999,
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

function buildMockRegistrationService() {
  return {
    addStudentToHousehold: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HouseholdsController', () => {
  let controller: HouseholdsController;
  let service: ReturnType<typeof buildMockHouseholdsService>;
  let registrationService: ReturnType<typeof buildMockRegistrationService>;

  beforeEach(async () => {
    service = buildMockHouseholdsService();
    registrationService = buildMockRegistrationService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HouseholdsController],
      providers: [
        { provide: HouseholdsService, useValue: service },
        { provide: RegistrationService, useValue: registrationService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HouseholdsController>(HouseholdsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────

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

  // ─── findAll ────────────────────────────────────────────────────────────

  it('should call findAll with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, query);

    expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should pass search and status filters through to service', async () => {
    const query = { page: 1, pageSize: 10, status: 'archived' as const, search: 'Jones' };
    service.findAll.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 10, total: 0 } });

    await controller.findAll(mockTenant, query);

    expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query);
  });

  // ─── findOne ────────────────────────────────────────────────────────────

  it('should call findOne with tenant_id and id', async () => {
    const expected = { id: HOUSEHOLD_ID, household_name: 'Smith Family' };
    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, HOUSEHOLD_ID);

    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID);
    expect(result).toBe(expected);
  });

  // ─── update ─────────────────────────────────────────────────────────────

  it('should call update with tenant_id, id, and dto', async () => {
    const dto = { household_name: 'Updated Family' };
    const expected = { id: HOUSEHOLD_ID, household_name: 'Updated Family' };
    service.update.mockResolvedValue(expected);

    const result = await controller.update(mockTenant, HOUSEHOLD_ID, dto);

    expect(service.update).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── updateStatus ──────────────────────────────────────────────────────

  it('should call updateStatus with tenant_id, id, and status', async () => {
    const expected = { id: HOUSEHOLD_ID, status: 'archived' };
    service.updateStatus.mockResolvedValue(expected);

    const result = await controller.updateStatus(mockTenant, HOUSEHOLD_ID, { status: 'archived' });

    expect(service.updateStatus).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, 'archived');
    expect(result).toBe(expected);
  });

  it('should call updateStatus with inactive status', async () => {
    service.updateStatus.mockResolvedValue({ id: HOUSEHOLD_ID, status: 'inactive' });

    const result = await controller.updateStatus(mockTenant, HOUSEHOLD_ID, { status: 'inactive' });

    expect(service.updateStatus).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, 'inactive');
    expect(result).toHaveProperty('status', 'inactive');
  });

  // ─── setBillingParent ──────────────────────────────────────────────────

  it('should call setBillingParent with correct args', async () => {
    const body = { parent_id: PARENT_ID };
    const expected = { id: HOUSEHOLD_ID, primary_billing_parent_id: PARENT_ID };
    service.setBillingParent.mockResolvedValue(expected);

    const result = await controller.setBillingParent(mockTenant, HOUSEHOLD_ID, body);

    expect(service.setBillingParent).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);
    expect(result).toBe(expected);
  });

  // ─── merge ──────────────────────────────────────────────────────────────

  it('should call merge with tenant_id and dto', async () => {
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

  it('mergeGet should return METHOD_NOT_ALLOWED', () => {
    const result = controller.mergeGet();

    expect(result).toEqual({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST /merge' } });
  });

  // ─── split ──────────────────────────────────────────────────────────────

  it('should call split with tenant_id and dto', async () => {
    const dto = {
      source_household_id: SOURCE_ID,
      new_household_name: 'Split Family',
      student_ids: ['student-1'],
      parent_ids: [PARENT_ID],
      emergency_contacts: [
        { contact_name: 'Jane', phone: '+1-555-0001', display_order: 1 as const },
      ],
    };
    const expected = { id: 'new-household-id', household_name: 'Split Family' };
    service.split.mockResolvedValue(expected);

    const result = await controller.split(mockTenant, dto);

    expect(service.split).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toBe(expected);
  });

  // ─── emergency contacts ─────────────────────────────────────────────────

  it('should call addEmergencyContact with tenant_id, householdId, and dto', async () => {
    const dto = {
      contact_name: 'Bob Jones',
      phone: '+353-1-555-0002',
      relationship_label: 'Uncle',
      display_order: 2 as const,
    };
    const expected = { id: CONTACT_ID, ...dto };
    service.addEmergencyContact.mockResolvedValue(expected);

    const result = await controller.addEmergencyContact(mockTenant, HOUSEHOLD_ID, dto);

    expect(service.addEmergencyContact).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call updateEmergencyContact with correct args', async () => {
    const dto = {
      contact_name: 'Updated Bob',
      phone: '+353-1-555-9999',
      display_order: 1 as const,
    };
    const expected = { id: CONTACT_ID, ...dto };
    service.updateEmergencyContact.mockResolvedValue(expected);

    const result = await controller.updateEmergencyContact(
      mockTenant,
      HOUSEHOLD_ID,
      CONTACT_ID,
      dto,
    );

    expect(service.updateEmergencyContact).toHaveBeenCalledWith(
      TENANT_ID,
      HOUSEHOLD_ID,
      CONTACT_ID,
      dto,
    );
    expect(result).toBe(expected);
  });

  it('should call removeEmergencyContact with correct args', async () => {
    service.removeEmergencyContact.mockResolvedValue(undefined);

    await controller.removeEmergencyContact(mockTenant, HOUSEHOLD_ID, CONTACT_ID);

    expect(service.removeEmergencyContact).toHaveBeenCalledWith(
      TENANT_ID,
      HOUSEHOLD_ID,
      CONTACT_ID,
    );
  });

  // ─── parent links ──────────────────────────────────────────────────────

  it('should call linkParent with tenant_id, householdId, parentId, and roleLabel', async () => {
    const body = { parent_id: PARENT_ID, role_label: 'Guardian' };
    const expected = { household_id: HOUSEHOLD_ID, parent_id: PARENT_ID };
    service.linkParent.mockResolvedValue(expected);

    const result = await controller.linkParent(mockTenant, HOUSEHOLD_ID, body);

    expect(service.linkParent).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, PARENT_ID, 'Guardian');
    expect(result).toBe(expected);
  });

  it('should call linkParent without roleLabel when not provided', async () => {
    const body = { parent_id: PARENT_ID };
    service.linkParent.mockResolvedValue({});

    await controller.linkParent(mockTenant, HOUSEHOLD_ID, body);

    expect(service.linkParent).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, PARENT_ID, undefined);
  });

  it('should call unlinkParent with tenant_id, householdId, and parentId', async () => {
    service.unlinkParent.mockResolvedValue(undefined);

    await controller.unlinkParent(mockTenant, HOUSEHOLD_ID, PARENT_ID);

    expect(service.unlinkParent).toHaveBeenCalledWith(TENANT_ID, HOUSEHOLD_ID, PARENT_ID);
  });

  // ─── addStudent ─────────────────────────────────────────────────────────

  it('should call registrationService.addStudentToHousehold with correct args', async () => {
    const dto = {
      first_name: 'Tommy',
      last_name: 'Smith',
      date_of_birth: '2018-05-15',
      gender: 'male' as const,
      year_group_id: 'yg-uuid-1',
      national_id: 'NAT-001',
    };
    const expected = { id: 'student-id', first_name: 'Tommy' };
    registrationService.addStudentToHousehold.mockResolvedValue(expected);

    const result = await controller.addStudent(mockTenant, mockUser, HOUSEHOLD_ID, dto);

    expect(registrationService.addStudentToHousehold).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      HOUSEHOLD_ID,
      dto,
    );
    expect(result).toBe(expected);
  });

  // ─── preview ────────────────────────────────────────────────────────────

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
