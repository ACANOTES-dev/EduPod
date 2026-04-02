import { Test } from '@nestjs/testing';
import type { PrismaClient } from '@prisma/client';

import {
  loadTenantConfig,
  computeRiskAssessment,
  upsertRiskProfile,
  writeSignalAuditTrail,
  logTierTransition,
  getActiveAcademicYear,
} from './early-warning-action.utils';
import {
  DEFAULT_HYSTERESIS_BUFFER,
  type SignalResult,
  type RiskTier,
  type EarlyWarningThresholds,
  type EarlyWarningWeights,
} from '@school/shared';

const mockPrisma = {
  earlyWarningConfig: {
    findUnique: jest.fn(),
  },
  academicYear: {
    findFirst: jest.fn(),
  },
  studentRiskProfile: {
    upsert: jest.fn(),
  },
  studentRiskSignal: {
    createMany: jest.fn(),
  },
  earlyWarningTierTransition: {
    create: jest.fn(),
  },
  classEnrolment: {
    findFirst: jest.fn(),
  },
  staffProfile: {
    findUnique: jest.fn(),
  },
  membershipRole: {
    findFirst: jest.fn(),
  },
  notification: {
    create: jest.fn().mockResolvedValue({ id: 'notification-1' }),
  },
};

describe('early-warning-action.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('loadTenantConfig', () => {
    it('should return default config when no config exists', async () => {
      mockPrisma.earlyWarningConfig.findUnique.mockResolvedValue(null);

      const result = await loadTenantConfig(mockPrisma as unknown as PrismaClient, 'tenant-1');

      expect(result.isEnabled).toBe(false);
      expect(result.weights).toBeDefined();
      expect(result.thresholds).toBeDefined();
      expect(result.hysteresisBuffer).toBe(DEFAULT_HYSTERESIS_BUFFER);
      expect(result.routingRules).toBeDefined();
      expect(result.highSeverityEvents).toContain('suspension');
      expect(result.digestDay).toBe(1);
      expect(result.digestRecipients).toEqual([]);
    });

    it('should return config from database', async () => {
      mockPrisma.earlyWarningConfig.findUnique.mockResolvedValue({
        tenant_id: 'tenant-1',
        is_enabled: true,
        weights_json: { attendance: 30, grades: 25, behaviour: 20, wellbeing: 15, engagement: 10 },
        thresholds_json: { green: 0, yellow: 25, amber: 50, red: 75 },
        hysteresis_buffer: 10,
        routing_rules_json: {
          yellow: { role: 'homeroom_teacher' },
          amber: { role: 'year_head' },
          red: { roles: ['principal', 'pastoral_lead'] },
        },
        high_severity_events_json: ['suspension', 'critical_incident'],
        digest_day: 5,
        digest_recipients_json: ['user-1', 'user-2'],
      });

      const result = await loadTenantConfig(mockPrisma as unknown as PrismaClient, 'tenant-1');

      expect(result.isEnabled).toBe(true);
      expect(result.hysteresisBuffer).toBe(10);
      expect(result.digestDay).toBe(5);
      expect(result.digestRecipients).toEqual(['user-1', 'user-2']);
    });
  });

  describe('computeRiskAssessment', () => {
    const weights: EarlyWarningWeights = {
      attendance: 20,
      grades: 20,
      behaviour: 20,
      wellbeing: 20,
      engagement: 20,
    };

    const thresholds: EarlyWarningThresholds = {
      green: 0,
      yellow: 25,
      amber: 50,
      red: 75,
    };

    it('should compute risk assessment for green tier', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 10, signals: [] },
        { domain: 'grades', rawScore: 10, signals: [] },
        { domain: 'behaviour', rawScore: 10, signals: [] },
        { domain: 'wellbeing', rawScore: 10, signals: [] },
        { domain: 'engagement', rawScore: 10, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.compositeScore).toBe(10);
      expect(result.riskTier).toBe('green');
      expect(result.tierChanged).toBe(true);
      expect(result.previousTier).toBe(null);
    });

    it('should compute risk assessment with cross-domain boost', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 60, signals: [] },
        { domain: 'grades', rawScore: 60, signals: [] },
        { domain: 'behaviour', rawScore: 60, signals: [] },
        { domain: 'wellbeing', rawScore: 60, signals: [] },
        { domain: 'engagement', rawScore: 60, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.compositeScore).toBeGreaterThan(60);
      expect(result.crossDomainBoost).toBeGreaterThan(0);
    });

    it('should apply hysteresis when downgrading tiers', () => {
      // With score 22, raw tier is green (22 < 25), but hysteresis line is 25-5=20
      // Since 22 > 20, we stay in yellow tier
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 22, signals: [] },
        { domain: 'grades', rawScore: 22, signals: [] },
        { domain: 'behaviour', rawScore: 22, signals: [] },
        { domain: 'wellbeing', rawScore: 22, signals: [] },
        { domain: 'engagement', rawScore: 22, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, 'yellow', []);

      expect(result.riskTier).toBe('yellow');
      expect(result.tierChanged).toBe(false);
    });

    it('should immediately upgrade tier when score increases', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 60, signals: [] },
        { domain: 'grades', rawScore: 60, signals: [] },
        { domain: 'behaviour', rawScore: 60, signals: [] },
        { domain: 'wellbeing', rawScore: 60, signals: [] },
        { domain: 'engagement', rawScore: 60, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, 'green', []);

      expect(result.riskTier).toBe('red');
      expect(result.tierChanged).toBe(true);
    });

    it('should cap composite score at 100', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 100, signals: [] },
        { domain: 'grades', rawScore: 100, signals: [] },
        { domain: 'behaviour', rawScore: 100, signals: [] },
        { domain: 'wellbeing', rawScore: 100, signals: [] },
        { domain: 'engagement', rawScore: 100, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.compositeScore).toBe(100);
    });

    it('should build trend data', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 10, signals: [] },
        { domain: 'grades', rawScore: 10, signals: [] },
        { domain: 'behaviour', rawScore: 10, signals: [] },
        { domain: 'wellbeing', rawScore: 10, signals: [] },
        { domain: 'engagement', rawScore: 10, signals: [] },
      ];

      const trendHistory = [40, 45];
      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, trendHistory);

      expect(result.trendData).toContain(40);
      expect(result.trendData).toContain(45);
      expect(result.trendData).toContain(10);
    });

    it('should trim trend data to 30 entries', () => {
      const signals: SignalResult[] = [{ domain: 'attendance', rawScore: 50, signals: [] }];

      const trendHistory = Array(35).fill(50);
      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, trendHistory);

      expect(result.trendData).toHaveLength(30);
    });

    it('should build summary text', () => {
      const signals: SignalResult[] = [
        {
          domain: 'attendance',
          rawScore: 50,
          signals: [
            {
              signalType: 'consecutive_absences',
              severity: 'high',
              scoreContribution: 15,
              summaryFragment: 'Student has 3 consecutive absences.',
              domain: 'attendance',
            },
          ],
        },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.summaryText).toContain('Risk score');
      expect(result.signals).toHaveLength(1);
    });
  });

  describe('upsertRiskProfile', () => {
    it('should create new risk profile', async () => {
      mockPrisma.studentRiskProfile.upsert.mockResolvedValue({ id: 'profile-1' });

      const assessment = {
        compositeScore: 50,
        riskTier: 'amber' as RiskTier,
        domainScores: {
          attendance: 60,
          grades: 50,
          behaviour: 40,
          wellbeing: 50,
          engagement: 50,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 50.',
        trendData: [45, 50],
        tierChanged: true,
        previousTier: 'yellow' as RiskTier | null,
      };

      const result = await upsertRiskProfile(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        assessment,
      );

      expect(result).toBe('profile-1');
      expect(mockPrisma.studentRiskProfile.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            uq_risk_profile_tenant_student_year: {
              tenant_id: 'tenant-1',
              student_id: 'student-1',
              academic_year_id: 'year-1',
            },
          },
          create: expect.objectContaining({
            tenant_id: 'tenant-1',
            student_id: 'student-1',
            academic_year_id: 'year-1',
            composite_score: 50,
            risk_tier: 'amber',
          }),
          update: expect.objectContaining({
            composite_score: 50,
            risk_tier: 'amber',
          }),
        }),
      );
    });

    it('should update tier_entered_at when tier changes', async () => {
      mockPrisma.studentRiskProfile.upsert.mockResolvedValue({ id: 'profile-1' });

      const assessment = {
        compositeScore: 75,
        riskTier: 'red' as RiskTier,
        domainScores: {
          attendance: 80,
          grades: 70,
          behaviour: 75,
          wellbeing: 75,
          engagement: 75,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 75.',
        trendData: [],
        tierChanged: true,
        previousTier: 'amber' as RiskTier,
      };

      await upsertRiskProfile(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        assessment,
      );

      const call = mockPrisma.studentRiskProfile.upsert.mock.calls[0];
      expect(call[0].create.tier_entered_at).toBeDefined();
    });
  });

  describe('writeSignalAuditTrail', () => {
    it('should do nothing when no signals', async () => {
      await writeSignalAuditTrail(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        [],
      );

      expect(mockPrisma.studentRiskSignal.createMany).not.toHaveBeenCalled();
    });

    it('should write signals to audit table', async () => {
      const signals = [
        {
          signalType: 'attendance_rate_decline',
          severity: 'high' as const,
          scoreContribution: 15,
          summaryFragment: 'Attendance declined.',
          domain: 'attendance',
        },
        {
          signalType: 'grade_trajectory_decline',
          severity: 'medium' as const,
          scoreContribution: 10,
          summaryFragment: 'Grades declining.',
          domain: 'grades',
        },
      ];

      await writeSignalAuditTrail(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        signals,
      );

      expect(mockPrisma.studentRiskSignal.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              tenant_id: 'tenant-1',
              student_id: 'student-1',
              signal_type: 'attendance_rate_decline',
            }),
            expect.objectContaining({
              tenant_id: 'tenant-1',
              student_id: 'student-1',
              signal_type: 'grade_trajectory_decline',
            }),
          ]),
        }),
      );
    });
  });

  describe('logTierTransition', () => {
    it('should not route green tier transitions', async () => {
      const assessment = {
        compositeScore: 15,
        riskTier: 'green' as RiskTier,
        domainScores: {
          attendance: 15,
          grades: 15,
          behaviour: 15,
          wellbeing: 15,
          engagement: 15,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 15.',
        trendData: [],
        tierChanged: true,
        previousTier: 'yellow' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPrisma.earlyWarningTierTransition.create).toHaveBeenCalled();
    });

    it('should route yellow tier to homeroom teacher', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue({
        class_entity: {
          homeroom_teacher_staff_id: 'staff-1',
        },
      });

      mockPrisma.staffProfile.findUnique.mockResolvedValue({
        user_id: 'user-1',
      });

      const assessment = {
        compositeScore: 30,
        riskTier: 'yellow' as RiskTier,
        domainScores: {
          attendance: 30,
          grades: 30,
          behaviour: 30,
          wellbeing: 30,
          engagement: 30,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 30.',
        trendData: [],
        tierChanged: true,
        previousTier: 'green' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.classEnrolment.findFirst).toHaveBeenCalled();
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('should route amber tier via role lookup', async () => {
      mockPrisma.membershipRole.findFirst.mockResolvedValue({
        membership: {
          user_id: 'user-1',
        },
      });

      const assessment = {
        compositeScore: 55,
        riskTier: 'amber' as RiskTier,
        domainScores: {
          attendance: 55,
          grades: 55,
          behaviour: 55,
          wellbeing: 55,
          engagement: 55,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 55.',
        trendData: [],
        tierChanged: true,
        previousTier: 'yellow' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.membershipRole.findFirst).toHaveBeenCalled();
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('should route red tier to multiple roles', async () => {
      mockPrisma.membershipRole.findFirst
        .mockResolvedValueOnce({
          membership: { user_id: 'user-1' },
        })
        .mockResolvedValueOnce(null);

      const assessment = {
        compositeScore: 80,
        riskTier: 'red' as RiskTier,
        domainScores: {
          attendance: 80,
          grades: 80,
          behaviour: 80,
          wellbeing: 80,
          engagement: 80,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 80.',
        trendData: [],
        tierChanged: true,
        previousTier: 'amber' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.earlyWarningTierTransition.create).toHaveBeenCalled();
    });

    it('should not create notification when tier did not change', async () => {
      const assessment = {
        compositeScore: 30,
        riskTier: 'yellow' as RiskTier,
        domainScores: {
          attendance: 30,
          grades: 30,
          behaviour: 30,
          wellbeing: 30,
          engagement: 30,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 30.',
        trendData: [],
        tierChanged: false,
        previousTier: 'yellow' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('getActiveAcademicYear', () => {
    it('should return year where current date falls within range', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue({ id: 'year-1' });

      const result = await getActiveAcademicYear(mockPrisma as unknown as PrismaClient, 'tenant-1');

      expect(result).toEqual({ id: 'year-1' });
      expect(mockPrisma.academicYear.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: 'tenant-1',
            start_date: expect.any(Object),
            end_date: expect.any(Object),
          }),
        }),
      );
    });

    it('should fallback to most recent year when no exact match', async () => {
      mockPrisma.academicYear.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'year-2' });

      const result = await getActiveAcademicYear(mockPrisma as unknown as PrismaClient, 'tenant-1');

      expect(result).toEqual({ id: 'year-2' });
    });

    it('should return null when no academic years exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      const result = await getActiveAcademicYear(mockPrisma as unknown as PrismaClient, 'tenant-1');

      expect(result).toBeNull();
    });
  });

  describe('Risk Assessment - Additional Scenarios', () => {
    const weights: EarlyWarningWeights = {
      attendance: 25,
      grades: 25,
      behaviour: 20,
      wellbeing: 20,
      engagement: 10,
    };

    const thresholds: EarlyWarningThresholds = {
      green: 0,
      yellow: 30,
      amber: 50,
      red: 75,
    };

    it('should compute yellow tier assessment', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 35, signals: [] },
        { domain: 'grades', rawScore: 35, signals: [] },
        { domain: 'behaviour', rawScore: 35, signals: [] },
        { domain: 'wellbeing', rawScore: 35, signals: [] },
        { domain: 'engagement', rawScore: 35, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.riskTier).toBe('yellow');
      expect(result.tierChanged).toBe(true);
    });

    it('should compute amber tier assessment', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 55, signals: [] },
        { domain: 'grades', rawScore: 55, signals: [] },
        { domain: 'behaviour', rawScore: 55, signals: [] },
        { domain: 'wellbeing', rawScore: 55, signals: [] },
        { domain: 'engagement', rawScore: 55, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.riskTier).toBe('amber');
      expect(result.tierChanged).toBe(true);
    });

    it('should compute red tier assessment', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 80, signals: [] },
        { domain: 'grades', rawScore: 80, signals: [] },
        { domain: 'behaviour', rawScore: 80, signals: [] },
        { domain: 'wellbeing', rawScore: 80, signals: [] },
        { domain: 'engagement', rawScore: 80, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.riskTier).toBe('red');
      expect(result.tierChanged).toBe(true);
    });

    it('should apply cross-domain boost for 3 domains above threshold', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 50, signals: [] },
        { domain: 'grades', rawScore: 50, signals: [] },
        { domain: 'behaviour', rawScore: 50, signals: [] },
        { domain: 'wellbeing', rawScore: 10, signals: [] },
        { domain: 'engagement', rawScore: 10, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.crossDomainBoost).toBe(5);
    });

    it('should apply cross-domain boost for 4 domains above threshold', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 50, signals: [] },
        { domain: 'grades', rawScore: 50, signals: [] },
        { domain: 'behaviour', rawScore: 50, signals: [] },
        { domain: 'wellbeing', rawScore: 50, signals: [] },
        { domain: 'engagement', rawScore: 10, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.crossDomainBoost).toBe(10);
    });

    it('should apply cross-domain boost for all 5 domains above threshold', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 50, signals: [] },
        { domain: 'grades', rawScore: 50, signals: [] },
        { domain: 'behaviour', rawScore: 50, signals: [] },
        { domain: 'wellbeing', rawScore: 50, signals: [] },
        { domain: 'engagement', rawScore: 50, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.crossDomainBoost).toBe(15);
    });

    it('should handle empty signals array', () => {
      const signals: SignalResult[] = [];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.compositeScore).toBe(0);
      expect(result.riskTier).toBe('green');
    });

    it('should not apply cross-domain boost when fewer than 3 domains above threshold', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 50, signals: [] },
        { domain: 'grades', rawScore: 10, signals: [] },
        { domain: 'behaviour', rawScore: 10, signals: [] },
        { domain: 'wellbeing', rawScore: 10, signals: [] },
        { domain: 'engagement', rawScore: 10, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.crossDomainBoost).toBe(0);
    });

    it('should maintain same tier when score stays within hysteresis buffer', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 28, signals: [] },
        { domain: 'grades', rawScore: 28, signals: [] },
        { domain: 'behaviour', rawScore: 28, signals: [] },
        { domain: 'wellbeing', rawScore: 28, signals: [] },
        { domain: 'engagement', rawScore: 28, signals: [] },
      ];

      // Starting from yellow, score 28 is above yellow threshold (30) - wait, 28 < 30
      // So raw tier would be green, but with hysteresis line at 25, score 28 > 25
      // Should stay in yellow
      const result = computeRiskAssessment(signals, weights, thresholds, 5, 'yellow', []);

      expect(result.riskTier).toBe('yellow');
      expect(result.tierChanged).toBe(false);
    });

    it('should stay in same tier when composite score does not cross threshold', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 35, signals: [] },
        { domain: 'grades', rawScore: 35, signals: [] },
        { domain: 'behaviour', rawScore: 35, signals: [] },
        { domain: 'wellbeing', rawScore: 35, signals: [] },
        { domain: 'engagement', rawScore: 35, signals: [] },
      ];

      // Score 35 is in yellow tier, starting from yellow
      // Should stay in yellow without change
      const result = computeRiskAssessment(signals, weights, thresholds, 5, 'yellow', []);

      expect(result.riskTier).toBe('yellow');
      expect(result.tierChanged).toBe(false);
    });

    it('should downgrade through multiple tiers with sufficient score drop', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 15, signals: [] },
        { domain: 'grades', rawScore: 15, signals: [] },
        { domain: 'behaviour', rawScore: 15, signals: [] },
        { domain: 'wellbeing', rawScore: 15, signals: [] },
        { domain: 'engagement', rawScore: 15, signals: [] },
      ];

      // Score 15 is in green tier, with hysteresis buffer of 5
      // Amber threshold is 50, hysteresis line is 45
      // Score 15 <= 45, should drop to green
      const result = computeRiskAssessment(signals, weights, thresholds, 5, 'red', []);

      expect(result.riskTier).toBe('green');
      expect(result.tierChanged).toBe(true);
    });

    it('should upgrade from green to yellow immediately', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 35, signals: [] },
        { domain: 'grades', rawScore: 35, signals: [] },
        { domain: 'behaviour', rawScore: 35, signals: [] },
        { domain: 'wellbeing', rawScore: 35, signals: [] },
        { domain: 'engagement', rawScore: 35, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, 'green', []);

      expect(result.riskTier).toBe('yellow');
      expect(result.tierChanged).toBe(true);
    });

    it('should upgrade through multiple tiers in one step', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 85, signals: [] },
        { domain: 'grades', rawScore: 85, signals: [] },
        { domain: 'behaviour', rawScore: 85, signals: [] },
        { domain: 'wellbeing', rawScore: 85, signals: [] },
        { domain: 'engagement', rawScore: 85, signals: [] },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, 'green', []);

      expect(result.riskTier).toBe('red');
      expect(result.tierChanged).toBe(true);
    });
  });

  describe('Risk Assessment - Summary Builder', () => {
    const weights: EarlyWarningWeights = {
      attendance: 20,
      grades: 20,
      behaviour: 20,
      wellbeing: 20,
      engagement: 20,
    };

    const thresholds: EarlyWarningThresholds = {
      green: 0,
      yellow: 25,
      amber: 50,
      red: 75,
    };

    it('should generate summary with increasing trend', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 45, signals: [] },
        { domain: 'grades', rawScore: 45, signals: [] },
        { domain: 'behaviour', rawScore: 45, signals: [] },
        { domain: 'wellbeing', rawScore: 45, signals: [] },
        { domain: 'engagement', rawScore: 45, signals: [] },
      ];

      const trendHistory = [20, 25, 30];
      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, trendHistory);

      expect(result.summaryText).toContain('increased');
    });

    it('should generate summary with decreasing trend', () => {
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 25, signals: [] },
        { domain: 'grades', rawScore: 25, signals: [] },
        { domain: 'behaviour', rawScore: 25, signals: [] },
        { domain: 'wellbeing', rawScore: 25, signals: [] },
        { domain: 'engagement', rawScore: 25, signals: [] },
      ];

      const trendHistory = [55, 50, 45];
      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, trendHistory);

      expect(result.summaryText).toContain('decreased');
    });

    it('should generate summary with stable trend', () => {
      // For stability: trendHistory average should be within 5 of currentScore
      // Score needs to be < 40 to avoid cross-domain boost
      const signals: SignalResult[] = [
        { domain: 'attendance', rawScore: 30, signals: [] },
        { domain: 'grades', rawScore: 30, signals: [] },
        { domain: 'behaviour', rawScore: 30, signals: [] },
        { domain: 'wellbeing', rawScore: 30, signals: [] },
        { domain: 'engagement', rawScore: 30, signals: [] },
      ];

      // Average of [27, 29, 30, 31, 33] = 30, composite will be 30, diff = 0 < 5
      const trendHistory = [27, 29, 30, 31, 33];
      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, trendHistory);

      expect(result.summaryText).toContain('stable');
    });

    it('should include top signals in summary', () => {
      const signals: SignalResult[] = [
        {
          domain: 'attendance',
          rawScore: 50,
          signals: [
            {
              signalType: 'consecutive_absences',
              severity: 'high',
              scoreContribution: 20,
              summaryFragment: 'Student has 3 consecutive absences.',
              domain: 'attendance',
              details: {},
              sourceEntityType: 'attendance',
              sourceEntityId: 'att-1',
            },
            {
              signalType: 'attendance_rate_decline',
              severity: 'medium',
              scoreContribution: 10,
              summaryFragment: 'Attendance rate has declined by 15%.',
              domain: 'attendance',
              details: {},
              sourceEntityType: 'attendance',
              sourceEntityId: 'att-2',
            },
          ],
        },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      expect(result.summaryText).toContain('consecutive absences');
      expect(result.summaryText).toContain('declined by 15%');
    });

    it('should include all signals in assessment', () => {
      const signals: SignalResult[] = [
        {
          domain: 'attendance',
          rawScore: 50,
          signals: Array.from({ length: 10 }, (_, i) => ({
            signalType: `signal_${i}`,
            severity: 'medium',
            scoreContribution: i * 5,
            summaryFragment: `Signal ${i} fragment.`,
            domain: 'attendance',
            details: {},
            sourceEntityType: 'test',
            sourceEntityId: `id-${i}`,
          })),
        },
      ];

      const result = computeRiskAssessment(signals, weights, thresholds, 5, null, []);

      // All signals should be included in the assessment
      expect(result.signals).toHaveLength(10);
      // Signals are concatenated in order (not sorted at this level)
      expect(result.signals[0].scoreContribution).toBe(0);
      expect(result.signals[9].scoreContribution).toBe(45);
    });
  });

  describe('Signal Audit Trail', () => {
    it('should write signals with details', async () => {
      const signals = [
        {
          signalType: 'attendance_rate_decline',
          severity: 'high' as const,
          scoreContribution: 15,
          summaryFragment: 'Attendance declined.',
          domain: 'attendance',
          details: { declinePercentage: 15, previousRate: 85 },
          sourceEntityType: 'attendance',
          sourceEntityId: 'att-1',
        },
      ];

      await writeSignalAuditTrail(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        signals,
      );

      expect(mockPrisma.studentRiskSignal.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              tenant_id: 'tenant-1',
              student_id: 'student-1',
              signal_type: 'attendance_rate_decline',
              details_json: { declinePercentage: 15, previousRate: 85 },
              source_entity_type: 'attendance',
              source_entity_id: 'att-1',
            }),
          ]),
        }),
      );
    });
  });

  describe('Tier Transition - Advanced Scenarios', () => {
    it('should not create notification when tier did not change', async () => {
      mockPrisma.classEnrolment.findFirst.mockResolvedValue({
        class_entity: {
          homeroom_teacher_staff_id: 'staff-1',
        },
      });

      mockPrisma.staffProfile.findUnique.mockResolvedValue({
        user_id: 'user-1',
      });

      const assessment = {
        compositeScore: 30,
        riskTier: 'yellow' as RiskTier,
        domainScores: {
          attendance: 30,
          grades: 30,
          behaviour: 30,
          wellbeing: 30,
          engagement: 30,
        },
        crossDomainBoost: 0,
        signals: [
          {
            signalType: 'consecutive_absences',
            severity: 'high' as const,
            scoreContribution: 15,
            summaryFragment: 'Student has absences.',
            domain: 'attendance',
            details: {},
            sourceEntityType: 'attendance',
            sourceEntityId: 'att-1',
          },
        ],
        summaryText: 'Risk score is 30.',
        trendData: [],
        tierChanged: false,
        previousTier: 'yellow' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPrisma.earlyWarningTierTransition.create).toHaveBeenCalled();
    });

    it('should handle no user found for routing', async () => {
      mockPrisma.membershipRole.findFirst.mockResolvedValue(null);

      const assessment = {
        compositeScore: 55,
        riskTier: 'amber' as RiskTier,
        domainScores: {
          attendance: 55,
          grades: 55,
          behaviour: 55,
          wellbeing: 55,
          engagement: 55,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 55.',
        trendData: [],
        tierChanged: true,
        previousTier: 'yellow' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.earlyWarningTierTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            routed_to_user_id: undefined,
          }),
        }),
      );
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should route to first available role for red tier', async () => {
      mockPrisma.membershipRole.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        membership: { user_id: 'pastoral-user' },
      });

      const assessment = {
        compositeScore: 80,
        riskTier: 'red' as RiskTier,
        domainScores: {
          attendance: 80,
          grades: 80,
          behaviour: 80,
          wellbeing: 80,
          engagement: 80,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 80.',
        trendData: [],
        tierChanged: true,
        previousTier: 'amber' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            recipient_user_id: 'pastoral-user',
          }),
        }),
      );
    });

    it('should handle transition with null previous tier', async () => {
      const assessment = {
        compositeScore: 30,
        riskTier: 'yellow' as RiskTier,
        domainScores: {
          attendance: 30,
          grades: 30,
          behaviour: 30,
          wellbeing: 30,
          engagement: 30,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 30.',
        trendData: [],
        tierChanged: true,
        previousTier: null,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.earlyWarningTierTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            from_tier: null,
          }),
        }),
      );
    });

    it('should include top signals in transition trigger data', async () => {
      mockPrisma.membershipRole.findFirst.mockResolvedValue({
        membership: { user_id: 'user-1' },
      });

      const assessment = {
        compositeScore: 55,
        riskTier: 'amber' as RiskTier,
        domainScores: {
          attendance: 55,
          grades: 55,
          behaviour: 55,
          wellbeing: 55,
          engagement: 55,
        },
        crossDomainBoost: 0,
        signals: [
          {
            signalType: 'consecutive_absences',
            severity: 'high' as const,
            scoreContribution: 25,
            summaryFragment: 'Test signal.',
            domain: 'attendance',
            details: {},
            sourceEntityType: 'test',
            sourceEntityId: 'test-1',
          },
        ],
        summaryText: 'Risk score is 55.',
        trendData: [],
        tierChanged: true,
        previousTier: 'yellow' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      expect(mockPrisma.earlyWarningTierTransition.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            trigger_signals_json: expect.objectContaining({
              signals: expect.arrayContaining([
                expect.objectContaining({
                  signalType: 'consecutive_absences',
                }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  describe('Risk Profile - Additional Scenarios', () => {
    it('should handle assessment without tier change', async () => {
      mockPrisma.studentRiskProfile.upsert.mockResolvedValue({ id: 'profile-1' });

      const assessment = {
        compositeScore: 50,
        riskTier: 'amber' as RiskTier,
        domainScores: {
          attendance: 60,
          grades: 50,
          behaviour: 40,
          wellbeing: 50,
          engagement: 50,
        },
        crossDomainBoost: 0,
        signals: [],
        summaryText: 'Risk score is 50.',
        trendData: [45, 50],
        tierChanged: false,
        previousTier: 'amber' as RiskTier,
      };

      await upsertRiskProfile(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        assessment,
      );

      const call = mockPrisma.studentRiskProfile.upsert.mock.calls[0];
      expect(call[0].update.tier_entered_at).toBeUndefined();
    });

    it('should include top signals in profile', async () => {
      mockPrisma.studentRiskProfile.upsert.mockResolvedValue({ id: 'profile-1' });

      const assessment = {
        compositeScore: 50,
        riskTier: 'amber' as RiskTier,
        domainScores: {
          attendance: 60,
          grades: 50,
          behaviour: 40,
          wellbeing: 50,
          engagement: 50,
        },
        crossDomainBoost: 0,
        signals: [
          {
            signalType: 'consecutive_absences',
            severity: 'high' as const,
            scoreContribution: 20,
            summaryFragment: 'Student has consecutive absences.',
            domain: 'attendance',
            details: {},
            sourceEntityType: 'attendance',
            sourceEntityId: 'att-1',
          },
        ],
        summaryText: 'Risk score is 50.',
        trendData: [45, 50],
        tierChanged: true,
        previousTier: 'yellow' as RiskTier,
      };

      await upsertRiskProfile(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        assessment,
      );

      const call = mockPrisma.studentRiskProfile.upsert.mock.calls[0];
      expect(call[0].create.signal_summary_json.topSignals).toHaveLength(1);
      expect(call[0].create.signal_summary_json.topSignals[0]).toEqual(
        expect.objectContaining({
          signalType: 'consecutive_absences',
          domain: 'attendance',
          severity: 'high',
          scoreContribution: 20,
        }),
      );
    });

    it('should sort top signals by score contribution before slicing', async () => {
      mockPrisma.studentRiskProfile.upsert.mockResolvedValue({ id: 'profile-1' });

      const assessment = {
        compositeScore: 50,
        riskTier: 'amber' as RiskTier,
        domainScores: {
          attendance: 60,
          grades: 50,
          behaviour: 40,
          wellbeing: 50,
          engagement: 50,
        },
        crossDomainBoost: 0,
        signals: [
          {
            signalType: 'low_severity_signal',
            severity: 'low' as const,
            scoreContribution: 5,
            summaryFragment: 'Low severity.',
            domain: 'attendance',
            details: {},
            sourceEntityType: 'test',
            sourceEntityId: 'id-1',
          },
          {
            signalType: 'critical_signal',
            severity: 'critical' as const,
            scoreContribution: 45,
            summaryFragment: 'Critical issue.',
            domain: 'behaviour',
            details: {},
            sourceEntityType: 'test',
            sourceEntityId: 'id-2',
          },
          {
            signalType: 'medium_signal',
            severity: 'medium' as const,
            scoreContribution: 25,
            summaryFragment: 'Medium issue.',
            domain: 'grades',
            details: {},
            sourceEntityType: 'test',
            sourceEntityId: 'id-3',
          },
        ],
        summaryText: 'Risk score is 50.',
        trendData: [45, 50],
        tierChanged: true,
        previousTier: 'yellow' as RiskTier,
      };

      await upsertRiskProfile(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        assessment,
      );

      const call = mockPrisma.studentRiskProfile.upsert.mock.calls[0];
      const topSignals = call[0].create.signal_summary_json.topSignals;

      // Should be sorted by scoreContribution (highest first)
      expect(topSignals[0].signalType).toBe('critical_signal');
      expect(topSignals[0].scoreContribution).toBe(45);
      expect(topSignals[1].signalType).toBe('medium_signal');
      expect(topSignals[1].scoreContribution).toBe(25);
      expect(topSignals[2].signalType).toBe('low_severity_signal');
      expect(topSignals[2].scoreContribution).toBe(5);
    });

    it('should include trigger signals sorted by contribution in transition', async () => {
      mockPrisma.membershipRole.findFirst.mockResolvedValue({
        membership: { user_id: 'user-1' },
      });

      const assessment = {
        compositeScore: 55,
        riskTier: 'amber' as RiskTier,
        domainScores: {
          attendance: 55,
          grades: 55,
          behaviour: 55,
          wellbeing: 55,
          engagement: 55,
        },
        crossDomainBoost: 0,
        signals: [
          {
            signalType: 'low_priority',
            severity: 'low' as const,
            scoreContribution: 10,
            summaryFragment: 'Low priority.',
            domain: 'attendance',
            details: {},
            sourceEntityType: 'test',
            sourceEntityId: 'id-1',
          },
          {
            signalType: 'high_priority',
            severity: 'high' as const,
            scoreContribution: 30,
            summaryFragment: 'High priority.',
            domain: 'behaviour',
            details: {},
            sourceEntityType: 'test',
            sourceEntityId: 'id-2',
          },
        ],
        summaryText: 'Risk score is 55.',
        trendData: [],
        tierChanged: true,
        previousTier: 'yellow' as RiskTier,
      };

      const routingRules = {
        yellow: { role: 'homeroom_teacher' },
        amber: { role: 'year_head' },
        red: { roles: ['principal', 'pastoral_lead'] },
      };

      await logTierTransition(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'profile-1',
        assessment,
        routingRules,
      );

      const call = mockPrisma.earlyWarningTierTransition.create.mock.calls[0];
      const triggerSignals = call[0].data.trigger_signals_json.signals;

      // Should be sorted by scoreContribution (highest first)
      expect(triggerSignals[0].signalType).toBe('high_priority');
      expect(triggerSignals[0].scoreContribution).toBe(30);
      expect(triggerSignals[1].signalType).toBe('low_priority');
      expect(triggerSignals[1].scoreContribution).toBe(10);
    });

    it('should infer domain from signal type', async () => {
      const signals = [
        {
          signalType: 'attendance_rate_decline',
          severity: 'high' as const,
          scoreContribution: 15,
          summaryFragment: 'Attendance declined.',
          domain: 'attendance',
          details: {},
          sourceEntityType: 'attendance',
          sourceEntityId: 'att-1',
        },
        {
          signalType: 'grade_trajectory_decline',
          severity: 'medium' as const,
          scoreContribution: 10,
          summaryFragment: 'Grades declining.',
          domain: 'grades',
          details: {},
          sourceEntityType: 'grades',
          sourceEntityId: 'grade-1',
        },
      ];

      await writeSignalAuditTrail(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        signals,
      );

      const call = mockPrisma.studentRiskSignal.createMany.mock.calls[0];
      const createdData = call[0].data;

      // Verify domain inference based on signal type
      expect(createdData[0].domain).toBe('attendance');
      expect(createdData[1].domain).toBe('grades');
    });

    it('should handle unknown signal types with default domain', async () => {
      const signals = [
        {
          signalType: 'unknown_signal_type',
          severity: 'high' as const,
          scoreContribution: 15,
          summaryFragment: 'Unknown signal.',
          domain: 'unknown',
          details: {},
          sourceEntityType: 'test',
          sourceEntityId: 'test-1',
        },
      ];

      await writeSignalAuditTrail(
        mockPrisma as unknown as PrismaClient,
        'tenant-1',
        'student-1',
        'year-1',
        signals,
      );

      const call = mockPrisma.studentRiskSignal.createMany.mock.calls[0];
      const createdData = call[0].data;

      // Unknown signal types should default to 'attendance'
      expect(createdData[0].domain).toBe('attendance');
    });
  });
});
