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
import { EmailConfigService } from './email-config.service';
import { EncryptionService } from './encryption.service';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const CONFIG_ID = '33333333-3333-4333-8333-333333333333';

const mockDbRow = {
  id: CONFIG_ID,
  tenant_id: TENANT_ID,
  resend_api_key_encrypted: 'iv:tag:cipher_apikey',
  from_email: 'sender@school.test',
  from_name: 'School Sender',
  reply_to_email: null as string | null,
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
  resend_api_key: 're_test_abcdLAST',
  from_email: 'sender@school.test',
  from_name: 'School Sender',
  webhook_secret: 'whsec_xyzWEBH',
};

describe('EmailConfigService', () => {
  let service: EmailConfigService;
  let mockPrisma: {
    tenantEmailConfig: {
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
      tenantEmailConfig: {
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
        EmailConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
        { provide: COMMS_CACHE_BUS, useValue: mockCacheBus },
      ],
    }).compile();

    service = module.get<EmailConfigService>(EmailConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getConfig', () => {
    it('throws NotFoundException with EMAIL_CONFIG_NOT_FOUND when no row exists', async () => {
      mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(null);

      await expect(service.getConfig(TENANT_ID)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getConfig(TENANT_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EMAIL_CONFIG_NOT_FOUND' }),
      });
    });

    it('returns masked config and never plaintext', async () => {
      mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(mockDbRow);
      mockEncryption.decrypt.mockImplementation((cipher: string) => {
        if (cipher === 'iv:tag:cipher_apikey') return 're_test_known_lastABCD';
        if (cipher === 'iv:tag:cipher_webhook') return 'whsec_known_lastEFGH';
        throw new Error(`unexpected ciphertext: ${cipher}`);
      });
      mockEncryption.mask.mockImplementation((val: string) => `••••${val.slice(-4)}`);

      const result = await service.getConfig(TENANT_ID);

      expect(result.resend_api_key_mask).toBe('••••ABCD');
      expect(result.webhook_secret_mask).toBe('••••EFGH');
      expect(result.from_email).toBe('sender@school.test');
      expect(result.is_enabled).toBe(true);

      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain('re_test_known_lastABCD');
      expect(serialised).not.toContain('whsec_known_lastEFGH');
      expect(serialised).not.toContain('_encrypted');
    });
  });

  describe('upsertConfig', () => {
    it('encrypts both api key + webhook secret, persists, and returns masked', async () => {
      mockEncryption.encrypt.mockImplementation((val: string) => ({
        encrypted: `iv:tag:enc_${val}`,
        keyRef: 'v1',
      }));
      mockEncryption.mask.mockImplementation((val: string) => `••••${val.slice(-4)}`);
      mockPrisma.tenantEmailConfig.upsert.mockResolvedValue(mockDbRow);

      const result = await service.upsertConfig(TENANT_ID, USER_ID, validDto);

      expect(mockEncryption.encrypt).toHaveBeenCalledWith('re_test_abcdLAST');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('whsec_xyzWEBH');

      expect(mockPrisma.tenantEmailConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          create: expect.objectContaining({
            tenant_id: TENANT_ID,
            from_email: 'sender@school.test',
            created_by_user_id: USER_ID,
            is_enabled: true,
          }),
        }),
      );

      expect(result.resend_api_key_mask).toBe('••••LAST');
      expect(result.webhook_secret_mask).toBe('••••WEBH');
    });

    it('publishes cache-bus event with channel "email"', async () => {
      mockEncryption.encrypt.mockReturnValue({ encrypted: 'iv:tag:enc', keyRef: 'v1' });
      mockEncryption.mask.mockReturnValue('••••LAST');
      mockPrisma.tenantEmailConfig.upsert.mockResolvedValue(mockDbRow);

      await service.upsertConfig(TENANT_ID, USER_ID, validDto);

      expect(mockCacheBus.publishConfigChanged).toHaveBeenCalledWith(TENANT_ID, 'email');
    });
  });

  describe('deleteConfig', () => {
    it('throws NotFound when no row exists', async () => {
      mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(null);
      await expect(service.deleteConfig(TENANT_ID, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockCacheBus.publishConfigChanged).not.toHaveBeenCalled();
    });

    it('deletes existing row and publishes cache-bus event', async () => {
      mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(mockDbRow);
      mockPrisma.tenantEmailConfig.delete.mockResolvedValue(mockDbRow);

      const result = await service.deleteConfig(TENANT_ID, USER_ID);

      expect(mockPrisma.tenantEmailConfig.delete).toHaveBeenCalledWith({
        where: { id: CONFIG_ID },
      });
      expect(result.id).toBe(CONFIG_ID);
      expect(mockCacheBus.publishConfigChanged).toHaveBeenCalledWith(TENANT_ID, 'email');
    });
  });

  describe('getDecryptedConfig', () => {
    it('returns null when no row exists (Impl 04 contract)', async () => {
      mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(null);
      const result = await service.getDecryptedConfig(TENANT_ID);
      expect(result).toBeNull();
    });

    it('returns full plaintext payload when row exists (service-internal only)', async () => {
      mockPrisma.tenantEmailConfig.findUnique.mockResolvedValue(mockDbRow);
      mockEncryption.decrypt.mockImplementation((cipher: string) => {
        if (cipher === 'iv:tag:cipher_apikey') return 're_test_known_lastABCD';
        if (cipher === 'iv:tag:cipher_webhook') return 'whsec_known_lastEFGH';
        throw new Error(`unexpected ciphertext: ${cipher}`);
      });

      const result = await service.getDecryptedConfig(TENANT_ID);

      expect(result).not.toBeNull();
      expect(result!.resend_api_key).toBe('re_test_known_lastABCD');
      expect(result!.webhook_secret).toBe('whsec_known_lastEFGH');
      expect(result!.is_enabled).toBe(true);
    });
  });

  describe('verifyConfig (stub)', () => {
    it('throws EMAIL_VERIFY_NOT_IMPLEMENTED — Impl 09 wires it', async () => {
      await expect(service.verifyConfig(TENANT_ID, 'x@y.test')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'EMAIL_VERIFY_NOT_IMPLEMENTED' }),
      });
    });
  });
});
