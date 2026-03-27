/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { BehaviourAdminController } from './behaviour-admin.controller';
import { BehaviourAdminService } from './behaviour-admin.service';
import { BehaviourLegalHoldService } from './behaviour-legal-hold.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockAdminService = {
  getHealth: jest.fn(),
  listDeadLetterJobs: jest.fn(),
  retryDeadLetterJob: jest.fn(),
  recomputePointsPreview: jest.fn(),
  recomputePoints: jest.fn(),
  rebuildAwardsPreview: jest.fn(),
  recomputePulse: jest.fn(),
  backfillTasksPreview: jest.fn(),
  resendNotification: jest.fn(),
  refreshViews: jest.fn(),
  policyDryRun: jest.fn(),
  scopeAudit: jest.fn(),
  reindexSearchPreview: jest.fn(),
  retentionPreview: jest.fn(),
  retentionExecute: jest.fn(),
};

const mockLegalHoldService = {
  listHolds: jest.fn(),
  createHold: jest.fn(),
  releaseHold: jest.fn(),
};

describe('BehaviourAdminController', () => {
  let controller: BehaviourAdminController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourAdminController],
      providers: [
        { provide: BehaviourAdminService, useValue: mockAdminService },
        { provide: BehaviourLegalHoldService, useValue: mockLegalHoldService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/module-enabled.guard').ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourAdminController>(BehaviourAdminController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Health ──────────────────────────────────────────────────────────────

  it('should call adminService.getHealth with tenant_id', async () => {
    mockAdminService.getHealth.mockResolvedValue({ status: 'healthy' });

    const result = await controller.getHealth(TENANT);

    expect(mockAdminService.getHealth).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ status: 'healthy' });
  });

  // ─── Dead Letter ──────────────────────────────────────────────────────────

  it('should call adminService.listDeadLetterJobs', async () => {
    mockAdminService.listDeadLetterJobs.mockResolvedValue({ data: [] });

    const result = await controller.listDeadLetterJobs();

    expect(mockAdminService.listDeadLetterJobs).toHaveBeenCalled();
    expect(result).toEqual({ data: [] });
  });

  it('should call adminService.retryDeadLetterJob with jobId and return success', async () => {
    mockAdminService.retryDeadLetterJob.mockResolvedValue(undefined);

    const result = await controller.retryDeadLetterJob('job-123');

    expect(mockAdminService.retryDeadLetterJob).toHaveBeenCalledWith('job-123');
    expect(result).toEqual({ success: true });
  });

  // ─── Recompute Points ────────────────────────────────────────────────────

  it('should call adminService.recomputePointsPreview with tenant_id and dto', async () => {
    const dto = { scope: 'all' };
    mockAdminService.recomputePointsPreview.mockResolvedValue({ affected: 42 });

    const result = await controller.recomputePointsPreview(TENANT, dto as never);

    expect(mockAdminService.recomputePointsPreview).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ affected: 42 });
  });

  it('should call adminService.recomputePoints with tenant_id and dto and return success', async () => {
    const dto = { scope: 'all' };
    mockAdminService.recomputePoints.mockResolvedValue(undefined);

    const result = await controller.recomputePoints(TENANT, dto as never);

    expect(mockAdminService.recomputePoints).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ success: true, message: 'Points recomputed' });
  });

  // ─── Rebuild Awards ──────────────────────────────────────────────────────

  it('should call adminService.rebuildAwardsPreview with tenant_id and dto', async () => {
    const dto = { scope: 'all' };
    mockAdminService.rebuildAwardsPreview.mockResolvedValue({ affected: 10 });

    const result = await controller.rebuildAwardsPreview(TENANT, dto as never);

    expect(mockAdminService.rebuildAwardsPreview).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ affected: 10 });
  });

  it('should return success stub for rebuildAwards', async () => {
    const dto = { scope: 'all' };

    const result = await controller.rebuildAwards(TENANT, dto as never);

    expect(result).toEqual({ success: true, message: 'Award rebuild initiated' });
  });

  // ─── Recompute Pulse ─────────────────────────────────────────────────────

  it('should call adminService.recomputePulse with tenant_id and return success', async () => {
    mockAdminService.recomputePulse.mockResolvedValue(undefined);

    const result = await controller.recomputePulse(TENANT);

    expect(mockAdminService.recomputePulse).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ success: true, message: 'Pulse cache invalidated' });
  });

  // ─── Backfill Tasks ──────────────────────────────────────────────────────

  it('should call adminService.backfillTasksPreview with tenant_id and dto', async () => {
    const dto = { scope: 'all' };
    mockAdminService.backfillTasksPreview.mockResolvedValue({ affected: 5 });

    const result = await controller.backfillTasksPreview(TENANT, dto as never);

    expect(mockAdminService.backfillTasksPreview).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ affected: 5 });
  });

  it('should return success stub for backfillTasks', async () => {
    const dto = { scope: 'all' };

    const result = await controller.backfillTasks(TENANT, dto as never);

    expect(result).toEqual({ success: true, message: 'Task backfill initiated' });
  });

  // ─── Resend Notification ─────────────────────────────────────────────────

  it('should call adminService.resendNotification with tenant_id and dto and return success', async () => {
    const dto = { notification_id: 'notif-1' };
    mockAdminService.resendNotification.mockResolvedValue(undefined);

    const result = await controller.resendNotification(TENANT, dto as never);

    expect(mockAdminService.resendNotification).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ success: true, message: 'Notification re-queued' });
  });

  // ─── Refresh Views ───────────────────────────────────────────────────────

  it('should call adminService.refreshViews with tenant_id and return success', async () => {
    mockAdminService.refreshViews.mockResolvedValue(undefined);

    const result = await controller.refreshViews(TENANT);

    expect(mockAdminService.refreshViews).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ success: true, message: 'All materialised views refreshed' });
  });

  // ─── Policy Dry Run ──────────────────────────────────────────────────────

  it('should call adminService.policyDryRun with tenant_id and dto', async () => {
    const dto = { incident_data: { category_id: 'cat-1' } };
    mockAdminService.policyDryRun.mockResolvedValue({ actions: [] });

    const result = await controller.policyDryRun(TENANT, dto as never);

    expect(mockAdminService.policyDryRun).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual({ actions: [] });
  });

  // ─── Scope Audit ─────────────────────────────────────────────────────────

  it('should call adminService.scopeAudit with tenant_id and user_id from query', async () => {
    const query = { user_id: 'target-user' };
    mockAdminService.scopeAudit.mockResolvedValue({ scopes: [] });

    const result = await controller.scopeAudit(TENANT, query as never);

    expect(mockAdminService.scopeAudit).toHaveBeenCalledWith(TENANT_ID, 'target-user');
    expect(result).toEqual({ scopes: [] });
  });

  // ─── Reindex Search ──────────────────────────────────────────────────────

  it('should call adminService.reindexSearchPreview with tenant_id', async () => {
    mockAdminService.reindexSearchPreview.mockResolvedValue({ count: 100 });

    const result = await controller.reindexSearchPreview(TENANT);

    expect(mockAdminService.reindexSearchPreview).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ count: 100 });
  });

  it('should return success stub for reindexSearch', async () => {
    const result = await controller.reindexSearch(TENANT);

    expect(result).toEqual({
      success: true,
      message: 'Search reindex initiated — requires dual approval for tenant-wide scope',
    });
  });

  // ─── Retention ───────────────────────────────────────────────────────────

  it('should call adminService.retentionPreview with tenant_id', async () => {
    mockAdminService.retentionPreview.mockResolvedValue({ records: 50 });

    const result = await controller.retentionPreview(TENANT);

    expect(mockAdminService.retentionPreview).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ records: 50 });
  });

  it('should call adminService.retentionExecute with tenant_id', async () => {
    mockAdminService.retentionExecute.mockResolvedValue({ deleted: 50 });

    const result = await controller.retentionExecute(TENANT);

    expect(mockAdminService.retentionExecute).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual({ deleted: 50 });
  });

  // ─── Legal Holds ─────────────────────────────────────────────────────────

  it('should call legalHoldService.listHolds with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockLegalHoldService.listHolds.mockResolvedValue({ data: [] });

    const result = await controller.listLegalHolds(TENANT, query as never);

    expect(mockLegalHoldService.listHolds).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ data: [] });
  });

  it('should call legalHoldService.createHold with tenant_id, user_id, and dto', async () => {
    const dto = { entity_type: 'incident', entity_id: 'inc-1', reason: 'Legal' };
    mockLegalHoldService.createHold.mockResolvedValue({ id: 'hold-1' });

    const result = await controller.createLegalHold(TENANT, USER, dto as never);

    expect(mockLegalHoldService.createHold).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ id: 'hold-1' });
  });

  it('should call legalHoldService.releaseHold with tenant_id, user_id, id, dto and return success', async () => {
    const dto = { reason: 'No longer needed' };
    mockLegalHoldService.releaseHold.mockResolvedValue(undefined);

    const result = await controller.releaseLegalHold(TENANT, USER, 'hold-1', dto as never);

    expect(mockLegalHoldService.releaseHold).toHaveBeenCalledWith(TENANT_ID, USER_ID, 'hold-1', dto);
    expect(result).toEqual({ success: true });
  });
});
