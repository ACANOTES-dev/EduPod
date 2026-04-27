import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

describe('WebhookController (legacy platform endpoint, post-Impl 05)', () => {
  let controller: WebhookController;
  let mockService: {
    handleResendEvent: jest.Mock;
    handleTwilioEvent: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      handleResendEvent: jest.fn().mockResolvedValue(undefined),
      handleTwilioEvent: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [{ provide: WebhookService, useValue: mockService }],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleResend (legacy)', () => {
    it('passes event to service without signature verification', async () => {
      const body = { type: 'email.delivered', data: { message_id: 'msg-1' } };
      const req = { rawBody: Buffer.from(JSON.stringify(body)) } as unknown as Request & {
        rawBody: Buffer;
      };

      await controller.handleResend(req, 'svix-id', '0', 'sig', body);

      expect(mockService.handleResendEvent).toHaveBeenCalledWith(body);
    });
  });

  describe('handleTwilio (legacy)', () => {
    it('passes event to service without signature verification', async () => {
      const body = { MessageSid: 'SM1', MessageStatus: 'delivered' };
      const req = {} as unknown as Request & { rawBody?: Buffer };

      await controller.handleTwilio(req, 'sig', body);

      expect(mockService.handleTwilioEvent).toHaveBeenCalledWith(body);
    });
  });
});
