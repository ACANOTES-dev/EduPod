import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ApprovalsReadFacade } from './approvals-read.facade';

const TENANT_ID = 'tenant-uuid-1';

describe('ApprovalsReadFacade', () => {
  let facade: ApprovalsReadFacade;
  let mockPrisma: {
    approvalRequest: {
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      approvalRequest: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ApprovalsReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ApprovalsReadFacade>(ApprovalsReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── countRequests ───────────────────────────────────────────────────

  describe('ApprovalsReadFacade — countRequests', () => {
    it('should count requests with no filters', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(10);

      const result = await facade.countRequests(TENANT_ID);

      expect(result).toBe(10);
      expect(mockPrisma.approvalRequest.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should count requests with status filter', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(3);

      const result = await facade.countRequests(TENANT_ID, { status: 'pending_approval' });

      expect(result).toBe(3);
      expect(mockPrisma.approvalRequest.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, status: 'pending_approval' },
      });
    });

    it('should count requests with actionType filter', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(5);

      const result = await facade.countRequests(TENANT_ID, { actionType: 'payroll_finalise' });

      expect(result).toBe(5);
      expect(mockPrisma.approvalRequest.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, action_type: 'payroll_finalise' },
      });
    });

    it('should count requests with both status and actionType filters', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(2);

      const result = await facade.countRequests(TENANT_ID, {
        status: 'approved',
        actionType: 'invoice_issue',
      });

      expect(result).toBe(2);
      expect(mockPrisma.approvalRequest.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          status: 'approved',
          action_type: 'invoice_issue',
        },
      });
    });
  });

  // ─── countRequestsGeneric ────────────────────────────────────────────

  describe('ApprovalsReadFacade — countRequestsGeneric', () => {
    it('should count with no additional where clause', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(7);

      const result = await facade.countRequestsGeneric(TENANT_ID);

      expect(result).toBe(7);
      expect(mockPrisma.approvalRequest.count).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should count with additional where clause', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(4);

      const result = await facade.countRequestsGeneric(TENANT_ID, {
        status: 'rejected',
        callback_status: 'failed',
      });

      expect(result).toBe(4);
      expect(mockPrisma.approvalRequest.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          status: 'rejected',
          callback_status: 'failed',
        },
      });
    });

    it('should merge tenant_id with the provided where clause', async () => {
      mockPrisma.approvalRequest.count.mockResolvedValue(0);

      await facade.countRequestsGeneric(TENANT_ID, {
        created_at: { gte: new Date('2024-01-01') },
      });

      expect(mockPrisma.approvalRequest.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          created_at: { gte: new Date('2024-01-01') },
        }),
      });
    });
  });
});
