import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { EmailConfigService } from '../../configuration/email-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';
import { CommsMetricsService } from '../comms-metrics.service';
import { EmailDomainService } from '../deliverability/email-domain.service';

import { ResendEmailProvider } from './resend-email.provider';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('ResendEmailProvider', () => {
  let provider: ResendEmailProvider;
  let mockCircuitBreaker: { exec: jest.Mock };
  let mockEmailConfig: { getDecryptedConfig: jest.Mock };
  let mockCacheBus: { subscribe: jest.Mock };
  let mockEmailDomain: { getVerified: jest.Mock };
  let mockConfigService: { get: jest.Mock };
  let mockMetrics: { recordProviderError: jest.Mock };

  beforeEach(async () => {
    mockCircuitBreaker = { exec: jest.fn() };
    mockEmailConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(null) };
    mockCacheBus = { subscribe: jest.fn() };
    mockEmailDomain = { getVerified: jest.fn().mockResolvedValue(null) };
    mockConfigService = { get: jest.fn().mockReturnValue(undefined) };
    mockMetrics = { recordProviderError: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResendEmailProvider,
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
        { provide: EmailConfigService, useValue: mockEmailConfig },
        { provide: CommsCacheBusService, useValue: mockCacheBus },
        { provide: EmailDomainService, useValue: mockEmailDomain },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CommsMetricsService, useValue: mockMetrics },
      ],
    }).compile();

    provider = module.get<ResendEmailProvider>(ResendEmailProvider);
    provider.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('isConfiguredForTenant', () => {
    it('returns true when tenant config is enabled', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({ is_enabled: true });
      expect(await provider.isConfiguredForTenant(TENANT_ID)).toBe(true);
    });

    it('returns false when no tenant config', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue(null);
      expect(await provider.isConfiguredForTenant(TENANT_ID)).toBe(false);
    });

    it('returns false when tenant config is disabled', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({ is_enabled: false });
      expect(await provider.isConfiguredForTenant(TENANT_ID)).toBe(false);
    });
  });

  describe('send', () => {
    it('returns skipped:channel_not_configured when tenant has no config', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue(null);
      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p/>',
      });
      expect(result).toEqual({ skipped: true, reason: 'channel_not_configured' });
      expect(mockCircuitBreaker.exec).not.toHaveBeenCalled();
    });

    it('returns skipped:channel_disabled when config is disabled', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: false,
        resend_api_key: 're_x',
        from_email: 'a@b.c',
        from_name: null,
        reply_to_email: null,
      });
      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p/>',
      });
      expect(result).toEqual({ skipped: true, reason: 'channel_disabled' });
      expect(mockCircuitBreaker.exec).not.toHaveBeenCalled();
    });

    it('returns skipped:sender_domain_unverified when domain is not verified', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        resend_api_key: 're_tenant',
        from_email: 'noreply@school.edu',
        from_name: null,
        reply_to_email: null,
      });
      mockEmailDomain.getVerified.mockResolvedValue(null);
      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p/>',
      });
      expect(result).toEqual({ skipped: true, reason: 'sender_domain_unverified' });
      expect(mockEmailDomain.getVerified).toHaveBeenCalledWith(TENANT_ID, 'school.edu');
      expect(mockCircuitBreaker.exec).not.toHaveBeenCalled();
    });

    it('returns skipped:invalid_from_email when from_email has no @', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        resend_api_key: 're_tenant',
        from_email: 'not-an-email',
        from_name: null,
        reply_to_email: null,
      });
      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p/>',
      });
      expect(result).toEqual({ skipped: true, reason: 'invalid_from_email' });
      expect(mockEmailDomain.getVerified).not.toHaveBeenCalled();
    });

    it('bypasses domain check when COMMS_BYPASS_DOMAIN_VERIFICATION_FOR_DEV=true', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        resend_api_key: 're_tenant',
        from_email: 'noreply@school.edu',
        from_name: null,
        reply_to_email: null,
      });
      mockConfigService.get.mockReturnValue('true');
      mockEmailDomain.getVerified.mockResolvedValue(null);
      mockCircuitBreaker.exec.mockResolvedValue({ data: { id: 'msg_dev' }, error: null });

      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p/>',
      });
      expect(result).toEqual({ messageId: 'msg_dev' });
      expect(mockEmailDomain.getVerified).not.toHaveBeenCalled();
    });

    it('proceeds with send when sender domain IS verified', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        resend_api_key: 're_tenant',
        from_email: 'noreply@school.edu',
        from_name: null,
        reply_to_email: null,
      });
      mockEmailDomain.getVerified.mockResolvedValue({
        id: 'd1',
        domain: 'school.edu',
        status: 'verified',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ data: { id: 'msg_1' }, error: null });

      const result = await provider.send(TENANT_ID, {
        to: 'p@x.com',
        subject: 'S',
        html: '<p/>',
      });
      expect(result).toEqual({ messageId: 'msg_1' });
    });

    it('throws when Resend returns an error', async () => {
      mockEmailConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        resend_api_key: 're_x',
        from_email: 'a@b.c',
        from_name: null,
        reply_to_email: null,
      });
      mockEmailDomain.getVerified.mockResolvedValue({ id: 'd', domain: 'b.c', status: 'verified' });
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
  });
});
