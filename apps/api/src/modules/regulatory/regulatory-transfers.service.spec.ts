import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryTransfersService } from './regulatory-transfers.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TRANSFER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('RegulatoryTransfersService', () => {
  let service: RegulatoryTransfersService;
  let mockPrisma: {
    interSchoolTransfer: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    student: {
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      interSchoolTransfer: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: TRANSFER_ID }),
        update: jest.fn().mockResolvedValue({ id: TRANSFER_ID }),
      },
      student: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryTransfersService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RegulatoryTransfersService>(RegulatoryTransfersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findAll ──────────────────────────────────────────────────────────────────

  it('should return paginated transfers', async () => {
    const transfer = { id: TRANSFER_ID, direction: 'outbound', status: 'transfer_pending' };
    mockPrisma.interSchoolTransfer.findMany.mockResolvedValue([transfer]);
    mockPrisma.interSchoolTransfer.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should filter by direction and status', async () => {
    mockPrisma.interSchoolTransfer.findMany.mockResolvedValue([]);
    mockPrisma.interSchoolTransfer.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      direction: 'outbound',
      status: 'pending',
    });

    expect(mockPrisma.interSchoolTransfer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          direction: 'outbound',
          status: 'transfer_pending',
        }),
      }),
    );
  });

  // ─── findOne ──────────────────────────────────────────────────────────────────

  it('should return transfer with relations', async () => {
    const transfer = {
      id: TRANSFER_ID,
      tenant_id: TENANT_ID,
      student_id: STUDENT_ID,
      direction: 'outbound',
      status: 'transfer_pending',
      student: { id: STUDENT_ID, first_name: 'Jane', last_name: 'Doe' },
      initiated_by: { id: USER_ID, first_name: 'Admin', last_name: 'User' },
    };
    mockPrisma.interSchoolTransfer.findFirst.mockResolvedValue(transfer);

    const result = await service.findOne(TENANT_ID, TRANSFER_ID);

    expect(result.id).toBe(TRANSFER_ID);
    expect(result.student.first_name).toBe('Jane');
  });

  it('should throw NotFoundException when transfer not found', async () => {
    mockPrisma.interSchoolTransfer.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, TRANSFER_ID)).rejects.toThrow(NotFoundException);
  });

  // ─── create ───────────────────────────────────────────────────────────────────

  it('should create an outbound transfer', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      interSchoolTransfer: {
        create: jest.fn().mockResolvedValue({
          id: TRANSFER_ID,
          direction: 'outbound',
          status: 'transfer_pending',
        }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

    const result = await service.create(TENANT_ID, USER_ID, {
      student_id: STUDENT_ID,
      direction: 'outbound',
      other_school_roll_no: '12345A',
      transfer_date: '2026-03-01',
    });

    expect(result).toEqual(
      expect.objectContaining({ id: TRANSFER_ID, direction: 'outbound' }),
    );
    expect(mockTx.interSchoolTransfer.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          direction: 'outbound',
          initiated_by_id: USER_ID,
        }),
      }),
    );
  });

  it('should create an inbound transfer', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      interSchoolTransfer: {
        create: jest.fn().mockResolvedValue({
          id: TRANSFER_ID,
          direction: 'inbound',
          status: 'transfer_pending',
        }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

    const result = await service.create(TENANT_ID, USER_ID, {
      student_id: STUDENT_ID,
      direction: 'inbound',
      other_school_roll_no: '67890B',
      transfer_date: '2026-04-15',
      other_school_name: 'St. Patrick\'s NS',
    });

    expect(result).toEqual(
      expect.objectContaining({ id: TRANSFER_ID, direction: 'inbound' }),
    );
  });

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.create(TENANT_ID, USER_ID, {
        student_id: STUDENT_ID,
        direction: 'outbound',
        other_school_roll_no: '12345A',
        transfer_date: '2026-03-01',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ─── update ───────────────────────────────────────────────────────────────────

  it('should update status with valid transition (pending → accepted)', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      interSchoolTransfer: {
        update: jest.fn().mockResolvedValue({
          id: TRANSFER_ID,
          status: 'transfer_accepted',
        }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    mockPrisma.interSchoolTransfer.findFirst.mockResolvedValue({
      id: TRANSFER_ID,
      tenant_id: TENANT_ID,
      status: 'transfer_pending',
      student: { id: STUDENT_ID, first_name: 'Jane', last_name: 'Doe' },
      initiated_by: null,
    });

    const result = await service.update(TENANT_ID, TRANSFER_ID, { status: 'accepted' });

    expect(result).toEqual(
      expect.objectContaining({ id: TRANSFER_ID, status: 'transfer_accepted' }),
    );
    expect(mockTx.interSchoolTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'transfer_accepted' }),
      }),
    );
  });

  it('should throw BadRequestException on invalid transition (completed → pending)', async () => {
    mockPrisma.interSchoolTransfer.findFirst.mockResolvedValue({
      id: TRANSFER_ID,
      tenant_id: TENANT_ID,
      status: 'transfer_completed',
      student: { id: STUDENT_ID, first_name: 'Jane', last_name: 'Doe' },
      initiated_by: null,
    });

    await expect(
      service.update(TENANT_ID, TRANSFER_ID, { status: 'pending' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should set ppod_confirmed_at when ppod_confirmed = true', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      interSchoolTransfer: {
        update: jest.fn().mockResolvedValue({
          id: TRANSFER_ID,
          ppod_confirmed: true,
          ppod_confirmed_at: new Date(),
        }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    mockPrisma.interSchoolTransfer.findFirst.mockResolvedValue({
      id: TRANSFER_ID,
      tenant_id: TENANT_ID,
      status: 'transfer_pending',
      student: { id: STUDENT_ID, first_name: 'Jane', last_name: 'Doe' },
      initiated_by: null,
    });

    await service.update(TENANT_ID, TRANSFER_ID, { ppod_confirmed: true });

    expect(mockTx.interSchoolTransfer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ppod_confirmed: true,
          ppod_confirmed_at: expect.any(Date),
        }),
      }),
    );
  });
});
