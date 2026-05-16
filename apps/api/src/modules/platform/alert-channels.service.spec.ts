import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import type { CreateAlertChannelDto } from '@school/shared';

import { EncryptionService } from '../configuration/encryption.service';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { AlertChannelsService } from './alert-channels.service';
import { ChannelDispatchService } from './channel-dispatch.service';

const CHANNEL_ID = '33333333-3333-4333-8333-333333333333';

const EMAIL_CHANNEL = {
  id: CHANNEL_ID,
  name: 'Ops email',
  type: 'email',
  config: { recipients: ['ops@example.com'] },
  is_enabled: true,
  created_at: new Date('2026-05-16T10:00:00.000Z'),
  updated_at: new Date('2026-05-16T10:00:00.000Z'),
};

const TELEGRAM_CHANNEL = {
  ...EMAIL_CHANNEL,
  name: 'Ops Telegram',
  type: 'telegram',
  config: {
    bot_token_encrypted: 'iv:tag:cipher',
    bot_token_key_ref: 'v1',
    bot_token_mask: '****OKEN',
    chat_id: '-100123',
  },
};

function buildMockPrisma() {
  return {
    platformAlertChannel: {
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('AlertChannelsService', () => {
  let service: AlertChannelsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockDispatch: { sendTestAlert: jest.Mock };
  let mockEncryption: { encrypt: jest.Mock; mask: jest.Mock };
  let mockAudit: { log: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockDispatch = {
      sendTestAlert: jest.fn().mockResolvedValue({ success: true, message: 'ok' }),
    };
    mockEncryption = {
      encrypt: jest.fn().mockReturnValue({ encrypted: 'iv:tag:cipher', keyRef: 'v1' }),
      mask: jest.fn().mockReturnValue('****OKEN'),
    };
    mockAudit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertChannelsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ChannelDispatchService, useValue: mockDispatch },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: PlatformAuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<AlertChannelsService>(AlertChannelsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('lists channels with sensitive config masked', async () => {
    mockPrisma.platformAlertChannel.findMany.mockResolvedValueOnce([TELEGRAM_CHANNEL]);

    await expect(service.listChannels()).resolves.toEqual([
      expect.objectContaining({
        config: { bot_token_mask: '****OKEN', chat_id: '-100123' },
      }),
    ]);
  });

  it('creates an email channel with valid recipients', async () => {
    const dto: CreateAlertChannelDto = {
      config: { recipients: ['ops@example.com'] },
      is_enabled: true,
      name: 'Ops email',
      type: 'email',
    };
    mockPrisma.platformAlertChannel.create.mockResolvedValueOnce(EMAIL_CHANNEL);

    await expect(service.createChannel(dto)).resolves.toEqual(EMAIL_CHANNEL);
    expect(mockPrisma.platformAlertChannel.create).toHaveBeenCalledWith({
      data: {
        config: dto.config,
        is_enabled: true,
        name: 'Ops email',
        type: 'email',
      },
    });
  });

  it('encrypts telegram bot tokens before storage', async () => {
    mockPrisma.platformAlertChannel.create.mockResolvedValueOnce(TELEGRAM_CHANNEL);

    await service.createChannel({
      config: { bot_token: '123:SECRET_TOKEN', chat_id: '-100123' },
      is_enabled: true,
      name: 'Ops Telegram',
      type: 'telegram',
    });

    expect(mockEncryption.encrypt).toHaveBeenCalledWith('123:SECRET_TOKEN');
    expect(mockPrisma.platformAlertChannel.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        config: {
          bot_token_encrypted: 'iv:tag:cipher',
          bot_token_key_ref: 'v1',
          bot_token_mask: '****OKEN',
          chat_id: '-100123',
        },
      }),
    });
  });

  it('rejects invalid channel config', async () => {
    await expect(
      service.createChannel({
        config: { recipients: [] },
        is_enabled: true,
        name: 'Bad email',
        type: 'email',
      } as CreateAlertChannelDto),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates channel config and preserves telegram token when omitted', async () => {
    mockPrisma.platformAlertChannel.findUnique.mockResolvedValueOnce(TELEGRAM_CHANNEL);
    mockPrisma.platformAlertChannel.update.mockResolvedValueOnce({
      ...TELEGRAM_CHANNEL,
      config: { ...TELEGRAM_CHANNEL.config, chat_id: '-100999' },
    });

    await expect(
      service.updateChannel(CHANNEL_ID, { config: { chat_id: '-100999' } }),
    ).resolves.toMatchObject({
      config: { bot_token_mask: '****OKEN', chat_id: '-100999' },
    });
  });

  it('throws NotFoundException for missing updates and deletes', async () => {
    mockPrisma.platformAlertChannel.findUnique.mockResolvedValue(null);

    await expect(service.updateChannel(CHANNEL_ID, { name: 'Missing' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.deleteChannel(CHANNEL_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deletes an existing channel', async () => {
    mockPrisma.platformAlertChannel.findUnique.mockResolvedValueOnce(EMAIL_CHANNEL);
    mockPrisma.platformAlertChannel.delete.mockResolvedValueOnce(EMAIL_CHANNEL);

    await expect(service.deleteChannel(CHANNEL_ID)).resolves.toBeUndefined();
    expect(mockPrisma.platformAlertChannel.delete).toHaveBeenCalledWith({
      where: { id: CHANNEL_ID },
    });
  });

  it('sends a test alert through the dispatch service', async () => {
    mockPrisma.platformAlertChannel.findUnique.mockResolvedValueOnce(EMAIL_CHANNEL);

    await expect(service.testChannel(CHANNEL_ID)).resolves.toEqual({
      success: true,
      message: 'ok',
    });
    expect(mockDispatch.sendTestAlert).toHaveBeenCalledWith(EMAIL_CHANNEL);
  });
});
