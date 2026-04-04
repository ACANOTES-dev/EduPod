import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';

import { RoomClosuresService } from './room-closures.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const ROOM_ID = 'room-1';
const CLOSURE_ID = 'closure-1';

const mockTx = {
  roomClosure: {
    create: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('RoomClosuresService', () => {
  let service: RoomClosuresService;
  let mockPrisma: {
    roomClosure: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
    room: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      roomClosure: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      room: { findFirst: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: RoomsReadFacade, useValue: {
      findById: jest.fn().mockResolvedValue(null),
      existsOrThrow: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      findActiveRooms: jest.fn().mockResolvedValue([]),
      findActiveRoomBasics: jest.fn().mockResolvedValue([]),
      countActiveRooms: jest.fn().mockResolvedValue(0),
      findAllClosures: jest.fn().mockResolvedValue([]),
      findClosuresPaginated: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findClosureById: jest.fn().mockResolvedValue(null),
    } },
        RoomClosuresService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RoomClosuresService>(RoomClosuresService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── list ────────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated room closures', async () => {
      const records = [
        {
          id: CLOSURE_ID,
          room_id: ROOM_ID,
          date_from: new Date('2026-04-01'),
          date_to: new Date('2026-04-05'),
          reason: 'Renovation',
          created_at: new Date('2026-03-01T10:00:00Z'),
          room: { id: ROOM_ID, name: 'Lab A' },
          created_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
        },
      ];
      mockPrisma.roomClosure.findMany.mockResolvedValue(records);
      mockPrisma.roomClosure.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
      // Dates should be formatted as strings
      expect(result.data[0]!['date_from']).toBe('2026-04-01');
      expect(result.data[0]!['date_to']).toBe('2026-04-05');
    });

    it('should filter by room_id', async () => {
      mockPrisma.roomClosure.findMany.mockResolvedValue([]);
      mockPrisma.roomClosure.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 20, room_id: ROOM_ID });

      expect(mockPrisma.roomClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ room_id: ROOM_ID }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.roomClosure.findMany.mockResolvedValue([]);
      mockPrisma.roomClosure.count.mockResolvedValue(0);

      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 20,
        date_from: '2026-04-01',
        date_to: '2026-04-30',
      });

      expect(mockPrisma.roomClosure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({ date_to: { gte: expect.any(Date) } }),
              expect.objectContaining({ date_from: { lte: expect.any(Date) } }),
            ]),
          }),
        }),
      );
    });

    it('should return empty data when no closures exist', async () => {
      mockPrisma.roomClosure.findMany.mockResolvedValue([]);
      mockPrisma.roomClosure.count.mockResolvedValue(0);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    const dto = {
      room_id: ROOM_ID,
      date_from: '2026-04-01',
      date_to: '2026-04-05',
      reason: 'Renovation',
    };

    it('should create a room closure when room exists', async () => {
      mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
      mockTx.roomClosure.create.mockResolvedValue({
        id: CLOSURE_ID,
        room_id: ROOM_ID,
        date_from: new Date('2026-04-01'),
        date_to: new Date('2026-04-05'),
        reason: 'Renovation',
        created_at: new Date('2026-03-01T10:00:00Z'),
        room: { id: ROOM_ID, name: 'Lab A' },
        created_by: { id: USER_ID, first_name: 'John', last_name: 'Doe' },
      });

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result['id']).toBe(CLOSURE_ID);
      expect(result['date_from']).toBe('2026-04-01');
      expect(result['date_to']).toBe('2026-04-05');
    });

    it('should throw NotFoundException when room does not exist', async () => {
      mockPrisma.room.findFirst.mockResolvedValue(null);

      await expect(service.create(TENANT_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete a room closure', async () => {
      mockPrisma.roomClosure.findFirst.mockResolvedValue({ id: CLOSURE_ID });
      mockTx.roomClosure.delete.mockResolvedValue({ id: CLOSURE_ID });

      const result = await service.delete(TENANT_ID, CLOSURE_ID);

      expect(result.message).toBe('Room closure deleted');
    });

    it('should throw NotFoundException when closure does not exist', async () => {
      mockPrisma.roomClosure.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
