import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';

const TENANT_ID = 'tenant-uuid-1';
const tenantCtx: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

describe('BrandingController', () => {
  let controller: BrandingController;
  let mockService: {
    getBranding: jest.Mock;
    updateBranding: jest.Mock;
    uploadLogo: jest.Mock;
  };

  beforeEach(async () => {
    mockService = {
      getBranding: jest.fn(),
      updateBranding: jest.fn(),
      uploadLogo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BrandingController],
      providers: [
        { provide: BrandingService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BrandingController>(BrandingController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call brandingService.getBranding with tenant_id', async () => {
    const expected = { id: 'b1', logo_url: 'logo.png' };
    mockService.getBranding.mockResolvedValue(expected);

    const result = await controller.getBranding(tenantCtx);

    expect(mockService.getBranding).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toEqual(expected);
  });

  it('should call brandingService.updateBranding with tenant_id and dto', async () => {
    const dto = { primary_colour: '#ff0000' };
    const expected = { id: 'b1', primary_color: '#ff0000' };
    mockService.updateBranding.mockResolvedValue(expected);

    const result = await controller.updateBranding(tenantCtx, dto);

    expect(mockService.updateBranding).toHaveBeenCalledWith(TENANT_ID, dto);
    expect(result).toEqual(expected);
  });

  it('should call brandingService.uploadLogo when file is provided', async () => {
    const file = {
      buffer: Buffer.from('image'),
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
    };
    const expected = { id: 'b1', logo_url: 'logos/logo.png' };
    mockService.uploadLogo.mockResolvedValue(expected);

    const result = await controller.uploadLogo(tenantCtx, file);

    expect(mockService.uploadLogo).toHaveBeenCalledWith(TENANT_ID, file);
    expect(result).toEqual(expected);
  });

  it('should throw BadRequestException when no file is uploaded', async () => {
    await expect(
      controller.uploadLogo(tenantCtx, undefined),
    ).rejects.toThrow(BadRequestException);
  });
});
