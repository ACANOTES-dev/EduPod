/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
  }),
}));

import { PrismaService } from '../prisma/prisma.service';

import { COMMS_CACHE_BUS, type CommsCacheBus } from './comms-cache-bus.stub';
import { EncryptionService } from './encryption.service';
import { SmsConfigService } from './sms-config.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONFIG_ID = '44444444-4444-4444-8444-444444444444';

const mockDbRow = {
  id: CONFIG_ID,
  tenant_id: TENANT_ID,
  twilio_account_sid_encrypted: 'iv:tag:cipher_sid',
  twilio_auth_token_encrypted: 'iv:tag:cipher_token',
  twilio_from_number: '+14155551234',
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
  twilio_account_sid: 'ACtestSIDLAST',
  twilio_auth_token: 'auth_tokenTOKN',
  twilio_from_number: '+14155551234',
  webhook_secret: 'whsec_smsWEBH',
};

describe('SmsConfigService', () => {
  let service: SmsConfigService;
  let mockPrisma: {
    tenantSmsConfig: {
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
      tenantSmsConfig: {
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
        SmsConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: COMMS_CACHE_BUS, useValue: mockCacheBus },
      ],
    }).compile();

    service = module.get<SmsConfigService>(SmsConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  it('getConfig — masks both SID + token + webhook, never plaintext', async () => {
    mockPrisma.tenantSmsConfig.findUnique.mockResolvedValue(mockDbRow);
    mockEncryption.decrypt.mockImplementation((cipher: string) => {
      if (cipher === 'iv:tag:cipher_sid') return 'AC_known_lastABCD';
      if (cipher === 'iv:tag:cipher_token') return 'auth_known_lastEFGH';
      if (cipher === 'iv:tag:cipher_webhook') return 'whsec_known_lastIJKL';
      throw new Error(`unexpected ciphertext: ${cipher}`);
    });
    mockEncryption.mask.mockImplementation((val: string) => `••••${val.slice(-4)}`);

    const result = await service.getConfig(TENANT_ID);

    expect(result.twilio_account_sid_mask).toBe('••••ABCD');
    expect(result.twilio_auth_token_mask).toBe('••••EFGH');
    expect(result.webhook_secret_mask).toBe('••••IJKL');
    expect(result.twilio_from_number).toBe('+14155551234');
    expect(JSON.stringify(result)).not.toContain('AC_known_lastABCD');
    expect(JSON.stringify(result)).not.toContain('auth_known_lastEFGH');
  });

  it('getConfig — throws SMS_CONFIG_NOT_FOUND when no row', async () => {
    mockPrisma.tenantSmsConfig.findUnique.mockResolvedValue(null);
    await expect(service.getConfig(TENANT_ID)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SMS_CONFIG_NOT_FOUND' }),
    });
  });

  it('upsertConfig — encrypts SID, token + webhook; publishes cache-bus with "sms"', async () => {
    mockEncryption.encrypt.mockImplementation((val: string) => ({
      encrypted: `iv:tag:enc_${val}`,
      keyRef: 'v1',
    }));
    mockEncryption.mask.mockImplementation((val: string) => `••••${val.slice(-4)}`);
    mockPrisma.tenantSmsConfig.upsert.mockResolvedValue(mockDbRow);

    const result = await service.upsertConfig(TENANT_ID, USER_ID, validDto);

    expect(mockEncryption.encrypt).toHaveBeenCalledWith('ACtestSIDLAST');
    expect(mockEncryption.encrypt).toHaveBeenCalledWith('auth_tokenTOKN');
    expect(mockEncryption.encrypt).toHaveBeenCalledWith('whsec_smsWEBH');
    expect(mockCacheBus.publishConfigChanged).toHaveBeenCalledWith(TENANT_ID, 'sms');
    expect(result.twilio_account_sid_mask).toBe('••••LAST');
  });

  it('deleteConfig — publishes cache-bus, returns id', async () => {
    mockPrisma.tenantSmsConfig.findUnique.mockResolvedValue(mockDbRow);
    mockPrisma.tenantSmsConfig.delete.mockResolvedValue(mockDbRow);
    const result = await service.deleteConfig(TENANT_ID, USER_ID);
    expect(result.id).toBe(CONFIG_ID);
    expect(mockCacheBus.publishConfigChanged).toHaveBeenCalledWith(TENANT_ID, 'sms');
  });

  it('verifyConfig — stub throws SMS_VERIFY_NOT_IMPLEMENTED', async () => {
    await expect(service.verifyConfig(TENANT_ID, '+14155551234')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'SMS_VERIFY_NOT_IMPLEMENTED' }),
    });
  });

  it('getDecryptedConfig — null when missing; full plaintext when present', async () => {
    mockPrisma.tenantSmsConfig.findUnique.mockResolvedValueOnce(null);
    expect(await service.getDecryptedConfig(TENANT_ID)).toBeNull();

    mockPrisma.tenantSmsConfig.findUnique.mockResolvedValueOnce(mockDbRow);
    mockEncryption.decrypt.mockImplementation((cipher: string) => {
      if (cipher === 'iv:tag:cipher_sid') return 'AC_plain_sid';
      if (cipher === 'iv:tag:cipher_token') return 'auth_plain_token';
      if (cipher === 'iv:tag:cipher_webhook') return 'webhook_plain';
      throw new Error('unexpected');
    });
    const decrypted = await service.getDecryptedConfig(TENANT_ID);
    expect(decrypted!.twilio_account_sid).toBe('AC_plain_sid');
    expect(decrypted!.twilio_auth_token).toBe('auth_plain_token');
    expect(decrypted!.webhook_secret).toBe('webhook_plain');
  });
});
