import { Test, TestingModule } from '@nestjs/testing';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';
import { WhatsAppConfigService } from '../../configuration/whatsapp-config.service';
import { CommsCacheBusService } from '../comms-cache-bus.service';
import { CommsMetricsService } from '../comms-metrics.service';
import { WhatsAppServiceWindowService } from '../whatsapp-templates/whatsapp-service-window.service';
import { WhatsAppTemplateService } from '../whatsapp-templates/whatsapp-template.service';

import { TwilioWhatsAppProvider } from './twilio-whatsapp.provider';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';

describe('TwilioWhatsAppProvider', () => {
  let provider: TwilioWhatsAppProvider;
  let mockCircuitBreaker: { exec: jest.Mock };
  let mockWhatsAppConfig: { getDecryptedConfig: jest.Mock };
  let mockCacheBus: { subscribe: jest.Mock };
  let mockServiceWindow: { isInsideWindow: jest.Mock };
  let mockTemplates: { getApprovedByKey: jest.Mock };
  let mockMetrics: { recordProviderError: jest.Mock };

  beforeEach(async () => {
    mockCircuitBreaker = { exec: jest.fn() };
    mockWhatsAppConfig = { getDecryptedConfig: jest.fn().mockResolvedValue(null) };
    mockCacheBus = { subscribe: jest.fn() };
    mockServiceWindow = { isInsideWindow: jest.fn().mockResolvedValue(true) };
    mockTemplates = { getApprovedByKey: jest.fn().mockResolvedValue(null) };
    mockMetrics = { recordProviderError: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioWhatsAppProvider,
        { provide: CircuitBreakerRegistry, useValue: mockCircuitBreaker },
        { provide: WhatsAppConfigService, useValue: mockWhatsAppConfig },
        { provide: CommsCacheBusService, useValue: mockCacheBus },
        { provide: WhatsAppServiceWindowService, useValue: mockServiceWindow },
        { provide: WhatsAppTemplateService, useValue: mockTemplates },
        { provide: CommsMetricsService, useValue: mockMetrics },
      ],
    }).compile();

    provider = module.get<TwilioWhatsAppProvider>(TwilioWhatsAppProvider);
    provider.onModuleInit();
  });

  afterEach(() => jest.clearAllMocks());

  describe('send — config gates', () => {
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
  });

  describe('send — inside service window', () => {
    beforeEach(() => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'ACtenant',
        twilio_auth_token: 'tokTenant',
        twilio_whatsapp_from_number: '+14155550000',
      });
      mockServiceWindow.isInsideWindow.mockResolvedValue(true);
    });

    it('sends free-form body when inside window', async () => {
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_wa' });
      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'Hello' });
      expect(result).toEqual({ messageSid: 'SM_wa' });
    });

    it('falls back to template when body empty + template_key provided', async () => {
      mockTemplates.getApprovedByKey.mockResolvedValue({
        twilio_template_sid: 'HX_x',
      });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_tpl' });
      const result = await provider.send(TENANT_ID, {
        to: '+15559876543',
        body: '',
        template_key: 'announce',
        locale: 'en',
        template_variables: { '1': 'Welcome' },
      });
      expect(result).toEqual({ messageSid: 'SM_tpl' });
      expect(mockTemplates.getApprovedByKey).toHaveBeenCalledWith(TENANT_ID, 'announce', 'en');
    });

    it('returns template_not_approved_inside_window when body empty + template not approved', async () => {
      mockTemplates.getApprovedByKey.mockResolvedValue(null);
      const result = await provider.send(TENANT_ID, {
        to: '+15559876543',
        body: '',
        template_key: 'announce',
        locale: 'en',
      });
      expect(result).toEqual({ skipped: true, reason: 'template_not_approved_inside_window' });
    });

    it('returns whatsapp_payload_missing_body_and_template when neither provided', async () => {
      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: '' });
      expect(result).toEqual({
        skipped: true,
        reason: 'whatsapp_payload_missing_body_and_template',
      });
    });
  });

  describe('send — outside service window', () => {
    beforeEach(() => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'ACtenant',
        twilio_auth_token: 'tokTenant',
        twilio_whatsapp_from_number: '+14155550000',
      });
      mockServiceWindow.isInsideWindow.mockResolvedValue(false);
    });

    it('rejects free-form body without template_key', async () => {
      const result = await provider.send(TENANT_ID, { to: '+15559876543', body: 'free-form' });
      expect(result).toEqual({ skipped: true, reason: 'outside_service_window_no_template' });
    });

    it('rejects when template not approved', async () => {
      mockTemplates.getApprovedByKey.mockResolvedValue(null);
      const result = await provider.send(TENANT_ID, {
        to: '+15559876543',
        body: 'x',
        template_key: 'announce',
        locale: 'en',
      });
      expect(result).toEqual({ skipped: true, reason: 'outside_service_window_no_template' });
    });

    it('sends approved template outside window', async () => {
      mockTemplates.getApprovedByKey.mockResolvedValue({ twilio_template_sid: 'HX_outside' });
      mockCircuitBreaker.exec.mockResolvedValue({ sid: 'SM_outside' });
      const result = await provider.send(TENANT_ID, {
        to: '+15559876543',
        body: 'x',
        template_key: 'announce',
        locale: 'ar',
        template_variables: { '1': 'مرحبا' },
      });
      expect(result).toEqual({ messageSid: 'SM_outside' });
      expect(mockTemplates.getApprovedByKey).toHaveBeenCalledWith(TENANT_ID, 'announce', 'ar');
    });

    it('does not double-prefix already-prefixed numbers', async () => {
      mockWhatsAppConfig.getDecryptedConfig.mockResolvedValue({
        is_enabled: true,
        twilio_account_sid: 'AC',
        twilio_auth_token: 'tok',
        twilio_whatsapp_from_number: 'whatsapp:+14155550000',
      });
      mockServiceWindow.isInsideWindow.mockResolvedValue(true);
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
