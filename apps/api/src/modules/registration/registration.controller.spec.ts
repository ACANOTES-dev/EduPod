import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { RegistrationController } from './registration.controller';
import { RegistrationService } from './registration.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const mockGuard: CanActivate = { canActivate: () => true };

describe('RegistrationController', () => {
  let controller: RegistrationController;
  let mockService: {
    previewFees: jest.Mock;
    registerFamily: jest.Mock;
  };

  const tenant: TenantContext = {
    tenant_id: TENANT_ID,
    slug: 'test-school',
    name: 'Test School',
    status: 'active',
    default_locale: 'en',
    timezone: 'Europe/Dublin',
  };
  const user: JwtPayload = {
    sub: USER_ID,
    email: 'admin@example.com',
    tenant_id: TENANT_ID,
    membership_id: 'mem-1',
    type: 'access',
    iat: 0,
    exp: 0,
  };

  beforeEach(async () => {
    mockService = {
      previewFees: jest.fn(),
      registerFamily: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RegistrationController],
      providers: [{ provide: RegistrationService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard).useValue(mockGuard)
      .overrideGuard(PermissionGuard).useValue(mockGuard)
      .compile();

    controller = module.get<RegistrationController>(RegistrationController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('previewFees()', () => {
    it('should call service.previewFees with tenant id and dto', async () => {
      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const expected = { students: [], available_discounts: [], grand_total: 0 };
      mockService.previewFees.mockResolvedValue(expected);

      const result = await controller.previewFees(tenant, dto as never);

      expect(mockService.previewFees).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual(expected);
    });

    it('should return fee preview data from service', async () => {
      const dto = { students: [{ year_group_id: 'yg-1' }] };
      const previewData = {
        students: [{ student_index: 0, year_group_name: 'Year 10', fees: [], subtotal: 500 }],
        available_discounts: [{ discount_id: 'd-1', name: 'Sibling Discount', discount_type: 'percent', value: 10 }],
        grand_total: 500,
      };
      mockService.previewFees.mockResolvedValue(previewData);

      const result = await controller.previewFees(tenant, dto as never) as {
        grand_total: number;
        students: unknown[];
      };

      expect(result.grand_total).toBe(500);
      expect(result.students).toHaveLength(1);
    });
  });

  describe('registerFamily()', () => {
    it('should call service.registerFamily with tenant id, user id, and dto', async () => {
      const dto = {
        household: { household_name: 'Smith Family' },
        primary_parent: { first_name: 'John', last_name: 'Smith', phone: '+353123456', relationship_label: 'Father' },
        students: [{ first_name: 'Jane', last_name: 'Smith', date_of_birth: '2015-01-01', gender: 'female', year_group_id: 'yg-1', national_id: '123' }],
        emergency_contacts: [],
        fee_assignments: [],
        applied_discounts: [],
        adhoc_adjustments: [],
      };
      const registrationResult = {
        household: { id: 'hh-1', household_number: 'HH-202603-0001', household_name: 'Smith Family' },
        parents: [{ id: 'p-1', first_name: 'John', last_name: 'Smith' }],
        students: [{ id: 'stu-1', student_number: 'STU-202603-0001', first_name: 'Jane', last_name: 'Smith' }],
        invoice: { id: 'inv-1', invoice_number: 'INV-202603-0001', total_amount: 0, balance_amount: 0, status: 'issued' },
      };
      mockService.registerFamily.mockResolvedValue(registrationResult);

      const result = await controller.registerFamily(tenant, user, dto as never);

      expect(mockService.registerFamily).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(registrationResult);
    });

    it('should pass user.sub as the user id', async () => {
      const dto = {
        household: { household_name: 'Doe Family' },
        primary_parent: { first_name: 'Jane', last_name: 'Doe', phone: '+353654321', relationship_label: 'Mother' },
        students: [],
        emergency_contacts: [],
        fee_assignments: [],
        applied_discounts: [],
        adhoc_adjustments: [],
      };
      mockService.registerFamily.mockResolvedValue({});

      await controller.registerFamily(tenant, user, dto as never);

      expect(mockService.registerFamily).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    });
  });
});
