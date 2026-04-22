import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  CANARY_CHECK_JOB,
  CANARY_ECHO_JOB,
  CANARY_PING_JOB,
  QUEUE_NAMES,
} from '../../base/queue.constants';
import {
  ADMISSIONS_APPLICATION_RECEIVED_JOB,
  AdmissionsApplicationReceivedProcessor,
} from '../admissions/admissions-application-received.processor';
import {
  ADMISSIONS_APPLICATION_WITHDRAWN_JOB,
  AdmissionsApplicationWithdrawnProcessor,
} from '../admissions/admissions-application-withdrawn.processor';
import {
  ADMISSIONS_PAYMENT_LINK_JOB,
  AdmissionsPaymentLinkProcessor,
} from '../admissions/admissions-payment-link.processor';
import {
  BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB,
  DigestNotificationsProcessor,
} from '../behaviour/digest-notifications.processor';
import {
  BEHAVIOUR_PARENT_NOTIFICATION_JOB,
  BehaviourParentNotificationProcessor,
} from '../behaviour/parent-notification.processor';
import {
  ANNOUNCEMENT_APPROVAL_CALLBACK_JOB,
  AnnouncementApprovalCallbackProcessor,
} from '../communications/announcement-approval-callback.processor';
import {
  DISPATCH_NOTIFICATIONS_JOB,
  DispatchNotificationsProcessor,
} from '../communications/dispatch-notifications.processor';
import {
  INBOX_DISPATCH_CHANNELS_JOB,
  InboxDispatchChannelsProcessor,
} from '../communications/inbox-dispatch-channels.processor';
import {
  INQUIRY_NOTIFICATION_JOB,
  InquiryNotificationProcessor,
} from '../communications/inquiry-notification.processor';
import { IP_CLEANUP_JOB, IpCleanupProcessor } from '../communications/ip-cleanup.processor';
import {
  PUBLISH_ANNOUNCEMENT_JOB,
  PublishAnnouncementProcessor,
} from '../communications/publish-announcement.processor';
import {
  RETRY_FAILED_NOTIFICATIONS_JOB,
  RetryFailedNotificationsProcessor,
} from '../communications/retry-failed.processor';
import {
  STALE_INQUIRY_DETECTION_JOB,
  StaleInquiryDetectionProcessor,
} from '../communications/stale-inquiry-detection.processor';
import {
  INBOX_FALLBACK_CHECK_JOB,
  InboxFallbackCheckProcessor,
} from '../inbox/inbox-fallback-check.processor';
import {
  INBOX_FALLBACK_SCAN_TENANT_JOB,
  InboxFallbackScanTenantProcessor,
} from '../inbox/inbox-fallback-scan-tenant.processor';
import { CanaryProcessor } from '../monitoring/canary.processor';
import { DLQ_MONITOR_JOB, DlqMonitorProcessor } from '../monitoring/dlq-monitor.processor';

import { DISPATCH_QUEUED_JOB, DispatchQueuedProcessor } from './dispatch-queued.processor';
import {
  PARENT_DAILY_DIGEST_JOB,
  ParentDailyDigestProcessor,
} from './parent-daily-digest.processor';

// ─── Dispatcher ──────────────────────────────────────────────────────────────
// Single `@Processor` for this queue — BullMQ creates exactly ONE Worker
// bound to this class, so jobs cannot be silently consumed by a sibling
// processor whose job-name guard didn't match. See DZ-48.

