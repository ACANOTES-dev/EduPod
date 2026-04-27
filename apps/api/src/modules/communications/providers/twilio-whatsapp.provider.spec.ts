import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('TwilioWhatsAppProvider', () => {
  let provider: TwilioWhatsAppProvider;
  let mockConfigService: { get: jest.Mock };
  let mockCircuitBreaker: { exec: jest.Mock };
  let mockWhatsAppConfig: { getDecryptedConfig: jest.Mock };
  let mockCacheBus: { subscribe: jest.Mock };

  beforeEach(async () => {
    mockConfigService = { get: jest.fn() };
    mockCircuitBreaker = { exec: jest.fn() };
    mockWhatsAppConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(null) };
    mockCacheBus = { subscribe: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioWhatsAppProvider,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
        { provide: WhatsAppConfigService, useValue: mockWhatsAppConfig },
        { provide: CommsCacheBusService, useValue: mockCacheBus },
      ],
    }).compile();

    provider = module.get<TwilioWhatsAppProvider>(TwilioWhatsAppProvider);
    provider.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('isConfigured', () => {
    it('returns true when all env vars set', () => {
      mockConfigService.get.mockImplementation(
        (key: string) =>
          ({
            TWILIO_ACCOUNT_SID: 'AC',
            TWILIO_AUTH_TOKEN: 'tok',
            TWILIO_WHATSAPP_FROM: '+1',
          })[key],
      );
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('send — tenant config path', () => {
    it('uses tenant config when present and enabled', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'ACtenant',
        twilio_auth_token: 'tokTenant',
        twilio_whatsapp_from_number: '+14155550000',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_wa_tenant' });

      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'Hello' });
      expect(result.messageSid).toBe('SM_wa_tenant');
      expect(mockConfigService.get).not.toHaveBeenCalledWith('TWILIO_ACCOUNT_SID');
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
      expect(result.messageSid).toBe('SM_pre');
    });

    it('prefixes whatsapp: when bare numbers provided', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'AC',
        twilio_auth_token: 'tok',
        twilio_whatsapp_from_number: '+14155550000',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_bare' });

      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'Hello' });
      expect(result.messageSid).toBe('SM_bare');
    });
  });

  describe('send — .env fallback path', () => {
    it('falls back to env when tenant config absent', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockImplementation(
        (key: string) =>
          ({
            TWILIO_ACCOUNT_SID: 'ACenv',
            TWILIO_AUTH_TOKEN: 'tokEnv',
            TWILIO_WHATSAPP_FROM: '+15551234567',
          })[key],
      );
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_wa_env' });

      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'Hello' });
      expect(result.messageSid).toBe('SM_wa_env');
    });

    it('throws when neither tenant config nor env set', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);

      await expect(provider.send(TENANT_ID, { to: '+1555', body: 'x' })).rejects.toThrow(
        'Twilio WhatsApp is not configured',
      );
    });
  });

  describe('cache invalidation', () => {
    it('subscribes to cache bus on init', () => {
      expect(mockCacheBus.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
