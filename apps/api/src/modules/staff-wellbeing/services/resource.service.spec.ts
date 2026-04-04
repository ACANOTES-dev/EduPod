import { Test, TestingModule } from '@nestjs/testing';

import { ConfigurationReadFacade, MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ResourceService } from './resource.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeSettingsRecord = (wellbeing: Record<string, unknown>) => ({
  tenant_id: TENANT_ID,
  settings: { staff_wellbeing: wellbeing },
  created_at: new Date(),
  updated_at: new Date(),
});

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('ResourceService', () => {
  let service: ResourceService;
  let mockPrisma: { tenantSetting: { findUnique: jest.Mock } };

  beforeEach(async () => {
    mockPrisma = {
      tenantSetting: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ResourceService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigurationReadFacade,
          useValue: { findSettings: mockPrisma.tenantSetting.findUnique },
        },
      ],
    }).compile();

    service = module.get<ResourceService>(ResourceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Happy path ──────────────────────────────────────────────────────────

  it('should return EAP info and resources from settings', async () => {
    mockPrisma.tenantSetting.findUnique.mockResolvedValue(
      makeSettingsRecord({
        eap_provider_name: 'Acme EAP',
        eap_phone: '+353-1-234-5678',
        eap_website: 'https://eap.example.com',
        eap_hours: '24/7',
        eap_management_body: 'HSE',
        eap_last_verified_date: '2025-01-15',
        external_resources: [
          { name: 'Samaritans', phone: '116 123', website: 'https://samaritans.org' },
        ],
      }),
    );

    const result = await service.getResources(TENANT_ID);

    expect(result).toEqual({
      eap: {
        provider_name: 'Acme EAP',
        phone: '+353-1-234-5678',
        website: 'https://eap.example.com',
        hours: '24/7',
        management_body: 'HSE',
        last_verified_date: '2025-01-15',
      },
      resources: [
        { name: 'Samaritans', phone: '116 123', website: 'https://samaritans.org' },
      ],
    });

    expect(mockPrisma.tenantSetting.findUnique).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should coerce empty-string EAP fields to null', async () => {
    mockPrisma.tenantSetting.findUnique.mockResolvedValue(
      makeSettingsRecord({
        eap_provider_name: '',
        eap_phone: '',
        eap_website: '',
        eap_hours: '',
        eap_management_body: '',
        eap_last_verified_date: null,
        external_resources: [],
      }),
    );

    const result = await service.getResources(TENANT_ID);

    expect(result.eap).toEqual({
      provider_name: null,
      phone: null,
      website: null,
      hours: null,
      management_body: null,
      last_verified_date: null,
    });
    expect(result.resources).toEqual([]);
  });

  // ─── Defaults when no data ────────────────────────────────────────────────

  it('should return defaults when no settings record exists', async () => {
    mockPrisma.tenantSetting.findUnique.mockResolvedValue(null);

    const result = await service.getResources(TENANT_ID);

    expect(result).toEqual({
      eap: {
        provider_name: null,
        phone: null,
        website: null,
        hours: null,
        management_body: null,
        last_verified_date: null,
      },
      resources: [],
    });
  });

  it('should return defaults when staff_wellbeing key is missing', async () => {
    mockPrisma.tenantSetting.findUnique.mockResolvedValue({
      tenant_id: TENANT_ID,
      settings: { other_module: {} },
      created_at: new Date(),
      updated_at: new Date(),
    });

    const result = await service.getResources(TENANT_ID);

    expect(result).toEqual({
      eap: {
        provider_name: null,
        phone: null,
        website: null,
        hours: null,
        management_body: null,
        last_verified_date: null,
      },
      resources: [],
    });
  });
});
