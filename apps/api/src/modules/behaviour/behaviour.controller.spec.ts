/* eslint-disable @typescript-eslint/no-require-imports */
import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PolicyReplayService } from '../policy-engine/policy-replay.service';

import { BehaviourAttachmentService } from './behaviour-attachment.service';
import { BehaviourHistoryService } from './behaviour-history.service';
import { BehaviourQuickLogService } from './behaviour-quick-log.service';
import { BehaviourController } from './behaviour.controller';
import { BehaviourService } from './behaviour.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MEMBERSHIP_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const INCIDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARTICIPANT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ATTACHMENT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

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
  membership_id: MEMBERSHIP_ID,
  type: 'access',
  iat: 0,
  exp: 0,
};

const mockBehaviourService = {
  createIncident: jest.fn(),
  listIncidents: jest.fn(),
  getMyIncidents: jest.fn(),
  getFeed: jest.fn(),
  getIncident: jest.fn(),
  updateIncident: jest.fn(),
  transitionStatus: jest.fn(),
  withdrawIncident: jest.fn(),
  addParticipant: jest.fn(),
  removeParticipant: jest.fn(),
};

const mockQuickLogService = {
  quickLog: jest.fn(),
  bulkPositive: jest.fn(),
  getContext: jest.fn(),
};

const mockHistoryService = {
  getHistory: jest.fn(),
};

const mockPermissionCacheService = {
  getPermissions: jest.fn(),
};

const mockAttachmentService = {
  uploadAttachment: jest.fn(),
  listAttachments: jest.fn(),
  getAttachment: jest.fn(),
  recordFollowUp: jest.fn(),
};

const mockPolicyReplayService = {
  getIncidentEvaluationTrace: jest.fn(),
};

