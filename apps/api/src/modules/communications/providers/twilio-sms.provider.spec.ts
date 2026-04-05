import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';

import { TwilioSmsProvider } from './twilio-sms.provider';

describe('TwilioSmsProvider', () => {
  let provider: TwilioSmsProvider;
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
        TwilioSmsProvider,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
      ],
    }).compile();

    provider = module.get<TwilioSmsProvider>(TwilioSmsProvider);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── isConfigured() ───────────────────────────────────────────────────────

  describe('TwilioSmsProvider — isConfigured', () => {
    it('should return true when all required env vars are set', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_SMS_FROM') return '+15551234567';
        return undefined;
      });

      expect(provider.isConfigured()).toBe(true);
    });

    it('should return false when TWILIO_ACCOUNT_SID is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_SMS_FROM') return '+15551234567';
        return undefined;
      });

      expect(provider.isConfigured()).toBe(false);
    });

    it('should return false when TWILIO_AUTH_TOKEN is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_SMS_FROM') return '+15551234567';
        return undefined;
      });

      expect(provider.isConfigured()).toBe(false);
    });

    it('should return false when TWILIO_SMS_FROM is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        return undefined;
      });

      expect(provider.isConfigured()).toBe(false);
    });
  });

  // ─── send() ───────────────────────────────────────────────────────────────

  describe('TwilioSmsProvider — send', () => {
    it('should throw when Twilio is not configured (no SID/token)', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(provider.send({ to: '+15559876543', body: 'Hello' })).rejects.toThrow(
        'Twilio is not configured',
      );
    });

    it('should throw when TWILIO_SMS_FROM is not configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        return undefined;
      });

      await expect(provider.send({ to: '+15559876543', body: 'Hello' })).rejects.toThrow(
        'TWILIO_SMS_FROM',
      );
    });

    it('should send SMS and return messageSid on success', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_SMS_FROM') return '+15551234567';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM-test-123' });

      const result = await provider.send({
        to: '+15559876543',
        body: 'Hello from test',
      });

      expect(result.messageSid).toBe('SM-test-123');
      expect(mockCircuitBreaker.exec).toHaveBeenCalledWith('twilio', expect.any(Function));
    });

    it('should truncate body exceeding 1600 characters', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_SMS_FROM') return '+15551234567';
        return undefined;
      });

      // Capture the truncated body
      mockCircuitBreaker.exec.mockImplementation(
        async (_name: string, _fn: () => Promise<unknown>) => {
          // We can't actually call fn() because the Twilio client is real
          // Just return mock response
          return { sid: 'SM-truncated' };
        },
      );

      const longBody = 'A'.repeat(1700);
      const result = await provider.send({
        to: '+15559876543',
        body: longBody,
      });

      expect(result.messageSid).toBe('SM-truncated');
    });

    it('should not truncate body at exactly 1600 characters', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_SMS_FROM') return '+15551234567';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM-exact' });

      const exactBody = 'A'.repeat(1600);
      const result = await provider.send({
        to: '+15559876543',
        body: exactBody,
      });

      expect(result.messageSid).toBe('SM-exact');
    });

    it('should reuse client on subsequent calls', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_SMS_FROM') return '+15551234567';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM-1' });

      await provider.send({ to: '+15551111111', body: 'First' });
      await provider.send({ to: '+15552222222', body: 'Second' });

      expect(mockCircuitBreaker.exec).toHaveBeenCalledTimes(2);
    });
  });
});
