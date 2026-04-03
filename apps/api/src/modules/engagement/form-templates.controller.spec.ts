/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload } from '@school/shared';
import type {
  CreateEngagementFormTemplateDto,
  DistributeFormDto,
  UpdateEngagementFormTemplateDto,
} from '@school/shared/engagement';

import { FormTemplatesController } from './form-templates.controller';
import { FormTemplatesService } from './form-templates.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEMPLATE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockTenant = { tenant_id: TENANT_ID };
const mockUser: JwtPayload = {
  sub: USER_ID,
  email: 'admin@test.com',
  tenant_id: TENANT_ID,
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

// ─── Mock factory ─────────────────────────────────────────────────────────────

function buildMockService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    publish: jest.fn(),
    archive: jest.fn(),
    distribute: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FormTemplatesController', () => {
  let controller: FormTemplatesController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [FormTemplatesController],
      providers: [{ provide: FormTemplatesService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FormTemplatesController>(FormTemplatesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call service.create with tenantId, dto, and userId', async () => {
    const dto: CreateEngagementFormTemplateDto = {
      name: 'Trip Consent',
      form_type: 'consent_form',
      consent_type: 'one_time',
      fields_json: [],
      requires_signature: true,
    };
    const expected = { id: TEMPLATE_ID, ...dto };
    service.create.mockResolvedValue(expected);

    const result = await controller.create(mockTenant, mockUser, dto);

    expect(service.create).toHaveBeenCalledWith(TENANT_ID, dto, USER_ID);
    expect(result).toBe(expected);
  });

  it('should call service.findAll with tenantId and query', async () => {
    const query = { page: 1, pageSize: 20, order: 'desc' as const, status: 'draft' as const };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    service.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, query);

    expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should call service.findOne with tenantId and id', async () => {
    const expected = { id: TEMPLATE_ID, name: 'Trip Consent' };
    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, TEMPLATE_ID);

    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID);
    expect(result).toBe(expected);
  });

  it('should call service.update with tenantId, id, and dto', async () => {
    const dto: UpdateEngagementFormTemplateDto = { name: 'Updated Name' };
    const expected = { id: TEMPLATE_ID, name: 'Updated Name' };
    service.update.mockResolvedValue(expected);

    const result = await controller.update(mockTenant, TEMPLATE_ID, dto);

    expect(service.update).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call service.delete with tenantId and id', async () => {
    service.delete.mockResolvedValue(undefined);

    await controller.delete(mockTenant, TEMPLATE_ID);

    expect(service.delete).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID);
  });

  it('should call service.publish with tenantId and id', async () => {
    const expected = { id: TEMPLATE_ID, status: 'published' };
    service.publish.mockResolvedValue(expected);

    const result = await controller.publish(mockTenant, TEMPLATE_ID);

    expect(service.publish).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID);
    expect(result).toBe(expected);
  });

  it('should call service.archive with tenantId and id', async () => {
    const expected = { id: TEMPLATE_ID, status: 'archived' };
    service.archive.mockResolvedValue(expected);

    const result = await controller.archive(mockTenant, TEMPLATE_ID);

    expect(service.archive).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID);
    expect(result).toBe(expected);
  });

  it('should call service.distribute with tenantId, id, and dto', async () => {
    const dto: DistributeFormDto = {
      target_type: 'whole_school',
      deadline: '2026-06-30',
    };
    const expected = { queued: true };
    service.distribute.mockResolvedValue(expected);

    const result = await controller.distribute(mockTenant, TEMPLATE_ID, dto);

    expect(service.distribute).toHaveBeenCalledWith(TENANT_ID, TEMPLATE_ID, dto);
    expect(result).toBe(expected);
  });
});
