import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

import type { TenantContext } from '@school/shared';

import { AdmissionFormsService } from './admission-forms.service';
import { ApplicationsService } from './applications.service';
import { PublicAdmissionsController } from './public-admissions.controller';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const TENANT: TenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test',
  name: 'Test School',
  status: 'active',
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockAdmissionFormsService = {
  getPublishedForm: jest.fn(),
};

const mockApplicationsService = {
  createPublic: jest.fn(),
};

describe('PublicAdmissionsController', () => {
  let controller: PublicAdmissionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicAdmissionsController],
      providers: [
        { provide: AdmissionFormsService, useValue: mockAdmissionFormsService },
        { provide: ApplicationsService, useValue: mockApplicationsService },
      ],
    }).compile();

    controller = module.get<PublicAdmissionsController>(PublicAdmissionsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Guard verification ─────────────────────────────────────────────────────

  it('should NOT have any guards applied at class level (public controller)', () => {
    const guards = Reflect.getMetadata('__guards__', PublicAdmissionsController);
    expect(guards).toBeUndefined();
  });

  // ─── GET /v1/public/admissions/form ─────────────────────────────────────────

  describe('PublicAdmissionsController -- getPublishedForm', () => {
    it('should delegate to admissionFormsService.getPublishedForm with tenant_id', async () => {
      mockAdmissionFormsService.getPublishedForm.mockResolvedValue({
        id: 'form-1',
        name: 'Admission Form',
        fields: [],
      });

      const result = await controller.getPublishedForm(TENANT);

      expect(mockAdmissionFormsService.getPublishedForm).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual({ id: 'form-1', name: 'Admission Form', fields: [] });
    });
  });

  // ─── POST /v1/public/admissions/applications ───────────────────────────────

  describe('PublicAdmissionsController -- createApplication', () => {
    function buildRequest(overrides: Partial<Request> = {}): Request {
      return {
        headers: {},
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' },
        ...overrides,
      } as unknown as Request;
    }

    it('should delegate to applicationsService.createPublic with tenant_id, dto, and extracted IP', async () => {
      const dto = {
        form_definition_id: 'form-1',
        student_first_name: 'John',
        student_last_name: 'Doe',
        payload_json: {},
      };
      const req = buildRequest({ ip: '10.0.0.1' });
      mockApplicationsService.createPublic.mockResolvedValue({ id: 'app-1', status: 'draft' });

      const result = await controller.createApplication(TENANT, dto as never, req);

      expect(mockApplicationsService.createPublic).toHaveBeenCalledWith(TENANT_ID, dto, '10.0.0.1');
      expect(result).toEqual({ id: 'app-1', status: 'draft' });
    });

    it('should prefer cf-connecting-ip header for IP extraction', async () => {
      const dto = { form_definition_id: 'form-1', payload_json: {} };
      const req = buildRequest({
        headers: { 'cf-connecting-ip': '203.0.113.5' },
        ip: '10.0.0.1',
      });
      mockApplicationsService.createPublic.mockResolvedValue({ id: 'app-1' });

      await controller.createApplication(TENANT, dto as never, req);

      expect(mockApplicationsService.createPublic).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
        '203.0.113.5',
      );
    });

    it('should fall back to x-forwarded-for header when cf-connecting-ip is absent', async () => {
      const dto = { form_definition_id: 'form-1', payload_json: {} };
      const req = buildRequest({
        headers: { 'x-forwarded-for': '198.51.100.10, 203.0.113.5' },
        ip: '10.0.0.1',
      });
      mockApplicationsService.createPublic.mockResolvedValue({ id: 'app-1' });

      await controller.createApplication(TENANT, dto as never, req);

      expect(mockApplicationsService.createPublic).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
        '198.51.100.10',
      );
    });

    it('should fall back to x-forwarded-for array format', async () => {
      const dto = { form_definition_id: 'form-1', payload_json: {} };
      const req = buildRequest({
        headers: { 'x-forwarded-for': ['198.51.100.10, 203.0.113.5'] },
        ip: '10.0.0.1',
      });
      mockApplicationsService.createPublic.mockResolvedValue({ id: 'app-1' });

      await controller.createApplication(TENANT, dto as never, req);

      expect(mockApplicationsService.createPublic).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
        '198.51.100.10',
      );
    });

    it('should fall back to req.ip when no proxy headers are present', async () => {
      const dto = { form_definition_id: 'form-1', payload_json: {} };
      const req = buildRequest({ headers: {}, ip: '127.0.0.1' });
      mockApplicationsService.createPublic.mockResolvedValue({ id: 'app-1' });

      await controller.createApplication(TENANT, dto as never, req);

      expect(mockApplicationsService.createPublic).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
        '127.0.0.1',
      );
    });

    it('should fall back to socket.remoteAddress when req.ip is undefined', async () => {
      const dto = { form_definition_id: 'form-1', payload_json: {} };
      const req = buildRequest({
        headers: {},
        ip: undefined,
        socket: { remoteAddress: '::1' } as unknown as import('net').Socket,
      });
      mockApplicationsService.createPublic.mockResolvedValue({ id: 'app-1' });

      await controller.createApplication(TENANT, dto as never, req);

      expect(mockApplicationsService.createPublic).toHaveBeenCalledWith(TENANT_ID, dto, '::1');
    });

    it('should return "unknown" when no IP source is available', async () => {
      const dto = { form_definition_id: 'form-1', payload_json: {} };
      const req = buildRequest({
        headers: {},
        ip: undefined,
        socket: { remoteAddress: undefined } as unknown as import('net').Socket,
      });
      mockApplicationsService.createPublic.mockResolvedValue({ id: 'app-1' });

      await controller.createApplication(TENANT, dto as never, req);

      expect(mockApplicationsService.createPublic).toHaveBeenCalledWith(TENANT_ID, dto, 'unknown');
    });
  });
});
