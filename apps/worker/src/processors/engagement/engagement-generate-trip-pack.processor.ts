import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import type { TenantJobPayload } from '../../base/tenant-aware-job';
import { TenantAwareJob } from '../../base/tenant-aware-job';

// ─── Job Name ─────────────────────────────────────────────────────────────────

export const GENERATE_TRIP_PACK_JOB = 'engagement:generate-trip-pack';

// ─── Payload ──────────────────────────────────────────────────────────────────

export interface GenerateTripPackPayload extends TenantJobPayload {
  event_id: string;
  locale?: string;
}

// ─── Trip types eligible for pack generation ─────────────────────────────────

const TRIP_EVENT_TYPES = ['school_trip', 'overnight_trip'] as const;

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.ENGAGEMENT, { lockDuration: 30_000 })
export class GenerateTripPackProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateTripPackProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<GenerateTripPackPayload>): Promise<void> {
    if (job.name !== GENERATE_TRIP_PACK_JOB) return;

    const { tenant_id } = job.data;
    if (!tenant_id) throw new Error('Job rejected: missing tenant_id');

    this.logger.log(
      `Processing ${GENERATE_TRIP_PACK_JOB} — tenant=${tenant_id}, event=${job.data.event_id}`,
    );

    const generateJob = new GenerateTripPackJob(this.prisma);
    await generateJob.execute(job.data);
  }
}

// ─── TenantAwareJob Implementation ───────────────────────────────────────────

class GenerateTripPackJob extends TenantAwareJob<GenerateTripPackPayload> {
  private readonly logger = new Logger(GenerateTripPackJob.name);

  protected async processJob(data: GenerateTripPackPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, event_id, locale = 'en' } = data;

    // ─── 1. Fetch event and verify it is a trip type ────────────────────────

    const event = await tx.engagementEvent.findFirst({
      where: { tenant_id, id: event_id },
      select: {
        id: true,
        title: true,
        title_ar: true,
        event_type: true,
        status: true,
        start_date: true,
        end_date: true,
        start_time: true,
        end_time: true,
        location: true,
        location_ar: true,
        risk_assessment_approved: true,
        staff: {
          select: { staff_id: true, role: true },
        },
      },
    });

    if (!event) {
      throw new Error(`Event "${event_id}" not found for tenant ${tenant_id}`);
    }

    if (!TRIP_EVENT_TYPES.includes(event.event_type as (typeof TRIP_EVENT_TYPES)[number])) {
      throw new Error(`Event "${event_id}" is not a trip type (got "${event.event_type}")`);
    }

    // ─── 2. Fetch non-withdrawn participants with student medical data ──────

    const participants = await tx.engagementEventParticipant.findMany({
      where: {
        event_id,
        tenant_id,
        status: { notIn: ['withdrawn', 'consent_declined'] },
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            full_name: true,
            date_of_birth: true,
            medical_notes: true,
            has_allergy: true,
            allergy_details: true,
            household: {
              select: {
                emergency_contacts: {
                  select: {
                    contact_name: true,
                    phone: true,
                    relationship_label: true,
                  },
                  orderBy: { display_order: 'asc' },
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
    });

    // ─── 3. Fetch consent submissions for this event ────────────────────────

    const consentSubmissions = await tx.engagementFormSubmission.findMany({
      where: {
        event_id,
        tenant_id,
        status: { in: ['submitted', 'acknowledged'] },
      },
      select: {
        student_id: true,
        submitted_at: true,
      },
    });

    const consentCount = consentSubmissions.length;

    // ─── 4. Fetch tenant branding ───────────────────────────────────────────

    const tenant = await tx.tenant.findFirst({
      where: { id: tenant_id },
      select: { name: true, settings: true },
    });

    const tenantName = tenant?.name ?? 'Unknown School';

    // ─── 5. Log aggregation result ──────────────────────────────────────────

    const studentsWithMedical = participants.filter(
      (p) => p.student?.medical_notes || p.student?.has_allergy,
    ).length;

    this.logger.log(
      `Trip pack data aggregated for event "${event_id}": ` +
        `${participants.length} participants, ` +
        `${studentsWithMedical} with medical flags, ` +
        `${consentCount} consent submissions, ` +
        `locale=${locale}, tenant="${tenantName}"`,
    );

    // NOTE: Actual PDF rendering is handled synchronously by the API service
    // (TripPackService + PdfRenderingService). This async processor exists for
    // future bulk generation (e.g., generating packs for all trips at once)
    // and validates that all required data is aggregable before the API call.
  }
}
