import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, TenantReadFacade } from '../../common/tests/mock-facades';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { TripPackService } from './trip-pack.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const EVENT_ID = '00000000-0000-0000-0000-000000000010';
const STUDENT_ID_1 = '00000000-0000-0000-0000-000000000020';
const STUDENT_ID_2 = '00000000-0000-0000-0000-000000000021';
const STAFF_ID = '00000000-0000-0000-0000-000000000030';

function buildMockEvent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: EVENT_ID,
    tenant_id: TENANT_ID,
    title: 'Zoo Trip',
    title_ar: null,
    event_type: 'school_trip',
    start_date: new Date('2026-04-15'),
    end_date: new Date('2026-04-15'),
    start_time: '09:00',
    end_time: '15:00',
    location: 'Dublin Zoo',
    location_ar: null,
    risk_assessment_approved: true,
    staff: [
      {
        staff_id: STAFF_ID,
        role: 'trip_leader',
        staff: { id: STAFF_ID, user_id: 'user-1' },
      },
    ],
    consent_form_template: { id: 'tpl-1', name: 'Trip Consent' },
    risk_assessment_template: { id: 'tpl-2', name: 'Trip Risk Assessment' },
    ...overrides,
  };
}

function buildMockParticipant(studentId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: `participant-${studentId}`,
    event_id: EVENT_ID,
    tenant_id: TENANT_ID,
    student_id: studentId,
    status: 'confirmed',
    student: {
      id: studentId,
      first_name: 'Test',
      last_name: 'Student',
      full_name: 'Test Student',
      medical_notes: null,
      has_allergy: false,
      allergy_details: null,
      date_of_birth: new Date('2015-06-01'),
      household: {
        emergency_contacts: [
          {
            contact_name: 'Parent One',
            phone: '+353851234567',
            relationship_label: 'Mother',
          },
        ],
      },
      class_enrolments: [
        {
          class_entity: {
            name: '3A',
            year_group: { name: 'Year 3' },
          },
        },
      ],
    },
    ...overrides,
  };
}

function buildMockConsentSubmission(studentId: string) {
  return {
    student_id: studentId,
    status: 'submitted',
    submitted_at: new Date('2026-04-10T10:00:00Z'),
    signature_json: { signed: true },
    submitted_by: { id: 'parent-user-1' },
  };
}

// ─── Mock definitions ─────────────────────────────────────────────────────────

const mockPrisma: {
  engagementEvent: { findFirst: jest.Mock };
  engagementEventParticipant: { findMany: jest.Mock };
  engagementFormSubmission: { findMany: jest.Mock };
  tenant: { findFirst: jest.Mock };
} = {
  engagementEvent: { findFirst: jest.fn() },
  engagementEventParticipant: { findMany: jest.fn() },
  engagementFormSubmission: { findMany: jest.fn() },
  tenant: { findFirst: jest.fn() },
};

