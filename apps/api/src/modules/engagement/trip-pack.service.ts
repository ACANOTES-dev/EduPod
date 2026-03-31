import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { PdfBranding } from '../pdf-rendering/pdf-rendering.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Trip type constants ──────────────────────────────────────────────────────

const TRIP_EVENT_TYPES = ['school_trip', 'overnight_trip'];

@Injectable()
export class TripPackService {
  private readonly logger = new Logger(TripPackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderingService: PdfRenderingService,
  ) {}

  // ─── Shared trip leader pack data ─────────────────────────────────────────

  async getTripPackData(tenantId: string, eventId: string) {
    const event = await this.prisma.engagementEvent.findFirst({
      where: { id: eventId, tenant_id: tenantId },
      include: {
        staff: { include: { staff: { select: { id: true, user_id: true } } } },
        consent_form_template: { select: { id: true, name: true } },
        risk_assessment_template: { select: { id: true, name: true } },
      },
    });

    if (!event) {
      throw new NotFoundException({
        code: 'EVENT_NOT_FOUND',
        message: `Event with id "${eventId}" not found for tenant "${tenantId}"`,
      });
    }

    if (!TRIP_EVENT_TYPES.includes(event.event_type)) {
      throw new BadRequestException({
        code: 'NOT_A_TRIP_EVENT',
        message: 'Trip packs can only be generated for trip events',
      });
    }

    const participants = await this.prisma.engagementEventParticipant.findMany({
      where: {
        event_id: eventId,
        tenant_id: tenantId,
        status: { notIn: ['withdrawn', 'consent_declined'] },
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            full_name: true,
            medical_notes: true,
            has_allergy: true,
            allergy_details: true,
            date_of_birth: true,
            household: {
              select: {
                emergency_contacts: {
                  select: {
                    contact_name: true,
                    phone: true,
                    relationship_label: true,
                  },
                  orderBy: { display_order: 'asc' as const },
                },
              },
            },
            class_enrolments: {
              where: { status: 'active' },
              take: 1,
              select: {
                class_entity: {
                  select: {
                    name: true,
                    year_group: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { student: { last_name: 'asc' } },
    });

    const consentSubmissions = await this.prisma.engagementFormSubmission.findMany({
      where: {
        event_id: eventId,
        tenant_id: tenantId,
        status: { in: ['submitted', 'acknowledged'] },
      },
      select: {
        student_id: true,
        status: true,
        submitted_at: true,
      },
    });

    const consentMap = new Map(consentSubmissions.map((s) => [s.student_id, s]));

    return {
      event: {
        title: event.title,
        title_ar: event.title_ar,
        start_date: event.start_date?.toISOString().split('T')[0] ?? '',
        end_date: event.end_date?.toISOString().split('T')[0] ?? '',
        start_time: event.start_time,
        end_time: event.end_time,
        location: event.location ?? '',
        location_ar: event.location_ar,
        risk_assessment_approved: event.risk_assessment_approved,
      },
      staff: event.staff.map((s) => ({
        id: s.staff_id,
        role: s.role,
      })),
      students: participants.map((p) => ({
        name: p.student.full_name ?? `${p.student.first_name} ${p.student.last_name}`,
        year_group: p.student.class_enrolments[0]?.class_entity?.year_group?.name ?? '',
        class_name: p.student.class_enrolments[0]?.class_entity?.name ?? '',
        date_of_birth: p.student.date_of_birth?.toISOString().split('T')[0] ?? '',
        medical_notes: p.student.medical_notes,
        has_allergy: p.student.has_allergy,
        allergy_details: p.student.allergy_details,
        emergency_contacts: p.student.household?.emergency_contacts ?? [],
        consent_status: consentMap.has(p.student.id) ? 'granted' : 'pending',
        consent_submitted_at: consentMap.get(p.student.id)?.submitted_at?.toISOString() ?? null,
      })),
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Generate trip leader pack ────────────────────────────────────────────

  async generateTripPack(tenantId: string, eventId: string, locale: string): Promise<Buffer> {
    const templateData = await this.getTripPackData(tenantId, eventId);

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: {
        name: true,
        settings: true,
      },
    });

    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const branding: PdfBranding = {
      school_name: (settings.school_name as string) ?? tenant?.name ?? '',
      school_name_ar: settings.school_name_ar as string | undefined,
      logo_url: settings.logo_url as string | undefined,
      primary_color: settings.primary_color as string | undefined,
    };

    const pdfBuffer = await this.pdfRenderingService.renderPdf(
      'trip-leader-pack',
      locale,
      templateData,
      branding,
    );

    this.logger.log(
      `Generated trip pack for event ${eventId}, ${templateData.students.length} students`,
    );

    return pdfBuffer;
  }
}
