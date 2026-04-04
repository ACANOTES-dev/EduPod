import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StudentReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';
import { AgeGateService } from '../age-gate.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildMockPrisma() {
  return {
    student: { findFirst: jest.fn() },
  };
}

describe('AgeGateService', () => {
  let service: AgeGateService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockStudentFindById: jest.Mock;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockStudentFindById = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AgeGateService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StudentReadFacade, useValue: { findById: mockStudentFindById } },
      ],
    }).compile();

    service = module.get<AgeGateService>(AgeGateService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── isStudentAgeGated ────────────────────────────────────────────────────

  describe('isStudentAgeGated', () => {
    it('should return true for student born exactly 17 years ago', () => {
      const now = new Date();
      const dob = new Date(now.getFullYear() - 17, now.getMonth(), now.getDate());
      expect(service.isStudentAgeGated({ date_of_birth: dob })).toBe(true);
    });

    it('should return false for student born 16 years 11 months ago', () => {
      const now = new Date();
      // 16 years and ~11 months ago: subtract 17 years then add 1 month
      const dob = new Date(now.getFullYear() - 17, now.getMonth() + 1, now.getDate());
      expect(service.isStudentAgeGated({ date_of_birth: dob })).toBe(false);
    });

    it('should return true for student born 18 years ago', () => {
      const now = new Date();
      const dob = new Date(now.getFullYear() - 18, now.getMonth(), now.getDate());
      expect(service.isStudentAgeGated({ date_of_birth: dob })).toBe(true);
    });

    it('should return false for student born today', () => {
      const dob = new Date();
      expect(service.isStudentAgeGated({ date_of_birth: dob })).toBe(false);
    });
  });

  // ─── checkStudentAgeGated ─────────────────────────────────────────────────

  describe('checkStudentAgeGated', () => {
    it('should return true for a 17+ year-old student', async () => {
      const now = new Date();
      const dob = new Date(now.getFullYear() - 17, now.getMonth(), now.getDate());
      mockStudentFindById.mockResolvedValue({ date_of_birth: dob });

      const result = await service.checkStudentAgeGated(TENANT_ID, STUDENT_ID);

      expect(result).toBe(true);
      expect(mockStudentFindById).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    });

    it('should return false when student is not found', async () => {
      mockStudentFindById.mockResolvedValue(null);

      const result = await service.checkStudentAgeGated(TENANT_ID, STUDENT_ID);

      expect(result).toBe(false);
    });

    it('should return false for a 5-year-old student', async () => {
      const now = new Date();
      const dob = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
      mockStudentFindById.mockResolvedValue({ date_of_birth: dob });

      const result = await service.checkStudentAgeGated(TENANT_ID, STUDENT_ID);

      expect(result).toBe(false);
    });

    it('should scope the student lookup to the tenant', async () => {
      mockStudentFindById.mockResolvedValue(null);

      await service.checkStudentAgeGated(TENANT_ID, STUDENT_ID);

      expect(mockStudentFindById).toHaveBeenCalledWith(TENANT_ID, STUDENT_ID);
    });
  });

  // ─── isStudentAgeGated — boundary cases ──────────────────────────────────

  describe('isStudentAgeGated — boundary cases', () => {
    it('edge: should return false for student born 16 years and 364 days ago', () => {
      const now = new Date();
      const dob = new Date(now.getFullYear() - 17, now.getMonth(), now.getDate() + 1);
      expect(service.isStudentAgeGated({ date_of_birth: dob })).toBe(false);
    });

    it('edge: should return true for student born 17 years and 1 day ago', () => {
      const now = new Date();
      const dob = new Date(now.getFullYear() - 17, now.getMonth(), now.getDate() - 1);
      expect(service.isStudentAgeGated({ date_of_birth: dob })).toBe(true);
    });

    it('should return false for student born 10 years ago', () => {
      const now = new Date();
      const dob = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
      expect(service.isStudentAgeGated({ date_of_birth: dob })).toBe(false);
    });
  });
});
