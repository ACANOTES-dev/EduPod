import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { FinanceAuditService } from './finance-audit.service';

const TENANT_ID = 'tenant-uuid-1111';

const mockPrisma = {
  auditLog: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

describe('FinanceAuditService', () => {
  let service: FinanceAuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceAuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FinanceAuditService>(FinanceAuditService);
    jest.clearAllMocks();
  });

  describe('getAuditTrail', () => {
    it('should return paginated audit logs filtered to finance entities', async () => {
      const logEntry = {
        id: 'log-1',
        entity_type: 'invoice',
        action: 'create',
        actor: { id: 'user-1', email: 'admin@school.com', first_name: 'Admin', last_name: 'User' },
        created_at: new Date(),
      };

      mockPrisma.auditLog.findMany.mockResolvedValue([logEntry]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.getAuditTrail(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.entity_type).toBe('invoice');
    });

    it('should filter by entity_type when provided', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.getAuditTrail(TENANT_ID, { page: 1, pageSize: 20, entity_type: 'payment' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entity_type: 'payment' }),
        }),
      );
    });

    it('should filter by date range when provided', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.getAuditTrail(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-01-01',
        date_to: '2026-03-31',
      });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by entity_id when provided', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      const entityId = 'invoice-uuid-1111';
      await service.getAuditTrail(TENANT_ID, { page: 1, pageSize: 20, entity_id: entityId });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entity_id: entityId }),
        }),
      );
    });

    it('should add search filter when search provided', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.count.mockResolvedValue(0);

      await service.getAuditTrail(TENANT_ID, { page: 1, pageSize: 20, search: 'INV-2026' });

      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });
  });
});
