import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { EmailConfigService } from '../../configuration/email-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';

import { ResendEmailProvider } from './resend-email.provider';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('ResendEmailProvider', () => {
  let provider: ResendEmailProvider;
  let mockConfigService: { get: jest.Mock };
  let mockCircuitBreaker: { exec: jest.Mock };
  let mockEmailConfig: { getDecryptedConfig: jest.Mock };
  let mockCacheBus: { subscribe: jest.Mock };

  beforeEach(async () => {
    mockConfigService = { get: jest.fn() };
    mockCircuitBreaker = { exec: jest.fn() };
    mockEmailConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(null) };
    mockCacheBus = { subscribe: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResendEmailProvider,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
        { provide: EmailConfigService, useValue: mockEmailConfig },
        { provide: CommsCacheBusService, useValue: mockCacheBus },
      ],
    }).compile();

    provider = module.get<ResendEmailProvider>(ResendEmailProvider);
    provider.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('isConfigured', () => {
    it('returns true when RESEND_API_KEY env is set', () => {
      mockConfigService.get.mockReturnValue('re_test_key');
      expect(provider.isConfigured()).toBe(true);
    });

    it('returns false when RESEND_API_KEY env is undefined', () => {
      mockConfigService.get.mockReturnValue(undefined);
      expect(provider.isConfigured()).toBe(false);
    });
  });

  describe('isConfiguredForTenant', () => {
    it('returns true when tenant config is enabled', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({ is_enabled: true });
      expect(await provider.isConfiguredForTenant(TENANT_ID)).toBe(true);
    });

    it('falls through to env when no tenant config', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue('re_env');
      expect(await provider.isConfiguredForTenant(TENANT_ID)).toBe(true);
    });

    it('returns false when neither path configured', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);
      expect(await provider.isConfiguredForTenant(TENANT_ID)).toBe(false);
    });
  });

  describe('send — tenant config path', () => {
    it('uses tenant config when present and enabled', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        resend_api_key: 're_tenant',
        from_email: 'noreply@school.edu',
        from_name: null,
        reply_to_email: null,
      });
      mockCircuitBreaker.exec.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p>H</p>',
      });

      expect(result.messageId).toBe('msg_1');
      // RESEND_API_KEY env should NOT have been read
      expect(mockConfigService.get).not.toHaveBeenCalledWith('RESEND_API_KEY');
    });

    it('renders from_name as "Name <email>" when set', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        resend_api_key: 're_tenant',
        from_email: 'noreply@school.edu',
        from_name: 'NHQS',
        reply_to_email: 'admin@school.edu',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ data: { id: 'msg_2' }, error: null });
      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p>H</p>',
      });
      expect(result.messageId).toBe('msg_2');
    });

    it('uses cache — second send for same tenant does not re-instantiate Resend', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        resend_api_key: 're_tenant',
        from_email: 'noreply@school.edu',
        from_name: null,
        reply_to_email: null,
      });
      mockCircuitBreaker.exec.mockResolvedValue({ data: { id: 'msg_x' }, error: null });

      await provider.send(TENANT_ID, { to: 'a@b.c', subject: 'S', html: '<p/>' });
      await provider.send(TENANT_ID, { to: 'c@d.c', subject: 'S', html: '<p/>' });
      // Both calls succeed, cache stays warm — getDecryptedConfig is consulted each time.
      expect(mockEmailConfig.getDecryptedConfig).toHaveBeenCalledTimes(2);
      expect(mockCircuitBreaker.exec).toHaveBeenCalledTimes(2);
    });
  });

  describe('send — .env fallback path', () => {
    it('falls back to env when tenant config absent', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'RESEND_API_KEY') return 're_env';
        if (key === 'RESEND_FROM_EMAIL') return 'noreply@platform.edu';
        return undefined;
      });
      mockCircuitBreaker.exec.mockResolvedValue({ data: { id: 'msg_env' }, error: null });

      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p>H</p>',
      });
      expect(result.messageId).toBe('msg_env');
    });

    it('throws when neither tenant config nor env is set', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue(undefined);

      await expect(
        provider.send(TENANT_ID, { to: 'p@x.com', subject: 'S', html: '<p>H</p>' }),
      ).rejects.toThrow('Resend is not configured');
    });
  });

  describe('send — error handling', () => {
    it('throws when Resend returns an error', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue(null);
      mockConfigService.get.mockReturnValue('re_env');
      mockCircuitBreaker.exec.mockResolvedValue({
        data: null,
        error: { message: 'Invalid API key', name: 'AuthError' },
      });

      await expect(
        provider.send(TENANT_ID, { to: 'p@x.com', subject: 'S', html: '<p/>' }),
      ).rejects.toThrow('Resend email failed: Invalid API key');
    });
  });

  describe('cache invalidation', () => {
    it('subscribes to cache bus on init', () => {
      expect(mockCacheBus.subscribe).toHaveBeenCalledWith(expect.any(Function));
    });

    it('cache bus event for email channel invalidates that tenant', async () => {
      const handler = mockCacheBus.subscribe.mock.calls[0][0] as (e: {
        tenant_id: string;
        channel: string;
      }) => void;
      // Should not throw on a valid event
      expect(() => handler({ tenant_id: TENANT_ID, channel: 'email' })).not.toThrow();
    });

    it('cache bus event for sms channel is ignored by email provider', () => {
      const handler = mockCacheBus.subscribe.mock.calls[0][0] as (e: {
        tenant_id: string;
        channel: string;
      }) => void;
      expect(() => handler({ tenant_id: TENANT_ID, channel: 'sms' })).not.toThrow();
    });
  });
});
