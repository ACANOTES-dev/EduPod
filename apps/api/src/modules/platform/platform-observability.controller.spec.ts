import { UnauthorizedException } from '@nestjs/common';

import { PlatformObservabilityController } from './platform-observability.controller';

const DEPLOY_DTO = {
  sha: 'abcdef1234567890',
  short_sha: 'abcdef1',
  deploy_run_url: 'https://github.com/ACANOTES-dev/EduPod/actions/runs/123',
  deploy_run_id: '123',
  status: 'succeeded' as const,
};

function buildController() {
  const observability = {
    captureDeploy: jest.fn().mockResolvedValue({ id: 'deploy-1', ...DEPLOY_DTO }),
    getDeploy: jest.fn().mockResolvedValue({ id: 'deploy-1' }),
    listCorrelationEvents: jest.fn().mockResolvedValue([]),
    listDeploys: jest
      .fn()
      .mockResolvedValue({ data: [], meta: { page: 1, pageSize: 25, total: 0 } }),
    listRunbooks: jest.fn().mockResolvedValue([]),
    listSeverityPolicies: jest.fn().mockResolvedValue([]),
    listTopology: jest.fn().mockResolvedValue([]),
    verifyInternalToken: jest.fn((token: string | undefined) => token === 'valid-token'),
  };
  return {
    controller: new PlatformObservabilityController(
      observability as unknown as ConstructorParameters<typeof PlatformObservabilityController>[0],
    ),
    observability,
  };
}

describe('PlatformObservabilityController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('delegates read-only observability endpoints', async () => {
    const { controller, observability } = buildController();

    await controller.correlation('corr-1');
    await controller.deploys({ page: 1, pageSize: 25 });
    await controller.deploy('11111111-1111-4111-8111-111111111111');
    await controller.runbooks({ component: 'api' });
    await controller.topology({ kind: 'service' });
    await controller.severityPolicies({ severity: 'critical' });

    expect(observability.listCorrelationEvents).toHaveBeenCalledWith('corr-1');
    expect(observability.listDeploys).toHaveBeenCalledWith({ page: 1, pageSize: 25 });
    expect(observability.getDeploy).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(observability.listRunbooks).toHaveBeenCalledWith({ component: 'api' });
    expect(observability.listTopology).toHaveBeenCalledWith({ kind: 'service' });
    expect(observability.listSeverityPolicies).toHaveBeenCalledWith({ severity: 'critical' });
  });

  it('requires the internal token before appending deploy events', async () => {
    const { controller, observability } = buildController();

    await expect(controller.captureDeploy('bad-token', DEPLOY_DTO)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await controller.captureDeploy('valid-token', DEPLOY_DTO);

    expect(observability.captureDeploy).toHaveBeenCalledTimes(1);
    expect(observability.captureDeploy).toHaveBeenCalledWith(DEPLOY_DTO);
  });
});
