import { Test, TestingModule } from '@nestjs/testing';

import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { BoardReportService } from '../services/board-report.service';

import { BoardReportController } from './board-report.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const MOCK_REPORT = {
  workload_distribution: { average_periods: 20, range: { min: 14, max: 26 }, over_allocated_count: 3 },
  cover_fairness: { gini_coefficient: 0.18, distribution_shape: 'Normal distribution', assessment: 'Moderate concentration' },
  timetable_quality: { average_score: 72, label: 'Moderate' as const },
  substitution_pressure: { composite_score: 0.35, assessment: 'Moderate', trend_direction: 'stable' as const },
  absence_pattern: { current_term_rate: 0.04, previous_term_rate: 0.05, highest_day: 'Monday' },
  correlation_insight: { status: 'accumulating' as const, summary: 'Collecting data (4 of 12 months).' },
  generated_at: '2026-03-27T10:00:00.000Z',
  term_name: 'Term 2',
  academic_year_name: '2025-2026',
};

describe('BoardReportController', () => {
  let controller: BoardReportController;
  let mockService: { generateTermlySummary: jest.Mock };

  beforeEach(async () => {
    mockService = {
      generateTermlySummary: jest.fn().mockResolvedValue(MOCK_REPORT),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BoardReportController],
      providers: [{ provide: BoardReportService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BoardReportController>(BoardReportController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call service with correct tenant_id', async () => {
    const tenant = { tenant_id: TENANT_ID };

    await controller.getTermlySummary(tenant);

    expect(mockService.generateTermlySummary).toHaveBeenCalledWith(TENANT_ID);
  });

  it('should return the service result', async () => {
    const tenant = { tenant_id: TENANT_ID };

    const result = await controller.getTermlySummary(tenant);

    expect(result).toEqual(MOCK_REPORT);
  });
});
