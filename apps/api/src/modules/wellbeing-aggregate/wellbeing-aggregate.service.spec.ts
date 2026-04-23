import { Test, TestingModule } from '@nestjs/testing';

import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { EarlyWarningReadFacade } from '../early-warning/early-warning-read.facade';
import { PastoralReadFacade } from '../pastoral/pastoral-read.facade';
import { SafeguardingReadFacade } from '../safeguarding/safeguarding-read.facade';
import { SenReadFacade } from '../sen/sen-read.facade';
import { StaffWellbeingReadFacade } from '../staff-wellbeing/staff-wellbeing-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { WellbeingAggregateService } from './wellbeing-aggregate.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ENABLED_ALL = [
  { module_key: 'behaviour', is_enabled: true },
  { module_key: 'pastoral', is_enabled: true },
  { module_key: 'early_warning', is_enabled: true },
  { module_key: 'staff_wellbeing', is_enabled: true },
];

function buildFacades() {
  return {
    behaviour: {
      countOpenIncidentsByPolarity: jest
        .fn()
        .mockResolvedValue({ total: 5, positive: 2, negative: 3 }),
      countOverdueSanctions: jest.fn().mockResolvedValue(4),
      countOverdueTasks: jest.fn().mockResolvedValue(7),
      countIncidentsAwaitingParentMeeting: jest.fn().mockResolvedValue(1),
      countPendingAppeals: jest.fn().mockResolvedValue(0),
      countBehaviourHub: jest.fn().mockResolvedValue(5),
      findRecentIncidentsForFeed: jest.fn().mockResolvedValue([
        {
          id: 'inc-1',
          incident_number: 'INC-00001',
          polarity: 'negative',
          description: 'Disruption',
          occurred_at: new Date('2026-04-19T10:00:00Z'),
          reported_by: { first_name: 'Alex', last_name: 'Rivera' },
        },
      ]),
      findRecentServedSanctions: jest.fn().mockResolvedValue([]),
      findRecentRecognitionAwards: jest.fn().mockResolvedValue([]),
    },
    pastoral: {
      countOpenCases: jest.fn().mockResolvedValue(3),
      countUnacknowledgedCriticalConcerns: jest.fn().mockResolvedValue(2),
      countPastoralHub: jest.fn().mockResolvedValue(3),
      findRecentConcernsForFeed: jest.fn().mockResolvedValue([
        {
          id: 'con-1',
          category: 'wellbeing',
          severity: 'elevated',
          occurred_at: new Date('2026-04-18T12:00:00Z'),
          author_masked: false,
          logged_by: { first_name: 'Nina', last_name: 'Khan' },
        },
      ]),
    },
    safeguarding: {
      countSlaBreaches: jest.fn().mockResolvedValue(2),
      findSlaBreachItems: jest.fn().mockResolvedValue([
        {
          id: 'sg-1',
          concern_number: 'SG-00001',
          severity: 'critical_sev',
          status: 'reported',
          sla_first_response_due: new Date('2026-04-17T09:00:00Z'),
          created_at: new Date('2026-04-16T09:00:00Z'),
        },
      ]),
      countSafeguardingHub: jest.fn().mockResolvedValue(4),
    },
    sen: {
      countSenHub: jest.fn().mockResolvedValue(7),
    },
    earlyWarning: {
      getAtRiskCounts: jest.fn().mockResolvedValue({ amber: 9, red: 3, total: 12 }),
      countEarlyWarningHub: jest.fn().mockResolvedValue(18),
    },
    staffWellbeing: {
      countActiveSurveys: jest.fn().mockResolvedValue(1),
      countStaffWellbeingHub: jest.fn().mockResolvedValue(1),
    },
    tenants: {
      findModules: jest.fn().mockResolvedValue(ENABLED_ALL),
    },
  };
}