@Processor(QUEUE_NAMES.NOTIFICATIONS, {
  lockDuration: 120_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class NotificationsQueueDispatcher extends WorkerHost {
  private readonly logger = new Logger(NotificationsQueueDispatcher.name);

  constructor(
    private readonly admissionsApplicationReceived: AdmissionsApplicationReceivedProcessor,
    private readonly admissionsApplicationWithdrawn: AdmissionsApplicationWithdrawnProcessor,
    private readonly admissionsPaymentLink: AdmissionsPaymentLinkProcessor,
    private readonly digestNotifications: DigestNotificationsProcessor,
    private readonly behaviourParentNotification: BehaviourParentNotificationProcessor,
    private readonly announcementApprovalCallback: AnnouncementApprovalCallbackProcessor,
    private readonly dispatchNotifications: DispatchNotificationsProcessor,
    private readonly inboxDispatchChannels: InboxDispatchChannelsProcessor,
    private readonly inquiryNotification: InquiryNotificationProcessor,
    private readonly ipCleanup: IpCleanupProcessor,
    private readonly publishAnnouncement: PublishAnnouncementProcessor,
    private readonly retryFailedNotifications: RetryFailedNotificationsProcessor,
    private readonly staleInquiryDetection: StaleInquiryDetectionProcessor,
    private readonly inboxFallbackCheck: InboxFallbackCheckProcessor,
    private readonly inboxFallbackScanTenant: InboxFallbackScanTenantProcessor,
    private readonly canary: CanaryProcessor,
    private readonly dlqMonitor: DlqMonitorProcessor,
    private readonly dispatchQueued: DispatchQueuedProcessor,
    private readonly parentDailyDigest: ParentDailyDigestProcessor,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case ADMISSIONS_APPLICATION_RECEIVED_JOB:
        await this.admissionsApplicationReceived.process(job);
        return;
      case ADMISSIONS_APPLICATION_WITHDRAWN_JOB:
        await this.admissionsApplicationWithdrawn.process(job);
        return;
      case ADMISSIONS_PAYMENT_LINK_JOB:
        await this.admissionsPaymentLink.process(job);
        return;
      case BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB:
        await this.digestNotifications.process(job);
        return;
      case BEHAVIOUR_PARENT_NOTIFICATION_JOB:
        await this.behaviourParentNotification.process(job);
        return;
      case ANNOUNCEMENT_APPROVAL_CALLBACK_JOB:
        await this.announcementApprovalCallback.process(job);
        return;
      case DISPATCH_NOTIFICATIONS_JOB:
        await this.dispatchNotifications.process(job);
        return;
      case INBOX_DISPATCH_CHANNELS_JOB:
        await this.inboxDispatchChannels.process(job);
        return;
      case INQUIRY_NOTIFICATION_JOB:
        await this.inquiryNotification.process(job);
        return;
      case IP_CLEANUP_JOB:
        await this.ipCleanup.process(job);
        return;
      case PUBLISH_ANNOUNCEMENT_JOB:
        await this.publishAnnouncement.process(job);
        return;
      case RETRY_FAILED_NOTIFICATIONS_JOB:
        await this.retryFailedNotifications.process(job);
        return;
      case STALE_INQUIRY_DETECTION_JOB:
        await this.staleInquiryDetection.process(job);
        return;
      case INBOX_FALLBACK_CHECK_JOB:
        await this.inboxFallbackCheck.process(job);
        return;
      case INBOX_FALLBACK_SCAN_TENANT_JOB:
        await this.inboxFallbackScanTenant.process(job);
        return;
      case CANARY_PING_JOB:
      case CANARY_ECHO_JOB:
      case CANARY_CHECK_JOB:
        await this.canary.process(job);
        return;
      case DLQ_MONITOR_JOB:
        await this.dlqMonitor.process(job);
        return;
      case DISPATCH_QUEUED_JOB:
        await this.dispatchQueued.process(job);
        return;
      case PARENT_DAILY_DIGEST_JOB:
        await this.parentDailyDigest.process(job);
        return;
      default:
        // Unknown jobs (incl. canary echoes, see DZ-48) complete silently;
        // log only non-canary for observability.
        if (!job.name.startsWith('monitoring:canary-')) {
          this.logger.warn(`Unknown notifications job name "${job.name}" (id=${job.id})`);
        }
        return;
    }
  }
}
