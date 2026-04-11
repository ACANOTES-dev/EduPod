import type { Queue } from 'bullmq';

import {
  INBOX_DISPATCH_CHANNELS_JOB,
  InboxOutboxService,
  SAFEGUARDING_SCAN_MESSAGE_JOB,
} from './inbox-outbox.service';

describe('InboxOutboxService', () => {
  let service: InboxOutboxService;
  let queue: { add: jest.Mock };
  let safeguardingQueue: { add: jest.Mock };

  const TENANT = '11111111-1111-1111-1111-111111111111';
  const CONVERSATION = '22222222-2222-2222-2222-222222222222';
  const MESSAGE = '33333333-3333-3333-3333-333333333333';
  const SENDER = '44444444-4444-4444-4444-444444444444';
  const R1 = '55555555-5555-5555-5555-555555555555';
  const R2 = '66666666-6666-6666-6666-666666666666';

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    safeguardingQueue = { add: jest.fn().mockResolvedValue({ id: 'sg-1' }) };
    service = new InboxOutboxService(
      queue as unknown as Queue,
      safeguardingQueue as unknown as Queue,
    );
  });

  afterEach(() => jest.clearAllMocks());

  describe('notifyMessageCreated', () => {
    it('does NOT enqueue when only inbox is selected', () => {
      service.notifyMessageCreated({
        tenant_id: TENANT,
        conversation_id: CONVERSATION,
        message_id: MESSAGE,
        sender_user_id: SENDER,
        extra_channels: ['inbox'],
        disable_fallback: false,
        recipient_user_ids: [R1, R2],
      });

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('does NOT enqueue when recipients list is empty', () => {
      service.notifyMessageCreated({
        tenant_id: TENANT,
        conversation_id: CONVERSATION,
        message_id: MESSAGE,
        sender_user_id: SENDER,
        extra_channels: ['inbox', 'sms'],
        disable_fallback: false,
        recipient_user_ids: [],
      });

      expect(queue.add).not.toHaveBeenCalled();
    });

    it('enqueues inbox:dispatch-channels with external channels only', async () => {
      service.notifyMessageCreated({
        tenant_id: TENANT,
        conversation_id: CONVERSATION,
        message_id: MESSAGE,
        sender_user_id: SENDER,
        extra_channels: ['inbox', 'sms', 'email'],
        disable_fallback: true,
        recipient_user_ids: [R1, R2],
      });

      // fire-and-forget — wait a microtask for the addValidatedJob promise
      await new Promise((resolve) => setImmediate(resolve));

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload, options] = queue.add.mock.calls[0];
      expect(jobName).toBe(INBOX_DISPATCH_CHANNELS_JOB);
      expect(payload).toEqual({
        tenant_id: TENANT,
        conversation_id: CONVERSATION,
        message_id: MESSAGE,
        sender_user_id: SENDER,
        recipient_user_ids: [R1, R2],
        extra_channels: ['sms', 'email'],
        disable_fallback: true,
      });
      expect(options).toEqual({
        attempts: 5,
        backoff: { type: 'exponential', delay: 3_000 },
      });
    });

    it('strips inbox from extra_channels and keeps the remainder', async () => {
      service.notifyMessageCreated({
        tenant_id: TENANT,
        conversation_id: CONVERSATION,
        message_id: MESSAGE,
        sender_user_id: SENDER,
        extra_channels: ['whatsapp'],
        disable_fallback: false,
        recipient_user_ids: [R1],
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add.mock.calls[0][1].extra_channels).toEqual(['whatsapp']);
    });

    it('swallows queue enqueue errors (fire-and-forget)', async () => {
      queue.add.mockRejectedValueOnce(new Error('redis down'));
      expect(() =>
        service.notifyMessageCreated({
          tenant_id: TENANT,
          conversation_id: CONVERSATION,
          message_id: MESSAGE,
          sender_user_id: SENDER,
          extra_channels: ['sms'],
          disable_fallback: false,
          recipient_user_ids: [R1],
        }),
      ).not.toThrow();

      await new Promise((resolve) => setImmediate(resolve));
    });
  });

  describe('notifyNeedsSafeguardingScan', () => {
    it('enqueues onto the safeguarding queue', async () => {
      service.notifyNeedsSafeguardingScan({
        tenant_id: TENANT,
        conversation_id: CONVERSATION,
        message_id: MESSAGE,
      });

      await new Promise((resolve) => setImmediate(resolve));

      expect(safeguardingQueue.add).toHaveBeenCalledTimes(1);
      expect(safeguardingQueue.add.mock.calls[0][0]).toBe(SAFEGUARDING_SCAN_MESSAGE_JOB);
      expect(safeguardingQueue.add.mock.calls[0][1]).toEqual({
        tenant_id: TENANT,
        conversation_id: CONVERSATION,
        message_id: MESSAGE,
      });
      // Does NOT touch the notifications queue.
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
