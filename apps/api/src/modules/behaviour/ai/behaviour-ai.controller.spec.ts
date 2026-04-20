/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../../common/services/permission-cache.service';
import { ConfigurationReadFacade, MOCK_FACADE_PROVIDERS } from '../../../common/tests/mock-facades';

import { BehaviourAiParseService } from './behaviour-ai-parse.service';
import { BehaviourAiSummaryService } from './behaviour-ai-summary.service';
import { BehaviourAIController } from './behaviour-ai.controller';
import { BehaviourAIService } from './behaviour-ai.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID = 'ddddddd1-dddd-dddd-dddd-dddddddddddd';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const PERMISSIONS = ['behaviour.log', 'behaviour.view', 'behaviour.ai_query'];

describe('BehaviourAIController', () => {
  let controller: BehaviourAIController;
  let mockParse: { parse: jest.Mock };
  let mockSummary: { getSummary: jest.Mock };
  let mockQuery: { processNLQuery: jest.Mock; getQueryHistory: jest.Mock };
  let mockPermissionCache: { getPermissions: jest.Mock };
  let mockConfiguration: { findSettingsJson: jest.Mock };

  beforeEach(async () => {
    mockParse = { parse: jest.fn().mockResolvedValue({ suggested_polarity: 'negative' }) };
    mockSummary = {
      getSummary: jest.fn().mockResolvedValue({
        student_id: STUDENT_ID,
        summary_paragraph: '...',
        highlights: [],
        period: { from: '2026-01-01', to: '2026-04-20' },
        generated_at: '2026-04-20T10:00:00Z',
        cached: false,
      }),
    };
    mockQuery = {
      processNLQuery: jest.fn().mockResolvedValue({
        result: 'ok',
        data_as_of: '2026-04-20T10:00:00Z',
        ai_generated: true,
        scope_applied: 'school-wide',
        confidence: null,
      }),
      getQueryHistory: jest
        .fn()
        .mockResolvedValue({ entries: [], meta: { page: 1, pageSize: 20, total: 0 } }),
    };
    mockPermissionCache = { getPermissions: jest.fn().mockResolvedValue(PERMISSIONS) };
    mockConfiguration = { findSettingsJson: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourAIController],
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: BehaviourAiParseService, useValue: mockParse },
        { provide: BehaviourAiSummaryService, useValue: mockSummary },
        { provide: BehaviourAIService, useValue: mockQuery },
        { provide: PermissionCacheService, useValue: mockPermissionCache },
        { provide: ConfigurationReadFacade, useValue: mockConfiguration },
      ],
    })
      .overrideGuard(require('../../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../../common/guards/module-enabled.guard').ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourAIController>(BehaviourAIController);
  });

  afterEach(() => jest.clearAllMocks());

  it('delegates ai-parse to the parse service and wraps the result', async () => {
    const body = {
      description: 'Alice disrupted the maths class this morning for the third time.',
    };
    const result = await controller.aiParse(TENANT, USER, body);
    expect(mockParse.parse).toHaveBeenCalledWith(TENANT_ID, USER_ID, body.description);
    expect(result).toEqual({ data: { suggested_polarity: 'negative' } });
  });

  it('delegates ai-summary to the summary service', async () => {
    const result = await controller.getStudentAiSummary(TENANT, STUDENT_ID, {});
    expect(mockSummary.getSummary).toHaveBeenCalledWith(
      TENANT_ID,
      STUDENT_ID,
      undefined,
      undefined,
    );
    expect(result.data.student_id).toBe(STUDENT_ID);
  });

  it('delegates ai-query to the NL query service', async () => {
    const input = { query: 'Show the top 5 incidents this week' };
    await controller.aiQuery(TENANT, USER, input as never);
    expect(mockQuery.processNLQuery).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      PERMISSIONS,
      input,
      expect.any(Object) as Record<string, unknown>,
    );
  });

  it('delegates ai-query history with the caller permissions', async () => {
    await controller.aiQueryHistory(TENANT, USER, { page: 1, pageSize: 20 });
    expect(mockQuery.getQueryHistory).toHaveBeenCalledWith(TENANT_ID, USER_ID, 1, 20, PERMISSIONS);
  });
});
