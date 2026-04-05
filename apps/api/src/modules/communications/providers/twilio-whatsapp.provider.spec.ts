import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';

import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';

describe('TwilioWhatsAppProvider', () => {
  let provider: TwilioWhatsAppProvider;
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
        TwilioWhatsAppProvider,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
      ],
    }).compile();

    provider = module.get<TwilioWhatsAppProvider>(TwilioWhatsAppProvider);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── isConfigured() ───────────────────────────────────────────────────────

  describe('TwilioWhatsAppProvider — isConfigured', () => {
    it('should return true when all required env vars are set', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_WHATSAPP_FROM') return '+15551234567';
        return undefined;
      });

      expect(provider.isConfigured()).toBe(true);
    });

    it('should return false when TWILIO_ACCOUNT_SID is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_WHATSAPP_FROM') return '+15551234567';
        return undefined;
      });

      expect(provider.isConfigured()).toBe(false);
    });

    it('should return false when TWILIO_AUTH_TOKEN is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_WHATSAPP_FROM') return '+15551234567';
        return undefined;
      });

      expect(provider.isConfigured()).toBe(false);
    });

    it('should return false when TWILIO_WHATSAPP_FROM is missing', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        return undefined;
      });

      expect(provider.isConfigured()).toBe(false);
    });
  });

  // ─── send() ───────────────────────────────────────────────────────────────

  describe('TwilioWhatsAppProvider — send', () => {
    it('should throw when Twilio is not configured (no SID/token)', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(provider.send({ to: '+15559876543', body: 'Hello' })).rejects.toThrow(
        'Twilio is not configured',
      );
    });

    it('should throw when TWILIO_WHATSAPP_FROM is not configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        return undefined;
      });

      await expect(provider.send({ to: '+15559876543', body: 'Hello' })).rejects.toThrow(
        'TWILIO_WHATSAPP_FROM',
      );
    });

    it('should send WhatsApp message and return messageSid', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_WHATSAPP_FROM') return '+15551234567';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM-wa-123' });

      const result = await provider.send({
        to: '+15559876543',
        body: 'Hello from WhatsApp test',
      });

      expect(result.messageSid).toBe('SM-wa-123');
      expect(mockCircuitBreaker.exec).toHaveBeenCalledWith('twilio', expect.any(Function));
    });

    it('should not double-prefix whatsapp: when already present in to', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_WHATSAPP_FROM') return 'whatsapp:+15551234567';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM-wa-prefix' });

      const result = await provider.send({
        to: 'whatsapp:+15559876543',
        body: 'Already prefixed',
      });

      expect(result.messageSid).toBe('SM-wa-prefix');
    });

    it('should prefix whatsapp: to both to and from when not present', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_WHATSAPP_FROM') return '+15551234567';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM-wa-no-prefix' });

      const result = await provider.send({
        to: '+15559876543',
        body: 'Not prefixed',
      });

      expect(result.messageSid).toBe('SM-wa-no-prefix');
    });

    it('should reuse client on subsequent calls', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'TWILIO_ACCOUNT_SID') return 'AC123';
        if (key === 'TWILIO_AUTH_TOKEN') return 'auth123';
        if (key === 'TWILIO_WHATSAPP_FROM') return '+15551234567';
        return undefined;
      });

      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM-1' });

      await provider.send({ to: '+15551111111', body: 'First' });
      await provider.send({ to: '+15552222222', body: 'Second' });

      expect(mockCircuitBreaker.exec).toHaveBeenCalledTimes(2);
    });
  });
});
