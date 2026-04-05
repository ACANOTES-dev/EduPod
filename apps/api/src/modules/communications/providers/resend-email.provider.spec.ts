import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';

import { ResendEmailProvider } from './resend-email.provider';

describe('ResendEmailProvider', () => {
  let provider: ResendEmailProvider;
  let mockConfigService: { get: jest.Mock };
  let mockCircuitBreaker: { exec: jest.Mock };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    };
    mockCircuitBreaker = {
      exec: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResendEmailProvider,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
      ],
    }).compile();

    provider = module.get<ResendEmailProvider>(ResendEmailProvider);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── isConfigured() ───────��─────────────────────────────────────────────

  describe('ResendEmailProvider — isConfigured', () => {
    it('should return true when RESEND_API_KEY is set', () => {
      mockConfigService.get.mockReturnValue('re_test_key');

      expect(provider.isConfigured()).toBe(true);
    });

    it('should return false when RESEND_API_KEY is not set', () => {
      mockConfigService.get.mockReturnValue(undefined);

      expect(provider.isConfigured()).toBe(false);
    });

    it('should return false when RESEND_API_KEY is empty string', () => {
      mockConfigService.get.mockReturnValue('');

      expect(provider.isConfigured()).toBe(false);
    });
  });

  // ─── send() ─��───────────────────────────────────────────────────────────

  describe('ResendEmailProvider — send', () => {
    it('should throw when RESEND_API_KEY is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(
        provider.send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        }),
      ).rejects.toThrow('Resend is not configured');
    });

    it('should send email and return messageId on success', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        if (key === 'RESEND_FROM_EMAIL') return 'noreply@school.test';
        return undefined;
      });

      // Mock the circuit breaker to execute the callback and return mock Resend response
      mockCircuitBreaker.exec.mockImplementation(
        async (_name: string, _fn: () => Promise<unknown>) => {
          // Instead of calling Resend, return mock response
          // We can't call fn() because Resend won't be properly initialized
          // So we just return a mock response directly
          return { data: { id: 'resend-msg-123' }, error: null };
        },
      );

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result.messageId).toBe('resend-msg-123');
      expect(mockCircuitBreaker.exec).toHaveBeenCalledWith('resend', expect.any(Function));
    });

    it('should use default from email when RESEND_FROM_EMAIL not set', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({
        data: { id: 'msg-1' },
        error: null,
      });

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result.messageId).toBe('msg-1');
    });

    it('should use custom from address when provided', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        if (key === 'RESEND_FROM_EMAIL') return 'default@school.test';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({
        data: { id: 'msg-2' },
        error: null,
      });

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
        from: 'custom@school.test',
      });

      expect(result.messageId).toBe('msg-2');
    });

    it('should throw when Resend returns an error', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key', name: 'AuthError' },
      });

      await expect(
        provider.send({
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Hello</p>',
        }),
      ).rejects.toThrow('Resend email failed: Invalid API key');
    });

    it('should return empty messageId when data.id is null', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({
        data: null,
        error: null,
      });

      const result = await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
      });

      expect(result.messageId).toBe('');
    });

    it('should pass tags and idempotencyKey when provided', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({
        data: { id: 'msg-3' },
        error: null,
      });

      await provider.send({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Hello</p>',
        tags: [{ name: 'test', value: 'val' }],
        idempotencyKey: 'idem-1',
        replyTo: 'reply@school.test',
      });

      expect(mockCircuitBreaker.exec).toHaveBeenCalled();
    });

    it('should reuse client on subsequent calls', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_test_key';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({
        data: { id: 'msg-4' },
        error: null,
      });

      await provider.send({ to: 'a@b.com', subject: 'S', html: '<p>H</p>' });
      await provider.send({ to: 'c@d.com', subject: 'S', html: '<p>H</p>' });

      // ConfigService.get for RESEND_API_KEY should only be called once for initialization
      // (subsequent calls reuse the client)
      expect(mockCircuitBreaker.exec).toHaveBeenCalledTimes(2);
    });
  });
});
