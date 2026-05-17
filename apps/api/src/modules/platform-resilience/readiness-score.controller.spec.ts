import { NotFoundException } from '@nestjs/common';

import { ReadinessScoreController } from './readiness-score.controller';

describe('ReadinessScoreController', () => {
  const readiness = {
    compute: jest.fn().mockResolvedValue({ score: 100 }),
    dimensions: jest.fn().mockResolvedValue([{ dimension: 'alert_route_health' }]),
    history: jest.fn().mockResolvedValue([{ score: 99 }]),
    updateWeight: jest.fn().mockResolvedValue({ dimension: 'alert_route_health', weight: 25 }),
  };

  afterEach(() => jest.clearAllMocks());

  it('returns the current readiness score', async () => {
    const controller = new ReadinessScoreController(readiness as never);

    await expect(controller.current()).resolves.toEqual({ score: 100 });
    expect(readiness.compute).toHaveBeenCalledWith();
  });

  it('returns the 90-day readiness history', async () => {
    const controller = new ReadinessScoreController(readiness as never);

    await expect(controller.history()).resolves.toEqual([{ score: 99 }]);
    expect(readiness.history).toHaveBeenCalledWith(90);
  });

  it('returns dimension rows', async () => {
    const controller = new ReadinessScoreController(readiness as never);

    await expect(controller.dimensions()).resolves.toEqual([{ dimension: 'alert_route_health' }]);
    expect(readiness.dimensions).toHaveBeenCalledWith();
  });

  it('updates a readiness dimension weight with audit context', async () => {
    const controller = new ReadinessScoreController(readiness as never);

    await expect(
      controller.updateDimension(
        'alert_route_health',
        { enabled: true, weight: 25 },
        { sub: 'owner-1' } as never,
        { headers: {}, ip: '127.0.0.1' } as never,
      ),
    ).resolves.toEqual({ dimension: 'alert_route_health', weight: 25 });

    expect(readiness.updateWeight).toHaveBeenCalledWith(
      'alert_route_health',
      { enabled: true, weight: 25 },
      'owner-1',
      expect.objectContaining({ actor_user_id: 'owner-1' }),
    );
  });

  it('rejects unknown dimensions before update', async () => {
    const controller = new ReadinessScoreController(readiness as never);

    await expect(
      controller.updateDimension(
        'missing_dimension',
        { enabled: true, weight: 25 },
        { sub: 'owner-1' } as never,
        { headers: {}, ip: '127.0.0.1' } as never,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(readiness.updateWeight).not.toHaveBeenCalled();
  });
});
