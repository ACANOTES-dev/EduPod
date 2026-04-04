import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS } from '../../common/tests/mock-facades';
import { SecurityAuditService } from '../audit-log/security-audit.service';
import { PrismaService } from '../prisma/prisma.service';

import { EncryptionService } from './encryption.service';
import { SettingsService } from './settings.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const MOCK_PRISMA = {};

const MOCK_CONFIG: Record<string, string> = {
  ENCRYPTION_KEY_V1: 'a'.repeat(64), // 32 bytes hex
  ENCRYPTION_CURRENT_VERSION: '1',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract public method names from a class prototype (type-safe, no casts). */
function getPublicMethodNames(proto: object): string[] {
  return Object.getOwnPropertyNames(proto).filter(
    (name) =>
      name !== 'constructor' &&
      typeof Object.getOwnPropertyDescriptor(proto, name)?.value === 'function',
  );
}

// ─── Contract Tests ──────────────────────────────────────────────────────────

describe('ConfigurationModule — contract', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── Module exports ──────────────────────────────────────────────────────

  it('should resolve SettingsService via DI', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SettingsService,
        { provide: PrismaService, useValue: MOCK_PRISMA },
        { provide: SecurityAuditService, useValue: { logSettingsAccess: jest.fn() } },
      ],
    }).compile();

    const service = module.get(SettingsService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(SettingsService);
  });

  it('should resolve EncryptionService via DI', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        EncryptionService,
        { provide: ConfigService, useValue: { get: (key: string) => MOCK_CONFIG[key] } },
      ],
    }).compile();

    const service = module.get(EncryptionService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(EncryptionService);
  });

  // ─── SettingsService public methods ──────────────────────────────────────

  describe('SettingsService', () => {
    const proto = SettingsService.prototype;

    it('should expose getSettings method', () => {
      expect(typeof proto.getSettings).toBe('function');
    });

    it('getSettings should accept (tenantId)', () => {
      expect(proto.getSettings.length).toBeGreaterThanOrEqual(1);
    });

    it('should expose getModuleSettings method', () => {
      expect(typeof proto.getModuleSettings).toBe('function');
    });

    it('getModuleSettings should accept (tenantId, moduleKey)', () => {
      expect(proto.getModuleSettings.length).toBeGreaterThanOrEqual(2);
    });

    it('should expose updateSettings method', () => {
      expect(typeof proto.updateSettings).toBe('function');
    });

    it('updateSettings should accept (tenantId, data)', () => {
      expect(proto.updateSettings.length).toBeGreaterThanOrEqual(2);
    });

    it('should expose updateModuleSettings method', () => {
      expect(typeof proto.updateModuleSettings).toBe('function');
    });

    it('updateModuleSettings should accept (tenantId, moduleKey, data)', () => {
      expect(proto.updateModuleSettings.length).toBeGreaterThanOrEqual(3);
    });

    it('should expose getWarnings method', () => {
      expect(typeof proto.getWarnings).toBe('function');
    });

    it('getWarnings should accept (tenantId, settings)', () => {
      expect(proto.getWarnings.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── EncryptionService public methods ────────────────────────────────────

  describe('EncryptionService', () => {
    const proto = EncryptionService.prototype;

    it('should expose encrypt method', () => {
      expect(typeof proto.encrypt).toBe('function');
    });

    it('encrypt should accept (plaintext)', () => {
      expect(proto.encrypt.length).toBe(1);
    });

    it('should expose decrypt method', () => {
      expect(typeof proto.decrypt).toBe('function');
    });

    it('decrypt should accept (encrypted, keyRef)', () => {
      expect(proto.decrypt.length).toBe(2);
    });

    it('should expose getCurrentVersion method', () => {
      expect(typeof proto.getCurrentVersion).toBe('function');
    });

    it('should expose getKeyRef method', () => {
      expect(typeof proto.getKeyRef).toBe('function');
    });

    it('should expose mask method', () => {
      expect(typeof proto.mask).toBe('function');
    });

    it('mask should accept (value)', () => {
      expect(proto.mask.length).toBe(1);
    });
  });

  // ─── Public API surface guard ───────────────────────────────────────────

  describe('public API surface guard', () => {
    it('SettingsService should have expected public methods', () => {
      const expectedMethods = [
        'getSettings',
        'getModuleSettings',
        'updateSettings',
        'updateModuleSettings',
        'getWarnings',
      ];

      const publicMethods = getPublicMethodNames(SettingsService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });

    it('EncryptionService should have expected public methods', () => {
      const expectedMethods = ['encrypt', 'decrypt', 'getCurrentVersion', 'getKeyRef', 'mask'];

      const publicMethods = getPublicMethodNames(EncryptionService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });
  });
});