describe('BehaviourController', () => {
  let controller: BehaviourController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourController],
      providers: [
        { provide: BehaviourService, useValue: mockBehaviourService },
        { provide: BehaviourQuickLogService, useValue: mockQuickLogService },
        { provide: BehaviourHistoryService, useValue: mockHistoryService },
        { provide: BehaviourAttachmentService, useValue: mockAttachmentService },
        { provide: PermissionCacheService, useValue: mockPermissionCacheService },
        { provide: PolicyReplayService, useValue: mockPolicyReplayService },
      ],
    })
      .overrideGuard(require('../../common/guards/auth.guard').AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permission.guard').PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/module-enabled.guard').ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BehaviourController>(BehaviourController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Incident CRUD ──────────────────────────────────────────────────────────

  it('should call behaviourService.createIncident with tenant_id, user_id, and dto', async () => {
    const dto = { student_id: 'student-1', category_id: 'cat-1', description: 'test' };
    mockBehaviourService.createIncident.mockResolvedValue({ id: INCIDENT_ID });

    const result = await controller.createIncident(TENANT, USER, dto as never);

    expect(mockBehaviourService.createIncident).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ id: INCIDENT_ID });
  });

  it('should call quickLogService.quickLog with tenant_id, user_id, and dto', async () => {
    const dto = { student_id: 'student-1', category_id: 'cat-1', points: 5 };
    mockQuickLogService.quickLog.mockResolvedValue({ id: 'log-1' });

    const result = await controller.quickLog(TENANT, USER, dto as never);

    expect(mockQuickLogService.quickLog).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ id: 'log-1' });
  });

  it('should call quickLogService.bulkPositive with tenant_id, user_id, and dto', async () => {
    const dto = { student_ids: ['s1', 's2'], category_id: 'cat-1', points: 3 };
    mockQuickLogService.bulkPositive.mockResolvedValue({ created: 2 });

    const result = await controller.bulkPositive(TENANT, USER, dto as never);

    expect(mockQuickLogService.bulkPositive).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toEqual({ created: 2 });
  });

  it('should return stub response for aiParse', async () => {
    const result = await controller.aiParse();

    expect(result).toEqual({ data: null, message: 'AI parse not yet implemented' });
  });

  it('should call behaviourService.listIncidents with tenant_id, user_id, permissions, and query', async () => {
    const query = { page: 1, pageSize: 20 };
    const permissions = ['behaviour.view', 'behaviour.manage'];
    mockPermissionCacheService.getPermissions.mockResolvedValue(permissions);
    mockBehaviourService.listIncidents.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.listIncidents(TENANT, USER, query as never);

    expect(mockPermissionCacheService.getPermissions).toHaveBeenCalledWith(MEMBERSHIP_ID);
    expect(mockBehaviourService.listIncidents).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      permissions,
      query,
    );
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call behaviourService.getMyIncidents with tenant_id, user_id, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockBehaviourService.getMyIncidents.mockResolvedValue({ data: [] });

    const result = await controller.getMyIncidents(TENANT, USER, query);

    expect(mockBehaviourService.getMyIncidents).toHaveBeenCalledWith(TENANT_ID, USER_ID, 1, 20);
    expect(result).toEqual({ data: [] });
  });

  it('should call behaviourService.getFeed with tenant_id, user_id, permissions, page, pageSize', async () => {
    const query = { page: 2, pageSize: 10 };
    const permissions = ['behaviour.view'];
    mockPermissionCacheService.getPermissions.mockResolvedValue(permissions);
    mockBehaviourService.getFeed.mockResolvedValue({ data: [] });

    const result = await controller.getFeed(TENANT, USER, query);

    expect(mockBehaviourService.getFeed).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      permissions,
      2,
      10,
    );
    expect(result).toEqual({ data: [] });
  });

  it('should call behaviourService.getIncident with tenant_id, id, user_id, permissions', async () => {
    const permissions = ['behaviour.view'];
    mockPermissionCacheService.getPermissions.mockResolvedValue(permissions);
    mockBehaviourService.getIncident.mockResolvedValue({ id: INCIDENT_ID });

    const result = await controller.getIncident(TENANT, USER, INCIDENT_ID);

    expect(mockBehaviourService.getIncident).toHaveBeenCalledWith(
      TENANT_ID,
      INCIDENT_ID,
      USER_ID,
      permissions,
    );
    expect(result).toEqual({ id: INCIDENT_ID });
  });

  it('should call behaviourService.updateIncident with tenant_id, id, user_id, dto', async () => {
    const dto = { description: 'updated' };
    mockBehaviourService.updateIncident.mockResolvedValue({ id: INCIDENT_ID });

    const result = await controller.updateIncident(TENANT, USER, INCIDENT_ID, dto as never);

    expect(mockBehaviourService.updateIncident).toHaveBeenCalledWith(
      TENANT_ID,
      INCIDENT_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: INCIDENT_ID });
  });

  it('should call behaviourService.transitionStatus with tenant_id, id, user_id, dto', async () => {
    const dto = { status: 'resolved', reason: 'Handled' };
    mockBehaviourService.transitionStatus.mockResolvedValue({
      id: INCIDENT_ID,
      status: 'resolved',
    });

    const result = await controller.transitionStatus(TENANT, USER, INCIDENT_ID, dto as never);

    expect(mockBehaviourService.transitionStatus).toHaveBeenCalledWith(
      TENANT_ID,
      INCIDENT_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: INCIDENT_ID, status: 'resolved' });
  });

  it('should call behaviourService.withdrawIncident with tenant_id, id, user_id, dto', async () => {
    const dto = { reason: 'Mistake' };
    mockBehaviourService.withdrawIncident.mockResolvedValue({
      id: INCIDENT_ID,
      status: 'withdrawn',
    });

    const result = await controller.withdrawIncident(TENANT, USER, INCIDENT_ID, dto as never);

    expect(mockBehaviourService.withdrawIncident).toHaveBeenCalledWith(
      TENANT_ID,
      INCIDENT_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: INCIDENT_ID, status: 'withdrawn' });
  });

  it('should call attachmentService.recordFollowUp with tenant_id, user_id, id, dto', async () => {
    const dto = { action_taken: 'Spoke with student', outcome: 'Resolved' };
    mockAttachmentService.recordFollowUp.mockResolvedValue({
      data: { incident_id: INCIDENT_ID, follow_up_recorded: true },
    });

    const result = await controller.recordFollowUp(TENANT, USER, INCIDENT_ID, dto as never);

    expect(mockAttachmentService.recordFollowUp).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      INCIDENT_ID,
      dto,
    );
    expect(result).toEqual({ data: { incident_id: INCIDENT_ID, follow_up_recorded: true } });
  });

  // ─── Participants ──────────────────────────────────────────────────────────

  it('should call behaviourService.addParticipant with tenant_id, id, user_id, dto', async () => {
    const dto = { student_id: 'student-2', role: 'witness' };
    mockBehaviourService.addParticipant.mockResolvedValue({ id: PARTICIPANT_ID });

    const result = await controller.addParticipant(TENANT, USER, INCIDENT_ID, dto as never);

    expect(mockBehaviourService.addParticipant).toHaveBeenCalledWith(
      TENANT_ID,
      INCIDENT_ID,
      USER_ID,
      dto,
    );
    expect(result).toEqual({ id: PARTICIPANT_ID });
  });

  it('should call behaviourService.removeParticipant with tenant_id, id, pid, user_id', async () => {
    mockBehaviourService.removeParticipant.mockResolvedValue({ deleted: true });

    const result = await controller.removeParticipant(TENANT, USER, INCIDENT_ID, PARTICIPANT_ID);

    expect(mockBehaviourService.removeParticipant).toHaveBeenCalledWith(
      TENANT_ID,
      INCIDENT_ID,
      PARTICIPANT_ID,
      USER_ID,
    );
    expect(result).toEqual({ deleted: true });
  });

  // ─── Attachments ──────────────────────────────────────────────────────────

  it('should call attachmentService.uploadAttachment with tenant_id, user_id, id, file, dto', async () => {
    const file = {
      buffer: Buffer.from('test'),
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
    };
    const dto = { classification: 'staff_statement' };
    mockAttachmentService.uploadAttachment.mockResolvedValue({
      data: { id: ATTACHMENT_ID, file_name: 'test.pdf' },
    });

    const result = await controller.uploadAttachment(TENANT, USER, INCIDENT_ID, file, dto as never);

    expect(mockAttachmentService.uploadAttachment).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      INCIDENT_ID,
      file,
      dto,
    );
    expect(result).toEqual({ data: { id: ATTACHMENT_ID, file_name: 'test.pdf' } });
  });

  it('should call attachmentService.listAttachments with tenant_id and id', async () => {
    mockAttachmentService.listAttachments.mockResolvedValue({ data: [] });

    const result = await controller.listAttachments(TENANT, INCIDENT_ID);

    expect(mockAttachmentService.listAttachments).toHaveBeenCalledWith(TENANT_ID, INCIDENT_ID);
    expect(result).toEqual({ data: [] });
  });

  it('should call attachmentService.getAttachment with tenant_id, user_id, id, aid', async () => {
    mockAttachmentService.getAttachment.mockResolvedValue({
      data: { id: ATTACHMENT_ID, download_url: 'https://example.com/file' },
    });

    const result = await controller.downloadAttachment(TENANT, USER, INCIDENT_ID, ATTACHMENT_ID);

    expect(mockAttachmentService.getAttachment).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      INCIDENT_ID,
      ATTACHMENT_ID,
    );
    expect(result).toEqual({
      data: { id: ATTACHMENT_ID, download_url: 'https://example.com/file' },
    });
  });

  // ─── History ──────────────────────────────────────────────────────────────

  it('should call historyService.getHistory with tenant_id, entity type, id, page, pageSize', async () => {
    const query = { page: 1, pageSize: 20 };
    mockHistoryService.getHistory.mockResolvedValue({ data: [] });

    const result = await controller.getIncidentHistory(TENANT, INCIDENT_ID, query);

    expect(mockHistoryService.getHistory).toHaveBeenCalledWith(
      TENANT_ID,
      'incident',
      INCIDENT_ID,
      1,
      20,
    );
    expect(result).toEqual({ data: [] });
  });

  // ─── Policy Evaluation Trace ──────────────────────────────────────────────

  it('should call policyReplayService.getIncidentEvaluationTrace with tenant_id and id', async () => {
    mockPolicyReplayService.getIncidentEvaluationTrace.mockResolvedValue({ trace: [] });

    const result = await controller.getPolicyEvaluation(TENANT, INCIDENT_ID);

    expect(mockPolicyReplayService.getIncidentEvaluationTrace).toHaveBeenCalledWith(
      TENANT_ID,
      INCIDENT_ID,
    );
    expect(result).toEqual({ trace: [] });
  });

  // ─── Quick-Log Context ────────────────────────────────────────────────────

  it('should call quickLogService.getContext with tenant_id and user_id', async () => {
    mockQuickLogService.getContext.mockResolvedValue({ categories: [], templates: [] });

    const result = await controller.getQuickLogContext(TENANT, USER);

    expect(mockQuickLogService.getContext).toHaveBeenCalledWith(TENANT_ID, USER_ID);
    expect(result).toEqual({ categories: [], templates: [] });
  });

  it('should call quickLogService.getContext for templates and return templates only', async () => {
    mockQuickLogService.getContext.mockResolvedValue({ categories: [], templates: [{ id: 't1' }] });

    const result = await controller.getQuickLogTemplates(TENANT);

    expect(mockQuickLogService.getContext).toHaveBeenCalledWith(TENANT_ID, '');
    expect(result).toEqual({ data: [{ id: 't1' }] });
  });
});
