import type { JwtPayload, TenantContext } from '@school/shared';

import { SnapshotsController } from './snapshots.controller';
import { SnapshotsService } from './snapshots.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const MODEL_ID = '33333333-3333-4333-8333-333333333333';
const SNAPSHOT_ID = '44444444-4444-4444-8444-444444444444';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'nhqs',
  name: 'NHQS',
  status: 'active',
  default_locale: 'en',
  timezone: 'UTC',
};

const USER: JwtPayload = {
  sub: USER_ID,
  email: 'owner@nhqs.test',
  type: 'access',
  tenant_id: TENANT_ID,
} as unknown as JwtPayload;

/**
 * Direct instantiation rather than Test.createTestingModule because the
 * controller's @UseGuards triggers DI resolution for AuthGuard's deps.
 * We test the controller methods in isolation here; guard behaviour is
 * covered by common/guards/*.spec.ts.
 */
describe('SnapshotsController', () => {
  let controller: SnapshotsController;
  let service: jest.Mocked<SnapshotsService>;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue({ data: [], meta: { page: 1, pageSize: 20, total: 0 } }),
      findOne: jest.fn().mockResolvedValue({ id: SNAPSHOT_ID, version_number: 1 }),
      publish: jest.fn().mockResolvedValue({ id: SNAPSHOT_ID, version_number: 2 }),
      restore: jest.fn().mockResolvedValue({ id: 'new-draft', restored_from: SNAPSHOT_ID }),
    } as unknown as jest.Mocked<SnapshotsService>;

    controller = new SnapshotsController(service);
  });

  describe('GET …/snapshots', () => {
    it('delegates to SnapshotsService.findAll with tenant + model + query', async () => {
      const query = { page: 1, pageSize: 20 };
      await controller.findAll(TENANT, MODEL_ID, query);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, query);
    });

    it('passes pagination overrides through unchanged', async () => {
      const query = { page: 3, pageSize: 50 };
      await controller.findAll(TENANT, MODEL_ID, query);
      expect(service.findAll).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, query);
    });
  });

  describe('GET …/snapshots/:snapshotId', () => {
    it('delegates to SnapshotsService.findOne with tenant + model + snapshot ids', async () => {
      const result = await controller.findOne(TENANT, MODEL_ID, SNAPSHOT_ID);
      expect(service.findOne).toHaveBeenCalledWith(TENANT_ID, MODEL_ID, SNAPSHOT_ID);
      expect(result.id).toBe(SNAPSHOT_ID);
    });
  });

  describe('POST …/snapshots/publish', () => {
    it('delegates to SnapshotsService.publish with tenant + user + model + dto', async () => {
      const dto = { executive_summary: 'Q1 budget locked' };
      await controller.publish(TENANT, USER, MODEL_ID, dto);
      expect(service.publish).toHaveBeenCalledWith(TENANT_ID, USER_ID, MODEL_ID, dto);
    });

    it('accepts an empty executive_summary string', async () => {
      const dto = { executive_summary: '' };
      await controller.publish(TENANT, USER, MODEL_ID, dto);
      expect(service.publish).toHaveBeenCalledWith(TENANT_ID, USER_ID, MODEL_ID, dto);
    });
  });

  describe('POST …/snapshots/:snapshotId/restore', () => {
    it('delegates to SnapshotsService.restore with tenant + user + model + snapshot ids', async () => {
      await controller.restore(TENANT, USER, MODEL_ID, SNAPSHOT_ID);
      expect(service.restore).toHaveBeenCalledWith(TENANT_ID, USER_ID, MODEL_ID, SNAPSHOT_ID);
    });
  });
});
