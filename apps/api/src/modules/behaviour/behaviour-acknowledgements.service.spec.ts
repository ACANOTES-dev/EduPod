/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
  validateRlsContext: jest.fn(),
}));

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAcknowledgementsService } from './behaviour-acknowledgements.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACK_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

describe('BehaviourAcknowledgementsService', () => {
  let service: BehaviourAcknowledgementsService;
  let mockPrisma: {
    behaviourParentAcknowledgement: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      behaviourParentAcknowledgement: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
    };

    (createRlsClient as jest.Mock).mockReturnValue({
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourAcknowledgementsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<BehaviourAcknowledgementsService>(BehaviourAcknowledgementsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('returns empty page when no rows match', async () => {
      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });
      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 0 });
      expect(mockPrisma.behaviourParentAcknowledgement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });

    it('filters by acknowledged_at is not null when status=acknowledged', async () => {
      await service.list(TENANT_ID, { page: 1, pageSize: 20, status: 'acknowledged' });
      const call = mockPrisma.behaviourParentAcknowledgement.findMany.mock.calls[0]?.[0] as {
        where: { acknowledged_at?: unknown };
      };
      expect(call.where.acknowledged_at).toEqual({ not: null });
    });

    it('derives status=acknowledged for rows with acknowledged_at set', async () => {
      mockPrisma.behaviourParentAcknowledgement.findMany.mockResolvedValue([
        {
          id: ACK_ID,
          incident_id: null,
          sanction_id: null,
          amendment_notice_id: null,
          parent_id: PARENT_ID,
          channel: 'in_app',
          sent_at: new Date('2026-04-01T12:00:00Z'),
          delivered_at: new Date('2026-04-01T12:00:05Z'),
          read_at: new Date('2026-04-01T13:00:00Z'),
          acknowledged_at: new Date('2026-04-01T13:05:00Z'),
          acknowledgement_method: 'in_app_button',
          parent: { id: PARENT_ID, first_name: 'Parent', last_name: 'Smith' },
        },
      ]);
      mockPrisma.behaviourParentAcknowledgement.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });
      expect(result.data[0]!.status).toBe('acknowledged');
      expect(result.data[0]!.parent_name).toBe('Parent Smith');
    });
  });

  describe('getById', () => {
    it('throws ACKNOWLEDGEMENT_NOT_FOUND on miss', async () => {
      mockPrisma.behaviourParentAcknowledgement.findFirst.mockResolvedValue(null);
      await expect(service.getById(TENANT_ID, ACK_ID)).rejects.toThrow(NotFoundException);
    });

    it('returns derived status=sent when no delivery timestamps set', async () => {
      mockPrisma.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
        id: ACK_ID,
        incident_id: null,
        sanction_id: null,
        amendment_notice_id: null,
        parent_id: PARENT_ID,
        channel: 'in_app',
        sent_at: new Date('2026-04-01T12:00:00Z'),
        delivered_at: null,
        read_at: null,
        acknowledged_at: null,
        acknowledgement_method: null,
        parent: { id: PARENT_ID, first_name: 'P', last_name: 'S' },
        amendment_notice: null,
      });

      const result = await service.getById(TENANT_ID, ACK_ID);
      expect(result.data.status).toBe('sent');
      expect(result.data.acknowledged_at).toBeNull();
    });
  });

  describe('markAsRead', () => {
    const ownedRow = {
      id: ACK_ID,
      tenant_id: TENANT_ID,
      parent_id: PARENT_ID,
      parent: { id: PARENT_ID, user_id: USER_ID },
      read_at: null as Date | null,
    };

    it('stamps read_at when the owning parent marks a pending ack', async () => {
      mockPrisma.behaviourParentAcknowledgement.findFirst.mockResolvedValue({ ...ownedRow });
      const updatedAt = new Date('2026-04-21T09:00:00Z');
      mockPrisma.behaviourParentAcknowledgement.update.mockResolvedValue({
        id: ACK_ID,
        read_at: updatedAt,
      });

      const result = await service.markAsRead(TENANT_ID, ACK_ID, USER_ID);
      expect(result.data.already_read).toBe(false);
      expect(result.data.read_at).toBe(updatedAt.toISOString());
      expect(mockPrisma.behaviourParentAcknowledgement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ACK_ID },
          data: expect.objectContaining({ read_at: expect.any(Date) }),
        }),
      );
    });

    it('returns already_read=true without mutating when read_at is already set', async () => {
      const previouslyRead = new Date('2026-04-20T10:00:00Z');
      mockPrisma.behaviourParentAcknowledgement.findFirst.mockResolvedValue({
        ...ownedRow,
        read_at: previouslyRead,
      });

      const result = await service.markAsRead(TENANT_ID, ACK_ID, USER_ID);
      expect(result.data.already_read).toBe(true);
      expect(result.data.read_at).toBe(previouslyRead.toISOString());
      expect(mockPrisma.behaviourParentAcknowledgement.update).not.toHaveBeenCalled();
    });

    it('throws ACKNOWLEDGEMENT_NOT_YOURS when parent_user_id does not match', async () => {
      mockPrisma.behaviourParentAcknowledgement.findFirst.mockResolvedValue({ ...ownedRow });

      await expect(service.markAsRead(TENANT_ID, ACK_ID, OTHER_USER_ID)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.behaviourParentAcknowledgement.update).not.toHaveBeenCalled();
    });

    it('throws ACKNOWLEDGEMENT_NOT_FOUND when the row does not exist', async () => {
      mockPrisma.behaviourParentAcknowledgement.findFirst.mockResolvedValue(null);

      await expect(service.markAsRead(TENANT_ID, ACK_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
