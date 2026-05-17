import { PlatformAiActionProposalsController } from './platform-ai-action-proposals.controller';
import { PlatformAiActionProposalsService } from './platform-ai-action-proposals.service';

const USER = {
  email: 'owner@example.com',
  platform_role: 'platform_owner',
  sub: '11111111-1111-4111-8111-111111111111',
};

const REQUEST = {
  headers: {},
  ip: '127.0.0.1',
} as never;

function buildController() {
  const service = {
    approve: jest.fn().mockResolvedValue({ id: 'proposal-1', status: 'executed' }),
    create: jest.fn().mockResolvedValue({ id: 'proposal-1' }),
    createHandoff: jest.fn().mockResolvedValue({ id: 'handoff-1' }),
    get: jest.fn().mockResolvedValue({ id: 'proposal-1' }),
    getHandoff: jest.fn().mockResolvedValue({ id: 'handoff-1' }),
    list: jest.fn().mockResolvedValue([{ id: 'proposal-1' }]),
    reject: jest.fn().mockResolvedValue({ id: 'proposal-1', status: 'rejected' }),
  } satisfies Partial<Record<keyof PlatformAiActionProposalsService, jest.Mock>>;

  return {
    controller: new PlatformAiActionProposalsController(service as never),
    service,
  };
}

describe('PlatformAiActionProposalsController', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates, lists, and reads supervised proposals through the service', async () => {
    const { controller, service } = buildController();

    await controller.createProposal({ recommendation_id: 'recommendation-1' }, USER, REQUEST);
    await controller.listProposals({ status: 'awaiting_approval' });
    await controller.getProposal('proposal-1');

    expect(service.create).toHaveBeenCalledWith(
      { recommendation_id: 'recommendation-1' },
      USER.sub,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(service.list).toHaveBeenCalledWith({ status: 'awaiting_approval' });
    expect(service.get).toHaveBeenCalledWith('proposal-1');
  });

  it('approves and rejects using the signed-in operator as the approver', async () => {
    const { controller, service } = buildController();

    await controller.approveProposal(
      'proposal-1',
      { reason: 'Approve cited safe action.' },
      USER,
      REQUEST,
    );
    await controller.rejectProposal(
      'proposal-1',
      { reason: 'Reject cited action proposal.' },
      USER,
      REQUEST,
    );

    expect(service.approve).toHaveBeenCalledWith(
      'proposal-1',
      { reason: 'Approve cited safe action.' },
      USER.sub,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(service.reject).toHaveBeenCalledWith(
      'proposal-1',
      { reason: 'Reject cited action proposal.' },
      USER.sub,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
  });

  it('creates and reads repo-agent handoff prompts', async () => {
    const { controller, service } = buildController();

    await controller.createHandoff({ recommendation_id: 'recommendation-1' }, USER, REQUEST);
    await controller.getHandoff('handoff-1');

    expect(service.createHandoff).toHaveBeenCalledWith(
      { recommendation_id: 'recommendation-1' },
      USER.sub,
      expect.objectContaining({ actor_user_id: USER.sub }),
    );
    expect(service.getHandoff).toHaveBeenCalledWith('handoff-1');
  });
});
