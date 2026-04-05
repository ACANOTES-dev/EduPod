import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';

import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';

const APP_URL = 'https://app.edupod.test';

describe('UnsubscribeController', () => {
  let controller: UnsubscribeController;
  let mockService: {
    processUnsubscribe: jest.Mock;
  };
  let mockConfigService: {
    get: jest.Mock;
  };
  let mockResponse: {
    redirect: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      processUnsubscribe: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue(APP_URL),
    };
    mockResponse = {
      redirect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnsubscribeController],
      providers: [
        { provide: UnsubscribeService, useValue: mockService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<UnsubscribeController>(UnsubscribeController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── unsubscribe() ────────────────────────────────────────────────────────

  describe('UnsubscribeController — unsubscribe', () => {
    it('should process unsubscribe and redirect to success page', async () => {
      mockService.processUnsubscribe.mockResolvedValue(undefined);

      await controller.unsubscribe('valid-token', mockResponse as unknown as Response);

      expect(mockService.processUnsubscribe).toHaveBeenCalledWith('valid-token');
      expect(mockResponse.redirect).toHaveBeenCalledWith(`${APP_URL}/unsubscribed`);
    });

    it('should throw BadRequestException when token is missing', async () => {
      // Pass empty string (falsy) as token
      await expect(controller.unsubscribe('', mockResponse as unknown as Response)).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        controller.unsubscribe('', mockResponse as unknown as Response),
      ).rejects.toMatchObject({
        response: {
          error: expect.objectContaining({ code: 'MISSING_TOKEN' }),
        },
      });
    });

    it('should redirect to error page when unsubscribe processing fails', async () => {
      mockService.processUnsubscribe.mockRejectedValue(
        new Error('Invalid or expired unsubscribe token'),
      );

      await controller.unsubscribe('invalid-token', mockResponse as unknown as Response);

      expect(mockResponse.redirect).toHaveBeenCalledWith(`${APP_URL}/unsubscribed?error=invalid`);
    });

    it('should redirect to error page on any unexpected error', async () => {
      mockService.processUnsubscribe.mockRejectedValue(new Error('Database connection failed'));

      await controller.unsubscribe('some-token', mockResponse as unknown as Response);

      expect(mockResponse.redirect).toHaveBeenCalledWith(`${APP_URL}/unsubscribed?error=invalid`);
    });

    it('should use default APP_URL when not configured', async () => {
      mockConfigService.get.mockReturnValue('http://localhost:5551');
      mockService.processUnsubscribe.mockResolvedValue(undefined);

      await controller.unsubscribe('valid-token', mockResponse as unknown as Response);

      expect(mockResponse.redirect).toHaveBeenCalledWith('http://localhost:5551/unsubscribed');
    });

    it('should delegate token validation entirely to the service', async () => {
      mockService.processUnsubscribe.mockResolvedValue(undefined);

      await controller.unsubscribe('any-token-value', mockResponse as unknown as Response);

      expect(mockService.processUnsubscribe).toHaveBeenCalledWith('any-token-value');
    });

    it('should handle non-Error thrown by service (unknown error branch)', async () => {
      // Service rejects with a non-Error value
      mockService.processUnsubscribe.mockRejectedValue('string error value');

      await controller.unsubscribe('some-token', mockResponse as unknown as Response);

      // Should still redirect to error page
      expect(mockResponse.redirect).toHaveBeenCalledWith(`${APP_URL}/unsubscribed?error=invalid`);
    });
  });
});
