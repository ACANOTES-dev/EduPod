import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { WhatsAppAlertDispatcher } from './whatsapp-alert.dispatcher';

describe('WhatsAppAlertDispatcher', () => {
  let dispatcher: WhatsAppAlertDispatcher;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppAlertDispatcher,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                TWILIO_ACCOUNT_SID: 'AC123',
                TWILIO_AUTH_TOKEN: 'token',
                TWILIO_WHATSAPP_FROM: 'whatsapp:+14155550000',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    dispatcher = module.get<WhatsAppAlertDispatcher>(WhatsAppAlertDispatcher);
  });

  afterEach(() => jest.clearAllMocks());

  it('calls Twilio API with form-encoded WhatsApp payload', async () => {
    await dispatcher.send(
      { to_number: '+353861234567' },
      { message: 'Alert fired', metric_value: 2, rule_name: 'Rule', severity: 'warning' },
    );

    const request = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request[0]).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(request[1].method).toBe('POST');
    expect(String(request[1].body)).toContain('To=whatsapp%3A%2B353861234567');
  });

  it('throws when Twilio credentials are missing', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppAlertDispatcher,
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
      ],
    }).compile();
    const missingConfigDispatcher = module.get<WhatsAppAlertDispatcher>(WhatsAppAlertDispatcher);

    await expect(
      missingConfigDispatcher.send(
        { to_number: '+353861234567' },
        { message: 'Alert fired', metric_value: 2, rule_name: 'Rule', severity: 'warning' },
      ),
    ).rejects.toThrow('Twilio WhatsApp credentials are not configured');
  });

  it('throws on non-OK responses', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });

    await expect(
      dispatcher.send(
        { to_number: '+353861234567' },
        { message: 'Alert fired', metric_value: 2, rule_name: 'Rule', severity: 'warning' },
      ),
    ).rejects.toThrow('Twilio API error 401');
  });
});
