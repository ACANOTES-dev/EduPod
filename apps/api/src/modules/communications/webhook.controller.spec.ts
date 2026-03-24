import { createHmac } from 'crypto';

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

describe('WebhookController', () => {
  let controller: WebhookController;
  let mockService: {
    handleResendEvent: jest.Mock;
    handleTwilioEvent: jest.Mock;
  };
  let mockConfigService: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      handleResendEvent: jest.fn(),
      handleTwilioEvent: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: WebhookService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<WebhookController>(WebhookController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('handleResend', () => {
    it('should pass event to service when no secret is configured in non-production', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const body = { type: 'email.delivered', data: { message_id: 'msg-1' } };
      const req = { rawBody: Buffer.from(JSON.stringify(body)) } as unknown as Request & { rawBody: Buffer };
      mockService.handleResendEvent.mockResolvedValue(undefined);

      // NODE_ENV is 'test' by default, not 'production', so skip verification
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      await controller.handleResend(req, 'svix-id-1', '1000000000', 'v1,sig', body);

      expect(mockService.handleResendEvent).toHaveBeenCalledWith(body);
      process.env.NODE_ENV = originalEnv;
    });

    it('should verify signature and pass event to service when secret is configured', async () => {
      const secretBytes = Buffer.from('dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MDEyMzQ=', 'base64');
      const webhookSecret = `whsec_dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MDEyMzQ=`;
      mockConfigService.get.mockReturnValue(webhookSecret);

      const body = { type: 'email.delivered', data: { message_id: 'msg-1' } };
      const rawBody = Buffer.from(JSON.stringify(body));
      const svixId = 'svix-id-1';
      const svixTimestamp = String(Math.floor(Date.now() / 1000));

      const payload = `${svixId}.${svixTimestamp}.${rawBody.toString()}`;
      const expectedSig = createHmac('sha256', secretBytes).update(payload).digest('base64');
      const svixSignature = `v1,${expectedSig}`;

      const req = { rawBody } as unknown as Request & { rawBody: Buffer };
      mockService.handleResendEvent.mockResolvedValue(undefined);

      await controller.handleResend(req, svixId, svixTimestamp, svixSignature, body);

      expect(mockService.handleResendEvent).toHaveBeenCalledWith(body);
    });

    it('should reject invalid Resend webhook signature', async () => {
      const webhookSecret = `whsec_dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MDEyMzQ=`;
      mockConfigService.get.mockReturnValue(webhookSecret);

      const body = { type: 'email.delivered', data: { message_id: 'msg-1' } };
      const rawBody = Buffer.from(JSON.stringify(body));
      const req = { rawBody } as unknown as Request & { rawBody: Buffer };

      await expect(
        controller.handleResend(req, 'svix-id-1', String(Math.floor(Date.now() / 1000)), 'v1,badsignature', body),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject when timestamp is too old', async () => {
      const secretBytes = Buffer.from('dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MDEyMzQ=', 'base64');
      const webhookSecret = `whsec_dGVzdC1zZWNyZXQtMTIzNDU2Nzg5MDEyMzQ=`;
      mockConfigService.get.mockReturnValue(webhookSecret);

      const body = { type: 'email.delivered', data: { message_id: 'msg-1' } };
      const rawBody = Buffer.from(JSON.stringify(body));
      const svixId = 'svix-id-1';
      // Timestamp 10 minutes ago (> 5 min tolerance)
      const svixTimestamp = String(Math.floor(Date.now() / 1000) - 600);

      const payload = `${svixId}.${svixTimestamp}.${rawBody.toString()}`;
      const expectedSig = createHmac('sha256', secretBytes).update(payload).digest('base64');
      const svixSignature = `v1,${expectedSig}`;

      const req = { rawBody } as unknown as Request & { rawBody: Buffer };

      await expect(
        controller.handleResend(req, svixId, svixTimestamp, svixSignature, body),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('handleTwilio', () => {
    it('should pass event to service when no auth token is configured in non-production', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const body = { MessageSid: 'SM123', MessageStatus: 'delivered' };
      const req = {} as unknown as Request & { rawBody: Buffer };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      await controller.handleTwilio(req, '', body);

      expect(mockService.handleTwilioEvent).toHaveBeenCalledWith(body);
      process.env.NODE_ENV = originalEnv;
    });

    it('should throw in production when TWILIO_AUTH_TOKEN is missing', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const body = { MessageSid: 'SM123', MessageStatus: 'delivered' };
      const req = {} as unknown as Request & { rawBody: Buffer };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      await expect(
        controller.handleTwilio(req, '', body),
      ).rejects.toThrow(UnauthorizedException);

      process.env.NODE_ENV = originalEnv;
    });
  });
});
