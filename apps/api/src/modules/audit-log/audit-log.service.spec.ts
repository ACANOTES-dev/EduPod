import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AuditLogService } from './audit-log.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACTOR_USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ENTITY_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const LOG_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const TENANT_ID_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let mockPrisma: {
    auditLog: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // write()
  // ---------------------------------------------------------------------------
  describe('write()', () => {
    it('should create an audit log entry with all fields', async () => {
      await service.write(
        TENANT_ID,
        ACTOR_USER_ID,
        'student',
        ENTITY_ID,
        'create',
        { foo: 'bar' },
        '1.2.3.4',
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          actor_user_id: ACTOR_USER_ID,
          entity_type: 'student',
          entity_id: ENTITY_ID,
          action: 'create',
          metadata_json: { foo: 'bar' },
          ip_address: '1.2.3.4',
        },
      });
    });

    it('should accept null tenantId for platform-level events', async () => {
      await service.write(
        null,
        ACTOR_USER_ID,
        'platform',
        ENTITY_ID,
        'login',
        {},
        '10.0.0.1',
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: undefined,
          actor_user_id: ACTOR_USER_ID,
        }),
      });
    });

    it('should accept null actorUserId for system events', async () => {
      await service.write(
        TENANT_ID,
        null,
        'system',
        ENTITY_ID,
        'cron_run',
        {},
        null,
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          actor_user_id: undefined,
        }),
      });
    });

    it('should accept null entityId', async () => {
      await service.write(
        TENANT_ID,
        ACTOR_USER_ID,
        'auth',
        null,
        'logout',
        {},
        '1.2.3.4',
      );

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entity_id: undefined,
        }),
      });
    });

    it('should never throw on database errors', async () => {
      const prismaError = new Error('Connection refused');
      Object.assign(prismaError, {
        code: 'P2002',
        clientVersion: '5.0.0',
        name: 'PrismaClientKnownRequestError',
      });
      mockPrisma.auditLog.create.mockRejectedValue(prismaError);

      await expect(
        service.write(
          TENANT_ID,
          ACTOR_USER_ID,
          'student',
          ENTITY_ID,
          'create',
          {},
          '1.2.3.4',
        ),
      ).resolves.toBeUndefined();
    });

    it('should never throw on unknown errors', async () => {
      mockPrisma.auditLog.create.mockRejectedValue(
        new Error('Something unexpected'),
      );

      await expect(
        service.write(
          TENANT_ID,
          ACTOR_USER_ID,
          'student',
          ENTITY_ID,
          'update',
          {},
          '1.2.3.4',
        ),
      ).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // list()
  // ---------------------------------------------------------------------------
  describe('list()', () => {
    const baseFilters = { page: 1, pageSize: 20 };

    function makeMockLog(overrides: Record<string, unknown> = {}) {
      return {
        id: LOG_ID,
        tenant_id: TENANT_ID,
        actor_user_id: ACTOR_USER_ID,
        entity_type: 'student',
        entity_id: ENTITY_ID,
        action: 'create',
        metadata_json: { foo: 'bar' },
        ip_address: '1.2.3.4',
        created_at: new Date('2026-03-15T10:00:00.000Z'),
        actor: {
          id: ACTOR_USER_ID,
          first_name: 'John',
          last_name: 'Doe',
        },
        ...overrides,
      };
    }

    it('should return paginated audit logs for a tenant', async () => {
      const mockLog = makeMockLog();
      mockPrisma.auditLog.findMany.mockResolvedValue([mockLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, baseFilters);

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: LOG_ID,
        tenant_id: TENANT_ID,
        entity_type: 'student',
        action: 'create',
      });
    });

    it('should apply entity_type filter', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        ...baseFilters,
        entity_type: 'student',
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            entity_type: 'student',
          }),
        }),
      );
    });

    it('should apply actor_user_id filter', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        ...baseFilters,
        actor_user_id: ACTOR_USER_ID,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actor_user_id: ACTOR_USER_ID,
          }),
        }),
      );
    });

    it('should apply action filter', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        ...baseFilters,
        action: 'delete',
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'delete',
          }),
        }),
      );
    });

    it('should apply date range filter with start_date only', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        ...baseFilters,
        start_date: '2026-03-01T00:00:00.000Z',
      });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
      expect(calledWhere.created_at).toEqual({
        gte: new Date('2026-03-01T00:00:00.000Z'),
      });
    });

    it('should apply date range filter with end_date only', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        ...baseFilters,
        end_date: '2026-03-31T23:59:59.999Z',
      });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
      expect(calledWhere.created_at).toEqual({
        lte: new Date('2026-03-31T23:59:59.999Z'),
      });
    });

    it('should apply date range filter with both dates', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        ...baseFilters,
        start_date: '2026-03-01T00:00:00.000Z',
        end_date: '2026-03-31T23:59:59.999Z',
      });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where;
      expect(calledWhere.created_at).toEqual({
        gte: new Date('2026-03-01T00:00:00.000Z'),
        lte: new Date('2026-03-31T23:59:59.999Z'),
      });
    });

    it('should include actor name in response when actor exists', async () => {
      const mockLog = makeMockLog({
        actor: {
          id: ACTOR_USER_ID,
          first_name: 'John',
          last_name: 'Doe',
        },
      });
      mockPrisma.auditLog.findMany.mockResolvedValue([mockLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, baseFilters);

      expect(result.data[0].actor_name).toBe('John Doe');
    });

    it('should return actor_name as undefined when actor is null', async () => {
      const mockLog = makeMockLog({ actor: null });
      mockPrisma.auditLog.findMany.mockResolvedValue([mockLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, baseFilters);

      expect(result.data[0].actor_name).toBeUndefined();
    });

    it('should format created_at as ISO string', async () => {
      const mockLog = makeMockLog({
        created_at: new Date('2026-03-15T10:00:00.000Z'),
      });
      mockPrisma.auditLog.findMany.mockResolvedValue([mockLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, baseFilters);

      expect(result.data[0].created_at).toBe('2026-03-15T10:00:00.000Z');
    });
  });

  // ---------------------------------------------------------------------------
  // listPlatform()
  // ---------------------------------------------------------------------------
  describe('listPlatform()', () => {
    const baseFilters = { page: 1, pageSize: 20 };

    function makeMockPlatformLog(overrides: Record<string, unknown> = {}) {
      return {
        id: LOG_ID,
        tenant_id: TENANT_ID,
        actor_user_id: ACTOR_USER_ID,
        entity_type: 'tenant',
        entity_id: TENANT_ID,
        action: 'update',
        metadata_json: {},
        ip_address: '10.0.0.1',
        created_at: new Date('2026-03-15T12:00:00.000Z'),
        actor: {
          id: ACTOR_USER_ID,
          first_name: 'Admin',
          last_name: 'User',
        },
        tenant: {
          id: TENANT_ID,
          name: 'Al Noor School',
        },
        ...overrides,
      };
    }

    it('should return paginated audit logs across all tenants', async () => {
      const mockLog = makeMockPlatformLog();
      mockPrisma.auditLog.findMany.mockResolvedValue([mockLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.listPlatform(baseFilters);

      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: LOG_ID,
        entity_type: 'tenant',
        action: 'update',
      });
    });

    it('should apply tenant_id filter when provided', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.listPlatform({
        ...baseFilters,
        tenant_id: TENANT_ID_2,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID_2,
          }),
        }),
      );
    });

    it('should include tenant_name in response', async () => {
      const mockLog = makeMockPlatformLog({
        tenant: { id: TENANT_ID, name: 'Al Noor School' },
      });
      mockPrisma.auditLog.findMany.mockResolvedValue([mockLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.listPlatform(baseFilters);

      expect(result.data[0].tenant_name).toBe('Al Noor School');
    });

    it('should return tenant_name as undefined when tenant is null', async () => {
      const mockLog = makeMockPlatformLog({ tenant: null });
      mockPrisma.auditLog.findMany.mockResolvedValue([mockLog]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.listPlatform(baseFilters);

      expect(result.data[0].tenant_name).toBeUndefined();
    });

    it('should apply all filter combinations', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.listPlatform({
        page: 2,
        pageSize: 10,
        entity_type: 'student',
        actor_user_id: ACTOR_USER_ID,
        action: 'create',
        start_date: '2026-03-01T00:00:00.000Z',
        end_date: '2026-03-31T23:59:59.999Z',
        tenant_id: TENANT_ID,
      });

      const calledArgs = mockPrisma.auditLog.findMany.mock.calls[0][0];
      expect(calledArgs.where).toEqual({
        tenant_id: TENANT_ID,
        entity_type: 'student',
        actor_user_id: ACTOR_USER_ID,
        action: 'create',
        created_at: {
          gte: new Date('2026-03-01T00:00:00.000Z'),
          lte: new Date('2026-03-31T23:59:59.999Z'),
        },
      });
      expect(calledArgs.skip).toBe(10); // (page 2 - 1) * pageSize 10
      expect(calledArgs.take).toBe(10);
    });
  });

  // ---------------------------------------------------------------------------
  // track()
  // ---------------------------------------------------------------------------
  describe('track()', () => {
    it('should call write with entity_type from parameter', async () => {
      const writeSpy = jest.spyOn(service, 'write');

      await service.track(
        TENANT_ID,
        ACTOR_USER_ID,
        'page_view',
        'announcement',
        ENTITY_ID,
        '1.2.3.4',
      );

      expect(writeSpy).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'announcement',
        ENTITY_ID,
        'page_view',
        { tracking: true },
        '1.2.3.4',
      );
    });

    it("should default entity_type to 'engagement' when null", async () => {
      const writeSpy = jest.spyOn(service, 'write');

      await service.track(
        TENANT_ID,
        ACTOR_USER_ID,
        'session_start',
        null,
        null,
        '10.0.0.1',
      );

      expect(writeSpy).toHaveBeenCalledWith(
        TENANT_ID,
        ACTOR_USER_ID,
        'engagement',
        null,
        'session_start',
        { tracking: true },
        '10.0.0.1',
      );
    });

    it('should pass tracking: true in metadata', async () => {
      const writeSpy = jest.spyOn(service, 'write');

      await service.track(
        TENANT_ID,
        ACTOR_USER_ID,
        'click',
        'button',
        ENTITY_ID,
        '1.2.3.4',
      );

      expect(writeSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        { tracking: true },
        expect.any(String),
      );
    });
  });
});
