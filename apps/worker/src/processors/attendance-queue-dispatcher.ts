import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../base/queue.constants';

import {
  ATTENDANCE_AUTO_LOCK_JOB,
  AttendanceAutoLockProcessor,
} from './attendance-auto-lock.processor';
import {
  ATTENDANCE_CRON_DISPATCH_GENERATE_JOB,
  ATTENDANCE_CRON_DISPATCH_LOCK_JOB,
  ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB,
  ATTENDANCE_CRON_DISPATCH_PENDING_JOB,
  AttendanceCronDispatchProcessor,
} from './attendance-cron-dispatch.processor';
import {
  ATTENDANCE_DETECT_PATTERNS_JOB,
  AttendancePatternDetectionProcessor,
} from './attendance-pattern-detection.processor';
import {
  ATTENDANCE_DETECT_PENDING_JOB,
  AttendancePendingDetectionProcessor,
} from './attendance-pending-detection.processor';
import {
  ATTENDANCE_GENERATE_SESSIONS_JOB,
  AttendanceSessionGenerationProcessor,
} from './attendance-session-generation.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single @Processor for the attendance queue. BullMQ creates exactly ONE
// `Worker` bound to this class, which eliminates the competitive-consumer
// race that used to silently drop jobs when multiple `@Processor(ATTENDANCE)`
// classes coexisted (wrong worker picked up the job, early-returned via
// `if (job.name !== X) return;`, BullMQ marked it completed).
//
// Routing is by `job.name` → the original processor class (now a plain
// @Injectable service) which still owns all of the business logic.
//
// `lockDuration` is set to the longest required by any attendance job
// (pattern detection can scan 90 days of records for every student).

@Processor(QUEUE_NAMES.ATTENDANCE, {
  lockDuration: 3 * 60_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class AttendanceQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(AttendanceQueueDispatcher.name);

  constructor(
    private readonly sessionGeneration: AttendanceSessionGenerationProcessor,
    private readonly autoLock: AttendanceAutoLockProcessor,
    private readonly patternDetection: AttendancePatternDetectionProcessor,
    private readonly pendingDetection: AttendancePendingDetectionProcessor,
    private readonly cronDispatch: AttendanceCronDispatchProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case ATTENDANCE_GENERATE_SESSIONS_JOB:
        await this.sessionGeneration.process(job);
        return;
      case ATTENDANCE_AUTO_LOCK_JOB:
        await this.autoLock.process(job);
        return;
      case ATTENDANCE_DETECT_PATTERNS_JOB:
        await this.patternDetection.process(job);
        return;
      case ATTENDANCE_DETECT_PENDING_JOB:
        await this.pendingDetection.process(job);
        return;
      case ATTENDANCE_CRON_DISPATCH_GENERATE_JOB:
      case ATTENDANCE_CRON_DISPATCH_LOCK_JOB:
      case ATTENDANCE_CRON_DISPATCH_PATTERNS_JOB:
      case ATTENDANCE_CRON_DISPATCH_PENDING_JOB:
        await this.cronDispatch.process(job);
        return;
      default:
        this.logger.warn(
          `Unknown attendance job name "${job.name}" (id=${job.id}) — no handler registered; failing loudly.`,
        );
        throw new Error(`No handler registered for attendance job "${job.name}"`);
    }
  }
}
