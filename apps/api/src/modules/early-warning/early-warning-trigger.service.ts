import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { EARLY_WARNING_COMPUTE_STUDENT_JOB } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EarlyWarningTriggerService {
  private readonly logger = new Logger(EarlyWarningTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('early-warning') private readonly earlyWarningQueue: Queue,
  ) {}

  async triggerStudentRecompute(
    tenantId: string,
    studentId: string,
    triggerEvent: string,
  ): Promise<void> {
    const config = await this.prisma.earlyWarningConfig.findFirst({
      where: { tenant_id: tenantId },
      select: { is_enabled: true, high_severity_events_json: true },
    });

    if (!config || !config.is_enabled) {
      return;
    }

    const highSeverityEvents = (config.high_severity_events_json ?? []) as string[];
    if (!highSeverityEvents.includes(triggerEvent)) {
      return;
    }

    await this.earlyWarningQueue.add(
      EARLY_WARNING_COMPUTE_STUDENT_JOB,
      {
        tenant_id: tenantId,
        student_id: studentId,
        trigger_event: triggerEvent,
      },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(
      `Enqueued early warning recompute for student ${studentId} (trigger: ${triggerEvent})`,
    );
  }
}
