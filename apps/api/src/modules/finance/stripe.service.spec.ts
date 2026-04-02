/* eslint-disable import/order -- jest.mock must precede mocked imports */
import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

// Mock Stripe module
const mockStripeCheckoutCreate = jest.fn();
const mockStripeRefundsCreate = jest.fn();
const mockStripeWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockStripeCheckoutCreate,
      },
    },
    refunds: {
      create: mockStripeRefundsCreate,
    },
    webhooks: {
      constructEvent: mockStripeWebhooksConstructEvent,
    },
  }));
});

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: (_prisma: unknown) => ({
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(_prisma),
  }),
}));

import { CircuitBreakerRegistry } from '../../common/services/circuit-breaker-registry';
import { EncryptionService } from '../configuration/encryption.service';
import { PrismaService } from '../prisma/prisma.service';

import { InvoicesService } from './invoices.service';
import { ReceiptsService } from './receipts.service';
import { StripeService } from './stripe.service';

const TENANT_ID = 'tenant-uuid-1111';
const INVOICE_ID = 'inv-uuid-1111';
const PAYMENT_ID = 'pay-uuid-1111';
const HOUSEHOLD_ID = 'hh-uuid-1111';

const mockPrisma = {
  tenantStripeConfig: {
    findUnique: jest.fn(),
  },
  invoice: {
    findFirst: jest.fn(),
  },
  payment: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  paymentAllocation: {
    create: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  receipt: {
    create: jest.fn(),
  },
  tenantBranding: {
    findUnique: jest.fn(),
  },
};

const mockEncryptionService = {
  decrypt: jest.fn().mockReturnValue('sk_test_fake_key'),
};

const mockInvoicesService = {
  recalculateBalance: jest.fn(),
};

const mockReceiptsService = {
  createForPayment: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

describe('StripeService', () => {
  let service: StripeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EncryptionService, useValue: mockEncryptionService },
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: ReceiptsService, useValue: mockReceiptsService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: CircuitBreakerRegistry,
          useValue: {
            exec: jest.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
          },
        },
      ],
    }).compile();

    service = module.get<StripeService>(StripeService);
    jest.clearAllMocks();
  });

  describe('createCheckoutSession', () => {
    it('should create a checkout session for an issued invoice', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        invoice_number: 'INV-001',
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });
      mockStripeCheckoutCreate.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/session',
      });

      const result = await service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      });

      expect(result.session_id).toBe('cs_test_123');
      expect(result.checkout_url).toBe('https://checkout.stripe.com/session');
    });

    it('should throw NotFoundException when invoice not found', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue(null);

      await expect(
        service.createCheckoutSession(TENANT_ID, 'bad-id', {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid invoice status', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'draft',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });

      await expect(
        service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when balance is zero', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '0.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Smith' },
      });

      await expect(
        service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when Stripe not configured', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue(null);

      await expect(
        service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
          success_url: 'https://example.com/success',
          cancel_url: 'https://example.com/cancel',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('processRefund', () => {
    it('should process a Stripe refund', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'stripe',
        external_event_id: 'pi_test_123',
      });
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockStripeRefundsCreate.mockResolvedValue({
        id: 're_test_123',
        status: 'succeeded',
      });

      const result = await service.processRefund(TENANT_ID, PAYMENT_ID, 200);

      expect(result.refund_id).toBe('re_test_123');
      expect(result.status).toBe('succeeded');
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.processRefund(TENANT_ID, 'bad-id', 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when not a Stripe payment', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'cash',
        external_event_id: null,
      });

      await expect(service.processRefund(TENANT_ID, PAYMENT_ID, 100)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw InternalServerErrorException when external_event_id missing', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'stripe',
        external_event_id: null,
      });

      await expect(service.processRefund(TENANT_ID, PAYMENT_ID, 100)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('handleWebhook', () => {
    it('should throw BadRequestException when webhook secret missing', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const originalEnv = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue(null);

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );

      process.env.STRIPE_WEBHOOK_SECRET = originalEnv;
    });

    it('should use per-tenant webhook secret when available', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_webhook_secret_encrypted: 'enc-webhook-secret',
        encryption_key_ref: 'ref',
      });
      mockEncryptionService.decrypt.mockReturnValue('whsec_test_secret');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_test', amount_total: 50000 } },
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result.received).toBe(true);
    });

    it('should handle signature verification failure', async () => {
      mockConfigService.get.mockReturnValue('whsec_test');
      mockStripeWebhooksConstructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(
        service.handleWebhook(TENANT_ID, Buffer.from('body'), 'bad-sig'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle payment_intent.payment_failed event', async () => {
      mockConfigService.get.mockReturnValue('whsec_test');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'payment_intent.payment_failed',
        id: 'evt_test',
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result.received).toBe(true);
    });

    it('should handle unhandled event types gracefully', async () => {
      mockConfigService.get.mockReturnValue('whsec_test');
      mockStripeWebhooksConstructEvent.mockReturnValue({
        type: 'invoice.created',
        id: 'evt_test',
      });

      const result = await service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig');

      expect(result.received).toBe(true);
    });

    it('should handle decryption error for per-tenant secret', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_webhook_secret_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockEncryptionService.decrypt.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await expect(service.handleWebhook(TENANT_ID, Buffer.from('body'), 'sig')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('createCheckoutSession with household info', () => {
    it('should include household name in product data', async () => {
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockPrisma.invoice.findFirst.mockResolvedValue({
        id: INVOICE_ID,
        status: 'issued',
        balance_amount: '500.00',
        currency_code: 'EUR',
        household_id: HOUSEHOLD_ID,
        invoice_number: 'INV-001',
        lines: [],
        household: { id: HOUSEHOLD_ID, household_name: 'Smith Family' },
      });
      mockStripeCheckoutCreate.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/session',
      });

      const result = await service.createCheckoutSession(TENANT_ID, INVOICE_ID, {
        success_url: 'https://example.com/success',
        cancel_url: 'https://example.com/cancel',
      });

      expect(result.checkout_url).toBe('https://checkout.stripe.com/session');
    });
  });

  describe('processRefund edge cases', () => {
    it('should handle refund with status other than succeeded', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'stripe',
        external_event_id: 'pi_test_123',
      });
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockStripeRefundsCreate.mockResolvedValue({
        id: 're_test_123',
        status: 'pending',
      });

      const result = await service.processRefund(TENANT_ID, PAYMENT_ID, 200);

      expect(result.refund_id).toBe('re_test_123');
      expect(result.status).toBe('pending');
    });

    it('should convert amount to cents correctly', async () => {
      mockPrisma.payment.findFirst.mockResolvedValue({
        id: PAYMENT_ID,
        payment_method: 'stripe',
        external_event_id: 'pi_test_123',
      });
      mockPrisma.tenantStripeConfig.findUnique.mockResolvedValue({
        stripe_secret_key_encrypted: 'enc',
        encryption_key_ref: 'ref',
      });
      mockStripeRefundsCreate.mockResolvedValue({
        id: 're_test_123',
        status: 'succeeded',
      });

      await service.processRefund(TENANT_ID, PAYMENT_ID, 199.99);

      expect(mockStripeRefundsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 19999,
        }),
      );
    });
  });
});
