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
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourPolicyRule: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
    },
    behaviourPolicyEvaluation: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourPolicyRuleVersion: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    behaviourCategory: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    behaviourAttachment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourTask: {
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

  // ─── findPolicyEvaluationTrace ──────────────────────────────────────────

  describe('BehaviourReadFacade — findPolicyEvaluationTrace', () => {
    it('should include action_executions and rule_version', async () => {
      await facade.findPolicyEvaluationTrace(TENANT_ID, INCIDENT_ID);

      expect(prisma.behaviourPolicyEvaluation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, incident_id: INCIDENT_ID },
          include: expect.objectContaining({
            action_executions: expect.any(Object),
            rule_version: true,
          }),
        }),
      );
    });
  });

  // ─── findPolicyRuleById ─────────────────────────────────────────────────

  describe('BehaviourReadFacade — findPolicyRuleById', () => {
    it('should return null when rule does not exist', async () => {
      prisma.behaviourPolicyRule.findFirst.mockResolvedValue(null);

      const result = await facade.findPolicyRuleById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return the rule when found', async () => {
      const rule = { id: 'rule-1', name: 'Auto-escalate', is_active: true };
      prisma.behaviourPolicyRule.findFirst.mockResolvedValue(rule);

      const result = await facade.findPolicyRuleById(TENANT_ID, 'rule-1');

      expect(result).toEqual(rule);
      expect(prisma.behaviourPolicyRule.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rule-1', tenant_id: TENANT_ID },
        }),
      );
    });
  });

  // ─── findPolicyRulesPaginated ───────────────────────────────────────────

  describe('BehaviourReadFacade — findPolicyRulesPaginated', () => {
    it('should return paginated data with total', async () => {
      prisma.behaviourPolicyRule.findMany.mockResolvedValue([{ id: 'rule-1' }]);
      prisma.behaviourPolicyRule.count.mockResolvedValue(5);

      const result = await facade.findPolicyRulesPaginated(TENANT_ID, {}, { skip: 0, take: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(5);
    });

    it('should apply stage filter when provided', async () => {
      prisma.behaviourPolicyRule.findMany.mockResolvedValue([]);
      prisma.behaviourPolicyRule.count.mockResolvedValue(0);

      await facade.findPolicyRulesPaginated(TENANT_ID, { stage: 'pre_log' }, { skip: 0, take: 10 });

      expect(prisma.behaviourPolicyRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stage: 'pre_log' }),
        }),
      );
    });

    it('should apply is_active filter when provided', async () => {
      prisma.behaviourPolicyRule.findMany.mockResolvedValue([]);
      prisma.behaviourPolicyRule.count.mockResolvedValue(0);

      await facade.findPolicyRulesPaginated(TENANT_ID, { is_active: true }, { skip: 0, take: 10 });

      expect(prisma.behaviourPolicyRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ is_active: true }),
        }),
      );
    });
  });

  // ─── findPolicyRuleVersions ─────────────────────────────────────────────

  describe('BehaviourReadFacade — findPolicyRuleVersions', () => {
    it('should query versions by rule_id and tenant_id ordered desc', async () => {
      await facade.findPolicyRuleVersions(TENANT_ID, 'rule-1');

      expect(prisma.behaviourPolicyRuleVersion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rule_id: 'rule-1', tenant_id: TENANT_ID },
          orderBy: { version: 'desc' },
        }),
      );
    });
  });

  // ─── findPolicyRuleVersion ──────────────────────────────────────────────

  describe('BehaviourReadFacade — findPolicyRuleVersion', () => {
    it('should return null when version does not exist', async () => {
      prisma.behaviourPolicyRuleVersion.findFirst.mockResolvedValue(null);

      const result = await facade.findPolicyRuleVersion(TENANT_ID, 'rule-1', 99);

      expect(result).toBeNull();
    });

    it('should query by rule_id, tenant_id and version', async () => {
      const version = { id: 'v-1', version: 2, rule_id: 'rule-1' };
      prisma.behaviourPolicyRuleVersion.findFirst.mockResolvedValue(version);

      const result = await facade.findPolicyRuleVersion(TENANT_ID, 'rule-1', 2);

      expect(result).toEqual(version);
      expect(prisma.behaviourPolicyRuleVersion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rule_id: 'rule-1', tenant_id: TENANT_ID, version: 2 },
        }),
      );
    });
  });

  // ─── findCategories ─────────────────────────────────────────────────────

  describe('BehaviourReadFacade — findCategories', () => {
    it('should return categories with id and name', async () => {
      const cats = [{ id: 'cat-1', name: 'Disruption' }];
      prisma.behaviourCategory.findMany.mockResolvedValue(cats);

      const result = await facade.findCategories(TENANT_ID);

      expect(result).toEqual(cats);
      expect(prisma.behaviourCategory.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        select: { id: true, name: true },
      });
    });
  });

  // ─── findCategoryById ───────────────────────────────────────────────────

  describe('BehaviourReadFacade — findCategoryById', () => {
    it('should return null when category does not exist', async () => {
      prisma.behaviourCategory.findFirst.mockResolvedValue(null);

      const result = await facade.findCategoryById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return category name when found', async () => {
      prisma.behaviourCategory.findFirst.mockResolvedValue({ name: 'Praise' });

      const result = await facade.findCategoryById(TENANT_ID, 'cat-1');

      expect(result).toEqual({ name: 'Praise' });
    });
  });

  // ─── findIncidentsForReplay ─────────────────────────────────────────────

  describe('BehaviourReadFacade — findIncidentsForReplay', () => {
    it('should filter by date range and excluded statuses', async () => {
      const from = new Date('2026-01-01');
      const to = new Date('2026-03-31');

      await facade.findIncidentsForReplay(TENANT_ID, from, to, ['withdrawn']);

      expect(prisma.behaviourIncident.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            occurred_at: { gte: from, lte: to },
            status: { notIn: ['withdrawn'] },
          }),
        }),
      );
    });
  });

  // ─── findSanctionsForTusla ──────────────────────────────────────────────

  describe('BehaviourReadFacade — findSanctionsForTusla', () => {
    it('should filter by types and minimum suspension days', async () => {
      await facade.findSanctionsForTusla(TENANT_ID, {
        types: ['suspension_external'],
        minSuspensionDays: 20,
      });

      expect(prisma.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            type: { in: ['suspension_external'] },
            suspension_days: { gte: 20 },
          }),
        }),
      );
    });

    it('should apply date filter when provided', async () => {
      const dateFilter = { gte: new Date('2026-01-01'), lte: new Date('2026-06-30') };

      await facade.findSanctionsForTusla(TENANT_ID, {
        types: ['suspension_internal'],
        minSuspensionDays: 20,
        dateFilter,
      });

      expect(prisma.behaviourSanction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: dateFilter,
          }),
        }),
      );
    });

    it('should not include created_at when no dateFilter', async () => {
      await facade.findSanctionsForTusla(TENANT_ID, {
        types: ['suspension_external'],
        minSuspensionDays: 20,
      });

      const call = (prisma.behaviourSanction.findMany as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).not.toHaveProperty('created_at');
    });
  });

  // ─── findExclusionCasesForTusla ─────────────────────────────────────────

  describe('BehaviourReadFacade — findExclusionCasesForTusla', () => {
    it('should query exclusion cases with tenant filter', async () => {
      await facade.findExclusionCasesForTusla(TENANT_ID, {});

      expect(prisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
        }),
      );
    });

    it('should apply date filter when provided', async () => {
      const dateFilter = { gte: new Date('2026-01-01'), lte: new Date('2026-06-30') };

      await facade.findExclusionCasesForTusla(TENANT_ID, { dateFilter });

      expect(prisma.behaviourExclusionCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ created_at: dateFilter }),
        }),
      );
    });

    it('should not include created_at when no dateFilter', async () => {
      await facade.findExclusionCasesForTusla(TENANT_ID, {});

      const call = (prisma.behaviourExclusionCase.findMany as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).not.toHaveProperty('created_at');
    });
  });

  // ─── findAttachmentById ─────────────────────────────────────────────────

  describe('BehaviourReadFacade — findAttachmentById', () => {
    it('should return null when attachment does not exist', async () => {
      prisma.behaviourAttachment.findFirst.mockResolvedValue(null);

      const result = await facade.findAttachmentById(TENANT_ID, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return attachment when found', async () => {
      const attachment = { id: 'att-1', file_name: 'report.pdf' };
      prisma.behaviourAttachment.findFirst.mockResolvedValue(attachment);

      const result = await facade.findAttachmentById(TENANT_ID, 'att-1');

      expect(result).toEqual(attachment);
      expect(prisma.behaviourAttachment.findFirst).toHaveBeenCalledWith({
        where: { id: 'att-1', tenant_id: TENANT_ID },
      });
    });
  });

  // ─── findAttachmentsByEntity ────────────────────────────────────────────

  describe('BehaviourReadFacade — findAttachmentsByEntity', () => {
    it('should query by entity_type and entity_id', async () => {
      await facade.findAttachmentsByEntity(TENANT_ID, 'incident', INCIDENT_ID);

      expect(prisma.behaviourAttachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenant_id: TENANT_ID,
            entity_type: 'incident',
            entity_id: INCIDENT_ID,
          },
        }),
      );
    });
  });

  // ─── findOverdueTasksByEntityTypes ──────────────────────────────────────

  describe('BehaviourReadFacade — findOverdueTasksByEntityTypes', () => {
    it('should filter by entity types and overdue status', async () => {
      await facade.findOverdueTasksByEntityTypes(TENANT_ID, ['safeguarding_concern'], 10);

      expect(prisma.behaviourTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            entity_type: { in: ['safeguarding_concern'] },
            status: { in: ['pending', 'in_progress', 'overdue'] },
          }),
          take: 10,
        }),
      );
    });
  });
});
