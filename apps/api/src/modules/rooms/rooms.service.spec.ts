import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RoomsService } from './rooms.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ROOM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('RoomsService', () => {
  let service: RoomsService;
  let mockPrisma: {
    room: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    schedule: { count: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      room: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: ROOM_ID, name: 'Room A' }),
        update: jest.fn().mockResolvedValue({ id: ROOM_ID }),
        delete: jest.fn().mockResolvedValue({ id: ROOM_ID }),
      },
      schedule: { count: jest.fn().mockResolvedValue(0) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── create ─────────────────────────────────────────────────────────────────

  it('should create a room with default values', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      room: {
        create: jest.fn().mockResolvedValue({ id: ROOM_ID, name: 'Lab 1', room_type: 'classroom' }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.create(TENANT_ID, { name: 'Lab 1', room_type: 'classroom', is_exclusive: true });

    expect(result).toEqual({ id: ROOM_ID, name: 'Lab 1', room_type: 'classroom' });
  });

  it('should throw ConflictException on duplicate room name', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };

    const prismaError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '5.0.0' },
    );

    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockRejectedValue(prismaError),
    });

    await expect(service.create(TENANT_ID, { name: 'Room A', room_type: 'classroom', is_exclusive: true })).rejects.toThrow(ConflictException);
  });

  // ─── findAll ────────────────────────────────────────────────────────────────

  it('should return paginated rooms', async () => {
    mockPrisma.room.findMany.mockResolvedValue([{ id: ROOM_ID, name: 'Room A' }]);
    mockPrisma.room.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should apply active and room_type filters when provided', async () => {
    mockPrisma.room.findMany.mockResolvedValue([]);
    mockPrisma.room.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, active: true, room_type: 'lab' });

    expect(mockPrisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, active: true, room_type: 'lab' },
      }),
    );
  });

  // ─── findOne ────────────────────────────────────────────────────────────────

  it('should return a room by id', async () => {
    mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID, name: 'Room A' });

    const result = await service.findOne(TENANT_ID, ROOM_ID);

    expect(result.name).toBe('Room A');
  });

  it('should throw NotFoundException when room does not exist', async () => {
    mockPrisma.room.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, ROOM_ID)).rejects.toThrow(NotFoundException);
  });

  // ─── update ─────────────────────────────────────────────────────────────────

  it('should throw NotFoundException when updating a non-existent room', async () => {
    mockPrisma.room.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, ROOM_ID, { name: 'Updated' })).rejects.toThrow(NotFoundException);
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  it('should throw ConflictException when room is in use by schedules', async () => {
    mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
    mockPrisma.schedule.count.mockResolvedValue(3);

    await expect(service.remove(TENANT_ID, ROOM_ID)).rejects.toThrow(ConflictException);
  });

  it('should delete a room that is not in use', async () => {
    mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
    mockPrisma.schedule.count.mockResolvedValue(0);

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      room: { delete: jest.fn().mockResolvedValue({ id: ROOM_ID }) },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.remove(TENANT_ID, ROOM_ID);

    expect(result).toEqual({ id: ROOM_ID });
  });
});
