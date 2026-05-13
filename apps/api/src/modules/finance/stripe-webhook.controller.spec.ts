import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { TenantModuleService } from '../../common/services/tenant-module.service';

import { StripeWebhookController } from './stripe-webhook.controller';
import { StripeService } from './stripe.service';

const mockStripeService = {
  processWebhookEvent: jest.fn(),
  verifyWebhookEvent: jest.fn(),
};

const mockTenantModuleService = {
  isEnabled: jest.fn(),
};

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
        { provide: TenantModuleService, useValue: mockTenantModuleService },
      ],
    }).compile();
    controller = module.get<StripeWebhookController>(StripeWebhookController);
    jest.clearAllMocks();
    mockStripeService.verifyWebhookEvent.mockResolvedValue({
      id: 'evt_123',
      type: 'checkout.session.completed',
    });
    mockStripeService.processWebhookEvent.mockResolvedValue({ received: true });
    mockTenantModuleService.isEnabled.mockResolvedValue(true);
  });

  it('should verify and process the Stripe event when finance is enabled', async () => {
    const body = {
      data: { object: { metadata: { tenant_id: 'tenant-uuid' } } },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const req = { rawBody, body } as never;

    await controller.handleWebhook(req, 'sig-header');

    expect(mockStripeService.verifyWebhookEvent).toHaveBeenCalledWith(
      'tenant-uuid',
      rawBody,
      'sig-header',
    );
    expect(mockTenantModuleService.isEnabled).toHaveBeenCalledWith('tenant-uuid', 'finance');
    expect(mockStripeService.processWebhookEvent).toHaveBeenCalledWith('tenant-uuid', {
      id: 'evt_123',
      type: 'checkout.session.completed',
    });
  });

  it('should throw BadRequestException when tenant_id is missing from metadata', async () => {
    const body = { data: { object: { metadata: {} } } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const req = { rawBody, body } as never;

    await expect(controller.handleWebhook(req, 'sig-header')).rejects.toThrow(BadRequestException);
  });

  it('should use JSON-stringified body when rawBody is not available', async () => {
    const body = {
      data: { object: { metadata: { tenant_id: 'tenant-uuid' } } },
    };
    const req = { rawBody: undefined, body } as never;

    await controller.handleWebhook(req, 'sig-header');

    expect(mockStripeService.verifyWebhookEvent).toHaveBeenCalledWith(
      'tenant-uuid',
      expect.any(Buffer),
      'sig-header',
    );
  });

  it('should acknowledge and skip valid Stripe webhooks when finance is disabled', async () => {
    const body = {
      data: { object: { metadata: { tenant_id: 'tenant-uuid' } } },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const req = { rawBody, body } as never;
    mockTenantModuleService.isEnabled.mockResolvedValue(false);

    const result = await controller.handleWebhook(req, 'sig-header');

    expect(result).toEqual({ received: true, skipped: 'module_disabled' });
    expect(mockStripeService.verifyWebhookEvent).toHaveBeenCalledWith(
      'tenant-uuid',
      rawBody,
      'sig-header',
    );
    expect(mockStripeService.processWebhookEvent).not.toHaveBeenCalled();
  });
});
