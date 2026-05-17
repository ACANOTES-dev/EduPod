import { PlatformAiRecommendationController } from './platform-ai-recommendation.controller';
import { PlatformAiRecommendationService } from './platform-ai-recommendation.service';

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
    accept: jest.fn().mockResolvedValue({ id: 'recommendation-1', status: 'resolved' }),
    dismiss: jest.fn().mockResolvedValue({ id: 'recommendation-1', status: 'dismissed' }),
    generate: jest.fn().mockResolvedValue({ generated: 1, refreshed: 0, skipped: 0 }),
    generateDailyBrief: jest.fn().mockResolvedValue({
      conversation_id: 'conversation-1',
      message: { content: 'Brief [E:evidence-1]' },
    }),
    get: jest.fn().mockResolvedValue({ id: 'recommendation-1' }),
    list: jest.fn().mockResolvedValue([{ id: 'recommendation-1' }]),
  } satisfies Partial<Record<keyof PlatformAiRecommendationService, jest.Mock>>;

  return {
    controller: new PlatformAiRecommendationController(
      service as unknown as PlatformAiRecommendationService,
    ),
    service,
  };
}

describe('PlatformAiRecommendationController', () => {
  afterEach(() => jest.clearAllMocks());

  it('lists and reads recommendations through the service', async () => {
    const { controller, service } = buildController();

    await expect(controller.listRecommendations({ status: 'active' })).resolves.toEqual([
      { id: 'recommendation-1' },
    ]);
    await expect(controller.getRecommendation('recommendation-1')).resolves.toEqual({
      id: 'recommendation-1',
    });

    expect(service.list).toHaveBeenCalledWith({ status: 'active' });
    expect(service.get).toHaveBeenCalledWith('recommendation-1');
  });

  it('generates recommendations with the signed-in operator and audit request context', async () => {
    const { controller, service } = buildController();

    await controller.generateRecommendation(
      {
        context: { id: 'gradebook', kind: 'queue' },
        trigger_source: 'recommendation_button',
      },
      USER,
      REQUEST,
    );

    expect(service.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        context: { id: 'gradebook', kind: 'queue' },
        trigger_source: 'recommendation_button',
        user_id: USER.sub,
      }),
    );
  });

  it('generates an on-demand daily brief through the service', async () => {
    const { controller, service } = buildController();

    await controller.generateDailyBrief({ since_hours: 24 }, USER);

    expect(service.generateDailyBrief).toHaveBeenCalledWith({
      since_hours: 24,
      user_id: USER.sub,
    });
  });

  it('accepts and dismisses recommendations without executing platform actions', async () => {
    const { controller, service } = buildController();

    await controller.acceptRecommendation(
      'recommendation-1',
      { reason: 'Use this next.' },
      USER,
      REQUEST,
    );
    await controller.dismissRecommendation(
      'recommendation-1',
      { reason: 'Not applicable.' },
      USER,
      REQUEST,
    );

    expect(service.accept).toHaveBeenCalledWith(
      'recommendation-1',
      expect.objectContaining({
        reason: 'Use this next.',
        user_id: USER.sub,
      }),
    );
    expect(service.dismiss).toHaveBeenCalledWith(
      'recommendation-1',
      expect.objectContaining({
        reason: 'Not applicable.',
        user_id: USER.sub,
      }),
    );
  });
});
