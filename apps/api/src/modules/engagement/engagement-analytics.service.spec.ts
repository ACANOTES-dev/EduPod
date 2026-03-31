import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { EngagementAnalyticsService } from './engagement-analytics.service';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_ID = '00000000-0000-0000-0000-000000000010';
const TEMPLATE_ID = '00000000-0000-0000-0000-000000000020';
const ACADEMIC_YEAR_ID = '00000000-0000-0000-0000-000000000030';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPrisma = {
  engagementEvent: {
    count: jest.fn(),
    groupBy: jest.fn(),
    findMany: jest.fn(),
  },
  engagementFormSubmission: {
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  engagementFormTemplate: {
    findMany: jest.fn(),
  },
};

describe('EngagementAnalyticsService', () => {
  let service: EngagementAnalyticsService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [EngagementAnalyticsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<EngagementAnalyticsService>(EngagementAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getOverview', () => {
    it('returns aggregate analytics and outstanding items', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValue(2);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([
        {
          event_type: 'school_trip',
          _count: { _all: 2 },
        },
      ]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([
        {
          created_at: new Date('2026-01-02T10:00:00.000Z'),
          submitted_at: new Date('2026-01-03T10:00:00.000Z'),
        },
      ]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Galway Trip',
          title_ar: 'رحلة غالواي',
          event_type: 'school_trip',
          start_date: new Date('2026-01-10T00:00:00.000Z'),
          end_date: new Date('2026-01-11T00:00:00.000Z'),
          consent_deadline: new Date('2026-01-08T00:00:00.000Z'),
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([
          {
            event_id: EVENT_ID,
            status: 'submitted',
            _count: { _all: 3 },
          },
          {
            event_id: EVENT_ID,
            status: 'pending',
            _count: { _all: 1 },
          },
        ])
        .mockResolvedValueOnce([
          {
            form_template_id: TEMPLATE_ID,
            status: 'submitted',
            _count: { _all: 5 },
          },
          {
            form_template_id: TEMPLATE_ID,
            status: 'expired',
            _count: { _all: 1 },
          },
          {
            form_template_id: TEMPLATE_ID,
            status: 'pending',
            _count: { _all: 2 },
          },
        ]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([
        {
          id: TEMPLATE_ID,
          name: 'Medical Consent',
          form_type: 'consent_form',
        },
      ]);

      const result = await service.getOverview(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
      });

      expect(result.summary).toEqual({
        total_events: 2,
        total_forms_distributed: 8,
        total_submissions: 5,
        average_response_time_hours: 24,
        average_completion_rate_pct: 62.5,
        outstanding_action_items_count: 3,
      });
      expect(result.events_by_type).toEqual([
        {
          event_type: 'school_trip',
          total: 2,
        },
      ]);
      expect(result.response_time_trend).toEqual([
        {
          bucket: '2026-01',
          submissions: 1,
          average_response_time_hours: 24,
        },
      ]);
      expect(result.outstanding_items).toEqual([
        expect.objectContaining({
          id: TEMPLATE_ID,
          kind: 'form',
          outstanding_count: 2,
          completion_percentage: 62.5,
        }),
        expect.objectContaining({
          id: EVENT_ID,
          kind: 'event',
          outstanding_count: 1,
          completion_percentage: 75,
        }),
      ]);
    });
  });

  describe('getCompletionRates', () => {
    it('aggregates completion by event type', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Galway Trip',
          title_ar: null,
          event_type: 'school_trip',
          start_date: new Date('2026-01-10T00:00:00.000Z'),
          end_date: new Date('2026-01-11T00:00:00.000Z'),
          consent_deadline: null,
          payment_deadline: null,
        },
        {
          id: '00000000-0000-0000-0000-000000000011',
          title: 'Burren Trip',
          title_ar: null,
          event_type: 'school_trip',
          start_date: new Date('2026-02-10T00:00:00.000Z'),
          end_date: new Date('2026-02-11T00:00:00.000Z'),
          consent_deadline: null,
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([
          {
            event_id: EVENT_ID,
            status: 'submitted',
            _count: { _all: 4 },
          },
          {
            event_id: '00000000-0000-0000-0000-000000000011',
            status: 'pending',
            _count: { _all: 2 },
          },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.event_type_completion).toEqual([
        {
          event_type: 'school_trip',
          total_events: 2,
          total_distributed: 6,
          submitted: 4,
          expired: 0,
          outstanding_count: 2,
          completion_percentage: 66.7,
        },
      ]);
    });
  });

  describe('getCalendarEvents', () => {
    it('maps calendar events with colours and event links', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Parent Evening',
          title_ar: 'لقاء أولياء الأمور',
          start_date: new Date('2026-03-12T00:00:00.000Z'),
          end_date: new Date('2026-03-12T00:00:00.000Z'),
          event_type: 'parent_conference',
          status: 'open',
          location: 'Hall',
          location_ar: 'القاعة',
        },
      ]);

      const result = await service.getCalendarEvents(TENANT_ID, {
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(mockPrisma.engagementEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: {
              in: ['published', 'open', 'closed', 'in_progress', 'completed'],
            },
          }),
        }),
      );
      expect(result).toEqual({
        data: [
          {
            id: EVENT_ID,
            title: 'Parent Evening',
            title_ar: 'لقاء أولياء الأمور',
            start_date: '2026-03-12T00:00:00.000Z',
            end_date: '2026-03-12T00:00:00.000Z',
            event_type: 'parent_conference',
            status: 'open',
            colour_code: '#7c3aed',
            location: 'Hall',
            location_ar: 'القاعة',
            href: `/engagement/events/${EVENT_ID}`,
          },
        ],
      });
    });
  });
});
