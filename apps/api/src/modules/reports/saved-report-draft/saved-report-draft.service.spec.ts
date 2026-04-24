import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { SavedReportDraftService } from './saved-report-draft.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const MOCK_DRAFT = {
  id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  tenant_id: TENANT_ID,
  user_id: USER_ID,
  subject_key: 'student',
  columns_json: { field_ids: ['student.identity.first_name'] },
  filters_json: { combinator: 'and', filters: [] },
  group_by_json: null,
  chart_type: null,
  chart_config_json: null,
  updated_at: new Date('2026-04-24'),
};

const mockTx = {
  savedReportDraft: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  }),
}));

describe('SavedReportDraftService', () => {
  let service: SavedReportDraftService;

  beforeEach(async () => {
    mockTx.savedReportDraft.findUnique.mockReset();
    mockTx.savedReportDraft.upsert.mockReset();
    mockTx.savedReportDraft.deleteMany.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [SavedReportDraftService, { provide: PrismaService, useValue: {} }],
    }).compile();

    service = module.get(SavedReportDraftService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns null when no draft exists for the user', async () => {
    mockTx.savedReportDraft.findUnique.mockResolvedValue(null);
    const result = await service.get(TENANT_ID, USER_ID);
    expect(result).toBeNull();
  });

  it('returns a DTO-shaped row when a draft exists', async () => {
    mockTx.savedReportDraft.findUnique.mockResolvedValue(MOCK_DRAFT);
    const result = await service.get(TENANT_ID, USER_ID);
    expect(result).not.toBeNull();
    expect(result?.subject_key).toBe('student');
    expect(typeof result?.updated_at).toBe('string');
  });

  it('upserts a draft and returns the persisted row', async () => {
    mockTx.savedReportDraft.upsert.mockResolvedValue(MOCK_DRAFT);
    const result = await service.upsert(TENANT_ID, USER_ID, {
      subject_key: 'student',
      columns_json: { field_ids: ['student.identity.first_name'] },
      filters_json: { combinator: 'and', filters: [] },
    });
    expect(mockTx.savedReportDraft.upsert).toHaveBeenCalledTimes(1);
    expect(result.subject_key).toBe('student');
  });

  it('clears a draft by (tenant_id, user_id)', async () => {
    mockTx.savedReportDraft.deleteMany.mockResolvedValue({ count: 1 });
    await service.clear(TENANT_ID, USER_ID);
    expect(mockTx.savedReportDraft.deleteMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, user_id: USER_ID },
    });
  });
});
