import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { SchedulingApplyService } from './scheduling-apply.service';
import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';
import { SchedulingRunsController } from './scheduling-runs.controller';
import { SchedulingRunsService } from './scheduling-runs.service';

const TENANT: TenantContext = {
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid-0001',
  email: 'user@school.test',
  tenant_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  membership_id: 'mem-uuid-0001',
  type: 'access',
  iat: 0,
  exp: 0,
};
const AY_ID = 'ay-uuid-0001';
const RUN_ID = 'run-uuid-0001';

describe('SchedulingRunsController', () => {
  let controller: SchedulingRunsController;
  let mockRunsService: {
    create: jest.Mock;
    findAll: jest.Mock;
    findById: jest.Mock;
    getProgress: jest.Mock;
    cancel: jest.Mock;
    addAdjustment: jest.Mock;
    discard: jest.Mock;
  };
  let mockApplyService: { apply: jest.Mock };
  let mockPrerequisitesService: { check: jest.Mock };

  beforeEach(async () => {
    mockRunsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      getProgress: jest.fn(),
      cancel: jest.fn(),
      addAdjustment: jest.fn(),
      discard: jest.fn(),
    };
    mockApplyService = { apply: jest.fn() };
    mockPrerequisitesService = { check: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SchedulingRunsController],
      providers: [
        { provide: SchedulingRunsService, useValue: mockRunsService },
        { provide: SchedulingApplyService, useValue: mockApplyService },
        { provide: SchedulingPrerequisitesService, useValue: mockPrerequisitesService },
        { provide: PermissionCacheService, useValue: { getPermissions: jest.fn().mockResolvedValue([]) } },
      ],
    }).compile();

    controller = module.get<SchedulingRunsController>(SchedulingRunsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── prerequisites ──────────────────────────────────────────────────────────

  describe('prerequisites', () => {
    it('should delegate to prerequisites service', async () => {
      const prereqResult = { ready: true, checks: [] };
      mockPrerequisitesService.check.mockResolvedValue(prereqResult);

      const result = await controller.prerequisites(TENANT, {
        academic_year_id: AY_ID,
      });

      expect(result).toEqual(prereqResult);
      expect(mockPrerequisitesService.check).toHaveBeenCalledWith(
        TENANT.tenant_id,
        AY_ID,
      );
    });
  });

  // ─── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should delegate to runs service with tenant and user', async () => {
      const created = { id: RUN_ID, status: 'queued' };
      mockRunsService.create.mockResolvedValue(created);

      const dto = { academic_year_id: AY_ID };
      const result = await controller.create(TENANT, USER, dto);

      expect(result).toEqual(created);
      expect(mockRunsService.create).toHaveBeenCalledWith(
        TENANT.tenant_id,
        USER.sub,
        dto,
      );
    });
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should delegate to runs service with pagination', async () => {
      const paginated = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockRunsService.findAll.mockResolvedValue(paginated);

      const query = { academic_year_id: AY_ID, page: 1, pageSize: 20 };
      const result = await controller.findAll(TENANT, query);

      expect(result).toEqual(paginated);
      expect(mockRunsService.findAll).toHaveBeenCalledWith(
        TENANT.tenant_id,
        AY_ID,
        { page: 1, pageSize: 20 },
      );
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should delegate to runs service findById', async () => {
      const run = { id: RUN_ID, status: 'completed' };
      mockRunsService.findById.mockResolvedValue(run);

      const result = await controller.findOne(TENANT, RUN_ID);

      expect(result).toEqual(run);
      expect(mockRunsService.findById).toHaveBeenCalledWith(TENANT.tenant_id, RUN_ID);
    });
  });

  // ─── getProgress ────────────────────────────────────────────────────────────

  describe('getProgress', () => {
    it('should delegate to runs service', async () => {
      const progress = { id: RUN_ID, phase: 'solving', entries_assigned: 50 };
      mockRunsService.getProgress.mockResolvedValue(progress);

      const result = await controller.getProgress(TENANT, RUN_ID);

      expect(result).toEqual(progress);
      expect(mockRunsService.getProgress).toHaveBeenCalledWith(TENANT.tenant_id, RUN_ID);
    });
  });

  // ─── cancel ─────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should delegate to runs service', async () => {
      const cancelled = { id: RUN_ID, status: 'failed' };
      mockRunsService.cancel.mockResolvedValue(cancelled);

      const result = await controller.cancel(TENANT, RUN_ID);

      expect(result).toEqual(cancelled);
      expect(mockRunsService.cancel).toHaveBeenCalledWith(TENANT.tenant_id, RUN_ID);
    });
  });

  // ─── apply ──────────────────────────────────────────────────────────────────

  describe('apply', () => {
    it('should delegate to apply service with tenant, user, and dto', async () => {
      const applied = { id: RUN_ID, status: 'applied' };
      mockApplyService.apply.mockResolvedValue(applied);

      const dto = { expected_updated_at: '2026-03-01T12:00:00.000Z' };
      const result = await controller.apply(TENANT, USER, RUN_ID, dto);

      expect(result).toEqual(applied);
      expect(mockApplyService.apply).toHaveBeenCalledWith(
        TENANT.tenant_id,
        RUN_ID,
        USER.sub,
        dto,
      );
    });
  });

  // ─── discard ────────────────────────────────────────────────────────────────

  describe('discard', () => {
    it('should delegate to runs service discard', async () => {
      const discarded = { id: RUN_ID, status: 'discarded' };
      mockRunsService.discard.mockResolvedValue(discarded);

      const dto = { expected_updated_at: '2026-03-01T12:00:00.000Z' };
      const result = await controller.discard(TENANT, RUN_ID, dto);

      expect(result).toEqual(discarded);
      expect(mockRunsService.discard).toHaveBeenCalledWith(
        TENANT.tenant_id,
        RUN_ID,
        dto,
      );
    });
  });
});
