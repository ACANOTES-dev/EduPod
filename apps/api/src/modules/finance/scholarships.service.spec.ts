import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { ScholarshipsService } from './scholarships.service';

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const STUDENT_ID = 'student-uuid-1111';
const SCHOLARSHIP_ID = 'scholarship-uuid-1111';
const FEE_STRUCTURE_ID = 'fee-structure-uuid-1111';

const mockPrisma = {
  scholarship: {
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  student: {
    findFirst: jest.fn(),
  },
};

describe('ScholarshipsService', () => {
  let service: ScholarshipsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScholarshipsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ScholarshipsService>(ScholarshipsService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated scholarships', async () => {
      mockPrisma.scholarship.findMany.mockResolvedValue([{ id: SCHOLARSHIP_ID, value: '2000.00' }]);
      mockPrisma.scholarship.count.mockResolvedValue(1);

      const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.meta.total).toBe(1);
      expect(result.data[0]?.value).toBe(2000);
    });
  });

  describe('create', () => {
    it('should create a scholarship', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });
      mockPrisma.scholarship.create.mockResolvedValue({
        id: SCHOLARSHIP_ID,
        name: 'Excellence Bursary',
        discount_type: 'percent',
        value: '25.00',
        status: 'active',
      });

      const result = await service.create(TENANT_ID, USER_ID, {
        name: 'Excellence Bursary',
        discount_type: 'percent',
        value: 25,
        student_id: STUDENT_ID,
        award_date: '2026-01-01',
      });

      expect(result.value).toBe(25);
      expect(result.status).toBe('active');
    });

    it('should throw NotFoundException when student not found', async () => {
      mockPrisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, USER_ID, {
          name: 'Test',
          discount_type: 'fixed',
          value: 500,
          student_id: STUDENT_ID,
          award_date: '2026-01-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for percent value > 100', async () => {
      mockPrisma.student.findFirst.mockResolvedValue({ id: STUDENT_ID });

      await expect(
        service.create(TENANT_ID, USER_ID, {
          name: 'Invalid',
          discount_type: 'percent',
          value: 150,
          student_id: STUDENT_ID,
          award_date: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('revoke', () => {
    it('should revoke an active scholarship', async () => {
      mockPrisma.scholarship.findFirst.mockResolvedValue({
        id: SCHOLARSHIP_ID,
        status: 'active',
      });
      mockPrisma.scholarship.update.mockResolvedValue({
        id: SCHOLARSHIP_ID,
        status: 'revoked',
        value: '2000.00',
      });

      const result = await service.revoke(TENANT_ID, SCHOLARSHIP_ID, { reason: 'Student left' });
      expect(result.status).toBe('revoked');
    });

    it('should throw BadRequestException for non-active scholarship', async () => {
      mockPrisma.scholarship.findFirst.mockResolvedValue({ id: SCHOLARSHIP_ID, status: 'expired' });

      await expect(
        service.revoke(TENANT_ID, SCHOLARSHIP_ID, { reason: 'Test' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDiscountForStudent', () => {
    it('should compute fixed discount for matching fee structure', async () => {
      mockPrisma.scholarship.findMany.mockResolvedValue([
        { discount_type: 'fixed', value: '500.00', fee_structure_id: FEE_STRUCTURE_ID },
      ]);

      const discount = await service.getDiscountForStudent(
        TENANT_ID, STUDENT_ID, FEE_STRUCTURE_ID, 2000,
      );
      expect(discount).toBe(500);
    });

    it('should compute percent discount and cap at fee amount', async () => {
      mockPrisma.scholarship.findMany.mockResolvedValue([
        { discount_type: 'percent', value: '100.00', fee_structure_id: null },
      ]);

      const discount = await service.getDiscountForStudent(
        TENANT_ID, STUDENT_ID, FEE_STRUCTURE_ID, 1000,
      );
      expect(discount).toBe(1000); // capped at full amount
    });
  });

  describe('markExpired', () => {
    it('should return count of expired scholarships', async () => {
      mockPrisma.scholarship.updateMany.mockResolvedValue({ count: 3 });

      const count = await service.markExpired(TENANT_ID);
      expect(count).toBe(3);
    });
  });
});
