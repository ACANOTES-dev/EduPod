import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { PlatformSearchController } from './platform-search.controller';
import { PlatformSearchService } from './platform-search.service';

const alwaysAllowGuard = { canActivate: () => true };

describe('PlatformSearchController', () => {
  let controller: PlatformSearchController;
  let service: { search: jest.Mock };

  beforeEach(async () => {
    service = { search: jest.fn() };
    const module = await Test.createTestingModule({
      controllers: [PlatformSearchController],
      providers: [{ provide: PlatformSearchService, useValue: service }],
    })
      .overrideGuard(AuthGuard)
      .useValue(alwaysAllowGuard)
      .overrideGuard(PlatformRoleGuard)
      .useValue(alwaysAllowGuard)
      .compile();

    controller = module.get(PlatformSearchController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates global search to the service', async () => {
    const response = { alerts: [], jobs: [], tenants: [], users: [] };
    service.search.mockResolvedValueOnce(response);

    await expect(controller.search({ q: 'north' })).resolves.toBe(response);
    expect(service.search).toHaveBeenCalledWith('north');
  });
});
