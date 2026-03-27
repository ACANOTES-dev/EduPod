import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { SafeguardingAttachmentService } from './safeguarding-attachment.service';
import { SafeguardingBreakGlassService } from './safeguarding-break-glass.service';
import { SafeguardingController } from './safeguarding.controller';
import { SafeguardingService } from './safeguarding.service';

const TENANT: TenantContext = {
  tenant_id: 'tenant-uuid',
  slug: 'test-school',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};
const USER: JwtPayload = {
  sub: 'user-uuid',
  tenant_id: 'tenant-uuid',
  email: 'admin@test.com',
  membership_id: 'mem-1',
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockSafeguardingService = {
  reportConcern: jest.fn(),
  getMyReports: jest.fn(),
  listConcerns: jest.fn(),
  getConcernDetail: jest.fn(),
  updateConcern: jest.fn(),
  transitionStatus: jest.fn(),
  assignConcern: jest.fn(),
  recordAction: jest.fn(),
  getActions: jest.fn(),
  recordTuslaReferral: jest.fn(),
  recordGardaReferral: jest.fn(),
  initiateSeal: jest.fn(),
  approveSeal: jest.fn(),
  getDashboard: jest.fn(),
  checkEffectivePermission: jest.fn(),
};

const mockAttachmentService = {
  uploadAttachment: jest.fn(),
  generateDownloadUrl: jest.fn(),
};

const mockBreakGlassService = {
  grantAccess: jest.fn(),
  listActiveGrants: jest.fn(),
  completeReview: jest.fn(),
};

describe('SafeguardingController', () => {
  let controller: SafeguardingController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SafeguardingController],
      providers: [
        { provide: SafeguardingService, useValue: mockSafeguardingService },
        { provide: SafeguardingAttachmentService, useValue: mockAttachmentService },
        { provide: SafeguardingBreakGlassService, useValue: mockBreakGlassService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<SafeguardingController>(SafeguardingController);
    jest.clearAllMocks();
  });

  // ─── Concern CRUD ───────────────────────────────────────────────────────

  it('should call safeguardingService.reportConcern with tenant_id, user sub, and dto', async () => {
    const dto = { student_id: 's-1', description: 'Bruising observed' };
    mockSafeguardingService.reportConcern.mockResolvedValue({ id: 'concern-1' });

    const result = await controller.reportConcern(TENANT, USER, dto as never);

    expect(mockSafeguardingService.reportConcern).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
    expect(result).toEqual({ id: 'concern-1' });
  });

  it('should call safeguardingService.getMyReports with tenant_id, user sub, and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockSafeguardingService.getMyReports.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.getMyReports(TENANT, USER, query as never);

    expect(mockSafeguardingService.getMyReports).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', query);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call safeguardingService.listConcerns with tenant_id, user sub, membership_id, and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockSafeguardingService.listConcerns.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.listConcerns(TENANT, USER, query as never);

    expect(mockSafeguardingService.listConcerns).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'mem-1', query,
    );
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call safeguardingService.getConcernDetail with tenant_id, user sub, membership_id, and id', async () => {
    mockSafeguardingService.getConcernDetail.mockResolvedValue({ id: 'concern-1' });

    const result = await controller.getConcernDetail(TENANT, USER, 'concern-1');

    expect(mockSafeguardingService.getConcernDetail).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'mem-1', 'concern-1',
    );
    expect(result).toEqual({ id: 'concern-1' });
  });

  it('should call safeguardingService.updateConcern with tenant_id, user sub, id, and dto', async () => {
    const dto = { severity: 'high' };
    mockSafeguardingService.updateConcern.mockResolvedValue({ id: 'concern-1' });

    const result = await controller.updateConcern(TENANT, USER, 'concern-1', dto as never);

    expect(mockSafeguardingService.updateConcern).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1', dto,
    );
    expect(result).toEqual({ id: 'concern-1' });
  });

  it('should call safeguardingService.transitionStatus with tenant_id, user sub, id, and dto', async () => {
    const dto = { status: 'investigating' };
    mockSafeguardingService.transitionStatus.mockResolvedValue({ id: 'concern-1', status: 'investigating' });

    const result = await controller.transitionStatus(TENANT, USER, 'concern-1', dto as never);

    expect(mockSafeguardingService.transitionStatus).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1', dto,
    );
    expect(result).toEqual({ id: 'concern-1', status: 'investigating' });
  });

  it('should call safeguardingService.assignConcern with tenant_id, user sub, id, and dto', async () => {
    const dto = { assignee_id: 'staff-1' };
    mockSafeguardingService.assignConcern.mockResolvedValue({ id: 'concern-1' });

    const result = await controller.assignConcern(TENANT, USER, 'concern-1', dto as never);

    expect(mockSafeguardingService.assignConcern).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1', dto,
    );
    expect(result).toEqual({ id: 'concern-1' });
  });

  // ─── Actions ────────────────────────────────────────────────────────────

  it('should call safeguardingService.recordAction with tenant_id, user sub, id, and dto', async () => {
    const dto = { action_type: 'phone_call', notes: 'Spoke with parent' };
    mockSafeguardingService.recordAction.mockResolvedValue({ id: 'action-1' });

    const result = await controller.recordAction(TENANT, USER, 'concern-1', dto as never);

    expect(mockSafeguardingService.recordAction).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1', dto,
    );
    expect(result).toEqual({ id: 'action-1' });
  });

  it('should call safeguardingService.getActions with tenant_id, user sub, membership_id, id, and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockSafeguardingService.getActions.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.getActions(TENANT, USER, 'concern-1', query as never);

    expect(mockSafeguardingService.getActions).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'mem-1', 'concern-1', query,
    );
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  // ─── Referrals ──────────────────────────────────────────────────────────

  it('should call safeguardingService.recordTuslaReferral with tenant_id, user sub, id, and dto', async () => {
    const dto = { reference_number: 'TUSLA-001', date: '2026-03-15' };
    mockSafeguardingService.recordTuslaReferral.mockResolvedValue({ id: 'ref-1' });

    const result = await controller.recordTuslaReferral(TENANT, USER, 'concern-1', dto as never);

    expect(mockSafeguardingService.recordTuslaReferral).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1', dto,
    );
    expect(result).toEqual({ id: 'ref-1' });
  });

  it('should call safeguardingService.recordGardaReferral with tenant_id, user sub, id, and dto', async () => {
    const dto = { reference_number: 'GARDA-001', date: '2026-03-15' };
    mockSafeguardingService.recordGardaReferral.mockResolvedValue({ id: 'ref-2' });

    const result = await controller.recordGardaReferral(TENANT, USER, 'concern-1', dto as never);

    expect(mockSafeguardingService.recordGardaReferral).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1', dto,
    );
    expect(result).toEqual({ id: 'ref-2' });
  });

  // ─── Attachments ────────────────────────────────────────────────────────

  it('should call attachmentService.uploadAttachment with tenant_id, user sub, id, file, and dto', async () => {
    const file = { buffer: Buffer.from('test'), originalname: 'doc.pdf', mimetype: 'application/pdf', size: 1024 };
    const dto = { label: 'Evidence photo' };
    mockAttachmentService.uploadAttachment.mockResolvedValue({ id: 'att-1' });

    const result = await controller.uploadAttachment(TENANT, USER, 'concern-1', file, dto as never);

    expect(mockAttachmentService.uploadAttachment).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1', file, dto,
    );
    expect(result).toEqual({ id: 'att-1' });
  });

  it('should call attachmentService.generateDownloadUrl with correct args', async () => {
    mockAttachmentService.generateDownloadUrl.mockResolvedValue({ url: 'https://s3/download' });

    const result = await controller.downloadAttachment(TENANT, USER, 'concern-1', 'att-1');

    expect(mockAttachmentService.generateDownloadUrl).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'mem-1', 'concern-1', 'att-1',
      expect.any(Function),
    );
    expect(result).toEqual({ url: 'https://s3/download' });
  });

  // ─── Case File PDF ──────────────────────────────────────────────────────

  it('should return not_implemented for generateCaseFile', async () => {
    const result = await controller.generateCaseFile(TENANT, 'concern-1');

    expect(result).toEqual({
      data: { status: 'not_implemented', message: expect.any(String) },
    });
  });

  it('should return not_implemented for generateRedactedCaseFile', async () => {
    const result = await controller.generateRedactedCaseFile(TENANT, 'concern-1');

    expect(result).toEqual({
      data: { status: 'not_implemented', message: expect.any(String) },
    });
  });

  // ─── Seal ───────────────────────────────────────────────────────────────

  it('should call safeguardingService.initiateSeal with tenant_id, user sub, id, and dto', async () => {
    const dto = { reason: 'Case resolved, sealing record' };
    mockSafeguardingService.initiateSeal.mockResolvedValue({ id: 'concern-1', seal_status: 'pending' });

    const result = await controller.initiateSeal(TENANT, USER, 'concern-1', dto as never);

    expect(mockSafeguardingService.initiateSeal).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1', dto,
    );
    expect(result).toEqual({ id: 'concern-1', seal_status: 'pending' });
  });

  it('should call safeguardingService.approveSeal with tenant_id, user sub, and id', async () => {
    const dto = { approval_note: 'Approved by DLP' };
    mockSafeguardingService.approveSeal.mockResolvedValue({ id: 'concern-1', seal_status: 'sealed' });

    const result = await controller.approveSeal(TENANT, USER, 'concern-1', dto as never);

    expect(mockSafeguardingService.approveSeal).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'concern-1',
    );
    expect(result).toEqual({ id: 'concern-1', seal_status: 'sealed' });
  });

  // ─── Dashboard ──────────────────────────────────────────────────────────

  it('should call safeguardingService.getDashboard with tenant_id', async () => {
    mockSafeguardingService.getDashboard.mockResolvedValue({ open: 3, closed: 10 });

    const result = await controller.getDashboard(TENANT);

    expect(mockSafeguardingService.getDashboard).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toEqual({ open: 3, closed: 10 });
  });

  // ─── Break-Glass ────────────────────────────────────────────────────────

  it('should call breakGlassService.grantAccess with tenant_id, user sub, and dto', async () => {
    const dto = { concern_id: 'concern-1', reason: 'Emergency access needed' };
    mockBreakGlassService.grantAccess.mockResolvedValue({ id: 'bg-1' });

    const result = await controller.grantBreakGlass(TENANT, USER, dto as never);

    expect(mockBreakGlassService.grantAccess).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
    expect(result).toEqual({ id: 'bg-1' });
  });

  it('should call breakGlassService.listActiveGrants with tenant_id', async () => {
    mockBreakGlassService.listActiveGrants.mockResolvedValue([{ id: 'bg-1' }]);

    const result = await controller.listBreakGlassGrants(TENANT);

    expect(mockBreakGlassService.listActiveGrants).toHaveBeenCalledWith('tenant-uuid');
    expect(result).toEqual([{ id: 'bg-1' }]);
  });

  it('should call breakGlassService.completeReview with tenant_id, user sub, id, and dto', async () => {
    const dto = { outcome: 'justified', notes: 'Access was necessary' };
    mockBreakGlassService.completeReview.mockResolvedValue({ id: 'bg-1', reviewed: true });

    const result = await controller.completeBreakGlassReview(TENANT, USER, 'bg-1', dto as never);

    expect(mockBreakGlassService.completeReview).toHaveBeenCalledWith(
      'tenant-uuid', 'user-uuid', 'bg-1', dto,
    );
    expect(result).toEqual({ id: 'bg-1', reviewed: true });
  });
});
