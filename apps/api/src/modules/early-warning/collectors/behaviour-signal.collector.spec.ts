import type { BehaviourReadFacade } from '../../behaviour/behaviour-read.facade';

import { BehaviourSignalCollector } from './behaviour-signal.collector';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const STUDENT_ID = '00000000-0000-0000-0000-000000000002';
const ACADEMIC_YEAR_ID = '00000000-0000-0000-0000-000000000003';

// ─── Mock Factory ───────────────────────────────────────────────────────────

function buildMockFacade() {
  return {
    findRecentIncidents: jest.fn().mockResolvedValue([]),
    findSanctionsForStudent: jest.fn().mockResolvedValue([]),
    findExclusionCasesForStudent: jest.fn().mockResolvedValue([]),
    findInterventionsForStudent: jest.fn().mockResolvedValue([]),
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function makeParticipant(
  overrides: {
    id?: string;
    polarity?: string;
    severity?: number;
    occurredDaysAgo?: number;
  } = {},
) {
  return {
    id: overrides.id ?? 'part-001',
    incident: {
      id: 'inc-001',
      polarity: overrides.polarity ?? 'negative',
      severity: overrides.severity ?? 3,
      occurred_at: daysAgo(overrides.occurredDaysAgo ?? 1),
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('BehaviourSignalCollector', () => {
  let collector: BehaviourSignalCollector;
  let mockFacade: ReturnType<typeof buildMockFacade>;

  beforeEach(() => {
    mockFacade = buildMockFacade();
    collector = new BehaviourSignalCollector(mockFacade as unknown as BehaviourReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Test 1: Empty data → score 0 ──────────────────────────────────────

  it('should return score 0 with empty signals when no data exists', async () => {
    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.domain).toBe('behaviour');
    expect(result.rawScore).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.summaryFragments).toEqual([]);
  });

  // ─── Test 2: incident_frequency with 5 incidents → score 15, medium ───

  it('should detect incident_frequency with 5 incidents as medium severity', async () => {
    const participants = Array.from({ length: 5 }, (_, i) =>
      makeParticipant({ id: `part-${i}`, occurredDaysAgo: i + 1 }),
    );

    mockFacade.findRecentIncidents
      .mockResolvedValueOnce(participants) // 14-day query
      .mockResolvedValueOnce([]); // 30-day query

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.rawScore).toBe(15);
    const signal = result.signals.find((s) => s.signalType === 'incident_frequency');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(15);
    expect(signal!.severity).toBe('medium');
    expect(signal!.summaryFragment).toContain('5 negative behaviour incidents');
  });

  // ─── Test 3: escalating_severity detected ─────────────────────────────

  it('should detect escalating_severity when severity increases across halves', async () => {
    // First half: severity 2, occurred 20-25 days ago
    const firstHalf = Array.from({ length: 3 }, (_, i) =>
      makeParticipant({ id: `early-${i}`, severity: 2, occurredDaysAgo: 20 + i }),
    );
    // Second half: severity 5, occurred 1-5 days ago
    const secondHalf = Array.from({ length: 3 }, (_, i) =>
      makeParticipant({ id: `recent-${i}`, severity: 5, occurredDaysAgo: 1 + i }),
    );
    const allParticipants = [...secondHalf, ...firstHalf];

    mockFacade.findRecentIncidents
      .mockResolvedValueOnce([]) // 14-day query (not used for this signal)
      .mockResolvedValueOnce(allParticipants); // 30-day query

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'escalating_severity');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBeGreaterThanOrEqual(10);
    expect(signal!.summaryFragment).toContain('severity escalating');
  });

  // ─── Test 4: active_sanction (suspension) → score 30, high ─────────────

  it('should detect active suspension sanction as high severity', async () => {
    mockFacade.findSanctionsForStudent.mockResolvedValue([
      {
        id: 'sanc-001',
        type: 'suspension_external',
        status: 'scheduled',
        suspension_start_date: new Date('2026-03-25'),
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'active_sanction');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(30);
    expect(signal!.severity).toBe('high'); // mapSeverity: score 30 → high
    expect(signal!.summaryFragment).toContain('suspension_external');
  });

  // ─── Test 5: active_sanction (non-suspension) → score 15, medium ──────

  it('should detect active non-suspension sanction as medium severity', async () => {
    mockFacade.findSanctionsForStudent.mockResolvedValue([
      {
        id: 'sanc-002',
        type: 'detention',
        status: 'scheduled',
        suspension_start_date: null,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'active_sanction');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(15);
    expect(signal!.severity).toBe('medium');
    expect(signal!.summaryFragment).toContain('detention');
  });

  // ─── Test 6: exclusion_history with 1 case → score 20, medium ──────────

  it('should detect 1 exclusion case as medium severity', async () => {
    mockFacade.findExclusionCasesForStudent.mockResolvedValue([
      {
        id: 'exc-001',
        incident: { academic_year_id: ACADEMIC_YEAR_ID },
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'exclusion_history');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(20);
    expect(signal!.severity).toBe('medium'); // mapSeverity: score 20 → medium
    expect(signal!.summaryFragment).toContain('1 exclusion case(s)');
  });

  // ─── Test 7: failed_intervention → 1 abandoned → score 10 ─────────────

  it('should detect 1 abandoned intervention with score 10', async () => {
    mockFacade.findInterventionsForStudent.mockResolvedValue([
      {
        id: 'int-001',
        status: 'abandoned',
        outcome: null,
        target_end_date: null,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'failed_intervention');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(10);
    expect(signal!.summaryFragment).toContain('1 failed or overdue');
  });

  // ─── Test 8: Only negative polarity counted ───────────────────────────

  it('should not generate signals for positive polarity incidents', async () => {
    // Provide 5 positive incidents — collector filters client-side for negative only
    const positiveParticipants = Array.from({ length: 5 }, (_, i) =>
      makeParticipant({ id: `part-${i}`, polarity: 'positive', occurredDaysAgo: i + 1 }),
    );

    mockFacade.findRecentIncidents
      .mockResolvedValueOnce(positiveParticipants) // 14-day query
      .mockResolvedValueOnce(positiveParticipants); // 30-day query

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.rawScore).toBe(0);
    expect(result.signals).toEqual([]);
  });

  // ─── Test 9: Multiple signals cap at 100 ──────────────────────────────

  it('should cap rawScore at 100 when multiple signals combine', async () => {
    // incident_frequency: 10+ → 25
    const manyParticipants = Array.from({ length: 12 }, (_, i) =>
      makeParticipant({ id: `part-${i}`, occurredDaysAgo: i + 1 }),
    );
    mockFacade.findRecentIncidents
      .mockResolvedValueOnce(manyParticipants) // 14-day query
      .mockResolvedValueOnce([]); // 30-day query (no escalation data)

    // active_sanction: suspension → 30
    mockFacade.findSanctionsForStudent.mockResolvedValue([
      {
        id: 'sanc-cap',
        type: 'suspension_external',
        status: 'scheduled',
        suspension_start_date: new Date('2026-03-25'),
      },
    ]);

    // exclusion_history: 2+ → 35
    mockFacade.findExclusionCasesForStudent.mockResolvedValue([
      { id: 'exc-cap-1', incident: { academic_year_id: ACADEMIC_YEAR_ID } },
      { id: 'exc-cap-2', incident: { academic_year_id: ACADEMIC_YEAR_ID } },
    ]);

    // failed_intervention: 2+ → 20
    mockFacade.findInterventionsForStudent.mockResolvedValue([
      { id: 'int-cap-1', status: 'abandoned', outcome: null, target_end_date: null },
      {
        id: 'int-cap-2',
        status: 'completed_intervention',
        outcome: 'deteriorated',
        target_end_date: null,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    // 25 + 30 + 35 + 20 = 110, but capped at 100
    expect(result.rawScore).toBe(100);
    expect(result.signals.length).toBeGreaterThanOrEqual(4);
  });

  // ─── Test 10: Summary fragments generated ─────────────────────────────

  it('should populate summaryFragments from all emitted signals', async () => {
    // incident_frequency: 3 incidents → 10
    const participants = Array.from({ length: 3 }, (_, i) =>
      makeParticipant({ id: `part-${i}`, occurredDaysAgo: i + 1 }),
    );
    mockFacade.findRecentIncidents
      .mockResolvedValueOnce(participants) // 14-day query
      .mockResolvedValueOnce([]); // 30-day query

    // active_sanction: detention → 15
    mockFacade.findSanctionsForStudent.mockResolvedValue([
      {
        id: 'sanc-frag',
        type: 'detention',
        status: 'partially_served',
        suspension_start_date: null,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.summaryFragments.length).toBe(result.signals.length);
    expect(result.summaryFragments.length).toBe(2);
    expect(result.summaryFragments[0]).toContain('negative behaviour incidents');
    expect(result.summaryFragments[1]).toContain('detention');
  });
});
