import type { Job } from 'bullmq';

import {
  AuditLogWriteProcessor,
  AUDIT_LOG_WRITE_JOB,
  type AuditLogWritePayload,
} from './audit-log-write.processor';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ENTITY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

interface MockTx {
  $executeRaw: jest.Mock;
  auditLog: { create: jest.Mock };
}

describe('AuditLogWriteProcessor', () => {
  let processor: AuditLogWriteProcessor;
  let mockTx: MockTx;
  let mockPrisma: { $transaction: jest.Mock };

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(undefined),
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    mockPrisma = {
      $transaction: jest.fn().mockImplementation(async (fn) => fn(mockTx)),
    };

    processor = new AuditLogWriteProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('should write audit log entry from job payload inside RLS transaction', async () => {
    const payload: AuditLogWritePayload = {
      tenantId: TENANT_ID,
      actorUserId: USER_ID,
      entityType: 'student',
      entityId: ENTITY_ID,
      action: 'POST /api/v1/students',
      metadata: { category: 'mutation', sensitivity: 'normal' },
      ipAddress: '10.0.0.1',
    };

    await processor.process({
      name: AUDIT_LOG_WRITE_JOB,
      data: payload,
    } as Job<AuditLogWritePayload>);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenant_id: TENANT_ID,
        actor_user_id: USER_ID,
        entity_type: 'student',
        entity_id: ENTITY_ID,
        action: 'POST /api/v1/students',
        metadata_json: payload.metadata,
        ip_address: '10.0.0.1',
      },
    });
  });

  it('should skip jobs with non-matching name', async () => {
    await processor.process({ name: 'other:job', data: {} } as Job<AuditLogWritePayload>);

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.auditLog.create).not.toHaveBeenCalled();
  });

  it('should truncate action to 100 characters', async () => {
    const longAction = 'A'.repeat(150);
    const payload: AuditLogWritePayload = {
      tenantId: TENANT_ID,
      actorUserId: USER_ID,
      entityType: 'test',
      entityId: null,
      action: longAction,
      metadata: {},
      ipAddress: null,
    };

    await processor.process({
      name: AUDIT_LOG_WRITE_JOB,
      data: payload,
    } as Job<AuditLogWritePayload>);

    expect(mockTx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'A'.repeat(100),
        }),
      }),
    );
  });

  it('should not throw if Prisma create fails', async () => {
    mockTx.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

    const payload: AuditLogWritePayload = {
      tenantId: TENANT_ID,
      actorUserId: USER_ID,
      entityType: 'student',
      entityId: ENTITY_ID,
      action: 'POST /api/v1/students',
      metadata: {},
      ipAddress: null,
    };

    await expect(
      processor.process({ name: AUDIT_LOG_WRITE_JOB, data: payload } as Job<AuditLogWritePayload>),
    ).resolves.toBeUndefined();
  });

  it('should handle null tenantId and actorUserId by setting RLS to the zero sentinel', async () => {
    const payload: AuditLogWritePayload = {
      tenantId: null,
      actorUserId: null,
      entityType: 'system',
      entityId: null,
      action: 'system:init',
      metadata: {},
      ipAddress: null,
    };

    await processor.process({
      name: AUDIT_LOG_WRITE_JOB,
      data: payload,
    } as Job<AuditLogWritePayload>);

    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
    const firstCallArgs = mockTx.$executeRaw.mock.calls[0];
    // First tagged-template arg is a TemplateStringsArray; second is the interpolation.
    expect(firstCallArgs[1]).toBe(ZERO_UUID);
    const secondCallArgs = mockTx.$executeRaw.mock.calls[1];
    expect(secondCallArgs[1]).toBe(ZERO_UUID);

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenant_id: undefined,
        actor_user_id: undefined,
        entity_type: 'system',
        entity_id: undefined,
        action: 'system:init',
        metadata_json: {},
        ip_address: null,
      },
    });
  });

  it('should treat empty-string or malformed UUIDs as null and skip them in the insert', async () => {
    const payload: AuditLogWritePayload = {
      tenantId: '',
      actorUserId: 'not-a-uuid',
      entityType: 'scheduling-runs',
      entityId: '',
      action: 'POST /api/v1/scheduling-runs',
      metadata: {},
      ipAddress: null,
    };

    await processor.process({
      name: AUDIT_LOG_WRITE_JOB,
      data: payload,
    } as Job<AuditLogWritePayload>);

    expect(mockTx.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenant_id: undefined,
        actor_user_id: undefined,
        entity_type: 'scheduling-runs',
        entity_id: undefined,
        action: 'POST /api/v1/scheduling-runs',
        metadata_json: {},
        ip_address: null,
      },
    });
    // Both RLS set_config calls fall back to the zero sentinel.
    expect(mockTx.$executeRaw.mock.calls[0][1]).toBe(ZERO_UUID);
    expect(mockTx.$executeRaw.mock.calls[1][1]).toBe(ZERO_UUID);
  });
});
