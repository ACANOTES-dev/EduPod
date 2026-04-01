import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourExportAnalyticsService } from './behaviour-export-analytics.service';
import { BehaviourIncidentAnalyticsService } from './behaviour-incident-analytics.service';
import { BehaviourSanctionAnalyticsService } from './behaviour-sanction-analytics.service';
import { BehaviourScopeService } from './behaviour-scope.service';
import { BehaviourStaffAnalyticsService } from './behaviour-staff-analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'u-1';
const PERMISSIONS = ['module.query'];

const NOW = new Date('2026-04-01T10:00:00.000Z');

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockPrismaService = {
  behaviourIncident: {
    findMany: jest.fn(),
  },
};

const mockScopeService = {
  getUserScope: jest.fn().mockResolvedValue({ scope: 'all' }),
  buildScopeFilter: jest.fn().mockReturnValue({}),
};

const mockIncidentAnalytics = {
  getCategories: jest.fn(),
};

const mockSanctionAnalytics = {
  getSanctions: jest.fn(),
  getInterventionOutcomes: jest.fn(),
};

const mockStaffAnalytics = {
  getStaffActivity: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('BehaviourExportAnalyticsService', () => {
  let service: BehaviourExportAnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BehaviourExportAnalyticsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: BehaviourScopeService, useValue: mockScopeService },
        { provide: BehaviourIncidentAnalyticsService, useValue: mockIncidentAnalytics },
        { provide: BehaviourSanctionAnalyticsService, useValue: mockSanctionAnalytics },
        { provide: BehaviourStaffAnalyticsService, useValue: mockStaffAnalytics },
      ],
    }).compile();

    service = module.get<BehaviourExportAnalyticsService>(BehaviourExportAnalyticsService);

    jest.clearAllMocks();
  });

  describe('exportCsv', () => {
    it('should export incidents CSV', async () => {
      mockPrismaService.behaviourIncident.findMany.mockResolvedValue([
        {
          incident_number: 'INC-001',
          occurred_at: NOW,
          category: { name: 'Disruption' },
          polarity: 'negative',
          severity: 3,
          status: 'closed',
          reported_by: { first_name: 'John', last_name: 'Doe' },
          participants: [{ student: { first_name: 'Alice', last_name: 'Smith' } }],
          description: 'Talking in class',
        },
      ]);

      const result = await service.exportCsv(TENANT_ID, USER_ID, PERMISSIONS, {
        exportType: 'incidents',
        exposureNormalised: false,
      });

      expect(mockPrismaService.behaviourIncident.findMany).toHaveBeenCalled();
      expect(result.filename).toMatch(/^behaviour-incidents-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.content).toContain(
        'Incident Number,Date,Category,Polarity,Severity,Status,Reported By,Students,Description',
      );
      expect(result.content).toContain(
        'INC-001,2026-04-01T10:00:00.000Z,Disruption,negative,3,closed,John Doe,Alice Smith,Talking in class',
      );
    });

    it('should export sanctions CSV', async () => {
      mockSanctionAnalytics.getSanctions.mockResolvedValue({
        entries: [{ sanction_type: 'detention', total: 10, served: 8, no_show: 2 }],
      });

      const result = await service.exportCsv(TENANT_ID, USER_ID, PERMISSIONS, {
        exportType: 'sanctions',
        exposureNormalised: false,
      });

      expect(mockSanctionAnalytics.getSanctions).toHaveBeenCalled();
      expect(result.filename).toMatch(/^behaviour-sanctions-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.content).toContain('Sanction Type,Total,Served,No Show');
      expect(result.content).toContain('detention,10,8,2');
    });

    it('should export interventions CSV', async () => {
      mockSanctionAnalytics.getInterventionOutcomes.mockResolvedValue({
        entries: [{ outcome: 'successful', count: 15, send_count: 5, non_send_count: 10 }],
      });

      const result = await service.exportCsv(TENANT_ID, USER_ID, PERMISSIONS, {
        exportType: 'interventions',
        exposureNormalised: false,
      });

      expect(mockSanctionAnalytics.getInterventionOutcomes).toHaveBeenCalled();
      expect(result.filename).toMatch(/^behaviour-interventions-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.content).toContain('Outcome,Count,SEND Count,Non-SEND Count');
      expect(result.content).toContain('successful,15,5,10');
    });

    it('should export categories CSV', async () => {
      mockIncidentAnalytics.getCategories.mockResolvedValue({
        categories: [
          { category_name: 'Disruption', polarity: 'negative', count: 20, rate_per_100: 4.5 },
        ],
      });

      const result = await service.exportCsv(TENANT_ID, USER_ID, PERMISSIONS, {
        exportType: 'categories',
        exposureNormalised: false,
      });

      expect(mockIncidentAnalytics.getCategories).toHaveBeenCalled();
      expect(result.filename).toMatch(/^behaviour-categories-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.content).toContain('Category,Polarity,Count,Rate per 100 Students');
      expect(result.content).toContain('Disruption,negative,20,4.5');
    });

    it('should export staff activity CSV', async () => {
      mockStaffAnalytics.getStaffActivity.mockResolvedValue({
        staff: [
          {
            staff_name: 'Jane Smith',
            last_7_days: 5,
            last_30_days: 20,
            total_year: 100,
            last_logged_at: '2026-04-01',
            inactive_flag: false,
          },
        ],
      });

      const result = await service.exportCsv(TENANT_ID, USER_ID, PERMISSIONS, {
        exportType: 'staff_activity',
        exposureNormalised: false,
      });

      expect(mockStaffAnalytics.getStaffActivity).toHaveBeenCalled();
      expect(result.filename).toMatch(/^behaviour-staff-activity-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.content).toContain(
        'Staff Name,Last 7 Days,Last 30 Days,Year Total,Last Logged At,Inactive',
      );
      expect(result.content).toContain('Jane Smith,5,20,100,2026-04-01,No');
    });

    it('should return empty CSV for unknown export type', async () => {
      const result = await service.exportCsv(TENANT_ID, USER_ID, PERMISSIONS, {
        exportType: 'unknown' as unknown as Record<string, unknown>,
        exposureNormalised: false,
      });

      expect(result.filename).toMatch(/^behaviour-export-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(result.content).toBe('');
    });
  });
});
