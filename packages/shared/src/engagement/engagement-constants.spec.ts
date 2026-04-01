import {
  BOOKING_VALID_TRANSITIONS,
  EVENT_VALID_TRANSITIONS,
  SLOT_VALID_TRANSITIONS,
  SUBMISSION_VALID_TRANSITIONS,
} from './engagement-constants';

// ─── Shared structural assertion helpers ─────────────────────────────────────

function assertAllTargetsExistAsKeys(map: Record<string, string[]>): void {
  const allKeys = Object.keys(map);
  for (const [, targets] of Object.entries(map)) {
    for (const target of targets) {
      expect(allKeys).toContain(target);
    }
  }
}

function assertNoSelfTransitions(map: Record<string, string[]>): void {
  for (const [status, targets] of Object.entries(map)) {
    expect(targets).not.toContain(status);
  }
}

// ─── EVENT_VALID_TRANSITIONS ──────────────────────────────────────────────────

describe('EVENT_VALID_TRANSITIONS', () => {
  it('should define transitions for all statuses', () => {
    expect(Object.keys(EVENT_VALID_TRANSITIONS).length).toBeGreaterThan(0);
  });

  it('should have valid target statuses — all targets exist as keys', () => {
    assertAllTargetsExistAsKeys(EVENT_VALID_TRANSITIONS);
  });

  it('should not allow self-transitions', () => {
    assertNoSelfTransitions(EVENT_VALID_TRANSITIONS);
  });

  describe('valid transitions', () => {
    const validTransitions: [string, string][] = [
      ['draft', 'published'],
      ['draft', 'cancelled'],
      ['published', 'open'],
      ['published', 'cancelled'],
      ['open', 'closed'],
      ['open', 'cancelled'],
      ['closed', 'in_progress'],
      ['closed', 'cancelled'],
      ['in_progress', 'completed'],
      ['in_progress', 'cancelled'],
      ['completed', 'archived'],
      ['cancelled', 'archived'],
    ];

    it.each(validTransitions)('should allow %s → %s', (from, to) => {
      expect(EVENT_VALID_TRANSITIONS[from]).toContain(to);
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: [string, string][] = [
      ['draft', 'open'],
      ['draft', 'in_progress'],
      ['draft', 'archived'],
      ['published', 'draft'],
      ['published', 'in_progress'],
      ['open', 'published'],
      ['in_progress', 'open'],
      ['completed', 'draft'],
      ['archived', 'draft'],
      ['archived', 'completed'],
    ];

    it.each(invalidTransitions)('should not allow %s → %s', (from, to) => {
      expect(EVENT_VALID_TRANSITIONS[from]).not.toContain(to);
    });
  });

  it('terminal status "archived" should have an empty transition array', () => {
    expect(EVENT_VALID_TRANSITIONS['archived']).toEqual([]);
  });
});

// ─── SUBMISSION_VALID_TRANSITIONS ─────────────────────────────────────────────

describe('SUBMISSION_VALID_TRANSITIONS', () => {
  it('should define transitions for all statuses', () => {
    expect(Object.keys(SUBMISSION_VALID_TRANSITIONS).length).toBeGreaterThan(0);
  });

  it('should have valid target statuses — all targets exist as keys', () => {
    assertAllTargetsExistAsKeys(SUBMISSION_VALID_TRANSITIONS);
  });

  it('should not allow self-transitions', () => {
    assertNoSelfTransitions(SUBMISSION_VALID_TRANSITIONS);
  });

  describe('valid transitions', () => {
    const validTransitions: [string, string][] = [
      ['pending', 'submitted'],
      ['pending', 'expired'],
      ['submitted', 'acknowledged'],
      ['submitted', 'revoked'],
      ['acknowledged', 'revoked'],
    ];

    it.each(validTransitions)('should allow %s → %s', (from, to) => {
      expect(SUBMISSION_VALID_TRANSITIONS[from]).toContain(to);
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: [string, string][] = [
      ['pending', 'acknowledged'],
      ['pending', 'revoked'],
      ['submitted', 'pending'],
      ['submitted', 'expired'],
      ['acknowledged', 'pending'],
      ['acknowledged', 'submitted'],
      ['expired', 'pending'],
      ['revoked', 'pending'],
    ];

    it.each(invalidTransitions)('should not allow %s → %s', (from, to) => {
      expect(SUBMISSION_VALID_TRANSITIONS[from]).not.toContain(to);
    });
  });

  it('terminal statuses "expired" and "revoked" should have empty transition arrays', () => {
    expect(SUBMISSION_VALID_TRANSITIONS['expired']).toEqual([]);
    expect(SUBMISSION_VALID_TRANSITIONS['revoked']).toEqual([]);
  });
});

// ─── SLOT_VALID_TRANSITIONS ───────────────────────────────────────────────────

describe('SLOT_VALID_TRANSITIONS', () => {
  it('should define transitions for all statuses', () => {
    expect(Object.keys(SLOT_VALID_TRANSITIONS).length).toBeGreaterThan(0);
  });

  it('should have valid target statuses — all targets exist as keys', () => {
    assertAllTargetsExistAsKeys(SLOT_VALID_TRANSITIONS);
  });

  it('should not allow self-transitions', () => {
    assertNoSelfTransitions(SLOT_VALID_TRANSITIONS);
  });

  describe('valid transitions', () => {
    const validTransitions: [string, string][] = [
      ['available', 'booked'],
      ['available', 'blocked'],
      ['booked', 'completed'],
      ['booked', 'cancelled'],
      ['blocked', 'available'],
      ['cancelled', 'available'],
    ];

    it.each(validTransitions)('should allow %s → %s', (from, to) => {
      expect(SLOT_VALID_TRANSITIONS[from]).toContain(to);
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: [string, string][] = [
      ['available', 'completed'],
      ['available', 'cancelled'],
      ['booked', 'available'],
      ['booked', 'blocked'],
      ['blocked', 'booked'],
      ['completed', 'available'],
      ['completed', 'booked'],
      ['cancelled', 'booked'],
      ['cancelled', 'completed'],
    ];

    it.each(invalidTransitions)('should not allow %s → %s', (from, to) => {
      expect(SLOT_VALID_TRANSITIONS[from]).not.toContain(to);
    });
  });

  it('terminal status "completed" should have an empty transition array', () => {
    expect(SLOT_VALID_TRANSITIONS['completed']).toEqual([]);
  });
});

// ─── BOOKING_VALID_TRANSITIONS ────────────────────────────────────────────────

describe('BOOKING_VALID_TRANSITIONS', () => {
  it('should define transitions for all statuses', () => {
    expect(Object.keys(BOOKING_VALID_TRANSITIONS).length).toBeGreaterThan(0);
  });

  it('should have valid target statuses — all targets exist as keys', () => {
    assertAllTargetsExistAsKeys(BOOKING_VALID_TRANSITIONS);
  });

  it('should not allow self-transitions', () => {
    assertNoSelfTransitions(BOOKING_VALID_TRANSITIONS);
  });

  describe('valid transitions', () => {
    const validTransitions: [string, string][] = [
      ['confirmed', 'completed'],
      ['confirmed', 'cancelled'],
      ['confirmed', 'no_show'],
    ];

    it.each(validTransitions)('should allow %s → %s', (from, to) => {
      expect(BOOKING_VALID_TRANSITIONS[from]).toContain(to);
    });
  });

  describe('invalid transitions', () => {
    const invalidTransitions: [string, string][] = [
      ['completed', 'confirmed'],
      ['completed', 'cancelled'],
      ['completed', 'no_show'],
      ['cancelled', 'confirmed'],
      ['cancelled', 'completed'],
      ['cancelled', 'no_show'],
      ['no_show', 'confirmed'],
      ['no_show', 'completed'],
      ['no_show', 'cancelled'],
    ];

    it.each(invalidTransitions)('should not allow %s → %s', (from, to) => {
      expect(BOOKING_VALID_TRANSITIONS[from]).not.toContain(to);
    });
  });

  it('terminal statuses "completed", "cancelled", and "no_show" should have empty transition arrays', () => {
    expect(BOOKING_VALID_TRANSITIONS['completed']).toEqual([]);
    expect(BOOKING_VALID_TRANSITIONS['cancelled']).toEqual([]);
    expect(BOOKING_VALID_TRANSITIONS['no_show']).toEqual([]);
  });
});
