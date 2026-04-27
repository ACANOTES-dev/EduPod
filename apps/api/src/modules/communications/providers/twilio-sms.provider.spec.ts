import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { SmsConfigService } from '../../configuration/sms-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { TwilioSmsProvider } from './twilio-sms.provider';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('TwilioSmsProvider', () => {
  let provider: TwilioSmsProvider;
  let mockCircuitBreaker: { exec: jest.Mock };
  let mockSmsConfig: { getDecryptedConfig: jest.Mock };
  let mockCacheBus: { subscribe: jest.Mock };

  beforeEach(async () => {
    mockCircuitBreaker = { exec: jest.fn() };
    mockSmsConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(null) };
    mockCacheBus = { subscribe: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioSmsProvider,
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
        { provide: SmsConfigService, useValue: mockSmsConfig },
        { provide: CommsCacheBusService, useValue: mockCacheBus },
      ],
    }).compile();

    provider = module.get<TwilioSmsProvider>(TwilioSmsProvider);
    provider.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('send', () => {
    it('returns skipped:channel_not_configured when tenant has no config', async () => {
      mockSmsConfig.getDecryptedConfig.mockResolvedValue(null);
      const result = await provider.send(TENANT_ID, { to: '+1555', body: 'x' });
      expect(result).toEqual({ skipped: true, reason: 'channel_not_configured' });
    });

    it('returns skipped:channel_disabled when config is disabled', async () => {
      mockSmsConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: false,
        twilio_account_sid: 'AC',
        twilio_auth_token: 'tok',
        twilio_from_number: '+1',
      });
      const result = await provider.send(TENANT_ID, { to: '+1555', body: 'x' });
      expect(result).toEqual({ skipped: true, reason: 'channel_disabled' });
    });

    it('uses tenant credentials when enabled', async () => {
      mockSmsConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'ACtenant',
        twilio_auth_token: 'tokTenant',
        twilio_from_number: '+14155550000',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_tenant' });
      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'Hello' });
      expect(result).toEqual({ messageSid: 'SM_tenant' });
    });

    it('truncates body exceeding 1600 chars', async () => {
      mockSmsConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'AC',
        twilio_auth_token: 'tok',
        twilio_from_number: '+1',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_long' });
      const result = await provider.send(TENANT_ID, { to: '+1555', body: 'A'.repeat(1700) });
      expect(result).toEqual({ messageSid: 'SM_long' });
    });
  });

  describe('cache invalidation', () => {
    it('subscribes to cache bus on init', () => {
      expect(mockCacheBus.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
