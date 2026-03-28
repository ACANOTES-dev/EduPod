/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type {
  ClassifyComplianceRequestDto,
  ComplianceDecisionDto,
  ComplianceFilterDto,
  ComplianceOverdueFilterDto,
  CreateComplianceRequestDto,
  ExtendComplianceRequestDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';

import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const REQUEST_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockTenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockJwtPayload: JwtPayload = {
  sub: USER_ID,
  email: 'admin@school.test',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

function buildMockComplianceService() {
  return {
    create: jest.fn(),
    list: jest.fn(),
    listOverdue: jest.fn(),
    get: jest.fn(),
    classify: jest.fn(),
    approve: jest.fn(),
    reject: jest.fn(),
    execute: jest.fn(),
    extend: jest.fn(),
    getExportUrl: jest.fn(),
  };
}

describe('ComplianceController', () => {
  let controller: ComplianceController;
  let service: ReturnType<typeof buildMockComplianceService>;

  beforeEach(async () => {
    service = buildMockComplianceService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [{ provide: ComplianceService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(
        require('../../common/guards/permission.guard').PermissionGuard,
      )
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ComplianceController>(ComplianceController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call create with tenant_id, user_id, and dto', async () => {
    const dto: CreateComplianceRequestDto = {
      request_type: 'access_export',
      subject_type: 'student',
      subject_id: 'student-1',
    };
    const expected = { id: REQUEST_ID, status: 'submitted', ...dto };
    service.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant, mockJwtPayload, dto);

    expect(service.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call list with tenant_id and filter query', async () => {
    const query: ComplianceFilterDto = { page: 1, pageSize: 20 };
    const expected = {
      data: [],
      meta: { page: 1, pageSize: 20, total: 0 },
    };
    service.list.mockResolvedValue(expected);

    const result = await controller.list(mockTenant, query);

    expect(service.list).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should call get with tenant_id and request id', async () => {
    const expected = { id: REQUEST_ID, status: 'submitted' };
    service.get.mockResolvedValue(expected);

    const result = await controller.get(mockTenant, REQUEST_ID);

    expect(service.get).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID);
    expect(result).toBe(expected);
  });

  it('should call classify with tenant_id, request id, and dto', async () => {
    const dto: ClassifyComplianceRequestDto = {
      classification: 'retain_legal_basis',
    };
    const expected = { id: REQUEST_ID, status: 'classified' };
    service.classify.mockResolvedValue(expected);

    const result = await controller.classify(mockTenant, REQUEST_ID, dto);

    expect(service.classify).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call approve with tenant_id, request id, and dto', async () => {
    const dto: ComplianceDecisionDto = { decision_notes: 'Approved by DPO' };
    const expected = { id: REQUEST_ID, status: 'approved' };
    service.approve.mockResolvedValue(expected);

    const result = await controller.approve(mockTenant, REQUEST_ID, dto);

    expect(service.approve).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call reject with tenant_id, request id, and dto', async () => {
    const dto: ComplianceDecisionDto = {
      decision_notes: 'Rejected — incomplete',
    };
    const expected = { id: REQUEST_ID, status: 'rejected' };
    service.reject.mockResolvedValue(expected);

    const result = await controller.reject(mockTenant, REQUEST_ID, dto);

    expect(service.reject).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call execute with tenant_id, request id, and default json format', async () => {
    const expected = { id: REQUEST_ID, status: 'completed' };
    service.execute.mockResolvedValue(expected);

    const result = await controller.execute(mockTenant, REQUEST_ID, {
      format: 'json',
    });

    expect(service.execute).toHaveBeenCalledWith(
      TENANT_ID,
      REQUEST_ID,
      'json',
    );
    expect(result).toBe(expected);
  });

  it('should pass csv format through to service.execute', async () => {
    const expected = { id: REQUEST_ID, status: 'completed' };
    service.execute.mockResolvedValue(expected);

    const result = await controller.execute(mockTenant, REQUEST_ID, {
      format: 'csv',
    });

    expect(service.execute).toHaveBeenCalledWith(
      TENANT_ID,
      REQUEST_ID,
      'csv',
    );
    expect(result).toBe(expected);
  });

  describe('listOverdue', () => {
    it('should delegate to service with tenant and query params', async () => {
      const query: ComplianceOverdueFilterDto = { page: 1, pageSize: 20 };
      const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      service.listOverdue.mockResolvedValue(expected);

      const result = await controller.listOverdue(mockTenant, query);
      expect(result).toEqual(expected);
      expect(service.listOverdue).toHaveBeenCalledWith(TENANT_ID, query);
    });
  });

  describe('extend', () => {
    it('should delegate to service with tenant, id, and dto', async () => {
      const dto: ExtendComplianceRequestDto = {
        extension_reason: 'Complex request requiring additional processing time',
      };
      const expected = { id: REQUEST_ID, extension_granted: true };
      service.extend.mockResolvedValue(expected);

      const result = await controller.extend(mockTenant, REQUEST_ID, dto);
      expect(result).toEqual(expected);
      expect(service.extend).toHaveBeenCalledWith(
        TENANT_ID,
        REQUEST_ID,
        dto,
      );
    });
  });

  it('should call getExportUrl with tenant_id and request id', async () => {
    const expected = { export_file_key: 's3://bucket/exports/req-123.zip' };
    service.getExportUrl.mockResolvedValue(expected);

    const result = await controller.getExportUrl(mockTenant, REQUEST_ID);

    expect(service.getExportUrl).toHaveBeenCalledWith(TENANT_ID, REQUEST_ID);
    expect(result).toBe(expected);
  });
});
