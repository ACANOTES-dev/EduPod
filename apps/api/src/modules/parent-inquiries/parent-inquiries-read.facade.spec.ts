import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ParentInquiriesReadFacade } from './parent-inquiries-read.facade';

const TENANT_ID = 'tenant-aaa-111';
const PARENT_ID_1 = 'parent-bbb-222';
const PARENT_ID_2 = 'parent-ccc-333';

describe('ParentInquiriesReadFacade', () => {
  let facade: ParentInquiriesReadFacade;
  let mockPrisma: {
    parentInquiry: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
    parentInquiryMessage: {
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      parentInquiry: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      parentInquiryMessage: {
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ParentInquiriesReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<ParentInquiriesReadFacade>(ParentInquiriesReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findByParentIds ────────────────────────────────────────────────

  describe('ParentInquiriesReadFacade — findByParentIds', () => {
    it('should find inquiries by parent IDs without date range', async () => {
      const mockResult = [{ id: 'inq-1' }, { id: 'inq-2' }];
      mockPrisma.parentInquiry.findMany.mockResolvedValue(mockResult);

      const result = await facade.findByParentIds(TENANT_ID, [PARENT_ID_1, PARENT_ID_2]);

      expect(result).toEqual(mockResult);
      expect(mockPrisma.parentInquiry.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          parent_id: { in: [PARENT_ID_1, PARENT_ID_2] },
        },
        select: { id: true },
      });
    });

    it('should find inquiries by parent IDs with date range', async () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-12-31');
      mockPrisma.parentInquiry.findMany.mockResolvedValue([{ id: 'inq-1' }]);

      const result = await facade.findByParentIds(TENANT_ID, [PARENT_ID_1], { from, to });

      expect(result).toEqual([{ id: 'inq-1' }]);
      expect(mockPrisma.parentInquiry.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          parent_id: { in: [PARENT_ID_1] },
          created_at: { gte: from, lte: to },
        },
        select: { id: true },
      });
    });

    it('should return empty array when no inquiries found', async () => {
      mockPrisma.parentInquiry.findMany.mockResolvedValue([]);

      const result = await facade.findByParentIds(TENANT_ID, [PARENT_ID_1]);

      expect(result).toEqual([]);
    });
  });

  // ─── countByParentIds ───────────────────────────────────────────────

  describe('ParentInquiriesReadFacade — countByParentIds', () => {
    it('should count inquiries without date range', async () => {
      mockPrisma.parentInquiry.count.mockResolvedValue(5);

      const result = await facade.countByParentIds(TENANT_ID, [PARENT_ID_1]);

      expect(result).toBe(5);
      expect(mockPrisma.parentInquiry.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          parent_id: { in: [PARENT_ID_1] },
        },
      });
    });

    it('should count inquiries with date range', async () => {
      const from = new Date('2024-06-01');
      const to = new Date('2024-06-30');
      mockPrisma.parentInquiry.count.mockResolvedValue(2);

      const result = await facade.countByParentIds(TENANT_ID, [PARENT_ID_1, PARENT_ID_2], {
        from,
        to,
      });

      expect(result).toBe(2);
      expect(mockPrisma.parentInquiry.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          parent_id: { in: [PARENT_ID_1, PARENT_ID_2] },
          created_at: { gte: from, lte: to },
        },
      });
    });
  });

  // ─── countMessagesBeforeDate ────────────────────────────────────────

  describe('ParentInquiriesReadFacade — countMessagesBeforeDate', () => {
    it('should count messages before cutoff date', async () => {
      const cutoff = new Date('2024-01-01');
      mockPrisma.parentInquiryMessage.count.mockResolvedValue(42);

      const result = await facade.countMessagesBeforeDate(TENANT_ID, cutoff);

      expect(result).toBe(42);
      expect(mockPrisma.parentInquiryMessage.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          created_at: { lt: cutoff },
        },
      });
    });

    it('should return zero when no messages exist before cutoff', async () => {
      mockPrisma.parentInquiryMessage.count.mockResolvedValue(0);

      const result = await facade.countMessagesBeforeDate(TENANT_ID, new Date());

      expect(result).toBe(0);
    });
  });

  // ─── findByParentIdWithMessages ─────────────────────────────────────

  describe('ParentInquiriesReadFacade — findByParentIdWithMessages', () => {
    it('should find inquiries with messages for a parent', async () => {
      const mockResult = [
        { id: 'inq-1', messages: [{ id: 'msg-1' }] },
        { id: 'inq-2', messages: [] },
      ];
      mockPrisma.parentInquiry.findMany.mockResolvedValue(mockResult);

      const result = await facade.findByParentIdWithMessages(TENANT_ID, PARENT_ID_1);

      expect(result).toEqual(mockResult);
      expect(mockPrisma.parentInquiry.findMany).toHaveBeenCalledWith({
        where: {
          parent_id: PARENT_ID_1,
          tenant_id: TENANT_ID,
        },
        include: { messages: true },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should return empty array when no inquiries found', async () => {
      mockPrisma.parentInquiry.findMany.mockResolvedValue([]);

      const result = await facade.findByParentIdWithMessages(TENANT_ID, PARENT_ID_1);

      expect(result).toEqual([]);
    });
  });
});
