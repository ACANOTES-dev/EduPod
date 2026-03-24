/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { ParentsController } from './parents.controller';
import { ParentsService } from './parents.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockTenant = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

// ─── Mock service factory ─────────────────────────────────────────────────────

function buildMockParentsService() {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    linkStudent: jest.fn(),
    unlinkStudent: jest.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ParentsController', () => {
  let controller: ParentsController;
  let service: ReturnType<typeof buildMockParentsService>;

  beforeEach(async () => {
    service = buildMockParentsService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentsController],
      providers: [{ provide: ParentsService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentsController>(ParentsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call create with tenant_id and dto', async () => {
    const dto = {
      first_name: 'Alice',
      last_name: 'Smith',
      email: 'alice@example.com',
      preferred_contact_channels: ['email' as const],
    };
    const expected = { id: PARENT_ID, first_name: 'Alice', last_name: 'Smith' };
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
    const expected = {
      id: PARENT_ID,
      first_name: 'Alice',
      last_name: 'Smith',
      household_parents: [],
      student_parents: [],
    };
    service.findOne.mockResolvedValue(expected);

    const result = await controller.findOne(mockTenant, PARENT_ID);

    expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, PARENT_ID);
    expect(result).toBe(expected);
  });

  it('should call update with tenant_id, id, and dto', async () => {
    const dto = { first_name: 'Alicia' };
    const expected = { id: PARENT_ID, first_name: 'Alicia' };
    service.update.mockResolvedValue(expected);

    const result = await controller.update(mockTenant, PARENT_ID, dto);

    expect(service.update).toHaveBeenCalledWith(TENANT_ID, PARENT_ID, dto);
    expect(result).toBe(expected);
  });

  it('should call linkStudent with correct args', async () => {
    const body = { student_id: STUDENT_ID, relationship_label: 'Mother' };
    const expected = { student_id: STUDENT_ID, parent_id: PARENT_ID };
    service.linkStudent.mockResolvedValue(expected);

    const result = await controller.linkStudent(mockTenant, PARENT_ID, body);

    expect(service.linkStudent).toHaveBeenCalledWith(TENANT_ID, PARENT_ID, STUDENT_ID, 'Mother');
    expect(result).toBe(expected);
  });

  it('should call unlinkStudent with correct args', async () => {
    service.unlinkStudent.mockResolvedValue(undefined);

    await controller.unlinkStudent(mockTenant, PARENT_ID, STUDENT_ID);

    expect(service.unlinkStudent).toHaveBeenCalledWith(TENANT_ID, PARENT_ID, STUDENT_ID);
  });
});
