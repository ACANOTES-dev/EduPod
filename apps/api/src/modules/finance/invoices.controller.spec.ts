import { Test, TestingModule } from '@nestjs/testing';
import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

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

const mockInvoicesService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  getPreview: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  issue: jest.fn(),
  voidInvoice: jest.fn(),
  cancel: jest.fn(),
  writeOff: jest.fn(),
  getInstallments: jest.fn(),
  createInstallments: jest.fn(),
  deleteInstallments: jest.fn(),
};

const mockPdfRenderingService = {
  renderPdf: jest.fn(),
};

const mockPrisma = {
  tenantBranding: { findUnique: jest.fn() },
};

describe('InvoicesController', () => {
  let controller: InvoicesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoicesController],
      providers: [
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<InvoicesController>(InvoicesController);
    jest.clearAllMocks();
  });

  it('should call service.findAll with tenant and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockInvoicesService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
    await controller.findAll(TENANT, query);
    expect(mockInvoicesService.findAll).toHaveBeenCalledWith('tenant-uuid', query);
  });

  it('should call service.findOne with tenant and id', async () => {
    mockInvoicesService.findOne.mockResolvedValue({ id: 'inv-1' });
    await controller.findOne(TENANT, 'inv-1');
    expect(mockInvoicesService.findOne).toHaveBeenCalledWith('tenant-uuid', 'inv-1');
  });

  it('should call service.getPreview with tenant and id', async () => {
    mockInvoicesService.getPreview.mockResolvedValue({ html: '<div/>' });
    await controller.getPreview(TENANT, 'inv-1');
    expect(mockInvoicesService.getPreview).toHaveBeenCalledWith('tenant-uuid', 'inv-1');
  });

  it('should call service.create with tenant, user.sub and dto', async () => {
    const dto = { household_id: 'hh-1' } as never;
    mockInvoicesService.create.mockResolvedValue({ id: 'inv-new' });
    await controller.create(TENANT, USER, dto);
    expect(mockInvoicesService.create).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
  });

  it('should call service.issue with tenant, id, user.sub and false', async () => {
    mockInvoicesService.issue.mockResolvedValue({ id: 'inv-1', status: 'issued' });
    await controller.issue(TENANT, USER, 'inv-1');
    expect(mockInvoicesService.issue).toHaveBeenCalledWith('tenant-uuid', 'inv-1', 'user-uuid', false);
  });

  it('should call service.voidInvoice with tenant and id', async () => {
    mockInvoicesService.voidInvoice.mockResolvedValue({ id: 'inv-1', status: 'void' });
    await controller.voidInvoice(TENANT, 'inv-1');
    expect(mockInvoicesService.voidInvoice).toHaveBeenCalledWith('tenant-uuid', 'inv-1');
  });

  it('should call service.cancel with tenant, id and user.sub', async () => {
    mockInvoicesService.cancel.mockResolvedValue({ id: 'inv-1', status: 'cancelled' });
    await controller.cancel(TENANT, USER, 'inv-1');
    expect(mockInvoicesService.cancel).toHaveBeenCalledWith('tenant-uuid', 'inv-1', 'user-uuid');
  });

  it('should call service.writeOff with tenant, id and dto', async () => {
    const dto = { reason: 'Bad debt' } as never;
    mockInvoicesService.writeOff.mockResolvedValue({ id: 'inv-1' });
    await controller.writeOff(TENANT, 'inv-1', dto);
    expect(mockInvoicesService.writeOff).toHaveBeenCalledWith('tenant-uuid', 'inv-1', dto);
  });

  it('should call service.getInstallments with tenant and id', async () => {
    mockInvoicesService.getInstallments.mockResolvedValue([]);
    await controller.getInstallments(TENANT, 'inv-1');
    expect(mockInvoicesService.getInstallments).toHaveBeenCalledWith('tenant-uuid', 'inv-1');
  });

  it('should call service.createInstallments with tenant, id and installments array', async () => {
    const dto = { installments: [{ amount: 100, due_date: '2025-02-01' }] };
    mockInvoicesService.createInstallments.mockResolvedValue([]);
    await controller.createInstallments(TENANT, 'inv-1', dto as never);
    expect(mockInvoicesService.createInstallments).toHaveBeenCalledWith(
      'tenant-uuid',
      'inv-1',
      dto.installments,
    );
  });

  it('should call service.deleteInstallments with tenant and id', async () => {
    mockInvoicesService.deleteInstallments.mockResolvedValue({ count: 2 });
    await controller.deleteInstallments(TENANT, 'inv-1');
    expect(mockInvoicesService.deleteInstallments).toHaveBeenCalledWith('tenant-uuid', 'inv-1');
  });

  it('should render PDF with branding and send response', async () => {
    const invoiceData = { id: 'inv-1', invoice_number: 'INV-001' };
    const branding = {
      school_name_display: 'My School',
      school_name_ar: null,
      logo_url: null,
      primary_color: null,
    };
    const pdfBuffer = Buffer.from('pdf-content');

    mockInvoicesService.findOne.mockResolvedValue(invoiceData);
    mockPrisma.tenantBranding.findUnique.mockResolvedValue(branding);
    mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

    const mockRes = {
      set: jest.fn(),
      end: jest.fn(),
    };

    await controller.getPdf(TENANT, 'inv-1', {}, mockRes as never);

    expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
      'invoice',
      'en',
      invoiceData,
      expect.objectContaining({ school_name: 'My School' }),
    );
    expect(mockRes.set).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
  });
});
