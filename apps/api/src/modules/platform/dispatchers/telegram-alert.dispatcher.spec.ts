import { Test, TestingModule } from '@nestjs/testing';

import { EncryptionService } from '../../configuration/encryption.service';

import { TelegramAlertDispatcher } from './telegram-alert.dispatcher';

describe('TelegramAlertDispatcher', () => {
  let dispatcher: TelegramAlertDispatcher;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramAlertDispatcher,
        {
          provide: EncryptionService,
          useValue: { decrypt: jest.fn().mockReturnValue('123:TOKEN') },
        },
      ],
    }).compile();

    dispatcher = module.get<TelegramAlertDispatcher>(TelegramAlertDispatcher);
  });

  afterEach(() => jest.clearAllMocks());

  it('calls Telegram Bot API with MarkdownV2 payload', async () => {
    await dispatcher.send(
      {
        bot_token_encrypted: 'iv:tag:cipher',
        bot_token_key_ref: 'v1',
        bot_token_mask: '****OKEN',
        chat_id: '-100123',
      },
      {
        message: 'Value > threshold',
        metric_value: 20,
        rule_name: 'Queue (depth)',
        severity: 'critical',
      },
    );

    const request = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(request[1].body as string) as { text: string };
    expect(request[0]).toBe('https://api.telegram.org/bot123:TOKEN/sendMessage');
    expect(request[1].method).toBe('POST');
    expect(payload.text).toContain('Queue \\(depth\\)');
  });

  it('throws on non-OK responses', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400 });

    await expect(
      dispatcher.send(
        {
          bot_token_encrypted: 'iv:tag:cipher',
          bot_token_key_ref: 'v1',
          bot_token_mask: '****OKEN',
          chat_id: '-100123',
        },
        { message: 'Alert', metric_value: 1, rule_name: 'Rule', severity: 'info' },
      ),
    ).rejects.toThrow('Telegram API error 400');
  });
});
