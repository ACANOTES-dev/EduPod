import { EarlyWarningConfigService } from './early-warning-config.service';
import { EarlyWarningTriggerService } from './early-warning-trigger.service';
import { EarlyWarningService } from './early-warning.service';

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
//
// These tests verify the public API surface of the EarlyWarningModule's
// exported services. The module has deep dependency chains (PrismaModule,
// BullMQ queue, signal collectors) so we use prototype-based assertions
// for speed rather than full DI compilation.
// ─────────────────────────────────────────────────────────────────────────────

describe('EarlyWarningModule — contract', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── EarlyWarningService ─────────────────────────────────────────────────

  describe('EarlyWarningService', () => {
    const proto = EarlyWarningService.prototype;

    it('should expose listProfiles method', () => {
      expect(typeof proto.listProfiles).toBe('function');
    });

    it('listProfiles should accept (tenantId, userId, membershipId, query)', () => {
      expect(proto.listProfiles.length).toBeGreaterThanOrEqual(4);
    });

    it('should expose getTierSummary method', () => {
      expect(typeof proto.getTierSummary).toBe('function');
    });

    it('getTierSummary should accept (tenantId, userId, membershipId, query)', () => {
      expect(proto.getTierSummary.length).toBeGreaterThanOrEqual(4);
    });

    it('should expose getStudentDetail method', () => {
      expect(typeof proto.getStudentDetail).toBe('function');
    });

    it('getStudentDetail should accept (tenantId, userId, membershipId, studentId)', () => {
      expect(proto.getStudentDetail.length).toBeGreaterThanOrEqual(4);
    });

    it('should expose acknowledgeProfile method', () => {
      expect(typeof proto.acknowledgeProfile).toBe('function');
    });

    it('acknowledgeProfile should accept (tenantId, userId, studentId)', () => {
      expect(proto.acknowledgeProfile.length).toBeGreaterThanOrEqual(3);
    });

    it('should expose assignStaff method', () => {
      expect(typeof proto.assignStaff).toBe('function');
    });

    it('assignStaff should accept (tenantId, userId, studentId, dto)', () => {
      expect(proto.assignStaff.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ─── EarlyWarningConfigService ───────────────────────────────────────────

  describe('EarlyWarningConfigService', () => {
    const proto = EarlyWarningConfigService.prototype;

    it('should expose getConfig method', () => {
      expect(typeof proto.getConfig).toBe('function');
    });

    it('getConfig should accept (tenantId)', () => {
      expect(proto.getConfig.length).toBeGreaterThanOrEqual(1);
    });

    it('should expose updateConfig method', () => {
      expect(typeof proto.updateConfig).toBe('function');
    });

    it('updateConfig should accept (tenantId, dto)', () => {
      expect(proto.updateConfig.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── EarlyWarningTriggerService ──────────────────────────────────────────

  describe('EarlyWarningTriggerService', () => {
    const proto = EarlyWarningTriggerService.prototype;

    it('should expose triggerStudentRecompute method', () => {
      expect(typeof proto.triggerStudentRecompute).toBe('function');
    });

    it('triggerStudentRecompute should accept (tenantId, studentId, triggerEvent)', () => {
      expect(proto.triggerStudentRecompute.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Public API surface guard ───────────────────────────────────────────

  describe('public API surface guard', () => {
    it('EarlyWarningService should have expected public methods', () => {
      const expectedMethods = [
        'listProfiles',
        'getTierSummary',
        'getStudentDetail',
        'acknowledgeProfile',
        'assignStaff',
      ];

      const publicMethods = getPublicMethodNames(EarlyWarningService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });

    it('EarlyWarningConfigService should have expected public methods', () => {
      const expectedMethods = ['getConfig', 'updateConfig'];

      const publicMethods = getPublicMethodNames(EarlyWarningConfigService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });

    it('EarlyWarningTriggerService should have expected public methods', () => {
      const expectedMethods = ['triggerStudentRecompute'];

      const publicMethods = getPublicMethodNames(EarlyWarningTriggerService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });
  });
});
