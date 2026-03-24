/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { PromotionCommitDto } from './dto/promotion-commit.dto';
import { PromotionController } from './promotion.controller';
import type { CommitCounts, PreviewResponse } from './promotion.service';
import { PromotionService } from './promotion.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const YEAR_GROUP_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const NEXT_YEAR_GROUP_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const tenantContext = { tenant_id: TENANT_ID };

function buildMockService() {
  return {
    preview: jest.fn(),
    commit: jest.fn(),
  };
}

describe('PromotionController', () => {
  let controller: PromotionController;
  let service: ReturnType<typeof buildMockService>;

  beforeEach(async () => {
    service = buildMockService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PromotionController],
      providers: [{ provide: PromotionService, useValue: service }],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PromotionController>(PromotionController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('preview', () => {
    it('should call service.preview with tenant_id and academic_year_id', async () => {
      const previewResponse: PreviewResponse = {
        academic_year: { id: YEAR_ID, name: '2025–2026' },
        year_groups: [
          {
            year_group_id: YEAR_GROUP_ID,
            year_group_name: 'Year 1',
            next_year_group_id: NEXT_YEAR_GROUP_ID,
            next_year_group_name: 'Year 2',
            students: [
              {
                student_id: STUDENT_ID,
                student_name: 'Ali Hassan',
                current_status: 'active',
                proposed_action: 'promote',
                proposed_year_group_id: NEXT_YEAR_GROUP_ID,
                proposed_year_group_name: 'Year 2',
              },
            ],
          },
        ],
      };

      service.preview.mockResolvedValue(previewResponse);

      const result = await controller.preview(tenantContext, YEAR_ID);

      expect(result).toEqual(previewResponse);
      expect(service.preview).toHaveBeenCalledWith(TENANT_ID, YEAR_ID);
    });

    it('should return preview result from service', async () => {
      const previewResponse: PreviewResponse = {
        academic_year: { id: YEAR_ID, name: '2025–2026' },
        year_groups: [],
      };

      service.preview.mockResolvedValue(previewResponse);

      const result = await controller.preview(tenantContext, YEAR_ID);

      expect(result).toBe(previewResponse);
    });

    it('should pass academic_year_id correctly for a different year', async () => {
      const differentYearId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
      const previewResponse: PreviewResponse = {
        academic_year: { id: differentYearId, name: '2024–2025' },
        year_groups: [],
      };

      service.preview.mockResolvedValue(previewResponse);

      await controller.preview(tenantContext, differentYearId);

      expect(service.preview).toHaveBeenCalledWith(TENANT_ID, differentYearId);
      expect(service.preview).not.toHaveBeenCalledWith(TENANT_ID, YEAR_ID);
    });
  });

  describe('commit', () => {
    it('should call service.commit with tenant_id and dto', async () => {
      const dto: PromotionCommitDto = {
        academic_year_id: YEAR_ID,
        actions: [
          {
            student_id: STUDENT_ID,
            action: 'promote',
            target_year_group_id: NEXT_YEAR_GROUP_ID,
          },
        ],
      };
      const expected: CommitCounts = {
        promoted: 1,
        held_back: 0,
        graduated: 0,
        withdrawn: 0,
        skipped: 0,
      };

      service.commit.mockResolvedValue(expected);

      const result = await controller.commit(tenantContext, dto);

      expect(result).toEqual(expected);
      expect(service.commit).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('should return commit counts for graduate action', async () => {
      const dto: PromotionCommitDto = {
        academic_year_id: YEAR_ID,
        actions: [{ student_id: STUDENT_ID, action: 'graduate' }],
      };
      const expected: CommitCounts = {
        promoted: 0,
        held_back: 0,
        graduated: 1,
        withdrawn: 0,
        skipped: 0,
      };

      service.commit.mockResolvedValue(expected);

      const result = await controller.commit(tenantContext, dto);

      expect(result).toEqual(expected);
      expect(service.commit).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('should call service.commit with hold_back action', async () => {
      const dto: PromotionCommitDto = {
        academic_year_id: YEAR_ID,
        actions: [{ student_id: STUDENT_ID, action: 'hold_back' }],
      };
      const expected: CommitCounts = {
        promoted: 0,
        held_back: 1,
        graduated: 0,
        withdrawn: 0,
        skipped: 0,
      };

      service.commit.mockResolvedValue(expected);

      const result = await controller.commit(tenantContext, dto);

      expect(result).toEqual(expected);
      expect(service.commit).toHaveBeenCalledWith(TENANT_ID, dto);
    });
  });
});
