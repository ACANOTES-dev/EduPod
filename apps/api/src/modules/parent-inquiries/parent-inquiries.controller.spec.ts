import { CanActivate } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { ParentInquiriesController } from './parent-inquiries.controller';
import { ParentInquiriesService } from './parent-inquiries.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INQUIRY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockGuard: CanActivate = { canActivate: () => true };

describe('ParentInquiriesController', () => {
  let controller: ParentInquiriesController;
  let mockService: {
    listForAdmin: jest.Mock;
    listForParent: jest.Mock;
    getByIdForAdmin: jest.Mock;
    getByIdForParent: jest.Mock;
    create: jest.Mock;
    addAdminMessage: jest.Mock;
    addParentMessage: jest.Mock;
    close: jest.Mock;
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
    email: 'parent@example.com',
    tenant_id: TENANT_ID,
    membership_id: 'mem-1',
    type: 'access',
    iat: 0,
    exp: 0,
  };

  beforeEach(async () => {
    mockService = {
      listForAdmin: jest.fn(),
      listForParent: jest.fn(),
      getByIdForAdmin: jest.fn(),
      getByIdForParent: jest.fn(),
      create: jest.fn(),
      addAdminMessage: jest.fn(),
      addParentMessage: jest.fn(),
      close: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentInquiriesController],
      providers: [{ provide: ParentInquiriesService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue(mockGuard)
      .overrideGuard(PermissionGuard)
      .useValue(mockGuard)
      .overrideGuard(ModuleEnabledGuard)
      .useValue(mockGuard)
      .compile();

    controller = module.get<ParentInquiriesController>(ParentInquiriesController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list()', () => {
    it('should call service.listForAdmin with tenant id and query', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.listForAdmin.mockResolvedValue(expected);

      const result = await controller.list(tenant, query);

      expect(mockService.listForAdmin).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toEqual(expected);
    });
  });

  describe('listForParent()', () => {
    it('should call service.listForParent with tenant id, user id, and query', async () => {
      const query = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.listForParent.mockResolvedValue(expected);

      const result = await controller.listForParent(tenant, user, query);

      expect(mockService.listForParent).toHaveBeenCalledWith(TENANT_ID, USER_ID, query);
      expect(result).toEqual(expected);
    });
  });

  describe('getById()', () => {
    it('should call service.getByIdForAdmin with tenant id and inquiry id', async () => {
      const inquiry = { id: INQUIRY_ID, subject: 'Question about grades' };
      mockService.getByIdForAdmin.mockResolvedValue(inquiry);

      const result = await controller.getById(tenant, INQUIRY_ID);

      expect(mockService.getByIdForAdmin).toHaveBeenCalledWith(TENANT_ID, INQUIRY_ID);
      expect(result).toEqual(inquiry);
    });
  });

  describe('getByIdForParent()', () => {
    it('should call service.getByIdForParent with tenant id, user id, and inquiry id', async () => {
      const inquiry = { id: INQUIRY_ID, subject: 'Question' };
      mockService.getByIdForParent.mockResolvedValue(inquiry);

      const result = await controller.getByIdForParent(tenant, user, INQUIRY_ID);

      expect(mockService.getByIdForParent).toHaveBeenCalledWith(TENANT_ID, USER_ID, INQUIRY_ID);
      expect(result).toEqual(inquiry);
    });
  });

  describe('create()', () => {
    it('should call service.create with tenant id, user id, and dto', async () => {
      const dto = { subject: 'New inquiry', message: 'I have a question' };
      const created = { id: INQUIRY_ID, ...dto, status: 'open' };
      mockService.create.mockResolvedValue(created);

      const result = await controller.create(tenant, user, dto);

      expect(mockService.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
      expect(result).toEqual(created);
    });
  });

  describe('addAdminMessage()', () => {
    it('should call service.addAdminMessage with all parameters', async () => {
      const dto = { message: 'Response from admin' };
      const message = { id: 'msg-1', message: dto.message };
      mockService.addAdminMessage.mockResolvedValue(message);

      const result = await controller.addAdminMessage(tenant, user, INQUIRY_ID, dto);

      expect(mockService.addAdminMessage).toHaveBeenCalledWith(TENANT_ID, USER_ID, INQUIRY_ID, dto);
      expect(result).toEqual(message);
    });
  });

  describe('addParentMessage()', () => {
    it('should call service.addParentMessage with all parameters', async () => {
      const dto = { message: 'Follow-up from parent' };
      const message = { id: 'msg-2', message: dto.message };
      mockService.addParentMessage.mockResolvedValue(message);

      const result = await controller.addParentMessage(tenant, user, INQUIRY_ID, dto);

      expect(mockService.addParentMessage).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
        INQUIRY_ID,
        dto,
      );
      expect(result).toEqual(message);
    });
  });

  describe('close()', () => {
    it('should call service.close with tenant id and inquiry id', async () => {
      const closed = { id: INQUIRY_ID, status: 'closed' };
      mockService.close.mockResolvedValue(closed);

      const result = await controller.close(tenant, user, INQUIRY_ID);

      expect(mockService.close).toHaveBeenCalledWith(TENANT_ID, INQUIRY_ID);
      expect(result).toEqual(closed);
    });
  });
});