const mockPdfRenderingService: {
  renderPdf: jest.Mock;
} = {
  renderPdf: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TripPackService', () => {
  let service: TripPackService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        TripPackService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        {
          provide: TenantReadFacade,
          useValue: {
            findById: mockPrisma.tenant.findFirst,
            findSettings: jest.fn().mockImplementation(async () => {
              const tenant = await mockPrisma.tenant.findFirst();
              return tenant?.settings ?? null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(TripPackService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateTripPack ─────────────────────────────────────────────────────

  describe('TripPackService — generateTripPack', () => {
    it('should return PDF buffer for valid trip event', async () => {
      const event = buildMockEvent();
      const participant1 = buildMockParticipant(STUDENT_ID_1);
      const participant2 = buildMockParticipant(STUDENT_ID_2, {
        student: {
          ...buildMockParticipant(STUDENT_ID_2).student,
          id: STUDENT_ID_2,
          first_name: 'Jane',
          last_name: 'Doe',
          full_name: 'Jane Doe',
        },
      });
      const consentSubmission = buildMockConsentSubmission(STUDENT_ID_1);
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([
        participant1,
        participant2,
      ]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([consentSubmission]);
      mockPrisma.tenant.findFirst.mockResolvedValue({
        name: 'Test School',
        settings: {
          school_name: 'Test School',
          logo_url: 'https://example.com/logo.png',
        },
      });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      const result = await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      expect(result).toBe(pdfBuffer);
      expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
        'trip-leader-pack',
        'en',
        expect.objectContaining({
          event: expect.objectContaining({ title: 'Zoo Trip' }),
          students: expect.arrayContaining([
            expect.objectContaining({
              name: 'Test Student',
              consent_status: 'granted',
            }),
            expect.objectContaining({
              name: 'Jane Doe',
              consent_status: 'pending',
            }),
          ]),
        }),
        expect.objectContaining({
          school_name: 'Test School',
          logo_url: 'https://example.com/logo.png',
        }),
      );
    });

    it('should throw NotFoundException when event not found', async () => {
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(null);

      await expect(service.generateTripPack(TENANT_ID, EVENT_ID, 'en')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for non-trip event types', async () => {
      const event = buildMockEvent({ event_type: 'assembly' });
      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);

      await expect(service.generateTripPack(TENANT_ID, EVENT_ID, 'en')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should exclude withdrawn participants from pack', async () => {
      const event = buildMockEvent();
      const activeParticipant = buildMockParticipant(STUDENT_ID_1);
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      // Only active participant returned — withdrawn filtered at query level
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([activeParticipant]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({
        name: 'Test School',
        settings: {},
      });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      // Verify the query filters out withdrawn/consent_declined
      expect(mockPrisma.engagementEventParticipant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['withdrawn', 'consent_declined'] },
          }),
        }),
      );

      // Verify only 1 student in template data
      const renderCall = mockPdfRenderingService.renderPdf.mock.calls[0];
      const templateData = renderCall[2] as { students: unknown[] };
      expect(templateData.students).toHaveLength(1);
    });

    it('should handle overnight_trip event type', async () => {
      const event = buildMockEvent({ event_type: 'overnight_trip' });
      const participant = buildMockParticipant(STUDENT_ID_1);
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([participant]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({
        name: 'Test School',
        settings: {},
      });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      const result = await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      expect(result).toBe(pdfBuffer);
    });

    it('edge: student with null full_name uses first_name + last_name', async () => {
      const participant = buildMockParticipant(STUDENT_ID_1, {
        student: {
          ...buildMockParticipant(STUDENT_ID_1).student,
          full_name: null,
        },
      });
      const event = buildMockEvent();
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([participant]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({ name: 'School', settings: {} });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      const renderCall = mockPdfRenderingService.renderPdf.mock.calls[0];
      const templateData = renderCall[2] as { students: { name: string }[] };
      expect(templateData.students[0]?.name).toBe('Test Student');
    });

    it('edge: student with null household has empty emergency_contacts', async () => {
      const participant = buildMockParticipant(STUDENT_ID_1, {
        student: {
          ...buildMockParticipant(STUDENT_ID_1).student,
          household: null,
        },
      });
      const event = buildMockEvent();
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([participant]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({ name: 'School', settings: {} });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      const renderCall = mockPdfRenderingService.renderPdf.mock.calls[0];
      const templateData = renderCall[2] as {
        students: { emergency_contacts: unknown[] }[];
      };
      expect(templateData.students[0]?.emergency_contacts).toEqual([]);
    });

    it('edge: student with no class_enrolments has empty year_group and class_name', async () => {
      const participant = buildMockParticipant(STUDENT_ID_1, {
        student: {
          ...buildMockParticipant(STUDENT_ID_1).student,
          class_enrolments: [],
        },
      });
      const event = buildMockEvent();
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([participant]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({ name: 'School', settings: {} });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      const renderCall = mockPdfRenderingService.renderPdf.mock.calls[0];
      const templateData = renderCall[2] as {
        students: { year_group: string; class_name: string }[];
      };
      expect(templateData.students[0]?.year_group).toBe('');
      expect(templateData.students[0]?.class_name).toBe('');
    });

    it('edge: null start_date/end_date on event produce empty strings', async () => {
      const event = buildMockEvent({ start_date: null, end_date: null });
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({ name: 'School', settings: {} });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      const renderCall = mockPdfRenderingService.renderPdf.mock.calls[0];
      const templateData = renderCall[2] as { event: { start_date: string; end_date: string } };
      expect(templateData.event.start_date).toBe('');
      expect(templateData.event.end_date).toBe('');
    });

    it('edge: null tenant settings use fallback branding', async () => {
      const event = buildMockEvent();
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({
        name: 'Fallback School',
        settings: null,
      });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      const renderCall = mockPdfRenderingService.renderPdf.mock.calls[0];
      const branding = renderCall[3] as { school_name: string };
      // When settings is null, falls back to tenantCore?.name
      expect(branding.school_name).toBe('Fallback School');
    });

    it('edge: null date_of_birth on student produces empty string', async () => {
      const participant = buildMockParticipant(STUDENT_ID_1, {
        student: {
          ...buildMockParticipant(STUDENT_ID_1).student,
          date_of_birth: null,
        },
      });
      const event = buildMockEvent();
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([participant]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({ name: 'School', settings: {} });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      const renderCall = mockPdfRenderingService.renderPdf.mock.calls[0];
      const templateData = renderCall[2] as { students: { date_of_birth: string }[] };
      expect(templateData.students[0]?.date_of_birth).toBe('');
    });

    it('should map emergency contacts from household', async () => {
      const emergencyContacts = [
        {
          contact_name: 'Parent One',
          phone: '+353851234567',
          relationship_label: 'Mother',
        },
        {
          contact_name: 'Parent Two',
          phone: '+353859876543',
          relationship_label: 'Father',
        },
      ];

      const participant = buildMockParticipant(STUDENT_ID_1, {
        student: {
          ...buildMockParticipant(STUDENT_ID_1).student,
          household: { emergency_contacts: emergencyContacts },
        },
      });
      const event = buildMockEvent();
      const pdfBuffer = Buffer.from('pdf-content');

      mockPrisma.engagementEvent.findFirst.mockResolvedValue(event);
      mockPrisma.engagementEventParticipant.findMany.mockResolvedValue([participant]);
      mockPrisma.engagementFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findFirst.mockResolvedValue({
        name: 'Test School',
        settings: {},
      });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      await service.generateTripPack(TENANT_ID, EVENT_ID, 'en');

      const renderCall = mockPdfRenderingService.renderPdf.mock.calls[0];
      const templateData = renderCall[2] as {
        students: { emergency_contacts: typeof emergencyContacts }[];
      };
      expect(templateData.students[0]!.emergency_contacts).toEqual(emergencyContacts);
      expect(templateData.students[0]!.emergency_contacts).toHaveLength(2);
    });
  });
});
