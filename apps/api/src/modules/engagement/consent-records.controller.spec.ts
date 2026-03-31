/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import { ConsentRecordsController } from './consent-records.controller';
import { ConsentRecordsService } from './consent-records.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const mockTenant = { tenant_id: TENANT_ID };

function buildMockConsentService() {
  return {
    findAll: jest.fn(),
    findByStudent: jest.fn(),
    revoke: jest.fn(),
  };
}

describe('ConsentRecordsController', () => {
  let controller: ConsentRecordsController;
  let consentService: ReturnType<typeof buildMockConsentService>;

  beforeEach(async () => {
    consentService = buildMockConsentService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsentRecordsController],
      providers: [{ provide: ConsentRecordsService, useValue: consentService }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConsentRecordsController>(ConsentRecordsController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call consentRecordsService.findAll with tenantId and query', async () => {
    const query = { page: 1, pageSize: 20, order: 'desc' as const, student_id: STUDENT_ID };
    const expected = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
    consentService.findAll.mockResolvedValue(expected);

    const result = await controller.findAll(mockTenant, query);

    expect(consentService.findAll).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toBe(expected);
  });

  it('should call consentRecordsService.findByStudent with tenantId and studentId', async () => {
    const expected = [{ id: 'consent-1', status: 'active' }];
    consentService.findByStudent.mockResolvedValue(expected);

    const result = await controller.findByStudent(mockTenant, STUDENT_ID);

    expect(consentService.findByStudent).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    expect(result).toBe(expected);
  });
});
