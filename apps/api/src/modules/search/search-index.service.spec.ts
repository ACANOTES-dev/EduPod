import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { MeilisearchClient } from './meilisearch.client';
import { SearchIndexService } from './search-index.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ENTITY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('SearchIndexService', () => {
  let service: SearchIndexService;
  let mockMeilisearch: {
    addDocuments: jest.Mock;
    deleteDocument: jest.Mock;
  };
  let mockPrisma: {
    searchIndexStatus: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
    student: { findUnique: jest.Mock };
    parent: { findUnique: jest.Mock };
    staffProfile: { findUnique: jest.Mock };
    household: { findUnique: jest.Mock };
    application: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    mockMeilisearch = {
      addDocuments: jest.fn().mockResolvedValue(undefined),
      deleteDocument: jest.fn().mockResolvedValue(undefined),
    };
    mockPrisma = {
      searchIndexStatus: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: { findUnique: jest.fn() },
      parent: { findUnique: jest.fn() },
      staffProfile: { findUnique: jest.fn() },
      household: { findUnique: jest.fn() },
      application: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchIndexService,
        { provide: MeilisearchClient, useValue: mockMeilisearch },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SearchIndexService>(SearchIndexService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('indexEntity()', () => {
    it('should add document to Meilisearch and update status to indexed', async () => {
      const entity = { id: ENTITY_ID, tenant_id: TENANT_ID, first_name: 'John', last_name: 'Doe', full_name: 'John Doe', student_number: 'STU-001', status: 'active' };

      await service.indexEntity('students', entity);

      expect(mockMeilisearch.addDocuments).toHaveBeenCalledWith('students', [
        {
          id: ENTITY_ID,
          tenant_id: TENANT_ID,
          first_name: 'John',
          last_name: 'Doe',
          full_name: 'John Doe',
          student_number: 'STU-001',
          status: 'active',
        },
      ]);
      expect(mockPrisma.searchIndexStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { index_status: 'indexed' },
        }),
      );
    });

    it('should record search_failed status when Meilisearch addDocuments fails', async () => {
      mockMeilisearch.addDocuments.mockRejectedValue(new Error('Connection refused'));
      const entity = { id: ENTITY_ID, tenant_id: TENANT_ID };

      await expect(service.indexEntity('students', entity)).rejects.toThrow('Connection refused');

      expect(mockPrisma.searchIndexStatus.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { index_status: 'search_failed' },
        }),
      );
    });

    it('should format parent documents correctly', async () => {
      const entity = {
        id: ENTITY_ID,
        tenant_id: TENANT_ID,
        first_name: 'Jane',
        last_name: 'Smith',
        email: 'jane@example.com',
        phone: '+353123456',
        status: 'active',
      };

      await service.indexEntity('parents', entity);

      expect(mockMeilisearch.addDocuments).toHaveBeenCalledWith('parents', [
        {
          id: ENTITY_ID,
          tenant_id: TENANT_ID,
          first_name: 'Jane',
          last_name: 'Smith',
          email: 'jane@example.com',
          phone: '+353123456',
          status: 'active',
        },
      ]);
    });

    it('should format staff documents with user relation', async () => {
      const entity = {
        id: ENTITY_ID,
        tenant_id: TENANT_ID,
        user: { first_name: 'Alice', last_name: 'Johnson' },
        job_title: 'Teacher',
        department: 'Science',
        employment_status: 'active',
      };

      await service.indexEntity('staff', entity);

      expect(mockMeilisearch.addDocuments).toHaveBeenCalledWith('staff', [
        {
          id: ENTITY_ID,
          tenant_id: TENANT_ID,
          first_name: 'Alice',
          last_name: 'Johnson',
          job_title: 'Teacher',
          department: 'Science',
          employment_status: 'active',
        },
      ]);
    });

    it('should format household documents correctly', async () => {
      const entity = { id: ENTITY_ID, tenant_id: TENANT_ID, household_name: 'Smith Family', status: 'active' };

      await service.indexEntity('households', entity);

      expect(mockMeilisearch.addDocuments).toHaveBeenCalledWith('households', [
        {
          id: ENTITY_ID,
          tenant_id: TENANT_ID,
          household_name: 'Smith Family',
          status: 'active',
        },
      ]);
    });

    it('should not throw when upsert after successful indexing fails', async () => {
      mockPrisma.searchIndexStatus.upsert.mockRejectedValue(new Error('DB error'));
      const entity = { id: ENTITY_ID, tenant_id: TENANT_ID };

      // Should not throw — upsert failure after successful indexing is non-blocking
      await expect(service.indexEntity('students', entity)).resolves.toBeUndefined();
    });
  });

  describe('removeEntity()', () => {
    it('should delete document from Meilisearch and clean up status', async () => {
      await service.removeEntity('students', ENTITY_ID);

      expect(mockMeilisearch.deleteDocument).toHaveBeenCalledWith('students', ENTITY_ID);
      expect(mockPrisma.searchIndexStatus.deleteMany).toHaveBeenCalledWith({
        where: { entity_type: 'students', entity_id: ENTITY_ID },
      });
    });

    it('should not throw when status cleanup fails', async () => {
      mockPrisma.searchIndexStatus.deleteMany.mockRejectedValue(new Error('DB error'));

      // Non-blocking — should not throw
      await expect(service.removeEntity('students', ENTITY_ID)).resolves.toBeUndefined();
    });
  });

  describe('reconcile()', () => {
    it('should return zero counts when no pending records exist', async () => {
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue([]);

      const result = await service.reconcile(TENANT_ID);

      expect(result).toEqual({ reindexed: 0, failed: 0 });
    });

    it('should reindex pending records and return counts', async () => {
      const pendingRecord = {
        id: 'status-1',
        tenant_id: TENANT_ID,
        entity_type: 'students',
        entity_id: ENTITY_ID,
        index_status: 'pending',
      };
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue([pendingRecord]);
      mockPrisma.student.findUnique.mockResolvedValue({
        id: ENTITY_ID,
        tenant_id: TENANT_ID,
        first_name: 'John',
        last_name: 'Doe',
      });

      const result = await service.reconcile(TENANT_ID);

      expect(result.reindexed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should count as failed when entity no longer exists', async () => {
      const pendingRecord = {
        id: 'status-1',
        tenant_id: TENANT_ID,
        entity_type: 'students',
        entity_id: ENTITY_ID,
        index_status: 'search_failed',
      };
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue([pendingRecord]);
      mockPrisma.student.findUnique.mockResolvedValue(null);

      const result = await service.reconcile(TENANT_ID);

      expect(result.reindexed).toBe(0);
      expect(result.failed).toBe(1);
      expect(mockPrisma.searchIndexStatus.deleteMany).toHaveBeenCalled();
    });

    it('should count as failed when indexEntity throws', async () => {
      const pendingRecord = {
        id: 'status-2',
        tenant_id: TENANT_ID,
        entity_type: 'parents',
        entity_id: 'p-1',
        index_status: 'pending',
      };
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue([pendingRecord]);
      mockPrisma.parent.findUnique.mockResolvedValue({ id: 'p-1', tenant_id: TENANT_ID });
      mockMeilisearch.addDocuments.mockRejectedValue(new Error('Meilisearch down'));

      const result = await service.reconcile(TENANT_ID);

      expect(result.reindexed).toBe(0);
      expect(result.failed).toBe(1);
    });

    it('should return null for unknown entity types in fetchEntity', async () => {
      const pendingRecord = {
        id: 'status-3',
        tenant_id: TENANT_ID,
        entity_type: 'unknown_type',
        entity_id: 'x-1',
        index_status: 'pending',
      };
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue([pendingRecord]);

      const result = await service.reconcile(TENANT_ID);

      // fetchEntity returns null for unknown type, so it counts as failed
      expect(result.reindexed).toBe(0);
      expect(result.failed).toBe(1);
    });
  });
});
