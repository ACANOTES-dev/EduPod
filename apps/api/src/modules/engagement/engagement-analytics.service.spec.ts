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

    it('edge: end_date falls back to start_date when null', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Sports Day',
          title_ar: null,
          start_date: new Date('2026-05-01T00:00:00.000Z'),
          end_date: null,
          event_type: 'sports_event',
          status: 'open',
          location: 'Field',
          location_ar: null,
        },
      ]);

      const result = await service.getCalendarEvents(TENANT_ID, {});

      expect(result.data[0]?.end_date).toBe('2026-05-01T00:00:00.000Z');
    });

    it('edge: start_date and end_date both null yields null', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'TBD Event',
          title_ar: null,
          start_date: null,
          end_date: null,
          event_type: 'in_school_event',
          status: 'published',
          location: null,
          location_ar: null,
        },
      ]);

      const result = await service.getCalendarEvents(TENANT_ID, {});

      expect(result.data[0]?.start_date).toBeNull();
      expect(result.data[0]?.end_date).toBeNull();
    });
  });

  // ─── getOverview — branch coverage additions ────────────────────────────────

  describe('getOverview — additional branches', () => {
    beforeEach(() => {
      // Base mocks for getOverview that return minimal data
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);
    });

    it('edge: average_completion_rate_pct is 0 when totalFormsDistributed is 0', async () => {
      const result = await service.getOverview(TENANT_ID, {});

      expect(result.summary.average_completion_rate_pct).toBe(0);
      expect(result.summary.average_response_time_hours).toBe(0);
    });

    // Tests for outstanding_items sort branches removed — mock setup requires
    // full getOverview orchestration which is non-trivial to mock correctly

    it('edge: response time row with null submitted_at is skipped in average calculation', async () => {
      jest.clearAllMocks();
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([
        {
          created_at: new Date('2026-01-01T10:00:00.000Z'),
          submitted_at: null,
        },
        {
          created_at: new Date('2026-01-01T10:00:00.000Z'),
          submitted_at: new Date('2026-01-01T22:00:00.000Z'),
        },
      ]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      const result = await service.getOverview(TENANT_ID, {});

      // 12h total / 2 rows = 6h
      expect(result.summary.average_response_time_hours).toBe(6);
    });

    it('edge: response_time_trend skips rows without submitted_at', async () => {
      jest.clearAllMocks();
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([
        {
          created_at: new Date('2026-01-01T00:00:00.000Z'),
          submitted_at: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      const result = await service.getOverview(TENANT_ID, {});

      expect(result.response_time_trend).toEqual([]);
    });
  });

  // ─── buildEventWhere / filter branches ──────────────────────────────────────

  describe('getOverview — filter branches', () => {
    it('should include event_type filter when provided', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      await service.getOverview(TENANT_ID, {
        event_type: 'school_trip',
      });

      expect(mockPrisma.engagementEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event_type: 'school_trip',
          }),
        }),
      );
    });

    it('should apply date_from only filter', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      await service.getOverview(TENANT_ID, {
        date_from: '2026-01-01',
      });

      // buildEventWhere should add AND with OR for date_from-only filter
      expect(mockPrisma.engagementEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    start_date: expect.objectContaining({ gte: expect.any(Date) }),
                  }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it('should apply date_to only filter', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      await service.getOverview(TENANT_ID, {
        date_to: '2026-12-31',
      });

      // buildEventWhere should add AND with OR for date_to-only filter
      expect(mockPrisma.engagementEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    start_date: expect.objectContaining({ lte: expect.any(Date) }),
                  }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });

    it('edge: invalid date string returns null from toStartOfDay', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      // Invalid date strings that produce NaN
      await service.getOverview(TENANT_ID, {
        date_from: 'not-a-date',
        date_to: 'also-invalid',
      });

      // No AND clause because both dates are invalid (NaN → null)
      expect(mockPrisma.engagementEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({
            AND: expect.anything(),
          }),
        }),
      );
    });
  });

  // ─── getCalendarColourCode — all branches ──────────────────────────────────

  describe('getCalendarEvents — colour code branches', () => {
    const buildCalendarEvent = (eventType: string) => ({
      id: EVENT_ID,
      title: 'Test',
      title_ar: null,
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      end_date: new Date('2026-01-01T00:00:00.000Z'),
      event_type: eventType,
      status: 'open',
      location: null,
      location_ar: null,
    });

    it('returns correct colour for school_trip', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([buildCalendarEvent('school_trip')]);
      const result = await service.getCalendarEvents(TENANT_ID, {});
      expect(result.data[0]?.colour_code).toBe('#2563eb');
    });

    it('returns correct colour for overnight_trip', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([buildCalendarEvent('overnight_trip')]);
      const result = await service.getCalendarEvents(TENANT_ID, {});
      expect(result.data[0]?.colour_code).toBe('#2563eb');
    });

    it('returns correct colour for policy_signoff', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([buildCalendarEvent('policy_signoff')]);
      const result = await service.getCalendarEvents(TENANT_ID, {});
      expect(result.data[0]?.colour_code).toBe('#d97706');
    });

    it('returns correct colour for sports_event', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([buildCalendarEvent('sports_event')]);
      const result = await service.getCalendarEvents(TENANT_ID, {});
      expect(result.data[0]?.colour_code).toBe('#16a34a');
    });

    it('returns correct colour for cultural_event', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([buildCalendarEvent('cultural_event')]);
      const result = await service.getCalendarEvents(TENANT_ID, {});
      expect(result.data[0]?.colour_code).toBe('#ea580c');
    });

    it('returns correct colour for after_school_activity', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        buildCalendarEvent('after_school_activity'),
      ]);
      const result = await service.getCalendarEvents(TENANT_ID, {});
      expect(result.data[0]?.colour_code).toBe('#0891b2');
    });

    it('returns default colour for in_school_event', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        buildCalendarEvent('in_school_event'),
      ]);
      const result = await service.getCalendarEvents(TENANT_ID, {});
      expect(result.data[0]?.colour_code).toBe('#475569');
    });
  });

  // ─── createStatusBucketMap — branch coverage ──────────────────────────────

  describe('getCompletionRates — bucket status branches', () => {
    // Removed: expired/acknowledged/revoked bucket tests — mock setup didn't match
    // the full getCompletionRates orchestration which requires additional query mocks

    it('edge: eventRows with no event_type are skipped in event_type_completion', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Misc Event',
          title_ar: null,
          event_type: null,
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.event_type_completion).toEqual([]);
    });

    it('edge: completion_percentage is 0 when total is 0', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Empty Event',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events[0]?.completion_percentage).toBe(0);
      expect(result.events[0]?.total_distributed).toBe(0);
      // event_type_completion for school_trip also has 0
      expect(result.event_type_completion[0]?.completion_percentage).toBe(0);
    });

    it('uses payment_deadline as due_date when consent_deadline is null', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'Paid Event',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: new Date('2026-06-30T00:00:00.000Z'),
          consent_deadline: null,
          payment_deadline: new Date('2026-06-20T00:00:00.000Z'),
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events[0]?.due_date).toBe('2026-06-20T00:00:00.000Z');
    });

    it('uses end_date as due_date when both deadlines are null', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([
        {
          id: EVENT_ID,
          title: 'No Deadline Event',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: new Date('2026-07-01T00:00:00.000Z'),
          consent_deadline: null,
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events[0]?.due_date).toBe('2026-07-01T00:00:00.000Z');
    });

    it('edge: form_template_ids empty skips template query', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(mockPrisma.engagementFormTemplate.findMany).not.toHaveBeenCalled();
      expect(result.forms).toEqual([]);
    });
  });

  // ─── buildSubmissionWhere — branch coverage ────────────────────────────────

  describe('getOverview — buildSubmissionWhere branches', () => {
    it('applies event_type filter to submissions via event relation', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      await service.getOverview(TENANT_ID, {
        event_type: 'sports_event',
      });

      // buildSubmissionWhere applies event.event_type filter
      expect(mockPrisma.engagementFormSubmission.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            event: { event_type: 'sports_event' },
          }),
        }),
      );
    });

    it('applies createdAt filter from date_from to submissions', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValue(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValue([]);

      await service.getOverview(TENANT_ID, {
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      });

      expect(mockPrisma.engagementFormSubmission.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });
  });

  // ─── Outstanding items sort branches ───────────────────────────────────────

  describe('getOverview — outstanding_items sort branches', () => {
    function setupOverviewMocks(
      events: Record<string, unknown>[],
      formGroups: Record<string, unknown>[],
    ) {
      // Reset all mocks to avoid pollution from prior tests
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
      mockPrisma.engagementEvent.count.mockResolvedValueOnce(events.length);
      mockPrisma.engagementEvent.groupBy.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      // findMany is called twice: once for buildCompletionRateData events query, once for getOverview event query
      // Actually: getOverview calls buildCompletionRateData which calls findMany for events
      // and the parent getOverview itself does NOT call findMany for events directly
      // So just one findMany call for events
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce(events);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce(
          events.map((e) => ({
            event_id: e.id,
            status: 'pending',
            _count: { _all: 5 },
          })),
        )
        .mockResolvedValueOnce(formGroups);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);
    }

    it('edge: sorts by due_date ascending when outstanding_count is the same', async () => {
      const events = [
        {
          id: 'ev-1',
          title: 'Later Due',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: new Date('2026-12-01T00:00:00Z'),
          payment_deadline: null,
        },
        {
          id: 'ev-2',
          title: 'Earlier Due',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: new Date('2026-06-01T00:00:00Z'),
          payment_deadline: null,
        },
      ];
      setupOverviewMocks(events, []);

      const result = await service.getOverview(TENANT_ID, {});

      // Both have outstanding_count=5 (5 pending, 0 submitted, 0 expired)
      // Should sort by due_date ascending: Earlier Due first
      expect(result.outstanding_items[0]?.name).toBe('Earlier Due');
      expect(result.outstanding_items[1]?.name).toBe('Later Due');
    });

    it('edge: items with due_date sort before items without due_date', async () => {
      const events = [
        {
          id: 'ev-no-date',
          title: 'No Deadline',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
        {
          id: 'ev-with-date',
          title: 'Has Deadline',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: new Date('2026-06-01T00:00:00Z'),
          payment_deadline: null,
        },
      ];
      setupOverviewMocks(events, []);

      const result = await service.getOverview(TENANT_ID, {});

      // Both have same outstanding_count. Has Deadline (due_date set) should come first
      expect(result.outstanding_items[0]?.name).toBe('Has Deadline');
      expect(result.outstanding_items[1]?.name).toBe('No Deadline');
    });

    it('edge: items without due_date sort by name when both lack due_date', async () => {
      const events = [
        {
          id: 'ev-z',
          title: 'Zebra Event',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
        {
          id: 'ev-a',
          title: 'Alpha Event',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
      ];
      setupOverviewMocks(events, []);

      const result = await service.getOverview(TENANT_ID, {});

      // Same outstanding_count, both null due_date -> sort by name
      expect(result.outstanding_items[0]?.name).toBe('Alpha Event');
      expect(result.outstanding_items[1]?.name).toBe('Zebra Event');
    });

    it('edge: right has due_date but left does not — right sorts first', async () => {
      const events = [
        {
          id: 'ev-no-due',
          title: 'No Due',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
        {
          id: 'ev-has-due',
          title: 'Has Due',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: new Date('2026-08-01T00:00:00Z'),
        },
      ];
      setupOverviewMocks(events, []);

      const result = await service.getOverview(TENANT_ID, {});

      // Has Due has a due_date (payment_deadline), No Due does not
      expect(result.outstanding_items[0]?.name).toBe('Has Due');
    });
  });

  // ─── createStatusBucketMap — status branch coverage ──────────────────────

  describe('getCompletionRates — status bucket aggregation branches', () => {
    beforeEach(() => {
      // Reset all mocks to avoid pollution from prior tests
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
    });

    it('should aggregate acknowledged status as submitted', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([
        {
          id: EVENT_ID,
          title: 'Test Event',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([
          { event_id: EVENT_ID, status: 'acknowledged', _count: { _all: 3 } },
          { event_id: EVENT_ID, status: 'pending', _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events[0]?.submitted).toBe(3);
      expect(result.events[0]?.total_distributed).toBe(5);
    });

    it('should aggregate revoked status as submitted', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([
        {
          id: EVENT_ID,
          title: 'Test Event',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([{ event_id: EVENT_ID, status: 'revoked', _count: { _all: 2 } }])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events[0]?.submitted).toBe(2);
    });

    it('should count expired status separately', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([
        {
          id: EVENT_ID,
          title: 'Test Event',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([
          { event_id: EVENT_ID, status: 'expired', _count: { _all: 4 } },
          { event_id: EVENT_ID, status: 'submitted', _count: { _all: 6 } },
        ])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events[0]?.expired).toBe(4);
      expect(result.events[0]?.submitted).toBe(6);
      expect(result.events[0]?.outstanding_count).toBe(0);
    });

    it('should handle form template submissions with multiple statuses', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([]);
      // When events is empty, eventGroups resolves to [] WITHOUT calling groupBy.
      // So only ONE groupBy call happens (for formGroups).
      mockPrisma.engagementFormSubmission.groupBy.mockResolvedValueOnce([
        { form_template_id: TEMPLATE_ID, status: 'submitted', _count: { _all: 10 } },
        { form_template_id: TEMPLATE_ID, status: 'expired', _count: { _all: 3 } },
        { form_template_id: TEMPLATE_ID, status: 'pending', _count: { _all: 7 } },
      ]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([
        { id: TEMPLATE_ID, name: 'Medical Form', form_type: 'consent_form' },
      ]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.forms[0]?.total_distributed).toBe(20);
      expect(result.forms[0]?.submitted).toBe(10);
      expect(result.forms[0]?.expired).toBe(3);
      expect(result.forms[0]?.outstanding_count).toBe(7);
      expect(result.forms[0]?.completion_percentage).toBe(50);
    });
  });

  // ─── buildCreatedAtFilter — partial date branches ──────────────────────────

  describe('getOverview — buildCreatedAtFilter partial dates', () => {
    beforeEach(() => {
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
    });

    function setupMinimalOverviewMocks() {
      mockPrisma.engagementEvent.count.mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);
    }

    it('should apply only gte when only date_from provided (no date_to)', async () => {
      setupMinimalOverviewMocks();

      await service.getOverview(TENANT_ID, {
        date_from: '2026-01-01',
      });

      expect(mockPrisma.engagementFormSubmission.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: { gte: expect.any(Date) },
          }),
        }),
      );
    });

    it('should apply only lte when only date_to provided (no date_from)', async () => {
      setupMinimalOverviewMocks();

      await service.getOverview(TENANT_ID, {
        date_to: '2026-12-31',
      });

      expect(mockPrisma.engagementFormSubmission.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            created_at: { lte: expect.any(Date) },
          }),
        }),
      );
    });
  });

  // ─── buildEventDateRangeFilter — both dates ────────────────────────────────

  describe('getOverview — buildEventDateRangeFilter with both dates', () => {
    beforeEach(() => {
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
    });

    it('should apply full OR range filter when both date_from and date_to provided', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);

      await service.getOverview(TENANT_ID, {
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      });

      expect(mockPrisma.engagementEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  expect.objectContaining({
                    start_date: expect.objectContaining({
                      gte: expect.any(Date),
                      lte: expect.any(Date),
                    }),
                  }),
                ]),
              }),
            ]),
          }),
        }),
      );
    });
  });

  // ─── getCalendarEvents — buildCalendarWhere additional branches ────────────

  describe('getCalendarEvents — buildCalendarWhere with existing date filters', () => {
    beforeEach(() => {
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
    });

    it('should merge start_date not-null with existing date filter', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([]);

      await service.getCalendarEvents(TENANT_ID, {
        date_from: '2026-03-01',
        date_to: '2026-03-31',
      });

      expect(mockPrisma.engagementEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: ['published', 'open', 'closed', 'in_progress', 'completed'],
            },
            start_date: expect.objectContaining({ not: null }),
          }),
        }),
      );
    });
  });

  // ─── buildEventWhere — AND coercion branch ─────────────────────────────────

  describe('getOverview — buildEventWhere AND coercion', () => {
    beforeEach(() => {
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
    });

    it('should handle academic_year_id + date filters together', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);

      await service.getOverview(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
        event_type: 'school_trip',
        date_from: '2026-01-01',
        date_to: '2026-12-31',
      });

      expect(mockPrisma.engagementEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            academic_year_id: ACADEMIC_YEAR_ID,
            event_type: 'school_trip',
            AND: expect.any(Array),
          }),
        }),
      );
    });
  });

  // ─── getCompletionRates — date serialization ──────────────────────────────

  describe('getCompletionRates — date serialization', () => {
    beforeEach(() => {
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
    });

    it('should serialize dates to ISO strings in events output', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([
        {
          id: EVENT_ID,
          title: 'Test',
          title_ar: null,
          event_type: 'school_trip',
          start_date: new Date('2026-01-10T00:00:00Z'),
          end_date: new Date('2026-01-11T00:00:00Z'),
          consent_deadline: new Date('2026-01-08T00:00:00Z'),
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events[0]?.start_date).toBe('2026-01-10T00:00:00.000Z');
      expect(result.events[0]?.end_date).toBe('2026-01-11T00:00:00.000Z');
      expect(result.events[0]?.due_date).toBe('2026-01-08T00:00:00.000Z');
    });

    it('should serialize null dates as null in events output', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([
        {
          id: EVENT_ID,
          title: 'No Dates',
          title_ar: null,
          event_type: 'school_trip',
          start_date: null,
          end_date: null,
          consent_deadline: null,
          payment_deadline: null,
        },
      ]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events[0]?.start_date).toBeNull();
      expect(result.events[0]?.end_date).toBeNull();
      expect(result.events[0]?.due_date).toBeNull();
    });

    it('should serialize form dates as null (forms have no dates)', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([]);
      // When events is empty, only ONE groupBy call (for formGroups)
      mockPrisma.engagementFormSubmission.groupBy.mockResolvedValueOnce([
        { form_template_id: TEMPLATE_ID, status: 'pending', _count: { _all: 1 } },
      ]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([
        { id: TEMPLATE_ID, name: 'Survey', form_type: 'survey' },
      ]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.forms[0]?.start_date).toBeNull();
      expect(result.forms[0]?.end_date).toBeNull();
      expect(result.forms[0]?.due_date).toBeNull();
    });
  });

  // ─── eventIds empty → skip event group query ──────────────────────────────

  describe('getCompletionRates — empty eventIds', () => {
    beforeEach(() => {
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
    });

    it('should skip event group query when no events found', async () => {
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([]);
      // When events is empty, only ONE groupBy call (formGroups)
      mockPrisma.engagementFormSubmission.groupBy.mockResolvedValueOnce([]);

      const result = await service.getCompletionRates(TENANT_ID, {});

      expect(result.events).toEqual([]);
    });
  });

  // ─── buildSubmissionWhere — academic_year_id ──────────���───────────────────

  describe('getOverview — buildSubmissionWhere academic_year_id', () => {
    beforeEach(() => {
      Object.values(mockPrisma).forEach((model) => {
        Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset());
      });
    });

    it('should apply academic_year_id to submission where clause', async () => {
      mockPrisma.engagementEvent.count.mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.groupBy.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.engagementEvent.findMany.mockResolvedValueOnce([]);
      mockPrisma.engagementFormSubmission.groupBy
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      mockPrisma.engagementFormTemplate.findMany.mockResolvedValueOnce([]);

      await service.getOverview(TENANT_ID, {
        academic_year_id: ACADEMIC_YEAR_ID,
      });

      expect(mockPrisma.engagementFormSubmission.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            academic_year_id: ACADEMIC_YEAR_ID,
          }),
        }),
      );
    });
  });
});
