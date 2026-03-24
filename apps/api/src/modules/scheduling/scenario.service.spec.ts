import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';

import { PrismaService } from '../prisma/prisma.service';

import { ScenarioService } from './scenario.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'user-1';
const ACADEMIC_YEAR_ID = 'ay-1';
const SCENARIO_ID = 'scenario-1';

const mockTx = {
  schedulingScenario: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

const makeDraftScenario = (status = 'draft') => ({
  id: SCENARIO_ID,
  name: 'Test Scenario',
  description: null,
  academic_year_id: ACADEMIC_YEAR_ID,
  base_run_id: null,
  adjustments_json: {},
  solver_result_json: null,
  status,
  created_by_user_id: USER_ID,
  created_at: new Date('2026-03-01'),
  updated_at: new Date('2026-03-01'),
});

describe('ScenarioService', () => {
  let service: ScenarioService;
  let mockPrisma: {
    academicYear: { findFirst: jest.Mock };
    schedulingRun: { findFirst: jest.Mock };
    schedulingScenario: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let mockQueue: { add: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      academicYear: {
        findFirst: jest.fn().mockResolvedValue({ id: ACADEMIC_YEAR_ID }),
      },
      schedulingRun: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      schedulingScenario: {
        findFirst: jest.fn().mockResolvedValue(makeDraftScenario()),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockQueue = { add: jest.fn().mockResolvedValue({}) };

    mockTx.schedulingScenario.create.mockResolvedValue({
      id: SCENARIO_ID,
      status: 'draft',
      created_at: new Date('2026-03-01'),
    });
    mockTx.schedulingScenario.update.mockResolvedValue({
      id: SCENARIO_ID,
      name: 'Updated',
      status: 'draft',
      updated_at: new Date('2026-03-02'),
    });
    mockTx.schedulingScenario.delete.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScenarioService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: getQueueToken('scheduling'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<ScenarioService>(ScenarioService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── createScenario ───────────────────────────────────────────────────────

  describe('createScenario', () => {
    it('should create a scenario in draft status', async () => {
      const result = await service.createScenario(TENANT_ID, USER_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        name: 'Test Scenario',
        adjustments: {},
      });

      expect(result.id).toBe(SCENARIO_ID);
      expect(result.status).toBe('draft');
      expect(mockTx.schedulingScenario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            name: 'Test Scenario',
            status: 'draft',
            created_by_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should throw NotFoundException when academic year does not exist', async () => {
      mockPrisma.academicYear.findFirst.mockResolvedValue(null);

      await expect(
        service.createScenario(TENANT_ID, USER_ID, {
          academic_year_id: 'nonexistent',
          name: 'Test',
          adjustments: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when base_run_id does not exist', async () => {
      mockPrisma.schedulingRun.findFirst.mockResolvedValue(null);

      await expect(
        service.createScenario(TENANT_ID, USER_ID, {
          academic_year_id: ACADEMIC_YEAR_ID,
          name: 'Test',
          base_run_id: 'nonexistent-run',
          adjustments: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getScenario ──────────────────────────────────────────────────────────

  describe('getScenario', () => {
    it('should return a formatted scenario', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(makeDraftScenario());

      const result = await service.getScenario(TENANT_ID, SCENARIO_ID);

      expect(result.id).toBe(SCENARIO_ID);
      expect(result.status).toBe('draft');
      expect(result.has_result).toBe(false);
    });

    it('should throw NotFoundException when scenario does not exist', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(null);

      await expect(service.getScenario(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should set has_result=true when solver_result_json is populated', async () => {
      const scenarioWithResult = {
        ...makeDraftScenario('solved'),
        solver_result_json: { entries_generated: 100, entries_unassigned: 0 },
      };
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(scenarioWithResult);

      const result = await service.getScenario(TENANT_ID, SCENARIO_ID);

      expect(result.has_result).toBe(true);
    });
  });

  // ─── updateScenario ───────────────────────────────────────────────────────

  describe('updateScenario', () => {
    it('should update a draft scenario', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(makeDraftScenario('draft'));

      const result = await service.updateScenario(TENANT_ID, SCENARIO_ID, { name: 'Updated' });

      expect(result.name).toBe('Updated');
      expect(mockTx.schedulingScenario.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException when scenario is approved', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(makeDraftScenario('approved'));

      await expect(
        service.updateScenario(TENANT_ID, SCENARIO_ID, { name: 'Updated' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when scenario does not exist', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(null);

      await expect(
        service.updateScenario(TENANT_ID, 'nonexistent', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── deleteScenario ───────────────────────────────────────────────────────

  describe('deleteScenario', () => {
    it('should delete a draft scenario', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(makeDraftScenario('draft'));

      const result = await service.deleteScenario(TENANT_ID, SCENARIO_ID);

      expect(result.deleted).toBe(true);
      expect(mockTx.schedulingScenario.delete).toHaveBeenCalled();
    });

    it('should throw BadRequestException when scenario is approved', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(makeDraftScenario('approved'));

      await expect(
        service.deleteScenario(TENANT_ID, SCENARIO_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── compareScenarios ─────────────────────────────────────────────────────

  describe('compareScenarios', () => {
    it('should return comparison data for all provided scenario IDs', async () => {
      mockPrisma.schedulingScenario.findMany.mockResolvedValue([
        makeDraftScenario('draft'),
        { ...makeDraftScenario('solved'), id: 'scenario-2', solver_result_json: { entries_generated: 80 } },
      ]);

      const result = await service.compareScenarios(TENANT_ID, {
        scenario_ids: [SCENARIO_ID, 'scenario-2'],
      });

      expect(result.scenarios).toHaveLength(2);
      const draftScenario = result.scenarios.find((s) => s.id === SCENARIO_ID);
      const solvedScenario = result.scenarios.find((s) => s.id === 'scenario-2');
      expect(draftScenario?.has_result).toBe(false);
      expect(solvedScenario?.has_result).toBe(true);
    });

    it('should throw NotFoundException when one or more scenarios are missing', async () => {
      // Only returns 1 of the 2 requested IDs
      mockPrisma.schedulingScenario.findMany.mockResolvedValue([makeDraftScenario()]);

      await expect(
        service.compareScenarios(TENANT_ID, {
          scenario_ids: [SCENARIO_ID, 'nonexistent'],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should extract metrics from solver_result_json', async () => {
      mockPrisma.schedulingScenario.findMany.mockResolvedValue([
        {
          ...makeDraftScenario('solved'),
          solver_result_json: {
            entries_generated: 200,
            entries_unassigned: 5,
            soft_preference_score: 80,
            hard_constraint_violations: 0,
          },
        },
      ]);

      const result = await service.compareScenarios(TENANT_ID, {
        scenario_ids: [SCENARIO_ID],
      });

      expect(result.scenarios[0]!.metrics).not.toBeNull();
      expect(result.scenarios[0]!.metrics?.entries_generated).toBe(200);
      expect(result.scenarios[0]!.metrics?.entries_unassigned).toBe(5);
    });
  });

  // ─── runScenarioSolver ────────────────────────────────────────────────────

  describe('runScenarioSolver', () => {
    it('should enqueue a solver job and return queued=true', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(makeDraftScenario());

      const result = await service.runScenarioSolver(TENANT_ID, SCENARIO_ID);

      expect(result.queued).toBe(true);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'scheduling:solve-scenario',
        expect.objectContaining({ tenant_id: TENANT_ID, scenario_id: SCENARIO_ID }),
      );
    });

    it('should throw NotFoundException when scenario does not exist', async () => {
      mockPrisma.schedulingScenario.findFirst.mockResolvedValue(null);

      await expect(
        service.runScenarioSolver(TENANT_ID, 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
