/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  }),
}));

import { PrismaService } from '../prisma/prisma.service';

import { COMMS_CACHE_BUS, type CommsCacheBus } from './comms-cache-bus.stub';
import { EncryptionService } from './encryption.service';
import { WhatsAppConfigService } from './whatsapp-config.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONFIG_ID = '55555555-5555-4555-8555-555555555555';

const mockDbRow = {
  id: CONFIG_ID,
  tenant_id: TENANT_ID,
  twilio_account_sid_encrypted: 'iv:tag:cipher_sid',
  twilio_auth_token_encrypted: 'iv:tag:cipher_token',
  twilio_whatsapp_from_number: '+14155551111',
  business_profile_id: 'WB_profile_123' as string | null,
  webhook_secret_encrypted: 'iv:tag:cipher_webhook' as string | null,
  encryption_key_ref: 'v1',
  key_last_rotated_at: new Date('2026-04-27'),
  is_enabled: true,
  last_verified_at: null as Date | null,
  created_by_user_id: USER_ID,
  created_at: new Date('2026-04-27'),
  updated_at: new Date('2026-04-27'),
};

const validDto = {
  twilio_account_sid: 'ACwhatsLAST',
  twilio_auth_token: 'auth_waTOKN',
  twilio_whatsapp_from_number: '+14155551111',
  business_profile_id: 'WB_test_123',
  webhook_secret: 'whsec_waWEBH',
};

describe('WhatsAppConfigService', () => {
  let service: WhatsAppConfigService;
  let mockPrisma: {
    tenantWhatsAppConfig: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };
  let mockEncryption: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
    mask: jest.Mock;
  };
  let mockCacheBus: CommsCacheBus;

  beforeEach(async () => {
    mockPrisma = {
      tenantWhatsAppConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };
    mockEncryption = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      mask: jest.fn(),
    };
    mockCacheBus = {
      publishConfigChanged: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: COMMS_CACHE_BUS, useValue: mockCacheBus },
      ],
    }).compile();

    service = module.get<WhatsAppConfigService>(WhatsAppConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  it('getConfig — masks SID + token + webhook; preserves plaintext sender + business profile', async () => {
    mockPrisma.tenantWhatsAppConfig.findUnique.mockResolvedValue(mockDbRow);
    mockEncryption.decrypt.mockImplementation((cipher: string) => {
      if (cipher === 'iv:tag:cipher_sid') return 'AC_known_waABCD';
      if (cipher === 'iv:tag:cipher_token') return 'auth_known_waEFGH';
      if (cipher === 'iv:tag:cipher_webhook') return 'whsec_known_waIJKL';
      throw new Error('unexpected');
    });
    mockEncryption.mask.mockImplementation((val: string) => `••••${val.slice(-4)}`);

    const result = await service.getConfig(TENANT_ID);

    expect(result.twilio_account_sid_mask).toBe('••••ABCD');
    expect(result.twilio_auth_token_mask).toBe('••••EFGH');
    expect(result.webhook_secret_mask).toBe('••••IJKL');
    expect(result.twilio_whatsapp_from_number).toBe('+14155551111');
    expect(result.business_profile_id).toBe('WB_profile_123');
    expect(JSON.stringify(result)).not.toContain('AC_known_waABCD');
  });

  it('getConfig — throws WHATSAPP_CONFIG_NOT_FOUND when no row', async () => {
    mockPrisma.tenantWhatsAppConfig.findUnique.mockResolvedValue(null);
    await expect(service.getConfig(TENANT_ID)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getConfig(TENANT_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WHATSAPP_CONFIG_NOT_FOUND' }),
    });
  });

  it('upsertConfig — encrypts secrets, persists business_profile_id plaintext, publishes cache-bus with "whatsapp"', async () => {
    mockEncryption.encrypt.mockImplementation((val: string) => ({
      encrypted: `iv:tag:enc_${val}`,
      keyRef: 'v1',
    }));
    mockEncryption.mask.mockImplementation((val: string) => `••••${val.slice(-4)}`);
    mockPrisma.tenantWhatsAppConfig.upsert.mockResolvedValue(mockDbRow);

    const result = await service.upsertConfig(TENANT_ID, USER_ID, validDto);

    expect(mockEncryption.encrypt).toHaveBeenCalledWith('ACwhatsLAST');
    expect(mockEncryption.encrypt).toHaveBeenCalledWith('auth_waTOKN');
    expect(mockEncryption.encrypt).toHaveBeenCalledWith('whsec_waWEBH');
    expect(mockPrisma.tenantWhatsAppConfig.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          business_profile_id: 'WB_test_123',
          twilio_whatsapp_from_number: '+14155551111',
        }),
      }),
    );
    expect(mockCacheBus.publishConfigChanged).toHaveBeenCalledWith(TENANT_ID, 'whatsapp');
    expect(result.twilio_account_sid_mask).toBe('••••LAST');
    expect(result.business_profile_id).toBe('WB_test_123');
  });

  it('deleteConfig — returns id and publishes cache-bus event', async () => {
    mockPrisma.tenantWhatsAppConfig.findUnique.mockResolvedValue(mockDbRow);
    mockPrisma.tenantWhatsAppConfig.delete.mockResolvedValue(mockDbRow);
    const result = await service.deleteConfig(TENANT_ID, USER_ID);
    expect(result.id).toBe(CONFIG_ID);
    expect(mockCacheBus.publishConfigChanged).toHaveBeenCalledWith(TENANT_ID, 'whatsapp');
  });

  it('verifyConfig — stub throws WHATSAPP_VERIFY_NOT_IMPLEMENTED', async () => {
    await expect(
      service.verifyConfig(TENANT_ID, '+14155551111', 'test_template'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'WHATSAPP_VERIFY_NOT_IMPLEMENTED' }),
    });
  });

  it('getDecryptedConfig — null when missing; plaintext + business_profile_id when present', async () => {
    mockPrisma.tenantWhatsAppConfig.findUnique.mockResolvedValueOnce(null);
    expect(await service.getDecryptedConfig(TENANT_ID)).toBeNull();

    mockPrisma.tenantWhatsAppConfig.findUnique.mockResolvedValueOnce(mockDbRow);
    mockEncryption.decrypt.mockImplementation((cipher: string) => {
      if (cipher === 'iv:tag:cipher_sid') return 'AC_plain';
      if (cipher === 'iv:tag:cipher_token') return 'auth_plain';
      if (cipher === 'iv:tag:cipher_webhook') return 'webhook_plain';
      throw new Error('unexpected');
    });
    const decrypted = await service.getDecryptedConfig(TENANT_ID);
    expect(decrypted!.twilio_account_sid).toBe('AC_plain');
    expect(decrypted!.business_profile_id).toBe('WB_profile_123');
  });
});
