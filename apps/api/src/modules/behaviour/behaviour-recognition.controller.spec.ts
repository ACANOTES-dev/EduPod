/* eslint-disable @typescript-eslint/no-require-imports */
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

import { BehaviourAwardService } from './behaviour-award.service';
import { BehaviourHouseService } from './behaviour-house.service';
import { BehaviourPointsService } from './behaviour-points.service';
import { BehaviourRecognitionController } from './behaviour-recognition.controller';
import { BehaviourRecognitionService } from './behaviour-recognition.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HOUSE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const AWARD_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PUB_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ACADEMIC_YEAR_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const USER: JwtPayload = {
  sub: USER_ID,
  tenant_id: TENANT_ID,
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockRecognitionService = {
  getWall: jest.fn(),
  createPublicationApproval: jest.fn(),
  getPublicationDetail: jest.fn(),
  approvePublication: jest.fn(),
  rejectPublication: jest.fn(),
  getPublicFeed: jest.fn(),
};

const mockAwardService = {
  createManualAward: jest.fn(),
  listAwards: jest.fn(),
};

const mockHouseService = {
  getHouseDetail: jest.fn(),
  bulkAssign: jest.fn(),
};

const mockPointsService = {
  getLeaderboard: jest.fn(),
  getHouseStandings: jest.fn(),
};

const mockPrisma = {
  academicYear: {
    findFirst: jest.fn(),
  },
  tenantSetting: {
    findFirst: jest.fn(),
  },
};

