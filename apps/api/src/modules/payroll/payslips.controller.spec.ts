import { Test } from '@nestjs/testing';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PAYSLIP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const tenantContext = {
  tenant_id: TENANT_ID,
  slug: 'test-school',
  name: 'Test School',
  status: 'active' as const,
  default_locale: 'en',
  timezone: 'Europe/Dublin',
};

const mockService = {
  listPayslips: jest.fn(),
  getPayslip: jest.fn(),
  renderPayslipPdf: jest.fn(),
};

describe('PayslipsController', () => {
  let controller: PayslipsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      controllers: [PayslipsController],
      providers: [
        { provide: PayslipsService, useValue: mockService },
      ],
    })
      .overrideGuard(AuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard).useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PayslipsController>(PayslipsController);
  });

  describe('list', () => {
    it('should delegate to service.listPayslips with tenant_id and query', async () => {
      const payslips = { data: [], meta: { page: 1, pageSize: 20, total: 0 } };
      mockService.listPayslips.mockResolvedValue(payslips);

      const result = await controller.list(tenantContext, { page: 1, pageSize: 20 });

      expect(mockService.listPayslips).toHaveBeenCalledWith(TENANT_ID, { page: 1, pageSize: 20 });
      expect(result).toEqual(payslips);
    });
  });

  describe('get', () => {
    it('should delegate to service.getPayslip with tenant_id and payslip id', async () => {
      const payslip = { id: PAYSLIP_ID, payroll_entry_id: 'entry-1' };
      mockService.getPayslip.mockResolvedValue(payslip);

      const result = await controller.get(tenantContext, PAYSLIP_ID);

      expect(mockService.getPayslip).toHaveBeenCalledWith(TENANT_ID, PAYSLIP_ID);
      expect(result).toEqual(payslip);
    });
  });

  describe('getPdf', () => {
    it('should call service.renderPayslipPdf and send PDF buffer as response', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');
      mockService.renderPayslipPdf.mockResolvedValue(pdfBuffer);

      const mockResponse = {
        set: jest.fn(),
        end: jest.fn(),
      };

      await controller.getPdf(tenantContext, PAYSLIP_ID, { locale: 'en' }, mockResponse as never);

      expect(mockService.renderPayslipPdf).toHaveBeenCalledWith(TENANT_ID, PAYSLIP_ID, 'en');
      expect(mockResponse.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="payslip-${PAYSLIP_ID}.pdf"`,
        }),
      );
      expect(mockResponse.end).toHaveBeenCalledWith(pdfBuffer);
    });

    it('should pass undefined locale to service when not specified', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4 fake pdf content');
      mockService.renderPayslipPdf.mockResolvedValue(pdfBuffer);

      const mockResponse = {
        set: jest.fn(),
        end: jest.fn(),
      };

      await controller.getPdf(tenantContext, PAYSLIP_ID, {}, mockResponse as never);

      expect(mockService.renderPayslipPdf).toHaveBeenCalledWith(TENANT_ID, PAYSLIP_ID, undefined);
    });
  });
});
