import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexService } from '../search/search-index.service';
import { SequenceService } from '../sequence/sequence.service';

import { ApplicationConversionService } from './application-conversion.service';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn((prisma: unknown) => ({
    $transaction: jest.fn((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  })),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const APP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const YEAR_GROUP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const PARENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const STUDENT_ID = '11111111-1111-1111-1111-111111111111';
const HOUSEHOLD_ID = '22222222-2222-2222-2222-222222222222';

function buildApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: APP_ID,
    tenant_id: TENANT_ID,
    student_first_name: 'John',
    student_last_name: 'Doe',
    date_of_birth: new Date('2018-05-15'),
    status: 'accepted',
    payload_json: { parent_email: 'parent@test.com' },
    submitted_by: {
      id: 'parent-user-1',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'parent@test.com',
      phone: '+1234567890',
    },
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('ApplicationConversionService', () => {
  let service: ApplicationConversionService;
  let mockPrisma: {
    application: { findFirst: jest.Mock };
    applicationNote: { findFirst: jest.Mock; create: jest.Mock };
    parent: { findFirst: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    yearGroup: { findFirst: jest.Mock; findMany: jest.Mock };
    household: { create: jest.Mock };
    householdParent: { create: jest.Mock };
    student: { create: jest.Mock };
    studentParent: { create: jest.Mock };
  };
  let mockSequenceService: { generateHouseholdReference: jest.Mock };
  let mockSearchIndexService: { indexEntity: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      application: { findFirst: jest.fn() },
      applicationNote: { findFirst: jest.fn(), create: jest.fn() },
      parent: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      yearGroup: { findFirst: jest.fn(), findMany: jest.fn() },
      household: { create: jest.fn() },
      householdParent: { create: jest.fn() },
      student: { create: jest.fn() },
      studentParent: { create: jest.fn() },
    };

    mockSequenceService = { generateHouseholdReference: jest.fn() };
    mockSearchIndexService = { indexEntity: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationConversionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SequenceService, useValue: mockSequenceService },
        { provide: SearchIndexService, useValue: mockSearchIndexService },
      ],
    }).compile();

    service = module.get<ApplicationConversionService>(ApplicationConversionService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getConversionPreview ───────────────────────────────────────────────────

  describe('ApplicationConversionService -- getConversionPreview', () => {
    it('should return preview with application data, matching parents, and year groups', async () => {
      const application = buildApplication();
      mockPrisma.application.findFirst.mockResolvedValue(application);
      mockPrisma.applicationNote.findFirst.mockResolvedValue(null);
      mockPrisma.parent.findMany.mockResolvedValue([
        {
          id: PARENT_ID,
          first_name: 'Jane',
          last_name: 'Doe',
          email: 'parent@test.com',
          phone: '+1234567890',
          user_id: 'parent-user-1',
        },
      ]);
      mockPrisma.yearGroup.findMany.mockResolvedValue([
        { id: YEAR_GROUP_ID, name: 'Year 1', display_order: 1 },
      ]);

      const result = await service.getConversionPreview(TENANT_ID, APP_ID);

      expect(result.application.id).toBe(APP_ID);
      expect(result.matching_parents).toHaveLength(1);
      expect(result.year_groups).toHaveLength(1);
      expect(result.submitted_by_parent).toBeDefined();
    });

    it('should throw NotFoundException when application does not exist', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.getConversionPreview(TENANT_ID, APP_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when application has already been converted', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(buildApplication());
      mockPrisma.applicationNote.findFirst.mockResolvedValue({ id: 'note-1' });

      await expect(service.getConversionPreview(TENANT_ID, APP_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when application is not in accepted status', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(buildApplication({ status: 'submitted' }));
      mockPrisma.applicationNote.findFirst.mockResolvedValue(null);

      await expect(service.getConversionPreview(TENANT_ID, APP_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return empty matching_parents when no parent_email is available', async () => {
      const application = buildApplication({
        payload_json: {},
        submitted_by: null,
      });
      mockPrisma.application.findFirst.mockResolvedValue(application);
      mockPrisma.applicationNote.findFirst.mockResolvedValue(null);
      mockPrisma.yearGroup.findMany.mockResolvedValue([]);

      const result = await service.getConversionPreview(TENANT_ID, APP_ID);

      expect(result.matching_parents).toEqual([]);
      expect(mockPrisma.parent.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── convert ────────────────────────────────────────────────────────────────

  describe('ApplicationConversionService -- convert', () => {
    const baseDto = {
      year_group_id: YEAR_GROUP_ID,
      student_first_name: 'John',
      student_last_name: 'Doe',
      date_of_birth: '2018-05-15',
      expected_updated_at: '2026-01-01T00:00:00.000Z',
      parent1_first_name: 'Jane',
      parent1_last_name: 'Doe',
      parent1_email: 'parent@test.com',
    };

    function setupHappyPathMocks() {
      mockPrisma.application.findFirst.mockResolvedValue(buildApplication());
      mockPrisma.applicationNote.findFirst.mockResolvedValue(null);
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID, name: 'Year 1' });
      mockPrisma.parent.create.mockResolvedValue({ id: PARENT_ID });
      mockSequenceService.generateHouseholdReference.mockResolvedValue('HH-202601-000001');
      mockPrisma.household.create.mockResolvedValue({
        id: HOUSEHOLD_ID,
        household_name: 'Doe Family',
      });
      mockPrisma.householdParent.create.mockResolvedValue({});
      mockPrisma.student.create.mockResolvedValue({
        id: STUDENT_ID,
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        student_number: 'STU-001',
        status: 'active',
      });
      mockPrisma.studentParent.create.mockResolvedValue({});
      mockPrisma.applicationNote.create.mockResolvedValue({});
      mockSearchIndexService.indexEntity.mockResolvedValue(undefined);
    }

    it('should create student, household, parent, and link them together', async () => {
      setupHappyPathMocks();

      const result = await service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID);

      expect(result.application_id).toBe(APP_ID);
      expect(result.student.id).toBe(STUDENT_ID);
      expect(result.household.id).toBe(HOUSEHOLD_ID);
      expect(result.parent1_id).toBe(PARENT_ID);
      expect(result.parent2_id).toBeNull();
      expect(mockPrisma.student.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.household.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.applicationNote.create).toHaveBeenCalledTimes(1);
    });

    it('should link to an existing parent when parent1_link_existing_id is provided', async () => {
      setupHappyPathMocks();
      mockPrisma.parent.findFirst.mockResolvedValue({ id: PARENT_ID });

      const dto = {
        ...baseDto,
        parent1_link_existing_id: PARENT_ID,
      };

      const result = await service.convert(TENANT_ID, APP_ID, dto as never, USER_ID);

      expect(result.parent1_id).toBe(PARENT_ID);
      expect(mockPrisma.parent.findFirst).toHaveBeenCalled();
    });

    it('should create parent2 when parent2 name fields are provided', async () => {
      setupHappyPathMocks();
      const parent2Id = '33333333-3333-3333-3333-333333333333';
      // first call for parent1, second call for parent2
      mockPrisma.parent.create
        .mockResolvedValueOnce({ id: PARENT_ID })
        .mockResolvedValueOnce({ id: parent2Id });

      const dto = {
        ...baseDto,
        parent2_first_name: 'Bob',
        parent2_last_name: 'Doe',
        parent2_email: 'bob@test.com',
      };

      const result = await service.convert(TENANT_ID, APP_ID, dto as never, USER_ID);

      expect(result.parent2_id).toBe(parent2Id);
      expect(mockPrisma.parent.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.householdParent.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.studentParent.create).toHaveBeenCalledTimes(2);
    });

    it('should throw NotFoundException when application does not exist', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(null);

      await expect(service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when application is not in accepted status', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(buildApplication({ status: 'draft' }));
      mockPrisma.applicationNote.findFirst.mockResolvedValue(null);

      await expect(service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when application has already been converted', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(buildApplication());
      mockPrisma.applicationNote.findFirst.mockResolvedValue({ id: 'note-1' });

      await expect(service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for concurrent modification (stale updated_at)', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(
        buildApplication({ updated_at: new Date('2026-02-01T00:00:00.000Z') }),
      );
      mockPrisma.applicationNote.findFirst.mockResolvedValue(null);

      await expect(service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException when year group does not exist', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(buildApplication());
      mockPrisma.applicationNote.findFirst.mockResolvedValue(null);
      mockPrisma.yearGroup.findFirst.mockResolvedValue(null);

      await expect(service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when linked parent1 does not exist', async () => {
      mockPrisma.application.findFirst.mockResolvedValue(buildApplication());
      mockPrisma.applicationNote.findFirst.mockResolvedValue(null);
      mockPrisma.yearGroup.findFirst.mockResolvedValue({ id: YEAR_GROUP_ID });
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      const dto = {
        ...baseDto,
        parent1_link_existing_id: 'nonexistent-parent',
      };

      await expect(service.convert(TENANT_ID, APP_ID, dto as never, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should enqueue search indexing after successful conversion', async () => {
      setupHappyPathMocks();

      await service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID);

      expect(mockSearchIndexService.indexEntity).toHaveBeenCalledWith('students', {
        id: STUDENT_ID,
        tenant_id: TENANT_ID,
        first_name: 'John',
        last_name: 'Doe',
        full_name: 'John Doe',
        student_number: 'STU-001',
        status: 'active',
      });
    });

    it('should not throw when search indexing fails (graceful degradation)', async () => {
      setupHappyPathMocks();
      mockSearchIndexService.indexEntity.mockRejectedValue(new Error('Search unavailable'));

      const result = await service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID);

      expect(result.student.id).toBe(STUDENT_ID);
    });

    it('should wrap P2002 unique constraint error as ALREADY_CONVERTED when conversion note exists', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      // Make the RLS mock throw the P2002 error
      const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware') as {
        createRlsClient: jest.Mock;
      };
      createRlsClient.mockReturnValueOnce({
        $transaction: jest.fn().mockRejectedValue(p2002Error),
      });

      // After the error, service checks for existing conversion note
      mockPrisma.applicationNote.findFirst.mockResolvedValue({ id: 'existing-note' });

      await expect(service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should use household_name from dto when provided', async () => {
      setupHappyPathMocks();

      const dto = { ...baseDto, household_name: 'Custom Household' };

      await service.convert(TENANT_ID, APP_ID, dto as never, USER_ID);

      expect(mockPrisma.household.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            household_name: 'Custom Household',
          }),
        }),
      );
    });

    it('should default household_name to "{last_name} Family" when not provided', async () => {
      setupHappyPathMocks();

      await service.convert(TENANT_ID, APP_ID, baseDto as never, USER_ID);

      expect(mockPrisma.household.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            household_name: 'Doe Family',
          }),
        }),
      );
    });
  });
});
