import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { WebsiteReadFacade } from './website-read.facade';

const TENANT_ID = 'tenant-aaa-111';

const mockPrisma = {
  contactFormSubmission: {
    count: jest.fn(),
  },
};

describe('WebsiteReadFacade', () => {
  let facade: WebsiteReadFacade;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [WebsiteReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<WebsiteReadFacade>(WebsiteReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  describe('WebsiteReadFacade — countSubmissionsBeforeDate', () => {
    it('should return count of submissions before cutoff date', async () => {
      mockPrisma.contactFormSubmission.count.mockResolvedValue(42);
      const cutoff = new Date('2025-01-01T00:00:00Z');

      const result = await facade.countSubmissionsBeforeDate(TENANT_ID, cutoff);

      expect(result).toBe(42);
      expect(mockPrisma.contactFormSubmission.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          created_at: { lt: cutoff },
        },
      });
    });

    it('should return 0 when no submissions exist before cutoff', async () => {
      mockPrisma.contactFormSubmission.count.mockResolvedValue(0);
      const cutoff = new Date('2020-01-01T00:00:00Z');

      const result = await facade.countSubmissionsBeforeDate(TENANT_ID, cutoff);

      expect(result).toBe(0);
    });
  });
});
