import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ClassesReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { SchoolClosuresService } from './school-closures.service';

// Mock the RLS middleware (needed by create/remove/bulkCreate, but not isClosureDate)
jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  }),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'class-1';
const YEAR_GROUP_ID = 'yg-1';
const DATE = new Date('2026-03-15');

describe('SchoolClosuresService — isClosureDate', () => {
  let service: SchoolClosuresService;
  let mockPrisma: {
    schoolClosure: { findFirst: jest.Mock };
    class: { findFirst: jest.Mock };
    yearGroup: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      schoolClosure: { findFirst: jest.fn().mockResolvedValue(null) },
      class: { findFirst: jest.fn().mockResolvedValue(null) },
      yearGroup: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        SchoolClosuresService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassesReadFacade, useValue: { findYearGroupId: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    service = module.get<SchoolClosuresService>(SchoolClosuresService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── 1. Return true for 'all' scope closure ────────────────────────────
  it('should return true for all scope closure on the date', async () => {
    mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: 'closure-1' });

    const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

    expect(result).toBe(true);
    expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          closure_date: DATE,
          OR: expect.arrayContaining([
            { affects_scope: 'all' },
          ]),
        }),
      }),
    );
  });

  // ─── 2. Return true for 'year_group' scope matching class year group ───
  it('should return true for year_group scope matching class year group', async () => {
    mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: 'closure-2' });

    const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

    expect(result).toBe(true);
    // Verify year_group condition is included in OR
    expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { affects_scope: 'year_group', scope_entity_id: YEAR_GROUP_ID },
          ]),
        }),
      }),
    );
  });

  // ─── 3. Return true for 'class' scope matching class ID ────────────────
  it('should return true for class scope matching class ID', async () => {
    mockPrisma.schoolClosure.findFirst.mockResolvedValue({ id: 'closure-3' });

    const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID);

    expect(result).toBe(true);
    expect(mockPrisma.schoolClosure.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { affects_scope: 'class', scope_entity_id: CLASS_ID },
          ]),
        }),
      }),
    );
  });

  // ─── 4. Return false when no closure exists ────────────────────────────
  it('should return false when no closure exists', async () => {
    mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

    const result = await service.isClosureDate(TENANT_ID, DATE, CLASS_ID, YEAR_GROUP_ID);

    expect(result).toBe(false);
  });

  // ─── 5. Return false when closure scope doesn't match class ────────────
  it('should return false when closure scope does not match class', async () => {
    // No closure found for the given class/year_group/all combination
    mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);
    // When no yearGroupId provided and class lookup returns no year_group
    // (classesReadFacade.findYearGroupId returns null by default from provider)

    const result = await service.isClosureDate(TENANT_ID, DATE, 'class-unaffected');

    expect(result).toBe(false);
  });
});
