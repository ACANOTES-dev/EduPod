import type { ModuleRef } from '@nestjs/core';

import type { ConversationsService } from '../inbox/conversations/conversations.service';

import { InboxBridgeService } from './inbox-bridge.service';

describe('InboxBridgeService', () => {
  let service: InboxBridgeService;
  let conversations: { createBroadcast: jest.Mock };

  const TENANT = '11111111-1111-1111-1111-111111111111';
  const SENDER = '22222222-2222-2222-2222-222222222222';
  const CONVERSATION_ID = '33333333-3333-3333-3333-333333333333';
  const MESSAGE_ID = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    conversations = {
      createBroadcast: jest.fn().mockResolvedValue({
        conversation_id: CONVERSATION_ID,
        message_id: MESSAGE_ID,
        resolved_recipient_count: 5,
        original_recipient_count: 5,
      }),
    };
    const moduleRef = { get: jest.fn() } as unknown as ModuleRef;
    service = new InboxBridgeService(moduleRef);
    service._setConversationsServiceForTesting(conversations as unknown as ConversationsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('translateLegacyScopeToDefinition', () => {
    it('maps school → parents_school', () => {
      expect(service.translateLegacyScopeToDefinition('school', {})).toEqual({
        provider: 'parents_school',
        params: {},
      });
    });

    it('maps year_group → year_group_parents with year_group_ids', () => {
      const def = service.translateLegacyScopeToDefinition('year_group', {
        year_group_ids: ['yg1', 'yg2'],
      });
      expect(def).toEqual({
        provider: 'year_group_parents',
        params: { year_group_ids: ['yg1', 'yg2'] },
      });
    });

    it('maps class → class_parents with class_ids', () => {
      const def = service.translateLegacyScopeToDefinition('class', {
        class_ids: ['c1'],
      });
      expect(def).toEqual({
        provider: 'class_parents',
        params: { class_ids: ['c1'] },
      });
    });

    it('maps household → household with household_ids', () => {
      const def = service.translateLegacyScopeToDefinition('household', {
        household_ids: ['h1', 'h2'],
      });
      expect(def).toEqual({
        provider: 'household',
        params: { household_ids: ['h1', 'h2'] },
      });
    });

    it('maps custom → handpicked with user_ids', () => {
      const def = service.translateLegacyScopeToDefinition('custom', {
        user_ids: ['u1'],
      });
      expect(def).toEqual({
        provider: 'handpicked',
        params: { user_ids: ['u1'] },
      });
    });

    it('defaults missing ids to empty arrays', () => {
      expect(service.translateLegacyScopeToDefinition('year_group', {})).toEqual({
        provider: 'year_group_parents',
        params: { year_group_ids: [] },
      });
      expect(service.translateLegacyScopeToDefinition('custom', {})).toEqual({
        provider: 'handpicked',
        params: { user_ids: [] },
      });
    });
  });

  describe('createBroadcastFromAnnouncement', () => {
    it('calls ConversationsService.createBroadcast with translated definition and empty extraChannels', async () => {
      const result = await service.createBroadcastFromAnnouncement({
        tenantId: TENANT,
        senderUserId: SENDER,
        subject: 'Snow day',
        body: '<p>school is closed</p>',
        scope: 'school',
        targetPayload: {},
        allowReplies: false,
      });

      expect(result).toEqual({
        conversation_id: CONVERSATION_ID,
        message_id: MESSAGE_ID,
      });
      expect(conversations.createBroadcast).toHaveBeenCalledTimes(1);
      expect(conversations.createBroadcast).toHaveBeenCalledWith({
        tenantId: TENANT,
        senderUserId: SENDER,
        audienceDefinition: { provider: 'parents_school', params: {} },
        subject: 'Snow day',
        body: '<p>school is closed</p>',
        attachments: [],
        allowReplies: false,
        extraChannels: [],
        disableFallback: false,
      });
    });

    it('passes class_ids through for class scope', async () => {
      await service.createBroadcastFromAnnouncement({
        tenantId: TENANT,
        senderUserId: SENDER,
        subject: 'Y7 maths',
        body: 'hello',
        scope: 'class',
        targetPayload: { class_ids: ['class-1'] },
        allowReplies: true,
      });

      expect(conversations.createBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          audienceDefinition: {
            provider: 'class_parents',
            params: { class_ids: ['class-1'] },
          },
          allowReplies: true,
        }),
      );
    });

    it('propagates errors from createBroadcast', async () => {
      conversations.createBroadcast.mockRejectedValueOnce(new Error('BROADCAST_AUDIENCE_EMPTY'));
      await expect(
        service.createBroadcastFromAnnouncement({
          tenantId: TENANT,
          senderUserId: SENDER,
          subject: 'x',
          body: 'y',
          scope: 'school',
          targetPayload: {},
          allowReplies: false,
        }),
      ).rejects.toThrow('BROADCAST_AUDIENCE_EMPTY');
    });
  });
});
