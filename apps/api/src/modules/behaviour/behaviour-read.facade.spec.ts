import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourReadFacade } from './behaviour-read.facade';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const INCIDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    behaviourIncidentParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourSanction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourAppeal: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourExclusionCase: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourRecognitionAward: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourIntervention: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourParentAcknowledgement: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourIncident: {
      count: jest.fn().mockResolvedValue(0),
    },
    behaviourPolicyRule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourPolicyEvaluation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BehaviourReadFacade', () => {
  let facade: BehaviourReadFacade;
  let prisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    prisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [BehaviourReadFacade, { provide: PrismaService, useValue: prisma }],
    }).compile();

    facade = module.get<BehaviourReadFacade>(BehaviourReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findIncidentsForStudent ───────────────────────────────────────────────

  describe('BehaviourReadFacade — findIncidentsForStudent', () => {
    it('should query behaviourIncidentParticipant with tenant_id and student_id', async () => {
      await facade.findIncidentsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        }),
      );
    });

    it('should return empty array when no participants exist', async () => {
      const result = await facade.findIncidentsForStudent(TENANT_ID, STUDENT_ID);
      expect(result).toEqual([]);
    });
  });

  // ─── findSanctionsForStudent ───────────────────────────────────────────────

  describe('BehaviourReadFacade — findSanctionsForStudent', () => {
    it('should query behaviourSanction with tenant_id and student_id', async () => {
      await facade.findSanctionsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        }),
      );
    });
  });

  // ─── findAppealsForStudent ─────────────────────────────────────────────────

  describe('BehaviourReadFacade — findAppealsForStudent', () => {
    it('should query behaviourAppeal with tenant_id and student_id', async () => {
      await facade.findAppealsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourAppeal.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        }),
      );
    });
  });

  // ─── findExclusionCasesForStudent ──────────────────────────────────────────

  describe('BehaviourReadFacade — findExclusionCasesForStudent', () => {
    it('should query behaviourExclusionCase with tenant_id and student_id', async () => {
      await facade.findExclusionCasesForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        }),
      );
    });
  });

  // ─── findRecognitionAwardsForStudent ──────────────────────────────────────

  describe('BehaviourReadFacade — findRecognitionAwardsForStudent', () => {
    it('should query behaviourRecognitionAward with tenant_id and student_id', async () => {
      await facade.findRecognitionAwardsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourRecognitionAward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        }),
      );
    });
  });

  // ─── findRecentIncidents ──────────────────────────────────────────────────

  describe('BehaviourReadFacade — findRecentIncidents', () => {
    it('should query with tenant_id and student_id', async () => {
      await facade.findRecentIncidents(TENANT_ID, STUDENT_ID, 14);

      expect(prisma.behaviourIncidentParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
          }),
        }),
      );
    });

    it('should apply a date filter for the time window', async () => {
      const before = new Date();
      await facade.findRecentIncidents(TENANT_ID, STUDENT_ID, 14);
      const after = new Date();

      const call = (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mock.calls[0][0] as {
        where: { incident: { occurred_at: { gte: Date } } };
      };
      const gte: Date = call.where.incident.occurred_at.gte;

      // cutoff should be ~14 days before now
      const expected14DaysAgo = new Date(before);
      expected14DaysAgo.setDate(expected14DaysAgo.getDate() - 14);
      const expected14DaysAgoEnd = new Date(after);
      expected14DaysAgoEnd.setDate(expected14DaysAgoEnd.getDate() - 14);

      expect(gte.getTime()).toBeGreaterThanOrEqual(expected14DaysAgo.getTime() - 1000);
      expect(gte.getTime()).toBeLessThanOrEqual(expected14DaysAgoEnd.getTime() + 1000);
    });

    it('should use a 30-day window when specified', async () => {
      const before = new Date();
      await facade.findRecentIncidents(TENANT_ID, STUDENT_ID, 30);

      const call = (prisma.behaviourIncidentParticipant.findMany as jest.Mock).mock.calls[0][0] as {
        where: { incident: { occurred_at: { gte: Date } } };
      };
      const gte: Date = call.where.incident.occurred_at.gte;

      const expected30DaysAgo = new Date(before);
      expected30DaysAgo.setDate(expected30DaysAgo.getDate() - 30);

      expect(gte.getTime()).toBeGreaterThanOrEqual(expected30DaysAgo.getTime() - 1000);
    });
  });

  // ─── findRecentSanctions ──────────────────────────────────────────────────

  describe('BehaviourReadFacade — findRecentSanctions', () => {
    it('should query with tenant_id, student_id, and a cutoff date', async () => {
      await facade.findRecentSanctions(TENANT_ID, STUDENT_ID, 30);

      const call = (prisma.behaviourSanction.findMany as jest.Mock).mock.calls[0][0] as {
        where: { tenant_id: string; student_id: string; created_at: { gte: Date } };
      };

      expect(call.where.tenant_id).toBe(TENANT_ID);
      expect(call.where.student_id).toBe(STUDENT_ID);
      expect(call.where.created_at.gte).toBeInstanceOf(Date);
    });
  });

  // ─── findInterventionsForStudent ──────────────────────────────────────────

  describe('BehaviourReadFacade — findInterventionsForStudent', () => {
    it('should query behaviourIntervention with tenant_id and student_id', async () => {
      await facade.findInterventionsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourIntervention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, student_id: STUDENT_ID },
        }),
      );
    });
  });

  // ─── findParentAcknowledgements ───────────────────────────────────────────

  describe('BehaviourReadFacade — findParentAcknowledgements', () => {
    it('should return empty array when student has no participant records', async () => {
      prisma.behaviourIncidentParticipant.findMany.mockResolvedValue([]);

      const result = await facade.findParentAcknowledgements(TENANT_ID, STUDENT_ID, 14);

      expect(result).toEqual([]);
      expect(prisma.behaviourParentAcknowledgement.findMany).not.toHaveBeenCalled();
    });

    it('should query acknowledgements filtered by incident ids and date window', async () => {
      prisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident_id: INCIDENT_ID },
      ]);

      await facade.findParentAcknowledgements(TENANT_ID, STUDENT_ID, 14);

      expect(prisma.behaviourParentAcknowledgement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            incident_id: { in: [INCIDENT_ID] },
          }),
        }),
      );
    });

    it('should apply sent_at date filter for the time window', async () => {
      prisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident_id: INCIDENT_ID },
      ]);

      const before = new Date();
      await facade.findParentAcknowledgements(TENANT_ID, STUDENT_ID, 14);

      const call = (prisma.behaviourParentAcknowledgement.findMany as jest.Mock).mock
        .calls[0][0] as {
        where: { sent_at: { gte: Date } };
      };
      const gte: Date = call.where.sent_at.gte;

      const expected14DaysAgo = new Date(before);
      expected14DaysAgo.setDate(expected14DaysAgo.getDate() - 14);

      expect(gte.getTime()).toBeGreaterThanOrEqual(expected14DaysAgo.getTime() - 1000);
    });
  });

  // ─── countIncidentsBeforeDate ─────────────────────────────────────────────

  describe('BehaviourReadFacade — countIncidentsBeforeDate', () => {
    it('should count incidents with tenant_id and created_at < cutoffDate', async () => {
      prisma.behaviourIncident.count.mockResolvedValue(42);
      const cutoff = new Date('2024-01-01');

      const result = await facade.countIncidentsBeforeDate(TENANT_ID, cutoff);

      expect(result).toBe(42);
      expect(prisma.behaviourIncident.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          created_at: { lt: cutoff },
        },
      });
    });
  });

  // ─── findSuspensionsForStudent ────────────────────────────────────────────

  describe('BehaviourReadFacade — findSuspensionsForStudent', () => {
    it('should filter by suspension types only', async () => {
      await facade.findSuspensionsForStudent(TENANT_ID, STUDENT_ID);

      expect(prisma.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            type: { in: ['suspension_internal', 'suspension_external'] },
          }),
        }),
      );
    });

    it('should apply date range filter when provided', async () => {
      const from = new Date('2024-09-01');
      const to = new Date('2024-12-31');

      await facade.findSuspensionsForStudent(TENANT_ID, STUDENT_ID, { from, to });

      expect(prisma.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            scheduled_date: { gte: from, lte: to },
          }),
        }),
      );
    });

    it('should not include scheduled_date filter when no date range provided', async () => {
      await facade.findSuspensionsForStudent(TENANT_ID, STUDENT_ID);

      const call = (prisma.behaviourSanction.findMany as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };

      expect(call.where).not.toHaveProperty('scheduled_date');
    });
  });

  // ─── findPolicyRules ──────────────────────────────────────────────────────

  describe('BehaviourReadFacade — findPolicyRules', () => {
    it('should query behaviourPolicyRule with tenant_id and is_active: true', async () => {
      await facade.findPolicyRules(TENANT_ID);

      expect(prisma.behaviourPolicyRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, is_active: true },
        }),
      );
    });
  });

  // ─── findPolicyEvaluationsForIncident ─────────────────────────────────────

  describe('BehaviourReadFacade — findPolicyEvaluationsForIncident', () => {
    it('should query behaviourPolicyEvaluation with tenant_id and incident_id', async () => {
      await facade.findPolicyEvaluationsForIncident(TENANT_ID, INCIDENT_ID);

      expect(prisma.behaviourPolicyEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, incident_id: INCIDENT_ID },
        }),
      );
    });
  });
});
