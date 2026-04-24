import { Test, TestingModule } from '@nestjs/testing';
import { IncidentStatus } from '@prisma/client';

import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';

import { RegulatoryAntiBullyingService } from './regulatory-anti-bullying.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CAT_CYBER = 'cat-cyber';
const CAT_RACIST = 'cat-racist';

const buildMockFacade = () => ({
  findBullyingCategories: jest.fn().mockResolvedValue([]),
  findBullyingIncidentsInRange: jest.fn().mockResolvedValue([]),
  findLastBullyingIncident: jest.fn().mockResolvedValue(null),
  findRecentBullyingIncidents: jest.fn().mockResolvedValue([]),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RegulatoryAntiBullyingService', () => {
  let service: RegulatoryAntiBullyingService;
  let mockFacade: ReturnType<typeof buildMockFacade>;

  beforeEach(async () => {
    mockFacade = buildMockFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegulatoryAntiBullyingService,
        { provide: BehaviourReadFacade, useValue: mockFacade },
      ],
    }).compile();

    service = module.get(RegulatoryAntiBullyingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('RegulatoryAntiBullyingService — getSummary', () => {
    it('returns zero-state when the tenant has no bullying categories', async () => {
      mockFacade.findBullyingCategories.mockResolvedValueOnce([]);

      const summary = await service.getSummary(TENANT_ID);

      expect(summary.total_incidents).toBe(0);
      expect(summary.open).toBe(0);
      expect(summary.resolved).toBe(0);
      expect(summary.resolved_this_term).toBe(0);
      expect(summary.days_since_last_incident).toBeNull();
      expect(summary.recent_incidents).toEqual([]);
      expect(summary.by_category).toHaveLength(13);
      expect(summary.by_category.every((c) => c.count === 0 && c.trend === 'stable')).toBe(true);
      expect(summary.by_month).toHaveLength(12);

      expect(mockFacade.findBullyingIncidentsInRange).not.toHaveBeenCalled();
    });

    it('aggregates incidents by normalised category and computes KPIs', async () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const fortyFiveDaysAgo = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);

      mockFacade.findBullyingCategories.mockResolvedValueOnce([
        { id: CAT_CYBER, name: 'Cyberbullying' },
        { id: CAT_RACIST, name: 'Racist bullying' },
      ]);

      mockFacade.findBullyingIncidentsInRange.mockResolvedValueOnce([
        {
          id: 'inc-1',
          status: IncidentStatus.active,
          occurred_at: oneDayAgo,
          updated_at: oneDayAgo,
          category_id: CAT_CYBER,
        },
        {
          id: 'inc-2',
          status: IncidentStatus.resolved,
          occurred_at: tenDaysAgo,
          updated_at: tenDaysAgo,
          category_id: CAT_CYBER,
        },
        {
          id: 'inc-3',
          status: IncidentStatus.active,
          occurred_at: fortyFiveDaysAgo,
          updated_at: fortyFiveDaysAgo,
          category_id: CAT_RACIST,
        },
      ]);

      mockFacade.findRecentBullyingIncidents.mockResolvedValueOnce([
        {
          id: 'inc-1',
          incident_number: 'B-0001',
          occurred_at: oneDayAgo,
          status: IncidentStatus.active,
          category: { name: 'Cyberbullying' },
          participants: [{ student: { first_name: 'Ahmed', last_name: 'Khan' } }],
        },
      ]);

      mockFacade.findLastBullyingIncident.mockResolvedValueOnce({ occurred_at: oneDayAgo });

      const summary = await service.getSummary(TENANT_ID);

      expect(summary.total_incidents).toBe(3);
      expect(summary.open).toBe(2);
      expect(summary.resolved).toBe(1);
      expect(summary.days_since_last_incident).toBe(1);

      const cyber = summary.by_category.find((c) => c.category === 'cyberbullying');
      const racist = summary.by_category.find((c) => c.category === 'racist');
      expect(cyber?.count).toBe(2);
      expect(cyber?.trend).toBe('up');
      expect(racist?.count).toBe(1);

      expect(summary.recent_incidents).toHaveLength(1);
      expect(summary.recent_incidents[0]).toMatchObject({
        id: 'inc-1',
        incident_number: 'B-0001',
        student_name: 'Ahmed Khan',
        category_name: 'Cyberbullying',
        status: IncidentStatus.active,
      });
    });

    it('passes tenant and category filter to the behaviour facade', async () => {
      mockFacade.findBullyingCategories.mockResolvedValueOnce([
        { id: CAT_CYBER, name: 'Cyberbullying' },
      ]);

      await service.getSummary(TENANT_ID);

      expect(mockFacade.findBullyingCategories).toHaveBeenCalledWith(TENANT_ID);
      expect(mockFacade.findBullyingIncidentsInRange).toHaveBeenCalledWith(
        TENANT_ID,
        [CAT_CYBER],
        expect.any(Date),
        expect.any(Date),
        expect.arrayContaining([
          IncidentStatus.withdrawn,
          IncidentStatus.converted_to_safeguarding,
          IncidentStatus.superseded,
        ]),
      );
    });
  });
});
