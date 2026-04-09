import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { PrismaService } from '../../prisma/prisma.service';

import { ReportCommentWindowsService } from './report-comment-windows.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const WINDOW_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PERIOD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  reportCommentWindow: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    reportCommentWindow: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };
}

const mockAcademicReadFacade = {
  findPeriodById: jest.fn(),
};

const baseWindow = {
  id: WINDOW_ID,
  tenant_id: TENANT_ID,
  academic_period_id: PERIOD_ID,
  opens_at: new Date('2026-04-01T08:00:00Z'),
  closes_at: new Date('2026-04-10T17:00:00Z'),
  status: 'open' as const,
  opened_by_user_id: USER_ID,
  closed_at: null,
  closed_by_user_id: null,
  instructions: null,
  created_at: new Date(),
  updated_at: new Date(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ReportCommentWindowsService', () => {
  let service: ReportCommentWindowsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.reportCommentWindow.create.mockReset();
    mockRlsTx.reportCommentWindow.update.mockReset();
    mockAcademicReadFacade.findPeriodById.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportCommentWindowsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AcademicReadFacade, useValue: mockAcademicReadFacade },
      ],
    }).compile();

    service = module.get<ReportCommentWindowsService>(ReportCommentWindowsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findActive ────────────────────────────────────────────────────────────

  describe('findActive', () => {
    it('should return the open window when one exists', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      const result = await service.findActive(TENANT_ID);
      expect(result).toEqual(baseWindow);
      expect(mockPrisma.reportCommentWindow.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, status: 'open' },
        orderBy: { opens_at: 'desc' },
      });
    });

    it('should return null when no window is open', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      const result = await service.findActive(TENANT_ID);
      expect(result).toBeNull();
    });
  });

  // ─── findById ──────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return the window when found', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      const result = await service.findById(TENANT_ID, WINDOW_ID);
      expect(result).toEqual(baseWindow);
    });

    it('should throw NotFoundException when window does not exist', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      await expect(service.findById(TENANT_ID, WINDOW_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return paginated results', async () => {
      mockPrisma.reportCommentWindow.findMany.mockResolvedValue([baseWindow]);
      mockPrisma.reportCommentWindow.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });
      expect(result).toEqual({
        data: [baseWindow],
        meta: { page: 1, pageSize: 20, total: 1 },
      });
    });

    it('should apply status filter when provided', async () => {
      mockPrisma.reportCommentWindow.findMany.mockResolvedValue([]);
      mockPrisma.reportCommentWindow.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { status: 'closed' });
      expect(mockPrisma.reportCommentWindow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'closed' },
        }),
      );
    });
  });

  // ─── open ──────────────────────────────────────────────────────────────────

  describe('open', () => {
    const dto = {
      academic_period_id: PERIOD_ID,
      opens_at: new Date('2030-01-01T08:00:00Z').toISOString(),
      closes_at: new Date('2030-01-10T17:00:00Z').toISOString(),
      instructions: 'Term 1 comments',
    };

    it('should create a scheduled window when opens_at is in the future', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockRlsTx.reportCommentWindow.create.mockResolvedValue({
        ...baseWindow,
        status: 'scheduled',
      });

      const result = await service.open(TENANT_ID, USER_ID, dto);
      expect(result.status).toBe('scheduled');
      expect(mockRlsTx.reportCommentWindow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          academic_period_id: PERIOD_ID,
          status: 'scheduled',
          opened_by_user_id: USER_ID,
        }),
      });
    });

    it('should create an open window when opens_at is in the past', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      mockRlsTx.reportCommentWindow.create.mockResolvedValue(baseWindow);

      await service.open(TENANT_ID, USER_ID, {
        ...dto,
        opens_at: new Date('2020-01-01T08:00:00Z').toISOString(),
      });
      expect(mockRlsTx.reportCommentWindow.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'open' }),
      });
    });

    it('should reject when another window is already open', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      await expect(service.open(TENANT_ID, USER_ID, dto)).rejects.toThrow(ConflictException);
    });

    it('should reject when academic period does not exist', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue(null);
      await expect(service.open(TENANT_ID, USER_ID, dto)).rejects.toThrow(NotFoundException);
    });

    it('should translate unique constraint violation to ConflictException', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(null);
      mockAcademicReadFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      });
      mockRlsTx.reportCommentWindow.create.mockRejectedValue(p2002);
      await expect(service.open(TENANT_ID, USER_ID, dto)).rejects.toThrow(ConflictException);
    });
  });

  // ─── closeNow ──────────────────────────────────────────────────────────────

  describe('closeNow', () => {
    it('should close an open window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      mockRlsTx.reportCommentWindow.update.mockResolvedValue({
        ...baseWindow,
        status: 'closed',
      });
      const result = await service.closeNow(TENANT_ID, USER_ID, WINDOW_ID);
      expect(result.status).toBe('closed');
      expect(mockRlsTx.reportCommentWindow.update).toHaveBeenCalledWith({
        where: { id: WINDOW_ID },
        data: expect.objectContaining({
          status: 'closed',
          closed_by_user_id: USER_ID,
        }),
      });
    });

    it('should reject closing an already closed window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue({
        ...baseWindow,
        status: 'closed',
      });
      await expect(service.closeNow(TENANT_ID, USER_ID, WINDOW_ID)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ─── extend ────────────────────────────────────────────────────────────────

  describe('extend', () => {
    it('should extend an open window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      mockRlsTx.reportCommentWindow.update.mockResolvedValue(baseWindow);
      const newClose = new Date('2026-04-20T17:00:00Z');
      await service.extend(TENANT_ID, USER_ID, WINDOW_ID, newClose);
      expect(mockRlsTx.reportCommentWindow.update).toHaveBeenCalledWith({
        where: { id: WINDOW_ID },
        data: { closes_at: newClose },
      });
    });

    it('should reject extending a closed window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue({
        ...baseWindow,
        status: 'closed',
      });
      await expect(
        service.extend(TENANT_ID, USER_ID, WINDOW_ID, new Date('2030-01-01T00:00:00Z')),
      ).rejects.toThrow(BadRequestException);
    });

    it('edge: should reject new closes_at earlier than opens_at', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      await expect(
        service.extend(TENANT_ID, USER_ID, WINDOW_ID, new Date('2020-01-01T00:00:00Z')),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── reopen ────────────────────────────────────────────────────────────────

  describe('reopen', () => {
    it('should reopen a closed window', async () => {
      mockPrisma.reportCommentWindow.findFirst
        .mockResolvedValueOnce({ ...baseWindow, status: 'closed' })
        .mockResolvedValueOnce(null);
      mockRlsTx.reportCommentWindow.update.mockResolvedValue(baseWindow);
      const result = await service.reopen(TENANT_ID, USER_ID, WINDOW_ID);
      expect(result).toEqual(baseWindow);
      expect(mockRlsTx.reportCommentWindow.update).toHaveBeenCalledWith({
        where: { id: WINDOW_ID },
        data: { status: 'open', closed_at: null, closed_by_user_id: null },
      });
    });

    it('should reject reopening an already open window', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue(baseWindow);
      await expect(service.reopen(TENANT_ID, USER_ID, WINDOW_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when another window is already open', async () => {
      mockPrisma.reportCommentWindow.findFirst
        .mockResolvedValueOnce({ ...baseWindow, status: 'closed' })
        .mockResolvedValueOnce({ ...baseWindow, id: 'other-window' });
      await expect(service.reopen(TENANT_ID, USER_ID, WINDOW_ID)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── assertWindowOpenForPeriod ─────────────────────────────────────────────

  describe('assertWindowOpenForPeriod', () => {
    it('should resolve silently when an open window exists', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue({
        ...baseWindow,
        closes_at: new Date(Date.now() + 60_000),
      });
      await expect(
        service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_ID),
      ).resolves.toBeUndefined();
    });

    it('should throw COMMENT_WINDOW_CLOSED when no open window exists', async () => {
      mockPrisma.reportCommentWindow.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      await expect(service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw COMMENT_WINDOW_CLOSED when the open row has already expired', async () => {
      mockPrisma.reportCommentWindow.findFirst.mockResolvedValue({
        ...baseWindow,
        closes_at: new Date(Date.now() - 60_000),
      });
      await expect(service.assertWindowOpenForPeriod(TENANT_ID, PERIOD_ID)).rejects.toMatchObject({
        response: { code: 'COMMENT_WINDOW_CLOSED' },
      });
    });
  });
});
