import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '../../base/queue.constants';
import { isSyntheticCriticalQueueCanary, syntheticCanaryResult } from '../../base/synthetic-canary';
import {
  ATTACHMENT_SCAN_JOB,
  AttachmentScanProcessor,
} from '../safeguarding/attachment-scan.processor';
import {
  BREAK_GLASS_EXPIRY_JOB,
  BreakGlassExpiryProcessor,
} from '../safeguarding/break-glass-expiry.processor';
import {
  CRITICAL_ESCALATION_JOB,
  CriticalEscalationProcessor,
} from '../safeguarding/critical-escalation.processor';
import { SLA_CHECK_JOB, SlaCheckProcessor } from '../safeguarding/sla-check.processor';

import {
  BEHAVIOUR_ACK_REMINDERS_JOB,
  BehaviourAckRemindersProcessor,
} from './ack-reminders.processor';
import {
  BEHAVIOUR_CHECK_AWARDS_JOB,
  BehaviourCheckAwardsProcessor,
} from './check-awards.processor';
import {
  BEHAVIOUR_CRON_DISPATCH_DAILY_JOB,
  BEHAVIOUR_CRON_DISPATCH_SLA_JOB,
  BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB,
  BehaviourCronDispatchProcessor,
} from './cron-dispatch.processor';
import {
  BEHAVIOUR_DETECT_PATTERNS_JOB,
  DetectPatternsProcessor,
} from './detect-patterns.processor';
import { DOCUMENT_READY_JOB, DocumentReadyProcessor } from './document-ready.processor';
import { EVALUATE_POLICY_JOB, EvaluatePolicyProcessor } from './evaluate-policy.processor';
import {
  BEHAVIOUR_EXCLUSION_DEADLINE_CHECK_JOB,
  BehaviourExclusionDeadlineCheckProcessor,
} from './exclusion-deadline-check.processor';
import {
  BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB,
  BehaviourGuardianRestrictionCheckProcessor,
} from './guardian-restriction-check.processor';
import {
  BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB,
  NotificationReconciliationProcessor,
} from './notification-reconciliation.processor';
import {
  BEHAVIOUR_PARTITION_MAINTENANCE_JOB,
  PartitionMaintenanceProcessor,
} from './partition-maintenance.processor';
import {
  REFRESH_MV_STUDENT_SUMMARY_JOB,
  REFRESH_MV_BENCHMARKS_JOB,
  REFRESH_MV_EXPOSURE_RATES_JOB,
  RefreshMVProcessor,
} from './refresh-mv.processor';
import {
  BEHAVIOUR_RETENTION_CHECK_JOB,
  RetentionCheckProcessor,
} from './retention-check.processor';
import {
  BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB,
  StuckNotificationAlertProcessor,
} from './stuck-notification-alert.processor';
import {
  BEHAVIOUR_SUSPENSION_RETURN_JOB,
  BehaviourSuspensionReturnProcessor,
} from './suspension-return.processor';
import {
  BEHAVIOUR_TASK_REMINDERS_JOB,
  BehaviourTaskRemindersProcessor,
} from './task-reminders.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.BEHAVIOUR, {
  lockDuration: 300_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class BehaviourQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(BehaviourQueueDispatcher.name);

  constructor(
    private readonly behaviourAckReminders: BehaviourAckRemindersProcessor,
    private readonly behaviourCheckAwards: BehaviourCheckAwardsProcessor,
    private readonly behaviourCronDispatch: BehaviourCronDispatchProcessor,
    private readonly detectPatterns: DetectPatternsProcessor,
    private readonly documentReady: DocumentReadyProcessor,
    private readonly evaluatePolicy: EvaluatePolicyProcessor,
    private readonly behaviourExclusionDeadlineCheck: BehaviourExclusionDeadlineCheckProcessor,
    private readonly behaviourGuardianRestrictionCheck: BehaviourGuardianRestrictionCheckProcessor,
    private readonly notificationReconciliation: NotificationReconciliationProcessor,
    private readonly partitionMaintenance: PartitionMaintenanceProcessor,
    private readonly refreshMV: RefreshMVProcessor,
    private readonly retentionCheck: RetentionCheckProcessor,
    private readonly stuckNotificationAlert: StuckNotificationAlertProcessor,
    private readonly behaviourSuspensionReturn: BehaviourSuspensionReturnProcessor,
    private readonly behaviourTaskReminders: BehaviourTaskRemindersProcessor,
    private readonly attachmentScan: AttachmentScanProcessor,
    private readonly breakGlassExpiry: BreakGlassExpiryProcessor,
    private readonly criticalEscalation: CriticalEscalationProcessor,
    private readonly slaCheck: SlaCheckProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    if (isSyntheticCriticalQueueCanary(job)) {
      return syntheticCanaryResult(job);
    }

    switch (job.name) {
      case BEHAVIOUR_ACK_REMINDERS_JOB:
        await this.behaviourAckReminders.process(job);
        return;
      case BEHAVIOUR_CHECK_AWARDS_JOB:
        await this.behaviourCheckAwards.process(job);
        return;
      case BEHAVIOUR_CRON_DISPATCH_DAILY_JOB:
      case BEHAVIOUR_CRON_DISPATCH_SLA_JOB:
      case BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB:
        await this.behaviourCronDispatch.process(job);
        return;
      case BEHAVIOUR_DETECT_PATTERNS_JOB:
        await this.detectPatterns.process(job);
        return;
      case DOCUMENT_READY_JOB:
        await this.documentReady.process(job);
        return;
      case EVALUATE_POLICY_JOB:
        await this.evaluatePolicy.process(job);
        return;
      case BEHAVIOUR_EXCLUSION_DEADLINE_CHECK_JOB:
        await this.behaviourExclusionDeadlineCheck.process(job);
        return;
      case BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB:
        await this.behaviourGuardianRestrictionCheck.process(job);
        return;
      case BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB:
        await this.notificationReconciliation.process(job);
        return;
      case BEHAVIOUR_PARTITION_MAINTENANCE_JOB:
        await this.partitionMaintenance.process(job);
        return;
      case REFRESH_MV_STUDENT_SUMMARY_JOB:
      case REFRESH_MV_BENCHMARKS_JOB:
      case REFRESH_MV_EXPOSURE_RATES_JOB:
        await this.refreshMV.process(job);
        return;
      case BEHAVIOUR_RETENTION_CHECK_JOB:
        await this.retentionCheck.process(job);
        return;
      case BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB:
        await this.stuckNotificationAlert.process(job);
        return;
      case BEHAVIOUR_SUSPENSION_RETURN_JOB:
        await this.behaviourSuspensionReturn.process(job);
        return;
      case BEHAVIOUR_TASK_REMINDERS_JOB:
        await this.behaviourTaskReminders.process(job);
        return;
      case ATTACHMENT_SCAN_JOB:
        await this.attachmentScan.process(job);
        return;
      case BREAK_GLASS_EXPIRY_JOB:
        await this.breakGlassExpiry.process(job);
        return;
      case CRITICAL_ESCALATION_JOB:
        await this.criticalEscalation.process(job);
        return;
      case SLA_CHECK_JOB:
        await this.slaCheck.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, see DZ-48) complete silently;
        // log only non-canary for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown behaviour job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
