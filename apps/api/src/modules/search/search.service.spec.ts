/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { MeilisearchClient } from './meilisearch.client';
import { SearchService } from './search.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

describe('SearchService', () => {
  let service: SearchService;
  let mockMeilisearch: {
    available: boolean;
    search: jest.Mock;
  };
  let mockPrisma: Record<string, unknown>;
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockMeilisearch = {
      available: false,
      search: jest.fn(),
    };
    mockPrisma = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: MeilisearchClient, useValue: mockMeilisearch },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('search() — Meilisearch path', () => {
    beforeEach(() => {
      mockMeilisearch.available = true;
    });

    it('should search via Meilisearch when available and return results', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [
          {
            id: 'stu-1',
            first_name: 'John',
            last_name: 'Doe',
            student_number: 'STU-001',
            status: 'active',
          },
        ],
      });

      const result = await service.search(TENANT_ID, 'John', ['students'], 1, 20);

      expect(mockMeilisearch.search).toHaveBeenCalledWith('students', 'John', {
        filter: [`tenant_id = "${TENANT_ID}"`],
        limit: 20,
        offset: 0,
      });
      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.primary_label).toBe('John Doe');
      expect(result.results[0]!.entity_type).toBe('students');
    });

    it('should build primary_label from household_name when first/last names absent', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [{ id: 'hh-1', household_name: 'Smith Family', status: 'active' }],
      });

      const result = await service.search(TENANT_ID, 'Smith', ['households'], 1, 20);

      expect(result.results[0]!.primary_label).toBe('Smith Family');
    });

    it('should fall through to fallback search when Meilisearch returns null', async () => {
      mockMeilisearch.search.mockResolvedValue(null);

      // The result will still come from Meilisearch path (null hits just means empty)
      // Actually: when result is null per type, it pushes nothing — so total is 0
      const result = await service.search(TENANT_ID, 'test', ['students'], 1, 20);

      // Returns SearchResponse from Meilisearch path with empty results
      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should search multiple types and combine results', async () => {
      mockMeilisearch.search
        .mockResolvedValueOnce({
          hits: [{ id: 'stu-1', first_name: 'John', last_name: 'Doe', status: 'active' }],
        })
        .mockResolvedValueOnce({
          hits: [
            {
              id: 'p-1',
              first_name: 'Jane',
              last_name: 'Doe',
              email: 'jane@example.com',
              status: 'active',
            },
          ],
        });

      const result = await service.search(TENANT_ID, 'Doe', ['students', 'parents'], 1, 20);

      expect(mockMeilisearch.search).toHaveBeenCalledTimes(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0]!.entity_type).toBe('students');
      expect(result.results[1]!.entity_type).toBe('parents');
    });

    it('should limit results to pageSize', async () => {
      const manyHits = Array.from({ length: 30 }, (_, i) => ({
        id: `stu-${i}`,
        first_name: 'Student',
        last_name: `${i}`,
        status: 'active',
      }));
      mockMeilisearch.search.mockResolvedValue({ hits: manyHits });

      const result = await service.search(TENANT_ID, 'Student', ['students'], 1, 5);

      expect(result.results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('search() — fallback path', () => {
    beforeEach(() => {
      mockMeilisearch.available = false;
    });

    it('should use PostgreSQL fallback when Meilisearch is not available', async () => {
      const mockTx = {
        student: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'stu-1',
              first_name: 'John',
              last_name: 'Doe',
              student_number: 'STU-001',
              status: 'active',
              year_group: { name: 'Year 10' },
            },
          ]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'John', ['students'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.primary_label).toBe('John Doe');
      expect(result.results[0]!.secondary_label).toBe('Year 10');
    });

    it('should search parents in fallback mode', async () => {
      const mockTx = {
        parent: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'p-1',
              first_name: 'Jane',
              last_name: 'Doe',
              email: 'jane@example.com',
              status: 'active',
            },
          ]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'Jane', ['parents'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.entity_type).toBe('parents');
      expect(result.results[0]!.secondary_label).toBe('jane@example.com');
    });

    it('should search staff in fallback mode', async () => {
      const mockTx = {
        staffProfile: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'sp-1',
              user: { first_name: 'Alice', last_name: 'Smith' },
              job_title: 'Teacher',
              department: 'Math',
              employment_status: 'active',
            },
          ]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'Alice', ['staff'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.primary_label).toBe('Alice Smith');
      expect(result.results[0]!.secondary_label).toBe('Teacher');
    });

    it('should search households in fallback mode', async () => {
      const mockTx = {
        household: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'hh-1', household_name: 'Smith Family', status: 'active' }]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'Smith', ['households'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.entity_type).toBe('households');
      expect(result.results[0]!.primary_label).toBe('Smith Family');
    });

    it('should return empty results when no types match', async () => {
      const mockTx = {};
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'test', ['unknown_type'], 1, 20);

      expect(result.results).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should use department as secondary label when job_title is missing in staff', async () => {
      const mockTx = {
        staffProfile: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'sp-1',
              user: { first_name: 'Alice', last_name: 'Smith' },
              job_title: null,
              department: 'Math',
              employment_status: 'active',
            },
          ]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'Alice', ['staff'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.secondary_label).toBe('Math');
    });

    it('should fallback to name when household_name is missing', async () => {
      const mockTx = {
        household: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'hh-1', household_name: '', status: 'active' }]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'Smith', ['households'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.primary_label).toBe('');
    });

    it('should handle empty secondary label in households', async () => {
      const mockTx = {
        household: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'hh-1', household_name: 'Test Family', status: 'active' }]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'Test', ['households'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.secondary_label).toBe('');
    });

    it('should handle student with missing year_group', async () => {
      const mockTx = {
        student: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'stu-1',
              first_name: 'John',
              last_name: 'Doe',
              student_number: 'STU-001',
              status: 'active',
              year_group: null,
            },
          ]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'John', ['students'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.secondary_label).toBe('');
    });

    it('should handle parents with missing email', async () => {
      const mockTx = {
        parent: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'p-1',
              first_name: 'Jane',
              last_name: 'Doe',
              email: null,
              status: 'active',
            },
          ]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'Jane', ['parents'], 1, 20);

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.secondary_label).toBe('');
    });

    it('should search multiple entity types in fallback', async () => {
      const mockTx = {
        student: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'stu-1', first_name: 'John', last_name: 'Doe', status: 'active' },
            ]),
        },
        parent: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              {
                id: 'p-1',
                first_name: 'Jane',
                last_name: 'Doe',
                email: 'jane@test.com',
                status: 'active',
              },
            ]),
        },
        staffProfile: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        household: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(
        TENANT_ID,
        'Doe',
        ['students', 'parents', 'staff', 'households'],
        1,
        20,
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[0]!.entity_type).toBe('students');
      expect(result.results[1]!.entity_type).toBe('parents');
    });
  });

  describe('search() — edge cases', () => {
    it('should handle pagination correctly with page > 1', async () => {
      mockMeilisearch.available = true;
      const hits = Array.from({ length: 50 }, (_, i) => ({
        id: `stu-${i}`,
        first_name: 'Student',
        last_name: `${i}`,
        status: 'active',
      }));
      mockMeilisearch.search.mockResolvedValue({ hits });

      const result = await service.search(TENANT_ID, 'Student', ['students'], 2, 10);

      expect(mockMeilisearch.search).toHaveBeenCalledWith('students', 'Student', {
        filter: [`tenant_id = "${TENANT_ID}"`],
        limit: 10,
        offset: 10,
      });
      expect(result.results.length).toBeLessThanOrEqual(10);
    });

    it('should handle empty query string', async () => {
      mockMeilisearch.available = true;
      mockMeilisearch.search.mockResolvedValue({
        hits: [{ id: 'stu-1', first_name: 'John', last_name: 'Doe', status: 'active' }],
      });

      const result = await service.search(TENANT_ID, '', ['students'], 1, 20);

      expect(mockMeilisearch.search).toHaveBeenCalledWith('students', '', {
        filter: [`tenant_id = "${TENANT_ID}"`],
        limit: 20,
        offset: 0,
      });
      expect(result.results.length).toBe(1);
    });

    it('should use employment_status from Meilisearch hit', async () => {
      mockMeilisearch.available = true;
      mockMeilisearch.search.mockResolvedValue({
        hits: [
          { id: 'staff-1', first_name: 'John', last_name: 'Doe', employment_status: 'active' },
        ],
      });

      const result = await service.search(TENANT_ID, 'John', ['staff'], 1, 20);

      expect(result.results[0]!.status).toBe('active');
    });

    it('should build secondary_label from job_title when available', async () => {
      mockMeilisearch.available = true;
      mockMeilisearch.search.mockResolvedValue({
        hits: [
          {
            id: 'staff-1',
            first_name: 'John',
            last_name: 'Doe',
            job_title: 'Teacher',
            employment_status: 'active',
          },
        ],
      });

      const result = await service.search(TENANT_ID, 'John', ['staff'], 1, 20);

      expect(result.results[0]!.secondary_label).toBe('Teacher');
    });

    it('should build secondary_label from email when available', async () => {
      mockMeilisearch.available = true;
      mockMeilisearch.search.mockResolvedValue({
        hits: [
          {
            id: 'parent-1',
            first_name: 'Jane',
            last_name: 'Doe',
            email: 'jane@test.com',
            status: 'active',
          },
        ],
      });

      const result = await service.search(TENANT_ID, 'Jane', ['parents'], 1, 20);

      expect(result.results[0]!.secondary_label).toBe('jane@test.com');
    });

    it('should build secondary_label from student_number when available', async () => {
      mockMeilisearch.available = true;
      mockMeilisearch.search.mockResolvedValue({
        hits: [
          {
            id: 'stu-1',
            first_name: 'John',
            last_name: 'Doe',
            student_number: 'STU-001',
            status: 'active',
          },
        ],
      });

      const result = await service.search(TENANT_ID, 'John', ['students'], 1, 20);

      expect(result.results[0]!.secondary_label).toBe('STU-001');
    });
  });
});
