import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { PublicContactController } from './public-contact.controller';
import { ContactFormService } from './contact-form.service';

const TENANT_ID = 'tenant-uuid-1';

const tenant: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('PublicContactController', () => {
  let controller: PublicContactController;
  let mockService: {
    submit: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      submit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicContactController],
      providers: [{ provide: ContactFormService, useValue: mockService }],
    }).compile();

    controller = module.get<PublicContactController>(PublicContactController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should delegate submit to the service with tenant, dto and ip', async () => {
    const dto = { name: 'John', email: 'john@example.com', message: 'Hello' };
    const created = { id: 'sub-1', ...dto, status: 'new_submission' };
    mockService.submit.mockResolvedValueOnce(created);

    const result = await controller.submit(tenant, '192.168.1.1', dto as never);
    expect(result).toEqual(created);
    expect(mockService.submit).toHaveBeenCalledWith(TENANT_ID, dto, '192.168.1.1');
  });

  it('should pass the client IP address to the service', async () => {
    const dto = { name: 'Jane', email: 'jane@example.com', message: 'Hi' };
    mockService.submit.mockResolvedValueOnce({ id: 'sub-2' });

    await controller.submit(tenant, '10.0.0.1', dto as never);
    expect(mockService.submit).toHaveBeenCalledWith(TENANT_ID, dto, '10.0.0.1');
  });

  it('should propagate service errors to the caller', async () => {
    const dto = { name: 'Spam', email: 'spam@example.com', message: 'Spam' };
    mockService.submit.mockRejectedValueOnce(new Error('Rate limit exceeded'));

    await expect(
      controller.submit(tenant, '1.2.3.4', dto as never),
    ).rejects.toThrow('Rate limit exceeded');
  });
});
