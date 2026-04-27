import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('TwilioWhatsAppProvider', () => {
  let provider: TwilioWhatsAppProvider;
  let mockCircuitBreaker: { exec: jest.Mock };
  let mockWhatsAppConfig: { getDecryptedConfig: jest.Mock };
  let mockCacheBus: { subscribe: jest.Mock };

  beforeEach(async () => {
    mockCircuitBreaker = { exec: jest.fn() };
    mockWhatsAppConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(null) };
    mockCacheBus = { subscribe: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioWhatsAppProvider,
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
        { provide: WhatsAppConfigService, useValue: mockWhatsAppConfig },
        { provide: CommsCacheBusService, useValue: mockCacheBus },
      ],
    }).compile();

    provider = module.get<TwilioWhatsAppProvider>(TwilioWhatsAppProvider);
    provider.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('send', () => {
    it('returns skipped:channel_not_configured when tenant has no config', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue(null);
      const result = await provider.send(TENANT_ID, { to: '+1555', body: 'x' });
      expect(result).toEqual({ skipped: true, reason: 'channel_not_configured' });
    });

    it('returns skipped:channel_disabled when config is disabled', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: false,
        twilio_account_sid: 'AC',
        twilio_auth_token: 'tok',
        twilio_whatsapp_from_number: '+1',
      });
      const result = await provider.send(TENANT_ID, { to: '+1555', body: 'x' });
      expect(result).toEqual({ skipped: true, reason: 'channel_disabled' });
    });

    it('uses tenant credentials when enabled', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'ACtenant',
        twilio_auth_token: 'tokTenant',
        twilio_whatsapp_from_number: '+14155550000',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_wa' });
      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'Hello' });
      expect(result).toEqual({ messageSid: 'SM_wa' });
    });

    it('does not double-prefix already-prefixed numbers', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'AC',
        twilio_auth_token: 'tok',
        twilio_whatsapp_from_number: 'whatsapp:+14155550000',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_pre' });
      const result = await provider.send(TENANT_ID, {
        to: 'whatsapp:+15559876543',
        body: 'Hello',
      });
      expect(result).toEqual({ messageSid: 'SM_pre' });
    });
  });

  describe('cache invalidation', () => {
    it('subscribes to cache bus on init', () => {
      expect(mockCacheBus.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
