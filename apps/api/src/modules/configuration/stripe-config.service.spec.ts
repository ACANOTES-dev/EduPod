import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { EncryptionService } from './encryption.service';
import { StripeConfigService } from './stripe-config.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const CONFIG_ID = 'config-uuid-1';

const mockDbConfig = {
  id: CONFIG_ID,
  tenant_id: TENANT_ID,
  stripe_secret_key_encrypted: 'iv:tag:cipher_secret',
  stripe_publishable_key: 'pk_test_abc123',
  stripe_webhook_secret_encrypted: 'iv:tag:cipher_webhook',
  encryption_key_ref: 'local',
  key_last_rotated_at: null,
  created_by_user_id: USER_ID,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

describe('StripeConfigService', () => {
  let service: StripeConfigService;
  let mockPrisma: {
    tenantStripeConfig: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let mockEncryption: {
    encrypt: jest.Mock;
    decrypt: jest.Mock;
    mask: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantStripeConfig: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    mockEncryption = {
      encrypt: jest.fn(),
      decrypt: jest.fn(),
      mask: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeConfigService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryption },
      ],
    }).compile();

    service = module.get<StripeConfigService>(StripeConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getConfig', () => {
    it('should return masked config when found', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue(mockDbConfig);
      mockEncryption.decrypt.mockImplementation((encrypted: string) => {
        if (encrypted === 'iv:tag:cipher_secret') return 'sk_test_abcdef';
        return 'whsec_xyz123';
      });
      mockEncryption.mask.mockImplementation((val: string) => `****${val.slice(-4)}`);

      const result = await service.getConfig(TENANT_ID);

      expect(mockPrisma.tenantStripeConfig.findUnique).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
      expect(mockEncryption.decrypt).toHaveBeenCalledTimes(2);
      expect(result.stripe_secret_key_masked).toBe('****cdef');
      expect(result.stripe_webhook_secret_masked).toBe('****z123');
      expect(result.stripe_publishable_key).toBe('pk_test_abc123');
    });

    it('should throw NotFoundException when config not found', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue(null);

      await expect(service.getConfig(TENANT_ID)).rejects.toThrow(NotFoundException);
    });

    it('should pass encryption_key_ref to decrypt', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue(mockDbConfig);
      mockEncryption.decrypt.mockReturnValue('sk_test_1234');
      mockEncryption.mask.mockReturnValue('****1234');

      await service.getConfig(TENANT_ID);

      expect(mockEncryption.decrypt).toHaveBeenCalledWith('iv:tag:cipher_secret', 'local');
      expect(mockEncryption.decrypt).toHaveBeenCalledWith('iv:tag:cipher_webhook', 'local');
    });
  });

  describe('upsertConfig', () => {
    const dto = {
      stripe_secret_key: 'sk_test_newkey1234',
      stripe_publishable_key: 'pk_test_newpub',
      stripe_webhook_secret: 'whsec_newsecret',
    };

    it('should encrypt keys and upsert config', async () => {
      mockEncryption.encrypt.mockImplementation((val: string) => ({
        encrypted: `enc_${val}`,
        keyRef: 'local',
      }));
      mockEncryption.mask.mockImplementation((val: string) => `****${val.slice(-4)}`);
      mockPrisma.tenantStripeConfig.upsert.mockResolvedValue({
        ...mockDbConfig,
        stripe_secret_key_encrypted: 'enc_sk_test_newkey1234',
        stripe_publishable_key: 'pk_test_newpub',
        stripe_webhook_secret_encrypted: 'enc_whsec_newsecret',
        key_last_rotated_at: new Date(),
      });

      const result = await service.upsertConfig(TENANT_ID, USER_ID, dto);

      expect(mockEncryption.encrypt).toHaveBeenCalledWith('sk_test_newkey1234');
      expect(mockEncryption.encrypt).toHaveBeenCalledWith('whsec_newsecret');
      expect(mockPrisma.tenantStripeConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID },
          create: expect.objectContaining({
            tenant_id: TENANT_ID,
            created_by_user_id: USER_ID,
          }),
        }),
      );
      expect(result.stripe_secret_key_masked).toBe('****1234');
      expect(result.stripe_publishable_key).toBe('pk_test_newpub');
    });

    it('should return masked webhook secret after upsert', async () => {
      mockEncryption.encrypt.mockReturnValue({ encrypted: 'enc', keyRef: 'local' });
      mockEncryption.mask.mockImplementation((val: string) => `****${val.slice(-4)}`);
      mockPrisma.tenantStripeConfig.upsert.mockResolvedValue(mockDbConfig);

      const result = await service.upsertConfig(TENANT_ID, USER_ID, dto);

      expect(result.stripe_webhook_secret_masked).toBe('****cret');
    });
  });
});
