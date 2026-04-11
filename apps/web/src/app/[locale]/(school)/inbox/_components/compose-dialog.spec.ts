import type { AudienceDefinition } from '@school/shared/inbox';

import { buildPayload } from './compose-dialog';

describe('buildPayload', () => {
  const base = {
    body: 'Hello',
    attachments: [],
    extraChannels: [] as const,
    disableFallback: false,
    directRecipient: null as { user_id: string; display_name: string; role_label: string } | null,
    groupSubject: '',
    groupRecipients: [] as { user_id: string; display_name: string; role_label: string }[],
    broadcastSubject: '',
    audience: null,
    allowReplies: false,
  };

  it('builds a direct payload with recipient_user_id', () => {
    const payload = buildPayload({
      ...base,
      kind: 'direct',
      directRecipient: { user_id: 'u1', display_name: 'Alice', role_label: 'Parent' },
    });
    expect(payload).toMatchObject({
      kind: 'direct',
      recipient_user_id: 'u1',
      body: 'Hello',
    });
  });

  it('trims body before submit', () => {
    const payload = buildPayload({
      ...base,
      kind: 'direct',
      body: '   hi there  ',
      directRecipient: { user_id: 'u1', display_name: 'Alice', role_label: 'Parent' },
    });
    expect(payload.body).toBe('hi there');
  });

  it('builds a group payload with subject and participant_user_ids', () => {
    const payload = buildPayload({
      ...base,
      kind: 'group',
      groupSubject: '  Year 5 Teachers  ',
      groupRecipients: [
        { user_id: 'u1', display_name: 'Alice', role_label: 'Teacher' },
        { user_id: 'u2', display_name: 'Bob', role_label: 'Teacher' },
      ],
    });
    expect(payload).toMatchObject({
      kind: 'group',
      subject: 'Year 5 Teachers',
      participant_user_ids: ['u1', 'u2'],
    });
  });

  it('builds a broadcast payload with an audience definition', () => {
    const definition: AudienceDefinition = { provider: 'parents_school', params: {} };
    const payload = buildPayload({
      ...base,
      kind: 'broadcast',
      broadcastSubject: 'School closed',
      audience: { mode: 'quick', definition },
      allowReplies: true,
    });
    expect(payload).toMatchObject({
      kind: 'broadcast',
      subject: 'School closed',
      allow_replies: true,
      audience: definition,
    });
  });

  it('includes saved_audience_id when broadcasting from a saved audience', () => {
    const definition: AudienceDefinition = {
      provider: 'saved_group',
      params: { saved_audience_id: 'sa-1' },
    };
    const payload = buildPayload({
      ...base,
      kind: 'broadcast',
      broadcastSubject: 'Update',
      audience: { mode: 'saved', savedAudienceId: 'sa-1', definition },
    });
    expect(payload).toMatchObject({
      saved_audience_id: 'sa-1',
      audience: definition,
    });
  });

  it('omits audience when the custom composition is not ready', () => {
    const payload = buildPayload({
      ...base,
      kind: 'broadcast',
      broadcastSubject: 'Update',
      audience: { mode: 'custom', definition: null },
    });
    expect(payload).not.toHaveProperty('audience');
    expect(payload).not.toHaveProperty('saved_audience_id');
  });
});
