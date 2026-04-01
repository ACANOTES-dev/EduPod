import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceService } from '../sequence/sequence.service';

import { ReceiptsService } from './receipts.service';

const TENANT_ID = 'tenant-uuid-1111';
const USER_ID = 'user-uuid-1111';
const PAYMENT_ID = 'pay-uuid-1111';
const RECEIPT_ID = 'rec-uuid-1111';

const mockPrisma = {
  tenantBranding: {
    findUnique: jest.fn(),
  },
  receipt: {
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  payment: {
    findFirst: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
};

const mockPdfRenderingService = {
  renderPdf: jest.fn(),
};

const mockSequenceService = {
  nextNumber: jest.fn().mockResolvedValue('REC-202603-000001'),
};

const makeReceipt = (overrides: Record<string, unknown> = {}) => ({
  id: RECEIPT_ID,
  tenant_id: TENANT_ID,
  payment_id: PAYMENT_ID,
  receipt_number: 'REC-202603-000001',
  template_locale: 'en',
  issued_at: new Date(),
  issued_by_user_id: USER_ID,
  render_version: '1.0',
  ...overrides,
});

describe('ReceiptsService', () => {
  let service: ReceiptsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PdfRenderingService, useValue: mockPdfRenderingService },
        { provide: SequenceService, useValue: mockSequenceService },
      ],
    }).compile();

    service = module.get<ReceiptsService>(ReceiptsService);
    jest.clearAllMocks();
  });

  describe('createForPayment', () => {
    it('should create a receipt with sequence number', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({ receipt_prefix: 'REC' });
      mockPrisma.receipt.create.mockResolvedValue(makeReceipt());

      const result = await service.createForPayment(TENANT_ID, PAYMENT_ID, USER_ID, 'en');

      expect(result.receipt_number).toBe('REC-202603-000001');
      expect(result.payment_id).toBe(PAYMENT_ID);
    });

    it('should use default prefix when branding not set', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.receipt.create.mockResolvedValue(makeReceipt());

      await service.createForPayment(TENANT_ID, PAYMENT_ID, USER_ID, 'en');

      expect(mockSequenceService.nextNumber).toHaveBeenCalledWith(
        TENANT_ID,
        'receipt',
        undefined,
        'REC',
      );
    });

    it('should accept null userId for system-generated receipts', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.receipt.create.mockResolvedValue(makeReceipt({ issued_by_user_id: null }));

      const result = await service.createForPayment(TENANT_ID, PAYMENT_ID, null, 'en');

      expect(result.issued_by_user_id).toBeNull();
    });
  });

  describe('findByPayment', () => {
    it('should return receipt for a payment', async () => {
      mockPrisma.receipt.findFirst.mockResolvedValue(makeReceipt());

      const result = await service.findByPayment(TENANT_ID, PAYMENT_ID);

      expect(result.id).toBe(RECEIPT_ID);
    });

    it('should throw NotFoundException when receipt not found', async () => {
      mockPrisma.receipt.findFirst.mockResolvedValue(null);

      await expect(service.findByPayment(TENANT_ID, 'bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('renderPdf', () => {
    it('should render a receipt PDF', async () => {
      const pdfBuffer = Buffer.from('fake-pdf');
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_reference: 'PAY-001',
        payment_method: 'cash',
        amount: '500.00',
        currency_code: 'EUR',
        received_at: new Date('2026-03-24'),
        household: { id: 'hh-1', household_name: 'Smith' },
        allocations: [
          {
            allocated_amount: '500.00',
            invoice: { id: 'inv-1', invoice_number: 'INV-001', total_amount: '1000.00' },
          },
        ],
        receipt: { receipt_number: 'REC-001' },
      });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({
        school_name_display: 'Test School',
        school_name_ar: null,
        logo_url: null,
        primary_color: null,
      });
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: TENANT_ID, name: 'Test School' });
      mockPdfRenderingService.renderPdf.mockResolvedValue(pdfBuffer);

      const result = await service.renderPdf(TENANT_ID, PAYMENT_ID, 'en');

      expect(result).toBe(pdfBuffer);
      expect(mockPdfRenderingService.renderPdf).toHaveBeenCalledWith(
        'receipt',
        'en',
        expect.objectContaining({ receipt_number: 'REC-001' }),
        expect.objectContaining({ school_name: 'Test School' }),
      );
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.renderPdf(TENANT_ID, 'bad-id', 'en')).rejects.toThrow(NotFoundException);
    });
  });
});
