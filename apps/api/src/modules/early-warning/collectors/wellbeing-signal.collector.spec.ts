import { Test } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, PastoralReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { WellbeingSignalCollector } from './wellbeing-signal.collector';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const STUDENT_ID = '00000000-0000-0000-0000-000000000002';
const ACADEMIC_YEAR_ID = '00000000-0000-0000-0000-000000000003';

// ─── Mock Factory ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    studentCheckin: { findMany: jest.fn().mockResolvedValue([]) },
    pastoralConcern: { findMany: jest.fn().mockResolvedValue([]) },
    pastoralCase: { findMany: jest.fn().mockResolvedValue([]) },
    pastoralReferral: { findMany: jest.fn().mockResolvedValue([]) },
    criticalIncidentAffected: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function makeCheckin(overrides: { mood_score: number; daysAgo: number; id?: string }) {
  return {
    id: overrides.id ?? `checkin-${overrides.daysAgo}`,
    tenant_id: TENANT_ID,
    student_id: STUDENT_ID,
    mood_score: overrides.mood_score,
    checkin_date: daysAgo(overrides.daysAgo),
    created_at: daysAgo(overrides.daysAgo),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('WellbeingSignalCollector', () => {
  let collector: WellbeingSignalCollector;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        WellbeingSignalCollector,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: PastoralReadFacade,
          useValue: {
            findRecentCheckins: mockPrisma.studentCheckin.findMany,
            findRecentConcerns: mockPrisma.pastoralConcern.findMany,
            findActiveCases: mockPrisma.pastoralCase.findMany,
            findActiveReferrals: mockPrisma.pastoralReferral.findMany,
            findActiveWellbeingFlags: mockPrisma.criticalIncidentAffected.findMany,
          },
        },
      ],
    }).compile();

    collector = module.get(WellbeingSignalCollector);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Test 1: Empty data ─────────────────────────────────────────────────

  it('should return score 0 and empty signals when no data exists', async () => {
    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.domain).toBe('wellbeing');
    expect(result.rawScore).toBe(0);
    expect(result.signals).toEqual([]);
    expect(result.summaryFragments).toEqual([]);
  });

  // ─── Test 2: declining_wellbeing_score ──────────────────────────────────

  it('should detect declining_wellbeing_score when mood drops over 5 check-ins', async () => {
    // Ordered DESC by checkin_date: newest first
    // Newer half (indices 0-1): mood 2, 2 → avg 2.0
    // Older half (indices 2-4): mood 4, 5, 5 → avg 4.67
    // Decline = 4.67 - 2.0 = 2.67 → scoreContribution = 25
    const checkins = [
      makeCheckin({ mood_score: 2, daysAgo: 1 }),
      makeCheckin({ mood_score: 2, daysAgo: 3 }),
      makeCheckin({ mood_score: 4, daysAgo: 7 }),
      makeCheckin({ mood_score: 5, daysAgo: 10 }),
      makeCheckin({ mood_score: 5, daysAgo: 14 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'declining_wellbeing_score');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(25);
    expect(signal!.severity).toBe('high');
    expect(signal!.sourceEntityType).toBe('StudentCheckin');
    expect(result.rawScore).toBeGreaterThanOrEqual(10);
    expect(result.rawScore).toBeLessThanOrEqual(100);
  });

  // ─── Test 3: low_mood_pattern ───────────────────────────────────────────

  it('should detect low_mood_pattern when last 3 check-ins all have mood_score 1', async () => {
    const checkins = [
      makeCheckin({ mood_score: 1, daysAgo: 1 }),
      makeCheckin({ mood_score: 1, daysAgo: 3 }),
      makeCheckin({ mood_score: 1, daysAgo: 5 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'low_mood_pattern');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(20);
    expect(signal!.severity).toBe('medium');
    expect(signal!.summaryFragment).toContain('scores: 1, 1, 1');
  });

  // ─── Test 4: active_pastoral_concern (urgent) ──────────────────────────

  it('should detect active_pastoral_concern for urgent severity', async () => {
    mockPrisma.pastoralConcern.findMany.mockResolvedValue([
      {
        id: 'concern-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        category: 'family_issues',
        severity: 'urgent',
        follow_up_needed: true,
        acknowledged_at: null,
        created_at: daysAgo(5),
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'active_pastoral_concern');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(20);
    expect(signal!.severity).toBe('medium');
    expect(signal!.sourceEntityType).toBe('PastoralConcern');
    expect(signal!.summaryFragment).toContain('family_issues');
    expect(signal!.summaryFragment).toContain('urgent');
  });

  // ─── Test 5: active_pastoral_case ───────────────────────────────────────

  it('should detect active_pastoral_case for 1 open case with score 10', async () => {
    mockPrisma.pastoralCase.findMany.mockResolvedValue([
      {
        id: 'case-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        status: 'open',
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'active_pastoral_case');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(10);
    expect(signal!.severity).toBe('low');
    expect(signal!.summaryFragment).toBe('1 active pastoral case(s)');
  });

  // ─── Test 6: external_referral ──────────────────────────────────────────

  it('should detect external_referral for 1 submitted referral with score 15', async () => {
    mockPrisma.pastoralReferral.findMany.mockResolvedValue([
      {
        id: 'referral-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        referral_type: 'NEPS',
        referral_body_name: 'National Educational Psychological Service',
        status: 'submitted',
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'external_referral');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(15);
    expect(signal!.severity).toBe('medium');
    expect(signal!.summaryFragment).toContain('NEPS');
    expect(signal!.summaryFragment).toContain('National Educational Psychological Service');
  });

  // ─── Test 7: critical_incident_affected (direct) ────────────────────────

  it('should detect critical_incident_affected with direct impact at score 35 and critical severity', async () => {
    mockPrisma.criticalIncidentAffected.findMany.mockResolvedValue([
      {
        id: 'incident-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        impact_level: 'direct',
        wellbeing_flag_active: true,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'critical_incident_affected');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(35);
    expect(signal!.severity).toBe('critical');
    expect(signal!.summaryFragment).toContain('direct');
  });

  // ─── Test 8: DZ-27 — never queries surveyResponse ──────────────────────

  it('should never access surveyResponse or staffSurveyResponse models (DZ-27)', async () => {
    // Verify the mock prisma has no surveyResponse access
    const prismaKeys = Object.keys(mockPrisma);
    expect(prismaKeys).not.toContain('surveyResponse');
    expect(prismaKeys).not.toContain('staffSurveyResponse');

    // Run the collector and confirm it only touches the allowed models
    await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(mockPrisma.studentCheckin.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.pastoralConcern.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.pastoralCase.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.pastoralReferral.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.criticalIncidentAffected.findMany).toHaveBeenCalledTimes(1);
  });

  // ─── Test 9: Multiple signals cap at 100 ───────────────────────────────

  it('should cap rawScore at 100 when multiple signals exceed the limit', async () => {
    // declining_wellbeing_score: +25 (decline > 2.0)
    // low_mood_pattern: +20 (all 1s)
    // active_pastoral_concern: +30 (critical)
    // active_pastoral_case: +20 (2+ cases)
    // external_referral: +15 (1 referral)
    // critical_incident_affected: +35 (direct)
    // Total without cap: 145

    const checkins = [
      makeCheckin({ mood_score: 1, daysAgo: 1 }),
      makeCheckin({ mood_score: 1, daysAgo: 3 }),
      makeCheckin({ mood_score: 1, daysAgo: 5 }),
      makeCheckin({ mood_score: 5, daysAgo: 10 }),
      makeCheckin({ mood_score: 5, daysAgo: 14 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    mockPrisma.pastoralConcern.findMany.mockResolvedValue([
      {
        id: 'concern-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        category: 'self_harm',
        severity: 'critical',
        follow_up_needed: true,
        acknowledged_at: null,
        created_at: daysAgo(2),
      },
    ]);

    mockPrisma.pastoralCase.findMany.mockResolvedValue([
      {
        id: 'case-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        status: 'open',
      },
      {
        id: 'case-2',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        status: 'active',
      },
    ]);

    mockPrisma.pastoralReferral.findMany.mockResolvedValue([
      {
        id: 'referral-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        referral_type: 'CAMHS',
        referral_body_name: 'HSE CAMHS',
        status: 'submitted',
      },
    ]);

    mockPrisma.criticalIncidentAffected.findMany.mockResolvedValue([
      {
        id: 'incident-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        impact_level: 'direct',
        wellbeing_flag_active: true,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.rawScore).toBe(100);
    expect(result.signals.length).toBeGreaterThanOrEqual(4);

    // Verify the sum of individual contributions exceeds 100
    const totalContributions = result.signals.reduce((sum, s) => sum + s.scoreContribution, 0);
    expect(totalContributions).toBeGreaterThan(100);
  });

  // ─── Test 10: Summary fragments generated ──────────────────────────────

  it('should populate summaryFragments from all detected signals', async () => {
    mockPrisma.pastoralCase.findMany.mockResolvedValue([
      {
        id: 'case-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        status: 'open',
      },
    ]);

    mockPrisma.pastoralReferral.findMany.mockResolvedValue([
      {
        id: 'referral-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        referral_type: 'TUSLA',
        referral_body_name: 'Tusla Child and Family Agency',
        status: 'acknowledged',
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    expect(result.signals.length).toBe(2);
    expect(result.summaryFragments.length).toBe(2);
    expect(result.summaryFragments[0]).toBe(result.signals[0]?.summaryFragment);
    expect(result.summaryFragments[1]).toBe(result.signals[1]?.summaryFragment);
    expect(result.summaryFragments).toContain('1 active pastoral case(s)');
    expect(result.summaryFragments.some((f) => f.includes('TUSLA'))).toBe(true);
  });

  // ─── Test 11: declining_wellbeing_score — moderate decline (1.0 to 2.0) ─

  it('should detect moderate declining_wellbeing_score with score 15', async () => {
    // Ordered DESC: newest first
    // Newer half (0-1): mood 2.5 avg → 2, 3
    // Older half (2-4): mood 4, 4, 4 → avg 4.0
    // Decline = 4.0 - 2.5 = 1.5 → scoreContribution = 15
    const checkins = [
      makeCheckin({ mood_score: 2, daysAgo: 1 }),
      makeCheckin({ mood_score: 3, daysAgo: 3 }),
      makeCheckin({ mood_score: 4, daysAgo: 7 }),
      makeCheckin({ mood_score: 4, daysAgo: 10 }),
      makeCheckin({ mood_score: 4, daysAgo: 14 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'declining_wellbeing_score');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(15);
  });

  // ─── Test 12: declining_wellbeing_score ��� small decline (0.5 to 1.0) ──

  it('should detect small declining_wellbeing_score with score 10', async () => {
    // Newer half (0-1): mood 3.5 avg → 3, 4
    // Older half (2-4): mood 4, 4, 5 → avg 4.33
    // Decline = 4.33 - 3.5 = 0.83 → scoreContribution = 10
    const checkins = [
      makeCheckin({ mood_score: 3, daysAgo: 1 }),
      makeCheckin({ mood_score: 4, daysAgo: 3 }),
      makeCheckin({ mood_score: 4, daysAgo: 7 }),
      makeCheckin({ mood_score: 4, daysAgo: 10 }),
      makeCheckin({ mood_score: 5, daysAgo: 14 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'declining_wellbeing_score');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(10);
  });

  // ─── Test 13: declining_wellbeing_score — no decline → no signal ──────

  it('should not detect declining_wellbeing_score when newer scores are higher', async () => {
    const checkins = [
      makeCheckin({ mood_score: 5, daysAgo: 1 }),
      makeCheckin({ mood_score: 5, daysAgo: 3 }),
      makeCheckin({ mood_score: 3, daysAgo: 7 }),
      makeCheckin({ mood_score: 2, daysAgo: 10 }),
      makeCheckin({ mood_score: 1, daysAgo: 14 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'declining_wellbeing_score');
    expect(signal).toBeUndefined();
  });

  // ─── Test 14: low_mood_pattern — all 2s → score 10 ────────────────────

  it('should detect low_mood_pattern with all 2s as score 10', async () => {
    const checkins = [
      makeCheckin({ mood_score: 2, daysAgo: 1 }),
      makeCheckin({ mood_score: 2, daysAgo: 3 }),
      makeCheckin({ mood_score: 2, daysAgo: 5 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'low_mood_pattern');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(10);
  });

  // ─── Test 15: low_mood_pattern — mix of 1s and 2s → score 15 ─────────

  it('should detect low_mood_pattern with mix of 1s and 2s as score 15', async () => {
    const checkins = [
      makeCheckin({ mood_score: 1, daysAgo: 1 }),
      makeCheckin({ mood_score: 2, daysAgo: 3 }),
      makeCheckin({ mood_score: 1, daysAgo: 5 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'low_mood_pattern');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(15);
  });

  // ─── Test 16: low_mood_pattern — fewer than 3 checkins → no signal ────

  it('should not detect low_mood_pattern with fewer than 3 checkins', async () => {
    const checkins = [
      makeCheckin({ mood_score: 1, daysAgo: 1 }),
      makeCheckin({ mood_score: 1, daysAgo: 3 }),
    ];

    mockPrisma.studentCheckin.findMany.mockResolvedValue(checkins);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'low_mood_pattern');
    expect(signal).toBeUndefined();
  });

  // ─── Test 17: pastoral concern — critical severity → score 30 ─────────

  it('should detect active_pastoral_concern with critical severity and score 30', async () => {
    mockPrisma.pastoralConcern.findMany.mockResolvedValue([
      {
        id: 'concern-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        category: 'safeguarding',
        severity: 'critical',
        follow_up_needed: true,
        acknowledged_at: null,
        created_at: daysAgo(2),
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'active_pastoral_concern');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(30);
    expect(signal!.severity).toBe('high');
  });

  // ─── Test 18: pastoral concern — non-urgent/non-critical → score 15 ───

  it('should detect active_pastoral_concern with low severity and score 15', async () => {
    mockPrisma.pastoralConcern.findMany.mockResolvedValue([
      {
        id: 'concern-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        category: 'behaviour',
        severity: 'low',
        follow_up_needed: false,
        acknowledged_at: null,
        created_at: daysAgo(5),
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'active_pastoral_concern');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(15);
  });

  // ─── Test 19: active_pastoral_case 2+ → score 20 ─────────────────────

  it('should detect 2+ active_pastoral_cases with score 20', async () => {
    mockPrisma.pastoralCase.findMany.mockResolvedValue([
      { id: 'case-1', tenant_id: TENANT_ID, student_id: STUDENT_ID, status: 'open' },
      { id: 'case-2', tenant_id: TENANT_ID, student_id: STUDENT_ID, status: 'active' },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'active_pastoral_case');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(20);
  });

  // ─── Test 20: external_referral 2+ → score 25 ─────────────────────────

  it('should detect 2+ external_referrals with score 25', async () => {
    mockPrisma.pastoralReferral.findMany.mockResolvedValue([
      {
        id: 'ref-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        referral_type: 'NEPS',
        referral_body_name: 'NEPS',
        status: 'submitted',
      },
      {
        id: 'ref-2',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        referral_type: 'CAMHS',
        referral_body_name: null,
        status: 'accepted',
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'external_referral');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(25);
  });

  // ─── Test 21: critical_incident_affected — indirect impact ────────────

  it('should detect critical_incident_affected with indirect impact at score 20', async () => {
    mockPrisma.criticalIncidentAffected.findMany.mockResolvedValue([
      {
        id: 'incident-1',
        tenant_id: TENANT_ID,
        student_id: STUDENT_ID,
        impact_level: 'indirect',
        wellbeing_flag_active: true,
      },
    ]);

    const result = await collector.collectSignals(TENANT_ID, STUDENT_ID, ACADEMIC_YEAR_ID);

    const signal = result.signals.find((s) => s.signalType === 'critical_incident_affected');
    expect(signal).toBeDefined();
    expect(signal!.scoreContribution).toBe(20);
    expect(signal!.severity).toBe('medium');
  });
});
