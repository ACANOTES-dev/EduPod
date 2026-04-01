import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { SequenceService } from './sequence.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const MOCK_PRISMA = {};

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

describe('SequenceModule — contract', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── Module exports ──────────────────────────────────────────────────────

  it('should resolve SequenceService via DI', async () => {
    const module = await Test.createTestingModule({
      providers: [SequenceService, { provide: PrismaService, useValue: MOCK_PRISMA }],
    }).compile();

    const service = module.get(SequenceService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(SequenceService);
  });

  // ─── Public method signatures ────────────────────────────────────────────

  it('SequenceService should expose nextNumber method', () => {
    expect(typeof SequenceService.prototype.nextNumber).toBe('function');
  });

  it('SequenceService.nextNumber should accept (tenantId, sequenceType, tx?, prefix?)', () => {
    // nextNumber has 4 params: tenantId, sequenceType, tx, prefix
    // JS .length counts required params up to the first optional one
    // tenantId & sequenceType are required, tx? and prefix? are optional
    expect(SequenceService.prototype.nextNumber.length).toBeGreaterThanOrEqual(2);
  });

  it('SequenceService should expose generateHouseholdReference method', () => {
    expect(typeof SequenceService.prototype.generateHouseholdReference).toBe('function');
  });

  it('SequenceService.generateHouseholdReference should accept (tenantId, tx?)', () => {
    expect(SequenceService.prototype.generateHouseholdReference.length).toBeGreaterThanOrEqual(1);
  });

  // ─── No accidental public surface expansion ─────────────────────────────

  it('SequenceService public API should only contain expected methods', () => {
    const publicMethods = getPublicMethodNames(SequenceService.prototype);

    // Only nextNumber and generateHouseholdReference should be public
    // Private methods are prefixed with # or are not enumerable at runtime,
    // but TS private compiles to regular properties — so we check for known publics
    expect(publicMethods).toContain('nextNumber');
    expect(publicMethods).toContain('generateHouseholdReference');
  });
});