describe('BehaviourRecognitionController', () => {
  let controller: BehaviourRecognitionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourRecognitionController],
      providers: [
        { provide: BehaviourRecognitionService, useValue: mockRecognitionService },
        { provide: BehaviourAwardService, useValue: mockAwardService },
        { provide: BehaviourHouseService, useValue: mockHouseService },
        { provide: BehaviourPointsService, useValue: mockPointsService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourRecognitionController>(BehaviourRecognitionController);

    // Default: active academic year exists
    mockPrisma.academicYear.findFirst.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
    // Default: behaviour settings
    mockPrisma.tenantSetting.findFirst.mockResolvedValue({
      settings: {
        behaviour: {
          recognition_wall_requires_consent: false,
          recognition_wall_admin_approval_required: false,
        },
      },
    });
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Recognition Wall ────────────────────────────────────────────────────

  it('should call recognitionService.getWall with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockRecognitionService.getWall.mockResolvedValue({ data: [] });

    const result = await controller.getWall(TENANT, query as never);

    expect(mockRecognitionService.getWall).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ data: [] });
  });

  // ─── Leaderboard ─────────────────────────────────────────────────────────

  it('should call pointsService.getLeaderboard with tenant_id and query', async () => {
    const query = { scope: 'all', limit: 10 };
    mockPointsService.getLeaderboard.mockResolvedValue({ students: [] });

    const result = await controller.getLeaderboard(TENANT, query as never);

    expect(mockPointsService.getLeaderboard).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ students: [] });
  });

  // ─── House Standings ─────────────────────────────────────────────────────

  it('should call pointsService.getHouseStandings with tenant_id and academic_year_id', async () => {
    mockPointsService.getHouseStandings.mockResolvedValue([{ house: 'Red', points: 500 }]);

    const result = await controller.getHouseStandings(TENANT);

    expect(mockPrisma.academicYear.findFirst).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, status: 'active' },
      select: { id: true },
    });
    expect(mockPointsService.getHouseStandings).toHaveBeenCalledWith(TENANT_ID, ACADEMIC_YEAR_ID);
    expect(result).toEqual([{ house: 'Red', points: 500 }]);
  });

  it('should throw BadRequestException when no active academic year for getHouseStandings', async () => {
    mockPrisma.academicYear.findFirst.mockResolvedValue(null);

    await expect(controller.getHouseStandings(TENANT)).rejects.toThrow(BadRequestException);
  });

  it('should call houseService.getHouseDetail with tenant_id, id, and academic_year_id', async () => {
    mockHouseService.getHouseDetail.mockResolvedValue({ id: HOUSE_ID, name: 'Red', members: [] });

    const result = await controller.getHouseDetail(TENANT, HOUSE_ID);

    expect(mockHouseService.getHouseDetail).toHaveBeenCalledWith(TENANT_ID, HOUSE_ID, ACADEMIC_YEAR_ID);
    expect(result).toEqual({ id: HOUSE_ID, name: 'Red', members: [] });
  });

  // ─── Awards ───────────────────────────────────────────────────────────────

  it('should call awardService.createManualAward with tenant_id, user_id, and dto', async () => {
    const dto = { student_id: 's1', award_type: 'star', reason: 'Excellence' };
    mockAwardService.createManualAward.mockResolvedValue({ id: AWARD_ID });

    const result = await controller.createManualAward(TENANT, USER, dto as never);

    expect(mockAwardService.createManualAward).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ id: AWARD_ID });
  });

  it('should call awardService.listAwards with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockAwardService.listAwards.mockResolvedValue({ data: [] });

    const result = await controller.listAwards(TENANT, query as never);

    expect(mockAwardService.listAwards).toHaveBeenCalledWith(TENANT_ID, query);
    expect(result).toEqual({ data: [] });
  });

  // ─── Publications ────────────────────────────────────────────────────────

  it('should call recognitionService.createPublicationApproval with prisma, tenant_id, and derived options', async () => {
    const dto = {
      publication_type: 'wall',
      entity_type: 'incident',
      entity_id: 'inc-1',
      student_id: 's1',
    };
    mockRecognitionService.createPublicationApproval.mockResolvedValue({ id: PUB_ID });

    const result = await controller.createPublication(TENANT, dto as never);

    expect(mockRecognitionService.createPublicationApproval).toHaveBeenCalledWith(
      mockPrisma,
      TENANT_ID,
      {
        publication_type: 'wall',
        entity_type: 'incident',
        entity_id: 'inc-1',
        student_id: 's1',
        requires_parent_consent: false,
        admin_approval_required: false,
      },
    );
    expect(result).toEqual({ id: PUB_ID });
  });

  it('should call recognitionService.getPublicationDetail with tenant_id and id', async () => {
    mockRecognitionService.getPublicationDetail.mockResolvedValue({ id: PUB_ID });

    const result = await controller.getPublicationDetail(TENANT, PUB_ID);

    expect(mockRecognitionService.getPublicationDetail).toHaveBeenCalledWith(TENANT_ID, PUB_ID);
    expect(result).toEqual({ id: PUB_ID });
  });

  it('should call recognitionService.approvePublication with tenant_id, id, and user_id', async () => {
    const dto = { approved: true };
    mockRecognitionService.approvePublication.mockResolvedValue({ id: PUB_ID, status: 'approved' });

    const result = await controller.approvePublication(TENANT, USER, PUB_ID, dto as never);

    expect(mockRecognitionService.approvePublication).toHaveBeenCalledWith(TENANT_ID, PUB_ID, USER_ID);
    expect(result).toEqual({ id: PUB_ID, status: 'approved' });
  });

  it('should call recognitionService.rejectPublication with tenant_id, id, and user_id', async () => {
    mockRecognitionService.rejectPublication.mockResolvedValue({ id: PUB_ID, status: 'rejected' });

    const result = await controller.rejectPublication(TENANT, USER, PUB_ID);

    expect(mockRecognitionService.rejectPublication).toHaveBeenCalledWith(TENANT_ID, PUB_ID, USER_ID);
    expect(result).toEqual({ id: PUB_ID, status: 'rejected' });
  });

  // ─── Public Feed ─────────────────────────────────────────────────────────

  it('should call recognitionService.getPublicFeed with tenant_id, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockRecognitionService.getPublicFeed.mockResolvedValue({ data: [] });

    const result = await controller.getPublicFeed(TENANT, query);

    expect(mockRecognitionService.getPublicFeed).toHaveBeenCalledWith(TENANT_ID, 1, 20);
    expect(result).toEqual({ data: [] });
  });

  // ─── Bulk House Assignment ───────────────────────────────────────────────

  it('should call houseService.bulkAssign with tenant_id, academic_year_id, and assignments', async () => {
    const dto = {
      academic_year_id: ACADEMIC_YEAR_ID,
      assignments: [{ student_id: 's1', house_id: HOUSE_ID }],
    };
    mockHouseService.bulkAssign.mockResolvedValue({ assigned: 1 });

    const result = await controller.bulkHouseAssign(TENANT, dto as never);

    expect(mockHouseService.bulkAssign).toHaveBeenCalledWith(
      TENANT_ID, ACADEMIC_YEAR_ID, [{ student_id: 's1', house_id: HOUSE_ID }],
    );
    expect(result).toEqual({ assigned: 1 });
  });
});
