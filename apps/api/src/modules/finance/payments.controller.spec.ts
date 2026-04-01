import { Test, TestingModule } from '@nestjs/testing';

import type { JwtPayload, TenantContext } from '@school/shared';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { ReceiptsService } from './receipts.service';

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

const mockPaymentsService = {
  findAll: jest.fn(),
  getAcceptingStaff: jest.fn(),
  findOne: jest.fn(),
  createManual: jest.fn(),
  suggestAllocations: jest.fn(),
  confirmAllocations: jest.fn(),
};

const mockReceiptsService = {
  findByPayment: jest.fn(),
  renderPdf: jest.fn(),
};

describe('PaymentsController', () => {
  let controller: PaymentsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: ReceiptsService, useValue: mockReceiptsService },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<PaymentsController>(PaymentsController);
    jest.clearAllMocks();
  });

  it('should call service.findAll with tenant and query', async () => {
    const query = { page: 1, pageSize: 20 };
    mockPaymentsService.findAll.mockResolvedValue({ data: [], meta: { total: 0 } });
    await controller.findAll(TENANT, query);
    expect(mockPaymentsService.findAll).toHaveBeenCalledWith('tenant-uuid', query);
  });

  it('should call service.getAcceptingStaff with tenant', async () => {
    mockPaymentsService.getAcceptingStaff.mockResolvedValue([]);
    await controller.getAcceptingStaff(TENANT);
    expect(mockPaymentsService.getAcceptingStaff).toHaveBeenCalledWith('tenant-uuid');
  });

  it('should call service.findOne with tenant and id', async () => {
    mockPaymentsService.findOne.mockResolvedValue({ id: 'pay-1' });
    await controller.findOne(TENANT, 'pay-1');
    expect(mockPaymentsService.findOne).toHaveBeenCalledWith('tenant-uuid', 'pay-1');
  });

  it('should call service.createManual with tenant, user.sub and dto', async () => {
    const dto = { amount: 100 } as never;
    mockPaymentsService.createManual.mockResolvedValue({ id: 'pay-new' });
    await controller.create(TENANT, USER, dto);
    expect(mockPaymentsService.createManual).toHaveBeenCalledWith('tenant-uuid', 'user-uuid', dto);
  });

  it('should call service.suggestAllocations with tenant and id', async () => {
    mockPaymentsService.suggestAllocations.mockResolvedValue([]);
    await controller.suggestAllocations(TENANT, 'pay-1');
    expect(mockPaymentsService.suggestAllocations).toHaveBeenCalledWith('tenant-uuid', 'pay-1');
  });

  it('should call service.confirmAllocations with tenant, id, user.sub and dto', async () => {
    const dto = { allocations: [] } as never;
    mockPaymentsService.confirmAllocations.mockResolvedValue({ id: 'pay-1' });
    await controller.confirmAllocations(TENANT, USER, 'pay-1', dto);
    expect(mockPaymentsService.confirmAllocations).toHaveBeenCalledWith(
      'tenant-uuid',
      'pay-1',
      'user-uuid',
      dto,
    );
  });

  it('should call receiptsService.findByPayment with tenant and id', async () => {
    mockReceiptsService.findByPayment.mockResolvedValue({ id: 'rcpt-1' });
    await controller.getReceipt(TENANT, 'pay-1');
    expect(mockReceiptsService.findByPayment).toHaveBeenCalledWith('tenant-uuid', 'pay-1');
  });

  it('should render receipt PDF and send response', async () => {
    const pdfBuffer = Buffer.from('pdf-content');
    mockReceiptsService.renderPdf.mockResolvedValue(pdfBuffer);

    const mockRes = { set: jest.fn(), end: jest.fn() };
    await controller.getReceiptPdf(TENANT, 'pay-1', undefined, mockRes as never);

    expect(mockReceiptsService.renderPdf).toHaveBeenCalledWith('tenant-uuid', 'pay-1', 'en');
    expect(mockRes.set).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalledWith(pdfBuffer);
  });
});
