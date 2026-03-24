import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { BrandingService } from './branding.service';

const TENANT_ID = 'tenant-uuid-1';

const mockBranding = {
  id: 'branding-uuid-1',
  tenant_id: TENANT_ID,
  logo_url: 'logos/logo.png',
  primary_color: '#1a2b3c',
  secondary_color: '#4d5e6f',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('BrandingService', () => {
  let service: BrandingService;
  let mockPrisma: {
    tenantBranding: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let mockS3: {
    upload: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantBranding: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    mockS3 = {
      upload: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get<BrandingService>(BrandingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getBranding', () => {
    it('should return branding when found', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(mockBranding);

      const result = await service.getBranding(TENANT_ID);

      expect(mockPrisma.tenantBranding.findUnique).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
      expect(result).toEqual(mockBranding);
    });

    it('should throw NotFoundException when branding not found', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);

      await expect(service.getBranding(TENANT_ID)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateBranding', () => {
    it('should upsert branding with mapped colour field names', async () => {
      const dto = {
        primary_colour: '#ff0000',
        secondary_colour: '#00ff00',
      };
      mockPrisma.tenantBranding.upsert.mockResolvedValue({
        ...mockBranding,
        primary_color: '#ff0000',
        secondary_color: '#00ff00',
      });

      await service.updateBranding(TENANT_ID, dto);

      expect(mockPrisma.tenantBranding.upsert).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        update: { primary_color: '#ff0000', secondary_color: '#00ff00' },
        create: { tenant_id: TENANT_ID, primary_color: '#ff0000', secondary_color: '#00ff00' },
      });
    });

    it('should upsert branding with logo_url', async () => {
      const dto = { logo_url: 'new-logo.png' };
      mockPrisma.tenantBranding.upsert.mockResolvedValue({ ...mockBranding, logo_url: 'new-logo.png' });

      await service.updateBranding(TENANT_ID, dto);

      expect(mockPrisma.tenantBranding.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { logo_url: 'new-logo.png' },
        }),
      );
    });
  });

  describe('uploadLogo', () => {
    const validFile = {
      buffer: Buffer.from('fake-image'),
      originalname: 'logo.png',
      mimetype: 'image/png',
      size: 1024,
    };

    it('should upload to S3 and upsert branding record', async () => {
      mockS3.upload.mockResolvedValue(`${TENANT_ID}/logos/logo.png`);
      mockPrisma.tenantBranding.upsert.mockResolvedValue({
        ...mockBranding,
        logo_url: `${TENANT_ID}/logos/logo.png`,
      });

      const result = await service.uploadLogo(TENANT_ID, validFile);

      expect(mockS3.upload).toHaveBeenCalledWith(TENANT_ID, 'logos/logo.png', validFile.buffer, 'image/png');
      expect(mockPrisma.tenantBranding.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { logo_url: `${TENANT_ID}/logos/logo.png` },
        }),
      );
      expect(result.logo_url).toBe(`${TENANT_ID}/logos/logo.png`);
    });

    it('should reject invalid file extensions', async () => {
      const badFile = { ...validFile, originalname: 'doc.pdf' };

      await expect(service.uploadLogo(TENANT_ID, badFile)).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid mime types', async () => {
      const badFile = { ...validFile, mimetype: 'application/pdf' };

      await expect(service.uploadLogo(TENANT_ID, badFile)).rejects.toThrow(BadRequestException);
    });

    it('should reject files exceeding 5 MB', async () => {
      const bigFile = { ...validFile, size: 6 * 1024 * 1024 };

      await expect(service.uploadLogo(TENANT_ID, bigFile)).rejects.toThrow(BadRequestException);
    });
  });
});
