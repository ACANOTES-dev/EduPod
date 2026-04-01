import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';

import type { TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { HouseholdStatementsController } from './household-statements.controller';
import { HouseholdStatementsService } from './household-statements.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockService = {
  getStatement: jest.fn(),
  renderPdf: jest.fn(),
};

describe('HouseholdStatementsController', () => {
  let controller: HouseholdStatementsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HouseholdStatementsController],
      providers: [{ provide: HouseholdStatementsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<HouseholdStatementsController>(HouseholdStatementsController);
    jest.clearAllMocks();
  });

  it('should call service.getStatement with tenant, householdId and query', async () => {
    const query = { date_from: '2025-01-01', date_to: '2025-12-31' };
    mockService.getStatement.mockResolvedValue({ items: [] });
    await controller.getStatement(TENANT, 'hh-1', query);
    expect(mockService.getStatement).toHaveBeenCalledWith('tenant-uuid', 'hh-1', query);
  });

  it('should render statement PDF and send response', async () => {
    const pdfBuffer = Buffer.from('pdf-content');
    mockService.renderPdf.mockResolvedValue(pdfBuffer);

    const mockRes = { set: jest.fn(), end: jest.fn() };
    const query = { locale: 'en' as const, date_from: '2025-01-01', date_to: '2025-12-31' };

    await controller.getStatementPdf(TENANT, 'hh-1', query, mockRes as never);

    expect(mockService.renderPdf).toHaveBeenCalledWith('tenant-uuid', 'hh-1', 'en', {
      date_from: '2025-01-01',
      date_to: '2025-12-31',
    });
    expect(mockRes.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    );
    expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
  });

  it('should default locale to en when not specified', async () => {
    const pdfBuffer = Buffer.from('pdf-content');
    mockService.renderPdf.mockResolvedValue(pdfBuffer);

    const mockRes = { set: jest.fn(), end: jest.fn() };
    const query = { date_from: '2025-01-01', date_to: '2025-12-31' };

    await controller.getStatementPdf(TENANT, 'hh-1', query, mockRes as never);

    expect(mockService.renderPdf).toHaveBeenCalledWith(
      'tenant-uuid',
      'hh-1',
      'en',
      expect.any(Object),
    );
  });
});

// ─── Permission denied (guard rejection via HTTP) ──────────────────────────────

describe('HouseholdStatementsController — permission denied', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [HouseholdStatementsController],
      providers: [{ provide: HouseholdStatementsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({
        canActivate: () => {
          throw new ForbiddenException({
            error: { code: 'PERMISSION_DENIED', message: 'Missing required permission' },
          });
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('should return 403 when user lacks finance.view permission (GET /v1/finance/household-statements/123e4567-e89b-12d3-a456-426614174000)', async () => {
    await request(app.getHttpServer())
      .get('/v1/finance/household-statements/123e4567-e89b-12d3-a456-426614174000')
      .send({})
      .expect(403);
  });
});
