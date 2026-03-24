import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { StripeService } from './stripe.service';
import { StripeWebhookController } from './stripe-webhook.controller';

const mockStripeService = {
  handleWebhook: jest.fn(),
};

const mockPrisma = {};

describe('StripeWebhookController', () => {
  let controller: StripeWebhookController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        { provide: StripeService, useValue: mockStripeService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    controller = module.get<StripeWebhookController>(StripeWebhookController);
    jest.clearAllMocks();
  });

  it('should call stripeService.handleWebhook with tenant, rawBody and signature', async () => {
    const body = {
      data: { object: { metadata: { tenant_id: 'tenant-uuid' } } },
    };
    const rawBody = Buffer.from(JSON.stringify(body));
    const req = { rawBody, body } as never;

    mockStripeService.handleWebhook.mockResolvedValue({ received: true });
    await controller.handleWebhook(req, 'sig-header');

    expect(mockStripeService.handleWebhook).toHaveBeenCalledWith(
      'tenant-uuid',
      rawBody,
      'sig-header',
    );
  });

  it('should throw BadRequestException when tenant_id is missing from metadata', async () => {
    const body = { data: { object: { metadata: {} } } };
    const rawBody = Buffer.from(JSON.stringify(body));
    const req = { rawBody, body } as never;

    await expect(controller.handleWebhook(req, 'sig-header')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should use JSON-stringified body when rawBody is not available', async () => {
    const body = {
      data: { object: { metadata: { tenant_id: 'tenant-uuid' } } },
    };
    const req = { rawBody: undefined, body } as never;

    mockStripeService.handleWebhook.mockResolvedValue({ received: true });
    await controller.handleWebhook(req, 'sig-header');

    expect(mockStripeService.handleWebhook).toHaveBeenCalledWith(
      'tenant-uuid',
      expect.any(Buffer),
      'sig-header',
    );
  });
});
