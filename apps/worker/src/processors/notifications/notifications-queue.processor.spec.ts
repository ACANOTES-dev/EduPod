import { Job } from 'bullmq';

import {
  CANARY_CHECK_JOB,
  CANARY_ECHO_JOB,
  CANARY_PING_JOB,
  SYNTHETIC_CRITICAL_QUEUE_CANARY_JOB,
  SYNTHETIC_TENANT_SENTINEL,
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
import { NotificationsQueueDispatcher } from './notifications-queue.processor';
import {
  PARENT_DAILY_DIGEST_JOB,
  ParentDailyDigestProcessor,
} from './parent-daily-digest.processor';

// ─── Test doubles ────────────────────────────────────────────────────────────
// Auto-generated spec — verifies the dispatcher routes each job.name to its
// matching handler (DZ-48 contract) and completes unknown job names silently
// so canary pings can sweep all queues without inflating the warn log.

describe('NotificationsQueueDispatcher', () => {
  function buildDispatcher() {
    const admissionsApplicationReceived = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdmissionsApplicationReceivedProcessor;
    const admissionsApplicationWithdrawn = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdmissionsApplicationWithdrawnProcessor;
    const admissionsPaymentLink = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as AdmissionsPaymentLinkProcessor;
    const digestNotifications = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as DigestNotificationsProcessor;
    const behaviourParentNotification = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as BehaviourParentNotificationProcessor;
    const announcementApprovalCallback = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as AnnouncementApprovalCallbackProcessor;
    const dispatchNotifications = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as DispatchNotificationsProcessor;
    const inboxDispatchChannels = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as InboxDispatchChannelsProcessor;
    const inquiryNotification = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as InquiryNotificationProcessor;
    const ipCleanup = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as IpCleanupProcessor;
    const publishAnnouncement = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as PublishAnnouncementProcessor;
    const retryFailedNotifications = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as RetryFailedNotificationsProcessor;
    const staleInquiryDetection = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as StaleInquiryDetectionProcessor;
    const inboxFallbackCheck = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as InboxFallbackCheckProcessor;
    const inboxFallbackScanTenant = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as InboxFallbackScanTenantProcessor;
    const canary = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as CanaryProcessor;
    const dlqMonitor = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as DlqMonitorProcessor;
    const dispatchQueued = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as DispatchQueuedProcessor;
    const parentDailyDigest = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as ParentDailyDigestProcessor;
    const suppressionListCleanup = {
      process: jest.fn().mockResolvedValue(undefined),
    } as unknown as { process: jest.Mock };

    const dispatcher = new NotificationsQueueDispatcher(
      admissionsApplicationReceived,
      admissionsApplicationWithdrawn,
      admissionsPaymentLink,
      digestNotifications,
      behaviourParentNotification,
      announcementApprovalCallback,
      dispatchNotifications,
      inboxDispatchChannels,
      inquiryNotification,
      ipCleanup,
      publishAnnouncement,
      retryFailedNotifications,
      staleInquiryDetection,
      suppressionListCleanup as never,
      inboxFallbackCheck,
      inboxFallbackScanTenant,
      canary,
      dlqMonitor,
      dispatchQueued,
      parentDailyDigest,
    );

    return {
      dispatcher,
      admissionsApplicationReceived,
      admissionsApplicationWithdrawn,
      admissionsPaymentLink,
      digestNotifications,
      behaviourParentNotification,
      announcementApprovalCallback,
      dispatchNotifications,
      inboxDispatchChannels,
      inquiryNotification,
      ipCleanup,
      publishAnnouncement,
      retryFailedNotifications,
      staleInquiryDetection,
      inboxFallbackCheck,
      inboxFallbackScanTenant,
      canary,
      dlqMonitor,
      dispatchQueued,
      parentDailyDigest,
    };
  }

  it.each([
    [ADMISSIONS_APPLICATION_RECEIVED_JOB, 'admissionsApplicationReceived'],
    [ADMISSIONS_APPLICATION_WITHDRAWN_JOB, 'admissionsApplicationWithdrawn'],
    [ADMISSIONS_PAYMENT_LINK_JOB, 'admissionsPaymentLink'],
    [BEHAVIOUR_DIGEST_NOTIFICATIONS_JOB, 'digestNotifications'],
    [BEHAVIOUR_PARENT_NOTIFICATION_JOB, 'behaviourParentNotification'],
    [ANNOUNCEMENT_APPROVAL_CALLBACK_JOB, 'announcementApprovalCallback'],
    [DISPATCH_NOTIFICATIONS_JOB, 'dispatchNotifications'],
    [INBOX_DISPATCH_CHANNELS_JOB, 'inboxDispatchChannels'],
    [INQUIRY_NOTIFICATION_JOB, 'inquiryNotification'],
    [IP_CLEANUP_JOB, 'ipCleanup'],
    [PUBLISH_ANNOUNCEMENT_JOB, 'publishAnnouncement'],
    [RETRY_FAILED_NOTIFICATIONS_JOB, 'retryFailedNotifications'],
    [STALE_INQUIRY_DETECTION_JOB, 'staleInquiryDetection'],
    [INBOX_FALLBACK_CHECK_JOB, 'inboxFallbackCheck'],
    [INBOX_FALLBACK_SCAN_TENANT_JOB, 'inboxFallbackScanTenant'],
    [CANARY_PING_JOB, 'canary'],
    [CANARY_ECHO_JOB, 'canary'],
    [CANARY_CHECK_JOB, 'canary'],
    [DLQ_MONITOR_JOB, 'dlqMonitor'],
    [DISPATCH_QUEUED_JOB, 'dispatchQueued'],
    [PARENT_DAILY_DIGEST_JOB, 'parentDailyDigest'],
  ])('routes %s to the %s processor', async (jobName, targetKey) => {
    const harness = buildDispatcher();
    const job = { id: 'job-1', name: jobName, data: {} } as Job;

    await harness.dispatcher.process(job);

    const targets = [
      'admissionsApplicationReceived',
      'admissionsApplicationWithdrawn',
      'admissionsPaymentLink',
      'digestNotifications',
      'behaviourParentNotification',
      'announcementApprovalCallback',
      'dispatchNotifications',
      'inboxDispatchChannels',
      'inquiryNotification',
      'ipCleanup',
      'publishAnnouncement',
      'retryFailedNotifications',
      'staleInquiryDetection',
      'inboxFallbackCheck',
      'inboxFallbackScanTenant',
      'canary',
      'dlqMonitor',
      'dispatchQueued',
      'parentDailyDigest',
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
      id: 'synthetic-notifications',
      name: SYNTHETIC_CRITICAL_QUEUE_CANARY_JOB,
      data: {
        _synthetic: true,
        canary_id: 'notifications-canary',
        tenant_id: SYNTHETIC_TENANT_SENTINEL,
      },
    } as Job;

    await expect(harness.dispatcher.process(job)).resolves.toEqual({
      canary_id: 'notifications-canary',
      ok: true,
    });

    const targets = [
      'admissionsApplicationReceived',
      'admissionsApplicationWithdrawn',
      'admissionsPaymentLink',
      'digestNotifications',
      'behaviourParentNotification',
      'announcementApprovalCallback',
      'dispatchNotifications',
      'inboxDispatchChannels',
      'inquiryNotification',
      'ipCleanup',
      'publishAnnouncement',
      'retryFailedNotifications',
      'staleInquiryDetection',
      'inboxFallbackCheck',
      'inboxFallbackScanTenant',
      'canary',
      'dlqMonitor',
      'dispatchQueued',
      'parentDailyDigest',
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
