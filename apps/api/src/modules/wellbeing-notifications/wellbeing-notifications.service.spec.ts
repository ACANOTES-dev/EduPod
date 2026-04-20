import { NotImplementedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { WellbeingEmailProvider } from './providers/email.provider';
import { WellbeingInAppProvider } from './providers/in-app.provider';
import { WellbeingSmsProvider } from './providers/sms.provider';
import type { WellbeingDispatchInput } from './providers/types';
import { WellbeingWhatsappProvider } from './providers/whatsapp.provider';
import { WellbeingNotificationsService } from './wellbeing-notifications.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function dispatchInput(overrides: Partial<WellbeingDispatchInput> = {}): WellbeingDispatchInput {
  return {
    tenantId: TENANT_ID,
    event: 'incident.logged',
    recipients: [
      { user_id: USER_A, email: 'a@example.com' },
      { user_id: USER_B, phone: '+15551234567' },
    ],
    title: 'Incident logged for Ahmed',
    body: 'Disruption in Year 5 Maths.',
    href: '/behaviour/incidents/incident-1',
    severity: 'warning',
    source_entity_type: 'behaviour_incident',
    source_entity_id: 'incident-1',
    ...overrides,
  };
}

describe('WellbeingNotificationsService', () => {
  let service: WellbeingNotificationsService;
  let mockPrisma: { tenantNotificationPreferences: { findUnique: jest.Mock } };
  let inApp: jest.Mocked<WellbeingInAppProvider>;
  let email: jest.Mocked<WellbeingEmailProvider>;
  let sms: jest.Mocked<WellbeingSmsProvider>;
  let whatsapp: jest.Mocked<WellbeingWhatsappProvider>;

  beforeEach(async () => {
    mockPrisma = {
      tenantNotificationPreferences: { findUnique: jest.fn() },
    };
    inApp = { send: jest.fn() } as unknown as jest.Mocked<WellbeingInAppProvider>;
    email = { send: jest.fn() } as unknown as jest.Mocked<WellbeingEmailProvider>;
    sms = { send: jest.fn() } as unknown as jest.Mocked<WellbeingSmsProvider>;
    whatsapp = { send: jest.fn() } as unknown as jest.Mocked<WellbeingWhatsappProvider>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WellbeingNotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WellbeingInAppProvider, useValue: inApp },
        { provide: WellbeingEmailProvider, useValue: email },
        { provide: WellbeingSmsProvider, useValue: sms },
        { provide: WellbeingWhatsappProvider, useValue: whatsapp },
      ],
    }).compile();

    service = module.get(WellbeingNotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('dispatch', () => {
    it('always writes to the in-app channel regardless of preferences', async () => {
      mockPrisma.tenantNotificationPreferences.findUnique.mockResolvedValue(null);
      inApp.send.mockResolvedValue(undefined);

      await service.dispatch(dispatchInput());

      expect(inApp.send).toHaveBeenCalledTimes(1);
      expect(email.send).not.toHaveBeenCalled();
      expect(sms.send).not.toHaveBeenCalled();
      expect(whatsapp.send).not.toHaveBeenCalled();
    });

    it('skips dispatch entirely when there are no recipients', async () => {
      await service.dispatch(dispatchInput({ recipients: [] }));

      expect(inApp.send).not.toHaveBeenCalled();
      expect(mockPrisma.tenantNotificationPreferences.findUnique).not.toHaveBeenCalled();
    });

    it('rethrows when in-app delivery fails', async () => {
      const dbErr = new Error('write failed');
      inApp.send.mockRejectedValue(dbErr);

      await expect(service.dispatch(dispatchInput())).rejects.toBe(dbErr);
      expect(email.send).not.toHaveBeenCalled();
    });

    it('fans out to email/sms/whatsapp when defaults enable them', async () => {
      mockPrisma.tenantNotificationPreferences.findUnique.mockResolvedValue({
        wellbeing_channels: {
          defaults: { email: true, sms: true, whatsapp: true },
          overrides: {},
        },
      });
      inApp.send.mockResolvedValue(undefined);
      email.send.mockResolvedValue(undefined);
      sms.send.mockResolvedValue(undefined);
      whatsapp.send.mockResolvedValue(undefined);

      await service.dispatch(dispatchInput());

      expect(email.send).toHaveBeenCalledTimes(1);
      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(whatsapp.send).toHaveBeenCalledTimes(1);
    });

    it('per-event override beats the tenant default', async () => {
      mockPrisma.tenantNotificationPreferences.findUnique.mockResolvedValue({
        wellbeing_channels: {
          defaults: { email: true, sms: false, whatsapp: false },
          overrides: { 'incident.logged': { email: false, sms: true } },
        },
      });
      inApp.send.mockResolvedValue(undefined);
      sms.send.mockResolvedValue(undefined);

      await service.dispatch(dispatchInput({ event: 'incident.logged' }));

      expect(email.send).not.toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalledTimes(1);
      expect(whatsapp.send).not.toHaveBeenCalled();
    });

    it('swallows PROVIDER_NOT_WIRED so stub providers do not break dispatch', async () => {
      mockPrisma.tenantNotificationPreferences.findUnique.mockResolvedValue({
        wellbeing_channels: {
          defaults: { email: true, sms: false, whatsapp: false },
          overrides: {},
        },
      });
      inApp.send.mockResolvedValue(undefined);
      email.send.mockRejectedValue(
        new NotImplementedException({
          code: 'PROVIDER_NOT_WIRED',
          message: 'Email provider for wellbeing channel is not yet wired',
        }),
      );

      await expect(service.dispatch(dispatchInput())).resolves.toBeUndefined();
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('isolates real provider failures per channel and never blocks in-app', async () => {
      mockPrisma.tenantNotificationPreferences.findUnique.mockResolvedValue({
        wellbeing_channels: {
          defaults: { email: true, sms: true, whatsapp: false },
          overrides: {},
        },
      });
      inApp.send.mockResolvedValue(undefined);
      email.send.mockRejectedValue(new Error('SMTP down'));
      sms.send.mockResolvedValue(undefined);

      await expect(service.dispatch(dispatchInput())).resolves.toBeUndefined();
      expect(email.send).toHaveBeenCalled();
      expect(sms.send).toHaveBeenCalled();
    });
  });

  describe('getEventChannels', () => {
    it('returns all-false defaults when no preferences row exists', async () => {
      mockPrisma.tenantNotificationPreferences.findUnique.mockResolvedValue(null);
      const result = await service.getEventChannels(TENANT_ID, 'incident.logged');
      expect(result).toEqual({ email: false, sms: false, whatsapp: false });
    });

    it('falls back to safe defaults when JSONB is malformed', async () => {
      mockPrisma.tenantNotificationPreferences.findUnique.mockResolvedValue({
        wellbeing_channels: { defaults: 'not-an-object' },
      });
      const result = await service.getEventChannels(TENANT_ID, 'incident.logged');
      expect(result).toEqual({ email: false, sms: false, whatsapp: false });
    });

    it('merges per-event override into defaults', async () => {
      mockPrisma.tenantNotificationPreferences.findUnique.mockResolvedValue({
        wellbeing_channels: {
          defaults: { email: false, sms: true, whatsapp: false },
          overrides: { 'concern.raised': { email: true } },
        },
      });
      const result = await service.getEventChannels(TENANT_ID, 'concern.raised');
      expect(result).toEqual({ email: true, sms: true, whatsapp: false });
    });
  });
});
