import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { SmsConfigService } from '../../configuration/sms-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { TwilioSmsProvider } from './twilio-sms.provider';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('TwilioSmsProvider', () => {
  let provider: TwilioSmsProvider;
  let mockConfigService: { get: jest.Mock };
  let mockCircuitBreaker: { exec: jest.Mock };
  let mockSmsConfig: { getDecryptedConfig: jest.Mock };
  let mockCacheBus: { subscribe: jest.Mock };

  beforeEach(async () => {
    mockConfigService = { get: jest.fn() };
    mockCircuitBreaker = { exec: jest.fn() };
    mockSmsConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(null) };
    mockCacheBus = { subscribe: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioSmsProvider,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
        { provide: SmsConfigService, useValue: mockSmsConfig },
        { provide: CommsCacheBusService, useValue: mockCacheBus },
      ],
    }).compile();

    provider = module.get<TwilioSmsProvider>(TwilioSmsProvider);
    provider.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('isConfigured', () => {
    it('returns true when all env vars are set', () => {
      mockConfigService.get.mockImplementation(
        (key: string) =>
          ({
            TWILIO_ACCOUNT_SID: 'AC123',
            TWILIO_AUTH_TOKEN: 'auth123',
            TWILIO_SMS_FROM: '+15551234567',
          })[key],
      );
      expect(provider.isConfigured()).toBe(true);
    });

    it('returns false when any env var is missing', () => {
      mockConfigService.get.mockImplementation((key: string) =>
        key === 'TWILIO_ACCOUNT_SID' ? 'AC123' : undefined,
      );
      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe('send — tenant config path', () => {
    it('uses tenant config when present and enabled', async () => {
      mockSmsConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'ACtenant',
        twilio_auth_token: 'tokTenant',
        twilio_from_number: '+14155550000',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_tenant' });

      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'Hello' });
      expect(result.messageSid).toBe('SM_tenant');
      expect(mockConfigService.get).not.toHaveBeenCalledWith('TWILIO_ACCOUNT_SID');
    });
  });

  describe('send — .env fallback path', () => {
    it('falls back to env when tenant config absent', async () => {
      mockSmsConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockImplementation(
        (key: string) =>
          ({
            TWILIO_ACCOUNT_SID: 'ACenv',
            TWILIO_AUTH_TOKEN: 'tokEnv',
            TWILIO_SMS_FROM: '+15551234567',
          })[key],
      );
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_env' });

      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'Hello' });
      expect(result.messageSid).toBe('SM_env');
    });

    it('throws when neither tenant config nor env set', async () => {
      mockSmsConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);

      await expect(provider.send(TENANT_ID, { to: '+15559876543', body: 'x' })).rejects.toThrow(
        'Twilio SMS is not configured',
      );
    });
  });

  describe('send — body truncation', () => {
    it('truncates body exceeding 1600 chars', async () => {
      mockSmsConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'AC',
        twilio_auth_token: 'tok',
        twilio_from_number: '+1',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_long' });

      const result = await provider.send(TENANT_ID, { to: '+1555', body: 'A'.repeat(1700) });
      expect(result.messageSid).toBe('SM_long');
    });
  });

  describe('cache invalidation', () => {
    it('subscribes to cache bus on init', () => {
      expect(mockCacheBus.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });

    it('only sms-channel events affect this provider', () => {
      const handler = mockCacheBus.subscribe.mock.calls[0][0] as (e: {
        tenant_id: string;
        channel: string;
      }) => void;
      expect(() => handler({ tenant_id: TENANT_ID, channel: 'sms' })).not.toThrow();
      expect(() => handler({ tenant_id: TENANT_ID, channel: 'email' })).not.toThrow();
    });
  });
});
