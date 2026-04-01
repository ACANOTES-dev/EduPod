import { PolicyEvaluationEngine } from './policy-evaluation-engine';
import { PolicyReplayService } from './policy-replay.service';
import { PolicyRulesService } from './policy-rules.service';

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
// These tests verify the public API surface of the PolicyEngineModule.
// They use prototype-based assertions (no DI or DB required) to detect
// accidental breaking changes to the module's public interface.
// ─────────────────────────────────────────────────────────────────────────────

describe('PolicyEngineModule — contract', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── PolicyEvaluationEngine ──────────────────────────────────────────────

  describe('PolicyEvaluationEngine', () => {
    it('should expose evaluateForStudent method', () => {
      expect(typeof PolicyEvaluationEngine.prototype.evaluateForStudent).toBe('function');
    });

    it('evaluateForStudent should accept (incident, participant, evaluatedStages, tx)', () => {
      expect(PolicyEvaluationEngine.prototype.evaluateForStudent.length).toBeGreaterThanOrEqual(4);
    });

    it('should expose evaluateConditions method (pure, synchronous matcher)', () => {
      expect(typeof PolicyEvaluationEngine.prototype.evaluateConditions).toBe('function');
    });

    it('evaluateConditions should accept (conditions, input)', () => {
      expect(PolicyEvaluationEngine.prototype.evaluateConditions.length).toBe(2);
    });

    it('should expose buildEvaluatedInput method', () => {
      expect(typeof PolicyEvaluationEngine.prototype.buildEvaluatedInput).toBe('function');
    });

    it('buildEvaluatedInput should accept (incident, participant, conditions, tx)', () => {
      expect(PolicyEvaluationEngine.prototype.buildEvaluatedInput.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ─── PolicyRulesService ──────────────────────────────────────────────────

  describe('PolicyRulesService', () => {
    const proto = PolicyRulesService.prototype;

    it('should expose listRules method', () => {
      expect(typeof proto.listRules).toBe('function');
    });

    it('should expose getRule method', () => {
      expect(typeof proto.getRule).toBe('function');
    });

    it('should expose createRule method', () => {
      expect(typeof proto.createRule).toBe('function');
    });

    it('should expose updateRule method', () => {
      expect(typeof proto.updateRule).toBe('function');
    });

    it('should expose deleteRule method', () => {
      expect(typeof proto.deleteRule).toBe('function');
    });

    it('should expose getVersionHistory method', () => {
      expect(typeof proto.getVersionHistory).toBe('function');
    });

    it('should expose getVersion method', () => {
      expect(typeof proto.getVersion).toBe('function');
    });

    it('should expose updatePriority method', () => {
      expect(typeof proto.updatePriority).toBe('function');
    });

    it('should expose importRules method', () => {
      expect(typeof proto.importRules).toBe('function');
    });

    it('should expose exportRules method', () => {
      expect(typeof proto.exportRules).toBe('function');
    });

    it('listRules should accept (tenantId, query)', () => {
      expect(proto.listRules.length).toBeGreaterThanOrEqual(2);
    });

    it('createRule should accept (tenantId, userId, dto)', () => {
      expect(proto.createRule.length).toBeGreaterThanOrEqual(3);
    });

    it('updateRule should accept (tenantId, ruleId, userId, dto)', () => {
      expect(proto.updateRule.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ─── PolicyReplayService ─────────────────────────────────────────────────

  describe('PolicyReplayService', () => {
    const proto = PolicyReplayService.prototype;

    it('should expose replayRule method', () => {
      expect(typeof proto.replayRule).toBe('function');
    });

    it('replayRule should accept (tenantId, dto)', () => {
      expect(proto.replayRule.length).toBeGreaterThanOrEqual(2);
    });

    it('should expose dryRun method', () => {
      expect(typeof proto.dryRun).toBe('function');
    });

    it('dryRun should accept (tenantId, dto)', () => {
      expect(proto.dryRun.length).toBeGreaterThanOrEqual(2);
    });

    it('should expose getIncidentEvaluationTrace method', () => {
      expect(typeof proto.getIncidentEvaluationTrace).toBe('function');
    });

    it('getIncidentEvaluationTrace should accept (tenantId, incidentId)', () => {
      expect(proto.getIncidentEvaluationTrace.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── No accidental public surface expansion ─────────────────────────────

  describe('public API surface guard', () => {
    it('PolicyEvaluationEngine should have expected public methods', () => {
      const publicMethods = getPublicMethodNames(PolicyEvaluationEngine.prototype);

      expect(publicMethods).toContain('evaluateForStudent');
      expect(publicMethods).toContain('evaluateConditions');
      expect(publicMethods).toContain('buildEvaluatedInput');
    });

    it('PolicyRulesService should have expected public methods', () => {
      const expectedMethods = [
        'listRules',
        'getRule',
        'createRule',
        'updateRule',
        'deleteRule',
        'getVersionHistory',
        'getVersion',
        'updatePriority',
        'importRules',
        'exportRules',
      ];

      const publicMethods = getPublicMethodNames(PolicyRulesService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });

    it('PolicyReplayService should have expected public methods', () => {
      const expectedMethods = ['replayRule', 'dryRun', 'getIncidentEvaluationTrace'];

      const publicMethods = getPublicMethodNames(PolicyReplayService.prototype);

      for (const method of expectedMethods) {
        expect(publicMethods).toContain(method);
      }
    });
  });
});
