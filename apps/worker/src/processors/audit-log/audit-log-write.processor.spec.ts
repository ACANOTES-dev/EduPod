import type { Job } from 'bullmq';

import {
  AuditLogWriteProcessor,
  AUDIT_LOG_WRITE_JOB,
  type AuditLogWritePayload,
} from './audit-log-write.processor';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ENTITY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('AuditLogWriteProcessor', () => {
  let processor: AuditLogWriteProcessor;
  let mockPrisma: { auditLog: { create: jest.Mock } };

  beforeEach(() => {
    mockPrisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    processor = new AuditLogWriteProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  it('should write audit log entry from job payload', async () => {
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

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
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

    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
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

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'A'.repeat(100),
        }),
      }),
    );
  });

  it('should not throw if Prisma create fails', async () => {
    mockPrisma.auditLog.create.mockRejectedValue(new Error('DB connection lost'));

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

  it('should handle null tenantId and actorUserId', async () => {
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

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
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
});