describe('WellbeingAggregateService', () => {
  let service: WellbeingAggregateService;
  let facades: ReturnType<typeof buildFacades>;

  beforeEach(async () => {
    facades = buildFacades();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WellbeingAggregateService,
        { provide: BehaviourReadFacade, useValue: facades.behaviour },
        { provide: PastoralReadFacade, useValue: facades.pastoral },
        { provide: SafeguardingReadFacade, useValue: facades.safeguarding },
        { provide: SenReadFacade, useValue: facades.sen },
        { provide: EarlyWarningReadFacade, useValue: facades.earlyWarning },
        { provide: StaffWellbeingReadFacade, useValue: facades.staffWellbeing },
        { provide: TenantReadFacade, useValue: facades.tenants },
      ],
    }).compile();

    service = module.get<WellbeingAggregateService>(WellbeingAggregateService);
  });

  afterEach(() => jest.clearAllMocks());

  it('composes KPIs from per-module reads when all modules enabled', async () => {
    const result = await service.getDashboardSummary(TENANT_ID);

    expect(result.kpis.students_at_risk).toEqual({ amber: 9, red: 3, total: 12 });
    expect(result.kpis.open_incidents).toEqual({ total: 5, positive: 2, negative: 3 });
    expect(result.kpis.open_pastoral_cases).toBe(3);
    expect(result.kpis.overdue_actions).toEqual({
      sanctions: 4,
      tasks: 7,
      sla_breaches: 2,
      total: 13,
    });
  });

  it('populates hub_counts from each facade', async () => {
    const result = await service.getDashboardSummary(TENANT_ID);

    expect(result.hub_counts).toEqual({
      behaviour: 5,
      pastoral: 3,
      safeguarding: 4,
      sen: 7,
      early_warnings: 18,
      staff_wellbeing: 1,
    });
  });

  it('returns zeros for incident KPIs and logs a warning when behaviour read throws', async () => {
    facades.behaviour.countOpenIncidentsByPolarity.mockRejectedValueOnce(new Error('boom'));
    const warn = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    const result = await service.getDashboardSummary(TENANT_ID);

    expect(result.kpis.open_incidents).toEqual({ total: 0, positive: 0, negative: 0 });
    expect(warn).toHaveBeenCalled();
  });

  it('skips the early-warning read when the module is disabled for the tenant', async () => {
    facades.tenants.findModules.mockResolvedValueOnce([
      { module_key: 'behaviour', is_enabled: true },
      { module_key: 'pastoral', is_enabled: true },
      { module_key: 'early_warning', is_enabled: false },
      { module_key: 'staff_wellbeing', is_enabled: true },
    ]);

    const result = await service.getDashboardSummary(TENANT_ID);

    expect(facades.earlyWarning.getAtRiskCounts).not.toHaveBeenCalled();
    expect(result.kpis.students_at_risk).toEqual({ amber: 0, red: 0, total: 0 });
    expect(result.hub_counts.early_warnings).toBe(0);
  });

  it('always runs safeguarding reads regardless of module flags', async () => {
    facades.tenants.findModules.mockResolvedValueOnce([]);

    await service.getDashboardSummary(TENANT_ID);

    expect(facades.safeguarding.countSlaBreaches).toHaveBeenCalledWith(TENANT_ID);
    expect(facades.safeguarding.countSafeguardingHub).toHaveBeenCalledWith(TENANT_ID);
  });

  it('sorts pending_attention by severity then due_at and caps at 10 items', async () => {
    const result = await service.getDashboardSummary(TENANT_ID);

    expect(result.pending_attention.length).toBeLessThanOrEqual(10);
    expect(result.pending_attention[0]!.severity).toBe('critical');
  });

  it('sorts recent_activity by occurred_at descending and caps at 8 items', async () => {
    const result = await service.getDashboardSummary(TENANT_ID);

    expect(result.recent_activity.length).toBeLessThanOrEqual(8);
    for (let i = 1; i < result.recent_activity.length; i += 1) {
      const prev = new Date(result.recent_activity[i - 1]!.occurred_at).getTime();
      const curr = new Date(result.recent_activity[i]!.occurred_at).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it('passes tenantId through to every facade read', async () => {
    await service.getDashboardSummary(TENANT_ID);

    expect(facades.behaviour.countOpenIncidentsByPolarity).toHaveBeenCalledWith(TENANT_ID);
    expect(facades.pastoral.countOpenCases).toHaveBeenCalledWith(TENANT_ID);
    expect(facades.safeguarding.countSlaBreaches).toHaveBeenCalledWith(TENANT_ID);
    expect(facades.earlyWarning.getAtRiskCounts).toHaveBeenCalledWith(TENANT_ID);
    expect(facades.staffWellbeing.countStaffWellbeingHub).toHaveBeenCalledWith(TENANT_ID);
    expect(facades.tenants.findModules).toHaveBeenCalledWith(TENANT_ID);
  });

  it('masks pastoral concern authors when author_masked is true', async () => {
    facades.pastoral.findRecentConcernsForFeed.mockResolvedValueOnce([
      {
        id: 'con-1',
        category: 'wellbeing',
        severity: 'elevated',
        occurred_at: new Date('2026-04-18T12:00:00Z'),
        author_masked: true,
        logged_by: { first_name: 'Hidden', last_name: 'Name' },
      },
    ]);

    const result = await service.getDashboardSummary(TENANT_ID);
    const concernItem = result.recent_activity.find((a) => a.id === 'con-1');

    expect(concernItem).toBeDefined();
    expect(concernItem!.actor_name).toBeNull();
  });
});
