import { Test } from '@nestjs/testing';

import { PublicTenantsController } from './public-tenants.controller';
import { PublicTenantsService } from './public-tenants.service';

describe('PublicTenantsController', () => {
  let controller: PublicTenantsController;
  let publicTenantsService: { findBySlug: jest.Mock };

  beforeEach(async () => {
    publicTenantsService = { findBySlug: jest.fn().mockResolvedValue({ slug: 'nhqs' }) };

    const module = await Test.createTestingModule({
      controllers: [PublicTenantsController],
      providers: [{ provide: PublicTenantsService, useValue: publicTenantsService }],
    }).compile();

    controller = module.get(PublicTenantsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('PublicTenantsController — getBySlug', () => {
    it('delegates public tenant slug lookup to the service', async () => {
      await expect(controller.getBySlug('nhqs')).resolves.toEqual({ slug: 'nhqs' });

      expect(publicTenantsService.findBySlug).toHaveBeenCalledWith('nhqs');
    });
  });
});
