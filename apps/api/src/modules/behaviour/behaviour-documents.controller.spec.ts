import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { BehaviourDocumentService } from './behaviour-document.service';
import { BehaviourDocumentsController } from './behaviour-documents.controller';

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

const mockDocumentService = {
  generateDocument: jest.fn(),
  listDocuments: jest.fn(),
  getDocument: jest.fn(),
  finaliseDocument: jest.fn(),
  sendDocument: jest.fn(),
  getDownloadUrl: jest.fn(),
};

describe('BehaviourDocumentsController', () => {
  let controller: BehaviourDocumentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BehaviourDocumentsController],
      providers: [{ provide: BehaviourDocumentService, useValue: mockDocumentService }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ModuleEnabledGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<BehaviourDocumentsController>(BehaviourDocumentsController);
    jest.clearAllMocks();
  });

  it('should call documentService.generateDocument with tenant_id, user sub, and dto', async () => {
    const dto = { template_id: 'tmpl-1', incident_id: 'inc-1' };
    mockDocumentService.generateDocument.mockResolvedValue({ id: 'doc-1' });

    const result = await controller.generateDocument(TENANT, USER, dto as never);

    expect(mockDocumentService.generateDocument).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      dto,
    );
    expect(result).toEqual({ id: 'doc-1' });
  });

  it('should call documentService.listDocuments with tenant_id and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockDocumentService.listDocuments.mockResolvedValue({ data: [], meta: { total: 0 } });

    const result = await controller.listDocuments(TENANT, query as never);

    expect(mockDocumentService.listDocuments).toHaveBeenCalledWith('tenant-uuid', query);
    expect(result).toEqual({ data: [], meta: { total: 0 } });
  });

  it('should call documentService.getDocument with tenant_id and id', async () => {
    mockDocumentService.getDocument.mockResolvedValue({ id: 'doc-1', status: 'draft' });

    const result = await controller.getDocument(TENANT, 'doc-1');

    expect(mockDocumentService.getDocument).toHaveBeenCalledWith('tenant-uuid', 'doc-1');
    expect(result).toEqual({ id: 'doc-1', status: 'draft' });
  });

  it('should call documentService.finaliseDocument with tenant_id, user sub, id, and notes', async () => {
    const dto = { notes: 'Approved by principal' };
    mockDocumentService.finaliseDocument.mockResolvedValue({ id: 'doc-1', status: 'finalised' });

    const result = await controller.finaliseDocument(TENANT, USER, 'doc-1', dto as never);

    expect(mockDocumentService.finaliseDocument).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      'doc-1',
      'Approved by principal',
    );
    expect(result).toEqual({ id: 'doc-1', status: 'finalised' });
  });

  it('should call documentService.sendDocument with tenant_id, user sub, id, and dto', async () => {
    const dto = { recipient_email: 'parent@test.com', method: 'email' };
    mockDocumentService.sendDocument.mockResolvedValue({ id: 'doc-1', sent: true });

    const result = await controller.sendDocument(TENANT, USER, 'doc-1', dto as never);

    expect(mockDocumentService.sendDocument).toHaveBeenCalledWith(
      'tenant-uuid',
      'user-uuid',
      'doc-1',
      dto,
    );
    expect(result).toEqual({ id: 'doc-1', sent: true });
  });

  it('should call documentService.getDownloadUrl with tenant_id and id', async () => {
    mockDocumentService.getDownloadUrl.mockResolvedValue({ url: 'https://s3/doc.pdf' });

    const result = await controller.downloadDocument(TENANT, 'doc-1');

    expect(mockDocumentService.getDownloadUrl).toHaveBeenCalledWith('tenant-uuid', 'doc-1');
    expect(result).toEqual({ url: 'https://s3/doc.pdf' });
  });
});
