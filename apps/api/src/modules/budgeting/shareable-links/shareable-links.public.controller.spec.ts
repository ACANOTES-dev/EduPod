import { NotFoundException } from '@nestjs/common';

import { ShareableLinksPublicController } from './shareable-links.public.controller';
import { ShareableLinksService } from './shareable-links.service';
import type { PublicShareResponse } from './shareable-links.types';

const VALID_TOKEN = '0ee2408b-96f2-413b-b506-e904b2fa457d';

const MOCK_RESPONSE: PublicShareResponse = {
  tenant_name: 'NHQS',
  currency_code: 'AED',
  model_id: '55eb99b5-90f7-4aff-a441-94d410d2c045',
  model_name: '2026-27 Budget',
  version_number: 1,
  published_at: '2026-04-26T14:03:17.000Z',
  fiscal_year_label: '2025/26',
  payload: { totals_by_year: [] },
};

describe('ShareableLinksPublicController', () => {
  let controller: ShareableLinksPublicController;
  let service: jest.Mocked<ShareableLinksService>;

  beforeEach(() => {
    service = {
      resolveByToken: jest.fn(),
    } as unknown as jest.Mocked<ShareableLinksService>;
    controller = new ShareableLinksPublicController(service);
  });

  it('delegates to the service with the token only when no password is supplied', async () => {
    service.resolveByToken.mockResolvedValue(MOCK_RESPONSE);
    const result = await controller.resolve(VALID_TOKEN);
    expect(service.resolveByToken).toHaveBeenCalledWith(VALID_TOKEN, undefined);
    expect(result.tenant_name).toBe('NHQS');
    expect(result.payload).toBeDefined();
  });

  it('forwards the password query param when supplied', async () => {
    service.resolveByToken.mockResolvedValue(MOCK_RESPONSE);
    await controller.resolve(VALID_TOKEN, 'hunter2');
    expect(service.resolveByToken).toHaveBeenCalledWith(VALID_TOKEN, 'hunter2');
  });

  it('rejects empty tokens with a structured 404 before touching the service', async () => {
    await expect(controller.resolve('')).rejects.toBeInstanceOf(NotFoundException);
    expect(service.resolveByToken).not.toHaveBeenCalled();
  });

  it('propagates service-level NotFoundException as-is (preserves the structured code)', async () => {
    service.resolveByToken.mockRejectedValue(
      new NotFoundException({
        code: 'SHARE_LINK_INVALID',
        message: 'This share link is invalid, expired, revoked, or password-protected.',
      }),
    );
    await expect(controller.resolve(VALID_TOKEN)).rejects.toBeInstanceOf(NotFoundException);
  });
});
