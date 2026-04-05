import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const RECORD_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

describe('RegulatoryReducedDaysService', () => {
  let service: RegulatoryReducedDaysService;
  let mockPrisma: {
    reducedSchoolDay: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      reducedSchoolDay: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({ id: RECORD_ID, student_id: STUDENT_ID }),
        update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        delete: jest.fn().mockResolvedValue({ id: RECORD_ID }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RegulatoryReducedDaysService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<RegulatoryReducedDaysService>(RegulatoryReducedDaysService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should create a reduced school day record', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    const mockTx = {
      reducedSchoolDay: {
        create: jest.fn().mockResolvedValue({ id: RECORD_ID, student_id: STUDENT_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.create(TENANT_ID, USER_ID, {
      student_id: STUDENT_ID,
      start_date: '2026-01-15',
      hours_per_day: 3.5,
      reason: 'medical_needs',
    });

    expect(result).toEqual({ id: RECORD_ID, student_id: STUDENT_ID });
  });

  it('should return paginated reduced school days', async () => {
    mockPrisma.reducedSchoolDay.findMany.mockResolvedValue([{ id: RECORD_ID }]);
    mockPrisma.reducedSchoolDay.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1 });
  });

  it('should filter by student_id and is_active', async () => {
    mockPrisma.reducedSchoolDay.findMany.mockResolvedValue([]);
    mockPrisma.reducedSchoolDay.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      student_id: STUDENT_ID,
      is_active: true,
    });

    expect(mockPrisma.reducedSchoolDay.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_ID, student_id: STUDENT_ID, is_active: true },
      }),
    );
  });

  it('should return a single reduced school day', async () => {
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({
      id: RECORD_ID,
      student_id: STUDENT_ID,
    });

    const result = await service.findOne(TENANT_ID, RECORD_ID);

    expect(result.id).toBe(RECORD_ID);
  });

  it('should throw NotFoundException when record does not exist', async () => {
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, RECORD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should update a reduced school day', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
    const mockTx = {
      reducedSchoolDay: {
        update: jest.fn().mockResolvedValue({ id: RECORD_ID, is_active: false }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    const result = await service.update(TENANT_ID, RECORD_ID, { is_active: false });

    expect(result).toEqual({ id: RECORD_ID, is_active: false });
  });

  it('should throw NotFoundException when updating non-existent record', async () => {
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue(null);

    await expect(service.update(TENANT_ID, RECORD_ID, { is_active: false })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should remove a reduced school day', async () => {
    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
      createRlsClient: jest.Mock;
    };
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
    const mockTx = {
      reducedSchoolDay: {
        delete: jest.fn().mockResolvedValue({ id: RECORD_ID }),
      },
    };
    createRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    });

    await service.remove(TENANT_ID, RECORD_ID);

    expect(mockTx.reducedSchoolDay.delete).toHaveBeenCalledWith({ where: { id: RECORD_ID } });
  });

  it('should throw NotFoundException when removing non-existent record', async () => {
    mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue(null);

    await expect(service.remove(TENANT_ID, RECORD_ID)).rejects.toThrow(NotFoundException);
  });

  // ─── update — field branches ───────────────────────────────────────────────

  describe('RegulatoryReducedDaysService — update branches', () => {
    it('should update end_date to a Date when provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { end_date: '2026-06-30' });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          end_date: expect.any(Date),
        }),
      });
    });

    it('should set end_date to null when null provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { end_date: null as unknown as string });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          end_date: null,
        }),
      });
    });

    it('should update hours_per_day', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { hours_per_day: 4 });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          hours_per_day: 4,
        }),
      });
    });

    it('should update reason_detail', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { reason_detail: 'Medical reason' });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          reason_detail: 'Medical reason',
        }),
      });
    });

    it('should set parent_consent_date to Date when provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { parent_consent_date: '2026-03-15' });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          parent_consent_date: expect.any(Date),
        }),
      });
    });

    it('should set parent_consent_date to null when null provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, {
        parent_consent_date: null as unknown as string,
      });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          parent_consent_date: null,
        }),
      });
    });

    it('should set review_date to Date when provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { review_date: '2026-04-01' });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          review_date: expect.any(Date),
        }),
      });
    });

    it('should set review_date to null when null provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { review_date: null as unknown as string });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          review_date: null,
        }),
      });
    });

    it('should set tusla_notified and tusla_notified_at when tusla_notified is true', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { tusla_notified: true });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          tusla_notified: true,
          tusla_notified_at: expect.any(Date),
        }),
      });
    });

    it('should set tusla_notified false without tusla_notified_at', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { tusla_notified: false });

      const updateCall = mockTx.reducedSchoolDay.update.mock.calls[0][0];
      expect(updateCall.data.tusla_notified).toBe(false);
      expect(updateCall.data.tusla_notified_at).toBeUndefined();
    });

    it('should update notes', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      mockPrisma.reducedSchoolDay.findFirst.mockResolvedValue({ id: RECORD_ID });
      const mockTx = {
        reducedSchoolDay: {
          update: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.update(TENANT_ID, RECORD_ID, { notes: 'Updated notes' });

      expect(mockTx.reducedSchoolDay.update).toHaveBeenCalledWith({
        where: { id: RECORD_ID },
        data: expect.objectContaining({
          notes: 'Updated notes',
        }),
      });
    });
  });

  // ─── create — branch coverage ──────────────────────────────────────────────

  describe('RegulatoryReducedDaysService — create branches', () => {
    it('should create with optional fields as null when not provided', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      const mockTx = {
        reducedSchoolDay: {
          create: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.create(TENANT_ID, USER_ID, {
        student_id: STUDENT_ID,
        start_date: '2026-01-15',
        hours_per_day: 3.5,
        reason: 'medical_needs',
      });

      expect(mockTx.reducedSchoolDay.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          reason_detail: null,
          parent_consent_date: null,
          review_date: null,
          notes: null,
          end_date: null,
        }),
      });
    });

    it('should create with all optional fields', async () => {
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      const mockTx = {
        reducedSchoolDay: {
          create: jest.fn().mockResolvedValue({ id: RECORD_ID }),
        },
      };
      createRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
      });

      await service.create(TENANT_ID, USER_ID, {
        student_id: STUDENT_ID,
        start_date: '2026-01-15',
        end_date: '2026-06-30',
        hours_per_day: 3.5,
        reason: 'phased_return',
        reason_detail: 'Returning from illness',
        parent_consent_date: '2026-01-14',
        review_date: '2026-03-15',
        notes: 'Review in March',
      });

      expect(mockTx.reducedSchoolDay.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          end_date: expect.any(Date),
          reason_detail: 'Returning from illness',
          parent_consent_date: expect.any(Date),
          review_date: expect.any(Date),
          notes: 'Review in March',
        }),
      });
    });
  });
});
