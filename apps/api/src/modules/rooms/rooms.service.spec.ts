import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { MOCK_FACADE_PROVIDERS, SchedulesReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { RoomsService } from './rooms.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ROOM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('RoomsService', () => {
  let service: RoomsService;
  let mockSchedulesFacade: { countByRoom: jest.Mock };
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

    mockSchedulesFacade = { countByRoom: jest.fn().mockResolvedValue(0) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        RoomsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SchedulesReadFacade, useValue: mockSchedulesFacade },
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
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.create(TENANT_ID, {
      name: 'Lab 1',
      room_type: 'classroom',
      is_exclusive: true,
    });

    expect(result).toEqual({ id: ROOM_ID, name: 'Lab 1', room_type: 'classroom' });
  });

  it('should throw ConflictException on duplicate room name', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };

    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });

    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockRejectedValue(prismaError),
    });

    await expect(
      service.create(TENANT_ID, { name: 'Room A', room_type: 'classroom', is_exclusive: true }),
    ).rejects.toThrow(ConflictException);
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

    await expect(service.update(TENANT_ID, ROOM_ID, { name: 'Updated' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should update a room successfully', async () => {
    mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      room: {
        update: jest
          .fn()
          .mockResolvedValue({
            id: ROOM_ID,
            name: 'Updated',
            room_type: 'lab',
            capacity: 30,
            active: false,
          }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.update(TENANT_ID, ROOM_ID, {
      name: 'Updated',
      room_type: 'lab' as never,
      capacity: 30,
      is_exclusive: false,
      active: false,
    });

    expect(result.name).toBe('Updated');
    expect(mockTx.room.update).toHaveBeenCalledWith({
      where: { id: ROOM_ID },
      data: expect.objectContaining({
        name: 'Updated',
        room_type: 'lab',
        capacity: 30,
        is_exclusive: false,
        active: false,
      }),
    });
  });

  it('should throw ConflictException on duplicate room name during update', async () => {
    mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const prismaError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockRejectedValue(prismaError),
    });

    await expect(service.update(TENANT_ID, ROOM_ID, { name: 'Duplicate' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('should re-throw non-P2002 errors during update', async () => {
    mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockRejectedValue(new Error('DB connection lost')),
    });

    await expect(service.update(TENANT_ID, ROOM_ID, { name: 'Test' })).rejects.toThrow(
      'DB connection lost',
    );
  });

  it('should re-throw non-P2002 errors during create', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockRejectedValue(new Error('Connection refused')),
    });

    await expect(
      service.create(TENANT_ID, { name: 'Room X', room_type: 'classroom', is_exclusive: true }),
    ).rejects.toThrow('Connection refused');
  });

  // ─── remove ─────────────────────────────────────────────────────────────────

  it('should throw ConflictException when room is in use by schedules', async () => {
    mockPrisma.room.findFirst.mockResolvedValue({ id: ROOM_ID });
    mockSchedulesFacade.countByRoom.mockResolvedValue(3);

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
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.remove(TENANT_ID, ROOM_ID);

    expect(result).toEqual({ id: ROOM_ID });
  });
});
