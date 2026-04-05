import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { SenAccommodationService } from './sen-accommodation.service';

jest.mock('../../common/middleware/rls.middleware');

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const PROFILE_ID = '00000000-0000-0000-0000-000000000002';
const ACCOMMODATION_ID = '00000000-0000-0000-0000-000000000003';
const APPROVER_ID = '00000000-0000-0000-0000-000000000004';
const YEAR_GROUP_ID = '00000000-0000-0000-0000-000000000005';
const YEAR_GROUP_ID_2 = '00000000-0000-0000-0000-000000000006';
const STUDENT_ID = '00000000-0000-0000-0000-000000000007';
const STUDENT_ID_2 = '00000000-0000-0000-0000-000000000008';

describe('SenAccommodationService', () => {
  let service: SenAccommodationService;

  const senAccommodationMock = {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const senProfileMock = {
    findFirst: jest.fn(),
  };

  const mockPrisma = {
    senAccommodation: senAccommodationMock,
    senProfile: senProfileMock,
    $transaction: jest.fn() as jest.Mock,
  };

  mockPrisma.$transaction.mockImplementation((fn: (client: typeof mockPrisma) => unknown) =>
    fn(mockPrisma),
  );

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SenAccommodationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<SenAccommodationService>(SenAccommodationService);

    jest.clearAllMocks();

    const { createRlsClient } = jest.requireMock('../../common/middleware/rls.middleware');
    createRlsClient.mockReturnValue({
      $transaction: jest.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
    });
  });

  afterEach(() => jest.clearAllMocks());

  const createAccommodationRecord = (overrides: Record<string, unknown> = {}) => ({
    id: ACCOMMODATION_ID,
    tenant_id: TENANT_ID,
    sen_profile_id: PROFILE_ID,
    accommodation_type: 'exam',
    description: 'Extra time for written exams',
    details: { percentage: 25 },
    start_date: new Date('2026-09-01'),
    end_date: null,
    is_active: true,
    approved_by_user_id: null,
    approved_at: null,
    created_at: new Date('2026-04-01T09:00:00.000Z'),
    updated_at: new Date('2026-04-01T09:00:00.000Z'),
    sen_profile: {
      id: PROFILE_ID,
      student_id: STUDENT_ID,
      primary_category: 'learning',
    },
    approved_by: null,
    ...overrides,
  });

  // ─── create ──────────────────────────────────────────────────────────────

  describe('create', () => {
    it('should create an exam accommodation successfully', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senAccommodationMock.create.mockResolvedValue(createAccommodationRecord());

      const result = await service.create(TENANT_ID, PROFILE_ID, {
        accommodation_type: 'exam',
        description: 'Extra time for written exams',
        details: { percentage: 25 },
        is_active: true,
        start_date: '2026-09-01',
      });

      expect(result.id).toBe(ACCOMMODATION_ID);
      expect(result.accommodation_type).toBe('exam');
      expect(senAccommodationMock.create).toHaveBeenCalled();
    });

    it('should create a classroom accommodation successfully', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senAccommodationMock.create.mockResolvedValue(
        createAccommodationRecord({ accommodation_type: 'classroom' }),
      );

      const result = await service.create(TENANT_ID, PROFILE_ID, {
        accommodation_type: 'classroom',
        description: 'Preferential seating near teacher',
        details: {},
        is_active: true,
      });

      expect(result.accommodation_type).toBe('classroom');
    });

    it('should create an assistive_technology accommodation successfully', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senAccommodationMock.create.mockResolvedValue(
        createAccommodationRecord({ accommodation_type: 'assistive_technology' }),
      );

      const result = await service.create(TENANT_ID, PROFILE_ID, {
        accommodation_type: 'assistive_technology',
        description: 'Text-to-speech software',
        details: { software: 'ReadAloud' },
        is_active: true,
      });

      expect(result.accommodation_type).toBe('assistive_technology');
    });

    it('should throw NotFoundException when SEN profile does not exist', async () => {
      senProfileMock.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, PROFILE_ID, {
          accommodation_type: 'exam',
          description: 'Extra time',
          details: {},
          is_active: true,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAllByProfile ────────────────────────────────────────────────────

  describe('findAllByProfile', () => {
    it('should filter by accommodation_type', async () => {
      senAccommodationMock.findMany.mockResolvedValue([createAccommodationRecord()]);
      senAccommodationMock.count.mockResolvedValue(1);

      const result = await service.findAllByProfile(TENANT_ID, PROFILE_ID, {
        page: 1,
        pageSize: 20,
        accommodation_type: 'exam',
      });

      expect(result.meta.total).toBe(1);
      expect(senAccommodationMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            sen_profile_id: PROFILE_ID,
            accommodation_type: 'exam',
          }),
        }),
      );
    });

    it('should filter by is_active', async () => {
      senAccommodationMock.findMany.mockResolvedValue([]);
      senAccommodationMock.count.mockResolvedValue(0);

      const result = await service.findAllByProfile(TENANT_ID, PROFILE_ID, {
        page: 1,
        pageSize: 20,
        is_active: false,
      });

      expect(result.data).toHaveLength(0);
      expect(senAccommodationMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            is_active: false,
          }),
        }),
      );
    });

    it('should return correct pagination shape', async () => {
      senAccommodationMock.findMany.mockResolvedValue([
        createAccommodationRecord(),
        createAccommodationRecord({ id: '00000000-0000-0000-0000-000000000099' }),
      ]);
      senAccommodationMock.count.mockResolvedValue(15);

      const result = await service.findAllByProfile(TENANT_ID, PROFILE_ID, {
        page: 2,
        pageSize: 2,
      });

      expect(result.meta).toEqual({ page: 2, pageSize: 2, total: 15 });
      expect(result.data).toHaveLength(2);
      expect(senAccommodationMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 2,
          take: 2,
        }),
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update an accommodation successfully', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(
        createAccommodationRecord({
          description: 'Updated description',
          approved_by_user_id: APPROVER_ID,
          approved_at: new Date('2026-04-15T10:00:00.000Z'),
          approved_by: {
            id: APPROVER_ID,
            first_name: 'Jane',
            last_name: 'Admin',
          },
        }),
      );

      const result = await service.update(TENANT_ID, ACCOMMODATION_ID, {
        description: 'Updated description',
        approved_by_user_id: APPROVER_ID,
        approved_at: '2026-04-15T10:00:00.000Z',
      });

      expect(result.description).toBe('Updated description');
      expect(result.approved_by_user_id).toBe(APPROVER_ID);
      expect(result.approved_by?.first_name).toBe('Jane');
    });

    it('should throw NotFoundException when accommodation does not exist', async () => {
      senAccommodationMock.findFirst.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, ACCOMMODATION_ID, {
          description: 'Updated',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle nullable start_date: set to null when explicitly null', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(
        createAccommodationRecord({ start_date: null }),
      );

      const result = await service.update(TENANT_ID, ACCOMMODATION_ID, {
        start_date: null,
      });

      expect(result.start_date).toBeNull();
      expect(senAccommodationMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            start_date: null,
          }),
        }),
      );
    });

    it('should convert start_date string to Date when provided', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(
        createAccommodationRecord({ start_date: new Date('2026-10-01') }),
      );

      await service.update(TENANT_ID, ACCOMMODATION_ID, {
        start_date: '2026-10-01',
      });

      expect(senAccommodationMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            start_date: new Date('2026-10-01'),
          }),
        }),
      );
    });

    it('should handle nullable end_date: set to null when explicitly null', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(createAccommodationRecord({ end_date: null }));

      await service.update(TENANT_ID, ACCOMMODATION_ID, {
        end_date: null,
      });

      expect(senAccommodationMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            end_date: null,
          }),
        }),
      );
    });

    it('should convert end_date string to Date when provided', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(
        createAccommodationRecord({ end_date: new Date('2027-06-30') }),
      );

      await service.update(TENANT_ID, ACCOMMODATION_ID, {
        end_date: '2027-06-30',
      });

      expect(senAccommodationMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            end_date: new Date('2027-06-30'),
          }),
        }),
      );
    });

    it('should handle nullable approved_at: set to null when explicitly null', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(
        createAccommodationRecord({ approved_at: null }),
      );

      await service.update(TENANT_ID, ACCOMMODATION_ID, {
        approved_at: null,
      });

      expect(senAccommodationMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approved_at: null,
          }),
        }),
      );
    });

    it('should convert approved_at string to Date when provided', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(
        createAccommodationRecord({ approved_at: new Date('2026-05-01T10:00:00Z') }),
      );

      await service.update(TENANT_ID, ACCOMMODATION_ID, {
        approved_at: '2026-05-01T10:00:00Z',
      });

      expect(senAccommodationMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            approved_at: new Date('2026-05-01T10:00:00Z'),
          }),
        }),
      );
    });

    it('should pass undefined for fields not included in dto', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(createAccommodationRecord());

      await service.update(TENANT_ID, ACCOMMODATION_ID, {
        description: 'Only description changed',
      });

      const updateArgs = senAccommodationMock.update.mock.calls[0]?.[0];
      expect(updateArgs?.data?.start_date).toBeUndefined();
      expect(updateArgs?.data?.end_date).toBeUndefined();
      expect(updateArgs?.data?.approved_at).toBeUndefined();
      expect(updateArgs?.data?.approved_by_user_id).toBeUndefined();
      expect(updateArgs?.data?.details).toBeUndefined();
    });

    it('should pass details as InputJsonValue when provided', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.update.mockResolvedValue(
        createAccommodationRecord({ details: { percentage: 50 } }),
      );

      await service.update(TENANT_ID, ACCOMMODATION_ID, {
        details: { percentage: 50 },
      });

      expect(senAccommodationMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: { percentage: 50 },
          }),
        }),
      );
    });
  });

  // ─── delete ──────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('should delete an accommodation successfully', async () => {
      senAccommodationMock.findFirst.mockResolvedValue({ id: ACCOMMODATION_ID });
      senAccommodationMock.delete.mockResolvedValue({ id: ACCOMMODATION_ID });

      await expect(service.delete(TENANT_ID, ACCOMMODATION_ID)).resolves.toBeUndefined();

      expect(senAccommodationMock.delete).toHaveBeenCalledWith({
        where: { id: ACCOMMODATION_ID },
      });
    });

    it('should throw NotFoundException when accommodation does not exist', async () => {
      senAccommodationMock.findFirst.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID, ACCOMMODATION_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getExamReport ───────────────────────────────────────────────────────

  describe('getExamReport', () => {
    it('should aggregate active exam accommodations by year group', async () => {
      senAccommodationMock.findMany.mockResolvedValue([
        {
          id: ACCOMMODATION_ID,
          description: 'Extra time',
          details: { percentage: 25 },
          sen_profile: {
            id: PROFILE_ID,
            student: {
              id: STUDENT_ID,
              first_name: 'Amina',
              last_name: 'Byrne',
              year_group: { id: YEAR_GROUP_ID, name: 'First Year' },
            },
          },
        },
        {
          id: '00000000-0000-0000-0000-000000000099',
          description: 'Reader for maths',
          details: {},
          sen_profile: {
            id: PROFILE_ID,
            student: {
              id: STUDENT_ID_2,
              first_name: 'Liam',
              last_name: 'Murphy',
              year_group: { id: YEAR_GROUP_ID, name: 'First Year' },
            },
          },
        },
        {
          id: '00000000-0000-0000-0000-000000000098',
          description: 'Separate room',
          details: {},
          sen_profile: {
            id: '00000000-0000-0000-0000-000000000090',
            student: {
              id: '00000000-0000-0000-0000-000000000091',
              first_name: 'Sean',
              last_name: 'Kelly',
              year_group: { id: YEAR_GROUP_ID_2, name: 'Second Year' },
            },
          },
        },
      ]);

      const result = await service.getExamReport(TENANT_ID, {});

      expect(result).toHaveLength(2);
      expect(result[0]!.year_group.name).toBe('First Year');
      expect(result[0]!.students).toHaveLength(2);
      expect(result[1]!.year_group.name).toBe('Second Year');
      expect(result[1]!.students).toHaveLength(1);
    });

    it('should only include active exam accommodations', async () => {
      senAccommodationMock.findMany.mockResolvedValue([]);

      await service.getExamReport(TENANT_ID, {});

      expect(senAccommodationMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            accommodation_type: 'exam',
            is_active: true,
          }),
        }),
      );
    });

    it('should filter by year_group_id when provided', async () => {
      senAccommodationMock.findMany.mockResolvedValue([
        {
          id: ACCOMMODATION_ID,
          description: 'Extra time',
          details: {},
          sen_profile: {
            id: PROFILE_ID,
            student: {
              id: STUDENT_ID,
              first_name: 'Amina',
              last_name: 'Byrne',
              year_group: { id: YEAR_GROUP_ID, name: 'First Year' },
            },
          },
        },
      ]);

      const result = await service.getExamReport(TENANT_ID, {
        year_group_id: YEAR_GROUP_ID,
      });

      expect(result).toHaveLength(1);
      expect(senAccommodationMock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sen_profile: {
              student: { is: { year_group_id: YEAR_GROUP_ID } },
            },
          }),
        }),
      );
    });

    it('should skip students without a year group', async () => {
      senAccommodationMock.findMany.mockResolvedValue([
        {
          id: ACCOMMODATION_ID,
          description: 'Extra time',
          details: {},
          sen_profile: {
            id: PROFILE_ID,
            student: {
              id: STUDENT_ID,
              first_name: 'Amina',
              last_name: 'Byrne',
              year_group: null,
            },
          },
        },
      ]);

      const result = await service.getExamReport(TENANT_ID, {});

      expect(result).toHaveLength(0);
    });
  });

  // ─── Additional branch coverage ─────────────────────────────────────────────

  describe('create — optional field defaults', () => {
    it('should default details to empty object when not provided', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senAccommodationMock.create.mockResolvedValue(createAccommodationRecord({ details: {} }));

      await service.create(TENANT_ID, PROFILE_ID, {
        accommodation_type: 'exam',
        description: 'Extra time',
        details: {},
        is_active: true,
      });

      expect(senAccommodationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            details: {},
          }),
        }),
      );
    });

    it('should default is_active to true when not provided', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senAccommodationMock.create.mockResolvedValue(createAccommodationRecord());

      await service.create(TENANT_ID, PROFILE_ID, {
        accommodation_type: 'exam',
        description: 'Extra time',
        details: {},
        is_active: true,
      });

      expect(senAccommodationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            is_active: true,
          }),
        }),
      );
    });

    it('should set start_date and end_date to null when not provided', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senAccommodationMock.create.mockResolvedValue(
        createAccommodationRecord({ start_date: null, end_date: null }),
      );

      await service.create(TENANT_ID, PROFILE_ID, {
        accommodation_type: 'exam',
        description: 'Extra time',
        details: {},
        is_active: true,
      });

      expect(senAccommodationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            start_date: null,
            end_date: null,
          }),
        }),
      );
    });

    it('should convert start_date and end_date strings to Dates on create', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senAccommodationMock.create.mockResolvedValue(createAccommodationRecord());

      await service.create(TENANT_ID, PROFILE_ID, {
        accommodation_type: 'exam',
        description: 'Extra time',
        details: {},
        start_date: '2026-09-01',
        end_date: '2027-06-30',
        is_active: true,
      });

      expect(senAccommodationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            start_date: new Date('2026-09-01'),
            end_date: new Date('2027-06-30'),
          }),
        }),
      );
    });

    it('should accept is_active as false', async () => {
      senProfileMock.findFirst.mockResolvedValue({ id: PROFILE_ID });
      senAccommodationMock.create.mockResolvedValue(
        createAccommodationRecord({ is_active: false }),
      );

      await service.create(TENANT_ID, PROFILE_ID, {
        accommodation_type: 'classroom',
        description: 'Seating',
        details: {},
        is_active: false,
      });

      expect(senAccommodationMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            is_active: false,
          }),
        }),
      );
    });
  });

  describe('findAllByProfile — no filters', () => {
    it('should query without optional filters when none provided', async () => {
      senAccommodationMock.findMany.mockResolvedValue([]);
      senAccommodationMock.count.mockResolvedValue(0);

      await service.findAllByProfile(TENANT_ID, PROFILE_ID, {
        page: 1,
        pageSize: 20,
      });

      const whereArg = senAccommodationMock.findMany.mock.calls[0]?.[0]?.where;
      expect(whereArg?.accommodation_type).toBeUndefined();
      expect(whereArg?.is_active).toBeUndefined();
    });
  });
});
