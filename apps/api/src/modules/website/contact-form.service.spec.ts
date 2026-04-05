import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { ContactFormService } from './contact-form.service';

const TENANT_ID = 'tenant-aaa-111';
const SUBMISSION_ID = 'sub-bbb-222';
const SOURCE_IP = '192.168.1.100';

function makeSubmission(overrides: Record<string, unknown> = {}) {
  return {
    id: SUBMISSION_ID,
    tenant_id: TENANT_ID,
    name: 'Test User',
    email: 'test@example.com',
    phone: null,
    message: 'Hello there',
    source_ip: SOURCE_IP,
    status: 'new_submission',
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

const mockRedisClient = {
  incr: jest.fn(),
  expire: jest.fn(),
};

const mockRedis = {
  getClient: jest.fn(() => mockRedisClient),
};

const mockPrisma = {
  contactFormSubmission: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    update: jest.fn(),
  },
};

describe('ContactFormService', () => {
  let service: ContactFormService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactFormService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<ContactFormService>(ContactFormService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── submit() ──────────────────────────────────────────────────────

  describe('ContactFormService — submit', () => {
    it('should create submission with status new_submission', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      const created = makeSubmission();
      mockPrisma.contactFormSubmission.create.mockResolvedValue(created);

      const result = await service.submit(
        TENANT_ID,
        { name: 'Test User', email: 'test@example.com', message: 'Hello there' },
        SOURCE_IP,
      );

      expect(result.status).toBe('new_submission');
      expect(mockPrisma.contactFormSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'new_submission', tenant_id: TENANT_ID }),
        }),
      );
    });

    it('should store as spam when honeypot field is filled', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      const created = makeSubmission({ status: 'spam' });
      mockPrisma.contactFormSubmission.create.mockResolvedValue(created);

      await service.submit(
        TENANT_ID,
        { name: 'Bot', email: 'bot@spam.com', message: 'Buy stuff', _honeypot: 'bot@spam.com' },
        SOURCE_IP,
      );

      expect(mockPrisma.contactFormSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'spam' }),
        }),
      );
    });

    it('should NOT mark as spam when honeypot is empty string', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockPrisma.contactFormSubmission.create.mockResolvedValue(makeSubmission());

      await service.submit(
        TENANT_ID,
        { name: 'Real User', email: 'user@example.com', message: 'Hello', _honeypot: '' },
        SOURCE_IP,
      );

      expect(mockPrisma.contactFormSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'new_submission' }),
        }),
      );
    });

    it('should NOT mark as spam when honeypot is undefined', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockPrisma.contactFormSubmission.create.mockResolvedValue(makeSubmission());

      await service.submit(
        TENANT_ID,
        { name: 'Real User', email: 'user@example.com', message: 'Hello' },
        SOURCE_IP,
      );

      expect(mockPrisma.contactFormSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'new_submission' }),
        }),
      );
    });

    it('should throw RATE_LIMIT_EXCEEDED on 6th submission', async () => {
      mockRedisClient.incr.mockResolvedValue(6);

      await expect(
        service.submit(
          TENANT_ID,
          { name: 'Spammer', email: 's@s.com', message: 'Spam' },
          SOURCE_IP,
        ),
      ).rejects.toThrow(BadRequestException);

      try {
        mockRedisClient.incr.mockResolvedValue(6);
        await service.submit(
          TENANT_ID,
          { name: 'Spammer', email: 's@s.com', message: 'Spam' },
          SOURCE_IP,
        );
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'RATE_LIMIT_EXCEEDED',
        });
      }
    });

    it('should allow 5 submissions from same IP', async () => {
      mockRedisClient.incr.mockResolvedValue(5);
      const created = makeSubmission();
      mockPrisma.contactFormSubmission.create.mockResolvedValue(created);

      await expect(
        service.submit(TENANT_ID, { name: 'User', email: 'u@u.com', message: 'Hi' }, SOURCE_IP),
      ).resolves.toBeDefined();
    });

    it('should skip rate limiting when sourceIp is null', async () => {
      const created = makeSubmission({ source_ip: null });
      mockPrisma.contactFormSubmission.create.mockResolvedValue(created);

      const result = await service.submit(
        TENANT_ID,
        { name: 'No IP User', email: 'noip@example.com', message: 'Hello' },
        null,
      );

      expect(result).toBeDefined();
      expect(mockRedisClient.incr).not.toHaveBeenCalled();
      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });

    it('should set phone to null when not provided', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockPrisma.contactFormSubmission.create.mockResolvedValue(makeSubmission());

      await service.submit(TENANT_ID, { name: 'User', email: 'u@u.com', message: 'Hi' }, SOURCE_IP);

      expect(mockPrisma.contactFormSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: null }),
        }),
      );
    });

    it('should pass phone when provided', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockPrisma.contactFormSubmission.create.mockResolvedValue(
        makeSubmission({ phone: '+123456789' }),
      );

      await service.submit(
        TENANT_ID,
        { name: 'User', email: 'u@u.com', message: 'Hi', phone: '+123456789' },
        SOURCE_IP,
      );

      expect(mockPrisma.contactFormSubmission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phone: '+123456789' }),
        }),
      );
    });

    it('should set TTL only on first request (incr returns 1)', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockPrisma.contactFormSubmission.create.mockResolvedValue(makeSubmission());

      await service.submit(TENANT_ID, { name: 'User', email: 'u@u.com', message: 'Hi' }, SOURCE_IP);

      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        expect.stringContaining('rate:contact:'),
        3600,
      );
    });

    it('should NOT set TTL on subsequent requests (incr returns > 1)', async () => {
      mockRedisClient.incr.mockResolvedValue(3);
      mockPrisma.contactFormSubmission.create.mockResolvedValue(makeSubmission());

      await service.submit(TENANT_ID, { name: 'User', email: 'u@u.com', message: 'Hi' }, SOURCE_IP);

      expect(mockRedisClient.expire).not.toHaveBeenCalled();
    });

    it('edge: honeypot submission still stored (not rejected)', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      const created = makeSubmission({ status: 'spam' });
      mockPrisma.contactFormSubmission.create.mockResolvedValue(created);

      await service.submit(
        TENANT_ID,
        { name: 'Bot', email: 'bot@x.com', message: 'Spam', _honeypot: 'filled' },
        SOURCE_IP,
      );

      expect(mockPrisma.contactFormSubmission.create).toHaveBeenCalled();
    });

    it('edge: rate limit key includes tenantId and IP for isolation', async () => {
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      mockPrisma.contactFormSubmission.create.mockResolvedValue(makeSubmission());

      await service.submit(
        TENANT_ID,
        { name: 'User', email: 'u@u.com', message: 'Hi' },
        '10.0.0.1',
      );

      expect(mockRedisClient.incr).toHaveBeenCalledWith(`rate:contact:${TENANT_ID}:10.0.0.1`);
    });
  });

  // ─── list() ────────────────────────────────────────────────────────

  describe('ContactFormService — list', () => {
    it('should return paginated submissions with no filters', async () => {
      const submissions = [makeSubmission()];
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue(submissions);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(1);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result).toEqual({
        data: submissions,
        meta: { page: 1, pageSize: 20, total: 1 },
      });
    });

    it('should exclude spam by default when no status filter', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10 });

      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: { not: 'spam' } },
        }),
      );
    });

    it('should include spam when include_spam is true and no status filter', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, include_spam: true });

      // When include_spam is true and no status, the where should only have tenant_id
      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
        }),
      );
    });

    it('should map status "new" to "new_submission"', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, status: 'new' });

      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'new_submission' },
        }),
      );
    });

    it('should pass through non-"new" status values as-is', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, status: 'reviewed' });

      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'reviewed' },
        }),
      );
    });

    it('should filter by spam status when explicitly requested', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, status: 'spam' });

      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'spam' },
        }),
      );
    });

    it('should calculate skip correctly for page 2', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 2, pageSize: 15 });

      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 15, take: 15 }),
      );
    });

    it('should order by created_at desc', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10 });

      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { created_at: 'desc' } }),
      );
    });

    it('edge: status filter takes precedence over include_spam', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      // When both status and include_spam are provided, status wins (it's checked first)
      await service.list(TENANT_ID, {
        page: 1,
        pageSize: 10,
        status: 'closed',
        include_spam: true,
      });

      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'closed' },
        }),
      );
    });

    it('edge: include_spam false still excludes spam when no status', async () => {
      mockPrisma.contactFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 10, include_spam: false });

      expect(mockPrisma.contactFormSubmission.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: { not: 'spam' } },
        }),
      );
    });
  });

  // ─── updateStatus() — valid transitions ────────────────────────────

  describe('ContactFormService — updateStatus valid transitions', () => {
    it('should transition new_submission to reviewed', async () => {
      const sub = makeSubmission({ status: 'new_submission' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);
      mockPrisma.contactFormSubmission.update.mockResolvedValue({ ...sub, status: 'reviewed' });

      const result = await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed');

      expect(result.status).toBe('reviewed');
    });

    it('should transition new_submission to closed', async () => {
      const sub = makeSubmission({ status: 'new_submission' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);
      mockPrisma.contactFormSubmission.update.mockResolvedValue({ ...sub, status: 'closed' });

      const result = await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'closed');

      expect(result.status).toBe('closed');
    });

    it('should transition new_submission to spam', async () => {
      const sub = makeSubmission({ status: 'new_submission' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);
      mockPrisma.contactFormSubmission.update.mockResolvedValue({ ...sub, status: 'spam' });

      const result = await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'spam');

      expect(result.status).toBe('spam');
    });

    it('should transition reviewed to closed', async () => {
      const sub = makeSubmission({ status: 'reviewed' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);
      mockPrisma.contactFormSubmission.update.mockResolvedValue({ ...sub, status: 'closed' });

      const result = await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'closed');

      expect(result.status).toBe('closed');
    });

    it('should transition reviewed to spam', async () => {
      const sub = makeSubmission({ status: 'reviewed' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);
      mockPrisma.contactFormSubmission.update.mockResolvedValue({ ...sub, status: 'spam' });

      const result = await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'spam');

      expect(result.status).toBe('spam');
    });
  });

  // ─── updateStatus() — invalid transitions ─────────────────────────

  describe('ContactFormService — updateStatus invalid transitions', () => {
    it('edge: should throw when transitioning from closed', async () => {
      const sub = makeSubmission({ status: 'closed' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);

      await expect(service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed')).rejects.toThrow(
        BadRequestException,
      );

      try {
        await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed');
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
    });

    it('edge: should throw when transitioning from spam', async () => {
      const sub = makeSubmission({ status: 'spam' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);

      await expect(service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed')).rejects.toThrow(
        BadRequestException,
      );

      try {
        await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed');
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
    });

    it('edge: should throw when trying reviewed to new_submission', async () => {
      const sub = makeSubmission({ status: 'reviewed' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);

      await expect(
        service.updateStatus(TENANT_ID, SUBMISSION_ID, 'new_submission'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'new_submission');
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
    });
  });

  // ─── updateStatus() — not found ───────────────────────────────────

  describe('ContactFormService — updateStatus not found', () => {
    it('should throw NotFoundException when submission does not exist', async () => {
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus(TENANT_ID, 'nonexistent-id', 'reviewed')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should include SUBMISSION_NOT_FOUND code in error response', async () => {
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(null);

      try {
        await service.updateStatus(TENANT_ID, 'bad-id', 'reviewed');
      } catch (err: unknown) {
        expect((err as NotFoundException).getResponse()).toMatchObject({
          code: 'SUBMISSION_NOT_FOUND',
        });
      }
    });
  });

  // ─── updateStatus() — edge: unknown current status ────────────────

  describe('ContactFormService — updateStatus unknown status', () => {
    it('edge: should throw INVALID_STATUS_TRANSITION when current status has no transitions defined', async () => {
      // Simulate a status that does not exist in VALID_TRANSITIONS map
      const sub = makeSubmission({ status: 'unknown_status' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);

      await expect(service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed')).rejects.toThrow(
        BadRequestException,
      );

      try {
        await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed');
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({
          code: 'INVALID_STATUS_TRANSITION',
        });
      }
    });
  });
});
