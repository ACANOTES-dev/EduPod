import { Job } from 'bullmq';

import {
  SYNTHETIC_CRITICAL_QUEUE_CANARY_JOB,
  SYNTHETIC_TENANT_SENTINEL,
} from '../../base/queue.constants';
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
import { BehaviourQueueDispatcher } from './behaviour-queue.processor';
import {
  BEHAVIOUR_CHECK_AWARDS_JOB,
  BehaviourCheckAwardsProcessor,
} from './check-awards.processor';
import {
  BEHAVIOUR_CRON_DISPATCH_DAILY_JOB,
  BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB,
  BEHAVIOUR_CRON_DISPATCH_SLA_JOB,
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
  REFRESH_MV_BENCHMARKS_JOB,
  REFRESH_MV_EXPOSURE_RATES_JOB,
  REFRESH_MV_STUDENT_SUMMARY_JOB,
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

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('BehaviourQueueDispatcher', () => {
  function buildDispatcher() {
    const behaviourAckReminders = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BehaviourAckRemindersProcessor;
    const behaviourCheckAwards = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BehaviourCheckAwardsProcessor;
    const behaviourCronDispatch = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BehaviourCronDispatchProcessor;
    const detectPatterns = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as DetectPatternsProcessor;
    const documentReady = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as DocumentReadyProcessor;
    const evaluatePolicy = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as EvaluatePolicyProcessor;
    const behaviourExclusionDeadlineCheck = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BehaviourExclusionDeadlineCheckProcessor;
    const behaviourGuardianRestrictionCheck = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BehaviourGuardianRestrictionCheckProcessor;
    const notificationReconciliation = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as NotificationReconciliationProcessor;
    const partitionMaintenance = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as PartitionMaintenanceProcessor;
    const refreshMV = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RefreshMVProcessor;
    const retentionCheck = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RetentionCheckProcessor;
    const stuckNotificationAlert = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as StuckNotificationAlertProcessor;
    const behaviourSuspensionReturn = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BehaviourSuspensionReturnProcessor;
    const behaviourTaskReminders = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BehaviourTaskRemindersProcessor;
    const attachmentScan = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as AttachmentScanProcessor;
    const breakGlassExpiry = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BreakGlassExpiryProcessor;
    const criticalEscalation = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as CriticalEscalationProcessor;
    const slaCheck = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as SlaCheckProcessor;

    const dispatcher = new BehaviourQueueDispatcher(
      behaviourAckReminders,
      behaviourCheckAwards,
      behaviourCronDispatch,
      detectPatterns,
      documentReady,
      evaluatePolicy,
      behaviourExclusionDeadlineCheck,
      behaviourGuardianRestrictionCheck,
      notificationReconciliation,
      partitionMaintenance,
      refreshMV,
      retentionCheck,
      stuckNotificationAlert,
      behaviourSuspensionReturn,
      behaviourTaskReminders,
      attachmentScan,
      breakGlassExpiry,
      criticalEscalation,
      slaCheck,
    );

    return {
      dispatcher,
      behaviourAckReminders,
      behaviourCheckAwards,
      behaviourCronDispatch,
      detectPatterns,
      documentReady,
      evaluatePolicy,
      behaviourExclusionDeadlineCheck,
      behaviourGuardianRestrictionCheck,
      notificationReconciliation,
      partitionMaintenance,
      refreshMV,
      retentionCheck,
      stuckNotificationAlert,
      behaviourSuspensionReturn,
      behaviourTaskReminders,
      attachmentScan,
      breakGlassExpiry,
      criticalEscalation,
      slaCheck,
    };
  }

  it.each([
    [BEHAVIOUR_ACK_REMINDERS_JOB, 'behaviourAckReminders'],
    [BEHAVIOUR_CHECK_AWARDS_JOB, 'behaviourCheckAwards'],
    [BEHAVIOUR_CRON_DISPATCH_DAILY_JOB, 'behaviourCronDispatch'],
    [BEHAVIOUR_CRON_DISPATCH_SLA_JOB, 'behaviourCronDispatch'],
    [BEHAVIOUR_CRON_DISPATCH_MONTHLY_JOB, 'behaviourCronDispatch'],
    [BEHAVIOUR_DETECT_PATTERNS_JOB, 'detectPatterns'],
    [DOCUMENT_READY_JOB, 'documentReady'],
    [EVALUATE_POLICY_JOB, 'evaluatePolicy'],
    [BEHAVIOUR_EXCLUSION_DEADLINE_CHECK_JOB, 'behaviourExclusionDeadlineCheck'],
    [BEHAVIOUR_GUARDIAN_RESTRICTION_CHECK_JOB, 'behaviourGuardianRestrictionCheck'],
    [BEHAVIOUR_NOTIFICATION_RECONCILIATION_JOB, 'notificationReconciliation'],
    [BEHAVIOUR_PARTITION_MAINTENANCE_JOB, 'partitionMaintenance'],
    [REFRESH_MV_STUDENT_SUMMARY_JOB, 'refreshMV'],
    [REFRESH_MV_BENCHMARKS_JOB, 'refreshMV'],
    [REFRESH_MV_EXPOSURE_RATES_JOB, 'refreshMV'],
    [BEHAVIOUR_RETENTION_CHECK_JOB, 'retentionCheck'],
    [BEHAVIOUR_STUCK_NOTIFICATION_ALERT_JOB, 'stuckNotificationAlert'],
    [BEHAVIOUR_SUSPENSION_RETURN_JOB, 'behaviourSuspensionReturn'],
    [BEHAVIOUR_TASK_REMINDERS_JOB, 'behaviourTaskReminders'],
    [ATTACHMENT_SCAN_JOB, 'attachmentScan'],
    [BREAK_GLASS_EXPIRY_JOB, 'breakGlassExpiry'],
    [CRITICAL_ESCALATION_JOB, 'criticalEscalation'],
    [SLA_CHECK_JOB, 'slaCheck'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'behaviourAckReminders',
      'behaviourCheckAwards',
      'behaviourCronDispatch',
      'detectPatterns',
      'documentReady',
      'evaluatePolicy',
      'behaviourExclusionDeadlineCheck',
      'behaviourGuardianRestrictionCheck',
      'notificationReconciliation',
      'partitionMaintenance',
      'refreshMV',
      'retentionCheck',
      'stuckNotificationAlert',
      'behaviourSuspensionReturn',
      'behaviourTaskReminders',
      'attachmentScan',
      'breakGlassExpiry',
      'criticalEscalation',
      'slaCheck',
    ] as const;
    for (const key of targets) {
      const expected = key === targetKey ? 1 : 0;
      expect(harness[key].process).toHaveBeenCalledTimes(expected);
    }
  });

  it('completes unknown job names silently — canary pings depend on this', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { id: 'job-unknown', name: 'monitoring:canary-ping', data: {} } as Job;

    await expect(dispatcher.process(job)).resolves.toBeUndefined();
  });

  it('short-circuits the synthetic critical queue canary without side effects', async () => {
    const harness = buildDispatcher();
    const job = {
      id: 'synthetic-behaviour',
      name: SYNTHETIC_CRITICAL_QUEUE_CANARY_JOB,
      data: {
        _synthetic: true,
        canary_id: 'behaviour-canary',
        tenant_id: SYNTHETIC_TENANT_SENTINEL,
      },
    } as Job;

    await expect(harness.dispatcher.process(job)).resolves.toEqual({
      canary_id: 'behaviour-canary',
      ok: true,
    });

    const targets = [
      'behaviourAckReminders',
      'behaviourCheckAwards',
      'behaviourCronDispatch',
      'detectPatterns',
      'documentReady',
      'evaluatePolicy',
      'behaviourExclusionDeadlineCheck',
      'behaviourGuardianRestrictionCheck',
      'notificationReconciliation',
      'partitionMaintenance',
      'refreshMV',
      'retentionCheck',
      'stuckNotificationAlert',
      'behaviourSuspensionReturn',
      'behaviourTaskReminders',
      'attachmentScan',
      'breakGlassExpiry',
      'criticalEscalation',
      'slaCheck',
    ] as const;
    for (const key of targets) {
      expect(harness[key].process).not.toHaveBeenCalled();
    }
  });

  it('completes non-canary unknown jobs silently (logs warning)', async () => {
    const { dispatcher } = buildDispatcher();
    const job = { id: 'job-weird', name: 'something:totally-unknown', data: {} } as Job;

    await expect(dispatcher.process(job)).resolves.toBeUndefined();
  });
});
