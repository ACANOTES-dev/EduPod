import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { AuditLogReadFacade } from './audit-log-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ENTITY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ACTOR_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

describe('AuditLogReadFacade', () => {
  let facade: AuditLogReadFacade;
  let mockPrisma: {
    auditLog: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditLogReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<AuditLogReadFacade>(AuditLogReadFacade);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── findByEntityId ──────────────────────────────────────────────────────────

  describe('AuditLogReadFacade — findByEntityId', () => {
    it('should query audit logs by entityId and tenantId with descending order', async () => {
      await facade.findByEntityId(TENANT_ID, ENTITY_ID);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { entity_id: ENTITY_ID, tenant_id: TENANT_ID },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should return the result from prisma', async () => {
      const mockRow = { id: 'log-1', entity_id: ENTITY_ID, tenant_id: TENANT_ID };
      mockPrisma.auditLog.findMany.mockResolvedValue([mockRow]);

      const result = await facade.findByEntityId(TENANT_ID, ENTITY_ID);

      expect(result).toEqual([mockRow]);
    });
  });

  // ─── findMany ────────────────────────────────────────────────────────────────

  describe('AuditLogReadFacade — findMany', () => {
    it('should query with tenant_id only when no options provided', async () => {
      await facade.findMany(TENANT_ID);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should apply entityType filter', async () => {
      await facade.findMany(TENANT_ID, { entityType: 'student' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            entity_type: 'student',
          }),
        }),
      );
    });

    it('should apply entityId filter', async () => {
      await facade.findMany(TENANT_ID, { entityId: ENTITY_ID });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity_id: ENTITY_ID,
          }),
        }),
      );
    });

    it('should apply action filter', async () => {
      await facade.findMany(TENANT_ID, { action: 'create' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            action: 'create',
          }),
        }),
      );
    });

    it('should apply actorUserId filter', async () => {
      await facade.findMany(TENANT_ID, { actorUserId: ACTOR_USER_ID });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            actor_user_id: ACTOR_USER_ID,
          }),
        }),
      );
    });

    it('should apply createdAfter date filter only', async () => {
      const after = new Date('2026-01-01');
      await facade.findMany(TENANT_ID, { createdAfter: after });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ gte: after });
    });

    it('should apply createdBefore date filter only', async () => {
      const before = new Date('2026-12-31');
      await facade.findMany(TENANT_ID, { createdBefore: before });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ lt: before });
    });

    it('should apply both createdAfter and createdBefore date filters', async () => {
      const after = new Date('2026-01-01');
      const before = new Date('2026-12-31');
      await facade.findMany(TENANT_ID, { createdAfter: after, createdBefore: before });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ gte: after, lt: before });
    });

    it('should apply skip when provided', async () => {
      await facade.findMany(TENANT_ID, { skip: 10 });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
        }),
      );
    });

    it('should apply take when provided', async () => {
      await facade.findMany(TENANT_ID, { take: 25 });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
        }),
      );
    });

    it('should not include skip or take when not provided', async () => {
      await facade.findMany(TENANT_ID, { entityType: 'student' });

      const calledArg = mockPrisma.auditLog.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(calledArg).not.toHaveProperty('skip');
      expect(calledArg).not.toHaveProperty('take');
    });

    it('edge: should not create date filter when neither createdAfter nor createdBefore provided', async () => {
      await facade.findMany(TENANT_ID, { entityType: 'student' });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere).not.toHaveProperty('created_at');
    });

    it('should combine all filters together', async () => {
      const after = new Date('2026-01-01');
      const before = new Date('2026-12-31');

      await facade.findMany(TENANT_ID, {
        entityType: 'student',
        entityId: ENTITY_ID,
        action: 'update',
        actorUserId: ACTOR_USER_ID,
        createdAfter: after,
        createdBefore: before,
        skip: 5,
        take: 10,
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          entity_type: 'student',
          entity_id: ENTITY_ID,
          action: 'update',
          actor_user_id: ACTOR_USER_ID,
          created_at: { gte: after, lt: before },
        },
        orderBy: { created_at: 'desc' },
        skip: 5,
        take: 10,
      });
    });
  });

  // ─── findManyWithActor ───────────────────────────────────────────────────────

  describe('AuditLogReadFacade — findManyWithActor', () => {
    it('should query with tenant_id only when no options provided', async () => {
      await facade.findManyWithActor(TENANT_ID);

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { created_at: 'desc' },
        include: {
          actor: {
            select: { id: true, email: true, first_name: true, last_name: true },
          },
        },
      });
    });

    it('should apply entityType filter', async () => {
      await facade.findManyWithActor(TENANT_ID, { entityType: 'fee' });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_type).toBe('fee');
    });

    it('should apply entityTypes array filter', async () => {
      await facade.findManyWithActor(TENANT_ID, { entityTypes: ['fee', 'payment'] });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_type).toEqual({ in: ['fee', 'payment'] });
    });

    it('should apply entityId filter', async () => {
      await facade.findManyWithActor(TENANT_ID, { entityId: ENTITY_ID });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_id).toBe(ENTITY_ID);
    });

    it('should apply action filter', async () => {
      await facade.findManyWithActor(TENANT_ID, { action: 'delete' });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.action).toBe('delete');
    });

    it('should apply dateFrom filter only', async () => {
      const dateFrom = new Date('2026-03-01');
      await facade.findManyWithActor(TENANT_ID, { dateFrom });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ gte: dateFrom });
    });

    it('should apply dateTo filter only', async () => {
      const dateTo = new Date('2026-03-31');
      await facade.findManyWithActor(TENANT_ID, { dateTo });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ lte: dateTo });
    });

    it('should apply both dateFrom and dateTo filters', async () => {
      const dateFrom = new Date('2026-03-01');
      const dateTo = new Date('2026-03-31');
      await facade.findManyWithActor(TENANT_ID, { dateFrom, dateTo });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ gte: dateFrom, lte: dateTo });
    });

    it('should apply search filter as OR condition on action and entity_type', async () => {
      await facade.findManyWithActor(TENANT_ID, { search: 'create' });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.OR).toEqual([
        { action: { contains: 'create', mode: 'insensitive' } },
        { entity_type: { contains: 'create', mode: 'insensitive' } },
      ]);
    });

    it('should apply skip when provided', async () => {
      await facade.findManyWithActor(TENANT_ID, { skip: 20 });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
        }),
      );
    });

    it('should apply take when provided', async () => {
      await facade.findManyWithActor(TENANT_ID, { take: 50 });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    it('should not include skip or take when not provided', async () => {
      await facade.findManyWithActor(TENANT_ID);

      const calledArg = mockPrisma.auditLog.findMany.mock.calls[0][0] as Record<string, unknown>;
      expect(calledArg).not.toHaveProperty('skip');
      expect(calledArg).not.toHaveProperty('take');
    });

    it('edge: should not create date filter when neither dateFrom nor dateTo provided', async () => {
      await facade.findManyWithActor(TENANT_ID, { entityType: 'fee' });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere).not.toHaveProperty('created_at');
    });

    it('edge: should not create search OR filter when search not provided', async () => {
      await facade.findManyWithActor(TENANT_ID, { entityType: 'fee' });

      const calledWhere = mockPrisma.auditLog.findMany.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere).not.toHaveProperty('OR');
    });

    it('should always include actor relation', async () => {
      await facade.findManyWithActor(TENANT_ID, { entityType: 'fee', search: 'test' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            actor: {
              select: { id: true, email: true, first_name: true, last_name: true },
            },
          },
        }),
      );
    });
  });

  // ─── countWithFilters ────────────────────────────────────────────────────────

  describe('AuditLogReadFacade — countWithFilters', () => {
    it('should count with tenant_id only when no options provided', async () => {
      await facade.countWithFilters(TENANT_ID);

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should apply entityType filter', async () => {
      await facade.countWithFilters(TENANT_ID, { entityType: 'student' });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_type).toBe('student');
    });

    it('should apply entityTypes array filter', async () => {
      await facade.countWithFilters(TENANT_ID, { entityTypes: ['fee', 'payment'] });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_type).toEqual({ in: ['fee', 'payment'] });
    });

    it('should apply entityId filter', async () => {
      await facade.countWithFilters(TENANT_ID, { entityId: ENTITY_ID });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_id).toBe(ENTITY_ID);
    });

    it('should apply dateFrom filter only', async () => {
      const dateFrom = new Date('2026-03-01');
      await facade.countWithFilters(TENANT_ID, { dateFrom });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ gte: dateFrom });
    });

    it('should apply dateTo filter only', async () => {
      const dateTo = new Date('2026-03-31');
      await facade.countWithFilters(TENANT_ID, { dateTo });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ lte: dateTo });
    });

    it('should apply both dateFrom and dateTo filters', async () => {
      const dateFrom = new Date('2026-03-01');
      const dateTo = new Date('2026-03-31');
      await facade.countWithFilters(TENANT_ID, { dateFrom, dateTo });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ gte: dateFrom, lte: dateTo });
    });

    it('should apply search filter as OR condition', async () => {
      await facade.countWithFilters(TENANT_ID, { search: 'payment' });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.OR).toEqual([
        { action: { contains: 'payment', mode: 'insensitive' } },
        { entity_type: { contains: 'payment', mode: 'insensitive' } },
      ]);
    });

    it('edge: should not create date filter when neither dateFrom nor dateTo provided', async () => {
      await facade.countWithFilters(TENANT_ID, { entityType: 'fee' });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere).not.toHaveProperty('created_at');
    });

    it('edge: should not create search OR filter when search not provided', async () => {
      await facade.countWithFilters(TENANT_ID, { entityType: 'fee' });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere).not.toHaveProperty('OR');
    });
  });

  // ─── findFirst ───────────────────────────────────────────────────────────────

  describe('AuditLogReadFacade — findFirst', () => {
    it('should query with tenant_id only when no options provided', async () => {
      await facade.findFirst(TENANT_ID);

      expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should apply entityType filter', async () => {
      await facade.findFirst(TENANT_ID, { entityType: 'student' });

      const calledWhere = mockPrisma.auditLog.findFirst.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_type).toBe('student');
    });

    it('should apply entityId filter', async () => {
      await facade.findFirst(TENANT_ID, { entityId: ENTITY_ID });

      const calledWhere = mockPrisma.auditLog.findFirst.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_id).toBe(ENTITY_ID);
    });

    it('should apply action filter', async () => {
      await facade.findFirst(TENANT_ID, { action: 'create' });

      const calledWhere = mockPrisma.auditLog.findFirst.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.action).toBe('create');
    });

    it('should return null when no matching log exists', async () => {
      mockPrisma.auditLog.findFirst.mockResolvedValue(null);

      const result = await facade.findFirst(TENANT_ID, { entityType: 'nonexistent' });

      expect(result).toBeNull();
    });

    it('should return the matching log when found', async () => {
      const mockRow = {
        id: 'log-1',
        tenant_id: TENANT_ID,
        entity_type: 'student',
        action: 'create',
      };
      mockPrisma.auditLog.findFirst.mockResolvedValue(mockRow);

      const result = await facade.findFirst(TENANT_ID, { entityType: 'student' });

      expect(result).toEqual(mockRow);
    });

    it('should combine all filter options', async () => {
      await facade.findFirst(TENANT_ID, {
        entityType: 'student',
        entityId: ENTITY_ID,
        action: 'update',
      });

      expect(mockPrisma.auditLog.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          entity_type: 'student',
          entity_id: ENTITY_ID,
          action: 'update',
        },
        orderBy: { created_at: 'desc' },
      });
    });
  });

  // ─── count ───────────────────────────────────────────────────────────────────

  describe('AuditLogReadFacade — count', () => {
    it('should count with tenant_id only when no options provided', async () => {
      await facade.count(TENANT_ID);

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should apply entityType filter', async () => {
      await facade.count(TENANT_ID, { entityType: 'student' });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.entity_type).toBe('student');
    });

    it('should apply action filter', async () => {
      await facade.count(TENANT_ID, { action: 'delete' });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.action).toBe('delete');
    });

    it('should apply createdBefore filter', async () => {
      const before = new Date('2026-06-01');
      await facade.count(TENANT_ID, { createdBefore: before });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere.created_at).toEqual({ lt: before });
    });

    it('edge: should not create date filter when createdBefore not provided', async () => {
      await facade.count(TENANT_ID, { entityType: 'student' });

      const calledWhere = mockPrisma.auditLog.count.mock.calls[0][0].where as Record<
        string,
        unknown
      >;
      expect(calledWhere).not.toHaveProperty('created_at');
    });

    it('should combine all filter options', async () => {
      const before = new Date('2026-06-01');
      await facade.count(TENANT_ID, {
        entityType: 'student',
        action: 'create',
        createdBefore: before,
      });

      expect(mockPrisma.auditLog.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          entity_type: 'student',
          action: 'create',
          created_at: { lt: before },
        },
      });
    });

    it('should return the count value from prisma', async () => {
      mockPrisma.auditLog.count.mockResolvedValue(42);

      const result = await facade.count(TENANT_ID, { entityType: 'student' });

      expect(result).toBe(42);
    });
  });
});
