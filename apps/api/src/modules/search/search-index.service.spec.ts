import { Test, TestingModule } from '@nestjs/testing';

import {
  AdmissionsReadFacade,
  HouseholdReadFacade,
  MOCK_FACADE_PROVIDERS,
  ParentReadFacade,
  StaffProfileReadFacade,
  StudentReadFacade,
} from '../../common/tests/mock-facades';
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
  const mockStudentReadFacade = {
    findById: jest.fn().mockResolvedValue(null),
  };
  const mockParentReadFacade = {
    findById: jest.fn().mockResolvedValue(null),
  };
  const mockStaffProfileReadFacade = {
    findById: jest.fn().mockResolvedValue(null),
  };
  const mockHouseholdReadFacade = {
    findById: jest.fn().mockResolvedValue(null),
  };
  const mockAdmissionsReadFacade = {
    findById: jest.fn().mockResolvedValue(null),
  };
  let mockPrisma: {
    searchIndexStatus: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
      findMany: jest.Mock;
    };
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StudentReadFacade, useValue: mockStudentReadFacade },
        { provide: ParentReadFacade, useValue: mockParentReadFacade },
        { provide: StaffProfileReadFacade, useValue: mockStaffProfileReadFacade },
        { provide: HouseholdReadFacade, useValue: mockHouseholdReadFacade },
        { provide: AdmissionsReadFacade, useValue: mockAdmissionsReadFacade },
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
      const entity = {
        id: ENTITY_ID,
        tenant_id: TENANT_ID,
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        student_number: 'STU-001',
        status: 'active',
      };

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
      const entity = {
        id: ENTITY_ID,
        tenant_id: TENANT_ID,
        household_name: 'Smith Family',
        status: 'active',
      };

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

    it('should not throw when upsert in the failure path also fails', async () => {
      // First call (addDocuments) rejects
      mockMeilisearch.addDocuments.mockRejectedValue(new Error('Meili down'));
      // Second call (upsert for search_failed status) also rejects
      mockPrisma.searchIndexStatus.upsert.mockRejectedValue(new Error('DB also down'));

      const entity = { id: ENTITY_ID, tenant_id: TENANT_ID };

      // Should still throw the original Meilisearch error
      await expect(service.indexEntity('students', entity)).rejects.toThrow('Meili down');
    });

    it('should format application documents correctly', async () => {
      const entity = {
        id: ENTITY_ID,
        tenant_id: TENANT_ID,
        student_first_name: 'Ali',
        student_last_name: 'Hassan',
        application_number: 'APP-001',
        status: 'submitted',
      };

      await service.indexEntity('applications', entity);

      expect(mockMeilisearch.addDocuments).toHaveBeenCalledWith('applications', [
        {
          id: ENTITY_ID,
          tenant_id: TENANT_ID,
          student_first_name: 'Ali',
          student_last_name: 'Hassan',
          application_number: 'APP-001',
          status: 'submitted',
        },
      ]);
    });

    it('should format unknown entity type with only base fields', async () => {
      const entity = {
        id: ENTITY_ID,
        tenant_id: TENANT_ID,
        custom_field: 'value',
      };

      await service.indexEntity('unknown_type', entity);

      expect(mockMeilisearch.addDocuments).toHaveBeenCalledWith('unknown_type', [
        { id: ENTITY_ID, tenant_id: TENANT_ID },
      ]);
    });

    it('should format staff documents with undefined user', async () => {
      const entity = {
        id: ENTITY_ID,
        tenant_id: TENANT_ID,
        job_title: 'Janitor',
        department: 'Facilities',
        employment_status: 'active',
      };

      await service.indexEntity('staff', entity);

      expect(mockMeilisearch.addDocuments).toHaveBeenCalledWith('staff', [
        {
          id: ENTITY_ID,
          tenant_id: TENANT_ID,
          first_name: undefined,
          last_name: undefined,
          job_title: 'Janitor',
          department: 'Facilities',
          employment_status: 'active',
        },
      ]);
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
      mockStudentReadFacade.findById.mockResolvedValue({
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
      mockStudentReadFacade.findById.mockResolvedValue(null);

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
      mockParentReadFacade.findById.mockResolvedValue({ id: 'p-1', tenant_id: TENANT_ID });
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

    it('should reindex staff entities via staffProfileReadFacade', async () => {
      const pendingRecord = {
        id: 'status-staff',
        tenant_id: TENANT_ID,
        entity_type: 'staff',
        entity_id: 'staff-1',
        index_status: 'pending',
      };
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue([pendingRecord]);
      mockStaffProfileReadFacade.findById.mockResolvedValue({
        id: 'staff-1',
        tenant_id: TENANT_ID,
        user: { first_name: 'A', last_name: 'B' },
        job_title: 'T',
        department: 'D',
        employment_status: 'active',
      });

      const result = await service.reconcile(TENANT_ID);

      expect(mockStaffProfileReadFacade.findById).toHaveBeenCalledWith(TENANT_ID, 'staff-1');
      expect(result.reindexed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should reindex household entities via householdReadFacade', async () => {
      const pendingRecord = {
        id: 'status-hh',
        tenant_id: TENANT_ID,
        entity_type: 'households',
        entity_id: 'hh-1',
        index_status: 'pending',
      };
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue([pendingRecord]);
      mockHouseholdReadFacade.findById.mockResolvedValue({
        id: 'hh-1',
        tenant_id: TENANT_ID,
        household_name: 'Test Family',
        status: 'active',
      });

      const result = await service.reconcile(TENANT_ID);

      expect(mockHouseholdReadFacade.findById).toHaveBeenCalledWith(TENANT_ID, 'hh-1');
      expect(result.reindexed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should reindex application entities via admissionsReadFacade', async () => {
      const pendingRecord = {
        id: 'status-app',
        tenant_id: TENANT_ID,
        entity_type: 'applications',
        entity_id: 'app-1',
        index_status: 'pending',
      };
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue([pendingRecord]);
      mockAdmissionsReadFacade.findById.mockResolvedValue({
        id: 'app-1',
        tenant_id: TENANT_ID,
        student_first_name: 'Ali',
        student_last_name: 'Hassan',
        application_number: 'APP-001',
        status: 'submitted',
      });

      const result = await service.reconcile(TENANT_ID);

      expect(mockAdmissionsReadFacade.findById).toHaveBeenCalledWith(TENANT_ID, 'app-1');
      expect(result.reindexed).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should handle multiple pending records with mixed outcomes', async () => {
      const records = [
        {
          id: 's1',
          tenant_id: TENANT_ID,
          entity_type: 'students',
          entity_id: 'stu-1',
          index_status: 'pending',
        },
        {
          id: 's2',
          tenant_id: TENANT_ID,
          entity_type: 'parents',
          entity_id: 'p-1',
          index_status: 'search_failed',
        },
        {
          id: 's3',
          tenant_id: TENANT_ID,
          entity_type: 'unknown_type',
          entity_id: 'x-1',
          index_status: 'pending',
        },
      ];
      mockPrisma.searchIndexStatus.findMany.mockResolvedValue(records);
      mockStudentReadFacade.findById.mockResolvedValue({ id: 'stu-1', tenant_id: TENANT_ID });
      mockParentReadFacade.findById.mockResolvedValue(null); // entity no longer exists

      const result = await service.reconcile(TENANT_ID);

      expect(result.reindexed).toBe(1); // students reindexed
      expect(result.failed).toBe(2); // parents (entity gone) + unknown (null from fetchEntity)
    });
  });
});
