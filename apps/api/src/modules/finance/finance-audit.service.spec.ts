import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, AuditLogReadFacade } from '../../common/tests/mock-facades';
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
  let mockAuditLogReadFacade: {
    findManyWithActor: jest.Mock;
    countWithFilters: jest.Mock;
  };

  beforeEach(async () => {
    mockAuditLogReadFacade = {
      findManyWithActor: jest.fn().mockResolvedValue([]),
      countWithFilters: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        FinanceAuditService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogReadFacade, useValue: mockAuditLogReadFacade },
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

      mockAuditLogReadFacade.findManyWithActor.mockResolvedValue([logEntry]);
      mockAuditLogReadFacade.countWithFilters.mockResolvedValue(1);

      const result = await service.getAuditTrail(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.entity_type).toBe('invoice');
    });

    it('should filter by entity_type when provided', async () => {
      await service.getAuditTrail(TENANT_ID, { page: 1, pageSize: 20, entity_type: 'payment' });

      expect(mockAuditLogReadFacade.findManyWithActor).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ entityType: 'payment' }),
      );
    });

    it('should filter by date range when provided', async () => {
      await service.getAuditTrail(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-01-01',
        date_to: '2026-03-31',
      });

      expect(mockAuditLogReadFacade.findManyWithActor).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
        }),
      );
    });

    it('should filter by entity_id when provided', async () => {
      const entityId = 'invoice-uuid-1111';
      await service.getAuditTrail(TENANT_ID, { page: 1, pageSize: 20, entity_id: entityId });

      expect(mockAuditLogReadFacade.findManyWithActor).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ entityId }),
      );
    });

    it('should add search filter when search provided', async () => {
      await service.getAuditTrail(TENANT_ID, { page: 1, pageSize: 20, search: 'INV-2026' });

      expect(mockAuditLogReadFacade.findManyWithActor).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ search: 'INV-2026' }),
      );
    });
  });
});
