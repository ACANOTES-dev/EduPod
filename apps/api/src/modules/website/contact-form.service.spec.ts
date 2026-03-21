import { BadRequestException } from '@nestjs/common';
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

  // ─── submit() ──────────────────────────────────────────────────────

  describe('submit()', () => {
    it('should create submission with status new', async () => {
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

    it('should throw RATE_LIMIT_EXCEEDED on 6th submission', async () => {
      mockRedisClient.incr.mockResolvedValue(6);

      await expect(
        service.submit(TENANT_ID, { name: 'Spammer', email: 's@s.com', message: 'Spam' }, SOURCE_IP),
      ).rejects.toThrow(BadRequestException);

      try {
        mockRedisClient.incr.mockResolvedValue(6);
        await service.submit(TENANT_ID, { name: 'Spammer', email: 's@s.com', message: 'Spam' }, SOURCE_IP);
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED' });
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

    it('edge: honeypot submission still stored', async () => {
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

    it('edge: rate limit resets after 1 hour (Redis TTL)', async () => {
      // Simulate after TTL expiry: incr returns 1 again
      mockRedisClient.incr.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      const created = makeSubmission();
      mockPrisma.contactFormSubmission.create.mockResolvedValue(created);

      const result = await service.submit(
        TENANT_ID,
        { name: 'User', email: 'u@u.com', message: 'Hi again' },
        SOURCE_IP,
      );

      expect(result).toBeDefined();
      // When incr returns 1 (key expired and recreated), expire is called to set new TTL
      expect(mockRedisClient.expire).toHaveBeenCalledWith(
        expect.stringContaining('rate:contact:'),
        3600,
      );
    });
  });

  // ─── updateStatus() — valid transitions ────────────────────────────

  describe('updateStatus() — valid transitions', () => {
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

  describe('updateStatus() — invalid transitions', () => {
    it('edge: should throw when transitioning from closed', async () => {
      const sub = makeSubmission({ status: 'closed' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);

      await expect(
        service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed');
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
      }
    });

    it('edge: should throw when transitioning from spam', async () => {
      const sub = makeSubmission({ status: 'spam' });
      mockPrisma.contactFormSubmission.findFirst.mockResolvedValue(sub);

      await expect(
        service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed'),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.updateStatus(TENANT_ID, SUBMISSION_ID, 'reviewed');
      } catch (err: unknown) {
        expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
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
        expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'INVALID_STATUS_TRANSITION' });
      }
    });
  });
});
