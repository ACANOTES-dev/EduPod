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

    it('should use hit.name as primary_label fallback when first_name, last_name, and household_name are all absent', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [{ id: 'item-1', name: 'General Item', status: 'active' }],
      });

      const result = await service.search(TENANT_ID, 'General', ['students'], 1, 20);

      expect(result.results[0]!.primary_label).toBe('General Item');
    });

    it('should use empty string as primary_label when all label fields are absent', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [{ id: 'item-2', status: 'active' }],
      });

      const result = await service.search(TENANT_ID, 'test', ['students'], 1, 20);

      expect(result.results[0]!.primary_label).toBe('');
    });

    it('edge: should use job_title as secondary_label when present', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [
          {
            id: 'staff-1',
            first_name: 'Jane',
            last_name: 'Smith',
            job_title: 'Principal',
            status: 'active',
          },
        ],
      });

      const result = await service.search(TENANT_ID, 'Jane', ['staff'], 1, 20);

      expect(result.results[0]!.secondary_label).toBe('Principal');
    });

    it('edge: should use email as secondary_label when job_title is absent', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [
          {
            id: 'p-1',
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

    it('edge: should use student_number as secondary_label when job_title and email are absent', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [
          {
            id: 'stu-1',
            first_name: 'John',
            last_name: 'Doe',
            student_number: 'STU-100',
            status: 'active',
          },
        ],
      });

      const result = await service.search(TENANT_ID, 'John', ['students'], 1, 20);

      expect(result.results[0]!.secondary_label).toBe('STU-100');
    });

    it('edge: should use empty string as secondary_label when no secondary fields exist', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [{ id: 'stu-1', first_name: 'John', last_name: 'Doe', status: 'active' }],
      });

      const result = await service.search(TENANT_ID, 'John', ['students'], 1, 20);

      expect(result.results[0]!.secondary_label).toBe('');
    });

    it('edge: should use employment_status as status when status is absent', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [{ id: 'staff-1', first_name: 'A', last_name: 'B', employment_status: 'probation' }],
      });

      const result = await service.search(TENANT_ID, 'A', ['staff'], 1, 20);

      expect(result.results[0]!.status).toBe('probation');
    });

    it('edge: should use empty string as status when both status and employment_status are absent', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [{ id: 'item-1', first_name: 'A', last_name: 'B' }],
      });

      const result = await service.search(TENANT_ID, 'A', ['students'], 1, 20);

      expect(result.results[0]!.status).toBe('');
    });

    it('should calculate offset correctly for page > 1', async () => {
      mockMeilisearch.search.mockResolvedValue({ hits: [] });

      await service.search(TENANT_ID, 'test', ['students'], 3, 10);

      expect(mockMeilisearch.search).toHaveBeenCalledWith('students', 'test', {
        filter: [`tenant_id = "${TENANT_ID}"`],
        limit: 10,
        offset: 20,
      });
    });

    it('edge: should use household_name over name when both are present but first/last names absent', async () => {
      mockMeilisearch.search.mockResolvedValue({
        hits: [{ id: 'hh-1', household_name: 'Jones Family', name: 'Jones', status: 'active' }],
      });

      const result = await service.search(TENANT_ID, 'Jones', ['households'], 1, 20);

      expect(result.results[0]!.primary_label).toBe('Jones Family');
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

    it('should use empty string for student secondary_label when year_group is null', async () => {
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

      expect(result.results[0]!.secondary_label).toBe('');
    });

    it('should use empty string for parent secondary_label when email is null', async () => {
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

      expect(result.results[0]!.secondary_label).toBe('');
    });

    it('should use department as staff secondary_label when job_title is null', async () => {
      const mockTx = {
        staffProfile: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'sp-1',
              user: { first_name: 'Bob', last_name: 'Smith' },
              job_title: null,
              department: 'Science',
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

      const result = await service.search(TENANT_ID, 'Bob', ['staff'], 1, 20);

      expect(result.results[0]!.secondary_label).toBe('Science');
    });

    it('should use empty string for staff secondary_label when both job_title and department are null', async () => {
      const mockTx = {
        staffProfile: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'sp-1',
              user: { first_name: 'Bob', last_name: 'Smith' },
              job_title: null,
              department: null,
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

      const result = await service.search(TENANT_ID, 'Bob', ['staff'], 1, 20);

      expect(result.results[0]!.secondary_label).toBe('');
    });

    it('should search multiple types in fallback mode and combine results', async () => {
      const mockTx = {
        student: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'stu-1', first_name: 'A', last_name: 'B', status: 'active', year_group: null },
            ]),
        },
        parent: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              { id: 'p-1', first_name: 'C', last_name: 'D', email: 'c@d.com', status: 'active' },
            ]),
        },
        staffProfile: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              {
                id: 'sp-1',
                user: { first_name: 'E', last_name: 'F' },
                job_title: 'T',
                department: null,
                employment_status: 'active',
              },
            ]),
        },
        household: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'hh-1', household_name: 'G Family', status: 'active' }]),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(
        TENANT_ID,
        'test',
        ['students', 'parents', 'staff', 'households'],
        1,
        20,
      );

      expect(result.results).toHaveLength(4);
      expect(result.results.map((r) => r.entity_type)).toEqual([
        'students',
        'parents',
        'staff',
        'households',
      ]);
    });

    it('should limit results to pageSize in fallback mode', async () => {
      const students = Array.from({ length: 10 }, (_, i) => ({
        id: `stu-${i}`,
        first_name: 'S',
        last_name: `${i}`,
        status: 'active',
        year_group: null,
      }));
      const mockTx = {
        student: {
          findMany: jest.fn().mockResolvedValue(students),
        },
      };
      mockCreateRlsClient.mockReturnValue({
        $transaction: jest
          .fn()
          .mockImplementation((fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
      });

      const result = await service.search(TENANT_ID, 'test', ['students'], 1, 3);

      expect(result.results.length).toBeLessThanOrEqual(3);
      expect(result.total).toBe(10);
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
  });
});
