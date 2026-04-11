import { InboxChannelProvider } from './inbox-channel.provider';

describe('InboxChannelProvider', () => {
  let provider: InboxChannelProvider;

  beforeEach(() => {
    provider = new InboxChannelProvider();
  });

  it('returns delivered_synchronously with the recipient count', () => {
    const result = provider.send({
      tenantId: '11111111-1111-1111-1111-111111111111',
      conversationId: '22222222-2222-2222-2222-222222222222',
      messageId: '33333333-3333-3333-3333-333333333333',
      recipientUserIds: ['u1', 'u2', 'u3'],
    });

    expect(result).toEqual({
      status: 'delivered_synchronously',
      recipientCount: 3,
    });
  });

  it('handles an empty recipient list without throwing', () => {
    const result = provider.send({
      tenantId: '11111111-1111-1111-1111-111111111111',
      conversationId: '22222222-2222-2222-2222-222222222222',
      messageId: '33333333-3333-3333-3333-333333333333',
      recipientUserIds: [],
    });

    expect(result.status).toBe('delivered_synchronously');
    expect(result.recipientCount).toBe(0);
  });

  it('exposes the channel key "inbox"', () => {
    expect(provider.key).toBe('inbox');
  });
});
